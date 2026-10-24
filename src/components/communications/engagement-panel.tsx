"use client";

/**
 * Family communication log (SPEC §10.11, M36, M46).
 *
 * One self-fetching panel for two seats:
 *  - `office` (campus operations, `/admin?view=communications`): every message sent to families — fee
 *    reminders, report notices, announcements — with failed deliveries first to hand, and the manual
 *    "Run reminders" sweep behind a confirmation (it messages families).
 *  - `academic` (the principal, `/principal?view=engagement`, "Report delivery"): the read-only log of
 *    report and exam notices. The server narrows the same endpoint (GET /api/communications) for anyone
 *    who is not a campus operator, so the principal never sees fee reminders.
 *
 * The hosting console renders the PageHeader; this panel is the work beneath it. Load failures are an
 * inline ErrorState with retry (never a toast); the reminder sweep reports through one toast.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Download, Mail, MessageCircle, RefreshCw, Send, ShieldAlert, Smartphone, type LucideIcon } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoTip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

type DeliveryStatus = "PENDING" | "SENT" | "FAILED" | "NO_RECIPIENT" | "BLOCKED";
type Channel = "WHATSAPP" | "EMAIL" | "SMS";

interface Communication {
  id: string;
  templateKey: string;
  channel: Channel | string;
  recipientName?: string | null;
  recipient: string;
  body: string;
  status: DeliveryStatus | string;
  failedReason?: string | null;
  createdAt: string;
  sentAt?: string | null;
  student?: { fullName: string; rollNo?: string | null; class?: { name: string; section?: string | null } | null } | null;
}

type Filter = "ALL" | DeliveryStatus;

const STATUS_META: Record<Filter, { label: string; variant: NonNullable<BadgeProps["variant"]>; icon: LucideIcon }> = {
  ALL: { label: "All", variant: "neutral", icon: Clock },
  SENT: { label: "Sent", variant: "success", icon: CheckCircle2 },
  FAILED: { label: "Failed", variant: "danger", icon: AlertCircle },
  NO_RECIPIENT: { label: "No contact", variant: "warning", icon: AlertCircle },
  BLOCKED: { label: "Blocked", variant: "secondary", icon: ShieldAlert },
  PENDING: { label: "Pending", variant: "neutral", icon: Clock },
};
const FILTERS: Filter[] = ["ALL", "FAILED", "SENT", "NO_RECIPIENT", "BLOCKED", "PENDING"];

const CHANNEL_META: Record<string, { label: string; icon: LucideIcon }> = {
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  EMAIL: { label: "Email", icon: Mail },
  SMS: { label: "SMS", icon: Smartphone },
};

/** Plain-language names for the message templates families receive (EN UI keys). */
const TEMPLATE_LABELS: Record<string, string> = {
  REPORT_CARD_PUBLISHED: "Report card published",
  REPORT_CARD_GENERATED: "Report card ready for review",
  EXAM_SCHEDULE: "Exam date sheet",
  MARKS_ENTRY_DEADLINE_NEAR: "Marks entry deadline",
  FEE_DUE: "Fee due",
  FEE_OVERDUE: "Fee overdue",
  FEE_REMINDER: "Fee reminder",
  ATTENDANCE_ABSENT: "Absence notice",
  GENERAL_ANNOUNCEMENT: "Announcement",
  SCHOOL_AI_ANNOUNCEMENT: "Announcement",
  WHATSAPP_CHATBOT: "WhatsApp conversation",
  LEGACY_MESSAGE: "Message",
};
const humanize = (key: string) => key.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

export type EngagementCommand = { id: "run-reminders" | "export" | "refresh"; nonce: number };
export interface EngagementPanelProps {
  /** `office`: the full family-communication log with the manual reminder run. `academic`: report delivery, read only. */
  mode: "office" | "academic";
  /**
   * Host-owned header (§4.4b "Family communication": Run reminders (ConfirmAction) · Export; principal "Report
   * delivery": Export): `hideActions` drops the toolbar's Refresh / Export / Run reminders buttons (the status
   * filters stay) and the host's PageHeader runs them through `command` (a new nonce runs once).
   */
  hideActions?: boolean;
  command?: EngagementCommand;
}

