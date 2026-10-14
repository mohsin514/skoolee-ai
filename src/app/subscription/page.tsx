import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { canPurchaseSubscription } from "@/lib/api/scope";
import { PlansPanel } from "@/components/billing/PlansPanel";
import { SubscriptionLifecyclePanel } from "@/components/billing/SubscriptionLifecyclePanel";
import Link from "next/link";

export default async function SubscriptionPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (!canPurchaseSubscription(user)) redirect("/403");
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8"><Link href="/memberships">Memberships</Link><h1 className="text-3xl font-bold">Billing &amp; plan</h1><p>You have explicit authority to manage this institution’s software subscription. Tuition and employment appointments are managed separately.</p><SubscriptionLifecyclePanel /><PlansPanel /></main>;
}
