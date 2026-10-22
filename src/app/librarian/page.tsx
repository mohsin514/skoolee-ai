"use client";

import { useCallback, useEffect, useState } from "react";
import { BookCopy, Plus, RotateCcw, ScanLine } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { getOperationsStaffDashboardData } from "@/app/actions/dashboard";
import { RoleShell } from "@/components/role-dashboard";
import { useConsoleView } from "@/components/nav/useConsoleView";
import { ConsoleError, ConsolePage, ConsoleSkeleton } from "@/components/operations/console-page";
import { LendingDesk } from "@/components/library/lending-desk";
import { CATALOGUE_CREATE, CATALOGUE_TABS, LibraryPanel } from "@/components/operations";
import { ViewTabs } from "@/components/ui/view-tabs";
import { MyLeavePanel } from "@/components/leave/my-leave";
import { LibraryOverview } from "@/components/insights";
import type { PanelCommand } from "@/components/fees/fee-types";

/**
 * Library (LIBRARIAN) — role-ux §3 `librarian`: Today · Lending desk · Catalogue & members · Messages, with My
 * leave in the account menu. Inventory belongs to the campus admin (M83; the old `?view=inventory` lands on Today
 * with a notice) and the broken Issues tab is gone (M84): the lending desk issues, renews and returns.
 */

type OpsData = Awaited<ReturnType<typeof getOperationsStaffDashboardData>>;

const DESCRIPTIONS: Record<string, string> = {
  dashboard: "Books on loan, overdue items and charges waiting.",
  lending: "Issue, renew and return by scanning a reader card and then each copy.",
  catalogue: "Add titles and members and keep categories tidy; barcoded copies are registered at the lending desk.",
};

function campusLine(data: OpsData) {
  return `${data.campusName}${data.campusCity ? ` · ${data.campusCity}` : ""}`;
}

export default function LibrarianPage() {
  const tr = useUiText();
  const { view, tab, setView, setTab, retiredNotice } = useConsoleView("librarian");
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
      console="librarian"
      activeView={view}
      onSelectView={setView}
      userName={data?.userName || tr("Librarian")}
      avatarSeed={data?.userEmail}
      logoUrl={data?.logoUrl}
      dashboardHref="/librarian"
    >
      {failed && !data ? (
        <ConsoleError title="The library could not be loaded" onRetry={() => void load()} />
      ) : !data ? (
        <ConsoleSkeleton label="Loading the library" cards={4} />
      ) : (
        <LibraryWorkspace data={data} view={view} tab={tab} setView={setView} setTab={setTab} retiredNotice={retiredNotice} />
      )}
    </RoleShell>
  );
}

function LibraryWorkspace({ data, view, tab, setView, setTab, retiredNotice }: {
  data: OpsData;
  view: string;
  tab: string | null;
  setView: (view: string, tab?: string | null) => void;
  setTab: (tab: string | null) => void;
  retiredNotice: string | null;
}) {
  const [command, setCommand] = useState<PanelCommand | null>(null);
  const run = (id: string, target?: string) => {
    if (target && target !== view) setView(target);
    setCommand({ id, nonce: Date.now() });
  };
  useEffect(() => { setCommand(null); }, [view]);

  switch (view) {
    case "lending":
      return (
        <ConsolePage
          consoleId="librarian"
          view="lending"
          description={DESCRIPTIONS.lending}
          captureDesk
          primaryAction={{ id: "scan", label: "Scan", icon: ScanLine, onClick: () => run("scan") }}
          secondaryActions={[{ id: "renew", label: "Renew", icon: RotateCcw, onClick: () => run("renew") }]}
        >
          <LendingDesk hideHeader command={command} />
        </ConsolePage>
      );
    case "catalogue": {
      // Titles · Members · Categories are the PageHeader's tabs (§3.1, §4.3). The open section's create action is the
      // one primary ("Add book" on Titles, §4.4; "Add member" / "Add category" on the others), so every section keeps
      // its way to add a record while the panel draws no second button.
      const section = CATALOGUE_TABS.some((item) => item.id === tab) ? (tab as keyof typeof CATALOGUE_CREATE) : "books";
      const create = CATALOGUE_CREATE[section];
      return (
        <ConsolePage
          consoleId="librarian"
          view="catalogue"
          description={DESCRIPTIONS.catalogue}
          primaryAction={{ id: create.id, label: create.label, icon: Plus, onClick: () => run(create.id) }}
          tabs={<ViewTabs ariaLabel="Catalogue sections" value={section} onChange={(id) => { setCommand(null); setTab(id); }} items={CATALOGUE_TABS} />}
        >
          <LibraryPanel hideIssues hideHeader command={command} tab={section} onTabChange={(next) => setTab(next)} sectionNav="none" />
        </ConsolePage>
      );
    }
    case "my-leave":
      return (
        <ConsolePage consoleId="librarian" view="my-leave">
          <MyLeavePanel />
        </ConsolePage>
      );
    default:
      return (
        <ConsolePage
          consoleId="librarian"
          view="dashboard"
          description={DESCRIPTIONS.dashboard}
          notice={retiredNotice}
          icon={BookCopy}
          primaryAction={{ id: "open-lending", label: "Open lending desk", icon: ScanLine, onClick: () => run("scan", "lending") }}
        >
          {data.summary?.kind === "LIBRARIAN" ? (
            <LibraryOverview summary={data.summary} campusLabel={campusLine(data)} onNavigate={(next) => setView(next)} />
          ) : null}
        </ConsolePage>
      );
  }
}
