"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { FeesSkeleton, StudentErrorState } from "@/components/student/student-components";
import { useStudentData } from "../student-data-context";
import { FamilyFeeStatement } from "@/components/fees/family-fee-statement";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-431: the pupil's own full statement from the server — the same figures their guardian sees.
export default function FeesPage() {
  const tr = useUiText();
  const { money } = useLocaleFormat();
  const { data, loading, error, refetch } = useStudentData();
  const [summary, setSummary] = useState<{ outstanding: number; currency: string | null } | null>(null);

  if (loading && !data) return <FeesSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data || !data.user) return null;

  return (
    <StudentPage
      tone="fees"
      icon={CreditCard}
      eyebrow={<>{summary?.outstanding ? `${money(summary.outstanding, summary.currency ?? "PKR")} · ${tr("Outstanding")}` : tr("All fees cleared")}</>}
      title={tr("Fees")}
      summary={tr("Invoices, payment progress, and outstanding balances.")}
    >
      <FamilyFeeStatement onSummary={setSummary} />
    </StudentPage>
  );
}
