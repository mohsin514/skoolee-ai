"use client";

import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  FileText,
  Loader2,
  Receipt,
  Wallet,
  Landmark,
} from "lucide-react";
import type { FeeTab } from "./fee-types";
import { FeeOverviewTab } from "./FeeOverviewTab";
import { FeeStructuresTab } from "./FeeStructuresTab";
import { FeeInvoicesTab } from "./FeeInvoicesTab";
import { FeePaymentsTab } from "./FeePaymentsTab";
import { FeeReportsTab } from "./FeeReportsTab";
import { AccountsTab } from "./AccountsTab";

const TABS: { key: FeeTab; label: string; icon: typeof Receipt }[] = [
  { key: "overview", label: "Overview", icon: Receipt },
  { key: "structures", label: "Structures", icon: BookOpen },
  { key: "invoices", label: "Invoices", icon: FileText },
  { key: "payments", label: "Payments", icon: Wallet },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "accounts", label: "Accounts", icon: Landmark },
];

export function FeesPanel({ campusId }: { campusId?: string }) {
  const [activeTab, setActiveTab] = useState<FeeTab>("overview");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? "bg-white text-[#8127cf] shadow-sm"
                  : "text-[#4d4354]/50 hover:text-[#8127cf]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <FeeOverviewTab campusId={campusId} onNavigate={setActiveTab} />
      )}
      {activeTab === "structures" && (
        <FeeStructuresTab campusId={campusId} />
      )}
      {activeTab === "invoices" && (
        <FeeInvoicesTab campusId={campusId} />
      )}
      {activeTab === "payments" && (
        <FeePaymentsTab campusId={campusId} />
      )}
      {activeTab === "reports" && (
        <FeeReportsTab campusId={campusId} />
      )}
      {activeTab === "accounts" && (
        <AccountsTab campusId={campusId} />
      )}
    </div>
  );
}
