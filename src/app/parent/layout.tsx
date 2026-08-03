import { Suspense } from "react";
import { ParentDataProvider } from "./parent-data-context";
import { ParentShell } from "./parent-shell";

export const metadata = {
  title: "Parent Portal - SkooleeAI",
  description: "View your child's academic results, attendance, and fee status",
};

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ParentDataProvider>
        <ParentShell>{children}</ParentShell>
      </ParentDataProvider>
    </Suspense>
  );
}