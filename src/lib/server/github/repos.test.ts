import * as v from 'valibot';
import { beforeAll, describe, expect, it } from 'vitest';

import { fakeGithub } from '$tests/fake-github/client';

import {
    addCollaborator,
    createBranch,
    createCommit,
    createPullRequest,
    createRepoFromTemplate,
    getBranchHead,
    getCommit,
    getOrgRepo,
    listOpenPullRequests,
    updateBranch,
} from './repos';
import {
    CollaboratorResponseSchema,
    GeneratedRepoSchema,
    GitRefSchema,
    OrgRepoSchema,
    PullRequestSchema,
} from './contracts';

const TOKEN = 'repos-access-token';
const TEMPLATE_TOKEN = 'template-access-token';

beforeAll(async () => {
    await fakeGithub('registerUser', { token: TOKEN });
    await fakeGithub('registerRepo', { token: TOKEN, org: 'test-org', repo: 'repo1' });
    await fakeGithub('registerRepoError', {
        token: TOKEN,
        org: 'forbidden-org',
        repo: 'repo1',
        status: 403,
    });
    await fakeGithub('registerRepoError', {
        token: TOKEN,
        org: 'git-fail-org',
        repo: 'repo1',
        status: 500,
    });

    await fakeGithub('registerUser', { token: TEMPLATE_TOKEN });
    await fakeGithub('registerTemplate', {
        token: TEMPLATE_TOKEN,
        org: 'accept-org',
        template: 'tpl-repo',
        repoName: 'fibonacci-octocat',
        defaultBranch: 'main',
    });
    await fakeGithub('registerTemplateError', {
        token: TEMPLATE_TOKEN,
        org: 'accept-org',
        template: 'taken-tpl',
        status: 422,
    });
    await fakeGithub('registerTemplateError', {
        token: TEMPLATE_TOKEN,
        org: 'git-fail-org',
        template: 'tpl-repo',
        status: 500,
    });
    await fakeGithub('registerBranchHead', {
        token: TEMPLATE_TOKEN,
        owner: 'accept-org',
        repo: 'fibonacci-octocat',
        branch: 'main',
        sha: 'abc123',
    });
    await fakeGithub('registerBranchHeadError', {
        token: TEMPLATE_TOKEN,
        owner: 'accept-org',
        repo: 'ghost-repo',
        branch: 'main',
        status: 404,
    });
    await fakeGithub('registerBranch', {
        token: TEMPLATE_TOKEN,
        owner: 'accept-org',
        repo: 'fibonacci-octocat',
        branch: 'feedback',
        sha: 'abc123',
    });
    await fakeGithub('registerBranchError', {
        token: TEMPLATE_TOKEN,
        owner: 'accept-org',
        repo: 'ghost-repo',
        branch: 'feedback',
        status: 422,
    });
    await fakeGithub('registerCollaborator', {
        token: TEMPLATE_TOKEN,
        owner: 'accept-org',
        repo: 'fibonacci-octocat',
        username: 'octocat',
    });
    await fakeGithub('registerCollaboratorError', {
        token: TEMPLATE_TOKEN,
        owner: 'accept-org',
        repo: 'ghost-repo',
        username: 'octocat',
        status: 404,
    });
    await fakeGithub('registerPullRequest', {
        token: TEMPLATE_TOKEN,
        owner: 'accept-org',
        repo: 'fibonacci-octocat',
    });
    await fakeGithub('registerPullRequestError', {
        token: TEMPLATE_TOKEN,
        owner: 'accept-org',
        repo: 'ghost-repo',
        status: 422,
    });
    await fakeGithub('registerPullRequestError', {
        token: TEMPLATE_TOKEN,
        owner: 'accept-org',
        repo: 'git-fail-repo',
        status: 500,
    });
});

describe('getOrgRepo', () => {
    it('reads the repository registered for a token and org', async () => {
        expect(await getOrgRepo(TOKEN, 'test-org', 'repo1')).toEqual({ name: 'repo1' });
    });

    it('throws when the repository is not registered (404)', async () => {
        await expect(getOrgRepo(TOKEN, 'test-org', 'ghost-repo')).rejects.toThrow(/Not Found/u);
    });

    it('throws when the repository is forbidden (403)', async () => {
        await expect(getOrgRepo(TOKEN, 'forbidden-org', 'repo1')).rejects.toThrow(/403/u);
    });

    it('propagates unexpected GitHub failures', async () => {
        await expect(getOrgRepo(TOKEN, 'git-fail-org', 'repo1')).rejects.toThrow(/500/u);
    });
});

describe('OrgRepoSchema', () => {
    it('parses a repository with a name', () => {
        expect(v.safeParse(OrgRepoSchema, { name: 'repo1' }).success).toBe(true);
    });

    it('rejects a repository without a name', () => {
        expect(v.safeParse(OrgRepoSchema, { wat: 'repo1' }).success).toBe(false);
    });
});

describe('createRepoFromTemplate', () => {
    it('creates a repository from a template', async () => {
        expect(
            await createRepoFromTemplate(
                TEMPLATE_TOKEN,
                'accept-org',
                'tpl-repo',
                'fibonacci-octocat',
            ),
        ).toEqual({ name: 'fibonacci-octocat', default_branch: 'main' });
    });

    it('throws when the target repository name already exists (422)', async () => {
        await expect(
            createRepoFromTemplate(TEMPLATE_TOKEN, 'accept-org', 'taken-tpl', 'fibonacci-octocat'),
        ).rejects.toThrow(/422/u);
    });

    it('propagates unexpected GitHub failures', async () => {
        await expect(
            createRepoFromTemplate(TEMPLATE_TOKEN, 'git-fail-org', 'tpl-repo', 'fibonacci-octocat'),
        ).rejects.toThrow(/500/u);
    });
});

