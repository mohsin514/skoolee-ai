"use client";

/**
 * The group admin's read-only picture of the network (Overview, below the attention list).
 *
 * An owner's job is comparison — which campus is carrying the group, which one has a leadership hole, where the
 * fee book is leaking — so almost everything here is one campus against another on a shared scale, and the
 * leadership gaps are stated in words rather than left to a colour.
 *
 * Read-only by design (M1, M9): no fees, billing or AI buttons. The fee book and its gauge stay as numbers;
 * collecting and adjusting fees happens in each campus. The page owns the one heading (PageHeader), so this
 * component renders no hero and no `<h1>`; ≤ 4 KPI tiles (§4.5.8).
 */

import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag, minorUnits } from "@/lib/locale/package";
import { useMemo } from "react";
import { AlertTriangle, Building2, CheckCircle2, GraduationCap, Receipt, School, TrendingUp, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyChart, InsightCard, RadialGauge, SeriesLegend, StatTile, VizTooltip } from "./chart-kit";
import { AXIS_TICK, GRADE_HIGH, GRADE_LOW, INK, NO_ENTRY_ANIMATION, SERIES, STATUS, compact } from "./palette";
import {
  campusFeeStack,
  campusRows,
  enrolmentTrend,
  FEE_STACK_COLOR,
  FEE_STACK_KEYS,
  gradeDistribution,
  latestReportCards,
  networkStudents,
} from "./metrics";

interface NetworkOverviewProps {
  data: any;
  /** Opens the campus detail (`?view=campuses&campus=<id>`). */
  onSelectCampus: (campus: any) => void;
}

