import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export const runtime = "nodejs";

const VALID_KINDS = ["RECEIVE", "SELL", "ISSUE", "RETURN"];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
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
    const { itemId, storeId, kind, quantity, unitPrice, supplierId, issuedToUserId, note } = body;

    if (!itemId || !storeId || !kind) throw new ApiError("itemId, storeId and kind required", 400);
    if (!VALID_KINDS.includes(kind)) throw new ApiError("Invalid kind", 400);
    if (!quantity || quantity <= 0) throw new ApiError("quantity must be a positive number", 400);

    const item = await prisma.item.findFirst({ where: { id: itemId, campusId } });
    if (!item) throw new ApiError("Item not found", 404);

    const store = await prisma.itemStore.findFirst({ where: { id: storeId, campusId } });
    if (!store) throw new ApiError("Store not found", 404);

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, campusId } });
      if (!supplier) throw new ApiError("Supplier not found", 404);
    }

    const transaction = await prisma.$transaction(async (tx) => {
      if (kind === "RECEIVE" || kind === "RETURN") {
        await tx.itemStock.upsert({
          where: { itemId_storeId: { itemId, storeId } },
          update: { quantity: { increment: quantity } },
          create: { itemId, storeId, quantity },
        });
      } else if (kind === "SELL" || kind === "ISSUE") {
        const stock = await tx.itemStock.findUnique({
          where: { itemId_storeId: { itemId, storeId } },
        });
        const available = stock?.quantity ?? 0;
        if (available < quantity) {
          throw new ApiError("Insufficient stock quantity", 409);
        }
        await tx.itemStock.update({
          where: { itemId_storeId: { itemId, storeId } },
          data: { quantity: { decrement: quantity } },
        });
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
