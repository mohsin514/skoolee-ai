import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import {
  isCurrentVerificationLink,
  pendingVerificationWhere,
  readVerificationToken,
  VERIFICATION_COMPLETED_ACTION,
  VERIFICATION_REJECTED_ACTION,
  VERIFICATION_RESENT_ACTION,
  verificationRedirect,
  type VerificationOutcome,
} from "@/lib/auth/verification";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const loginUrl = new URL("/login", req.url);

  if (!token) {
    loginUrl.searchParams.set("error", "Invalid verification link");
    return NextResponse.redirect(loginUrl);
  }

  // Activation is driven by the signed token alone. The `id` that older
  // links carried is ignored — trusting it let anyone activate an account
  // by guessing a user id.
  const link = await readVerificationToken(token);
  const userId = link?.userId;

  if (!link || !userId) return redirectFor(req, "invalid");
  if (!(await isLatestLink(userId, link.tokenId))) {
    // The sign-in screen offers a new link for this message (SKO-457).
    await audit(userId, VERIFICATION_REJECTED_ACTION, { reason: "superseded", tokenId: link.tokenId });
    return redirectFor(req, "superseded");
  }

  try {
    // Pre-authentication: there is no session yet, and the token itself is
    // the authority for which account may be touched. Only an account still
    // waiting for verification is activated, once: a deactivated account is
    // never reactivated by an old link, and a second click changes nothing.
    const activated = await runUnscoped(
      "email verification: activate the account named by a signed token",
      () =>
        prisma.user.updateMany({
          where: { id: userId, ...pendingVerificationWhere },
          data: { isActive: true, emailVerifiedAt: new Date() },
        })
    );

    if (activated.count === 0) {
      const existing = await runUnscoped("email verification: confirm account exists", () =>
        prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } })
      );
      // Unknown and never-verifiable accounts read the same as an invalid link.
      if (!existing?.emailVerifiedAt) {
        await audit(userId, VERIFICATION_REJECTED_ACTION, { reason: "not_pending", tokenId: link.tokenId });
        return redirectFor(req, "invalid");
      }
      // Already verified: sign in as usual; sign-in itself decides whether the account is usable.
      return redirectFor(req, "already_verified");
    }

    await audit(userId, VERIFICATION_COMPLETED_ACTION, { tokenId: link.tokenId });
    return redirectFor(req, "activated");
  } catch (error) {
    console.error("[VERIFY ERROR]", error);
    loginUrl.searchParams.set("error", "Verification failed");
    return NextResponse.redirect(loginUrl);
  }
}

// SKAI-84: a resend supersedes every earlier link for the account. A resend logged before links had
// ids carries no tokenId and supersedes nothing.
async function isLatestLink(userId: string, tokenId: string | null) {
  const latest = await runUnscoped("email verification: newest resent link", async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { schoolId: true } });
    if (!user) return null;
    return prisma.auditLog.findFirst({
      where: { schoolId: user.schoolId, tableName: "account_security", recordId: userId, newValue: { path: ["action"], equals: VERIFICATION_RESENT_ACTION } },
      orderBy: { createdAt: "desc" },
      select: { newValue: true },
    });
  });
  const value = latest?.newValue as { tokenId?: unknown } | null | undefined;
  return isCurrentVerificationLink(tokenId, typeof value?.tokenId === "string" ? value.tokenId : null);
}

function redirectFor(req: NextRequest, outcome: VerificationOutcome) {
  const { pathname, params } = verificationRedirect(outcome);
  const url = new URL(pathname, req.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

// SKAI-83: an audit row per activation and per refused link of a known account (no email or token
// in it). Unknown user ids get no row, since audit rows need a school. A failed write never changes
// what the visitor sees.
async function audit(userId: string, action: string, detail: Record<string, string | null>) {
  try {
    await runUnscoped("email verification: audit outcome", async () => {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { schoolId: true } });
      if (!user) return;
      await prisma.auditLog.create({ data: { schoolId: user.schoolId, userId, tableName: "account_security", recordId: userId, newValue: { action, ...detail } } });
    });
  } catch {
    console.warn("[verify] audit write failed");
  }
}
