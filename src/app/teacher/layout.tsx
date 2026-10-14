import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { getDisplayLocale } from "@/lib/locale/display";
import { TeacherShell } from "./teacher-shell";
import { TeacherDataProvider } from "./teacher-data-context";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Teacher | SkooleeAI".
  title: "Teacher",
};

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  // The shell and every page inside it are client components that fetch their
  // own data, so this is the only server-side check that a session still exists.
  const user = await requirePageSession();

  // Server-seeded so the shell's first paint has the right language; the shell's own provider becomes a passthrough.
  return (
    <LocaleProvider initialLocale={await getDisplayLocale(user)}>
      <TeacherDataProvider>
        <TeacherShell>{children}</TeacherShell>
      </TeacherDataProvider>
    </LocaleProvider>
  );
}
