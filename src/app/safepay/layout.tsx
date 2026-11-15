import type { ReactNode } from "react";
import { notFound } from "next/navigation";

// SKAI-2156: the sandbox card form is development-only, like /api/safepay/simulate. In production it must not
// render at all (it showed a SafePay-branded card form with an amount taken from the URL).
export default function SafePaySandboxLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
