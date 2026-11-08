"use client";

import { useState } from "react";
import { Plane, Plus } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { MyLeavePanel } from "@/components/leave/my-leave";

/**
 * Reached from the account menu ("My leave"); the same panel every staff console mounts. The screen's first job
 * is asking for time off, so **Apply for leave** is the PageHeader primary (§4.4b default rule); the panel's own
 * button is hidden here and its empty state repeats the action (§4.5.7).
 */
export default function LeavePage() {
  const [applyRequest, setApplyRequest] = useState(0);
  const [applyState, setApplyState] = useState<{ ready: boolean; reason: string | null }>({ ready: false, reason: "Loading your leave types…" });
  return (
    <TeacherPage
      icon={Plane}
      title="My leave"
      description="Apply for leave and track your requests. Your approver decides each request."
      primaryAction={{
        id: "apply-leave",
        label: "Apply for leave",
        icon: Plus,
        onClick: () => setApplyRequest((n) => n + 1),
        disabled: !applyState.ready,
        disabledReason: applyState.reason ?? undefined,
      }}
    >
      <MyLeavePanel hideApply applyRequest={applyRequest} onApplyState={setApplyState} />
    </TeacherPage>
  );
}
