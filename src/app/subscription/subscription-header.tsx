"use client";
import Link from "next/link";
import { useUiText } from "@/components/locale/LocaleProvider";

export function SubscriptionHeader() {
  const ui = useUiText();
  return <>
    <Link href="/memberships">{ui("Memberships")}</Link>
    <h1 className="text-3xl font-bold">{ui("Billing & plan")}</h1>
    <p>{ui("You have explicit authority to manage this institution’s software subscription. Tuition and employment appointments are managed separately.")}</p>
  </>;
}
