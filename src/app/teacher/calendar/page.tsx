"use client";

import { useState } from "react";
import { CalendarDays, CalendarPlus, Send } from "lucide-react";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { MeetingDesk } from "@/components/meetings/meeting-desk";
import { FamilyDigestReview } from "@/components/family/family-digest";
import { classLabel, useTeacherData } from "@/components/teacher/teacher-components";

/**
 * Calendar & meetings — everything the teacher arranges with families, beside the school calendar:
 * parent meetings (primary: Offer meeting slots) and the weekly family update (M66; sending sits
 * behind a confirmation inside the panel).
 */
export default function TeacherCalendarPage() {
  const { data } = useTeacherData();
  const [offerOpen, setOfferOpen] = useState(false);
  const [deskReady, setDeskReady] = useState(false);
  const classes = (data?.classHubs || []).map((cls: any) => ({ id: cls.id, label: classLabel(cls) }));

  return (
    <TeacherPage
      icon={CalendarDays}
      title="Calendar & meetings"
      description="Offer meeting times to families, review the weekly family update and see the school calendar."
      primaryAction={{ id: "offer-slots", label: "Offer meeting slots", icon: CalendarPlus, onClick: () => setOfferOpen(true), disabled: !deskReady, disabledReason: "Available once your meetings have loaded." }}
      secondaryActions={classes.length ? [{
        id: "weekly-update",
        label: "Weekly family update",
        icon: Send,
        onClick: () => document.getElementById("weekly-family-update")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }),
      }] : []}
    >
      <div className="space-y-6">
        {/* SKO-420: parent meeting times, bookings and follow-up. */}
        <MeetingDesk offerOpen={offerOpen} onOfferOpenChange={setOfferOpen} onReadyChange={setDeskReady} />
        {/* SKO-423: reviewed weekly family updates for the teacher's classes. */}
        {classes.length ? (
          <div id="weekly-family-update" className="scroll-mt-4">
            <FamilyDigestReview classes={classes} />
          </div>
        ) : null}
        <AcademicCalendar readOnly role="TEACHER" />
      </div>
    </TeacherPage>
  );
}
