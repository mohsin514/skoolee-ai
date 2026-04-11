// ─────────────────────────────────────────────────────────────────
// POST /api/onboarding/invite — Invite teacher via magic link
// Creates a pending user record + sends (or logs) invite link
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { teacherInviteSchema } from "@/lib/validators/schemas";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = teacherInviteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { email, fullName } = parsed.data;

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "User with this email already exists" }, { status: 409 });
  }

  // Generate a magic token (stored as temporary password — they set real password on first login)
  const token = randomBytes(32).toString("hex");

  // Create pending teacher account
  const newUser = await prisma.user.create({
    data: {
      schoolId: authUser.schoolId,
      campusId: authUser.campusId,
      email,
      fullName,
      password: token, // Will be replaced when they accept invite
      role: "TEACHER",
      isActive: false,   // Activated when they accept
    },
  });

  // Build the magic link
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const magicLink = `${baseUrl}/accept-invite?token=${token}&userId=${newUser.id}`;

  // In production: send via email. For now log it.
  console.log(`[INVITE] Magic link for ${email}: ${magicLink}`);

  return Response.json({
    success: true,
    message: `Invite sent to ${email}`,
    // Return link in dev for testing
    ...(process.env.NODE_ENV !== "production" && { magicLink }),
  });
}
