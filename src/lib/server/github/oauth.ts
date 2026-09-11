import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

import { building } from '$app/env';
import { env } from '$env/dynamic/private';

import { githubApi, oauthBase, oauthRequest } from './client';
import { GithubUserSchema, OAuthTokenResponseSchema } from './contracts';

function initCredentials() {
    const clientId = env.GITHUB_APP_CLIENT_ID;
    const clientSecret = env.GITHUB_APP_CLIENT_SECRET;
    if (!building) {
        assert(
            typeof clientId === 'string' && clientId.length > 0,
            'GITHUB_APP_CLIENT_ID must be set.',
        );
        assert(
            typeof clientSecret === 'string' && clientSecret.length > 0,
            'GITHUB_APP_CLIENT_SECRET must be set.',
        );
    }
    return { clientId: clientId ?? '', clientSecret: clientSecret ?? '' };
}

const { clientId, clientSecret } = initCredentials();

export const OAUTH_STATE_COOKIE = 'github_oauth_state';

export function createState() {
    return randomBytes(32).toString('base64url');
}

export function createPkcePair() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
    return { verifier, challenge };
}

export function authorizationUrl(redirectUri: string, state: string, codeChallenge: string) {
    const url = new URL('/login/oauth/authorize', oauthBase);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
}

export function exchangeCode(code: string, codeVerifier: string, redirectUri: string) {
    return oauthRequest('/login/oauth/access_token', OAuthTokenResponseSchema, {
        method: 'POST',
        body: {
            client_id: clientId,
            client_secret: clientSecret,
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
        },
    });
}

export function refreshAccessToken(refreshToken: string) {
    return oauthRequest('/login/oauth/access_token', OAuthTokenResponseSchema, {
        method: 'POST',
        body: {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        },
    });
}

export function getUser(token: string) {
    return githubApi('/user', GithubUserSchema, { token });
}
