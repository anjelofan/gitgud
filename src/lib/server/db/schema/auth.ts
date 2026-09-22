import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    githubId: bigint('github_id', { mode: 'number' }).notNull().unique(),
    login: text('login').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdateFn(() => sql`now()`),
});

export const sessions = pgTable(
    'sessions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        secretHash: text('secret_hash').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex('sessions_secret_hash_idx').on(table.secretHash),
        index('sessions_user_id_idx').on(table.userId),
    ],
);

export const githubTokens = pgTable('github_tokens', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    accessExpiresAt: timestamp('access_expires_at', {
        withTimezone: true,
    }).notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', {
        withTimezone: true,
    }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdateFn(() => sql`now()`),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type GithubTokens = typeof githubTokens.$inferSelect;
