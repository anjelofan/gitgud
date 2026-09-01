import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  test: {
    name: 'server',
    environment: 'node',
    expect: { requireAssertions: true },
    include: ['tests/vitest/**/*.{test,spec}.{js,ts}'],
    reporters: ['default', 'json'],
    outputFile: { json: './vitest-results/.last-run.json' },
  },
});
