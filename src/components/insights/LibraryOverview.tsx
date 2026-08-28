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
  Boxes,
  Library,
  Package,
  Tags,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

export function LibraryOverview({
  summary,
  campusLabel,
  onNavigate,
}: {
  summary: LibrarySummary;
  campusLabel: string;
  onNavigate: (view: string) => void;
}) {
  const derived = useMemo(() => {
    const shelfRate = summary.copiesTotal > 0
      ? Math.round((summary.copiesAvailable / summary.copiesTotal) * 100)
      : 0;

    // Issues and returns share a scale and a period, so they belong on one
    // pair of axes rather than in two charts the reader has to align by eye.
    const flow = summary.issuesByMonth.map((row, i) => ({
      label: monthLabel(row.month),
      Issued: row.count,
      Returned: summary.returnsByMonth[i]?.count ?? 0,
    }));

    return {
      shelfRate,
      flow,
      hasFlow: flow.some((f) => f.Issued > 0 || f.Returned > 0),
      onTime: Math.max(0, summary.onLoan - summary.overdue),
    };
  }, [summary]);

  return (
    <div className="space-y-5">
      <CommandHero
        eyebrow={campusLabel}
        title="Library command centre"
        heroValue={compact(summary.titles)}
        heroLabel="Titles in the catalogue"
        heroCaption={
          summary.copiesTotal > 0
            ? `${summary.copiesTotal.toLocaleString()} copies across ${summary.categories} ${summary.categories === 1 ? "category" : "categories"}, borrowed by ${summary.members.toLocaleString()} members.`
            : "No books catalogued yet — add the first title to start issuing."
        }
        meters={[
          {
            label: "Copies on the shelf",
            value: summary.copiesAvailable,
            max: summary.copiesTotal || 1,
            valueLabel: `${summary.copiesAvailable} / ${summary.copiesTotal}`,
          },
          {
            label: "Loans returned on time",
            value: derived.onTime,
            max: summary.onLoan || 1,
            valueLabel: summary.onLoan > 0 ? `${derived.onTime} / ${summary.onLoan}` : "None out",
            color: summary.overdue === 0 ? STATUS.good : STATUS.warning,
          },
        ]}
        pills={[
          { icon: BookOpen, label: "On loan", value: summary.onLoan, onClick: () => onNavigate("library") },
          { icon: AlertTriangle, label: "Overdue", value: summary.overdue, onClick: () => onNavigate("library"), tone: summary.overdue > 0 ? "critical" : "default" },
          { icon: Users, label: "Members", value: summary.members, onClick: () => onNavigate("library") },
          { icon: Package, label: "Stock items", value: summary.inventoryItems, onClick: () => onNavigate("inventory") },
        ]}
        aside={
          summary.copiesTotal > 0 ? (
            <RadialGauge
              value={derived.shelfRate}
              label="On the shelf"
              sublabel={`${summary.onLoan.toLocaleString()} out on loan`}
              color={derived.shelfRate >= 60 ? STATUS.good : derived.shelfRate >= 30 ? STATUS.warning : STATUS.critical}
            />
          ) : (
            <div className="flex h-[148px] w-[148px] flex-col items-center justify-center text-center">
              <Library className="h-7 w-7 text-[#cfc2d6]" aria-hidden />
              <p className="mt-2 px-2 text-[10px] font-bold leading-tight text-ink-subtle">No copies catalogued</p>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={Library} label="Titles" value={summary.titles} sub={`${summary.copiesTotal} copies`} onClick={() => onNavigate("library")} delay={80} />
        <StatTile icon={BookOpen} label="On loan" value={summary.onLoan} sub={`${derived.onTime} within due date`} tone={summary.onLoan > 0 ? "brand" : "good"} onClick={() => onNavigate("library")} delay={140} />
        <StatTile icon={AlertTriangle} label="Overdue" value={summary.overdue} sub={summary.finesOutstanding > 0 ? `${compact(summary.finesOutstanding)} in fines` : "No fines due"} tone={summary.overdue > 0 ? "critical" : "good"} onClick={() => onNavigate("library")} delay={200} />
        <StatTile icon={Users} label="Members" value={summary.members} sub="Borrowing accounts" onClick={() => onNavigate("library")} delay={260} />
        <StatTile icon={Boxes} label="Inventory" value={summary.inventoryItems} sub="Tracked items" onClick={() => onNavigate("inventory")} delay={320} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InsightCard
          icon={BookOpen}
          title="Issues and returns"
          subtitle="Last six months"
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: ["Month", "Issued", "Returned"],
            rows: derived.flow.map((f) => [f.label, f.Issued, f.Returned]),
          }}
        >
          {derived.hasFlow ? (
            <>
              <ResponsiveContainer width="100%" height={248}>
                <BarChart data={derived.flow} margin={{ top: 18, right: 12, bottom: 4, left: -18 }} barGap={4}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" books" />} />
                  <Legend content={() => null} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="Issued" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="Returned" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend
                className="mt-3"
                items={[
                  { label: "Issued", color: SERIES[0] },
                  { label: "Returned", color: SERIES[2] },
                ]}
              />
            </>
          ) : (
            <EmptyChart label="No books have been issued in the last six months" />
          )}
        </InsightCard>

        <InsightCard
          icon={Tags}
          title="Collection by category"
          subtitle="Titles held in each"
          delay={180}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("library")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Catalogue
            </button>
          }
          table={{
            columns: ["Category", "Titles", "Copies"],
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
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" titles" />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="titles" name="Titles" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList dataKey="titles" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No categories set up yet" />
          )}
        </InsightCard>
      </div>

      {summary.onLoan > 0 ? (
        <InsightCard
          icon={AlertTriangle}
          title="Loans outstanding"
          subtitle="Books currently with a member"
          delay={120}
          table={{
            columns: ["State", "Books"],
            rows: [
              ["Within due date", derived.onTime],
              ["Overdue", summary.overdue],
            ],
          }}
        >
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={[{ label: "On loan", "Within due date": derived.onTime, Overdue: summary.overdue }]}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
            >
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={70} />
              <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" books" />} />
              {/* 2px of surface between the segments does the separating. */}
              <Bar {...NO_ENTRY_ANIMATION} dataKey="Within due date" stackId="loans" fill={STATUS.good} stroke={INK.surface} strokeWidth={2} maxBarSize={40} />
              <Bar {...NO_ENTRY_ANIMATION} dataKey="Overdue" stackId="loans" fill={STATUS.critical} stroke={INK.surface} strokeWidth={2} maxBarSize={40} radius={[0, 4, 4, 0]}>
                <Cell fill={STATUS.critical} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <SeriesLegend
            className="mt-2"
            items={[
              { label: "Within due date", color: STATUS.good, value: derived.onTime },
              { label: "Overdue", color: STATUS.critical, value: summary.overdue },
            ]}
          />
        </InsightCard>
      ) : null}
    </div>
  );
}
