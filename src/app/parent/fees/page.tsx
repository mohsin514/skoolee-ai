"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton } from "@/components/parent/parent-components";
import { useParentData } from "../parent-data-context";
import { FamilyFeeStatement } from "@/components/fees/family-fee-statement";
import { Badge } from "@/components/ui/badge";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

export const dynamic = "force-dynamic";

// SKO-431: the guardian's fee page is the selected child's full statement from the server, in the
// school's calendar and one currency at a time, with payment status and receipts. Pay now is a row
// action on each invoice (PARENT only), so the page header carries no primary.
export default function ParentFeesPage() {
  const tr = useUiText();
  const { money } = useLocaleFormat();
  const { data, error, refetch, selectedStudentId } = useParentData();
  const [summary, setSummary] = useState<{ outstanding: number; currency: string | null; fullName: string; forStudent: string } | null>(null);

  if (error && !data) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return <ParentListSkeleton />;
  const studentId = selectedStudentId ?? undefined;
  // Until the statement reports back there is no balance to state, so the
  // header must not claim "All fees cleared" while the invoices still load.
  // SKAI-1464: a summary belongs to the child it was loaded for, so a sibling switch never shows the previous balance.
  const current = summary && summary.forStudent === (studentId ?? "default") ? summary : null;
  const status = current === null
    ? null
    : current.outstanding
      ? <Badge variant="warning" dot><bdi>{money(current.outstanding, current.currency ?? undefined)}</bdi> · {tr("Outstanding")}</Badge>
      : <Badge variant="success" dot>{tr("All fees cleared")}</Badge>;
  return (
    <ParentPage
      icon={CreditCard}
      title="Fees"
      description={tr("Invoices, payments and receipts for {0}.", [`\u2068${data.student.fullName}\u2069`])}
      status={status}
    >
      <FamilyFeeStatement key={studentId ?? "default"} studentId={studentId} onSummary={next => setSummary(next && { ...next, forStudent: studentId ?? "default" })} />
    </ParentPage>
  );
}
