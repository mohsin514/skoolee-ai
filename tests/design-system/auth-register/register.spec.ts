import { test, expect, type Page } from "@playwright/test";

// All account writes are browser-intercepted synthetic replies. Unknown POSTs
// are aborted before reaching the application; no real account/email is created.
const syntheticPassword = "SyntheticOnly9!";
type RequestRecord = { path: string; data: Record<string, unknown>; fields: string[]; passwordMatches: boolean };
type Reply = { success: boolean; error?: string; warning?: string };
async function mount(page: Page, respond: (request: RequestRecord) => Reply | Promise<Reply> = () => ({ success: true })) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const requests: RequestRecord[] = [];
  await page.route("**/*", async route => {
    const request = route.request();
    if (request.method() !== "POST") { await route.continue(); return; }
    const path = new URL(request.url()).pathname;
    if (path !== "/api/auth/signup-step1" && path !== "/api/auth/signup-step2") { await route.abort(); return; }
    const payload = request.postDataJSON() as Record<string, unknown>;
    const { password, ...data } = payload;
    const record = { path, data, fields: Object.keys(payload).sort(), passwordMatches: password === syntheticPassword };
    requests.push(record);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(await respond(record)) });
  });
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "How is your school set up?" })).toBeVisible();
  return requests;
}

async function details(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create your account", exact: true })).toBeVisible();
}

async function fillValid(page: Page) {
  await page.locator("#name").fill("Synthetic Administrator");
  await page.locator("#email").fill("registration-fixture@example.test");
  await page.locator("#phone").fill("+92 300 0000000");
  await page.locator("#schoolName").fill("Synthetic Fixture School");
  await page.locator("#password").fill(syntheticPassword);
  await page.locator("#confirmPassword").fill(syntheticPassword);
  await page.getByRole("checkbox", { name: /I agree to/ }).focus();
  await page.keyboard.press("Space");
}

test("institution radio keyboard selection and Back preserve the chosen type and values", async ({ page }) => {
  const requests = await mount(page);
  const radios = page.getByRole("radiogroup", { name: "Institution type" }).getByRole("radio");
  await radios.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(radios.nth(1)).toBeChecked();
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.first()).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowDown");
  await expect(radios.first()).toBeChecked();
  await page.keyboard.press("ArrowUp");
  await expect(radios.nth(1)).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#regId")).toHaveValue(/^SC-/);
  await page.locator("#name").fill("Preserved synthetic name");
  await page.getByRole("button", { name: "Back to institution type" }).click();
  await expect(radios.nth(1)).toBeChecked();
  await details(page);
  await expect(page.locator("#name")).toHaveValue("Preserved synthetic name");
  await expect(page.getByRole("list", { name: "Registration progress" }).locator('[aria-current="step"]')).toHaveAttribute("aria-label", "Step 2 of 3: Your account");
  expect(requests).toHaveLength(0);
});

test("empty/malformed fields focus the first problem and expose shared errors and hints", async ({ page }) => {
  const requests = await mount(page);
  await details(page);
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.locator("#name")).toBeFocused();
  await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#name")).toHaveAccessibleDescription("Enter your full name");
  await page.locator("#name").fill("Synthetic name");
  await expect(page.locator("#name")).not.toHaveAttribute("aria-invalid", "true");
  await page.locator("#email").fill("invalid-address");
  await page.locator("#phone").focus();
  await expect(page.locator("#email")).toHaveAccessibleDescription("Enter a valid email address");
  await expect(page.locator("#phone")).toHaveAccessibleDescription("Used for account recovery and parent-facing contact.");
  await page.locator("#country").focus();
  await expect(page.locator("#country")).toHaveClass(/sk-select/);
  await expect(page.locator("#country")).toHaveAccessibleDescription(/Default billing currency: PKR/);
  expect(await page.locator("#country").evaluate(node => getComputedStyle(node).boxShadow)).not.toBe("none");
  expect(requests).toHaveLength(0);
});

test("reveal controls are independent and password/consent gates retain all rules", async ({ page }) => {
  const requests = await mount(page);
  await details(page);
  await fillValid(page);
  const reveal = page.getByRole("button", { name: "Show password", exact: true });
  await expect(reveal).toHaveAttribute("aria-controls", "password");
  await reveal.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#confirmPassword")).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show confirm password", exact: true }).click();
  await expect(page.locator("#confirmPassword")).toHaveAttribute("type", "text");
  await page.locator("#password").fill("short");
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.locator("#password")).toBeFocused();
  await expect(page.locator("#password")).toHaveAccessibleDescription(/Min 8 characters.*One uppercase.*One number.*Special character.*Passwords match.*Please meet all password requirements/);
  await page.locator("#password").fill(syntheticPassword);
  await page.locator("#confirmPassword").fill("Different9!");
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.locator("#confirmPassword")).toBeFocused();
  await expect(page.locator("#confirmPassword")).toHaveAccessibleDescription(/Passwords must match/);
  await page.locator("#confirmPassword").fill(syntheticPassword);
  await page.getByRole("checkbox", { name: /I agree to/ }).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /I agree to/ })).toBeFocused();
  expect(requests).toHaveLength(0);
  await expect(page.getByRole("link", { name: "Privacy Policy", exact: true })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "AI Governance policy", exact: true })).toHaveAttribute("href", "/ai-governance");
});

