/**
 * SKAI-1033: a sign-in form submitted before hydration (here: JavaScript
 * disabled, the extreme case) must never serialize the email or password into
 * a URL — not in the request line, the final address, or history.
 */
import { test, expect } from "@playwright/test";

import { disconnectDb } from "../support/db";
import { HANDOFF_PASSWORD, makeHandoffSchool, makeHandoffUser, removeHandoffData, sessionToken, type HandoffAccount } from "../support/handoff";

const PREFIX = "skai1033-";
let account: HandoffAccount;

test.describe("pre-hydration sign-in submission", () => {
  test.beforeAll(async () => {
    account = await makeHandoffUser(PREFIX, await makeHandoffSchool(PREFIX, "beta"), "beta-accountant", "ACCOUNTANT");
  });

  test.afterAll(async () => {
    await removeHandoffData(PREFIX);
    await disconnectDb();
  });

  test("a native submission never puts credentials in the URL", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    const seen: string[] = [];
    page.on("request", (r) => seen.push(r.url()));
    await page.goto("/login");
    await expect(page.locator("form")).toHaveAttribute("method", "post");
    // The server-rendered button is disabled, so a press does nothing; a native
    // submission (implicit Enter, a stale bundle) is the path that used to leak.
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await page.locator("form").evaluate((form: HTMLFormElement, [email, password]) => {
      (form.querySelector("#email") as HTMLInputElement).value = email;
      (form.querySelector("#password") as HTMLInputElement).value = password;
      HTMLFormElement.prototype.submit.call(form);
    }, [account.email, HANDOFF_PASSWORD]);
    await page.waitForURL(/\/login/, { waitUntil: "domcontentloaded" });
    for (const url of [...seen, page.url()]) {
      expect(url).not.toContain("password=");
      expect(url).not.toContain(encodeURIComponent(HANDOFF_PASSWORD));
      expect(url).not.toContain(encodeURIComponent(account.email));
    }
    // The fallback never signs anyone in.
    expect(await sessionToken(page)).toBeFalsy();
    await context.close();
  });
});
