import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { verifyVerificationToken } from "@/lib/auth/verification";

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
    loginUrl.searchParams.set("error", "This verification link is invalid or has expired");
    return NextResponse.redirect(loginUrl);
  }

  try {
    // Pre-authentication: there is no session yet, and the token itself is
    // the authority for which account may be touched.
    const activated = await runUnscoped(
      "email verification: activate the account named by a signed token",
      () =>
        prisma.user.updateMany({
          where: { id: userId, isActive: false },
          data: { isActive: true },
        })
    );

    // A second click on the same link is not an error worth showing.
    if (activated.count === 0) {
      const existing = await runUnscoped("email verification: confirm account exists", () =>
        prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } })
      );

      if (!existing) {
        loginUrl.searchParams.set("error", "User not found");
        return NextResponse.redirect(loginUrl);
      }
    }

    loginUrl.pathname = "/verify-success";
    return NextResponse.redirect(loginUrl);
  } catch (error) {
    console.error("[VERIFY ERROR]", error);
    loginUrl.searchParams.set("error", "Verification failed");
    return NextResponse.redirect(loginUrl);
  }
}
