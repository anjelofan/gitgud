import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        adapter: adapter(),
        alias: { $tests: './tests' },
        experimental: {
            tracing: { server: true },
            instrumentation: { server: true },
        },
    },
};

export default config;
