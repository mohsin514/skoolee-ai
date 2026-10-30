"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, BookOpenCheck, CalendarCheck, Calculator, Download, FileText, Landmark, Layers, Plus, Receipt, Upload, Wallet } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { getOperationsStaffDashboardData } from "@/app/actions/dashboard";
import { RoleShell } from "@/components/role-dashboard";
import { useConsoleView } from "@/components/nav/useConsoleView";
import { ConsoleError, ConsolePage, ConsoleSkeleton } from "@/components/operations/console-page";
import { ViewTabs } from "@/components/ui/view-tabs";
import { FEE_SETUP_CREATE, FEE_SETUP_TABS, FeeStructuresTab, feeSetupSection } from "@/components/fees/FeeStructuresTab";
import { FeeInvoicesTab } from "@/components/fees/FeeInvoicesTab";
import { FeePaymentsTab, type PaymentsSection } from "@/components/fees/FeePaymentsTab";
import { FeeReportsTab, REPORT_TABS, type ReportTab } from "@/components/fees/FeeReportsTab";
import { ACCOUNTS_CREATE, ACCOUNTS_TABS, AccountsTab, accountsSection } from "@/components/fees/AccountsTab";
import type { PanelCommand } from "@/components/fees/fee-types";
import { PayrollRunsPanel } from "@/components/payroll/payroll-runs-panel";
import { TaxPackages } from "@/components/tax/tax-packages";
import { MyLeavePanel } from "@/components/leave/my-leave";
import { FinanceOverview } from "@/components/insights";
import { AdjustmentsQueue } from "@/components/fees/adjustments-panel";
import { LocaleCurrencyReview } from "@/components/settings/LocaleSettingsPanel";
import { SetupPrompt } from "@/components/ai-workflows/setup-prompt";

/**
 * Finance desk (ACCOUNTANT) — role-ux §3 `accountant`, §3.1, §4.4.
 *
 * Navigation, the eyebrow, mobile slots and the account menu (My leave) come from the registry; this page only
 * renders the selected view inside one PageHeader. The accountant records and requests; refunds, waivers,
 * payroll and tax sign-off are decided by the campus admin or the school's administrator, and the screens say so.
 * A load failure stays inside the console with a retry — it never signs the accountant out (M88).
 */

type OpsData = Awaited<ReturnType<typeof getOperationsStaffDashboardData>>;

const PAYMENT_TABS: { id: PaymentsSection; label: string }[] = [
  { id: "payments", label: "Payments" },
  { id: "bank-import", label: "Bank import" },
  { id: "reconciliation", label: "Reconciliation" },
];

/** One-sentence descriptions for views whose registry leaf has no `summary` (EN UI keys). */
const DESCRIPTIONS: Record<string, string> = {
  "fee-reports": "Find families behind on payments, send reminders and read collection by class and method.",
  accounts: "The chart of accounts, payment methods, bank accounts and the income and expense ledger.",
  tax: "Prepare invoice tax packages and their sample calculations; your school's administrator signs them off.",
  "fee-structures": "Fee types, groups, amounts, discounts, carry-forward, fine rules and class structures — usually set once a year.",
};

function campusLine(data: OpsData) {
  return `${data.campusName}${data.campusCity ? ` · ${data.campusCity}` : ""}`;
}

export default function AccountantPage() {
  const tr = useUiText();
  const { view, tab, setView, setTab, retiredNotice } = useConsoleView("accountant");
  const [data, setData] = useState<OpsData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await getOperationsStaffDashboardData());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <RoleShell
      console="accountant"
      activeView={view}
      onSelectView={setView}
      userName={data?.userName || tr("Accountant")}
      avatarSeed={data?.userEmail}
      logoUrl={data?.logoUrl}
      dashboardHref="/accountant"
    >
      {failed && !data ? (
        <ConsoleError title="The finance desk could not be loaded" onRetry={() => void load()} />
      ) : !data ? (
        <ConsoleSkeleton label="Loading the finance desk" />
      ) : (
        <AccountantWorkspace data={data} view={view} tab={tab} setView={setView} setTab={setTab} retiredNotice={retiredNotice} />
      )}
    </RoleShell>
  );
}

