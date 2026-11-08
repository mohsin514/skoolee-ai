import { test, expect } from '@playwright/test';

for (const variant of ['default', 'outline'] as const) {
  test(`shared ${variant} link retains hover and pressed treatment`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/pricing');
    const link = variant === 'default'
      ? page.getByRole('link', { name: 'Create free account', exact: true })
      : page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Pro', exact: true }) }).getByRole('link');
    const paint = () => link.evaluate(el => {
      const s = getComputedStyle(el); return { fill: s.backgroundColor, gradient: s.backgroundImage, transform: s.transform };
    });
    const normal = await paint();
    await link.hover();
    await expect.poll(paint).not.toEqual(normal);
    const box = (await link.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => link.evaluate(el => getComputedStyle(el).scale)).toBe('0.98');
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/pricing$/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await link.hover();
    const reducedBox = (await link.boundingBox())!;
    await page.mouse.move(reducedBox.x + reducedBox.width / 2, reducedBox.y + reducedBox.height / 2);
    await page.mouse.down();
    await expect.poll(() => link.evaluate(el => getComputedStyle(el).scale)).toBe('none');
    await page.mouse.move(0, 0);
    await page.mouse.up();
  });
}

test('disabled shared action keeps its paint on hover', async ({ page }) => {
  await page.goto('/design-system');
  await page.getByLabel('Reference state').selectOption('loading');
  const button = page.getByRole('button', { name: 'Review next', exact: true });
  await expect(button).toBeDisabled();
  const paint = () => button.evaluate(el => {
    const s = getComputedStyle(el); return { fill: s.backgroundColor, gradient: s.backgroundImage, border: s.borderColor, shadow: s.boxShadow, transform: s.transform };
  });
  const before = await paint();
  await button.hover();
  await expect.poll(paint).toEqual(before);
});
