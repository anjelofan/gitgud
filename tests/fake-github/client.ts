import { resolveFakeGitHubPort } from './port';

/** The fake runs in another process (vitest globalSetup / playwright webServer),
 * so fixtures are seeded over HTTP instead of direct calls. */
const CONTROL_URL = new URL(
    '/__fake/github',
    `http://localhost:${resolveFakeGitHubPort().toString()}`,
);

/** The boundary contract: the control endpoint answers with a value for
 * issue-ops and null for seed ops. */
export async function fakeGithub(
    op: string,
    args: Record<string, unknown> = {},
): Promise<string | null> {
    const response = await fetch(CONTROL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, ...args }),
    });
    if (!response.ok) throw new Error(`fake github op failed: ${op} (${response.status})`);
    const { result } = await response.json();
    return result;
}

export async function fakeGithubValue(op: string, args: Record<string, unknown> = {}) {
    const result = await fakeGithub(op, args);
    if (typeof result !== 'string') throw new Error(`fake op returned no value: ${op}`);
    return result;
}
