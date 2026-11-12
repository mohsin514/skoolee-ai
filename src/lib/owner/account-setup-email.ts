import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { appUrl } from "@/lib/app-url";
import { sendEmailMessage } from "@/lib/email";
import { emailProviderReadiness } from "@/lib/email/readiness";

/** SKAI-1801: how the account-setup email went, reported back to the owner console. */
export type AccountSetupDelivery = "sent" | "failed" | "disabled";

/** Setup links outlive a forgot-password link (1 h): a new staff member may open the email a day later. */
export const ACCOUNT_SETUP_TTL_MS = 72 * 3600_000;

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export function accountSetupEmailText(input: { fullName: string; schoolName: string; roleLabel: string; actionUrl: string; loginUrl: string }) {
  return [
    `Hello ${input.fullName},`,
    `A SkooleeAI account was created for you at ${input.schoolName} (${input.roleLabel}).`,
    `Set your own password here (the link works once and expires in 72 hours): ${input.actionUrl}`,
    `Then sign in at ${input.loginUrl}`,
    "If you were not expecting this, you can ignore this email.",
  ].join("\n\n");
}

/**
 * SKAI-1801: owner-created accounts (Tenant users "Add user" and school provisioning) were never emailed.
 * Issues a single-use set-password link on the existing password-reset table (only the SHA-256 digest is
 * stored) and emails it. The temporary password is never put in the email. A delivery failure never undoes
 * the account: the owner still has the one-time credentials, and the token is removed so no dead link lingers.
 */
export async function sendAccountSetupEmail(user: { id: string; email: string; fullName: string; schoolName: string; roleLabel: string }): Promise<AccountSetupDelivery> {
  const readiness = emailProviderReadiness();
  if (readiness.mode === "disabled") return "disabled";
  const token = randomBytes(32).toString("base64url");
  const base = appUrl().replace(/\/$/, "");
  try {
    await runUnscoped("issue account-setup link for an owner-created user", () =>
      prisma.passwordReset.create({ data: { email: user.email, userId: user.id, token: digest(token), expiresAt: new Date(Date.now() + ACCOUNT_SETUP_TTL_MS) } }),
    );
    const result = await sendEmailMessage({
      to: user.email,
      subject: `Your SkooleeAI account at ${user.schoolName}`,
      text: accountSetupEmailText({ ...user, actionUrl: `${base}/forgot-password?token=${token}`, loginUrl: `${base}/login` }),
    });
    if (result.success) return "sent";
    if (readiness.mode === "development") return "disabled";
  } catch {
    // fall through to cleanup
  }
  await runUnscoped("drop undelivered account-setup link", () => prisma.passwordReset.deleteMany({ where: { token: digest(token) } })).catch(() => {});
  return "failed";
}