function AccountantWorkspace({ data, view, tab, setView, setTab, retiredNotice }: {
  data: OpsData;
  view: string;
  tab: string | null;
  setView: (view: string, tab?: string | null) => void;
  setTab: (tab: string | null) => void;
  retiredNotice: string | null;
}) {
  // A header action for a panel on this view (or the view it opens). Cleared when the view changes so a panel
  // that mounts later never replays it.
  const [command, setCommand] = useState<PanelCommand | null>(null);
  const [payrollReady, setPayrollReady] = useState(false);
  const [defaulterCount, setDefaulterCount] = useState<number | null>(null);
  const run = (id: string, target?: string) => {
    if (target && target !== view) setView(target);
    setCommand({ id, nonce: Date.now() });
  };
  useEffect(() => { setCommand(null); }, [view]);
  // A section id the view does not know (or an older alias such as `fee-structures&tab=layers`) is replaced in the
  // URL by the section actually shown, so the address and the screen never disagree.
  useEffect(() => {
    if (!tab) return;
    const shown = view === "fee-structures" ? feeSetupSection(tab) : view === "accounts" ? accountsSection(tab) : view === "fee-reports" ? (REPORT_TABS.some((item) => item.id === tab) ? tab : "defaulters") : view === "payments" ? (PAYMENT_TABS.some((item) => item.id === tab) ? tab : "payments") : tab;
    if (shown !== tab) setTab(shown);
  }, [view, tab, setTab]);
  const campusId = data.campusId;

  switch (view) {
    case "payments": {
      const section: PaymentsSection = PAYMENT_TABS.some((item) => item.id === tab) ? (tab as PaymentsSection) : "payments";
      return (
        <ConsolePage
          consoleId="accountant"
          view="payments"
          icon={Wallet}
          captureDesk
          // One primary per screen (§4.4, P8-14): "Record payment", except on Bank import where importing is the
          // task (its empty state repeats that primary, §4.5.7) and "Record payment" steps down to a secondary.
          primaryAction={section === "bank-import"
            ? { id: "bank-import", label: "Import bank statement", icon: Upload, onClick: () => run("bank-import") }
            : { id: "record-payment", label: "Record payment", icon: Plus, onClick: () => run("record-payment") }}
          secondaryActions={section === "bank-import"
            ? [{ id: "record-payment", label: "Record payment", icon: Plus, onClick: () => run("record-payment") }]
            : [
                { id: "bank-import", label: "Import bank statement", icon: Upload, onClick: () => run("bank-import") },
                ...(section === "payments" ? [{ id: "export", label: "Export", icon: Download, onClick: () => run("export") }] : []),
              ]}
          tabs={<ViewTabs ariaLabel="Collect sections" value={section} onChange={(id) => { setCommand(null); setTab(id); }} items={PAYMENT_TABS} />}
        >
          <FeePaymentsTab campusId={campusId} section={section} hideHeader command={command} />
        </ConsolePage>
      );
    }
    case "invoices":
      return (
        <ConsolePage
          consoleId="accountant"
          view="invoices"
          icon={FileText}
          primaryAction={{ id: "generate-invoices", label: "Generate invoices", icon: Plus, onClick: () => run("generate-invoices") }}
          secondaryActions={[{ id: "export", label: "Export", icon: Download, onClick: () => run("export") }]}
        >
          <FeeInvoicesTab campusId={campusId} hideHeader command={command} />
        </ConsolePage>
      );
    case "fee-reports": {
      // The reports are the PageHeader's tabs (§3.1, §4.3: one tab row, in the header).
      const report: ReportTab = REPORT_TABS.some((item) => item.id === tab) ? (tab as ReportTab) : "defaulters";
      return (
        <ConsolePage
          consoleId="accountant"
          view="fee-reports"
          icon={BarChart3}
          description={DESCRIPTIONS["fee-reports"]}
          primaryAction={{ id: "send-reminders", label: "Send reminders", disabled: report === "defaulters" && defaulterCount === 0, disabledReason: "No families are behind on payments.", onClick: () => run("send-reminders") }}
          // The payment-method breakdown has no export; the defaulters and collection reports do.
          secondaryActions={report === "methods" ? [] : [{ id: "export", label: "Export CSV", icon: Download, onClick: () => run("export") }]}
          tabs={<ViewTabs ariaLabel="Fee reports" value={report} onChange={(id) => { setCommand(null); setTab(id); }} items={REPORT_TABS} />}
        >
          <FeeReportsTab onDefaulterCountChange={setDefaulterCount} campusId={campusId} hideHeader command={command} tab={report} onTabChange={(next) => setTab(next)} sectionNav="none" />
        </ConsolePage>
      );
    }
    case "accounts": {
      // The open section's create action is the one primary (role-ux §4.4b: Add account on the chart); the profit
      // report has none. Switching section drops a pending command.
      const section = accountsSection(tab);
      const create = ACCOUNTS_CREATE[section];
      // "Export ledger" (§4.4b): the income, expense and profit sections export exactly their filtered rows; the
      // setup sections export the whole ledger in the campus currency.
      const filteredExport = section === "income" || section === "expense" || section === "profit";
      const ledgerUrl = `/api/accounts/ledger?${new URLSearchParams({ format: "csv", ...(campusId ? { campusId } : {}) })}`;
      return (
        <ConsolePage
          consoleId="accountant"
          view="accounts"
          icon={BookOpenCheck}
          description={DESCRIPTIONS.accounts}
          primaryAction={create ? { id: "create", label: create, icon: Plus, onClick: () => run("create") } : undefined}
          secondaryActions={[{ id: "export-ledger", label: "Export ledger", icon: Download, onClick: () => (filteredExport ? run("export") : window.location.assign(ledgerUrl)) }]}
          tabs={<ViewTabs ariaLabel="Accounts sections" value={section} onChange={(id) => { setCommand(null); setTab(id); }} items={ACCOUNTS_TABS} />}
        >
          <AccountsTab campusId={campusId} hideHeader command={command} tab={section} onTabChange={(next) => { setCommand(null); setTab(next); }} sectionNav="none" />
        </ConsolePage>
      );
    }
    case "tax":
      return (
        <ConsolePage
          consoleId="accountant"
          view="tax"
          icon={Receipt}
          description={DESCRIPTIONS.tax}
          primaryAction={{ id: "new-package", label: "New tax package", icon: Plus, onClick: () => run("new-package") }}
          secondaryActions={[{ id: "export", label: "Export", icon: Download, onClick: () => run("export") }]}
        >
          <TaxPackages mode="draft" hideHeader command={command} />
        </ConsolePage>
      );
    case "payroll":
      return (
        <ConsolePage
          consoleId="accountant"
          view="payroll"
          icon={Landmark}
          primaryAction={{ id: "prepare-run", label: "Prepare run", icon: Plus, disabled: !payrollReady, disabledReason: "Prepare run is unavailable until a payroll policy is saved.", onClick: () => run("prepare-run") }}
          secondaryActions={[{ id: "export", label: "Export", icon: Download, onClick: () => run("export") }]}
        >
          <PayrollRunsPanel mode="prepare" hideHeader command={command} onPrepareAvailabilityChange={setPayrollReady} />
        </ConsolePage>
      );
    case "fee-structures": {
      // The open section's create action is the one primary (role-ux §4.4b); switching section drops a pending one.
      // The sections are the PageHeader's tabs (§3.1, §4.3); `?tab=layers` / `?tab=structures` (older ids) open the
      // first layer / the class structures and the URL is rewritten to the section shown (see the effect above).
      const section = feeSetupSection(tab);
      return (
        <ConsolePage
          consoleId="accountant"
          view="fee-structures"
          icon={Layers}
          description={DESCRIPTIONS["fee-structures"]}
          primaryAction={{ id: "create", label: FEE_SETUP_CREATE[section], icon: Plus, onClick: () => run("create") }}
          tabs={<ViewTabs ariaLabel="Fee setup sections" value={section} onChange={(id) => { setCommand(null); setTab(id); }} items={FEE_SETUP_TABS} />}
        >
          <FeeStructuresTab campusId={campusId} tab={section} onTabChange={(next) => { setCommand(null); setTab(next); }} command={command} hideCreate sectionNav="none" />
        </ConsolePage>
      );
    }
    case "my-leave":
      return (
        <ConsolePage consoleId="accountant" view="my-leave" icon={CalendarCheck}>
          <MyLeavePanel />
        </ConsolePage>
      );
    default: {
      // What is waiting on the accountant (§4.5.8). A school or campus currency change stays in FINANCE_REVIEW until
      // an accountant who did not make it decides (§2.1 row 9, P4-G2); that review renders nothing when there is
      // none, so the refund/credit queue is usually the only one shown.
      // The first-login sheet (AI Workflows, Slice 5) leads the queue until the books are set up.
      const queue = <><SetupPrompt /><LocaleCurrencyReview /><AdjustmentsQueue showEmpty /></>;
      return (
        <ConsolePage
          consoleId="accountant"
          view="dashboard"
          icon={Calculator}
          notice={retiredNotice}
          primaryAction={{ id: "record-payment", label: "Record payment", icon: Plus, onClick: () => run("record-payment", "payments") }}
          secondaryActions={[{ id: "generate-invoices", label: "Generate invoices", icon: FileText, onClick: () => run("generate-invoices", "invoices") }]}
        >
          {data.summary?.kind === "ACCOUNTANT" ? (
            <FinanceOverview summary={data.summary} campusLabel={campusLine(data)} onNavigate={(next) => setView(next)} queue={queue} />
          ) : (
            <div className="space-y-5">{queue}</div>
          )}
        </ConsolePage>
      );
    }
  }
}
