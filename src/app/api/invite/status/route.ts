import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ success: false, error: "Invite token is required." }, { status: 400 });
  }

  const invite = await prisma.staffInvitation.findUnique({
    where: { token },
    select: { status: true, expiresAt: true },
  });

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
}
