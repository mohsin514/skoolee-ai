import { assertListBudget } from "@/lib/lists/access";
import { listPagination, pageWindow } from "@/lib/lists/query";
import { getLocalePackage } from "@/lib/locale/store";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteUnreconciledManualLedgerEntry } from "@/lib/fees/ledger-protection";
import { ledgerSource, ledgerTotals, ledgerWhere, majorAmount, postManualEntry, reverseLedgerEntry, totalsOf } from "@/lib/fees/ledger-service";
import { csvCell } from "@/lib/csv";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// Ledger entries
// GET /api/accounts/ledger?campusId=&currency=&kind=&accountId=&source=MANUAL|FEE|PAYROLL|CORRECTION&status=all|open|reversed&from=&to=&page=&pageSize=[&format=csv]
//   → rows plus totals (income, expense, net) computed from exactly the same filter; csv exports every filtered row.
// POST /api/accounts/ledger {campusId, kind, sourceName, accountId, currency, date, amount (minor), bankAccountId?, note?, idempotencyKey}
// PATCH /api/accounts/ledger {id, action: "reverse", reason} → posts a linked opposite entry; the original is kept.
// DELETE /api/accounts/ledger?id=  (only unreconciled manual entries that were never corrected)

const EXPORT_LIMIT = 10_000;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertListBudget(user, "accounts/ledger");
    await assertModuleRead(user, "accounts");
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const currency = searchParams.get("currency") || (await getLocalePackage(user.schoolId, campusId)).currency;
    const filters = { currency, kind: searchParams.get("kind"), accountId: searchParams.get("accountId"), from: searchParams.get("from"), to: searchParams.get("to"), source: searchParams.get("source"), status: searchParams.get("status") };
    const where = ledgerWhere(scopedCampusWhere(user, campusId ?? undefined) as never, filters);
    const include = {
      account: { select: { id: true, name: true, type: true, isActive: true } },
      bankAccount: { select: { id: true, name: true } },
      payment: { select: { receiptNo: true, invoiceId: true } },
      payrollLine: { select: { id: true, payrollRun: { select: { month: true, year: true } } } },
      reversedBy: { select: { id: true, date: true } },
      reversalOf: { select: { id: true, sourceName: true, date: true } },
    } as const;

    if (searchParams.get("format") === "csv") {
      const rows = await prisma.ledgerEntry.findMany({ where, include, orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: EXPORT_LIMIT + 1 });
      if (rows.length > EXPORT_LIMIT) throw new ApiError(`Narrow the filter: exports are limited to ${EXPORT_LIMIT} rows.`, 413);
      const totals = totalsOf(rows);
      // Amounts are generated decimals (never user text), so they are written raw: a formula guard would turn
      // a negative correction into text and break the sums in a spreadsheet.
      const lines = [["Date", "Kind", "Source", "Description", "Account", "Bank account", "Reference", "Status", "Currency", "Amount"].join(",")];
      for (const row of rows) {
        const reference = row.payment?.receiptNo ?? (row.payrollLine ? `Payroll ${row.payrollLine.payrollRun.month}/${row.payrollLine.payrollRun.year}` : row.reversalOf ? `Corrects ${row.reversalOf.id}` : "");
        const status = row.reversedBy ? "Reversed" : row.reversalOfId ? "Correction" : "Posted";
        lines.push([...[row.date.toISOString().slice(0, 10), row.kind, ledgerSource(row), row.sourceName, row.account.name, row.bankAccount?.name ?? "", reference, status, row.currency].map(csvCell), majorAmount(row.amount, row.currency)].join(","));
      }
      lines.push("");
      lines.push([...["Total income", "", "", "", "", "", "", `${totals.incomeCount} rows`, currency].map(csvCell), majorAmount(totals.income, currency)].join(","));
      lines.push([...["Total expense", "", "", "", "", "", "", `${totals.expenseCount} rows`, currency].map(csvCell), majorAmount(totals.expense, currency)].join(","));
      lines.push([...["Net", "", "", "", "", "", "", `${totals.count} rows`, currency].map(csvCell), majorAmount(totals.net, currency)].join(","));
      lines.push(csvCell(`Period ${filters.from || "start"} to ${filters.to || "today"}; currency ${currency} only; includes manual, fee, payroll and correction rows matching the filter; corrections are negative rows that offset the entry they reverse.`));
      return new Response("﻿" + lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ledger-${currency}-${filters.from || "start"}-${filters.to || "today"}.csv"`, "Cache-Control": "no-store" } });
    }

    const { page: requestedPage, limit: pageSize } = listPagination(searchParams, 50, 200, "pageSize");
    const totals = await ledgerTotals(prisma, where);
    const { page, skip } = pageWindow(totals.count, requestedPage, pageSize);
    const entries = await prisma.ledgerEntry.findMany({ where, include, orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }], skip, take: pageSize });
    return Response.json({
      success: true,
      data: entries.map(entry => ({ ...entry, source: ledgerSource(entry), requestHash: undefined, idempotencyKey: undefined })),
      total: totals.count,
      totals,
      page,
      pageSize,
      currency,
      sumAmount: filters.kind ? (filters.kind.toUpperCase() === "INCOME" ? totals.income : totals.expense) : totals.net,
    });
  } catch (error) {
    return errorResponse(error, "[accounts/ledger] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertPermission(user, "accounts", "add");
    const body = await parseBody(req, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    const { entry, replayed } = await postManualEntry(user, campusId, body);
    const { requestHash: _hash, idempotencyKey: _key, ...data } = entry;
    return Response.json({ success: true, data, replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, "accounts/ledger POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertPermission(user, "accounts", "add");
    const body = await parseBody(req, jsonObjectBody);
    if (body.action !== "reverse") throw new ApiError("Unsupported action", 400);
    if (!body.id) throw new ApiError("id is required", 400);
    const { entry, replayed } = await reverseLedgerEntry(user, String(body.id), body.reason);
    return Response.json({ success: true, data: entry, replayed });
  } catch (error) {
    return errorResponse(error, "accounts/ledger PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertPermission(user, "accounts", "delete");

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    await deleteUnreconciledManualLedgerEntry(user, id);
    return Response.json({ success: true, message: "Entry deleted" });
  } catch (error) {
    return errorResponse(error, "accounts/ledger DELETE failed");
  }
}
