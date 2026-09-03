import { redirect } from '@sveltejs/kit';

import {
    authorizationUrl,
    createPkcePair,
    createState,
    OAUTH_STATE_COOKIE,
} from '$lib/server/github/oauth';
import { dev } from '$app/environment';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.auth.sign-in';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const CALLBACK_PATH = '/auth/callback';
const STATE_COOKIE_MAX_AGE_SECONDS = 600;

export function GET({ cookies, url }) {
    return tracer.span('sign-in-redirect', (span) => {
        const { verifier, challenge } = createPkcePair();
        const state = createState();
        const redirectUri = new URL(CALLBACK_PATH, url.origin).toString();
        span.setAttribute('github.oauth.redirect_uri', redirectUri);

        cookies.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, codeVerifier: verifier }), {
            path: '/',
            httpOnly: true,
            secure: !dev,
            sameSite: 'lax',
            maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
        });

        logger.debug('redirecting to github authorization', {
            'github.oauth.redirect_uri': redirectUri,
        });

        redirect(302, authorizationUrl(redirectUri, state, challenge));
    });
}
