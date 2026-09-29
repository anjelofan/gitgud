import { beforeAll, describe, expect, it } from 'vitest';

import { fakeGithub } from '$tests/fake-github/client';

import { templateRepoStatus } from './form.server.ts';

const TOKEN = 'form-access-token';

beforeAll(async () => {
    await fakeGithub('registerUser', { token: TOKEN });
    await fakeGithub('registerRepo', { token: TOKEN, org: 'form-org', repo: 'tpl-repo' });
    await fakeGithub('registerRepoError', {
        token: TOKEN,
        org: 'form-fail-org',
        repo: 'tpl-repo',
        status: 500,
    });
});

describe('templateRepoStatus', () => {
    it('reports a repository that exists in the organization as known', async () => {
        expect(await templateRepoStatus(TOKEN, 'form-org', 'tpl-repo')).toBe('known');
    });

    it('reports a repository that is missing from the organization (404)', async () => {
        expect(await templateRepoStatus(TOKEN, 'form-org', 'foreign-repo')).toBe('missing');
    });

    it('reports a transient GitHub failure as unavailable', async () => {
        expect(await templateRepoStatus(TOKEN, 'form-fail-org', 'tpl-repo')).toBe('unavailable');
    });

    it('reports a missing token as unavailable', async () => {
        expect(await templateRepoStatus(null, 'form-org', 'tpl-repo')).toBe('unavailable');
    });
});
