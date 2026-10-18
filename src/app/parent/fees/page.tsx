"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";
import { FamilyFeeStatement } from "@/components/fees/family-fee-statement";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

export const dynamic = "force-dynamic";

// SKO-431: the guardian's fee page is the selected child's full statement from the server, in the
// school's calendar and one currency at a time, with payment status and receipts.
export default function ParentFeesPage() {
  const tr = useUiText();
  const { money } = useLocaleFormat();
  const { data, loading, error, refetch, selectedStudentId } = useParentData();
  const [summary, setSummary] = useState<{ outstanding: number; currency: string | null; fullName: string } | null>(null);

  // Without this an expired session leaves the page on a skeleton
  // forever, because `data` never arrives and `loading` is already false.
  if (error) return <ParentErrorState error={error} onRetry={refetch} />;
  if (loading || !data) return <ParentListSkeleton />;
  const studentId = selectedStudentId ?? undefined;
  // Until the statement reports back there is no balance to state, so the
  // header must not claim "All fees cleared" while the invoices still load.
  const eyebrow = summary === null
    ? tr("Fee statement")
    : summary.outstanding
      ? `${money(summary.outstanding, summary.currency ?? "PKR")} · ${tr("Outstanding")}`
      : tr("All fees cleared");
  return (
    <ParentPage
      tone="fees"
      icon={CreditCard}
      eyebrow={<>{eyebrow}</>}
      title={tr("Fee Status")}
      summary={`${tr("Invoices and payment progress")} · ${data.student.fullName}`}
    >
      <FamilyFeeStatement key={studentId ?? "default"} studentId={studentId} onSummary={setSummary} />
    </ParentPage>
  );
}
