import { createHmac } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { fakeGithub } from './fake-github/client';

// The Playwright fake GitHub server signs every OAuth exchange in as its
// default user, whose access token is this fixed fixture value.
const DEFAULT_FAKE_TOKEN = 'fake-default-access-token';

// The webhook secret the preview server receives from playwright.config.js,
// which reads it out of the committed .env.test.
const WEBHOOK_SECRET = 'test-webhook-secret';

const ORG = 'e2e-grading-org';
const TEMPLATE = 'e2e-grading-tpl';
const STUDENT_LOGIN = 'grading-student';
const STUDENT_TOKEN = 'grading-student-token';

// The webhook resolves a repository to a submission by organization and
// repository name, and this suite writes to a database that outlives a run, so
// a fixed assignment name would make the next run's lookup an ambiguous match.
const RUN_STAMP = Date.now();
const ASSIGNMENT_NAME = `Grading ${RUN_STAMP}`;

// Mirrors `repoNameFor` in accept.server.ts, so the test derives the repository
// name independently of the code that will provision it.
const REPO_NAME = `${ASSIGNMENT_NAME.toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')}-${STUDENT_LOGIN}`;

const INSTALLATION_ID = 1;
const INSTALLATION_TOKEN = 'installation-token-1';
const CHECK_SUITE_ID = 4711;
const CHECK_RUN_ID = 4712;
const RUN_ID = 9201;
const HEAD_SHA = 'sha-grading';

// Seeded once at module load; the fake GitHub server is already up
// (playwright webServer). Repo provisioning and grading reads use the
// installation token minted for installation 1 on the org.
await fakeGithub('registerInstallation', { org: ORG, installationId: INSTALLATION_ID });
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
    sha: HEAD_SHA,
});
await fakeGithub('registerBranch', {
    token: INSTALLATION_TOKEN,
    owner: ORG,
    repo: REPO_NAME,
    branch: 'feedback',
    sha: HEAD_SHA,
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
        id: 11,
        login: STUDENT_LOGIN,
        avatar_url: 'https://avatars.githubusercontent.com/u/11?v=4',
    },
});

// The score the autograding workflow publishes: a notice annotation on its job.
await fakeGithub('registerCheckSuiteCheckRuns', {
    token: INSTALLATION_TOKEN,
    owner: ORG,
    repo: REPO_NAME,
    checkSuiteId: CHECK_SUITE_ID,
    checkRuns: [{ id: CHECK_RUN_ID, output: { annotations_count: 1 } }],
});
await fakeGithub('registerCheckRunAnnotations', {
    token: INSTALLATION_TOKEN,
    owner: ORG,
    repo: REPO_NAME,
    checkRunId: CHECK_RUN_ID,
    annotations: [{ title: 'Autograding complete', message: 'Points 8/10' }],
});

/** The completed run GitHub delivers once the autograding workflow finishes. */
function deliveryBody() {
    return {
        action: 'completed',
        installation: { id: INSTALLATION_ID },
        repository: { name: REPO_NAME, owner: { login: ORG } },
        workflow_run: {
            id: RUN_ID,
            name: 'Autograding Tests',
            check_suite_id: CHECK_SUITE_ID,
            head_sha: HEAD_SHA,
            conclusion: 'success',
        },
    };
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

/**
 * Posts one webhook delivery at the running preview server.
 * @param {import('@playwright/test').Page} page
 * @param {string} body
 * @param {{ secret?: string, event?: string }} [options]
 */
function deliver(page, body, options = {}) {
    const { secret = WEBHOOK_SECRET, event = 'workflow_run' } = options;
    return page.request.post('/api/github/webhooks', {
        headers: {
            'content-type': 'application/json',
            'x-github-event': event,
            'x-github-delivery': 'e2e-grading-delivery',
            'x-hub-signature-256': sign(body, secret),
        },
        data: body,
    });
}

/** Deadline one day ahead, as the `datetime-local` value the form expects. */
function utcDeadlineFillValue() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 16);
}

/**
 * Signs in as the instructor, creates a program with a one-student roster, and
 * returns the assignment dashboard URL after creating the assignment.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function createGradedAssignment(page) {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
    await expect(page.getByText('Signed in as octocat')).toBeVisible();

    await page.getByRole('link', { name: 'Create program' }).click();
    await page.getByLabel('Program name').fill('Grading Program');
    await page.getByLabel('GitHub organization').fill(ORG);
    await page.getByLabel('Or paste student names').fill('Jane Doe');
    await page.getByRole('button', { name: 'Create program' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Grading Program' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Assignment Name' }).fill(ASSIGNMENT_NAME);
    await page.getByRole('textbox', { name: 'Deadline' }).fill(utcDeadlineFillValue());
    await page.getByRole('textbox', { name: 'Repository Template' }).fill(TEMPLATE);
    await page.getByRole('button', { name: 'Create Assignment' }).click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]{36}$/u);

    return page.url();
}

/**
 * Captures the invite token from the assignment dashboard and returns the invite URL.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function inviteUrlOf(page) {
    const inviteLink = await page.getByText(/Invite link: \/invite\//u).textContent();
    const token = inviteLink?.split('/invite/')[1]?.trim();
    if (typeof token !== 'string' || token.length === 0)
        throw new Error('invite link not visible on the assignment dashboard');

    return `/invite/${token}`;
}

test.describe('grading scores', () => {
    test('shows the score a signed workflow run delivery reports', async ({ page }) => {
        const assignmentUrl = await createGradedAssignment(page);
        const invite = await inviteUrlOf(page);

        // The student claims the roster entry and accepts, which provisions the
        // repository the grading run will report against.
        await page.goto('/');
        await page.getByRole('button', { name: 'Sign out' }).click();
        await fakeGithub('authorizeAs', { token: STUDENT_TOKEN });
        await page.goto(invite);
        await page.getByRole('button', { name: 'Jane Doe' }).click();
        await page.getByRole('button', { name: 'Accept assignment' }).click();
        await expect(page.getByText('Assignment accepted!')).toBeVisible();

        // Back as the instructor: the submission exists, but no run has concluded.
        await page.goto('/');
        await page.getByRole('button', { name: 'Sign out' }).click();
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();
        await page.goto(assignmentUrl);
        await expect(page.getByText('Awaiting autograding')).toBeVisible();

        const response = await deliver(page, JSON.stringify(deliveryBody()));
        expect(response.status()).toBe(202);

        await page.reload();
        await expect(page.getByText('8.00 / 10.00')).toBeVisible();
    });

    test('rejects a delivery that is not signed with the webhook secret', async ({ page }) => {
        const response = await deliver(page, JSON.stringify(deliveryBody()), {
            secret: 'not-the-webhook-secret',
        });

        expect(response.status()).toBe(401);
    });
});
