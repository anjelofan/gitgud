import { expect, type Page } from '@playwright/test';

/**
 * Signs out through the dashboard and waits until the signed-out UI is visible.
 * Waiting matters: navigating away immediately after the click can cancel the
 * in-flight sign-out POST, leaving the previous session signed in.
 * @param {Page} page
 * @returns {Promise<void>}
 */
export async function signOut(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
}

/**
 * Asserts the dashboard is showing the given GitHub login, so a test that signs
 * in as a specific user fails at the sign-in that went wrong.
 * @param {Page} page
 * @param {string} login
 * @returns {Promise<void>}
 */
export async function expectSignedInAs(page: Page, login: string) {
    await page.goto('/');
    await expect(page.getByText(`Signed in as ${login}`)).toBeVisible();
}
