import { beforeAll, describe, expect, it } from 'vitest';

import { fakeGithub } from '$tests/fake-github/client';

import { resolveRole } from './roles';

const TOKEN = 'roles-access-token';

beforeAll(async () => {
    await fakeGithub('registerUser', { token: TOKEN });
    await fakeGithub('registerMembership', {
        token: TOKEN,
        org: 'admin-org',
        state: 'active',
        role: 'admin',
    });
    await fakeGithub('registerMembership', {
        token: TOKEN,
        org: 'member-org',
        state: 'active',
        role: 'member',
    });
    await fakeGithub('registerMembership', {
        token: TOKEN,
        org: 'pending-org',
        state: 'pending',
        role: 'admin',
    });
    await fakeGithub('registerMembershipError', {
        token: TOKEN,
        org: 'forbidden-org',
        status: 403,
    });
    await fakeGithub('registerMembershipError', { token: TOKEN, org: 'boom-org', status: 500 });
});

describe('resolveRole', () => {
    it('returns null when the token or org is missing', async () => {
        expect(await resolveRole(null, 'admin-org')).toBeNull();
        expect(await resolveRole(TOKEN, null)).toBeNull();
    });

    it('grants the instructor role to an active org admin', async () => {
        expect(await resolveRole(TOKEN, 'admin-org')).toEqual({
            kind: 'instructor',
            source: 'org-owner',
        });
    });

    it('does not grant the student role to a plain org member', async () => {
        expect(await resolveRole(TOKEN, 'member-org')).toBeNull();
    });

    it('does not grant a role for a pending membership', async () => {
        expect(await resolveRole(TOKEN, 'pending-org')).toBeNull();
    });

    it('returns null when the user is not a member of the org (404)', async () => {
        expect(await resolveRole(TOKEN, 'unknown-org')).toBeNull();
    });

    it('returns null when the membership is not accessible (403)', async () => {
        expect(await resolveRole(TOKEN, 'forbidden-org')).toBeNull();
    });

    it('propagates unexpected GitHub failures', async () => {
        await expect(resolveRole(TOKEN, 'boom-org')).rejects.toThrow(/500/u);
    });
});
