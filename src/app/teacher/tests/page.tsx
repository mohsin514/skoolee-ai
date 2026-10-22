"use client";

import { useState } from "react";
import { ClipboardList, Download, Plus } from "lucide-react";
import { ExamCycleManager } from "@/components/academic/ExamCycleManager";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { classLabel, formatStatus, useTeacherData } from "@/components/teacher/teacher-components";
import { useUiText } from "@/components/locale/LocaleProvider";
import { csvCell } from "@/lib/csv";

/**
 * Tests & quizzes — the teacher's own QUIZ and CLASS_TEST pipeline (M62: no Mid Term, Final or Custom
 * types here; office exams belong to the academic lead). One PageHeader with the screen's primary
 * action, **New test**, and **Export CSV** as its secondary (§4.4); ExamCycleManager renders its board without a
 * second header (F25) and opens its create dialog when `newRequest` changes. The cross-school question network
 * moved to AI assistant (M68).
 */
export default function TeacherTestsPage() {
  const ui = useUiText();
  const { data } = useTeacherData();
  const [newRequest, setNewRequest] = useState(0);
  const tests: any[] = data?.exams || [];

  /* The tests in the teacher's classes with their marks progress, translated headers and statuses (UTF-8 BOM so
     Arabic and Urdu names open correctly in spreadsheet apps). */
  const exportCsv = () => {
    const rows: string[][] = [[ui("Test"), ui("Class"), ui("Subject"), ui("Term"), ui("Status"), ui("Marks entered"), ui("Marks missing")]];
    for (const test of tests) {
      rows.push([
        test.title || "",
        classLabel(test.class) || "",
        test.subject?.name || ui("All subjects"),
        test.term || "",
        ui(formatStatus(test.isLocked && !test.status ? "LOCKED" : test.status)),
        String(test.enteredMarks ?? 0),
        String(test.missingMarks ?? 0),
      ]);
    }
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "tests-and-quizzes.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TeacherPage
      icon={ClipboardList}
      title="Tests & quizzes"
      description="Create quizzes and class tests, enter their marks, then lock them when you have finished. Your academic lead locks term exams and publishes results."
      primaryAction={{ id: "new-test", label: "New test", icon: Plus, onClick: () => setNewRequest((n) => n + 1) }}
      secondaryActions={[{ id: "export-tests", label: "Export CSV", icon: Download, onClick: exportCsv, disabled: !tests.length, disabledReason: "No tests to export yet." }]}
    >
      <ExamCycleManager role="TEACHER" hideHeading newRequest={newRequest} />
    </TeacherPage>
  );
}
