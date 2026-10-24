import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { pendingVerificationWhere, verifyVerificationToken } from "@/lib/auth/verification";

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
  const userId = await verifyVerificationToken(token);

  if (!userId) {
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
