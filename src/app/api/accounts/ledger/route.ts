import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId, scopedCampusWhere } from "@/lib/api/scope";

// Ledger entries
// GET /api/accounts/ledger?campusId=&kind=INCOME|EXPENSE&from=YYYY-MM-DD&to=YYYY-MM-DD&accountId=&page=&pageSize=
// POST /api/accounts/ledger {campusId, kind, sourceName, accountId, date, amount (paisa), paymentMethod?, bankAccountId?, note?}
// DELETE /api/accounts/ledger?id=  (only manual entries — auto-posted fee entries kept for audit)

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));

    const kind = searchParams.get("kind");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const accountId = searchParams.get("accountId");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50));

    const where: any = scopedCampusWhere(user, campusId ?? undefined) as any;
    if (kind && ["INCOME", "EXPENSE"].includes(String(kind).toUpperCase())) where.kind = String(kind).toUpperCase();
    if (accountId) where.accountId = accountId;
    if (from) {
      const d = new Date(`${from}T00:00:00Z`);
      if (!isNaN(d.getTime())) where.date = { ...(where.date ?? {}), gte: d };
    }
    if (to) {
      const d = new Date(`${to}T23:59:59.999Z`);
      if (!isNaN(d.getTime())) where.date = { ...(where.date ?? {}), lte: d };
    }

    const [total, entries] = await Promise.all([
      prisma.ledgerEntry.count({ where }),
      prisma.ledgerEntry.findMany({
        where,
        include: {
          account: { select: { id: true, name: true, type: true } },
          bankAccount: { select: { id: true, name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totals = await prisma.ledgerEntry.aggregate({
      where,
      _sum: { amount: true },
    });

    return Response.json({
      success: true,
      data: entries,
      total,
      page,
      pageSize,
      sumAmount: totals._sum.amount ?? 0,
    });
  } catch (error) {
    return errorResponse(error, "[accounts/ledger] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "accounts", "add");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const kind = String(body.kind ?? "").toUpperCase();
    const amount = Math.round(Number(body.amount));
    const date = new Date(body.date ?? new Date().toISOString().split("T")[0]);

    if (!["INCOME", "EXPENSE"].includes(kind)) throw new ApiError("kind must be INCOME or EXPENSE", 400);
    if (!Number.isInteger(amount) || amount <= 0) throw new ApiError("amount must be a positive integer (paisa)", 400);
    if (!body.accountId) throw new ApiError("accountId is required", 400);
    if (isNaN(date.getTime())) throw new ApiError("invalid date", 400);

    const account = await prisma.chartOfAccount.findFirst({
      where: { id: body.accountId, campusId },
    });
    if (!account) throw new ApiError("Account not found", 404);
    if (!["INCOME", "EXPENSE"].includes(account.type)) {
      throw new ApiError("Ledger entries require an INCOME or EXPENSE account", 400);
    }

    let bankAccountId: string | null = null;
    if (body.bankAccountId) {
      const bank = await prisma.bankAccount.findFirst({ where: { id: body.bankAccountId, campusId } });
      if (!bank) throw new ApiError("Bank account not found", 404);
      bankAccountId = bank.id;
    }

    const entry = await prisma.ledgerEntry.create({
      data: {
        campusId,
        kind,
        sourceName: String(body.sourceName ?? (kind === "INCOME" ? "Manual income" : "Manual expense")).trim(),
        accountId: account.id,
        paymentMethod: body.paymentMethod ? String(body.paymentMethod).trim() : null,
        bankAccountId,
        date,
        amount,
        note: body.note ? String(body.note).trim() : null,
        createdById: user.userId,
      },
    });

    return Response.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "accounts/ledger POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "accounts", "delete");

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const entry = await prisma.ledgerEntry.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!entry) throw new ApiError("Ledger entry not found", 404);
    if (entry.paymentId) {
      throw new ApiError("Auto-posted fee entries cannot be deleted (void the receipt instead)", 409);
    }

    await prisma.ledgerEntry.delete({ where: { id: entry.id } });
    return Response.json({ success: true, message: "Entry deleted" });
  } catch (error) {
    return errorResponse(error, "accounts/ledger DELETE failed");
  }
}