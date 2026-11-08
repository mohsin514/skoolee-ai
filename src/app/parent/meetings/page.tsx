"use client";

import { CalendarClock, CalendarPlus } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { ParentErrorState, ParentListSkeleton } from "@/components/parent/parent-components";
import { FamilyMeetings } from "@/components/meetings/family-meetings";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useParentData } from "../parent-data-context";

export const dynamic = "force-dynamic";

/** Meet a teacher (M92): book, move or cancel a meeting with the selected child's teachers. */
export default function ParentMeetingsPage() {
  const ui = useUiText();
  const { data, error, refetch, selectedStudentId, children } = useParentData();
  const childId = selectedStudentId ?? children[0]?.id ?? null;

  if (error && !data) return <ParentErrorState error={error} onRetry={refetch} />;
  if (!data) return <ParentListSkeleton rows={2} />;

  return (
    <ParentPage
      icon={CalendarClock}
      title="Meet a teacher"
      description={ui("Book a meeting with {0}'s teachers. Times are in the school's timezone.", [`\u2068${data.student.fullName}\u2069`])}
      primaryAction={childId ? {
        id: "book-slot",
        label: "Book a slot",
        icon: CalendarPlus,
        onClick: () => document.getElementById("book-a-meeting")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }),
      } : undefined}
    >
      {childId ? <FamilyMeetings key={childId} studentId={childId} /> : null}
    </ParentPage>
  );
}
