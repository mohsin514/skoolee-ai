import { Header } from "@/components/layout/header";
import { PlansPanel } from "@/components/billing/PlansPanel";
import { SubscriptionLifecyclePanel } from "@/components/billing/SubscriptionLifecyclePanel";

export default function BillingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header title="Billing & plan" description="Institution software subscription, usage, software invoices, and renewal. Family tuition is under Fees." />
      <div className="sk-stagger space-y-6 p-4 sm:p-6">
        <SubscriptionLifecyclePanel />
        <PlansPanel />
      </div>
    </div>
  );
}
