"use client";

import { useRef, useState } from "react";
import { Header } from "@/components/layout/header";
import { Plus, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeeManagementPanel, type FeeManagementPanelHandle } from "@/components/billing/FeeManagementPanel";

export default function FeesPage() {
  const feePanelRef = useRef<FeeManagementPanelHandle>(null);
  const [feeReady, setFeeReady] = useState(false);
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => feePanelRef.current?.openFeeStructure()} disabled={!feeReady}>
        <WalletCards className="h-4 w-4" /> Fee Structure
      </Button>
      <Button size="sm" onClick={() => feePanelRef.current?.openGenerateInvoices()} disabled={!feeReady}>
        <Plus className="h-4 w-4" /> Generate Invoices
      </Button>
    </div>
  );
  return <div className="flex-1 flex flex-col">
    <Header title="Fees" description="Family tuition, fee structures, invoices, and payment recording" actions={actions} />
    <div className="p-6"><FeeManagementPanel ref={feePanelRef} onReadyChange={setFeeReady} /></div>
  </div>;
}
