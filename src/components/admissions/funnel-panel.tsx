"use client";
// SKAI-1260: admissions funnel — enquiry → application → offer → enrolled, by source, for one year.
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ClipboardList, Inbox, Sparkles } from "lucide-react";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { DeskStats, StatTile } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Funnel, FunnelStage } from "@/lib/admissions/funnel";

const STAGE_LABEL: Record<FunnelStage, string> = { enquiries: "Enquiries", applications: "Applications", offers: "Offers", enrolled: "Enrolled" };
const SOURCE_LABEL: Record<string, string> = { WALK_IN: "Walk-in", PHONE: "Phone", WEBSITE: "Website", REFERRAL: "Referral", ADVERT: "Advert", DIRECT: "Direct" };

export function FunnelPanel() {
  const ui = useUiText();
  const { number } = useLocaleFormat();
  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [funnel, setFunnel] = useState<Funnel | null>(null), [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    const response = await fetch(`/api/admissions?funnel=1&year=${year}`, { cache: "no-store" }).catch(() => null);
    const json = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok && json.success) setFunnel(json.data); else setFailed(true);
  }, [year]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  if (failed) return <ErrorState title={ui("The funnel could not be loaded.")} onRetry={() => void load()} />;
  if (!funnel) return <SkeletonList rows={3} />;
  const rate = (value: number | null, of: string) => (value === null ? undefined : ui(of, [number(value)]));
  return <section className="space-y-4" aria-labelledby="admissions-funnel-title" data-admissions-funnel>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 id="admissions-funnel-title" className="text-lg font-semibold">{ui("Admissions funnel")}</h2>
      <FormField name="admissions-funnel-year" label={ui("Year")} className="w-40"><Select value={year} onChange={event => setYear(Number(event.target.value))}>{funnel.years.map(value => <option key={value} value={value}>{value}</option>)}</Select></FormField>
    </div>
    <DeskStats>
      <StatTile index={0} icon={Inbox} value={number(funnel.total.enquiries)} label={ui(STAGE_LABEL.enquiries)} />
      <StatTile index={1} icon={ClipboardList} value={number(funnel.total.applications)} label={ui(STAGE_LABEL.applications)} hint={rate(funnel.conversion.applications, "{0}% of enquiries")} />
      <StatTile index={2} icon={Sparkles} value={number(funnel.total.offers)} label={ui(STAGE_LABEL.offers)} hint={rate(funnel.conversion.offers, "{0}% of applications")} />
      <StatTile index={3} icon={BadgeCheck} tone="success" value={number(funnel.total.enrolled)} label={ui(STAGE_LABEL.enrolled)} hint={rate(funnel.conversion.enrolled, "{0}% of applications")} />
    </DeskStats>
    {funnel.bySource.length === 0 ? <EmptyState title={ui("No enquiries or applications this year.")} size="sm" /> : <Table aria-label={ui("Admissions funnel by source")}>
      <TableHeader><TableRow><TableHead>{ui("Source")}</TableHead>{(Object.keys(STAGE_LABEL) as FunnelStage[]).map(stage => <TableHead key={stage} className="text-end">{ui(STAGE_LABEL[stage])}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{funnel.bySource.map(row => <TableRow key={row.source}>
        <TableCell>{SOURCE_LABEL[row.source] ? ui(SOURCE_LABEL[row.source]) : row.source}</TableCell>
        {(Object.keys(STAGE_LABEL) as FunnelStage[]).map(stage => <TableCell key={stage} className="text-end tabular-nums">{number(row[stage])}</TableCell>)}
      </TableRow>)}</TableBody>
    </Table>}
  </section>;
}
