import "server-only";

import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { dashboardPathForRole } from "@/lib/roles";
import { needsInstitutionSetup } from "./setup-routing";

export interface ShowcaseEntry {
  mode: "register" | "signIn" | "onboarding" | "workspace";
  href: string;
}

/** A routing hint for the current account, never an authorization grant or setup write. */
export async function resolveShowcaseEntry(): Promise<ShowcaseEntry> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return { mode: "register", href: "/register" };
  const user = await getAuthUser();
  if (!user) return { mode: "signIn", href: "/login" };

  const account = await runUnscoped("showcase: resolve only the authenticated account's next step", () => prisma.user.findFirst({
    where: { id: user.userId, schoolId: user.schoolId, isActive: true },
    select: { mustChangePassword: true, onboardingComplete: true, welcomeCompletedAt: true },
  }));
  if (!account) return { mode: "signIn", href: "/login" };
  if (account.mustChangePassword) return { mode: "onboarding", href: "/first-login" };
  if (user.schoolStatus === "SUSPENDED" && user.role !== "APP_OWNER") return { mode: "workspace", href: "/subscription-suspended" };
  if (!account.onboardingComplete) {
    if (user.role === "TEACHER") return { mode: "onboarding", href: "/teacher-onboarding" };
    if (await needsInstitutionSetup(user.userId, user.schoolId)) return { mode: "onboarding", href: "/onboarding" };
  }
  // A plain role landing route lets the personal first-run guide open when it
  // has not been acknowledged. Do not send existing accounts through signup.
  return { mode: account.welcomeCompletedAt ? "workspace" : "onboarding", href: dashboardPathForRole(user.role) };
}
