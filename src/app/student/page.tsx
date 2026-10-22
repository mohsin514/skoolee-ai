"use client";

import { useCallback, useState } from "react";
import { GraduationCap, Sun } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { StudentPage } from "@/components/student/student-page";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardSkeleton, StudentErrorState } from "@/components/student/student-components";
import { StudentToday, type StudentNextAction } from "@/components/student/student-today";
import { useStudentData } from "./student-data-context";

/**
 * Today — the learner's landing screen (SPEC §4.4, M99): StudentToday and nothing else. Its next step
 * is the PageHeader's one primary action ("Continue: …"). The AI panel lives on Study help, the
 * timetable on Timetable, report-card downloads on Results (one per card), exams on My online exams.
 */
export default function StudentTodayPage() {
  const tr = useUiText();
  const { data, loading, refetch, error } = useStudentData();
  const [nextAction, setNextAction] = useState<StudentNextAction>(null);
  const onNextAction = useCallback((action: StudentNextAction) => setNextAction(action), []);

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <StudentErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const user = data.user;

  return (
    <StudentPage
      icon={Sun}
      title="Today"
      // Data, not UI keys: each value in its own <bdi> (R7), joined with " · ".
      description={user ? <>{[user.rollNo ? tr("Roll {0}", [user.rollNo]) : null, user.className, user.campusName].filter(Boolean).map((part, index) => <span key={index}>{index ? " · " : null}<bdi>{part}</bdi></span>)}</> : undefined}
      primaryAction={nextAction ? { id: "continue", label: nextAction.label, href: nextAction.href } : undefined}
    >
      {data.profileMissing ? (
        <EmptyState
          icon={GraduationCap}
          title={tr("Academic profile not linked yet")}
          description={tr("The account is active, but no central student record is linked to it yet. Ask the school office to link it.")}
        />
      ) : (
        <StudentToday onNextAction={onNextAction} />
      )}
    </StudentPage>
  );
}
