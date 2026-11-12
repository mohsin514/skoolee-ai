import { parseUnitPrice } from "@/lib/inventory/unit-price";
import { listPagination, pageWindow } from "@/lib/lists/query";
import { assertListBudget } from "@/lib/lists/access";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageCampusOps,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const runtime = "nodejs";

const VALID_KINDS = ["RECEIVE", "SELL", "ISSUE", "RETURN"];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "inventory");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    await assertListBudget(user, "inventory/transactions");
    const params = req.nextUrl.searchParams;
    const kind = params.get("kind");
    const storeId = params.get("storeId");

    // SKAI-1820: the ledger is append-only, so a read returns one page of movements, never the whole history.
    const where: Prisma.ItemTransactionWhereInput = { schoolId: user.schoolId, campusId };
    if (kind) {
      if (!VALID_KINDS.includes(kind)) throw new ApiError("Invalid kind", 400);
      where.kind = kind;
    }
    if (storeId) where.storeId = storeId;

    const { page: requestedPage, limit } = listPagination(params, 24, 100);
    const total = await prisma.itemTransaction.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);
    const transactions = await prisma.itemTransaction.findMany({
      where,
      include: {
        item: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip,
      take: limit,
    });

    return Response.json({ success: true, data: transactions, pagination: { page, limit, total, pages } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "[inventory/transactions] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);

    const campusId = await resolveCampusId(user);
    const body = await parseBody(req, jsonObjectBody);
    const { itemId, storeId, kind, quantity, unitPrice, supplierId, issuedToUserId, note, idempotencyKey } = body;

    if (!itemId || !storeId || !kind) throw new ApiError("itemId, storeId and kind required", 400);
    if (!VALID_KINDS.includes(kind)) throw new ApiError("Invalid kind", 400);
    if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) throw new ApiError("quantity must be a positive whole number", 400);
    // SKAI-1347: a unit price is a cost, so it can never be negative. SKAI-1335: nor exceed the stored Int32 range.
    const unitPriceMinor = parseUnitPrice(unitPrice);
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey))) throw new ApiError("Invalid idempotency key", 400);
    // SKO-435: a retried movement with the same key is the same movement.
    if (idempotencyKey) {
      const existing = await prisma.itemTransaction.findFirst({ where: { schoolId: user.schoolId, idempotencyKey }, include: { item: true, store: true, supplier: true } });
      // SKAI-1333: a reused key replays only the same movement; a different one must not look accepted.
      if (existing) {
        const same = existing.itemId === itemId && existing.storeId === storeId && existing.kind === kind && existing.quantity === quantity;
        if (!same) throw new ApiError("This idempotency key was already used for a different stock movement.", 409);
        return Response.json({ success: true, data: existing, replayed: true }, { status: 200 });
      }
    }

    const [item, store, supplier] = await Promise.all([
      prisma.item.findFirst({ where: { id: itemId, campusId } }),
      prisma.itemStore.findFirst({ where: { id: storeId, campusId } }),
      supplierId ? prisma.supplier.findFirst({ where: { id: supplierId, campusId } }) : null,
    ]);
    if (!item) throw new ApiError("Item not found", 404);
    if (!store) throw new ApiError("Store not found", 404);
    if (supplierId && !supplier) throw new ApiError("Supplier not found", 404);

    let transaction;
    try {
      transaction = await prisma.$transaction(async (tx) => {
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
            unitPrice: unitPriceMinor,
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
    } catch (error) {
      // SKAI-1345: a concurrent identical retry lost the unique (school, idempotency key) race and rolled back.
      // Answer with the movement that committed, as the sequential replay does, instead of a server error.
      const winner = idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? await prisma.itemTransaction.findFirst({ where: { schoolId: user.schoolId, idempotencyKey }, include: { item: true, store: true, supplier: true } })
        : null;
      if (!winner) throw error;
      if (winner.itemId !== itemId || winner.storeId !== storeId || winner.kind !== kind || winner.quantity !== quantity) {
        throw new ApiError("This idempotency key was already used for a different stock movement.", 409);
      }
      return Response.json({ success: true, data: winner, replayed: true }, { status: 200 });
    }

    return Response.json({ success: true, data: transaction }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[inventory/transactions] POST failed");
  }
}
