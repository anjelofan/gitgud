import { config as loadEnvFile } from 'dotenv';
import { defineConfig } from '@playwright/test';

import { resolveFakeGitHubPort } from './tests/fake-github/port.ts';

// Load the committed test environment, then derive everything from it.
loadEnvFile({ path: '.env.test' });
loadEnvFile({ path: '.env.test.local' });
const requiredTestSecrets = [
    'GITHUB_APP_CLIENT_SECRET',
    'SESSION_SECRET',
    'GITHUB_APP_PRIVATE_KEY',
];
if (requiredTestSecrets.some((name) => typeof process.env[name] !== 'string'))
    throw new Error('Test secrets missing. Run `pnpm test:secrets` first.');
const fakeGitHubPort = resolveFakeGitHubPort();

const testEnv = {
    FAKE_GITHUB_PORT: String(fakeGitHubPort),
    SESSION_SECRET: process.env.SESSION_SECRET,
    GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
    GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
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
