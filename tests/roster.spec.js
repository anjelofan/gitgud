import { expect, test } from '@playwright/test';

import { fakeGithub } from './fake-github/client';

const DEFAULT_FAKE_TOKEN = 'fake-default-access-token';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string; org: string; rosterText?: string }} program
 */
async function createProgram(page, program) {
    await fakeGithub('registerMembership', {
        token: DEFAULT_FAKE_TOKEN,
        org: program.org,
        state: 'active',
        role: 'admin',
    });

    await page.getByRole('link', { name: 'Create program' }).click();
    await page.getByLabel('Program name').fill(program.name);
    await page.getByLabel('GitHub organization').fill(program.org);
    if (typeof program.rosterText === 'string')
        await page.getByLabel('Or paste student names').fill(program.rosterText);
    await page.getByRole('button', { name: 'Create program' }).click();
    await expect(page.getByRole('heading', { level: 1, name: program.name })).toBeVisible();
}

test.describe('program roster editing', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByText('Signed in as octocat')).toBeVisible();
    });

    test('adds one student from the program dashboard', async ({ page }) => {
        await createProgram(page, {
            name: 'Add One',
            org: `e2e-add-one-${crypto.randomUUID().slice(0, 8)}`,
        });

        await page.getByLabel('Add student').fill('Grace Hopper');
        await page.getByRole('button', { name: 'Add student' }).click();
        await expect(page.getByRole('textbox', { name: 'Name for Grace Hopper' })).toHaveValue(
            'Grace Hopper',
        );
    });

    test('adds a pasted student batch from the program dashboard', async ({ page }) => {
        await createProgram(page, {
            name: 'Paste Batch',
            org: `e2e-paste-batch-${crypto.randomUUID().slice(0, 8)}`,
        });

        await page.getByLabel('Or paste student names').fill('Alan Turing\nAda Lovelace\n');
        await page.getByRole('button', { name: 'Add batch' }).click();

        const nameInputs = page.locator('ul li input[name="name"]');
        await expect(nameInputs).toHaveCount(2);
        await expect(nameInputs.nth(0)).toHaveValue('Ada Lovelace');
        await expect(nameInputs.nth(1)).toHaveValue('Alan Turing');
    });

    test('adds a CSV student batch from the program dashboard', async ({ page }) => {
        await createProgram(page, {
            name: 'CSV Batch',
            org: `e2e-csv-batch-${crypto.randomUUID().slice(0, 8)}`,
        });

        await page.getByLabel('Upload roster CSV').setInputFiles({
            name: 'roster.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('Grace Hopper,grace@example.com\nAda Lovelace,ada@example.com\n'),
        });
        await page.getByRole('button', { name: 'Add batch' }).click();

        const nameInputs = page.locator('ul li input[name="name"]');
        await expect(nameInputs).toHaveCount(2);
        await expect(nameInputs.nth(0)).toHaveValue('Ada Lovelace');
        await expect(nameInputs.nth(1)).toHaveValue('Grace Hopper');
    });

    test('renames a student on the program dashboard', async ({ page }) => {
        await createProgram(page, {
            name: 'Rename Student',
            org: `e2e-rename-${crypto.randomUUID().slice(0, 8)}`,
            rosterText: 'Grace Hopper\n',
        });

        const graceRow = page.getByRole('listitem').filter({ hasText: 'Grace Hopper' });
        await graceRow.getByRole('textbox').fill('Rear Admiral Hopper');
        await graceRow.getByRole('button', { name: 'Rename' }).click();
        await expect(
            page.getByRole('textbox', { name: 'Name for Rear Admiral Hopper' }),
        ).toHaveValue('Rear Admiral Hopper');
    });

    test('removes one student from the program dashboard', async ({ page }) => {
        await createProgram(page, {
            name: 'Remove One',
            org: `e2e-remove-one-${crypto.randomUUID().slice(0, 8)}`,
            rosterText: 'Ada Lovelace\nAlan Turing\n',
        });

        const alanRow = page.getByRole('listitem').filter({ hasText: 'Alan Turing' });
        await alanRow.getByRole('button', { name: 'Remove' }).click();
        await expect(page.getByRole('textbox', { name: 'Name for Ada Lovelace' })).toHaveValue(
            'Ada Lovelace',
        );
        await expect(page.getByRole('textbox', { name: 'Name for Alan Turing' })).toHaveCount(0);
    });

    test('removes selected students from the program dashboard', async ({ page }) => {
        await createProgram(page, {
            name: 'Remove Selected',
            org: `e2e-remove-selected-${crypto.randomUUID().slice(0, 8)}`,
            rosterText: 'Ada Lovelace\nGrace Hopper\n',
        });

        await page.getByRole('checkbox', { name: 'Select Ada Lovelace for removal' }).check();
        await page.getByRole('checkbox', { name: 'Select Grace Hopper for removal' }).check();
        await page.getByRole('button', { name: 'Remove selected' }).click();
        await expect(page.getByText('No students in this program yet.')).toBeVisible();
    });
});
