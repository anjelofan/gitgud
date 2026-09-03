import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { and, eq, gt, sql } from 'drizzle-orm';

import type { DbConnection } from '$lib/server/db';
import { decryptToken, encryptToken, hashSessionSecret } from '$lib/server/auth/crypto';
import { githubTokens, sessions, users } from '$lib/server/db/schema';
import {
    type GithubUser,
    type OAuthTokenResponse,
    refreshAccessToken,
} from '$lib/server/github/oauth';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'auth.sessions';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export const SESSION_COOKIE = 'session';

function tokenStorage(userId: string, tokenResponse: OAuthTokenResponse) {
    return {
        userId,
        accessTokenEnc: encryptToken(tokenResponse.access_token),
        refreshTokenEnc: encryptToken(tokenResponse.refresh_token),
        accessExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        refreshExpiresAt: new Date(Date.now() + tokenResponse.refresh_token_expires_in * 1000),
    };
}

export async function upsertGithubUser(
    db: DbConnection,
    githubUser: GithubUser,
    tokenResponse: OAuthTokenResponse,
) {
    return await tracer.asyncSpan('upsert-github-user', async (span) => {
        const { id: githubId, login, avatar_url: avatarUrl } = githubUser;

        span.setAttributes({
            'github.user.id': githubId,
            'github.user.login': login,
        });

        return await db.transaction(async (tx) => {
            const inserted = await tx
                .insert(users)
                .values({ githubId, login, avatarUrl })
                .onConflictDoUpdate({
                    target: users.githubId,
                    set: { login, avatarUrl, updatedAt: sql`now()` },
                })
                .returning();
            const [user] = inserted;
            assert(typeof user !== 'undefined', 'user upsert returned no row.');

            const tokenRow = tokenStorage(user.id, tokenResponse);
            const { accessTokenEnc, refreshTokenEnc, accessExpiresAt, refreshExpiresAt } = tokenRow;
            await tx
                .insert(githubTokens)
                .values(tokenRow)
                .onConflictDoUpdate({
                    target: githubTokens.userId,
                    set: {
                        accessTokenEnc,
                        refreshTokenEnc,
                        accessExpiresAt,
                        refreshExpiresAt,
                        updatedAt: sql`now()`,
                    },
                });

            return user;
        });
    });
}

export async function createSession(db: DbConnection, userId: string) {
    return await tracer.asyncSpan('create-session', async (span) => {
        span.setAttribute('user.id', userId);

        const secret = randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        const inserted = await db
            .insert(sessions)
            .values({ userId, secretHash: hashSessionSecret(secret), expiresAt })
            .returning({ id: sessions.id });
        const [session] = inserted;
        assert(typeof session !== 'undefined', 'session insert returned no row.');
        logger.info('session created', { 'user.id': userId });

        return { id: session.id, secret, expiresAt };
    });
}

export async function validateSession(db: DbConnection, cookieValue: string) {
    const COOKIE_VALUE_LENGTH = 2;
    return await tracer.asyncSpan('validate-session', async (span) => {
        const parts = cookieValue.split('.');
        if (parts.length !== COOKIE_VALUE_LENGTH) {
            logger.debug('malformed session cookie, rejecting');
            return null;
        }

        const [, secret] = parts;
        if (typeof secret === 'undefined') {
            logger.debug('malformed session cookie, rejecting');
            return null;
        }
        const secretHash = hashSessionSecret(secret);
        span.setAttribute('session.secret_hash_prefix', secretHash.slice(0, 8));

        const matched = await db
            .select({ session: sessions, user: users })
            .from(sessions)
            .innerJoin(users, eq(sessions.userId, users.id))
            .where(and(eq(sessions.secretHash, secretHash), gt(sessions.expiresAt, new Date())))
            .limit(1);
        const [row] = matched;
        if (typeof row === 'undefined') {
            logger.debug('session cookie does not match a valid session, rejecting');
            return null;
        }

        span.setAttributes({ 'session.id': row.session.id, 'user.id': row.user.id });
        return { id: row.session.id, user: row.user };
    });
}

export async function destroySession(db: DbConnection, sessionId: string) {
    await tracer.asyncSpan('destroy-session', async (span) => {
        span.setAttribute('session.id', sessionId);
        await db.delete(sessions).where(eq(sessions.id, sessionId));
        logger.info('session destroyed', { 'session.id': sessionId });
    });
}

export async function getUserAccessToken(db: DbConnection, userId: string) {
    return await tracer.asyncSpan('get-user-access-token', async (span) => {
        span.setAttribute('user.id', userId);

        return await db.transaction(async (tx) => {
            const locked = await tx
                .select()
                .from(githubTokens)
                .where(eq(githubTokens.userId, userId))
                .limit(1)
                .for('update');
            const [row] = locked;
            if (typeof row === 'undefined') {
                logger.debug('no stored github tokens for user', { 'user.id': userId });
                return null;
            }

            const accessToken = decryptToken(row.accessTokenEnc);
            const now = Date.now();
            if (row.accessExpiresAt.getTime() > now + TOKEN_EXPIRY_MARGIN_MS) return accessToken;

            const refreshToken = decryptToken(row.refreshTokenEnc);
            if (row.refreshExpiresAt.getTime() <= now + TOKEN_EXPIRY_MARGIN_MS) {
                logger.warn('github refresh token expired, cannot refresh access token', {
                    'user.id': userId,
                });
                return null;
            }

            logger.debug('github access token expired, refreshing', { 'user.id': userId });
            const refreshed = await refreshAccessToken(refreshToken);
            const tokenRow = tokenStorage(userId, refreshed);
            const { accessTokenEnc, refreshTokenEnc, accessExpiresAt, refreshExpiresAt } = tokenRow;
            await tx
                .insert(githubTokens)
                .values(tokenRow)
                .onConflictDoUpdate({
                    target: githubTokens.userId,
                    set: {
                        accessTokenEnc,
                        refreshTokenEnc,
                        accessExpiresAt,
                        refreshExpiresAt,
                        updatedAt: sql`now()`,
                    },
                });
            return refreshed.access_token;
        });
    });
}
