/**
 * Throwaway schools and accounts for the sign-in hand-off browser specs
 * (SKAI-1021, SKAI-1033, SKAI-1063). Each spec passes its own prefix and
 * removes everything it created in afterAll, so none of them depends on the
 * t1 fixture tenant.
 */
import { expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";

import { db } from "./db";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/session-cookie";

export const HANDOFF_PASSWORD = "HandoffSuite#2026";
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export type HandoffAccount = { email: string; schoolId: string };

export async function makeHandoffSchool(prefix: string, label: string): Promise<string> {
  const school = await db().school.create({
    data: {
      name: `Handoff ${label} ${RUN}`, slug: `${prefix}${label}-${RUN}`, city: "Lahore", regId: `${prefix}${label}-${RUN}`.toUpperCase(),
      contactEmail: `${prefix}${label}-${RUN}@example.invalid`, plan: "PRO", status: "ACTIVE",
    },
    select: { id: true },
  });
  return school.id;
}

export async function makeHandoffUser(prefix: string, schoolId: string, label: string, role: string): Promise<HandoffAccount> {
  const email = `${prefix}${label}-${RUN}@example.invalid`;
  await db().user.create({
    data: {
      email, fullName: `Handoff ${label}`, password: await bcrypt.hash(HANDOFF_PASSWORD, 10), role: role as never, schoolId,
      // Onboarded and past the welcome guide, so the console is usable straight away.
      isActive: true, onboardingComplete: true, welcomeCompletedAt: new Date(),
    },
  });
  return { email, schoolId };
}

export async function removeHandoffData(prefix: string): Promise<void> {
  const schools = await db().school.findMany({ where: { slug: { startsWith: prefix } }, select: { id: true } });
  const schoolIds = schools.map((s) => s.id);
  await db().loginSession.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await db().user.deleteMany({ where: { schoolId: { in: schoolIds } } });
  await db().school.deleteMany({ where: { id: { in: schoolIds } } }).catch(() => undefined);
}

export async function sessionToken(page: Page): Promise<string | undefined> {
  return (await page.context().cookies()).find((c) => c.name === SESSION_COOKIE_NAME)?.value;
}

export async function submitLogin(page: Page, account: HandoffAccount): Promise<void> {
  await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 30_000 });
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(HANDOFF_PASSWORD);
  await page.locator('button[type="submit"]').click();
}
