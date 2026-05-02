// ─────────────────────────────────────────────────────────────────
// POST /api/onboarding/class — Add first class after registration
// POST /api/onboarding/invite — Invite first teacher via magic link
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { firstClassSchema } from "@/lib/validators/schemas";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;

  const body = await req.json();
  const parsed = firstClassSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, section, academicYear } = parsed.data;

  // We need a campusId — take from auth context
  if (!user.campusId) {
    return Response.json({ error: "No campus associated with this account" }, { status: 400 });
  }

  const newClass = await prisma.class.create({
    data: {
      campusId: user.campusId,
      name,
      section,
      academicYear,
    },
  });

  return Response.json({ success: true, class: newClass });
}