export function NetworkOverview({ data, onSelectCampus }: NetworkOverviewProps) {
  const t = useUiText();
  const campuses: any[] = data?.campuses ?? [];
  const summary = data?.networkSummary ?? {};

  const locale = useLocale();
  const tag = localeTag(locale);
  // The school's own tuition currency from the loader; the locale package default when the loader has none.
  const currency = data?.currency ?? locale.currency;
  const number = useMemo(() => new Intl.NumberFormat(tag), [tag]);
  const money = (value: number) => new Intl.NumberFormat(tag, { style: "currency", currency, minimumFractionDigits: minorUnits(currency), maximumFractionDigits: minorUnits(currency) }).format(value);
  const derived = useMemo(() => {
    const rows = campusRows(campuses);
    const students = networkStudents(campuses);
    const byStudents = [...rows].sort((a, b) => b.students - a.students);
    const billed = rows.reduce((sum, r) => sum + r.billed, 0);
    const collected = rows.reduce((sum, r) => sum + r.collected, 0);
    const gaps = rows.filter((r) => !r.hasAdmin || !r.hasPrincipal);

    return {
      rows,
      byStudents,
      averageRoll: rows.length ? Math.round(rows.reduce((sum, r) => sum + r.students, 0) / rows.length) : 0,
      billed,
      collected,
      collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
      feeStack: campusFeeStack(campuses),
      enrolment: enrolmentTrend(students, 12, tag),
      grades: gradeDistribution(latestReportCards(students)),
      gaps,
      coverage: [...rows].sort(
        (a, b) => Number(a.hasAdmin) + Number(a.hasPrincipal) - (Number(b.hasAdmin) + Number(b.hasPrincipal)),
      ),
      leaderboard: [...rows].sort((a, b) => (b.average ?? -1) - (a.average ?? -1)),
    };
    // Recomputed when the loaded dashboard or the app language (month labels) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tag]);

  const open = (id: string) => {
    const full = campuses.find((c: any) => c.id === id);
    if (full) onSelectCampus(full);
  };
  const feeLabel = (key: string) => t(key);

  return (
    <div className="space-y-6" data-network-overview>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={GraduationCap} label={t("Students")} value={summary.totalStudents ?? 0} sub={t("Average {0} per campus", [number.format(derived.averageRoll)])} tone="good" delay={80} />
        <StatTile icon={Building2} label={t("Campuses")} value={campuses.length} sub={t("{0} needing leadership", [number.format(derived.gaps.length)])} tone={derived.gaps.length > 0 ? "warning" : "brand"} delay={140} />
        <StatTile icon={Users} label={t("Teachers")} value={summary.totalTeachers ?? 0} sub={summary.totalTeachers ? t("≈{0} students per teacher", [number.format(Math.round((summary.totalStudents ?? 0) / summary.totalTeachers))]) : t("No teachers yet")} delay={200} />
        <StatTile icon={School} label={t("Classes")} value={summary.totalClasses ?? 0} sub={t("{0} subjects", [number.format(summary.totalSubjects ?? 0)])} delay={260} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Building2}
          title={t("Roll by campus")}
          subtitle={t("Students on the register at each campus")}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: [t("Campus"), t("Students"), t("Classes"), t("Teachers")],
            rows: derived.byStudents.map((c) => [c.name, c.students, c.classes, c.teachers]),
          }}
        >
          {derived.byStudents.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, derived.byStudents.length * 36 + 40)}>
                <BarChart data={derived.byStudents} layout="vertical" margin={{ top: 4, right: 46, bottom: 4, left: 4 }} barCategoryGap="24%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={104} />
                  <ReferenceLine x={derived.averageRoll} stroke={INK.axis} strokeWidth={1} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={` ${t("students")}`} />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="students" name={t("Students")} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList dataKey="students" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 text-2xs font-medium text-ink-subtle">
                {t("The vertical rule marks the group average of {0} students per campus.", [number.format(derived.averageRoll)])}
              </p>
            </>
          ) : (
            <EmptyChart label={t("No campuses yet")} />
          )}
        </InsightCard>

        <InsightCard
          icon={AlertTriangle}
          title={t("Leadership coverage")}
          subtitle={t("Who is in post at each campus")}
          delay={180}
          table={{
            columns: [t("Campus"), t("Campus admin"), t("Principal")],
            rows: derived.coverage.map((c) => [c.name, c.hasAdmin ? t("In post") : t("Vacant"), c.hasPrincipal ? t("In post") : t("Vacant")]),
          }}
        >
          {derived.rows.length > 0 ? (
            <ul className="max-h-[300px] space-y-2 overflow-y-auto custom-scrollbar pe-1">
              {derived.coverage.map((campus) => (
                <li key={campus.id}>
                  <Button variant="outline" type="button" onClick={() => open(campus.id)} className="flex h-auto w-full items-center justify-between gap-3 py-2.5 text-start">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-ink-strong"><bdi>{campus.name}</bdi></span>
                      <span className="block text-2xs font-semibold text-ink-subtle">
                        <bdi>{campus.city || "—"}</bdi> · {t("{0} teachers", [number.format(campus.teachers)])}
                      </span>
                    </span>
                    {/* Icon + word, never colour alone. */}
                    <span className="flex shrink-0 gap-1.5">
                      <CoverageChip label={t("Admin")} filled={campus.hasAdmin} />
                      <CoverageChip label={t("Principal")} filled={campus.hasPrincipal} />
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyChart label={t("No campuses yet")} />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={Receipt}
          title={t("Fee book by campus")}
          subtitle={t("Invoiced amount, split by status. Each campus collects its own fees.")}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: [t("Campus"), t("Paid"), t("Part paid"), t("Pending"), t("Overdue")],
            rows: derived.feeStack.map((c) => [
              c.name,
              Math.round(c.Paid),
              Math.round(c["Part paid"]),
              Math.round(c.Pending),
              Math.round(c.Overdue),
            ]),
          }}
        >
          {derived.feeStack.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, derived.feeStack.length * 44 + 40)}>
                <BarChart data={derived.feeStack} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="28%">
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => compact(v)} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={104} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip format={(v) => money(v)} />} />
                  {FEE_STACK_KEYS.map((key, i) => (
                    <Bar
                      {...NO_ENTRY_ANIMATION}
                      key={key}
                      dataKey={key}
                      name={feeLabel(key)}
                      stackId="fees"
                      fill={FEE_STACK_COLOR[key]}
                      // 2px of surface between segments does the separating.
                      stroke={INK.surface}
                      strokeWidth={2}
                      maxBarSize={26}
                      radius={i === FEE_STACK_KEYS.length - 1 ? [0, 4, 4, 0] : undefined}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-3" items={FEE_STACK_KEYS.map((key) => ({ label: feeLabel(key), color: FEE_STACK_COLOR[key] }))} />
            </>
          ) : (
            <EmptyChart label={t("No invoices raised anywhere in the group yet")} />
          )}
        </InsightCard>

        <InsightCard icon={Receipt} title={t("Fees collected")} subtitle={t("Across every campus, to date")} delay={180}>
          <div className="flex min-h-[220px] items-center justify-center">
            {derived.billed > 0 ? (
              <RadialGauge
                value={derived.collectionRate}
                label={t("Fees collected")}
                sublabel={t("{0} of {1}", [money(derived.collected), money(derived.billed)])}
                color={derived.collectionRate >= 70 ? STATUS.good : derived.collectionRate >= 40 ? STATUS.warning : STATUS.critical}
              />
            ) : (
              <EmptyChart label={t("No invoices raised yet")} />
            )}
          </div>
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title={t("Group roll growth")}
          subtitle={t("Students on the register, month by month")}
          className="xl:col-span-2"
          delay={120}
          table={{
            columns: [t("Month"), t("Joined"), t("On register")],
            rows: derived.enrolment.map((m) => [m.label, m.joined, m.total]),
          }}
        >
          {derived.enrolment.length > 1 ? (
            <ResponsiveContainer width="100%" height={252}>
              <AreaChart data={derived.enrolment} margin={{ top: 16, right: 16, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="networkRollWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={12} />
                {/* Headroom, so a flat or still-climbing line is not drawn along the very top edge of the plot. */}
                <YAxis domain={[0, (dataMax: number) => Math.ceil((dataMax || 1) * 1.1)]} tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ stroke: INK.axis, strokeWidth: 1 }} content={<VizTooltip unit={` ${t("students")}`} />} />
                <Area
                  {...NO_ENTRY_ANIMATION}
                  type="monotone"
                  dataKey="total"
                  name={t("On register")}
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#networkRollWash)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={t("Roll growth appears once students have been admitted over more than one month")} />
          )}
        </InsightCard>

        <InsightCard
          icon={GraduationCap}
          title={t("Grades across the group")}
          subtitle={t("Latest report card per student")}
          delay={180}
          table={{ columns: [t("Grade"), t("Students")], rows: derived.grades.map((g) => [g.grade, g.count]) }}
        >
          {derived.grades.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={252}>
                <BarChart data={derived.grades} margin={{ top: 18, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="grade" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit={` ${t("students")}`} />} />
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name={t("Students")} radius={[4, 4, 0, 0]} maxBarSize={26}>
                    {derived.grades.map((g) => (
                      <Cell key={g.grade} fill={g.color} />
                    ))}
                    <LabelList dataKey="count" position="top" offset={6} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend className="mt-3" items={[{ label: t("Higher grades"), color: GRADE_HIGH[1] }, { label: t("Lower grades"), color: GRADE_LOW[1] }]} />
            </>
          ) : (
            <EmptyChart label={t("No graded report cards anywhere in the group yet")} />
          )}
        </InsightCard>
      </div>

      {derived.rows.length > 0 ? (
        <InsightCard icon={School} title={t("Campus scorecard")} subtitle={t("Every campus, side by side · reports shown as cards / exams")} delay={120}>
          <Table containerClassName="overflow-x-auto custom-scrollbar" className="w-full min-w-[880px] text-start">
            <TableHeader>
              <TableRow>
                {[t("Campus"), t("Students"), t("Classes"), t("Teachers"), t("Average"), t("Collected"), t("Reports"), t("Messages"), t("AI runs")].map((h, i) => (
                  <TableHead key={h} className={i > 0 ? "text-end" : undefined}>{h}</TableHead>
                ))}
                <TableHead><span className="sr-only">{t("Open")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {derived.leaderboard.map((campus) => (
                <TableRow key={campus.id}>
                  <TableCell>
                    <p className="text-xs font-bold text-ink-strong"><bdi>{campus.name}</bdi></p>
                    <p className="text-2xs font-semibold text-ink-subtle"><bdi>{campus.city || "—"}</bdi></p>
                  </TableCell>
                  <TableCell className="text-end text-xs font-bold tabular-nums text-ink-strong"><bdi>{number.format(campus.students)}</bdi></TableCell>
                  <TableCell className="text-end text-xs tabular-nums text-ink-muted"><bdi>{number.format(campus.classes)}</bdi></TableCell>
                  <TableCell className="text-end text-xs tabular-nums text-ink-muted"><bdi>{number.format(campus.teachers)}</bdi></TableCell>
                  <TableCell className="text-end text-xs tabular-nums">
                    {campus.average === null ? <span className="text-ink-subtle">—</span> : <bdi className={campus.average >= 40 ? "text-status-success-text" : "text-status-error-text"}>{campus.average}%</bdi>}
                  </TableCell>
                  <TableCell className="text-end text-xs tabular-nums text-ink-muted">{campus.billed > 0 ? <bdi>{campus.collectionRate}%</bdi> : "—"}</TableCell>
                  <TableCell className="text-end text-xs tabular-nums text-ink-muted"><bdi>{number.format(campus.reportCards)} / {number.format(campus.exams)}</bdi></TableCell>
                  <TableCell className="text-end text-xs tabular-nums text-ink-muted">
                    <bdi>{number.format(campus.messagesSent)}</bdi>
                    {campus.messageIssues > 0 ? <span className="text-status-error-text"> · {t("{0} failed", [number.format(campus.messageIssues)])}</span> : null}
                  </TableCell>
                  <TableCell className="text-end text-xs tabular-nums text-ink-muted"><bdi>{number.format(campus.aiRuns)}</bdi></TableCell>
                  <TableCell className="text-end">
                    <Button variant="outline" size="sm" type="button" onClick={() => open(campus.id)} aria-label={t("Open {0}", [campus.name])}>{t("Open")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </InsightCard>
      ) : null}
    </div>
  );
}

function CoverageChip({ label, filled }: { label: string; filled: boolean }) {
  const t = useUiText();
  const Icon = filled ? CheckCircle2 : AlertTriangle;
  return (
    <Badge variant={filled ? "success" : "warning"} size="sm" className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
      <span className="sr-only">{filled ? t("in post") : t("vacant")}</span>
    </Badge>
  );
}
