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
 * application flow, `GET /user`, organization memberships, repository
 * lookup, template-generated repository creation, git refs, and
 * collaborator invitations. Tests never reach the real GitHub API; this
 * server is the boundary instead.
 */
export class FakeGithub {
    #users = new Map<string, FakeUser>();
    #memberships = new Map<string, { status: number; body: unknown }>();
    #codes = new Map<string, { token: string }>();
    #refreshTokens = new Map<string, { token: string }>();
    #server: Server | null = null;
    #repos = new Map<string, { status: number; body: unknown }>();
    #templates = new Map<string, { status: number; body: unknown }>();
    #branchHeads = new Map<string, { status: number; body: unknown }>();
    #commits = new Map<string, { status: number; body: unknown }>();
    #branchCreations = new Map<string, { status: number; body: unknown }>();
    #collaborators = new Map<string, { status: number; body: unknown }>();
    #collaboratorPermissions = new Map<string, string>();
    #installations = new Map<string, { status: number; body: unknown }>();
    #installationTokens = new Map<string, { status: number; body: unknown }>();
    #pullRequests = new Map<string, { status: number; body: unknown }>();
    #createdPullRequests = new Map<string, unknown>();
    #nextAuthorizeToken: string | null = null;
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

    registerRepo({ token, org, repo }: { token: string; org: string; repo: string }) {
        this.#repos.set(`${token}\n${org}\n${repo}`, {
            status: 200,
            body: { name: repo },
        });
    }

    registerRepoError({
        token,
        org,
        repo,
        status,
    }: {
        token: string;
        org: string;
        repo: string;
        status: number;
    }) {
        this.#repos.set(`${token}\n${org}\n${repo}`, {
            status,
            body: { message: 'fake repository lookup failure', status: String(status) },
        });
    }

    registerTemplate({
        token,
        org,
        template,
        repoName,
        defaultBranch = 'main',
    }: {
        token: string;
        org: string;
        template: string;
        repoName: string;
        defaultBranch?: string;
    }) {
        this.#templates.set(`${token}\n${org}\n${template}`, {
            status: 201,
            body: { name: repoName, default_branch: defaultBranch },
        });
    }

    registerTemplateError({
        token,
        org,
        template,
        status,
    }: {
        token: string;
        org: string;
        template: string;
        status: number;
    }) {
        this.#templates.set(`${token}\n${org}\n${template}`, {
            status,
            body: { message: 'fake template generation failure', status: String(status) },
        });
    }

    registerBranchHead({
        token,
        owner,
        repo,
        branch,
        sha,
    }: {
        token: string;
        owner: string;
        repo: string;
        branch: string;
        sha: string;
    }) {
        this.#branchHeads.set(`${token}\n${owner}\n${repo}\n${branch}`, {
            status: 200,
            body: { ref: `refs/heads/${branch}`, object: { sha } },
        });
        this.#commits.set(`${token}\n${owner}\n${repo}\n${sha}`, {
            status: 200,
            body: { sha, message: 'Template commit', tree: { sha: `tree-${sha}` } },
        });
    }

    registerBranchHeadError({
        token,
        owner,
        repo,
        branch,
        status,
    }: {
        token: string;
        owner: string;
        repo: string;
        branch: string;
        status: number;
    }) {
        this.#branchHeads.set(`${token}\n${owner}\n${repo}\n${branch}`, {
            status,
            body: { message: 'fake branch head failure', status: String(status) },
        });
    }

    registerBranch({
        token,
        owner,
        repo,
        branch,
        sha,
    }: {
        token: string;
        owner: string;
        repo: string;
        branch: string;
        sha: string;
    }) {
        this.#branchCreations.set(`${token}\n${owner}\n${repo}\n${branch}`, {
            status: 201,
            body: { ref: `refs/heads/${branch}`, object: { sha } },
        });
    }

    registerBranchError({
        token,
        owner,
        repo,
        branch,
        status,
    }: {
        token: string;
        owner: string;
        repo: string;
        branch: string;
        status: number;
    }) {
        this.#branchCreations.set(`${token}\n${owner}\n${repo}\n${branch}`, {
            status,
            body: { message: 'fake branch creation failure', status: String(status) },
        });
    }

    registerCollaborator({
        token,
        owner,
        repo,
        username,
        permission,
    }: {
        token: string;
        owner: string;
        repo: string;
        username: string;
        permission?: string;
    }) {
        this.#collaborators.set(`${token}\n${owner}\n${repo}\n${username}`, {
            // The real GitHub API answers `201`/`204` with an empty body.
            status: 201,
            body: {},
        });
        this.#collaboratorPermissions.set(
            `${token}\n${owner}\n${repo}\n${username}`,
            typeof permission === 'string' ? permission : 'push',
        );
    }

    registerCollaboratorError({
        token,
        owner,
        repo,
        username,
        status,
    }: {
        token: string;
        owner: string;
        repo: string;
        username: string;
        status: number;
    }) {
        this.#collaborators.set(`${token}\n${owner}\n${repo}\n${username}`, {
            status,
            body: { message: 'fake collaborator failure', status: String(status) },
        });
    }

    registerInstallation({ org, installationId }: { org: string; installationId: number }) {
        this.#installations.set(org, { status: 200, body: { id: installationId } });
        this.#installationTokens.set(String(installationId), {
            status: 201,
            body: {
                token: `installation-token-${installationId}`,
                expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            },
        });
    }

    registerInstallationError({ org, status }: { org: string; status: number }) {
        this.#installations.set(org, {
            status,
            body: { message: 'fake installation failure', status: String(status) },
        });
    }

    registerPullRequest({
        token,
        owner,
        repo,
        head = 'main',
        base = 'feedback',
    }: {
        token: string;
        owner: string;
        repo: string;
        head?: string;
        base?: string;
    }) {
        this.#pullRequests.set(`${token}\n${owner}\n${repo}`, {
            status: 201,
            body: {
                number: 1,
                html_url: `https://github.com/${owner}/${repo}/pull/1`,
                head: { ref: head },
                base: { ref: base },
            },
        });
    }

    registerPullRequestError({
        token,
        owner,
        repo,
        status,
    }: {
        token: string;
        owner: string;
        repo: string;
        status: number;
    }) {
        this.#pullRequests.set(`${token}\n${owner}\n${repo}`, {
            status,
            body: { message: 'fake pull request failure', status: String(status) },
        });
    }

    /** Makes the next OAuth authorize round-trip sign in as the given token's user (one-shot). */
    authorizeAs({ token }: { token: string }) {
        this.#nextAuthorizeToken = token;
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
        this.#repos.clear();
        this.#templates.clear();
        this.#branchHeads.clear();
        this.#branchCreations.clear();
        this.#collaborators.clear();
        this.#collaboratorPermissions.clear();
        this.#installations.clear();
        this.#installationTokens.clear();
        this.#pullRequests.clear();
        this.#createdPullRequests.clear();
        this.#nextAuthorizeToken = null;
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

        const orgRepo = url.pathname.match(/^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)$/u);
        if (orgRepo !== null && request.method === 'GET')
            return this.#orgRepo(
                token,
                decodeURIComponent(orgRepo.groups?.owner ?? ''),
                decodeURIComponent(orgRepo.groups?.repo ?? ''),
                response,
            );

        const generated = url.pathname.match(
            /^\/repos\/(?<owner>[^/]+)\/(?<template>[^/]+)\/generate$/u,
        );
        if (generated !== null && request.method === 'POST')
            return this.#generate(
                token,
                decodeURIComponent(generated.groups?.owner ?? ''),
                decodeURIComponent(generated.groups?.template ?? ''),
                response,
                body,
            );

        const branchHead = url.pathname.match(
            /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/git\/ref\/heads\/(?<branch>[^/]+)$/u,
        );
        if (branchHead !== null && request.method === 'GET')
            return this.#branchHead(
                token,
                decodeURIComponent(branchHead.groups?.owner ?? ''),
                decodeURIComponent(branchHead.groups?.repo ?? ''),
                decodeURIComponent(branchHead.groups?.branch ?? ''),
                response,
            );

        const branchRefs = url.pathname.match(
            /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/git\/refs$/u,
        );
        if (branchRefs !== null && request.method === 'POST')
            return this.#branchCreate(
                token,
                decodeURIComponent(branchRefs.groups?.owner ?? ''),
                decodeURIComponent(branchRefs.groups?.repo ?? ''),
                response,
                body,
            );

        const collaborator = url.pathname.match(
            /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/collaborators\/(?<username>[^/]+)$/u,
        );
        if (collaborator !== null && request.method === 'PUT')
            return this.#collaborator(
                token,
                decodeURIComponent(collaborator.groups?.owner ?? ''),
                decodeURIComponent(collaborator.groups?.repo ?? ''),
                decodeURIComponent(collaborator.groups?.username ?? ''),
                response,
                body,
            );

        const commit = url.pathname.match(
            /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/git\/commits\/(?<sha>[^/]+)$/u,
        );
        if (commit !== null && request.method === 'GET')
            return this.#commit(
                token,
                decodeURIComponent(commit.groups?.owner ?? ''),
                decodeURIComponent(commit.groups?.repo ?? ''),
                decodeURIComponent(commit.groups?.sha ?? ''),
                response,
            );

        const commits = url.pathname.match(
            /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/git\/commits$/u,
        );
        if (commits !== null && request.method === 'POST')
            return this.#createCommit(
                token,
                decodeURIComponent(commits.groups?.owner ?? ''),
                decodeURIComponent(commits.groups?.repo ?? ''),
                response,
                body,
            );

        const refUpdate = url.pathname.match(
            /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/git\/refs\/heads\/(?<branch>[^/]+)$/u,
        );
        if (refUpdate !== null && request.method === 'PATCH')
            return this.#updateBranch(
                token,
                decodeURIComponent(refUpdate.groups?.owner ?? ''),
                decodeURIComponent(refUpdate.groups?.repo ?? ''),
                decodeURIComponent(refUpdate.groups?.branch ?? ''),
                response,
                body,
            );

        const pullRequest = url.pathname.match(
            /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pulls$/u,
        );
        if (pullRequest !== null && request.method === 'GET')
            return this.#listPullRequests(
                token,
                decodeURIComponent(pullRequest.groups?.owner ?? ''),
                decodeURIComponent(pullRequest.groups?.repo ?? ''),
                url.searchParams.get('head'),
                url.searchParams.get('base'),
                response,
            );
        if (pullRequest !== null && request.method === 'POST')
            return this.#pullRequest(
                token,
                decodeURIComponent(pullRequest.groups?.owner ?? ''),
                decodeURIComponent(pullRequest.groups?.repo ?? ''),
                response,
                body,
            );

        const installation = url.pathname.match(/^\/orgs\/(?<org>[^/]+)\/installation$/u);
        if (installation !== null && request.method === 'GET')
            return this.#installation(decodeURIComponent(installation.groups?.org ?? ''), response);

        const installationToken = url.pathname.match(
            /^\/app\/installations\/(?<id>\d+)\/access_tokens$/u,
        );
        if (installationToken !== null && request.method === 'POST')
            return this.#installationToken(installationToken.groups?.id ?? '', response);

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
            authorizeAs: (args) => this.authorizeAs(args as { token: string }),
            issueRefreshToken: (args) =>
                this.issueRefreshToken(args as { token: string; value?: string }),
            reset: () => this.reset(),
            registerRepo: (args) =>
                this.registerRepo(args as { token: string; org: string; repo: string }),
            registerRepoError: (args) =>
                this.registerRepoError(
                    args as { token: string; org: string; repo: string; status: number },
                ),
            registerTemplate: (args) =>
                this.registerTemplate(
                    args as {
                        token: string;
                        org: string;
                        template: string;
                        repoName: string;
                        defaultBranch?: string;
                    },
                ),
            registerTemplateError: (args) =>
                this.registerTemplateError(
                    args as { token: string; org: string; template: string; status: number },
                ),
            registerBranchHead: (args) =>
                this.registerBranchHead(
                    args as {
                        token: string;
                        owner: string;
                        repo: string;
                        branch: string;
                        sha: string;
                    },
                ),
            registerBranchHeadError: (args) =>
                this.registerBranchHeadError(
                    args as {
                        token: string;
                        owner: string;
                        repo: string;
                        branch: string;
                        status: number;
                    },
                ),
            registerBranch: (args) =>
                this.registerBranch(
                    args as {
                        token: string;
                        owner: string;
                        repo: string;
                        branch: string;
                        sha: string;
                    },
                ),
            registerBranchError: (args) =>
                this.registerBranchError(
                    args as {
                        token: string;
                        owner: string;
                        repo: string;
                        branch: string;
                        status: number;
                    },
                ),
            registerCollaborator: (args) =>
                this.registerCollaborator(
                    args as {
                        token: string;
                        owner: string;
                        repo: string;
                        username: string;
                        permission?: string;
                    },
                ),
            registerCollaboratorError: (args) =>
                this.registerCollaboratorError(
                    args as {
                        token: string;
                        owner: string;
                        repo: string;
                        username: string;
                        status: number;
                    },
                ),
            registerInstallation: (args) =>
                this.registerInstallation(args as { org: string; installationId: number }),
            registerInstallationError: (args) =>
                this.registerInstallationError(args as { org: string; status: number }),
            registerPullRequest: (args) =>
                this.registerPullRequest(
                    args as { token: string; owner: string; repo: string; title?: string },
                ),
            registerPullRequestError: (args) =>
                this.registerPullRequestError(
                    args as {
                        token: string;
                        owner: string;
                        repo: string;
                        title?: string;
                        status: number;
                    },
                ),
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

        const grantToken = this.#nextAuthorizeToken ?? this.defaultToken;
        this.#nextAuthorizeToken = null;
        const code = this.issueAuthorizationCode({ token: grantToken });
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

    #orgRepo(token: string | null, owner: string, repo: string, response: ServerResponse) {
        const fixture = this.#repos.get(`${token}\n${owner}\n${repo}`);
        if (typeof fixture === 'undefined')
            return respond(response, 404, { message: 'Not Found', status: '404' });
        respond(response, fixture.status, fixture.body);
    }

    #generate(
        token: string | null,
        org: string,
        template: string,
        response: ServerResponse,
        body: FixtureBody,
    ) {
        const fixture = this.#templates.get(`${token}\n${org}\n${template}`);
        if (typeof fixture === 'undefined')
            return respond(response, 404, { message: 'Not Found', status: '404' });
        if (fixture.status >= 200 && fixture.status < 300) {
            const expected = fixture.body as { name?: unknown };
            if (body.owner !== org || body.private !== true)
                return respond(response, 400, {
                    message: 'fake generate: expected owner and private: true',
                    status: '400',
                });
            // A mismatched `name` is how GitHub reports an existing repo.
            if (body.name !== expected.name)
                return respond(response, 422, {
                    message: 'fake generate: repository name already exists',
                    status: '422',
                });
        }
        respond(response, fixture.status, fixture.body);
    }

    #branchHead(
        token: string | null,
        owner: string,
        repo: string,
        branch: string,
        response: ServerResponse,
    ) {
        const fixture = this.#branchHeads.get(`${token}\n${owner}\n${repo}\n${branch}`);
        if (typeof fixture === 'undefined')
            return respond(response, 404, { message: 'Not Found', status: '404' });
        respond(response, fixture.status, fixture.body);
    }

    #branchCreate(
        token: string | null,
        owner: string,
        repo: string,
        response: ServerResponse,
        body: FixtureBody,
    ) {
        const fixtureRef = typeof body.ref === 'string' ? body.ref : '';
        const branch = fixtureRef.replace(/^refs\/heads\//u, '');
        const fixture = this.#branchCreations.get(`${token}\n${owner}\n${repo}\n${branch}`);
        if (typeof fixture === 'undefined')
            return respond(response, 404, { message: 'Not Found', status: '404' });
        respond(response, fixture.status, fixture.body);
    }

    #collaborator(
        token: string | null,
        owner: string,
        repo: string,
        username: string,
        response: ServerResponse,
        body: FixtureBody,
    ) {
        const fixture = this.#collaborators.get(`${token}\n${owner}\n${repo}\n${username}`);
        if (typeof fixture === 'undefined')
            return respond(response, 404, { message: 'Not Found', status: '404' });
        if (fixture.status >= 200 && fixture.status < 300) {
            const expected =
                this.#collaboratorPermissions.get(`${token}\n${owner}\n${repo}\n${username}`) ??
                'push';
            if (body.permission !== expected)
                return respond(response, 422, {
                    message: 'fake collaborator: permission mismatch',
                    status: '422',
                });
        }
        respond(response, fixture.status, fixture.body);
    }

    #pullRequest(
        token: string | null,
        owner: string,
        repo: string,
        response: ServerResponse,
        body: FixtureBody,
    ) {
        const fixture = this.#pullRequests.get(`${token}\n${owner}\n${repo}`);
        if (typeof fixture === 'undefined')
            return respond(response, 404, { message: 'Not Found', status: '404' });
        if (fixture.status >= 200 && fixture.status < 300) {
            const expected = fixture.body as { head?: { ref?: unknown }; base?: { ref?: unknown } };
            if (body.head !== expected.head?.ref || body.base !== expected.base?.ref)
                return respond(response, 422, {
                    message: 'fake pull request: head/base mismatch',
                    status: '422',
                });
            this.#createdPullRequests.set(`${token}\n${owner}\n${repo}`, fixture.body);
        }
        respond(response, fixture.status, fixture.body);
    }

    #listPullRequests(
        token: string | null,
        owner: string,
        repo: string,
        head: string | null,
        base: string | null,
        response: ServerResponse,
    ) {
        const created = this.#createdPullRequests.get(`${token}\n${owner}\n${repo}`);
        if (typeof created === 'undefined') return respond(response, 200, []);
        const pullRequest = created as { head?: { ref?: unknown }; base?: { ref?: unknown } };
        const matches =
            (head === null || head === `${owner}:${String(pullRequest.head?.ref)}`) &&
            (base === null || base === String(pullRequest.base?.ref));
        respond(response, 200, matches ? [created] : []);
    }

    #commit(
        token: string | null,
        owner: string,
        repo: string,
        sha: string,
        response: ServerResponse,
    ) {
        const fixture = this.#commits.get(`${token}\n${owner}\n${repo}\n${sha}`);
        if (typeof fixture === 'undefined')
            return respond(response, 404, { message: 'Not Found', status: '404' });
        respond(response, fixture.status, fixture.body);
    }

    #createCommit(
        token: string | null,
        owner: string,
        repo: string,
        response: ServerResponse,
        body: FixtureBody,
    ) {
        const parent =
            Array.isArray(body.parents) && typeof body.parents[0] === 'string'
                ? body.parents[0]
                : 'unknown-parent';
        const sha = `${parent}-feedback-setup`;
        const tree = typeof body.tree === 'string' ? body.tree : `tree-${parent}`;
        const commit = {
            sha,
            message: typeof body.message === 'string' ? body.message : '',
            tree: { sha: tree },
        };
        this.#commits.set(`${token}\n${owner}\n${repo}\n${sha}`, { status: 201, body: commit });
        respond(response, 201, commit);
    }

    #updateBranch(
        token: string | null,
        owner: string,
        repo: string,
        branch: string,
        response: ServerResponse,
        body: FixtureBody,
    ) {
        const sha = typeof body.sha === 'string' ? body.sha : '';
        this.#branchHeads.set(`${token}\n${owner}\n${repo}\n${branch}`, {
            status: 200,
            body: { ref: `refs/heads/${branch}`, object: { sha } },
        });
        respond(response, 200, { ref: `refs/heads/${branch}`, object: { sha } });
    }

    #installation(org: string, response: ServerResponse) {
        const fixture = this.#installations.get(org);
        if (typeof fixture === 'undefined')
            return respond(response, 404, {
                message: 'Not Found',
                status: '404',
                documentation_url: 'https://docs.github.com/rest',
            });
        respond(response, fixture.status, fixture.body);
    }

    #installationToken(id: string, response: ServerResponse) {
        const fixture = this.#installationTokens.get(id);
        if (typeof fixture === 'undefined')
            return respond(response, 404, { message: 'Not Found', status: '404' });
        respond(response, fixture.status, fixture.body);
    }
}
