import { beforeAll, describe, expect, it } from 'vitest';

import { fakeGithub } from '$tests/fake-github/client';

import { getOrgInstallationToken } from './app';

beforeAll(async () => {
    await fakeGithub('registerInstallation', { org: 'app-org', installationId: 42 });
    await fakeGithub('registerInstallationError', { org: 'boom-org', status: 500 });
});

describe('getOrgInstallationToken', () => {
    it('mints an installation access token for the org', async () => {
        expect(await getOrgInstallationToken('app-org')).toBe('installation-token-42');
    });

    it('returns null when the app is not installed on the org (404)', async () => {
        expect(await getOrgInstallationToken('no-app-org')).toBeNull();
    });

    it('propagates unexpected GitHub failures', async () => {
        await expect(getOrgInstallationToken('boom-org')).rejects.toThrow(/500/u);
    });
});
