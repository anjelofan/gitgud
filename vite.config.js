import tailwindcss from '@tailwindcss/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
    plugins: [sveltekit(), tailwindcss()],
    test: {
        name: 'server',
        environment: 'node',
        expect: { requireAssertions: true },
        include: ['src/**/*.test.{js,ts}'],
        exclude: [...configDefaults.exclude, 'tests/**'],
        reporters: ['default', 'json'],
        outputFile: { json: './vitest-results/.last-run.json' },
        passWithNoTests: true,
    },
});
