"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UiText, useUiText, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { CurrencySelect } from "@/components/locale/CurrencySelect";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CreditCard,
  Download,
  Phone,
  Users,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ErrorState } from "@/components/ui/error-state";
import { SectionPicker } from "@/components/operations/console-page";
import type {
  CollectionReport,
  DefaulterRecord,
  PanelCommand,
  PaymentMethodBreakdown,
} from "./fee-types";
import {
  API,
  classLabel,
  exportCSV,
  formatPKR,
  paisaToRupees,
  forwardCommand,
  paymentMethodLabel,
  usePanelCommand,
} from "./fee-utils";

export type ReportTab = "defaulters" | "collection" | "methods";
/** Reports & reminders sections (also the accountant's PageHeader tabs). */
export const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "defaulters", label: "Defaulters" },
  { id: "collection", label: "Collection" },
  { id: "methods", label: "Payment methods" },
];

/**
 * Reports & reminders (role-ux §4.4 accountant · Reports & reminders: primary "Send reminders", secondary
 * "Export CSV"). `readOnly` is a campus admin following collection without the finance desk: reports only, no
 * reminders. `tab`/`onTabChange` let the console persist the report as `?tab=`; `command` runs
 * "send-reminders" or "export" from the PageHeader, which then owns those buttons (`hideHeader`).
 */
export function FeeReportsTab({ campusId, readOnly = false, command, hideHeader = false, tab, onTabChange, sectionNav = "picker", onDefaulterCountChange }: { campusId?: string; readOnly?: boolean; command?: PanelCommand | null; hideHeader?: boolean; tab?: string | null; onTabChange?: (tab: ReportTab) => void; sectionNav?: "picker" | "none"; onDefaulterCountChange?: (count: number | null) => void }) {
 const tr = useUiText();
  const [currency, setCurrency] = useState("");
  const [localTab, setLocalTab] = useState<ReportTab>("defaulters");
  const subTab: ReportTab = REPORT_TABS.some((item) => item.id === tab) ? (tab as ReportTab) : onTabChange ? "defaulters" : localTab;
  // A header command for another report first opens the report it belongs to. Changing report (here or in the
  // console's PageHeader tabs) drops it, so a report opened later never replays an old command.
  // Each forwarded command is tagged with the report it is for and reaches only that report.
  const [forwarded, setForwarded] = useState<{ report: ReportTab; command: PanelCommand } | null>(null);
  const select = (next: ReportTab) => { setLocalTab(next); onTabChange?.(next); setForwarded(null); };
  const forward = (report: ReportTab) => { const copy = forwardCommand(command); setForwarded(copy ? { report, command: copy } : null); };
  usePanelCommand(command, {
    "send-reminders": () => { select("defaulters"); forward("defaulters"); },
    export: () => forward(subTab),
  });
  const commandFor = (report: ReportTab) => (forwarded?.report === report ? forwarded.command : null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {hideHeader ? null : <h2 className="text-lg font-bold text-ink-strong"><UiText>{"Reports"}</UiText></h2>}
        <CurrencySelect value={currency} onChange={setCurrency} />
      </div>
      {/* One tab row per screen (§3.1): the accountant console shows these as PageHeader tabs ("none"); inside the
          campus admin's Fees tabs they are a report picker. */}
      {sectionNav === "picker" ? <SectionPicker label="Report" items={REPORT_TABS} value={subTab} onChange={select} /> : null}

      {subTab === "defaulters" && <DefaultersReport onCountChange={onDefaulterCountChange} campusId={campusId} currency={currency} readOnly={readOnly} command={commandFor("defaulters")} showToolbar={!hideHeader} />}
      {subTab === "collection" && <CollectionSummary campusId={campusId} currency={currency} command={commandFor("collection")} showToolbar={!hideHeader} />}
      {subTab === "methods" && <MethodBreakdown campusId={campusId} currency={currency} />}
    </div>
  );
}