test("country currency and automatic/manual institution IDs preserve their behavior", async ({ page }) => {
  const requests = await mount(page);
  await details(page);
  await page.locator("#country").selectOption("AE");
  await expect(page.locator("#country")).toHaveAccessibleDescription(/Default billing currency: AED/);
  await expect(page.locator("#regId")).toHaveAttribute("readonly", "");
  await expect(page.locator("#regId")).toHaveValue(/^SKL-/);
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await expect(page.getByRole("button", { name: "Manual", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#regId")).not.toHaveAttribute("readonly");
  await expect(page.locator("#regId")).toHaveValue("");
  await page.locator("#regId").fill("manual-synthetic");
  await expect(page.locator("#regId")).toHaveValue("MANUAL-SYNTHETIC");
  await page.getByRole("button", { name: "Auto", exact: true }).click();
  await expect(page.locator("#regId")).toHaveValue(/^SKL-/);
  await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(requests).toHaveLength(0);
});

test("mocked identity and registration failures preserve entries and support retry", async ({ page }) => {
  let attempt = 0;
  const requests = await mount(page, request => {
    if (request.path.endsWith("step1")) { attempt++; return attempt === 1 ? { success: false, error: "Synthetic duplicate identity" } : { success: true }; }
    return { success: false, error: "Synthetic registration service unavailable" };
  });
  await details(page);
  await fillValid(page);
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic duplicate identity" })).toBeFocused();
  expect(requests.map(request => request.path)).toEqual(["/api/auth/signup-step1"]);
  await expect(page.locator("#email")).toHaveValue("registration-fixture@example.test");
  await expect(page.locator("#password")).toHaveValue(syntheticPassword);
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic registration service unavailable" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Create Account", exact: true })).toBeEnabled();
  await expect(page.locator("#schoolName")).toHaveValue("Synthetic Fixture School");
  await expect(page.getByRole("checkbox", { name: /I agree to/ })).toBeChecked();
  expect(requests.map(request => request.path)).toEqual(["/api/auth/signup-step1", "/api/auth/signup-step1", "/api/auth/signup-step2"]);
});

for (const institution of ["school_group", "single_campus"] as const) {
  test(`mocked ${institution} creation retains payloads, busy guard and verification step`, async ({ page }) => {
    let release: () => void = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    const requests = await mount(page, async request => {
      if (request.path.endsWith("step1")) await pending;
      return { success: true };
    });
    if (institution === "single_campus") await page.getByRole("radio", { name: /Single Campus School/ }).click();
    await details(page);
    await fillValid(page);
    await page.locator("#country").selectOption("AE");
    const regId = await page.locator("#regId").inputValue();
    await page.getByRole("button", { name: "Create Account", exact: true }).click();
    await expect(page.getByRole("button", { name: "Creating account…", exact: true })).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
    for (const id of ["name", "email", "schoolName", "country", "regId", "password", "confirmPassword", "acceptedTerms"]) {
      await expect(page.locator(`#${id}`)).toBeDisabled();
    }
    const back = page.getByRole("button", { name: "Back to institution type" });
    await expect(back).toBeDisabled();
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Manual", exact: true })).toBeDisabled();
    await back.click({ force: true });
    await expect(page.getByRole("heading", { name: "Create your account", exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    expect(requests).toHaveLength(1);
    release();
    await expect(page.getByRole("heading", { name: "Account created!" })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[0].data).toEqual({ email: "registration-fixture@example.test", registrationType: institution });
    expect(requests[1].data).toEqual({ email: "registration-fixture@example.test", fullName: "Synthetic Administrator", phone: "+92 300 0000000", schoolName: "Synthetic Fixture School", country: "AE", regId });
    expect(requests[1].passwordMatches).toBe(true);
    expect(requests[1].fields).toEqual(["country", "email", "fullName", "password", "phone", "regId", "schoolName"]);
    await expect(page.getByRole("link", { name: "Go to Login" })).toHaveAttribute("href", "/login");
    await expect(page.getByText("registration-fixture@example.test", { exact: true })).toBeVisible();
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`registration has no page overflow and adequate ID mode targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await mount(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await details(page);
    await page.getByRole("button", { name: "Create Account", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ["Auto", "Manual"]) {
      // Framer's existing step entrance temporarily scales the entire card.
      const control = page.getByRole("button", { name, exact: true });
      await expect.poll(async () => (await control.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
      await expect.poll(async () => (await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: test.info().outputPath(`register-errors-${width}.png`), fullPage: true });
  });
}
