"use client";

import { Trophy } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton } from "@/components/parent/parent-components";
import { FamilyActivities } from "@/components/activities/activities";
import { GuardianTrips } from "@/components/family/family-requests";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useParentData } from "../parent-data-context";

export const dynamic = "force-dynamic";

/**
 * Activities & trips (M90): clubs, sports and trips for the selected child, and the trip permissions
 * the family answers. One inline action per row (Give consent / Place), so the page has no primary.
 */
export default function ParentActivitiesPage() {
  const ui = useUiText();
  const { data, error, refetch, selectedStudentId, children } = useParentData();
  const childId = selectedStudentId ?? children[0]?.id ?? null;

  if (error && !data) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return <ParentListSkeleton rows={2} />;

  return (
    <ParentPage
      icon={Trophy}
      title="Activities & trips"
      description={ui("Clubs, sports and trips for {0}, and the permissions the school asks you for.", [`\u2068${data.student.fullName}\u2069`])}
    >
      {childId ? (
        <div className="space-y-6">
          {/* SKO-421: trip permission — the exact version is shown and named in the answer. */}
          <GuardianTrips key={`trips-${childId}`} studentId={childId} />
          {/* SKO-440: clubs, sports and trips for this child. */}
          <FamilyActivities key={`act-${childId}`} studentId={childId} />
        </div>
      ) : null}
    </ParentPage>
  );
}
