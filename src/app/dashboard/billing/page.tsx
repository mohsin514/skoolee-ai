import { Header } from "@/components/layout/header";
import { PlansPanel } from "@/components/billing/PlansPanel";
import { SubscriptionLifecyclePanel } from "@/components/billing/SubscriptionLifecyclePanel";

export default function BillingPage() {
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Billing & plan" description="Institution software subscription, usage, software invoices, and renewal. Family tuition is under Fees." />
      <div className="p-6 space-y-6">
        <SubscriptionLifecyclePanel />
        <PlansPanel />
      </div>
    </div>
  );
}
