import { expect, test } from '@playwright/test';

import { fakeGithub } from './fake-github/client';

// The Playwright fake GitHub server signs every OAuth exchange in as its
// default user, whose access token is this fixed fixture value.
const DEFAULT_FAKE_TOKEN = 'fake-default-access-token';

test.describe('program creation journey', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();
    });

    test('creates a program from an uploaded CSV roster', async ({ page }) => {
        await fakeGithub('registerMembership', {
            token: DEFAULT_FAKE_TOKEN,
            org: 'e2e-csv-org',
            state: 'active',
            role: 'admin',
        });

        await page.getByRole('link', { name: 'Create program' }).click();
        await page.getByLabel('Program name').fill('Systems Programming');
        await page.getByLabel('GitHub organization').fill('e2e-csv-org');
        await page.getByLabel('Upload roster CSV').setInputFiles({
            name: 'roster.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('Grace Hopper,grace@example.com\nAda Lovelace,ada@example.com\n'),
        });
        await page.getByRole('button', { name: 'Create program' }).click();

        await expect(
            page.getByRole('heading', { level: 1, name: 'Systems Programming' }),
        ).toBeVisible();
        await expect(page.getByText('GitHub organization:')).toContainText('e2e-csv-org');
        await expect(page.getByRole('listitem')).toHaveText(['Ada Lovelace', 'Grace Hopper']);
    });

    test('creates a program from a pasted roster', async ({ page }) => {
        await fakeGithub('registerMembership', {
            token: DEFAULT_FAKE_TOKEN,
            org: 'e2e-text-org',
            state: 'active',
            role: 'admin',
        });

        await page.getByRole('link', { name: 'Create program' }).click();
        await page.getByLabel('Program name').fill('Algorithms Seminar');
        await page.getByLabel('GitHub organization').fill('e2e-text-org');
        await page.getByLabel('Or paste student names').fill('Alan Turing\nAda Lovelace\n');
        await page.getByRole('button', { name: 'Create program' }).click();

        await expect(
            page.getByRole('heading', { level: 1, name: 'Algorithms Seminar' }),
        ).toBeVisible();
        await expect(page.getByRole('listitem')).toHaveText(['Ada Lovelace', 'Alan Turing']);
    });

    test('shows the created program on the personal dashboard', async ({ page }) => {
        const uniqueName = `Journey Program ${crypto.randomUUID().slice(0, 8)}`;
        await fakeGithub('registerMembership', {
            token: DEFAULT_FAKE_TOKEN,
            org: 'e2e-list-org',
            state: 'active',
            role: 'admin',
        });

        await page.getByRole('link', { name: 'Create program' }).click();
        await page.getByLabel('Program name').fill(uniqueName);
        await page.getByLabel('GitHub organization').fill('e2e-list-org');
        await page.getByRole('button', { name: 'Create program' }).click();
        await expect(page.getByRole('heading', { level: 1, name: uniqueName })).toBeVisible();

        await page.goto('/');
        await expect(page.getByRole('link', { name: uniqueName })).toBeVisible();
    });

    test('rejects a program in an organization the instructor does not own', async ({ page }) => {
        await page.getByRole('link', { name: 'Create program' }).click();
        await page.getByLabel('Program name').fill('Hostile Takeover');
        await page.getByLabel('GitHub organization').fill('not-my-org');
        await page.getByRole('button', { name: 'Create program' }).click();

        await expect(
            page.getByText('You must be an owner of the not-my-org organization on GitHub'),
        ).toBeVisible();

        await page.goto('/');
        await expect(page.getByRole('link', { name: 'Hostile Takeover' })).toHaveCount(0);
    });

    test('rejects an organization that is not a valid GitHub login', async ({ page }) => {
        await page.getByRole('link', { name: 'Create program' }).click();
        await page.getByLabel('Program name').fill('Invalid Org');
        await page.getByLabel('GitHub organization').fill('not an org!');
        await page.getByRole('button', { name: 'Create program' }).click();

        await expect(page.getByText('Check the highlighted fields.')).toBeVisible();
        await expect(
            page.getByText('GitHub organization must be a valid organization login.'),
        ).toBeVisible();
    });
});
