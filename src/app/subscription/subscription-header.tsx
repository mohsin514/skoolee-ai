"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";

export function SubscriptionHeader() {
  const ui = useUiText();
  return (
    <header className="sk-enter space-y-3">
      <Link
        href="/memberships"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl text-sm font-semibold text-primary"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0 rtl:rotate-180" />
        <span className="sk-link">{ui("Memberships")}</span>
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{ui("Billing & plan")}</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{ui("You have explicit authority to manage this institution’s software subscription. Tuition and employment appointments are managed separately.")}</p>
    </header>
  );
}
