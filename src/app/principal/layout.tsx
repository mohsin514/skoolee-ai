import type { Metadata } from "next";
import OperationalLayout from "@/app/operational-layout";
import { PrincipalDataProvider } from "./principal-data-context";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Principal | SkooleeAI".
  title: "Principal",
};

export default function PrincipalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrincipalDataProvider>
      <OperationalLayout>{children}</OperationalLayout>
    </PrincipalDataProvider>
  );
}
