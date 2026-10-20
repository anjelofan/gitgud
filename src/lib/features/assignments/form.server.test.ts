import { beforeAll, describe, expect, it } from 'vitest';

import { fakeGithub } from '$tests/fake-github/client';

import { decodeCreateAssignmentForm, templateRepoStatus } from './form.server.ts';

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

describe('decodeCreateAssignmentForm', () => {
    it('decodes a present manual grading checkbox as manual grading', () => {
        const formData = new FormData();
        formData.set('gradingMode', 'on');
        formData.set('maxScore', '12.5');

        expect(decodeCreateAssignmentForm(formData)).toEqual({
            name: '',
            deadline: '',
            templateRepo: '',
            gradingMode: 'manual',
            maxScore: '12.5',
        });
    });

    it('decodes an absent grading checkbox as autograding', () => {
        expect(decodeCreateAssignmentForm(new FormData())).toEqual({
            name: '',
            deadline: '',
            templateRepo: '',
            gradingMode: 'autograding',
            maxScore: '',
        });
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
