import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ success: false, error: "Invite token is required." }, { status: 400 });
    }

    // Pre-auth lookup by a secret, single-use token before the invitee has a
    // session. It spans schools by necessity and returns only status/expiry —
    // no personal data — so it is safe to run outside a tenant scope.
    const invite = await runUnscoped(
      "invite status: resolve single-use invite token before sign-in",
      () =>
        prisma.staffInvitation.findUnique({
          where: { token },
          select: { status: true, expiresAt: true },
        })
    );

    if (!invite) {
      return NextResponse.json({
        success: true,
        status: "invalid",
        message: "This invitation link is no longer valid. Please ask the administrator to resend the invite.",
      });
    }

    const now = new Date();
    let status = invite.status;
    if (status === "pending" && invite.expiresAt && now > invite.expiresAt) {
      status = "expired";
    }

    return NextResponse.json({
      success: true,
      status,
      expiresAt: invite.expiresAt?.toISOString(),
    });
  } catch (error) {
    console.error("[invite/status] GET failed", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
