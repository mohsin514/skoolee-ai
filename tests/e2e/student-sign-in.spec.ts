/**
 * SKAI-1063: a STUDENT who signs in leaves /login for the learner portal and
 * can open /student/reports — the proxy's candidate-exam boundary must not
 * bounce a fresh learner session back to /login.
 */
import { test, expect } from "@playwright/test";

import { disconnectDb } from "../support/db";
import { makeHandoffSchool, makeHandoffUser, removeHandoffData, sessionToken, submitLogin, type HandoffAccount } from "../support/handoff";

const PREFIX = "skai1063-";
let student: HandoffAccount;

test.describe("student sign-in", () => {
  test.beforeAll(async () => {
    student = await makeHandoffUser(PREFIX, await makeHandoffSchool(PREFIX, "beta"), "beta-student", "STUDENT");
  });

  test.afterAll(async () => {
    await removeHandoffData(PREFIX);
    await disconnectDb();
  });

  test("reaches the learner portal and its reports", async ({ page }) => {
    await page.goto("/login");
    await submitLogin(page, student);
    await expect(page).toHaveURL(/\/student(\/|$|\?)/, { timeout: 30_000 });
    expect(await sessionToken(page)).toBeTruthy();
    await page.goto("/student/reports");
    await expect(page).toHaveURL(/\/student\/reports/, { timeout: 30_000 });
  });
});
