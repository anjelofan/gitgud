import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { fakeGithubValue } from '$tests/fake-github/client';
import type { OAuthTokenResponse } from '$lib/server/github/contracts';
import { users } from '$lib/server/db/schema';

import {
    createSession,
    destroySession,
    getUserAccessToken,
    upsertGithubUser,
    validateSession,
} from './sessions';
import { encryptToken } from './crypto';

const TOKEN_RESPONSE = {
    access_token: 'session-access-token',
    expires_in: 28800,
    refresh_token: 'session-refresh-token',
    refresh_token_expires_in: 15897600,
    token_type: 'bearer',
    scope: '',
} satisfies OAuthTokenResponse;

const GITHUB_USER = { id: 101, login: 'sessions-user', avatar_url: null };

beforeEach(async () => {
    await db.execute(sql`TRUNCATE users CASCADE`);
});

describe('upsertGithubUser', () => {
    it('creates the user and stores an encrypted token pair', async () => {
        const user = await upsertGithubUser(db, GITHUB_USER, TOKEN_RESPONSE);
        expect(user.githubId).toBe(101);
        expect(user.login).toBe('sessions-user');
    });

    it('updates the existing user instead of duplicating it', async () => {
        await upsertGithubUser(db, GITHUB_USER, TOKEN_RESPONSE);
        const renamed = { ...GITHUB_USER, login: 'renamed-user' };
        const user = await upsertGithubUser(db, renamed, TOKEN_RESPONSE);

        expect(user.login).toBe('renamed-user');
        const rows = await db.select().from(users);
        expect(rows).toHaveLength(1);
    });
});

describe('createSession/validateSession', () => {
    it('round-trips a valid session cookie', async () => {
        const user = await upsertGithubUser(db, GITHUB_USER, TOKEN_RESPONSE);
        const session = await createSession(db, user.id);

        const validated = await validateSession(db, `${session.id}.${session.secret}`);
        expect(validated?.id).toBe(session.id);
        expect(validated?.user.login).toBe('sessions-user');
    });

    it('rejects a cookie whose secret does not match', async () => {
        const user = await upsertGithubUser(db, GITHUB_USER, TOKEN_RESPONSE);
        const session = await createSession(db, user.id);

        expect(await validateSession(db, `${session.id}.wrong-secret-value`)).toBeNull();
    });

    it('rejects a malformed cookie', async () => {
        expect(await validateSession(db, 'no-dot-here')).toBeNull();
    });
});

describe('destroySession', () => {
    it('invalidates the session', async () => {
        const user = await upsertGithubUser(db, GITHUB_USER, TOKEN_RESPONSE);
        const session = await createSession(db, user.id);
        await destroySession(db, session.id);

        expect(await validateSession(db, `${session.id}.${session.secret}`)).toBeNull();
    });
});

describe('getUserAccessToken', () => {
    it('returns null when no tokens are stored', async () => {
        // A user without a token row: upsertGithubUser always stores tokens.
        const [user] = await db
            .insert(users)
            .values({ githubId: 999, login: 'tokenless-user' })
            .returning();
        expect(await getUserAccessToken(db, user.id)).toBeNull();
    });

    it('returns the stored access token while it is fresh', async () => {
        const user = await upsertGithubUser(db, GITHUB_USER, TOKEN_RESPONSE);
        expect(await getUserAccessToken(db, user.id)).toBe('session-access-token');
    });

    it('refreshes through GitHub when the access token expired', async () => {
        const user = await upsertGithubUser(db, GITHUB_USER, TOKEN_RESPONSE);
        const refreshToken = await fakeGithubValue('issueRefreshToken', {
            token: TOKEN_RESPONSE.access_token,
            value: 'session-refresh-token',
        });
        const past = new Date(Date.now() - 1000);
        const future = new Date(Date.now() + 1000 * 60 * 60);
        await db.execute(sql`
            UPDATE github_tokens
            SET access_expires_at = ${past}, refresh_expires_at = ${future},
                refresh_token_enc = ${encryptToken(refreshToken)}
            WHERE user_id = ${user.id}
        `);

        expect(await getUserAccessToken(db, user.id)).toBe('session-access-token');
    });

    it('returns null when both tokens expired', async () => {
        const user = await upsertGithubUser(db, GITHUB_USER, TOKEN_RESPONSE);
        const past = new Date(Date.now() - 1000);
        await db.execute(sql`
            UPDATE github_tokens
            SET access_expires_at = ${past}, refresh_expires_at = ${past}
            WHERE user_id = ${user.id}
        `);

        expect(await getUserAccessToken(db, user.id)).toBeNull();
    });
});
