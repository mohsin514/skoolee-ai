"use client";

import { useCallback, useState } from "react";
import { CreditCard, Download } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { FeesSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";
import { FamilyFeeStatement } from "@/components/fees/family-fee-statement";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { csvCell } from "@/lib/csv";

/** Due states as the statement names them (the same EN keys FamilyFeeStatement translates). */
const DUE_STATE_LABEL: Record<string, string> = { PAID: "Paid", CANCELLED: "Cancelled", OVERDUE: "Overdue", DUE_TODAY: "Due today", NOT_YET_DUE: "Not yet due" };

type StatementInvoice = { invoiceNumber: string | null; currency: string; status: string; dueState: string; dueDate: string; totalAmount: number; paid: number; balance: number };

// SKO-431: the pupil's own full statement from the server — the same figures their guardian sees.
// Read only (M101, G44a): paying online is for guardians, so the statement shows no Pay button.
// The one secondary action (§4.4b) downloads the statement as a spreadsheet.
export default function FeesPage() {
  const tr = useUiText();
  const { money } = useLocaleFormat();
  const { data, loading, error, refetch } = useStudentData();
  const [summary, setSummary] = useState<{ outstanding: number; currency: string | null } | null>(null);
  const [downloading, setDownloading] = useState(false);

  // React Compiler cannot preserve this manual memo (async closure over fetch);
  // the callback is correct as written. Targeted, not a blanket disable.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const downloadStatement = useCallback(async () => {
    setDownloading(true);
    try {
      const query = new URLSearchParams();
      if (summary?.currency) query.set("currency", summary.currency);
      const response = await fetch(`/api/fees/family-statement?${query}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || tr("The statement could not be downloaded. Please try again."));
      const invoices: StatementInvoice[] = json.data?.invoices ?? [];
      const rows: unknown[][] = [[tr("Invoice"), tr("Due date"), tr("Status"), tr("Amount"), tr("Paid"), tr("Balance"), tr("Currency")]];
      for (const invoice of invoices) {
        rows.push([
          invoice.invoiceNumber ?? "",
          String(invoice.dueDate ?? "").slice(0, 10),
          tr(DUE_STATE_LABEL[invoice.dueState] ?? invoice.status),
          invoice.totalAmount,
          invoice.paid,
          invoice.balance,
          invoice.currency,
        ]);
      }
      // A byte-order mark so spreadsheet apps read Arabic and Urdu names as UTF-8.
      const blob = new Blob(["﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fee-statement-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      toast.error(failure);
    } finally {
      setDownloading(false);
    }
  }, [summary?.currency, tr]);

  if (loading && !data) return <FeesSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data || !data.user) return null;

  return (
    <StudentPage
      icon={CreditCard}
      title="Fees"
      description="Your invoices and payments. Your guardian pays online."
      status={summary === null ? null : summary.outstanding
        ? <Badge variant="warning" dot><bdi>{money(summary.outstanding, summary.currency ?? undefined)}</bdi> · {tr("Outstanding")}</Badge>
        : <Badge variant="success" dot>{tr("All fees cleared")}</Badge>}
      secondaryActions={summary === null ? [] : [{ id: "download-statement", label: "Download statement", icon: Download, onClick: () => void downloadStatement(), loading: downloading }]}
    >
      <FamilyFeeStatement canPay={false} onSummary={setSummary} />
    </StudentPage>
  );
}
