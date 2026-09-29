import { expect, test } from '@playwright/test';

import { fakeGithub } from './fake-github/client';

// The Playwright fake GitHub server signs every OAuth exchange in as its
// default user, whose access token is this fixed fixture value.
const DEFAULT_FAKE_TOKEN = 'fake-default-access-token';

// Seeded once at module load; the fake GitHub server is already up
// (playwright webServer) and every OAuth session carries DEFAULT_FAKE_TOKEN.
const ORG_FIXTURES = [['e2e-assign-org', ['dtp2627a-0']]];

for (const [org, repos] of ORG_FIXTURES) {
    await fakeGithub('registerMembership', {
        token: DEFAULT_FAKE_TOKEN,
        org,
        state: 'active',
        role: 'admin',
    });
    for (const repo of repos)
        await fakeGithub('registerRepo', { token: DEFAULT_FAKE_TOKEN, org, repo });
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
    await page.getByRole('button', { name: 'Create program' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Deadline one day ahead, in the two representations the feature deals in:
 * the `datetime-local` fill value and the UTC display string the dashboard renders.
 * @returns {{fillValue: string, display: string}}
 */
function utcDeadlineParts() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
    });
    return { fillValue: tomorrow.toISOString().slice(0, 16), display: formatter.format(tomorrow) };
}

/** Fills the create-assignment form with a deadline one day ahead in UTC wall clock.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {string} [templateRepo]
 * @returns {Promise<void>}
 */
async function fillAssignmentForm(page, name, templateRepo = 'dtp2627a-0') {
    const { fillValue } = utcDeadlineParts();

    await page.getByRole('textbox', { name: 'Assignment Name' }).fill(name);
    await page.getByRole('textbox', { name: 'Deadline' }).fill(fillValue);
    await page.getByRole('textbox', { name: 'Repository Template' }).fill(templateRepo);
    await page.getByRole('button', { name: 'Create Assignment' }).click();
}

/** Shows the create-assignment form and returns the assignment URL after submit.
 * @param {import('@playwright/test').Page} page
 * @param {string} assignmentName
 * @returns {Promise<void>}
 */
async function createAssignment(page, assignmentName) {
    await fillAssignmentForm(page, assignmentName);
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]{36}$/u);
}

test.describe('invalid access', () => {
    const sampleId = '00000000-1111-2222-3333-444444444444';

    test('rejects access from a user not logged in', async ({ page }) => {
        await page.goto(`/assignments/${sampleId}`);
        await expect(page).not.toHaveURL(`/assignments/${sampleId}`);
    });

    test('rejects an invalid assignment id', async ({ page }) => {
        // Log in
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();

        const response = await page.goto('/assignments/invalid-id');
        expect(response?.status()).toBe(404);
    });
});

test.describe('assignment creation journey', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();
    });

    test('creates an assignment from a seeded organization template', async ({ page }) => {
        const programName = 'test program';
        const org = 'e2e-assign-org';
        await createProgram(page, { name: programName, org });

        const name = 'Test Assignment';
        await fillAssignmentForm(page, name);

        // Redirected to assignments page
        await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]{36}$/u);

        // Assignment dashboard is visible
        await expect(page.getByRole('heading', { name })).toBeVisible();
        await expect(page.getByText(`GitHub organization: ${org}`)).toBeVisible();
        await expect(
            page.getByText(`Deadline: ${utcDeadlineParts().display}`, { exact: true }),
        ).toBeVisible();
        await expect(page.getByText(/Invite link: \/invite\//u)).toBeVisible();
        await expect(page.getByText('Template repo: dtp2627a-0 ')).toBeVisible();
    });

    test('lists the assignment on the program dashboard after creation', async ({ page }) => {
        const programName = 'listing program';
        await createProgram(page, { name: programName, org: 'e2e-assign-org' });

        await createAssignment(page, 'Listed Assignment');

        await page.getByRole('link', { name: `← Back to ${programName}` }).click();
        await expect(page.getByRole('heading', { level: 1, name: programName })).toBeVisible();
        await expect(page.getByRole('link', { name: ' Listed Assignment' })).toBeVisible();
    });

    test('links the template repository to its GitHub page', async ({ page }) => {
        await createProgram(page, { name: 'template link program', org: 'e2e-assign-org' });

        await createAssignment(page, 'Template Link Assignment');

        await expect(page.getByRole('link', { name: 'dtp2627a-0' })).toHaveAttribute(
            'href',
            'https://github.com/e2e-assign-org/dtp2627a-0',
        );
    });

    test('rejects a foreign instructor viewing another instructor’s assignment', async ({
        page,
    }) => {
        await createProgram(page, { name: 'cross program', org: 'e2e-assign-org' });
        await createAssignment(page, 'Shared Assignment');
        const assignmentUrl = page.url();

        // Sign out and sign back in as a different GitHub user
        await page.goto('/');
        await page.getByRole('button', { name: 'Sign out' }).click();
        await fakeGithub('registerUser', {
            token: 'second-user-token',
            user: {
                id: 2,
                login: 'second-cat',
                avatar_url: 'https://avatars.githubusercontent.com/u/2?v=4',
            },
        });
        await fakeGithub('authorizeAs', { token: 'second-user-token' });
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as second-cat')).toBeVisible();

        const response = await page.goto(assignmentUrl);
        expect(response?.status()).toBe(404);
    });

    test('requires a template repository before submitting', async ({ page }) => {
        await createProgram(page, { name: 'no template program', org: 'e2e-assign-org' });

        const { fillValue } = utcDeadlineParts();
        await page.getByRole('textbox', { name: 'Assignment Name' }).fill('No Template Assignment');
        await page.getByRole('textbox', { name: 'Deadline' }).fill(fillValue);
        await page.getByRole('button', { name: 'Create Assignment' }).click();

        const templateInput = page.getByRole('textbox', { name: 'Repository Template' });
        expect(
            await templateInput.evaluate((element) =>
                /** @type {HTMLInputElement} */ (element).checkValidity(),
            ),
        ).toBe(false);
        await expect(page).toHaveURL(/\/programs\/[0-9a-f-]{36}$/u);
    });

    test('rejects a template repository that is not in the organization', async ({ page }) => {
        await createProgram(page, { name: 'foreign template program', org: 'e2e-assign-org' });

        await fillAssignmentForm(page, 'Foreign Template Assignment', 'foreign-repo');

        await expect(page.getByText('Check the highlighted fields.')).toBeVisible();
        await expect(
            page.getByText(
                'templateRepo: Repository template must be a repository in the program organization.',
            ),
        ).toBeVisible();
    });
});