describe('getBranchHead', () => {
    it('returns the ref and head SHA for a branch', async () => {
        expect(
            await getBranchHead(TEMPLATE_TOKEN, 'accept-org', 'fibonacci-octocat', 'main'),
        ).toEqual({ ref: 'refs/heads/main', object: { sha: 'abc123' } });
    });

    it('throws for a missing branch (404)', async () => {
        await expect(
            getBranchHead(TEMPLATE_TOKEN, 'accept-org', 'ghost-repo', 'main'),
        ).rejects.toThrow(/404/u);
    });
});

describe('createBranch', () => {
    it('creates a branch ref at the given SHA', async () => {
        expect(
            await createBranch(
                TEMPLATE_TOKEN,
                'accept-org',
                'fibonacci-octocat',
                'feedback',
                'abc123',
            ),
        ).toEqual({ ref: 'refs/heads/feedback', object: { sha: 'abc123' } });
    });

    it('throws when the ref already exists (422)', async () => {
        await expect(
            createBranch(TEMPLATE_TOKEN, 'accept-org', 'ghost-repo', 'feedback', 'abc123'),
        ).rejects.toThrow(/422/u);
    });
});

describe('addCollaborator', () => {
    it('invites the user as a collaborator', async () => {
        expect(
            await addCollaborator(TEMPLATE_TOKEN, 'accept-org', 'fibonacci-octocat', 'octocat'),
        ).toEqual({});
    });

    it('propagates GitHub failures', async () => {
        await expect(
            addCollaborator(TEMPLATE_TOKEN, 'accept-org', 'ghost-repo', 'octocat'),
        ).rejects.toThrow(/404/u);
    });
});

describe('createPullRequest', () => {
    it('opens a pull request and returns its number and url', async () => {
        expect(
            await createPullRequest(TEMPLATE_TOKEN, 'accept-org', 'fibonacci-octocat', {
                head: 'main',
                base: 'feedback',
                title: 'Feedback',
                body: 'Feedback goes here.',
            }),
        ).toEqual({
            number: 1,
            html_url: 'https://github.com/accept-org/fibonacci-octocat/pull/1',
        });
    });

    it('throws when a matching pull request already exists (422)', async () => {
        await expect(
            createPullRequest(TEMPLATE_TOKEN, 'accept-org', 'ghost-repo', {
                head: 'main',
                base: 'feedback',
                title: 'Feedback',
                body: 'Feedback goes here.',
            }),
        ).rejects.toThrow(/422/u);
    });

    it('propagates unexpected GitHub failures', async () => {
        await expect(
            createPullRequest(TEMPLATE_TOKEN, 'accept-org', 'git-fail-repo', {
                head: 'main',
                base: 'feedback',
                title: 'Feedback',
                body: 'Feedback goes here.',
            }),
        ).rejects.toThrow(/500/u);
    });

    it('lists the created feedback pull request', async () => {
        expect(
            await listOpenPullRequests(
                TEMPLATE_TOKEN,
                'accept-org',
                'fibonacci-octocat',
                'main',
                'feedback',
            ),
        ).toEqual([
            { number: 1, html_url: 'https://github.com/accept-org/fibonacci-octocat/pull/1' },
        ]);
    });
});

describe('git commit setup', () => {
    it('reads a commit tree', async () => {
        expect(
            await getCommit(TEMPLATE_TOKEN, 'accept-org', 'fibonacci-octocat', 'abc123'),
        ).toEqual({ sha: 'abc123', message: 'Template commit', tree: { sha: 'tree-abc123' } });
    });

    it('creates an empty descendant commit', async () => {
        expect(
            await createCommit(
                TEMPLATE_TOKEN,
                'accept-org',
                'fibonacci-octocat',
                'Setting up GitGud Feedback',
                'tree-abc123',
                'abc123',
            ),
        ).toEqual({
            sha: 'abc123-feedback-setup',
            message: 'Setting up GitGud Feedback',
            tree: { sha: 'tree-abc123' },
        });
    });

    it('updates a branch ref', async () => {
        expect(
            await updateBranch(
                TEMPLATE_TOKEN,
                'accept-org',
                'fibonacci-octocat',
                'main',
                'abc123-feedback-setup',
            ),
        ).toEqual({
            ref: 'refs/heads/main',
            object: { sha: 'abc123-feedback-setup' },
        });
    });
});

describe('GeneratedRepoSchema', () => {
    it('parses a generated repository', () => {
        expect(
            v.safeParse(GeneratedRepoSchema, { name: 'repo', default_branch: 'main' }).success,
        ).toBe(true);
    });

    it('rejects a payload without a default branch', () => {
        expect(v.safeParse(GeneratedRepoSchema, { name: 'repo' }).success).toBe(false);
    });
});

describe('GitRefSchema', () => {
    it('parses a git ref', () => {
        expect(
            v.safeParse(GitRefSchema, { ref: 'refs/heads/main', object: { sha: 'abc' } }).success,
        ).toBe(true);
    });
});

describe('CollaboratorResponseSchema', () => {
    it('parses an empty body', () => {
        expect(v.safeParse(CollaboratorResponseSchema, {}).success).toBe(true);
    });
});

describe('PullRequestSchema', () => {
    it('parses a pull request payload', () => {
        expect(
            v.safeParse(PullRequestSchema, { number: 1, html_url: 'https://github.com/o/r/pull/1' })
                .success,
        ).toBe(true);
    });

    it('rejects a payload without a url', () => {
        expect(v.safeParse(PullRequestSchema, { number: 1 }).success).toBe(false);
    });
});
