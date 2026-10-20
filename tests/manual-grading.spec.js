import { createHmac } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { expectSignedInAs, signOut } from './session';

import { fakeGithub } from './fake-github/client';

// The Playwright fake GitHub server signs every OAuth exchange in as its
// default user, whose access token is this fixed fixture value.
const DEFAULT_FAKE_TOKEN = 'fake-default-access-token';

const WEBHOOK_SECRET = 'test-webhook-secret';

const ORG = 'e2e-manual-org';
const TEMPLATE = 'e2e-manual-tpl';
const ASSIGNMENT_NAME = 'Manual Grading';
const MAX_SCORE = '10';
const STUDENT_LOGIN = 'manual-student';
const STUDENT_TOKEN = 'manual-student-token';

// Mirrors `repoNameFor` in accept.server.ts, so the test derives the repository
// name independently of the code that provisions it.
const REPO_NAME = `${ASSIGNMENT_NAME.toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')}-${STUDENT_LOGIN}`;

// The app provisions repos with the installation token minted for
// installation 1 on the org (see the registration below).
const INSTALLATION_TOKEN = 'installation-token-1';

await fakeGithub('registerInstallation', { org: ORG, installationId: 1 });
await fakeGithub('registerMembership', {
    token: DEFAULT_FAKE_TOKEN,
    org: ORG,
    state: 'active',
    role: 'admin',
});
await fakeGithub('registerRepo', { token: DEFAULT_FAKE_TOKEN, org: ORG, repo: TEMPLATE });
await fakeGithub('registerTemplate', {
    token: INSTALLATION_TOKEN,
    org: ORG,
    template: TEMPLATE,
    repoName: REPO_NAME,
    defaultBranch: 'main',
});
await fakeGithub('registerBranchHead', {
    token: INSTALLATION_TOKEN,
    owner: ORG,
    repo: REPO_NAME,
    branch: 'main',
    sha: 'abc123',
});
await fakeGithub('registerBranch', {
    token: INSTALLATION_TOKEN,
    owner: ORG,
    repo: REPO_NAME,
    branch: 'feedback',
    sha: 'abc123',
});
await fakeGithub('registerCollaborator', {
    token: INSTALLATION_TOKEN,
    owner: ORG,
    repo: REPO_NAME,
    username: STUDENT_LOGIN,
});
await fakeGithub('registerPullRequest', {
    token: INSTALLATION_TOKEN,
    owner: ORG,
    repo: REPO_NAME,
});
await fakeGithub('registerUser', {
    token: STUDENT_TOKEN,
    user: {
        id: 21,
        login: STUDENT_LOGIN,
        avatar_url: 'https://avatars.githubusercontent.com/u/21?v=4',
    },
});

/** Deadline one day ahead, as the `datetime-local` value the form expects. */
function utcDeadlineFillValue() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 16);
}

/**
 * Signs a delivery body the way GitHub does, so the endpoint's HMAC check passes.
 * @param {string} body
 * @param {string} secret
 * @returns {string}
 */
function sign(body, secret) {
    return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

/** The completed autograding run a manual assignment must ignore. */
function deliveryBody() {
    return {
        action: 'completed',
        installation: { id: 1 },
        repository: { name: REPO_NAME, owner: { login: ORG } },
        workflow_run: {
            id: 7001,
            name: 'Autograding Tests',
            check_suite_id: 8001,
            head_sha: 'sha-manual',
            conclusion: 'success',
        },
    };
}

test.describe('manual grading', () => {
    test('lets the instructor enter a score that survives a workflow delivery', async ({
        page,
    }) => {
        // Create a manually graded assignment.
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();

        await page.getByRole('link', { name: 'Create program' }).click();
        await page.getByLabel('Program name').fill('Manual Grading Program');
        await page.getByLabel('GitHub organization').fill(ORG);
        await page.getByLabel('Or paste student names').fill('Jane Doe');
        await page.getByRole('button', { name: 'Create program' }).click();
        await expect(
            page.getByRole('heading', { level: 1, name: 'Manual Grading Program' }),
        ).toBeVisible();

        await page.getByRole('textbox', { name: 'Assignment Name' }).fill(ASSIGNMENT_NAME);
        await page.getByRole('textbox', { name: 'Deadline' }).fill(utcDeadlineFillValue());
        await page.getByRole('textbox', { name: 'Repository Template' }).fill(TEMPLATE);
        await page.getByLabel('Grade manually').check();
        await page.getByLabel('Maximum score').fill(MAX_SCORE);
        await page.getByRole('button', { name: 'Create Assignment' }).click();
        await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]{36}$/u);
        const assignmentUrl = page.url();

        await expect(page.getByText(`Manual grading: maximum score ${MAX_SCORE}.00`)).toBeVisible();
        await expect(page.getByText('Not submitted')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Refresh scores' })).toHaveCount(0);

        const inviteLink = await page.getByText(/Invite link: \/invite\//u).textContent();
        const token = inviteLink?.split('/invite/')[1]?.trim();
        if (typeof token !== 'string' || token.length === 0)
            throw new Error('invite link not visible on the assignment dashboard');

        // The student claims the roster entry and accepts the assignment.
        await signOut(page);
        await fakeGithub('authorizeAs', { token: STUDENT_TOKEN });
        await page.goto(`/invite/${token}`);
        await page.getByRole('button', { name: 'Jane Doe' }).click();
        await page.getByRole('button', { name: 'Accept assignment' }).click();
        await expect(page.getByText('Assignment accepted!')).toBeVisible();
        await expectSignedInAs(page, STUDENT_LOGIN);

        // Back as the instructor: the submission awaits a manual score.
        await signOut(page);
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();
        await page.goto(assignmentUrl);
        await expect(page.getByText('Awaiting grading')).toBeVisible();

        await page.getByLabel('Score').fill('8.5');
        await page.getByRole('button', { name: 'Save score' }).click();
        await expect(page.getByText('Score saved: 8.50 / 10.00.')).toBeVisible();

        // A score above the maximum is accepted, not clamped or rejected.
        await page.getByLabel('Score').fill('11');
        await page.getByRole('button', { name: 'Save score' }).click();
        await expect(page.getByText('Score saved: 11.00 / 10.00.')).toBeVisible();

        // An autograding delivery must not overwrite a manual score.
        const body = JSON.stringify(deliveryBody());
        const response = await page.request.post('/api/github/webhooks', {
            headers: {
                'content-type': 'application/json',
                'x-github-event': 'workflow_run',
                'x-github-delivery': 'e2e-manual-delivery',
                'x-hub-signature-256': sign(body, WEBHOOK_SECRET),
            },
            data: body,
        });
        expect(response.status()).toBe(204);

        await page.reload();
        await expect(page.getByText('11.00 / 10.00')).toBeVisible();
    });
});
