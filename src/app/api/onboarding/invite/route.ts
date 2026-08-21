// ─────────────────────────────────────────────────────────────────
// POST /api/onboarding/invite — Invite teacher via magic link
// Creates a pending user record + sends (or logs) invite link
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { teacherInviteSchema } from "@/lib/validators/schemas";
import { randomBytes } from "crypto";
import { assertPlanCapacity } from "@/lib/billing/entitlements";

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Ensure client sent JSON; if not, log a helpful error and return 400.
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // Try to capture the raw payload for debugging (may be RSC/Flight frames)
    let raw = undefined;
    try {
      raw = await req.text();
    } catch (e) {
      raw = "<unreadable body>";
    }
    console.error("[ONBOARDING/INVITE] Unexpected non-JSON request body:", raw?.slice?.(0, 1000) ?? raw);
    return Response.json({ error: "Invalid request: expected JSON body (Content-Type: application/json)" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    console.error("[ONBOARDING/INVITE] Failed to parse JSON body:", err);
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = teacherInviteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { email, fullName } = parsed.data;
  await assertPlanCapacity({ schoolId: authUser.schoolId, metric: "teachers" });

  // Check if user already exists
  // FINDING-D: identity is tenant-scoped — check THIS school only.
  const existing = await prisma.user.findFirst({ where: { email, schoolId: authUser.schoolId } });
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
  const baseUrl = req.nextUrl.origin;
  const magicLink = `${baseUrl}/accept-invite?token=${token}&userId=${newUser.id}`;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[INVITE] Magic link for ${email}: ${magicLink}`);
  }

  return Response.json({
    success: true,
    message: `Invite sent to ${email}`,
    // Return link in dev for testing
    ...(process.env.NODE_ENV !== "production" && { magicLink }),
  });
}
