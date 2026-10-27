"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewTabs, type ViewTabItem } from "@/components/ui/view-tabs";
import { FEE_TABS, type FeeTab, type PanelCommand } from "./fee-types";
import { forwardCommand } from "./fee-utils";
import { FeeOverviewTab } from "./FeeOverviewTab";
import { FeeStructuresTab } from "./FeeStructuresTab";
import { FeeInvoicesTab } from "./FeeInvoicesTab";
import { FeePaymentsTab } from "./FeePaymentsTab";
import { FeeReportsTab } from "./FeeReportsTab";
import { AccountsTab } from "./AccountsTab";
import { TaxPackages } from "@/components/tax/tax-packages";

const LABELS: Record<FeeTab, string> = {
  overview: "Overview",
  structures: "Fee setup",
  invoices: "Invoices",
  payments: "Collect",
  reports: "Reports & reminders",
  accounts: "Accounts & ledger",
  tax: "Tax packages",
};

/** The tabs a viewer gets: `tabs` filtered to known ids, or every tab but tax. */
function allowedTabs(tabs?: readonly FeeTab[]): FeeTab[] {
  return tabs?.length ? tabs.filter((tab) => FEE_TABS.includes(tab)) : FEE_TABS.filter((tab) => tab !== "tax");
}

/**
 * The fee tab row as `ViewTabs` items (EN UI keys), for a console that renders the row in its PageHeader `tabs`
 * slot (§4.3) and passes `hideTabs` + `tab` / `onTabChange` to `FeesPanel`, so the screen has one tab row, in the header.
 */
export function feeTabItems(tabs?: readonly FeeTab[]): ViewTabItem[] {
  return allowedTabs(tabs).map((tab) => ({ id: tab, label: LABELS[tab] }));
}

/** Read `?tab=` without a router round trip; unknown or disallowed ids fall back. */
function tabFromUrl(allowed: readonly FeeTab[]): FeeTab | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("tab");
  return value && (allowed as readonly string[]).includes(value) ? (value as FeeTab) : null;
}

/** Keep `?tab=` in step with the visible tab, the same way `useConsoleView().setTab` does. */
function writeTab(tab: FeeTab) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") === tab) return;
  params.set("tab", tab);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  window.dispatchEvent(new Event("skoolee:workspace-view-change"));
}

/** Which tab a header command belongs to; any other command goes to the tab that is open. */
const COMMAND_TAB: Record<string, FeeTab> = { "record-payment": "payments", "bank-import": "payments", "generate-invoices": "invoices", "send-reminders": "reports" };

/**
 * Header commands this panel has already routed. The admin console keeps its last command while the Fees view
 * unmounts, so a remounted FeesPanel must not route "Record payment" again (P8-02). A new press is a new object.
 */
const routedCommands = new WeakSet<PanelCommand>();

/**
 * Family tuition for one campus (role-ux §3.1 admin · fees, §10.11).
 *
 * `tabs` decides what this viewer works with: a campus admin holding the finance desk (no accountant on the
 * campus) gets every tab including tax drafting; otherwise the campus admin follows collection (overview,
 * invoices with refund approvals inside the invoice drawer, reports) while the accountant records payments.
 * Write controls appear only when `payments` is among the tabs (the finance desk), so a reader is never shown
 * a button the server will refuse. `command` lets the console's PageHeader run "Record payment" etc.
 *
 * One tab row only (§3.1: tabs never nest a second level): the tabs that have sections of their own (Fee setup,
 * Reports, Accounts) show them as a labelled section picker in their toolbar, not as a second strip of tabs.
 * A header command is handed to the one tab it belongs to, once; changing tab drops it, so a tab opened later
 * never replays it.
 */
