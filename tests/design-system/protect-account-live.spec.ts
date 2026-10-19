import { test, expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";

// Real /protect-account page from the running app (TEST_BASE_URL or :3005).
// /api/auth/mfa is always answered by page.route, so no MFA state is read or written.
const FOCUS = "rgb(185, 160, 220)";
const HALO = "rgb(185, 160, 220) 0px 0px 0px 2px inset, rgba(129, 39, 207, 0.18) 0px 4px 14px -4px";
const SHOTS = path.join(process.cwd(), ".agents/tasks/protect-account-mfa/screenshots");
const enrolled = { enrolled: true, school: "Synthetic School", awaitingAcknowledgement: false, resumeChallenge: false };
const unenrolled = { ...enrolled, enrolled: false };
const secret = "SYNTHETICSECRETNOTAREALKEY000000";
const uri = `otpauth://totp/Skoolee:example%40synthetic.invalid?secret=${secret}&issuer=Skoolee`;
const codes = Array.from({ length: 10 }, (_, index) => `${String(index).repeat(4)}-AAAA-${String(index).repeat(4)}-BBBB-CCCC`);
type Reply = { status?: number; body: unknown };

async function mockMfa(page: Page, status: Reply, actions: Reply[] = []) {
  const posts: unknown[] = [];
  await page.route("**/api/auth/mfa", async route => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ status: status.status ?? 200, json: status.body });
    posts.push(request.postDataJSON());
    const reply = actions.shift();
    if (!reply) return route.abort();
    return route.fulfill({ status: reply.status ?? 200, json: reply.body });
  });
  return posts;
}
async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 360 ? 800 : width === 768 ? 1024 : 1000 });
  await page.goto("/protect-account");
}
function paint(field: Locator, target: "self" | "group") {
  return field.evaluate((node, target) => {
    const el = target === "group" ? node.closest(".sk-input-group")! : node;
    const s = getComputedStyle(el);
    return { border: s.borderTopColor, shadow: s.boxShadow, outline: s.outlineStyle };
  }, target);
}
async function expectSharedFocus(page: Page) {
  const field = page.locator("#mfa-code");
  await field.focus();
  await expect.poll(() => paint(field, "group")).toEqual({ border: FOCUS, shadow: HALO, outline: "none" });
  await expect.poll(() => paint(field, "self")).toMatchObject({ shadow: "none", outline: "none" });
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

for (const width of [1440, 360]) {
  test(`live setup shows a framed QR and the shared focus ring at ${width}px`, async ({ page }) => {
    const posts = await mockMfa(page, { body: unenrolled }, [{ body: { secret, uri } }, { body: { recoveryCodes: codes } }]);
    await open(page, width);
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    await expect(page.getByRole("img", { name: "QR code to add Skoolee to your authenticator app" })).toHaveAttribute("src", /^data:image\/png/);
    await expectSharedFocus(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    await shot(page, `setup-qr-${width}`);
    await page.locator("#mfa-code").fill("000000");
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect(page.getByRole("list", { name: "Recovery codes" }).locator("li")).toHaveCount(10);
    await expect(page.getByRole("button", { name: "Enter workspace" })).toBeDisabled();
    expect(await noHorizontalScroll(page)).toBe(true);
    await shot(page, `recovery-codes-${width}`);
    expect(posts).toEqual([
      { action: "setup", code: "", recovery: false, acknowledged: false },
      { action: "verify-setup", code: "000000", recovery: false, acknowledged: false },
    ]);
  });
}

test("live verify error keeps the value, links the message and focuses the field at 768px", async ({ page }) => {
  await mockMfa(page, { body: unenrolled }, [{ body: { secret, uri } }, { status: 400, body: { error: "server text", reason: "invalid_code" } }]);
  await open(page, 768);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await page.locator("#mfa-code").fill("111111");
  await page.locator("#mfa-code").press("Enter");
  await expect(page.locator("#mfa-code-error")).toHaveText("That code didn't match. Enter the current 6-digit code from your authenticator app.");
  await expect(page.locator("#mfa-code")).toBeFocused();
  await expect(page.locator("#mfa-code")).toHaveAttribute("aria-describedby", /mfa-code-error/);
  await expect(page.locator("#mfa-code")).toHaveValue("111111");
  await shot(page, "verify-error-768");
});

for (const width of [1440, 768]) {
  test(`live challenge uses the shared focus ring at ${width}px`, async ({ page }) => {
    await mockMfa(page, { body: enrolled });
    await open(page, width);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Verify it's you");
    await expect(page.getByRole("button", { name: "Authenticator code" })).toHaveAttribute("aria-pressed", "true");
    await expectSharedFocus(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    await shot(page, `challenge-${width}`);
  });
}

test("live recovery toggle at 360px sends recovery:true", async ({ page }) => {
  const posts = await mockMfa(page, { body: enrolled }, [{ status: 400, body: { error: "server text", reason: "recovery_invalid" } }]);
  await open(page, 360);
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await expect(page.getByRole("button", { name: "Use a recovery code" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#mfa-code")).toBeFocused();
  await page.locator("#mfa-code").fill(codes[0]);
  await page.locator("#mfa-code").press("Enter");
  await expect(page.locator("#mfa-code-error")).toContainText("recovery code isn't recognised");
  expect(await noHorizontalScroll(page)).toBe(true);
  // A full recovery code must be readable without scrolling inside the field.
  expect(await page.locator("#mfa-code").evaluate((input: HTMLInputElement) => input.scrollWidth <= input.clientWidth)).toBe(true);
  await shot(page, "recovery-toggle-360");
  expect(posts).toEqual([{ action: "challenge", code: codes[0], recovery: true, acknowledged: false }]);
});

test("live Arabic challenge is right-to-left with an LTR code field at 1440px", async ({ page }) => {
  await mockMfa(page, { body: enrolled });
  await open(page, 1440);
  await page.getByRole("combobox", { name: "Language" }).selectOption("ar");
  await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("تأكيد هويتك");
  await expect(page.locator("#mfa-code")).toHaveAttribute("dir", "ltr");
  await expectSharedFocus(page);
  expect(await noHorizontalScroll(page)).toBe(true);
  await shot(page, "challenge-ar-rtl-1440");
});

test("live Arabic setup is right-to-left at 360px", async ({ page }) => {
  await mockMfa(page, { body: unenrolled }, [{ body: { secret, uri } }]);
  await open(page, 360);
  await page.getByRole("combobox").selectOption("ar");
  await page.getByRole("button", { name: "إعداد تطبيق المصادقة" }).click();
  await expect(page.getByRole("img", { name: "رمز QR لإضافة Skoolee إلى تطبيق المصادقة" })).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  expect(await noHorizontalScroll(page)).toBe(true);
  await shot(page, "setup-qr-ar-rtl-360");
});
