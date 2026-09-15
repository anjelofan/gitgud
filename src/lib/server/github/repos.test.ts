import * as v from 'valibot';
import { beforeAll, describe, expect, it } from 'vitest';

import { fakeGithub } from '$tests/fake-github/client';

import { listOrgRepos } from './repos';
import { OrgReposSchema } from './contracts';

const TOKEN = 'repos-access-token';

beforeAll(async () => {
    await fakeGithub('registerUser', { token: TOKEN });
    await fakeGithub('registerRepos', {
        token: TOKEN,
        org: 'test-org',
        repos: ['repo1', 'repo2'],
    });
    await fakeGithub('registerRepos', { token: TOKEN, org: 'no-repo-org', repos: [] });
    await fakeGithub('registerReposError', { token: TOKEN, org: 'forbidden-org', status: 403 });
    await fakeGithub('registerReposError', { token: TOKEN, org: 'git-fail-org', status: 500 });
});

describe('listOrgRepos', () => {
    it('lists the repositories registered for a token and org', async () => {
        expect(await listOrgRepos(TOKEN, 'test-org')).toEqual([
            { name: 'repo1' },
            { name: 'repo2' },
        ]);
    });

    it('returns an empty list when the org has no repositories', async () => {
        expect(await listOrgRepos(TOKEN, 'no-repo-org')).toEqual([]);
    });

    it('throws when the org is not registered', async () => {
        await expect(listOrgRepos(TOKEN, 'unregistered-org')).rejects.toThrow(/Not Found/u);
    });

    it('throws on a forbidden org (403)', async () => {
        await expect(listOrgRepos(TOKEN, 'forbidden-org')).rejects.toThrow(/403/u);
    });

    it('propagates unexpected GitHub failures', async () => {
        await expect(listOrgRepos(TOKEN, 'git-fail-org')).rejects.toThrow(/500/u);
    });
});

describe('OrgReposSchema', () => {
    it('parses a list of repositories', () => {
        expect(v.safeParse(OrgReposSchema, [{ name: 'repo1' }, { name: 'repo2' }]).success).toBe(
            true,
        );
    });

    it('rejects a repository without a name', () => {
        expect(v.safeParse(OrgReposSchema, [{ wat: 'repo1' }]).success).toBe(false);
    });
});
