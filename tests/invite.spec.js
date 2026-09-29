import { expect, test } from '@playwright/test';

import { fakeGithub } from './fake-github/client';

// The Playwright fake GitHub server signs every OAuth exchange in as its
// default user, whose access token is this fixed fixture value.
const DEFAULT_FAKE_TOKEN = 'fake-default-access-token';

const ORG = 'e2e-invite-org';
const TEMPLATE = 'e2e-invite-tpl';
const ASSIGNMENT_NAME = 'Fibonacci';
const STUDENT_LOGIN = 'student-cat';
const STUDENT_TOKEN = 'invite-student-token';
const REPO_NAME = `${ASSIGNMENT_NAME.toLowerCase()}-${STUDENT_LOGIN}`;

// The app provisions repos with the installation token minted for
// installation 1 on the org (see the registration below).
const INSTALLATION_TOKEN = 'installation-token-1';

// Seeded once at module load; the fake GitHub server is already up
// (playwright webServer). Repo listing uses the instructor's user token;
// repo provisioning uses the installation token.
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
        id: 7,
        login: STUDENT_LOGIN,
        avatar_url: 'https://avatars.githubusercontent.com/u/7?v=4',
    },
});

function utcDeadlineFillValue() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 16);
}

test.describe('assignment invitation journey', () => {
    /**
     * Signs in as the instructor, creates a program with a one-student roster,
     * and returns the assignment page URL after creating the assignment.
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<string>}
     */
    async function createProgramAndAssignment(page) {
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();

        await page.getByRole('link', { name: 'Create program' }).click();
        await page.getByLabel('Program name').fill('Invite Program');
        await page.getByLabel('GitHub organization').fill(ORG);
        await page.getByLabel('Or paste student names').fill('Jane Doe');
        await page.getByRole('button', { name: 'Create program' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Invite Program' })).toBeVisible();

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

    test('redirects an unauthenticated visitor to sign-in and back to the invite', async ({
        page,
    }) => {
        await createProgramAndAssignment(page);
        const invite = await inviteUrlOf(page);

        await page.goto('/');
        await page.getByRole('button', { name: 'Sign out' }).click();
        await page.goto(invite);
        await expect(page.getByRole('heading', { level: 1, name: ASSIGNMENT_NAME })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Jane Doe' })).toBeVisible();
    });

    test('lets the student claim a roster entry and accept the assignment', async ({ page }) => {
        await createProgramAndAssignment(page);
        const invite = await inviteUrlOf(page);

        // Sign in as the student directly on the invite link; the fake OAuth
        // server auto-grants the authorized user and returns to the invite.
        await page.goto('/');
        await page.getByRole('button', { name: 'Sign out' }).click();
        await fakeGithub('authorizeAs', { token: STUDENT_TOKEN });
        await page.goto(invite);
        await expect(page.getByRole('heading', { level: 1, name: ASSIGNMENT_NAME })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Jane Doe' })).toBeVisible();

        await page.getByRole('button', { name: 'Jane Doe' }).click();
        await page.getByRole('button', { name: 'Accept assignment' }).click();

        await expect(page.getByText('Assignment accepted!')).toBeVisible();
        await expect(page.getByRole('link', { name: REPO_NAME })).toHaveAttribute(
            'href',
            `https://github.com/${ORG}/${REPO_NAME}`,
        );
    });

    test('revisiting the invite after accepting shows the existing repo', async ({ page }) => {
        await createProgramAndAssignment(page);
        const invite = await inviteUrlOf(page);

        await page.goto('/');
        await page.getByRole('button', { name: 'Sign out' }).click();
        await fakeGithub('authorizeAs', { token: STUDENT_TOKEN });
        await page.goto(invite);
        await expect(page.getByRole('heading', { level: 1, name: ASSIGNMENT_NAME })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Jane Doe' })).toBeVisible();

        await page.getByRole('button', { name: 'Jane Doe' }).click();
        await page.getByRole('button', { name: 'Accept assignment' }).click();
        await expect(page.getByText('Assignment accepted!')).toBeVisible();

        await page.goto(invite);
        await expect(page.getByText('You have already accepted this assignment.')).toBeVisible();
        await expect(page.getByRole('link', { name: REPO_NAME })).toHaveAttribute(
            'href',
            `https://github.com/${ORG}/${REPO_NAME}`,
        );
    });

    test('shows accepted student details on the instructor dashboard', async ({ page }) => {
        const assignmentUrl = await createProgramAndAssignment(page);
        const invite = await inviteUrlOf(page);

        await page.goto('/');
        await page.getByRole('button', { name: 'Sign out' }).click();
        await fakeGithub('authorizeAs', { token: STUDENT_TOKEN });
        await page.goto(invite);
        await page.getByRole('button', { name: 'Jane Doe' }).click();
        await page.getByRole('button', { name: 'Accept assignment' }).click();
        await expect(page.getByText('Assignment accepted!')).toBeVisible();

        await page.goto('/');
        await page.getByRole('button', { name: 'Sign out' }).click();
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();

        await page.goto(assignmentUrl);
        await expect(page.getByText('Jane Doe')).toBeVisible();
        await expect(page.getByRole('link', { name: '@student-cat' })).toHaveAttribute(
            'href',
            'https://github.com/student-cat',
        );
        await expect(page.getByAltText("student-cat's avatar")).toBeVisible();
        await expect(page.getByRole('link', { name: 'See repository' })).toHaveAttribute(
            'href',
            `https://github.com/${ORG}/${REPO_NAME}`,
        );
    });
});
