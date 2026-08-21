import type { Metadata } from "next";
import { TeacherShell } from "./teacher-shell";
import { TeacherDataProvider } from "./teacher-data-context";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Teacher | SkooleeAI".
  title: "Teacher",
};

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <TeacherDataProvider>
      <TeacherShell>{children}</TeacherShell>
    </TeacherDataProvider>
  );
}
