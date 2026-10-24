"use client";

/**
 * The librarian's opening screen.
 *
 * A library runs on one question — where are the books? — so the hero is how
 * much of the collection is on the shelf, and the rest of the page accounts
 * for the difference: what is out, what is late, and how borrowing is trending.
 */

import { useMemo } from "react";
import {
  AlertTriangle,
  BookOpen,
  Library,
  Tags,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CommandHero } from "./CommandHero";
import { EmptyChart, InsightCard, RadialGauge, SeriesLegend, StatTile, VizTooltip } from "./chart-kit";
import { AXIS_TICK, INK, NO_ENTRY_ANIMATION, SERIES, STATUS, compact } from "./palette";
import { Button } from "@/components/ui/button";
import { useUiText } from "@/components/locale/LocaleProvider";


export interface LibrarySummary {
  kind: "LIBRARIAN";
  titles: number;
  copiesTotal: number;
  copiesAvailable: number;
  categories: number;
  members: number;
  onLoan: number;
  overdue: number;
  finesOutstanding: number;
  issuesByMonth: { month: string; count: number; value: number }[];
  returnsByMonth: { month: string; count: number; value: number }[];
  inventoryItems: number;
  byCategory: { name: string; titles: number; copies: number }[];
}

function monthLabel(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  const d = new Date(year, (month ?? 1) - 1, 1);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short" });
}

/**
 * `onNavigate` receives librarian views: "lending" (the desk) and "catalogue" (books and members). Inventory is
 * the campus admin's (role-ux M83), so it is not counted or linked here.
 */
export function LibraryOverview({
  summary,
  campusLabel,
  onNavigate,
}: {
  summary: LibrarySummary;
  campusLabel: string;
  onNavigate: (view: string) => void;
}) {
  const tr = useUiText();
  const derived = useMemo(() => {
    const shelfRate = summary.copiesTotal > 0
      ? Math.round((summary.copiesAvailable / summary.copiesTotal) * 100)
      : 0;

    // Issues and returns share a scale and a period, so they belong on one
    // pair of axes rather than in two charts the reader has to align by eye.
    const flow = summary.issuesByMonth.map((row, i) => ({
      label: monthLabel(row.month),
      issued: row.count,
      returned: summary.returnsByMonth[i]?.count ?? 0,
    }));

    return {
      shelfRate,
      flow,
      hasFlow: flow.some((f) => f.issued > 0 || f.returned > 0),
      onTime: Math.max(0, summary.onLoan - summary.overdue),
    };
  }, [summary]);

  return (
    <div className="space-y-5">
      {/* Spotlight anchor for the librarian tour's first step (role-ux §9.4). */}
      <div data-tour="library.today.summary">
      <CommandHero
        eyebrow={campusLabel}
        title={tr("The collection today")}
        heroValue={compact(summary.titles)}
        heroLabel={tr("Titles in the catalogue")}
        heroCaption={
          summary.copiesTotal > 0
            ? tr("{0} copies across {1} categories, borrowed by {2} members.", [summary.copiesTotal, summary.categories, summary.members])
            : tr("No books catalogued yet — add the first title to start issuing.")
        }
        meters={[
          {
            label: tr("Copies on the shelf"),
            value: summary.copiesAvailable,
            max: summary.copiesTotal || 1,
            valueLabel: `${summary.copiesAvailable} / ${summary.copiesTotal}`,
          },
          {
            label: tr("Loans returned on time"),
            value: derived.onTime,
            max: summary.onLoan || 1,
            valueLabel: summary.onLoan > 0 ? `${derived.onTime} / ${summary.onLoan}` : tr("None out"),
            color: summary.overdue === 0 ? STATUS.good : STATUS.warning,
          },
        ]}
        aside={
          summary.copiesTotal > 0 ? (
            <RadialGauge
              value={derived.shelfRate}
              label={tr("On the shelf")}
              sublabel={tr("{0} out on loan", [summary.onLoan])}
              color={derived.shelfRate >= 60 ? STATUS.good : derived.shelfRate >= 30 ? STATUS.warning : STATUS.critical}
            />
          ) : (
            <div className="flex h-[148px] w-[148px] flex-col items-center justify-center text-center">
              <Library className="h-7 w-7 text-edge" aria-hidden />
              <p className="mt-2 px-2 text-xs font-medium leading-tight text-ink-subtle">{tr("No copies catalogued")}</p>
            </div>
          )
        }
      />
      </div>

      {/* At most four KPI tiles on a landing screen (role-ux §4.5.8). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={BookOpen} label={tr("On loan")} value={summary.onLoan} sub={tr("{0} within due date", [derived.onTime])} tone={summary.onLoan > 0 ? "brand" : "good"} onClick={() => onNavigate("lending")} delay={80} />
        <StatTile icon={AlertTriangle} label={tr("Overdue")} value={summary.overdue} sub={summary.finesOutstanding > 0 ? tr("{0} in fines", [compact(summary.finesOutstanding)]) : tr("No fines due")} tone={summary.overdue > 0 ? "critical" : "good"} onClick={() => onNavigate("lending")} delay={140} />
        <StatTile icon={Library} label={tr("Titles")} value={summary.titles} sub={tr("{0} copies", [summary.copiesTotal])} onClick={() => onNavigate("catalogue")} delay={200} />
        <StatTile icon={Users} label={tr("Members")} value={summary.members} sub={tr("Borrowing accounts")} onClick={() => onNavigate("catalogue")} delay={260} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InsightCard
          icon={BookOpen}
          title={tr("Issues and returns")}
          subtitle={tr("Last six months")}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: [tr("Month"), tr("Issued"), tr("Returned")],
            rows: derived.flow.map((f) => [f.label, f.issued, f.returned]),
          }}
        >
          {derived.hasFlow ? (
            <>
              <ResponsiveContainer width="100%" height={248}>
                <BarChart data={derived.flow} margin={{ top: 18, right: 12, bottom: 4, left: -18 }} barGap={4}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: INK.grid }} content={<VizTooltip />} />
                  <Legend content={() => null} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="issued" name={tr("Issued")} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="returned" name={tr("Returned")} fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend
                className="mt-3"
                items={[
                  { label: tr("Issued"), color: SERIES[0] },
                  { label: tr("Returned"), color: SERIES[2] },
                ]}
              />
            </>
          ) : (
            <EmptyChart label={tr("No books have been issued in the last six months")} />
          )}
        </InsightCard>

        <InsightCard
          icon={Tags}
          title={tr("Collection by category")}
          subtitle={tr("Titles held in each")}
          delay={180}
          actions={
            <Button variant="link" size="sm" type="button" onClick={() => onNavigate("catalogue")}>
              {tr("Catalogue")}
            </Button>
          }
          table={{
            columns: [tr("Category"), tr("Titles"), tr("Copies")],
            rows: summary.byCategory.map((c) => [c.name, c.titles, c.copies]),
          }}
        >
          {summary.byCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, summary.byCategory.length * 30 + 30)}>
              <BarChart data={summary.byCategory} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap="24%">
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={92}
                  tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                />
                <Tooltip cursor={{ fill: INK.grid }} content={<VizTooltip />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="titles" name={tr("Titles")} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList dataKey="titles" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={tr("No categories set up yet")} />
          )}
        </InsightCard>
      </div>
    </div>
  );
}
