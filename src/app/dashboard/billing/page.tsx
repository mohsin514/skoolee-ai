"use client";

import { useRef, useState } from "react";
import { Header } from "@/components/layout/header";
import { Plus, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeeManagementPanel, type FeeManagementPanelHandle } from "@/components/billing/FeeManagementPanel";
import { PlansPanel } from "@/components/billing/PlansPanel";

interface BillingPageProps {
  embedded?: boolean;
  hideHeader?: boolean;
}

export default function BillingPage({ embedded = false, hideHeader = false }: BillingPageProps = {}) {
  const feePanelRef = useRef<FeeManagementPanelHandle>(null);
  const [feeReady, setFeeReady] = useState(false);

  const billingActions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => feePanelRef.current?.openFeeStructure()} disabled={!feeReady}>
        <WalletCards className="h-4 w-4" />
        Fee Structure
      </Button>
      <Button size="sm" onClick={() => feePanelRef.current?.openGenerateInvoices()} disabled={!feeReady}>
        <Plus className="h-4 w-4" />
        Generate Invoices
      </Button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col">
      {embedded ? (
        hideHeader ? null : (
        <div className="flex flex-col gap-4 border-b border-[#f3f4f9] p-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Owner billing control</p>
            <h2 className="mt-1 text-3xl font-black tracking-normal text-[#1f1a23]">Billing & Payments</h2>
            <p className="mt-2 text-sm font-semibold text-[#4d4354]/60">
              Fee structures, invoices, challans, payment recording, plan, and AI credit control.
            </p>
          </div>
          {billingActions}
        </div>
        )
      ) : (
        <Header
          title="Billing & Payments"
          description="Fee structures, invoices, challans, and payment recording"
          actions={billingActions}
        />
      )}

      <div className="p-6 space-y-6">
        <PlansPanel />
        <FeeManagementPanel ref={feePanelRef} onReadyChange={setFeeReady} />
      </div>
    </div>
  );
}
