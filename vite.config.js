import tailwindcss from '@tailwindcss/vite';
import { config as loadEnvFile } from 'dotenv';
import { configDefaults, defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

import { resolveFakeGitHubPort } from './tests/fake-github/port.ts';

// Test runs are hermetic: load the committed test environment before SvelteKit
// snapshots the environment for `$env/dynamic/*` (in serve mode that snapshot
// is baked at plugin-config time, so later writes never reach it). Production
// builds and `pnpm dev` are unaffected.
if (process.env.VITEST === 'true') {
    loadEnvFile({ path: '.env.test' });
    resolveFakeGitHubPort();
    delete process.env.GITHUB_ORG;
}

export default defineConfig({
    plugins: [sveltekit(), tailwindcss()],
    test: {
        name: 'server',
        environment: 'node',
        expect: { requireAssertions: true },
        include: ['src/**/*.test.{js,ts}'],
        exclude: [...configDefaults.exclude, 'tests/**'],
        globalSetup: ['tests/fake-github/global-setup.js'],
        reporters: ['default', 'json'],
        outputFile: { json: './vitest-results/.last-run.json' },
        passWithNoTests: true,
    },
});
