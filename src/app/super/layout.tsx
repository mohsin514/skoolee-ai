import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/require-page-session";
import OperationalLayout from "@/app/operational-layout";
import { SuperAdminDataProvider } from "./super-data-context";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "School Administration | SkooleeAI".
  title: "School Administration",
};

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  return (
    <SuperAdminDataProvider key={JSON.stringify([user.userId, user.schoolId, user.campusId, user.role, user.accessVersion ?? 0])}>
      <OperationalLayout>{children}</OperationalLayout>
    </SuperAdminDataProvider>
  );
}
