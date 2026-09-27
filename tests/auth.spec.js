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

    test('surfaces a pointed error when GitHub reports a Callback URL mismatch', async ({
        page,
    }) => {
        await page.goto('/auth/callback?error=redirect_uri_mismatch');
        await expect(
            page.getByText('Sign-in failed: the GitHub App Callback URL does not match'),
        ).toBeVisible();
    });

    test('surfaces a pointed error when the authorization is denied', async ({ page }) => {
        await page.goto('/auth/callback?error=access_denied');
        await expect(
            page.getByText('Sign-in canceled: the authorization was denied.'),
        ).toBeVisible();
    });
});
