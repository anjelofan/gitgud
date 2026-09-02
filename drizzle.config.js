import { defineConfig } from 'drizzle-kit';

import assert from 'node:assert/strict';
import { env } from 'node:process';

assert(env.DATABASE_URL, 'DATABASE_URL must be set.');
export default defineConfig({
  out: './drizzle',
  schema: './src/lib/server/db/schema/index.js',
  dialect: 'postgresql',
  dbCredentials: { url: env.DATABASE_URL },
});