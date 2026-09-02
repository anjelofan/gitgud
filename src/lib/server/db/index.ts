import assert from 'node:assert/strict';
import { env } from 'node:process';

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { building } from '$app/env';

import * as schema from './schema/index.js';

function initConnection() {
    if (!building)
        assert(
            typeof env.DATABASE_URL !== 'undefined' || env.DATABASE_URL === '',
            'DATABASE_URL must be set.',
        );

    return new Pool({
        connectionString: env.DATABASE_URL ?? '',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });
}

const pool = initConnection();

export const db = drizzle({ client: pool, schema });
