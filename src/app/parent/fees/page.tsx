"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";
import { FamilyFeeStatement } from "@/components/fees/family-fee-statement";
import { Badge } from "@/components/ui/badge";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { summaryForChild } from "@/lib/fees/family-summary";

export const dynamic = "force-dynamic";

// SKO-431: the guardian's fee page is the selected child's full statement from the server, in the
// school's calendar and one currency at a time, with payment status and receipts. Pay now is a row
// action on each invoice (PARENT only), so the page header carries no primary.
export default function ParentFeesPage() {
  const tr = useUiText();
  const { money } = useLocaleFormat();
  const { data, error, refetch, selectedStudentId } = useParentData();
  // SKAI-1464: the summary records the child it was loaded for; only that child's summary is used (see summaryForChild).
  const [loaded, setLoaded] = useState<{ studentId: string; outstanding: number; currency: string | null; fullName: string } | null>(null);

  if (error && !data) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return <ParentListSkeleton />;
  const studentId = selectedStudentId ?? undefined;
  const summary = summaryForChild(loaded, studentId);
  // Until the statement reports back for this child there is no balance to state, so the
  // header must not claim "All fees cleared" while the invoices still load.
  const status = summary === null
    ? null
    : summary.outstanding
      ? <Badge variant="warning" dot><bdi>{money(summary.outstanding, summary.currency ?? undefined)}</bdi> · {tr("Outstanding")}</Badge>
      : <Badge variant="success" dot>{tr("All fees cleared")}</Badge>;
  // The name comes from the same child's statement as the balance, so the two can never belong to different children.
  const name = summary ? summary.fullName : data.student.fullName;
  return (
    <ParentPage
      icon={CreditCard}
      title="Fees"
      description={tr("Invoices, payments and receipts for {0}.", [`⁨${name}⁩`])}
      status={status}
    >
      <FamilyFeeStatement key={studentId ?? "default"} studentId={studentId} onSummary={next => setLoaded(next ? { ...next, studentId: studentId ?? "" } : null)} />
    </ParentPage>
  );
}
