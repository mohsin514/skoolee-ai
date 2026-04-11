// PATCH /api/reports/[id] — Edit/approve remarks (Principal action)
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { remarksEn, remarksUr } = await req.json();

  const updated = await prisma.reportCard.update({
    where: { id },
    data: { remarksEn, remarksUr },
  });

  return Response.json({ success: true, reportCard: updated });
}
