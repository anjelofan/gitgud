import { expect, test } from '@playwright/test';

import { fakeGithub } from './fake-github/client';

// The Playwright fake GitHub server signs every OAuth exchange in as its
// default user, whose access token is this fixed fixture value.
const DEFAULT_FAKE_TOKEN = 'fake-default-access-token';

// Seeded once at module load; the fake GitHub server is already up
// (playwright webServer) and every OAuth session carries DEFAULT_FAKE_TOKEN.
const ORG_FIXTURES = [
    ['e2e-assign-org', ['dtp2627a-0']],
    ['e2e-assign-empty-org', []],
    ['e2e-assign-invalid-org', ['dtp2627a-0']],
];

for (const [org, repos] of ORG_FIXTURES) {
    await fakeGithub('registerMembership', {
        token: DEFAULT_FAKE_TOKEN,
        org,
        state: 'active',
        role: 'admin',
    });
    await fakeGithub('registerRepos', { token: DEFAULT_FAKE_TOKEN, org, repos });
}


/** Creates a program each test
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {string} options.name 
 * @param {string} options.org
 * @returns {Promise<void>}
 */
async function createProgram(page, { name, org }) {
    await page.getByRole('link', { name: 'Create program' }).click();
    await page.getByLabel('Program name').fill(name);
    await page.getByLabel('GitHub organization').fill(org);
    await page.getByLabel('Upload roster CSV').setInputFiles({
            name: 'roster.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('Grace Hopper,grace@example.com\nAda Lovelace,ada@example.com\n'),
        });
    await page.getByRole('button', { name: 'Create program' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test.describe('assignment creation journey', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();
    });

    test('creates an assignment from a seeded organization template', async ({ page }) => {
        const programName = 'test program';
        const org = 'e2e-assign-org'
        await createProgram(page, { name: programName, org: org });

        const name = 'Test Assignment'
        // Fill form
        await page.getByRole('textbox', { name: 'Assignment Name' }).fill(name);
        await page.getByRole('textbox', { name: 'Deadline' }).fill('2026-09-15T03:47');
        await page.getByRole('button', { name: 'Create Assignment' }).click();

        // Redirected to assignments page
        await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]{36}$/u);

        // Assignment dashboard is visible
        await expect(page.getByRole('heading', { name: name })).toBeVisible();
        await expect(page.getByText(`GitHub organization: ${org}`)).toBeVisible();
        await expect(page.getByText('Deadline: September 15, 2026 at 3:47 AM')).toBeVisible();
        await expect(page.getByText(/Invite link: \/invite\//u)).toBeVisible();
        await expect(page.getByText('Template repo: dtp2627a-0 ')).toBeVisible();
    });

    test('shows no template options when the organization has no repositories', async ({
        page,
    }) => {
        const programName = 'Empty Repos';
        await createProgram(page, { name: programName, org: 'e2e-assign-empty-org' });

        await expect(page.getByText('No available repositories in organization')).toBeVisible();
    });

    test('rejects an assignment with a blank name', async ({ page }) => {
        const programName = `Invalid Assignment`;
        await createProgram(page, { name: programName, org: 'e2e-assign-invalid-org' });

        await page.getByRole('textbox', { name: 'Assignment Name' }).fill('            ');
        await page.getByRole('textbox', { name: 'Deadline' }).fill('2026-09-15T04:11');
        await page.getByRole('button', { name: 'Create Assignment' }).click();
        await expect(page.getByText('name: Assignment name is')).toBeVisible();

        await expect(page).toHaveURL(/\/programs\/[0-9a-f-]{36}\?\/create-assignment$/u);
    });
});
