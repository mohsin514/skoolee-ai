"use client";

import { ShieldCheck } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton } from "@/components/parent/parent-components";
import { GuardianConsentForm } from "@/components/family/guardian-consent";
import { FamilyTransferConsent } from "@/components/learning/learning-transfer";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useParentData } from "../parent-data-context";

export const dynamic = "force-dynamic";

/** SKAI-1157: the guardian's consent for the selected child, per purpose, in the language shown.
 *  SKAI-219: also the guardian's consent to share records from a previous school (SKO-471), which left Home in role-ux. */
export default function ParentConsentPage() {
  const ui = useUiText();
  const { data, error, refetch, selectedStudentId, children } = useParentData();
  const childId = selectedStudentId ?? children[0]?.id ?? null;

  if (error && !data) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return <ParentListSkeleton rows={2} />;

  return (
    <ParentPage
      icon={ShieldCheck}
      title="Consent"
      description={ui("Choose how the school may use {0}'s information.", [`⁨${data.student.fullName}⁩`])}
    >
      <div className="space-y-6">
        {childId ? <GuardianConsentForm key={childId} studentId={childId} /> : null}
        <FamilyTransferConsent />
      </div>
    </ParentPage>
  );
}
