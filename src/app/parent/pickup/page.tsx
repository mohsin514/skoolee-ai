"use client";

import { Bus } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton } from "@/components/parent/parent-components";
import { FamilyPickups } from "@/components/pickup/pickup";
import { FamilyJourney } from "@/components/transport/transport";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useParentData } from "../parent-data-context";

export const dynamic = "force-dynamic";

/**
 * Pickup & transport (M89): who may collect the selected child, and today's school transport as
 * recorded by the attendant. Shown in the navigation only to guardians with the pickup permission
 * (`pickupGuardian`); the pickup API keeps its own check.
 */
export default function ParentPickupPage() {
  const ui = useUiText();
  const { data, error, refetch, selectedStudentId, children } = useParentData();
  const childId = selectedStudentId ?? children[0]?.id ?? null;

  if (error && !data) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return <ParentListSkeleton rows={2} />;

  return (
    <ParentPage
      icon={Bus}
      title="Pickup & transport"
      description={ui("Who may collect {0}, and today's school transport.", [`\u2068${data.student.fullName}\u2069`])}
    >
      {childId ? (
        <div className="space-y-6">
          {/* SKO-438: who may collect this child; the panel adds and withdraws collectors. */}
          <FamilyPickups key={`pickup-${childId}`} studentId={childId} />
          {/* SKO-437: today's school transport status for this child; renders nothing without a journey. */}
          <FamilyJourney key={`bus-${childId}`} studentId={childId} />
        </div>
      ) : null}
    </ParentPage>
  );
}
