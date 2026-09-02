import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import assert from 'node:assert/strict';
import { building } from '$app/env';
import { env } from 'node:process';

function initConnection() {
  if (!building)
    assert(typeof env.DATABASE_URL !== 'undefined' || env.DATABASE_URL === '', 'DATABASE_URL must be set.');

  return new Pool({
    connectionString: env.DATABASE_URL ?? '',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

const pool = initConnection();

// TODO: Add schema to enable relational queries
export const db = drizzle({ client: pool });
