import assert from 'node:assert/strict';

export function resolveFakeGitHubPort() {
    const port = process.env.FAKE_GITHUB_PORT;
    assert(
        typeof port === 'string' &&
            port.length > 0 &&
            Number.isInteger(Number(port)) &&
            Number(port) > -1,
        'FAKE_GITHUB_PORT must be set.',
    );
    return Number(port);
}
