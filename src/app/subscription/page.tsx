import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { canPurchaseSubscription } from "@/lib/api/scope";
import { PlansPanel } from "@/components/billing/PlansPanel";
import { SubscriptionLifecyclePanel } from "@/components/billing/SubscriptionLifecyclePanel";
import { SubscriptionHeader } from "./subscription-header";

export default async function SubscriptionPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (!canPurchaseSubscription(user)) redirect("/403");
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8"><SubscriptionHeader /><SubscriptionLifecyclePanel /><PlansPanel /></main>;
}
