import type { Metadata } from "next";
import { StudentShell } from "./student-shell";
import { StudentDataProvider } from "./student-data-context";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Student | SkooleeAI".
  title: "Student",
};

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudentDataProvider>
      <StudentShell>{children}</StudentShell>
    </StudentDataProvider>
  );
}
