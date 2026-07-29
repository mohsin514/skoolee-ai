import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { bankImportSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const accountName = formData.get("accountName") as string;
    const statementFrom = formData.get("statementFrom") as string;
    const statementTo = formData.get("statementTo") as string;

    if (!file) throw new ApiError("CSV file is required", 400);

    const parsed = bankImportSchema.safeParse({ accountName, statementFrom, statementTo });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const msg = Object.entries(flat).map(([k, v]) => `${k}: ${v?.join(", ")}`).join("; ");
      return Response.json({ error: msg || "Validation failed" }, { status: 400 });
    }

    const campusId = await resolveCampusId(user, formData.get("campusId") as string);

    const csvText = await file.text();
    const lines = csvText.split("\n").filter((l) => l.trim());

    if (lines.length < 2) throw new ApiError("CSV file must have a header row and at least one data row", 400);

    const headers = parseCSVLine(lines[0]);
    const dateIdx = headers.findIndex((h) => /date|transaction/i.test(h));
    const amountIdx = headers.findIndex((h) => /amount/i.test(h));
    const descIdx = headers.findIndex((h) => /description|narration|details/i.test(h));

    if (dateIdx === -1 || amountIdx === -1 || descIdx === -1) {
      throw new ApiError("CSV must have columns: transaction_date, amount, description", 400);
    }

    const transactions = lines.slice(1).map((line) => {
      const cols = parseCSVLine(line);
      return {
        date: cols[dateIdx] ?? "",
        amount: parseFloat(cols[amountIdx]?.replace(/[^0-9.-]/g, "") || "0"),
        description: cols[descIdx] ?? "",
      };
    }).filter((t) => t.amount > 0);

    const pendingInvoices = await prisma.invoice.findMany({
      where: {
        campusId,
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        balanceDue: { gt: 0 },
      },
      include: {
        student: { select: { id: true, fullName: true, guardianName: true } },
      },
    });

    const matched: Array<{
      amount: number;
      date: string;
      description: string;
      matchedInvoiceId: string | null;
      studentName: string | null;
      confidence: number;
    }> = [];

    const unmatched: Array<{
      amount: number;
      date: string;
      description: string;
      matchedInvoiceId: null;
      studentName: null;
      confidence: number;
    }> = [];

    for (const tx of transactions) {
      let bestMatch: typeof pendingInvoices[0] | null = null;
      let bestScore = 0;

      for (const inv of pendingInvoices) {
        let score = 0;
        const nameTokens = [inv.student.fullName, inv.student.guardianName ?? ""]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const desc = tx.description.toLowerCase();

        if (nameTokens.includes(desc) || desc.includes(nameTokens.slice(0, 10))) {
          score += 60;
        }

        const distance = levenshteinDistance(
          desc.slice(0, 15),
          nameTokens.slice(0, 15)
        );
        if (distance < 5) score += Math.max(0, 30 - distance * 6);

        if (Math.abs(tx.amount - inv.balanceDue) <= 0.01) score += 40;
        else if (tx.amount <= inv.balanceDue && tx.amount >= inv.balanceDue * 0.5) score += 20;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = inv;
        }
      }

      if (bestMatch && bestScore >= 50) {
        matched.push({
          amount: Math.round(tx.amount * 100),
          date: tx.date,
          description: tx.description,
          matchedInvoiceId: bestMatch.id,
          studentName: bestMatch.student.fullName,
          confidence: Math.min(99, bestScore),
        });
      } else {
        unmatched.push({
          amount: Math.round(tx.amount * 100),
          date: tx.date,
          description: tx.description,
          matchedInvoiceId: null,
          studentName: null,
          confidence: 0,
        });
      }
    }

    const reconciliation = await prisma.bankReconciliation.create({
      data: {
        campusId,
        importDate: new Date(),
        bankAccount: parsed.data.accountName,
        statementPeriodFrom: new Date(parsed.data.statementFrom),
        statementPeriodTo: new Date(parsed.data.statementTo),
        totalTransactions: transactions.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        reconciliationDetailsJson: matched as any,
        unmatchedJson: unmatched as any,
        status: "pending",
        reconciledBy: user.userId,
        reconciledAt: new Date(),
      },
    });

    return Response.json({
      success: true,
      data: {
        jobId: `bank-recon-${reconciliation.id}`,
        status: "matching",
        totalTransactions: transactions.length,
        matched: matched.length,
        unmatched: unmatched.length,
        preview: matched.slice(0, 10).concat(unmatched.slice(0, 5)),
      },
    });
  } catch (error) {
    return errorResponse(error, "[fees/bank-import] POST failed");
  }
}
