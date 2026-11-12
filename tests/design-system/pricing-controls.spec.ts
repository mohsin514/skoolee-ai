import { test, expect } from '@playwright/test';

const locales = {
  en: { title: 'Free for every school. Pay only for the flagship.', country: 'Institution country', language: 'Language', monthly: 'Monthly', annual: 'Annual', pro: 'Plus', trial: 'Create free account' },
  ar: { title: 'مجاني لكل مدرسة. ادفع فقط مقابل الميزات الرائدة.', country: 'بلد المؤسسة', language: 'اللغة', monthly: 'شهريًا', annual: 'سنويًا', pro: 'بلس', trial: 'إنشاء حساب مجاني' },
  ur: { title: 'ہر اسکول کے لیے مفت۔ صرف فلیگ شپ سہولتوں کی ادائیگی۔', country: 'ادارے کا ملک', language: 'زبان', monthly: 'ماہانہ', annual: 'سالانہ', pro: 'پلس', trial: 'مفت اکاؤنٹ بنائیں' },
};

for (const language of ['en', 'ar', 'ur'] as const) {
  test(`pricing shared controls preserve published terms in ${language}`, async ({ page }) => {
    // No server mutation or mail client invocation is needed for this public page.
    await page.route('**/api/**', route => route.abort());
    await page.goto('/pricing');
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption(language);
    const t = locales[language];
    await expect(page.getByRole('heading', { name: t.title, exact: true })).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('dir', language === 'en' ? 'ltr' : 'rtl');
    const country = page.getByRole('combobox', { name: t.country, exact: true });
    await expect(country).toHaveClass(/sk-select/);
    // The chevron points down in either writing direction; only its placement mirrors.
    if (await page.evaluate(() => CSS.supports('appearance', 'base-select'))) {
      const icon = await country.evaluate(el => {
        const style = getComputedStyle(el, '::picker-icon');
        return { right: style.borderRightWidth, left: style.borderLeftWidth, rotate: style.rotate };
      });
      expect(icon).toEqual({ right: '2px', left: '0px', rotate: '45deg' });
    }
    await country.selectOption('SA');
    await expect(page.getByText(/SAR/)).toBeVisible();
    const pro = page.getByRole('article').filter({ has: page.getByRole('heading', { name: t.pro, exact: true }) });
    await expect(pro).toContainText('PKR 15');
    const annual = page.getByRole('button', { name: new RegExp(t.annual) });
    await annual.focus();
    await page.keyboard.press('Enter');
    await expect(annual).toHaveAttribute('aria-pressed', 'true');
    // Per student: PKR 12 a month when paid yearly, PKR 144 a year.
    await expect(pro).toContainText('PKR 12');
    await expect(pro).toContainText('PKR 144');
    await expect(page.getByRole('button', { name: t.monthly, exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('link', { name: t.trial, exact: true })).toHaveAttribute('href', '/register');
    await expect(pro.getByRole('link')).toHaveAttribute('href', /^mailto:.*subject=Pricing%20enquiry/);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const control of [country, annual]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: `test-results/design-system/evidence/pricing/${language}-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: t.monthly, exact: true }).click();
    await expect(pro).toContainText('PKR 15');
  });
}
