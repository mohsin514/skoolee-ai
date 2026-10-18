import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export const runtime = "nodejs";

const VALID_KINDS = ["RECEIVE", "SELL", "ISSUE", "RETURN"];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "inventory");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const kind = req.nextUrl.searchParams.get("kind");
    const storeId = req.nextUrl.searchParams.get("storeId");

    const where: any = { campusId };
    if (kind) {
      if (!VALID_KINDS.includes(kind)) throw new ApiError("Invalid kind", 400);
      where.kind = kind;
    }
    if (storeId) where.storeId = storeId;

    const transactions = await prisma.itemTransaction.findMany({
      where,
      include: {
        item: true,
        store: true,
        supplier: true,
      },
      orderBy: { date: "desc" },
    });

    return Response.json({ success: true, data: transactions });
  } catch (error) {
    return errorResponse(error, "[inventory/transactions] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await req.json();
    const { itemId, storeId, kind, quantity, unitPrice, supplierId, issuedToUserId, note, idempotencyKey } = body;

    if (!itemId || !storeId || !kind) throw new ApiError("itemId, storeId and kind required", 400);
    if (!VALID_KINDS.includes(kind)) throw new ApiError("Invalid kind", 400);
    if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) throw new ApiError("quantity must be a positive whole number", 400);
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey))) throw new ApiError("Invalid idempotency key", 400);
    // SKO-435: a retried movement with the same key is the same movement.
    if (idempotencyKey) {
      const existing = await prisma.itemTransaction.findFirst({ where: { schoolId: user.schoolId, idempotencyKey }, include: { item: true, store: true, supplier: true } });
      if (existing) return Response.json({ success: true, data: existing, replayed: true }, { status: 200 });
    }

    const [item, store, supplier] = await Promise.all([
      prisma.item.findFirst({ where: { id: itemId, campusId } }),
      prisma.itemStore.findFirst({ where: { id: storeId, campusId } }),
      supplierId ? prisma.supplier.findFirst({ where: { id: supplierId, campusId } }) : null,
    ]);
    if (!item) throw new ApiError("Item not found", 404);
    if (!store) throw new ApiError("Store not found", 404);
    if (supplierId && !supplier) throw new ApiError("Supplier not found", 404);

    const transaction = await prisma.$transaction(async (tx) => {
      if (kind === "RECEIVE" || kind === "RETURN") {
        await tx.itemStock.upsert({
          where: { itemId_storeId: { itemId, storeId } },
          update: { quantity: { increment: quantity } },
          create: { itemId, storeId, quantity },
        });
      } else if (kind === "SELL" || kind === "ISSUE") {
        // SKO-435: one conditional decrement, so two concurrent issues of the last units cannot
        // both succeed and stock can never go negative.
        const taken = await tx.itemStock.updateMany({
          where: { itemId, storeId, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (!taken.count) {
          throw new ApiError("Insufficient stock quantity", 409);
        }
      }

      return tx.itemTransaction.create({
        data: {
          campusId,
          itemId,
          storeId,
          kind,
          quantity,
          unitPrice: unitPrice ?? null,
          supplierId: supplierId ?? null,
          issuedToUserId: issuedToUserId ?? null,
          note: note ?? null,
          idempotencyKey: idempotencyKey ?? null,
        },
        include: {
          item: true,
          store: true,
          supplier: true,
        },
      });
    });

    return Response.json({ success: true, data: transaction }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[inventory/transactions] POST failed");
  }
}
