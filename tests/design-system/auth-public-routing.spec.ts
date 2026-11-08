import { test, expect } from '@playwright/test';

const aliases = [
  ['/register-split', '/register'], ['/sign-up', '/register'], ['/sign-up/example', '/register'],
  ['/sign-in', '/login'], ['/sign-in/example', '/login'],
] as const;
for (const [alias, destination] of aliases) {
  test(`signed-out ${alias} reaches its existing public destination`, async ({ page }) => {
    await page.goto(alias);
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect(page.getByRole('main')).toBeVisible();
  });
}

test('verification feedback is reachable without opening protected paths', async ({ page }) => {
  const feedback = await page.request.get('/verify-success', { maxRedirects: 0 });
  expect(feedback.status()).toBe(200);
  expect(await feedback.text()).toContain('Continue to Login');
  for (const protectedPath of ['/verify-success-private', '/sign-internal', '/dashboard', '/first-login']) {
    const response = await page.request.get(protectedPath, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = new URL(response.headers().location, response.url());
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('redirect')).toBe(protectedPath);
  }
  const protectedApi = await page.request.get('/api/auth/first-password', { maxRedirects: 0 });
  expect(protectedApi.status()).toBe(401);
  // Never request /api/auth/verify: its signed-token GET mutates activation state.
});

test('public entry announces loading and forwards to sign in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText(/Loading Skoolee AI|Opening sign in/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
});
