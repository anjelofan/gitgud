import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { fakeGithub, fakeGithubValue } from '$tests/fake-github/client';

import { authorizationUrl, createPkcePair, exchangeCode, refreshAccessToken } from './oauth';

const TOKEN = 'oauth-access-token';
const REDIRECT_URI = 'http://localhost:5173/auth/callback';

beforeAll(async () => {
    await fakeGithub('registerUser', { token: TOKEN });
});

describe('createPkcePair', () => {
    it('derives the challenge as base64url(sha256(verifier))', () => {
        const { verifier, challenge } = createPkcePair();
        const expected = createHash('sha256').update(verifier, 'ascii').digest('base64url');
        expect(challenge).toBe(expected);
    });
});

describe('authorizationUrl', () => {
    it('carries the app identity, redirect, state, and PKCE challenge', () => {
        const url = new URL(authorizationUrl(REDIRECT_URI, 'state-1', 'challenge-1'));
        expect(url.pathname).toBe('/login/oauth/authorize');
        expect(url.searchParams.get('client_id')).toBe('test-client-id');
        expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
        expect(url.searchParams.get('state')).toBe('state-1');
        expect(url.searchParams.get('code_challenge')).toBe('challenge-1');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
});

describe('exchangeCode', () => {
    it('exchanges a valid code for its token pair', async () => {
        const code = await fakeGithubValue('issueAuthorizationCode', { token: TOKEN });
        const tokens = await exchangeCode(code, 'verifier-1', REDIRECT_URI);
        expect(tokens.access_token).toBe(TOKEN);
        expect(tokens.token_type).toBe('bearer');
        expect(tokens.expires_in).toBeGreaterThan(0);
        expect(tokens.refresh_token.length).toBeGreaterThan(0);
    });

    it('rejects an unknown code', async () => {
        await expect(exchangeCode('code-unknown', 'verifier-1', REDIRECT_URI)).rejects.toThrow(
            /400/u,
        );
    });
});

describe('refreshAccessToken', () => {
    it('rotates into a fresh access token', async () => {
        const refreshToken = await fakeGithubValue('issueRefreshToken', { token: TOKEN });
        const tokens = await refreshAccessToken(refreshToken);
        expect(tokens.access_token).toBe(TOKEN);
        expect(tokens.refresh_token.length).toBeGreaterThan(0);
    });

    it('rejects an unknown refresh token', async () => {
        await expect(refreshAccessToken('refresh-unknown')).rejects.toThrow(/400/u);
    });
});
