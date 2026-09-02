import { defineConfig } from '@playwright/test';

export default defineConfig({
    // Assume pnpm build is run before playwright tests
    webServer: {
        command: 'pnpm preview',
        port: 4173,
        reuseExistingServer: !process.env.CI,
        gracefulShutdown: { signal: 'SIGINT', timeout: 0 },
    },
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
});
