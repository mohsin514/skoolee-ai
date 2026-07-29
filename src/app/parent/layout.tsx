import { Suspense } from "react";

export const metadata = {
  title: "Parent Portal - SkooleeAI",
  description: "View your child's academic results, attendance, and fee status",
};

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
