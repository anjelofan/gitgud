import { config as loadEnvFile } from 'dotenv';
import { defineConfig } from '@playwright/test';

import { resolveFakeGitHubPort } from './tests/fake-github/port.ts';

// Load the committed test environment, then derive everything from it.
loadEnvFile({ path: '.env.test' });
const fakeGitHubPort = resolveFakeGitHubPort();

const testEnv = {
    FAKE_GITHUB_PORT: String(fakeGitHubPort),
    SESSION_SECRET: process.env.SESSION_SECRET,
    GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
    GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
};

export default defineConfig({
    // Assume pnpm build is run before playwright tests
    webServer: [
        {
            command: 'node tests/fake-github/start.js',
            port: fakeGitHubPort,
            env: { FAKE_GITHUB_PORT: String(fakeGitHubPort) },
            reuseExistingServer: !process.env.CI,
        },
        {
            command: 'pnpm preview',
            port: 4173,
            reuseExistingServer: !process.env.CI,
            gracefulShutdown: { signal: 'SIGINT', timeout: 0 },
            env: testEnv,
        },
    ],
    testDir: './tests',
    outputDir: 'playwright-results',
    use: {
        baseURL: 'http://localhost:4173',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
    },
    maxFailures: 1,
    reporter: 'dot',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    failOnEmptyTestSuite: false,
});