export function EngagementPanel({ mode, hideActions = false, command }: EngagementPanelProps) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const office = mode === "office";
  const [filter, setFilter] = useState<Filter>("ALL");
  const [rows, setRows] = useState<Communication[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ status: filter });
    if (!office) params.set("scope", "academic");
    setLoading(true);
    setLoadError(false);
    fetch(`/api/communications?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Request failed");
        setRows(Array.isArray(body.communications) ? body.communications : []);
        setSummary(body.summary && typeof body.summary === "object" ? body.summary : {});
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setLoadError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, office, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  const totals = useMemo(() => [
    { key: "SENT", label: "Sent", value: summary.SENT ?? 0, icon: CheckCircle2, tile: "border-status-success-border bg-status-success-surface text-status-success-text" },
    { key: "FAILED", label: "Failed", value: summary.FAILED ?? 0, icon: AlertCircle, tile: "border-status-error-border bg-status-error-surface text-status-error-text", info: "Sending was tried and did not go through. The reason appears under the message." },
    { key: "BLOCKED", label: "Blocked", value: summary.BLOCKED ?? 0, icon: ShieldAlert, tile: "border-status-brand-border bg-status-brand-surface text-status-brand-text", info: "Held back before sending, for example because the plan does not include this channel, the school's plan is paused or approved school data is still needed." },
    { key: "NO_RECIPIENT", label: "No contact", value: summary.NO_RECIPIENT ?? 0, icon: MessageCircle, tile: "border-status-warning-border bg-status-warning-surface text-status-warning-text", info: "Not sent because the guardian has no contact details on file for that channel." },
  ], [summary]);

  const runReminders = async () => {
    setRunning(true);
    try {
      const response = await fetch("/api/communications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run-automation" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : ui("Reminders could not run. Try again in a moment."));
      const processed = Number(body.processed ?? 0);
      toast.success(processed === 1 ? ui("Reminders ran: 1 message processed") : ui("Reminders ran: {0} messages processed", [processed]));
      setConfirmRun(false);
      refresh();
    } catch (error) {
      toast.error(error);
    } finally {
      setRunning(false);
    }
  };

  const exportCsv = () => {
    const header = [ui("Message"), ui("Student"), ui("Channel"), ui("Status"), ui("Recipient"), ui("Sent")];
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines = rows.map((item) => [
      ui(TEMPLATE_LABELS[item.templateKey] ?? humanize(item.templateKey)),
      item.student?.fullName ?? "",
      ui(CHANNEL_META[item.channel]?.label ?? item.channel),
      ui(STATUS_META[item.status as Filter]?.label ?? item.status),
      item.recipientName ?? "",
      dateTime(item.sentAt ?? item.createdAt),
    ].map((value) => cell(String(value))).join(","));
    const blob = new Blob([`﻿${[header.map(cell).join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = office ? "family-communication.csv" : "report-delivery.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  // Seeded with the command present at mount, so a remount (view switch, tab return) never replays the last one.
  const handledCommand = useRef<number | null>(command?.nonce ?? null);
  useEffect(() => {
    if (!command || handledCommand.current === command.nonce) return;
    handledCommand.current = command.nonce;
    if (command.id === "refresh") refresh();
    else if (command.id === "export") {
      if (rows.length) exportCsv();
      else toast.info(ui("Nothing to export yet."));
    } else if (command.id === "run-reminders" && office) setConfirmRun(true);
    // Only a new nonce runs a command; it reads the rows on screen at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.nonce]);

  return (
    <div className="space-y-5" data-engagement-mode={mode}>
      <div className="sk-stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {totals.map((stat) => (
          <Card key={stat.key} className="min-w-0 p-4 sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-1 text-sm font-medium text-ink-muted">
                  <span className="truncate">{ui(stat.label)}</span>
                  {stat.info ? <InfoTip content={ui(stat.info)} /> : null}
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-ink-strong tabular-nums"><bdi>{loading ? "–" : stat.value}</bdi></p>
              </div>
              <span aria-hidden="true" className={cn("hidden size-10 shrink-0 items-center justify-center rounded-xl border sm:flex", stat.tile)}>
                <stat.icon className="size-5" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label={ui("Filter by delivery status")} className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const Icon = STATUS_META[item].icon;
            return (
              <Button key={item} type="button" variant="choice" size="sm" aria-pressed={filter === item} onClick={() => setFilter(item)}>
                <Icon aria-hidden="true" />
                {ui(STATUS_META[item].label)}
              </Button>
            );
          })}
        </div>
        {hideActions ? null : <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : undefined} />
            {ui("Refresh")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={loading || rows.length === 0}>
            <Download aria-hidden="true" />
            {ui("Export")}
          </Button>
          {office ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRun(true)}>
              <Send aria-hidden="true" />
              {ui("Run reminders")}
            </Button>
          ) : null}
        </div>}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3 sm:px-5">
          <MessageCircle aria-hidden="true" className="size-4 text-primary" />
          <h2 className="text-base font-bold text-ink-strong">{ui(office ? "Delivery history" : "Report and exam notices")}</h2>
        </div>
        {loading ? (
          <div className="p-4 sm:p-5"><SkeletonTable rows={6} columns={4} label={ui("Loading messages")} /></div>
        ) : loadError ? (
          <ErrorState
            title={ui("Delivery history could not be loaded")}
            description={ui("The message list did not load. Check your connection and try again.")}
            onRetry={refresh}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={MessageCircle}
            title={ui(filter === "ALL" ? (office ? "No messages to families yet" : "No report notices yet") : "Nothing matches this status")}
            description={ui(filter === "ALL"
              ? (office ? "Fee reminders, report notices and announcements sent to families appear here." : "Report-card and exam notices sent to families appear here once results are published.")
              : "Show all messages to see the full history.")}
            secondaryAction={filter === "ALL" ? undefined : <Button type="button" variant="outline" size="sm" onClick={() => setFilter("ALL")}>{ui("Show all")}</Button>}
          />
        ) : (
          <>
            {/* Cards below md (R9): a six-column table does not fit a phone. */}
            <ul className="divide-y divide-border-subtle md:hidden">
              {rows.map((item) => <DeliveryCard key={item.id} item={item} />)}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ui("Message")}</TableHead>
                    <TableHead>{ui("Student")}</TableHead>
                    <TableHead>{ui("Channel")}</TableHead>
                    <TableHead>{ui("Status")}</TableHead>
                    <TableHead>{ui("Recipient")}</TableHead>
                    <TableHead>{ui("Sent")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => {
                    const channel = CHANNEL_META[item.channel];
                    const ChannelIcon = channel?.icon ?? MessageCircle;
                    const meta = STATUS_META[item.status as Filter] ?? STATUS_META.PENDING;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="min-w-60 max-w-[360px]">
                          <p className="font-semibold text-ink-strong">{ui(TEMPLATE_LABELS[item.templateKey] ?? humanize(item.templateKey))}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted" dir="auto">{item.body}</p>
                          {item.failedReason ? <p className="mt-1 text-xs font-medium text-status-error-text" dir="auto">{item.failedReason}</p> : null}
                        </TableCell>
                        <TableCell className="min-w-40">
                          <p className="font-medium text-ink-strong"><bdi>{item.student?.fullName ?? "—"}</bdi></p>
                          {item.student?.class ? <p className="text-xs text-ink-subtle"><bdi>{[item.student.class.name, item.student.class.section].filter(Boolean).join(" ")}</bdi></p> : null}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 text-sm text-ink"><ChannelIcon aria-hidden="true" className="size-4 text-ink-subtle" />{ui(channel?.label ?? item.channel)}</span>
                        </TableCell>
                        <TableCell><Badge variant={meta.variant} size="sm" dot>{ui(meta.label)}</Badge></TableCell>
                        <TableCell className="min-w-40">
                          <p className="text-ink"><bdi>{item.recipientName || ui("Guardian")}</bdi></p>
                          <p className="break-all text-xs text-ink-subtle"><bdi>{item.recipient}</bdi></p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-ink-muted tabular-nums"><bdi>{dateTime(item.sentAt ?? item.createdAt)}</bdi></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {office ? (
        <ConfirmAction
          open={confirmRun}
          title={ui("Run reminders now?")}
          description={ui("Families with fees due in three days or overdue are messaged now, along with marks-entry deadlines and reports waiting for review. Reminders already sent today are not repeated. This cannot be undone.")}
          confirmLabel={ui("Run reminders")}
          cancelLabel={ui("Keep editing")}
          tone="primary"
          busy={running}
          onConfirm={() => void runReminders()}
          onCancel={() => setConfirmRun(false)}
        />
      ) : null}
    </div>
  );
}

function DeliveryCard({ item }: { item: Communication }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const meta = STATUS_META[item.status as Filter] ?? STATUS_META.PENDING;
  const channel = CHANNEL_META[item.channel];
  return (
    <li className="space-y-2 px-4 py-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 font-semibold text-ink-strong">{ui(TEMPLATE_LABELS[item.templateKey] ?? humanize(item.templateKey))}</p>
        <Badge variant={meta.variant} size="sm" dot>{ui(meta.label)}</Badge>
      </div>
      <p className="text-xs text-ink-subtle">
        <bdi>{item.student?.fullName ?? item.recipientName ?? ui("Guardian")}</bdi> · {ui(channel?.label ?? item.channel)} · <bdi className="tabular-nums">{dateTime(item.sentAt ?? item.createdAt)}</bdi>
      </p>
      <p className="line-clamp-2 text-sm leading-relaxed text-ink-muted" dir="auto">{item.body}</p>
      {item.failedReason ? <p className="text-xs font-medium text-status-error-text" dir="auto">{item.failedReason}</p> : null}
    </li>
  );
}
