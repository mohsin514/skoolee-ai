"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const statusMeta = {
  ALL: { label: "All", className: "bg-slate-100 text-slate-700", icon: Clock },
  SENT: { label: "Sent", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-700", icon: AlertCircle },
  NO_RECIPIENT: { label: "No contact", className: "bg-amber-100 text-amber-700", icon: AlertCircle },
  BLOCKED: { label: "Blocked", className: "bg-violet-100 text-violet-700", icon: ShieldAlert },
  PENDING: { label: "Pending", className: "bg-slate-100 text-slate-700", icon: Clock },
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/communications?status=${status}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load communications");
      setCommunications(data.communications || []);
      setSummary(data.summary || {});
    } catch (error) {
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
      toast.success(`Processed ${data.processed} communication actions`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Automation failed");
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

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Parent Communications"
        description="Sent, failed, blocked, and no-contact delivery history"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={runAutomation} disabled={runningAutomation}>
              {runningAutomation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              Run Automation
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Sent", value: totals.sent, icon: CheckCircle2, color: "text-emerald-600" },
            { label: "Failed", value: totals.failed, icon: AlertCircle, color: "text-red-600" },
            { label: "Blocked", value: totals.blocked, icon: ShieldAlert, color: "text-violet-600" },
            { label: "No Contact", value: totals.noContact, icon: MessageCircle, color: "text-amber-600" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
                  </div>
                  <stat.icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(statusMeta) as Array<keyof typeof statusMeta>).map((item) => {
            const active = status === item;
            const Icon = statusMeta[item].icon;
            return (
              <button
                key={item}
                onClick={() => setStatus(item)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "border-primary bg-primary text-white" : "border-border hover:border-primary/40"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {statusMeta[item].label}
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-primary" />
              Delivery History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
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
                        <TableCell className="max-w-[360px]">
                          <p className="font-medium">{templateLabel(item.templateKey)}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                          {item.failedReason ? (
                            <p className="mt-1 text-xs text-red-600">{item.failedReason}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{item.student?.fullName || "-"}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.student?.rollNo || ""} {item.student?.class?.name || ""} {item.student?.class?.section || ""}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <ChannelIcon className="h-4 w-4 text-muted-foreground" />
                            {item.channel}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={meta.className}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <p>{item.recipientName || "Parent"}</p>
                          <p className="text-xs text-muted-foreground">{item.recipient}</p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.sentAt ? new Date(item.sentAt).toLocaleString() : new Date(item.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {communications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No communication history found.
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