function DefaultersReport({ campusId, currency, readOnly = false, command, showToolbar = true, onCountChange }: { onCountChange?: (count: number | null) => void; campusId?: string; currency: string; readOnly?: boolean; command?: PanelCommand | null; showToolbar?: boolean }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [defaulters, setDefaulters] = useState<DefaulterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  useEffect(() => { onCountChange?.(loading || failed ? null : defaulters.length); }, [loading, failed, defaulters.length, onCountChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams(currency ? { currency } : {});
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`${API}/reports/defaulters?${params}`);
      const json = await res.json();
      if (json.success) setDefaulters(json.data);
      else setFailed(true);
    } catch {
      // Shown in place with a retry (role-ux R4).
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [campusId, currency]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemind = async (studentId: string) => {
    setRemindingId(studentId);
    try {
      const res = await fetch(`${API}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr(json.data?.delivered ? tr("Reminder sent to {0}", [json.data.sentTo]) : "Reminder logged (channel unavailable)"));
      } else {
        toast.error(tr(json.error || "Reminder failed"));
      }
    } catch {
      toast.error(tr("Failed to send reminder"));
    } finally {
      setRemindingId(null);
    }
  };

  // One reminder per family, sent one after another so a failure names the families it missed.
  const remindAll = async () => {
    setSendingAll(true);
    let sent = 0, failedCount = 0;
    for (const d of defaulters) {
      try {
        const res = await fetch(`${API}/remind`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: d.studentId }) });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) sent += 1; else failedCount += 1;
      } catch { failedCount += 1; }
    }
    setSendingAll(false);
    setConfirmAll(false);
    if (failedCount) toast.warning(tr("{0} reminders sent; {1} could not be sent. Try those again from their rows.", [sent, failedCount]));
    else toast.success(tr("{0} reminders sent.", [sent]));
  };

  const handleExport = () => {
    if (defaulters.length === 0) { toast.info(tr("Nothing to export yet.")); return; }
    const rows = defaulters.map((d) => ({
      Student: d.studentName,
      "Roll No": d.rollNo ?? "",
      Class: classLabel(d.className, d.section),
      Guardian: d.guardianName ?? "",
      Phone: d.guardianPhone ?? "",
      Email: d.guardianEmail ?? "",
      "Total Due": paisaToRupees(d.totalDue, d.currency),
      "Total Paid": paisaToRupees(d.totalPaid, d.currency),
      "Overdue Amount": paisaToRupees(d.totalOverdue, d.currency),
      "Days Overdue": d.daysOverdue,
      "Overdue Invoices": d.overdueInvoices,
    }));
    exportCSV(rows, `defaulters-${new Date().toISOString().split("T")[0]}`);
  };

  usePanelCommand(command, {
    "send-reminders": () => { if (!readOnly && defaulters.length) setConfirmAll(true); else if (!defaulters.length) toast.info(tr("No families are behind on payments.")); },
    export: handleExport,
  }, !loading && !failed);

  const confirmDialog = (
    <ConfirmAction
      open={confirmAll}
      busy={sendingAll}
      tone="primary"
      title={tr("Send fee reminders to {0} families?", [defaulters.length])}
      description={tr("Each family with an overdue balance gets one reminder through their usual channel. Families are not told about other families.")}
      confirmLabel={tr("Send reminders")}
      cancelLabel={tr("Keep editing")}
      onConfirm={() => remindAll()}
      onCancel={() => setConfirmAll(false)}
    />
  );

  if (loading) {
    return (
      <div className="sk-panel overflow-hidden animate-skeleton-in">
        <div className="px-5 py-3 bg-muted/50">
          <div className="h-3 w-full max-w-md rounded-full bg-border-subtle/40 skeleton-shimmer" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 border-t border-muted">
            <div className="h-3.5 w-24 rounded-full bg-border-subtle/50 skeleton-shimmer" />
            <div className="h-3.5 w-20 rounded-full bg-border-subtle/40 skeleton-shimmer" />
            <div className="h-3.5 flex-1 rounded-full bg-border-subtle/30 skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (failed) {
    return <ErrorState title={tr("Defaulters could not be loaded")} description={tr("Check your connection and try again.")} onRetry={() => void load()} />;
  }

  if (defaulters.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={tr("No defaulters")}
        description={tr("All students are up to date on their payments.")}
      />
    );
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-muted tabular-nums">
          {tr("Defaulters")}: <bdi>{defaulters.length}</bdi>
        </p>
        {showToolbar ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExport}><Download className="size-4" aria-hidden="true" /><UiText>{"Export"}</UiText></Button>
            {readOnly ? null : <Button onClick={() => setConfirmAll(true)}><UiText>{"Send reminders"}</UiText></Button>}
          </div>
        ) : null}
      </div>

      <div className="sk-panel sk-rise overflow-x-auto" data-tour="accountant.reports.remind">
        <div className="min-w-[760px]">
        <div className="grid grid-cols-[1fr_120px_100px_100px_80px_80px_110px] gap-3 px-5 py-3 bg-muted/50 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
          <span><UiText>{"Student"}</UiText></span>
          <span><UiText>{"Guardian"}</UiText></span>
          <span><UiText>{"Overdue"}</UiText></span>
          <span><UiText>{"Total Due"}</UiText></span>
          <span><UiText>{"Days"}</UiText></span>
          <span><UiText>{"Invoices"}</UiText></span>
          <span></span>
        </div>
        <div className="divide-y divide-muted">
          {defaulters.map((d) => (
            <div
              key={d.studentId}
              className="grid grid-cols-[1fr_120px_100px_100px_80px_80px_110px] gap-3 px-5 py-3 items-center tabular-nums hover:bg-surface-hover transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink-strong truncate">{d.studentName}</p>
                <p className="text-2xs font-bold text-ink-subtle">
                  {d.rollNo ? `${d.rollNo} · ` : ""}{classLabel(d.className, d.section)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-2xs font-bold text-ink-muted truncate">{d.guardianName ?? "—"}</p>
                {d.guardianPhone && (
                  <p className="text-2xs font-bold text-ink-subtle flex items-center gap-0.5">
                    <Phone className="w-2.5 h-2.5" />
                    {d.guardianPhone}
                  </p>
                )}
              </div>
              <p className="text-xs font-bold text-status-error-text tabular-nums">{formatPKR(d.totalOverdue, d.currency)}</p>
              <p className="text-xs font-bold text-ink-muted tabular-nums">{formatPKR(d.totalDue, d.currency)}</p>
              <Badge size="sm" className="w-fit tabular-nums" variant={d.daysOverdue > 30 ? "danger" : d.daysOverdue > 15 ? "warning" : "info"}>
                {d.daysOverdue}d
              </Badge>
              <p className="text-xs font-bold text-ink-muted">{d.overdueInvoices}</p>
              {readOnly ? <span /> : (
                <Button variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => handleRemind(d.studentId)}
                  disabled={remindingId !== null || sendingAll}
                  loading={remindingId === d.studentId}
                >
                  {tr("Send reminder")}
                </Button>
              )}
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

function CollectionSummary({ campusId, currency, command, showToolbar = true }: { campusId?: string; currency: string; command?: PanelCommand | null; showToolbar?: boolean }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [data, setData] = useState<CollectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams(currency ? { currency } : {});
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`${API}/reports/collection?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data.byClass);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [campusId, currency]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = () => {
    if (data.length === 0) { toast.info(tr("Nothing to export yet.")); return; }
    const rows = data.map((d) => ({
      Class: d.className,
      Students: d.totalStudents,
      "Total Due": paisaToRupees(d.totalDue, d.currency),
      "Total Paid": paisaToRupees(d.totalPaid, d.currency),
      "Total Overdue": paisaToRupees(d.totalOverdue, d.currency),
      "Collection Rate": `${d.collectionRate}%`,
    }));
    exportCSV(rows, `collection-${new Date().toISOString().split("T")[0]}`);
  };
  usePanelCommand(command, { export: handleExport }, !loading && !failed);

  if (loading) {
    return (
      <div className="space-y-4 animate-skeleton-in">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="sk-panel px-4 py-3">
              <div className="h-2.5 w-16 rounded-full bg-border-subtle/40 skeleton-shimmer mb-2" />
              <div className="h-5 w-20 rounded-full bg-border-subtle/50 skeleton-shimmer" />
            </div>
          ))}
        </div>
        <div className="sk-panel overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 border-t border-muted first:border-t-0">
              <div className="h-3.5 flex-1 rounded-full bg-border-subtle/40 skeleton-shimmer" />
              <div className="h-3.5 w-16 rounded-full bg-border-subtle/40 skeleton-shimmer" />
              <div className="h-2 w-24 rounded-full bg-border-subtle/30 skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (failed) {
    return <ErrorState title={tr("The collection report could not be loaded")} description={tr("Check your connection and try again.")} onRetry={() => void load()} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title={tr("No collection data")}
        description={tr("Generate invoices and record payments to see collection reports.")}
      />
    );
  }

  const totals = data.reduce(
    (acc, d) => ({
      students: acc.students + d.totalStudents,
      due: acc.due + d.totalDue,
      paid: acc.paid + d.totalPaid,
      overdue: acc.overdue + d.totalOverdue,
    }),
    { students: 0, due: 0, paid: 0, overdue: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-2xs font-bold text-ink-subtle">
          {data.length}<UiText>{"Classes"}</UiText>
        </p>
        {showToolbar ? <Button variant="outline" onClick={handleExport}><Download className="size-4" aria-hidden="true" /><UiText>{"Export"}</UiText></Button> : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-brand-50/50 px-4 py-3 border border-edge/10">
          <p className="sk-eyebrow"><UiText>{"Total Students"}</UiText></p>
          <p className="text-xl font-bold text-primary">{totals.students}</p>
        </div>
        <div className="rounded-2xl bg-status-info-surface px-4 py-3 border border-status-info-border">
          <p className="sk-eyebrow"><UiText>{"Total Due"}</UiText></p>
          <p className="text-xl font-bold tabular-nums text-status-info-text">{formatPKR(totals.due)}</p>
        </div>
        <div className="rounded-2xl bg-status-success-surface px-4 py-3 border border-status-success-border">
          <p className="sk-eyebrow"><UiText>{"Total Collected"}</UiText></p>
          <p className="text-xl font-bold tabular-nums text-status-success-text">{formatPKR(totals.paid)}</p>
        </div>
        <div className="rounded-2xl bg-status-error-surface px-4 py-3 border border-status-error-border">
          <p className="sk-eyebrow"><UiText>{"Total Overdue"}</UiText></p>
          <p className="text-xl font-bold tabular-nums text-status-error-text">{formatPKR(totals.overdue)}</p>
        </div>
      </div>

      <div className="sk-panel sk-rise overflow-x-auto" style={{ animationDelay: "80ms" }}>
        <div className="grid min-w-[620px] grid-cols-[1fr_80px_100px_100px_100px_90px] gap-3 px-5 py-3 bg-muted/50 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
          <span><UiText>{"Class"}</UiText></span>
          <span><UiText>{"Students"}</UiText></span>
          <span><UiText>{"Total Due"}</UiText></span>
          <span><UiText>{"Collected"}</UiText></span>
          <span><UiText>{"Overdue"}</UiText></span>
          <span><UiText>{"Rate"}</UiText></span>
        </div>
        <div className="divide-y divide-muted">
          {data.map((d) => (
            <div
              key={d.className}
              className="grid min-w-[620px] grid-cols-[1fr_80px_100px_100px_100px_90px] gap-3 px-5 py-3 items-center tabular-nums hover:bg-surface-hover transition-colors"
            >
              <p className="text-xs font-bold text-ink-strong">{d.className}</p>
              <p className="text-xs font-medium text-ink-muted tabular-nums">{d.totalStudents}</p>
              <p className="text-xs font-medium text-ink-muted tabular-nums">{formatPKR(d.totalDue, d.currency)}</p>
              <p className="text-xs font-medium text-status-success-text tabular-nums">{formatPKR(d.totalPaid, d.currency)}</p>
              <p className="text-xs font-bold text-status-error-text">{formatPKR(d.totalOverdue, d.currency)}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      d.collectionRate >= 80
                        ? "bg-status-success-text"
                        : d.collectionRate >= 50
                        ? "bg-status-warning-text"
                        : "bg-status-error-text"
                    }`}
                    style={{ width: `${d.collectionRate}%` }}
                  />
                </div>
                <span className="text-2xs font-bold text-ink-muted w-8 text-end tabular-nums">
                  {d.collectionRate}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MethodBreakdown({ campusId, currency }: { campusId?: string; currency: string }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [data, setData] = useState<PaymentMethodBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams(currency ? { currency } : {});
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`${API}/reports/collection?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data.byMethod);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [campusId, currency]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 animate-skeleton-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="sk-panel p-5 animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="h-3.5 w-20 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                <div className="h-3 w-10 rounded-full bg-border-subtle/40 skeleton-shimmer" />
              </div>
              <div className="h-5 w-24 rounded-full bg-border-subtle/50 skeleton-shimmer mb-3" />
              <div className="h-2 w-full rounded-full bg-border-subtle/30 skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (failed) {
    return <ErrorState title={tr("Payment method data could not be loaded")} description={tr("Check your connection and try again.")} onRetry={() => void load()} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title={tr("No payment data")}
        description={tr("Record payments to see the method breakdown.")}
      />
    );
  }

  const methodColors: Record<string, string> = {
    cash: "bg-status-success-text",
    bank_transfer: "bg-status-info-text",
    card: "bg-primary",
    mobile_wallet: "bg-status-warning-text",
    cheque: "bg-ink-subtle",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map((m, i) => (
          <div
            key={m.method}
            className="sk-panel sk-rise p-5 transition-all hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-ink-strong">
                {tr(paymentMethodLabel(m.method))}
              </p>
              <Badge variant="neutral" size="sm" className="tabular-nums">{m.count} <UiText>{"txns"}</UiText></Badge>
            </div>
            <p className="text-xl font-bold text-primary mb-2 tabular-nums">{formatPKR(m.total, m.currency)}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${methodColors[m.method] ?? "bg-ink-subtle"}`}
                  style={{ width: `${m.percentage}%` }}
                />
              </div>
              <span className="text-xs font-bold text-ink-muted">{m.percentage}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
