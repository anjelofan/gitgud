import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import type { GithubUser as FakeUser } from '$lib/server/github/contracts';
import type { OrgMembership as FakeMembership } from '$lib/server/auth/contracts';

import { resolveFakeGitHubPort } from './port.ts';

type FixtureBody = Record<string, unknown>;

const DEFAULT_USER: FakeUser = {
    id: 1,
    login: 'octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
};
const ACCESS_TTL_SECONDS = 28800;
const REFRESH_TTL_SECONDS = 15897600;

function tokenPairFor(token: string) {
    return {
        access_token: token,
        expires_in: ACCESS_TTL_SECONDS,
        refresh_token: `refresh-${token}-${randomUUID()}`,
        refresh_token_expires_in: REFRESH_TTL_SECONDS,
        token_type: 'bearer',
        scope: '',
    };
}

function respond(response: ServerResponse, status: number, payload: unknown) {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
}

function bearerToken(request: IncomingMessage) {
    const header = request.headers.authorization ?? '';
    return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

/**
 * In-memory fake of the GitHub surface this app uses: the OAuth web
 * application flow, `GET /user`, and organization memberships. Tests never
 * reach the real GitHub API; this server is the boundary instead.
 */
export class FakeGithub {
    #users = new Map<string, FakeUser>();
    #memberships = new Map<string, { status: number; body: unknown }>();
    #codes = new Map<string, { token: string }>();
    #refreshTokens = new Map<string, { token: string }>();
    #server: Server | null = null;
    defaultToken = 'fake-default-access-token';

    registerUser({ token, user = DEFAULT_USER }: { token: string; user?: FakeUser }) {
        this.#users.set(token, user);
    }

    registerMembership({
        token,
        org,
        state,
        role,
    }: { token: string; org: string } & FakeMembership) {
        this.#memberships.set(`${token}\n${org}`, { status: 200, body: { state, role } });
    }

    registerMembershipError({
        token,
        org,
        status,
    }: {
        token: string;
        org: string;
        status: number;
    }) {
        this.#memberships.set(`${token}\n${org}`, {
            status,
            body: { message: 'fake membership failure', status: String(status) },
        });
    }

    /** Issues an authorization code that exchanges into the given token. */
    issueAuthorizationCode({ token, value }: { token: string; value?: string }) {
        const code = value ?? `code-${randomUUID()}`;
        this.#codes.set(code, { token });
        return code;
    }

    /** Issues a refresh token that refreshes into the given token. */
    issueRefreshToken({ token, value }: { token: string; value?: string }) {
        const refreshToken = value ?? `refresh-${randomUUID()}`;
        this.#refreshTokens.set(refreshToken, { token });
        return refreshToken;
    }

    reset() {
        this.#users.clear();
        this.#memberships.clear();
        this.#codes.clear();
        this.#refreshTokens.clear();
    }

    async listen(port = resolveFakeGitHubPort()) {
        const server = createServer((request, response) => this.#handle(request, response));
        this.#server = server;
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '127.0.0.1', resolve);
        });
        return port;
    }

    async close() {
        const server = this.#server;
        if (server === null) return;
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
        this.#server = null;
    }

    #handle(request: IncomingMessage, response: ServerResponse) {
        // eslint-disable-next-line no-console
        console.log(`[fake-github] ${request.method} ${request.url}`);
        const chunks: Buffer[] = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('end', () => {
            let body: FixtureBody = {};
            if (chunks.length > 0)
                try {
                    body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as FixtureBody;
                } catch {
                    body = {};
                }

            this.#route(request, response, body);
        });
    }

    #route(request: IncomingMessage, response: ServerResponse, body: FixtureBody) {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const token = bearerToken(request);

        if (url.pathname === '/__fake/github' && request.method === 'POST')
            return this.#control(body, response);
        if (url.pathname === '/login/oauth/authorize' && request.method === 'GET')
            return this.#authorize(url, response);
        if (url.pathname === '/login/oauth/access_token' && request.method === 'POST')
            return this.#accessToken(body, response);
        if (url.pathname === '/user' && request.method === 'GET')
            return this.#getUser(token, response);
        if (url.pathname.startsWith('/user/memberships/orgs/') && request.method === 'GET')
            return this.#membership(token, url.pathname, response);

        respond(response, 404, { message: 'Not Found' });
    }

    /** Test-control endpoint: seeds fixtures over HTTP (tests cannot reach this process in memory). */
    #control(body: FixtureBody, response: ServerResponse) {
        const { op, ...args } = body;
        const ops: Record<string, (args: FixtureBody) => unknown> = {
            registerUser: (args) => this.registerUser(args as { token: string; user?: FakeUser }),
            registerMembership: (args) =>
                this.registerMembership(args as { token: string; org: string } & FakeMembership),
            registerMembershipError: (args) =>
                this.registerMembershipError(
                    args as { token: string; org: string; status: number },
                ),
            issueAuthorizationCode: (args) =>
                this.issueAuthorizationCode(args as { token: string; value?: string }),
            issueRefreshToken: (args) =>
                this.issueRefreshToken(args as { token: string; value?: string }),
            reset: () => this.reset(),
        };
        if (typeof op !== 'string') return respond(response, 400, { message: 'Missing fake op.' });
        const run = ops[op];
        if (typeof run === 'undefined')
            return respond(response, 400, { message: `Unknown fake op: ${op}` });
        return respond(response, 200, { result: run(args) ?? null });
    }

    #authorize(url: URL, response: ServerResponse) {
        const redirectUri = url.searchParams.get('redirect_uri');
        const state = url.searchParams.get('state');
        if (redirectUri === null) return respond(response, 400, { error: 'missing redirect_uri' });

        const code = this.issueAuthorizationCode({ token: this.defaultToken });
        const target = new URL(redirectUri);
        target.searchParams.set('code', code);
        if (state !== null) target.searchParams.set('state', state);
        response.writeHead(302, { Location: target.toString() });
        response.end();
    }

    #accessToken(body: FixtureBody, response: ServerResponse) {
        if (body.grant_type === 'refresh_token') {
            const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
            const grant = this.#refreshTokens.get(refreshToken);
            if (typeof grant === 'undefined')
                return respond(response, 400, { error: 'bad_refresh_token' });
            const pair = tokenPairFor(grant.token);
            this.#refreshTokens.delete(refreshToken);
            this.#refreshTokens.set(pair.refresh_token, grant);
            return respond(response, 200, pair);
        }

        const code = typeof body.code === 'string' ? body.code : '';
        const grant = this.#codes.get(code);
        if (typeof grant === 'undefined')
            return respond(response, 400, { error: 'bad_verification_code' });
        this.#codes.delete(code);
        return respond(response, 200, tokenPairFor(grant.token));
    }

    #getUser(token: string | null, response: ServerResponse) {
        if (token === null) return respond(response, 401, { message: 'Bad credentials' });
        const user = this.#users.get(token);
        if (typeof user === 'undefined')
            return respond(response, 401, { message: 'Bad credentials' });
        respond(response, 200, user);
    }

    #membership(token: string | null, pathname: string, response: ServerResponse) {
        const org = decodeURIComponent(pathname.replace('/user/memberships/orgs/', ''));
        const membership = this.#memberships.get(`${token}\n${org}`);
        if (typeof membership === 'undefined')
            return respond(response, 404, {
                message: 'Not Found',
                status: '404',
            });
        respond(response, membership.status, membership.body);
    }
}
