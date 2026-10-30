import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/require-page-session";
import OperationalLayout from "@/app/operational-layout";
import { PrincipalDataProvider } from "./principal-data-context";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Academic console | SkooleeAI" (§1.5 console names).
  title: "Academic console",
};

export default async function PrincipalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  return (
    <PrincipalDataProvider key={JSON.stringify([user.userId, user.schoolId, user.campusId, user.role, user.accessVersion ?? 0])}>
      <OperationalLayout>{children}</OperationalLayout>
    </PrincipalDataProvider>
  );
}
