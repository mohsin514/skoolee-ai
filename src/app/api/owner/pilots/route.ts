import { errorResponse, ApiError, requirePlatformOwner } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { createPilot, listPilots, PilotError } from "@/lib/pilots/service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

// SKO-430: pilot evidence is a platform-operator record; participant-level rows never leave
// these owner-only routes.
const rethrow = (error: unknown): never => { throw error instanceof PilotError ? new ApiError(error.message, error.status) : error; };

export async function GET() {
  try {
    const owner = await requirePlatformOwner();
    const [pilots, owners, schools] = await Promise.all([
      listPilots(),
      runUnscoped("pilot: list platform operators who can own measurement", () => prisma.user.findMany({ where: { role: "APP_OWNER", isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } })),
      prisma.school.findMany({ where: { status: { not: "DELETED" } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    ]);
    return Response.json({ success: true, data: { pilots, owners, schools, userId: owner.userId } }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "[owner/pilots] GET failed");
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requirePlatformOwner();
    const pilot = await createPilot(await request.json().catch(() => null), owner.userId).catch(rethrow);
    return Response.json({ success: true, data: pilot }, { status: 201, headers: noStore });
  } catch (error) {
    return errorResponse(error, "[owner/pilots] POST failed");
  }
}
