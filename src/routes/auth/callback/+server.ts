import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';

import { constantTimeEqual } from '$lib/server/auth/crypto';
import { createSession, SESSION_COOKIE, upsertGithubUser } from '$lib/server/auth/sessions';
import { db } from '$lib/server/db';
import { dev } from '$app/environment';
import { exchangeCode, getUser, OAUTH_STATE_COOKIE } from '$lib/server/github/oauth';
import { Logger } from '$lib/server/telemetry/logger';
import type { OAuthTokenResponse } from '$lib/server/github/contracts';
import { RETURN_TO_COOKIE, ReturnToSchema } from '$lib/server/auth/return-to';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.auth.callback';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const CALLBACK_PATH = '/auth/callback';

const OAuthStateCookieSchema = v.object({
    state: v.string(),
    codeVerifier: v.string(),
});

export async function GET({ cookies, url }) {
    return await tracer.asyncSpan('sign-in-callback', async (span) => {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        span.setAttributes({
            'github.oauth.state_present': state !== null,
            'github.oauth.code_present': code !== null,
        });

        let cookiePayload: unknown = null;
        try {
            cookiePayload = JSON.parse(cookies.get(OAUTH_STATE_COOKIE) ?? 'null');
        } catch {
            // Malformed cookie payload is an invalid-state outcome, not a crash.
        }
        const stored = v.safeParse(OAuthStateCookieSchema, cookiePayload);
        cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });

        if (
            code === null ||
            state === null ||
            !stored.success ||
            !constantTimeEqual(state, stored.output.state)
        ) {
            logger.fatal('oauth callback failed state validation', void 0, {
                'github.oauth.state_valid': false,
            });
            error(400, 'Sign-in failed: invalid OAuth state.');
        }
        span.setAttribute('github.oauth.state_valid', true);

        const redirectUri = new URL(CALLBACK_PATH, url.origin).toString();
        let tokenResponse: OAuthTokenResponse;
        try {
            tokenResponse = await exchangeCode(code, stored.output.codeVerifier, redirectUri);
        } catch (exchangeError) {
            const cause =
                exchangeError instanceof Error ? exchangeError : new Error(String(exchangeError));
            logger.fatal('github oauth code exchange failed', cause);
            error(502, 'Sign-in failed: GitHub rejected the authorization.');
        }

        const githubUser = await getUser(tokenResponse.access_token);
        const user = await upsertGithubUser(db, githubUser, tokenResponse);
        const session = await createSession(db, user.id);

        cookies.set(SESSION_COOKIE, `${session.id}.${session.secret}`, {
            path: '/',
            httpOnly: true,
            secure: !dev,
            sameSite: 'lax',
            expires: session.expiresAt,
        });

        logger.info('user signed in', { 'user.id': user.id });

        const returnTo = cookies.get(RETURN_TO_COOKIE);
        cookies.delete(RETURN_TO_COOKIE, { path: '/' });
        const parsedReturnTo = v.safeParse(ReturnToSchema, returnTo ?? '');

        redirect(303, parsedReturnTo.success ? parsedReturnTo.output : '/');
    });
}
