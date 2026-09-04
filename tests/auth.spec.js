import { expect, test } from '@playwright/test';

test.describe('auth flow', () => {
    test('sign-in round-trip signs the user in', async ({ page }) => {
        await page.goto('/');

        const signIn = page.getByRole('link', { name: 'Sign in with GitHub' });
        await expect(signIn).toBeVisible();
        await signIn.click();

        await expect(page.getByText('Signed in as octocat')).toBeVisible();
    });

    test('sign-out ends the session', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: 'Sign in with GitHub' }).click();
        await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

        await page.getByRole('button', { name: 'Sign out' }).click();

        await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
    });

    test('sign-out without a session redirects home', async ({ request }) => {
        const response = await request.post('/auth/sign-out', { maxRedirects: 0 });
        expect(response.status()).toBe(303);
    });
});
