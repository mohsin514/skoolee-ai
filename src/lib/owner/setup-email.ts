import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { sendAccountSetupEmail } from "@/lib/email";

/** SKAI-1801: how long the emailed set-password link works. */
export const SETUP_LINK_TTL_MS = 72 * 3600_000;

export type SetupEmailOutcome = { sent: true } | { sent: false; reason: string };

/**
 * Sends a newly provisioned user an account-setup email with a single-use
 * set-password link. The link reuses the password-reset token (only its
 * SHA-256 digest is stored) and lands on /forgot-password?token=…; redeeming it
 * also clears `mustChangePassword`. A failed send never fails the provisioning:
 * the token is removed and the caller shows the copyable credentials instead.
 */
export async function sendSetupEmailFor(user: { id: string; email: string; schoolId: string; preferredLanguage?: string | null }): Promise<SetupEmailOutcome> {
  const token = randomBytes(32).toString("base64url");
  const digest = createHash("sha256").update(token).digest("hex");
  return runUnscoped("issue account-setup link for an owner-provisioned user", async (): Promise<SetupEmailOutcome> => {
    try {
      await prisma.passwordReset.create({
        data: { email: user.email, userId: user.id, token: digest, expiresAt: new Date(Date.now() + SETUP_LINK_TTL_MS) },
      });
      await sendAccountSetupEmail(user.email, token, user.preferredLanguage);
      await prisma.auditLog.create({
        data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: { action: "account_setup.email_sent" } },
      });
      return { sent: true };
    } catch (error) {
      await prisma.passwordReset.deleteMany({ where: { token: digest } }).catch(() => {});
      console.error("[owner] account-setup email failed", error instanceof Error ? error.message : error);
      return { sent: false, reason: "The setup email could not be sent. Share the temporary password below instead." };
    }
  });
}
