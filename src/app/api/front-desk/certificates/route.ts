import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageFrontDesk,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    const { searchParams } = new URL(request.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const kind = searchParams.get("kind");

    const where: Record<string, unknown> = { campusId };
    if (kind) where.kind = kind;

    const data = await prisma.certificateTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] certificates GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { kind, name, backgroundKey, layoutJson, pageSize, campusId: requestedCampusId } = body;
    const campusId = await resolveCampusId(user, requestedCampusId);

    if (!kind || !name || !layoutJson) {
      throw new ApiError("kind, name and layoutJson are required", 400);
    }

    const data = await prisma.certificateTemplate.create({
      data: {
        campusId,
        kind,
        name,
        backgroundKey,
        layoutJson,
        ...(pageSize ? { pageSize } : {}),
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] certificates POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { id, name, backgroundKey, layoutJson, pageSize } = body;
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, body.campusId);
    const existing = await prisma.certificateTemplate.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Certificate template not found", 404);

    const data = await prisma.certificateTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(backgroundKey !== undefined ? { backgroundKey } : {}),
        ...(layoutJson !== undefined ? { layoutJson } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] certificates PATCH failed");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const existing = await prisma.certificateTemplate.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Certificate template not found", 404);

    await prisma.certificateTemplate.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[front-desk] certificates DELETE failed");
  }
}
