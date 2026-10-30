"use client";
import { useState } from "react";
import { MessageCircle, Power, Receipt, Wallet } from "lucide-react";
import { DeskPill, DeskStats, RelativeTime, StatTile } from "@/components/ui/desk";
import { useFetch } from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SkeletonList } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKAI-1046 (D3-03): the Skoolee-managed sending add-on — balance, last 30 days and the ledger. Credit is added by
// Skoolee after payment; the school only opts in or out.

type Entry = { id: string; kind: string; category: string | null; country: string | null; metaRateMicroUsd: number; marginMicroUsd: number; amountMicroUsd: number; reference: string | null; createdAt: string };
const CATEGORY_LABEL: Record<string, string> = { UTILITY: "Utility", MARKETING: "Marketing", AUTHENTICATION: "Authentication", SERVICE: "Service" };
type Usage = { enabled: boolean; provisioned: boolean; balanceMicroUsd: number; last30Days: { messages: number; spentMicroUsd: number }; entries: Entry[] };

export function ManagedSendingPanel() {
  const ui = useUiText();
  const { dateTime, number } = useLocaleFormat();
  const { data, failure, isLoading, refetch } = useFetch<Usage>("/api/whatsapp/managed");
  const [busy, setBusy] = useState(false);
  if (failure) return <ErrorState error={failure} onRetry={refetch} />;
  if (isLoading || !data) return <SkeletonList rows={2} />;
  const usd = (micro: number) => `USD ${number(micro / 1_000_000, 4)}`;
  const toggle = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/whatsapp/managed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: data.enabled ? "disable" : "enable" }), cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
      toast.success(ui(data.enabled ? "Managed sending turned off" : "Managed sending turned on"));
      await refetch();
    } catch (error) { toast.error(ui(error instanceof Error ? error.message : "The change was not saved.")); }
    finally { setBusy(false); }
  };
  const empty = data.enabled && data.balanceMicroUsd <= 0;

  return <Card data-managed-sending>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Wallet aria-hidden className="size-5" />{ui("Skoolee-managed sending")}</CardTitle>
      <CardDescription>{ui("For schools that cannot complete Meta verification: Skoolee sends from a number reserved for your school. Each message is charged at Meta's rate plus a fixed fee from prepaid credit.")}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {empty ? <Alert tone="danger" live="off">{ui("Credit is used up. WhatsApp messages are paused until Skoolee adds credit.")}</Alert> : null}
      {/* SKAI-1277: status, credit and the last 30 days as the shared stat tiles. */}
      <DeskStats>
        <StatTile index={0} icon={Power} tone={data.enabled ? "success" : "neutral"} label={ui("Status")} value={<DeskPill tone={data.enabled ? "success" : "neutral"}>{data.enabled ? ui("On") : ui("Off")}</DeskPill>} />
        <StatTile index={1} icon={Wallet} tone={empty ? "danger" : data.balanceMicroUsd > 0 ? "brand" : "neutral"} label={ui("Credit left")} value={<bdi dir="ltr">{usd(data.balanceMicroUsd)}</bdi>} />
        <StatTile index={2} icon={MessageCircle} tone="info" label={ui("Last 30 days")} value={ui("{0} messages", [number(data.last30Days.messages, 0)])} hint={<bdi dir="ltr">{usd(data.last30Days.spentMicroUsd)}</bdi>} />
      </DeskStats>
      {!data.provisioned ? <Alert tone="info" compact live="off">{ui("Ask Skoolee support to set up a managed number for your school.")}</Alert> : null}
      <Button variant={data.enabled ? "outline" : "default"} disabled={busy || (!data.enabled && !data.provisioned)} onClick={() => void toggle()}>{ui(data.enabled ? "Turn off managed sending" : "Turn on managed sending")}</Button>
      {data.entries.length ? <Table>
        <TableHeader><TableRow>
          <TableHead>{ui("Date")}</TableHead><TableHead>{ui("Type")}</TableHead><TableHead>{ui("Meta rate")}</TableHead><TableHead>{ui("Fee")}</TableHead><TableHead>{ui("Amount")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{data.entries.map(e => <TableRow key={e.id}>
          <TableCell className="whitespace-nowrap"><RelativeTime iso={e.createdAt} full={dateTime(e.createdAt)} /></TableCell>
          <TableCell>{e.kind === "TOP_UP" ? ui("Credit added") : `${ui(CATEGORY_LABEL[e.category ?? "UTILITY"] ?? "Utility")} · ${e.country ?? ""}`}</TableCell>
          <TableCell><bdi dir="ltr">{e.kind === "TOP_UP" ? "—" : usd(e.metaRateMicroUsd)}</bdi></TableCell>
          <TableCell><bdi dir="ltr">{e.kind === "TOP_UP" ? "—" : usd(e.marginMicroUsd)}</bdi></TableCell>
          <TableCell><bdi dir="ltr">{e.kind === "TOP_UP" ? "+" : "−"}{usd(e.amountMicroUsd)}</bdi></TableCell>
        </TableRow>)}</TableBody>
      </Table> : <EmptyState size="sm" icon={Receipt} title={ui("No managed messages yet")} />}
    </CardContent>
  </Card>;
}
