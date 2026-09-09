import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { StudentShell } from "./student-shell";
import { StudentDataProvider } from "./student-data-context";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Student | SkooleeAI".
  title: "Student",
};

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  // The shell and every page inside it are client components that fetch their
  // own data, so this is the only server-side check that a session still exists.
  await requirePageSession();

  return (
    <StudentDataProvider>
      <StudentShell>{children}</StudentShell>
    </StudentDataProvider>
  );
}
