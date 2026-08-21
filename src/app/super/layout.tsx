import type { Metadata } from "next";
import OperationalLayout from "@/app/operational-layout";
import { SuperAdminDataProvider } from "./super-data-context";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "School Administration | SkooleeAI".
  title: "School Administration",
};

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuperAdminDataProvider>
      <OperationalLayout>{children}</OperationalLayout>
    </SuperAdminDataProvider>
  );
}
