import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { isCurrentVerificationLink, pendingVerificationWhere, readVerificationToken, VERIFICATION_RESENT_ACTION } from "@/lib/auth/verification";

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

  if (!link || !userId || !(await isLatestLink(userId, link.tokenId))) {
    // The sign-in screen offers a new link for this message (SKO-457).
    loginUrl.searchParams.set("error", "This verification link is invalid or has expired");
    return NextResponse.redirect(loginUrl);
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
        loginUrl.searchParams.set("error", "This verification link is invalid or has expired");
        return NextResponse.redirect(loginUrl);
      }
      // Already verified: sign in as usual; sign-in itself decides whether the account is usable.
      loginUrl.searchParams.set("verified", "true");
      return NextResponse.redirect(loginUrl);
    }

    loginUrl.pathname = "/verify-success";
    return NextResponse.redirect(loginUrl);
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
