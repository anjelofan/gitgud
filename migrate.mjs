#!/usr/bin/env node
// Apply pending Drizzle migrations, then exit.
//
// The deployed stack runs this before the server starts (see
// docker/migrate-then-exec.sh). A bounded readiness retry covers the window
// where the app task starts before Postgres accepts connections, which Swarm
// cannot serialize with depends_on. A session-level advisory lock serializes
// concurrent replicas during a start-first rolling update.

import assert from 'node:assert/strict';
import process from 'node:process';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// Hex of "gitgud"; a stable application-wide identifier, not a schema object.
const ADVISORY_LOCK_KEY = 0x676974677564;
const MIGRATIONS_FOLDER = process.env.MIGRATIONS_FOLDER ?? '/app/drizzle';
const READINESS_ATTEMPTS = 60;
const READINESS_DELAY_MS = 2000;

function log(message) {
    process.stdout.write(`migrate: ${message}\n`);
}

function logError(message) {
    process.stderr.write(`migrate: ${message}\n`);
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function waitForDatabase(pool) {
    for (let attempt = 1; attempt <= READINESS_ATTEMPTS; attempt += 1) {
        try {
            await pool.query('select 1');
            return;
        } catch (error) {
            if (attempt === READINESS_ATTEMPTS) throw error;
            log(`database not ready (attempt ${attempt}/${READINESS_ATTEMPTS}): ${error.message}`);
            await delay(READINESS_DELAY_MS);
        }
    }
}

async function runMigrations() {
    const { DATABASE_URL } = process.env;
    assert(DATABASE_URL, 'DATABASE_URL must be set.');

    const pool = new Pool({
        connectionString: DATABASE_URL,
        max: 2,
        connectionTimeoutMillis: 2000,
    });

    try {
        await waitForDatabase(pool);

        const lockClient = await pool.connect();
        try {
            await lockClient.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
            log(`applying migrations from ${MIGRATIONS_FOLDER}`);
            await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
            log('migrations applied');
        } finally {
            await lockClient.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
            lockClient.release();
        }
    } finally {
        await pool.end();
    }
}

try {
    await runMigrations();
} catch (error) {
    logError(`failed: ${error.message}`);
    process.exitCode = 1;
}
