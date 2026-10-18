"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { InfoTip, Tooltip } from "@/components/ui/tooltip";
import { SkeletonTable } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Communication {
  id: string;
  templateKey: string;
  channel: "WHATSAPP" | "EMAIL" | "SMS";
  recipientName?: string | null;
  recipient: string;
  subject?: string | null;
  body: string;
  status: "PENDING" | "SENT" | "FAILED" | "NO_RECIPIENT" | "BLOCKED";
  failedReason?: string | null;
  approvedData: boolean;
  createdAt: string;
  sentAt?: string | null;
  student?: {
    fullName: string;
    rollNo: string;
    class?: { name: string; section?: string | null } | null;
  } | null;
  campus?: { name: string } | null;
}

const statusMeta: Record<"ALL" | Communication["status"], { label: string; variant: NonNullable<BadgeProps["variant"]>; icon: typeof Clock }> = {
  ALL: { label: "All", variant: "neutral", icon: Clock },
  SENT: { label: "Sent", variant: "success", icon: CheckCircle2 },
  FAILED: { label: "Failed", variant: "danger", icon: AlertCircle },
  NO_RECIPIENT: { label: "No contact", variant: "warning", icon: AlertCircle },
  BLOCKED: { label: "Blocked", variant: "secondary", icon: ShieldAlert },
  PENDING: { label: "Pending", variant: "neutral", icon: Clock },
};

const channelIcon = {
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  SMS: Smartphone,
};

function templateLabel(key: string) {
  return key.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CommunicationsPage() {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<keyof typeof statusMeta>("ALL");
  const [loading, setLoading] = useState(true);
  const [runningAutomation, setRunningAutomation] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/communications?status=${status}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load communications");
      setCommunications(data.communications || []);
      setSummary(data.summary || {});
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "Could not load communications");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runAutomation = async () => {
    setRunningAutomation(true);
    try {
      const res = await fetch("/api/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-automation" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Automation failed");
      toast.success(data.processed === 1 ? "Automation ran: 1 reminder processed" : `Automation ran: ${data.processed} reminders processed`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Automation could not run. Try again in a moment.");
    } finally {
      setRunningAutomation(false);
    }
  };

  const totals = useMemo(
    () => ({
      sent: summary.SENT || 0,
      failed: summary.FAILED || 0,
      blocked: summary.BLOCKED || 0,
      noContact: summary.NO_RECIPIENT || 0,
    }),
    [summary]
  );

  const stats = [
    { label: "Sent", value: totals.sent, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
    { label: "Failed", value: totals.failed, icon: AlertCircle, color: "bg-red-50 text-red-600", info: "Sending was tried and did not go through. The reason appears under the message in the history." },
    { label: "Blocked", value: totals.blocked, icon: ShieldAlert, color: "bg-violet-50 text-violet-600", info: "Stopped before sending: the subscription is suspended, the channel is not in your plan, the message needs approved school data, or outbound messages are turned off." },
    { label: "No Contact", value: totals.noContact, icon: MessageCircle, color: "bg-amber-50 text-amber-600", info: "No contact for this channel is on file for the recipient, so nothing was sent." },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <Header
        title="Parent Communications"
        description="Sent, failed, blocked, and no-contact delivery history"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw aria-hidden="true" className={loading ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} />
              Refresh
            </Button>
            <Tooltip content="Sends the reminders that are due now: upcoming and overdue fees, marks-entry deadlines and pending principal reviews.">
              <Button size="sm" onClick={runAutomation} loading={runningAutomation}>
                {runningAutomation ? null : <Clock aria-hidden="true" className="h-4 w-4" />}
                Run Automation
              </Button>
            </Tooltip>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="sk-stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="group">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-sm font-medium text-ink-muted">
                      <span className="truncate">{stat.label}</span>
                      {stat.info ? <InfoTip content={stat.info} /> : null}
                    </p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-ink-strong tabular-nums">{loading ? "–" : stat.value}</p>
                  </div>
                  <span aria-hidden="true" className={`sk-icon-tile hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div role="group" aria-label="Filter by delivery status" className="flex flex-wrap gap-2">
          {(Object.keys(statusMeta) as Array<keyof typeof statusMeta>).map((item) => {
            const active = status === item;
            const Icon = statusMeta[item].icon;
            return (
              <Button className="justify-start" aria-pressed={active} variant="choice" size="sm"
                key={item}
                onClick={() => setStatus(item)}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                {statusMeta[item].label}
              </Button>
            );
          })}
        </div>

        <Card className="sk-enter overflow-hidden" style={{ "--sk-delay": "120ms" } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle aria-hidden="true" className="h-4 w-4 text-primary" />
              Delivery History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <SkeletonTable rows={6} columns={4} label="Loading messages" />
            ) : loadError ? (
              <ErrorState
                title="Delivery history could not be loaded"
                description="The message list did not load. Check your connection and try again."
                onRetry={loadData}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Message</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {communications.map((item) => {
                    const ChannelIcon = channelIcon[item.channel];
                    const meta = statusMeta[item.status] || statusMeta.PENDING;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="min-w-60 max-w-[360px]">
                          <p className="font-semibold text-ink-strong">{templateLabel(item.templateKey)}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{item.body}</p>
                          {item.failedReason ? (
                            <p className="mt-1 text-xs font-medium text-status-error-text">{item.failedReason}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="min-w-40">
                          <p className="font-medium text-ink-strong">{item.student?.fullName || "-"}</p>
                          <p className="text-xs text-ink-subtle">
                            {item.student?.rollNo || ""} {item.student?.class?.name || ""} {item.student?.class?.section || ""}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 text-sm text-ink">
                            <ChannelIcon aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
                            {item.channel}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.variant} size="sm" dot>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="min-w-40">
                          <p className="text-ink">{item.recipientName || "Parent"}</p>
                          <p className="break-all text-xs text-ink-subtle">{item.recipient}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-ink-muted tabular-nums">
                          {item.sentAt ? new Date(item.sentAt).toLocaleString() : new Date(item.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {communications.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          size="sm"
                          icon={MessageCircle}
                          title={status === "ALL" ? "No communication history found." : `No ${statusMeta[status].label.toLowerCase()} messages`}
                          description={status === "ALL" ? "Messages sent to parents by reminders and school workflows will appear here." : "Nothing matches this status. Show all messages to see the full history."}
                          secondaryAction={status === "ALL" ? undefined : (
                            <Button variant="outline" size="sm" onClick={() => setStatus("ALL")}>Show all</Button>
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
