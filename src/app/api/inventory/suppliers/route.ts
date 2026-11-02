import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageCampusOps,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { parseBody, parseWith } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { requiredText } from "@/lib/validators/fields";
import { z } from "zod";

// Names are trimmed, bounded text; a number, object or blank name is a 400 before any database call.
const supplierName = z.object({ name: requiredText("Name", { max: 120 }) });
const optionalSupplierName = z.object({ name: requiredText("Name", { max: 120 }).optional() });

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "inventory");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const suppliers = await prisma.supplier.findMany({
      where: { campusId },
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data: suppliers });
  } catch (error) {
    return errorResponse(error, "[inventory/suppliers] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await parseBody(req, jsonObjectBody);
    const { phone, email, address } = body;
    const { name } = parseWith(supplierName, body);

    // SKAI-1681: one supplier per name per campus. Under a per-campus lock, a retry with the same details replays the
    // committed supplier (200); a different supplier with that name is a recoverable 409, like categories.
    const details = { phone: phone ?? null, email: email ?? null, address: address ?? null };
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory-supplier:${campusId}`}))`;
      const existing = await tx.supplier.findFirst({ where: { campusId, name: { equals: name, mode: "insensitive" } } });
      if (existing) {
        const same = existing.phone === details.phone && existing.email === details.email && existing.address === details.address;
        if (!same) throw new ApiError("A supplier with this name already exists", 409);
        return { supplier: existing, replayed: true };
      }
      return { supplier: await tx.supplier.create({ data: { campusId, name, ...details } }), replayed: false };
    });

    return Response.json({ success: true, data: result.supplier, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, "[inventory/suppliers] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await parseBody(req, jsonObjectBody);
    const { id, phone, email, address } = body;
    const { name } = parseWith(optionalSupplierName, body);
    if (!id) throw new ApiError("id required", 400);

    const supplier = await prisma.supplier.findFirst({ where: { id, campusId } });
    if (!supplier) throw new ApiError("Supplier not found", 404);

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(address !== undefined ? { address } : {}),
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[inventory/suppliers] PATCH failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "inventory/suppliers");
}
