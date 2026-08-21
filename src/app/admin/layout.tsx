import type { Metadata } from "next";
import OperationalLayout from "@/app/operational-layout";

export const metadata: Metadata = {
  // §7.3: every route needs a distinct <title>. The root layout supplies
  // the "%s | SkooleeAI" template, so this renders as "Campus Admin | SkooleeAI".
  title: "Campus Admin",
};

export default OperationalLayout;