export function FeesPanel({ campusId, tabs, initialTab, command, tab: controlledTab, onTabChange, hideTabs = false }: {
  campusId?: string;
  tabs?: FeeTab[];
  initialTab?: FeeTab;
  command?: PanelCommand | null;
  /** Controlled tab (the console keeps `?tab=`); with `onTabChange` the panel never writes the URL itself. */
  tab?: FeeTab | string | null;
  onTabChange?: (tab: FeeTab) => void;
  /** The console renders the tab row in its PageHeader (`feeTabItems`), so the panel draws none. */
  hideTabs?: boolean;
}) {
  // Keyed on the tab ids, not the array: a console passing a fresh array literal on every render must not re-run
  // the URL and command effects below.
  const tabsKey = (tabs ?? []).join(",");
  const allowed = useMemo<FeeTab[]>(() => allowedTabs(tabsKey ? (tabsKey.split(",") as FeeTab[]) : undefined), [tabsKey]);
  const financeDesk = allowed.includes("payments");
  const fallback = initialTab && allowed.includes(initialTab) ? initialTab : allowed[0];
  const [activeTab, setActiveTab] = useState<FeeTab>(fallback);
  const [forwarded, setForwarded] = useState<{ tab: FeeTab; command: PanelCommand } | null>(null);
  const controlled = Boolean(onTabChange);
  const wanted = controlled ? ((controlledTab as FeeTab | null | undefined) ?? fallback) : activeTab;
  const current = allowed.includes(wanted) ? wanted : fallback;
  const currentRef = useRef(current);
  const onTabChangeRef = useRef(onTabChange);
  // React Compiler forbids mutating a ref during render; sync after commit.
  useEffect(() => {
    currentRef.current = current;
    onTabChangeRef.current = onTabChange;
  });

  // First paint uses the fallback (server and client agree); the URL tab is applied after mount. A controlled
  // panel takes its tab from the console instead.
  useEffect(() => {
    if (controlled) return;
    const fromUrl = tabFromUrl(allowed);
    if (fromUrl) setActiveTab(fromUrl);
  }, [allowed, controlled]);

  /** Show `tab`: through the console when it owns the tab, otherwise here (keeping `?tab=` in step). */
  const show = useCallback((tab: FeeTab) => {
    if (onTabChangeRef.current) onTabChangeRef.current(tab);
    else {
      setActiveTab(tab);
      writeTab(tab);
    }
  }, []);

  const select = useCallback((tab: FeeTab) => {
    show(tab);
    setForwarded(null);
  }, [show]);

  // Header commands: "Record payment" opens Collect, "Generate invoices" opens Invoices; anything else goes to the
  // open tab. A command whose tab this viewer does not have is dropped (never shown-then-refused).
  useEffect(() => {
    if (!command || routedCommands.has(command)) return;
    routedCommands.add(command);
    const target = COMMAND_TAB[command.id] ?? currentRef.current;
    if (!allowed.includes(target)) return;
    if (target !== currentRef.current) show(target);
    const copy = forwardCommand(command);
    if (copy) setForwarded({ tab: target, command: copy });
  }, [command, allowed, show]);

  const commandFor = (tab: FeeTab) => (forwarded?.tab === tab ? forwarded.command : null);

  return (
    <div className="space-y-5">
      {allowed.length > 1 && !hideTabs ? (
        <ViewTabs
          ariaLabel="Fee sections"
          value={current}
          onChange={(id) => select(id as FeeTab)}
          items={allowed.map((tab) => ({ id: tab, label: LABELS[tab] }))}
        />
      ) : null}

      {current === "overview" && (
        <FeeOverviewTab campusId={campusId} onNavigate={(tab) => { if (allowed.includes(tab)) select(tab); }} />
      )}
      {current === "structures" && <FeeStructuresTab campusId={campusId} sectionNav="picker" />}
      {current === "invoices" && <FeeInvoicesTab campusId={campusId} readOnly={!financeDesk} command={commandFor("invoices")} />}
      {current === "payments" && <FeePaymentsTab campusId={campusId} command={commandFor("payments")} />}
      {current === "reports" && <FeeReportsTab campusId={campusId} readOnly={!financeDesk} command={commandFor("reports")} sectionNav="picker" />}
      {current === "accounts" && <AccountsTab campusId={campusId} sectionNav="picker" />}
      {current === "tax" && <TaxPackages mode="draft" />}
    </div>
  );
}
