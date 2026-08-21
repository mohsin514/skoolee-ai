import type { Metadata } from "next";
import OperationalLayout from "@/app/operational-layout";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Platform Owner | SkooleeAI".
  title: "Platform Owner",
};

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <OperationalLayout>{children}</OperationalLayout>;
}
