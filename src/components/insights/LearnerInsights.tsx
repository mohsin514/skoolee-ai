"use client";

/**
 * The charts a family sees — one child's academic record.
 *
 * The student portal and the guardian portal show the same four facts about
 * the same child from two differently-shaped payloads, so the charts live here
 * once and each portal hands in a normalised series.
 *
 * These sit inside an existing page rather than replacing it, so they are
 * deliberately quieter than the leadership decks: no hero, no dark banner.
 */

import { useMemo } from "react";
import { Award, BookOpen, CalendarCheck, Receipt, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyChart, InsightCard, Meter, SeriesLegend, SingleFigure, VizTooltip } from "./chart-kit";
import { AXIS_TICK, INK, SERIES, STATUS, fromMinor, money } from "./palette";

/** What both portals reduce their payload down to. */
export interface LearnerSeries {
  /** One point per published exam, oldest first. */
  examTrend: { label: string; percentage: number }[];
  /** Latest published result per subject. */
  subjects: { subject: string; percentage: number; obtained: number; total: number }[];
  attendance: { present: number; absent: number; leave: number; rate: number | null };
  /** One point per month with marked attendance, oldest first. */
  attendanceByMonth: { label: string; rate: number; marked: number }[];
  fees: { billed: number; paid: number; balance: number } | null;
}

/** The pass mark every chart here is read against. */
const PASS_MARK = 40;

export function LearnerInsights({
  series,
  /** "your" for the student's own portal, the child's first name for a guardian. */
  possessive = "your",
}: {
  series: LearnerSeries;
  possessive?: string;
}) {
  const derived = useMemo(() => {
    const split = [
      { name: "Present", value: series.attendance.present, color: STATUS.good },
      { name: "Absent", value: series.attendance.absent, color: STATUS.critical },
      { name: "On leave", value: series.attendance.leave, color: STATUS.warning },
    ].filter((s) => s.value > 0);

    const subjects = [...series.subjects].sort((a, b) => b.percentage - a.percentage);
    const best = subjects[0];
    const weakest = subjects[subjects.length - 1];

    return {
      split,
      subjects,
      best,
      weakest,
      hasTrend: series.examTrend.length > 1,
      marked: series.attendance.present + series.attendance.absent + series.attendance.leave,
    };
  }, [series]);

  const subject = possessive === "your" ? "your" : `${possessive}'s`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <InsightCard
          icon={Award}
          title="Results by subject"
          subtitle="Most recent published marks"
          className="xl:col-span-2"
          delay={80}
          table={{
            columns: ["Subject", "Score %", "Obtained", "Out of"],
            rows: derived.subjects.map((s) => [s.subject, s.percentage, s.obtained, s.total]),
          }}
        >
          {derived.subjects.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(200, derived.subjects.length * 32 + 40)}>
                <BarChart
                  data={derived.subjects}
                  layout="vertical"
                  margin={{ top: 4, right: 44, bottom: 4, left: 4 }}
                  barCategoryGap="24%"
                >
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="subject"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={96}
                    tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                  />
                  <ReferenceLine x={PASS_MARK} stroke={INK.axis} strokeWidth={1} />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit="%" />} />
                  <Bar dataKey="percentage" name="Score" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {derived.subjects.map((s) => (
                      <Cell key={s.subject} fill={s.percentage >= PASS_MARK ? SERIES[0] : STATUS.critical} />
                    ))}
                    <LabelList
                      dataKey="percentage"
                      position="right"
                      offset={8}
                      formatter={(v: any) => `${v}%`}
                      style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend
                className="mt-3"
                items={[
                  { label: `At or above ${PASS_MARK}%`, color: SERIES[0] },
                  { label: "Below the pass mark", color: STATUS.critical },
                ]}
              />
              {derived.best && derived.weakest && derived.best.subject !== derived.weakest.subject ? (
                <p className="mt-2 text-[10px] font-bold leading-relaxed text-ink-subtle">
                  Strongest in {derived.best.subject} at {derived.best.percentage}%; {derived.weakest.subject} is the
                  one to work on at {derived.weakest.percentage}%.
                </p>
              ) : null}
            </>
          ) : (
            <EmptyChart label="Subject results appear once an exam is published" />
          )}
        </InsightCard>

        <InsightCard
          icon={CalendarCheck}
          title="Attendance"
          subtitle={derived.marked > 0 ? `${derived.marked} days marked` : "Nothing marked yet"}
          delay={140}
          table={{
            columns: ["Status", "Days"],
            rows: derived.split.map((s) => [s.name, s.value]),
          }}
        >
          {derived.split.length === 1 ? (
            <SingleFigure
              value={derived.split[0].value}
              label={`${derived.split[0].name} — every marked day`}
              color={derived.split[0].color}
            />
          ) : derived.split.length > 1 ? (
            <>
              <ResponsiveContainer width="100%" height={196}>
                <PieChart>
                  <Pie
                    data={derived.split}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke={INK.surface}
                    strokeWidth={2}
                  >
                    {derived.split.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<VizTooltip unit=" days" />} />
                </PieChart>
              </ResponsiveContainer>
              <SeriesLegend
                className="mt-1 justify-center"
                items={derived.split.map((s) => ({ label: s.name, color: s.color, value: s.value }))}
              />
              {series.attendance.rate !== null ? (
                <p className="mt-2 text-center text-[10px] font-bold text-ink-subtle">
                  {series.attendance.rate}% present overall
                  {series.attendance.rate < 75 ? " — below the 75% the school expects." : "."}
                </p>
              ) : null}
            </>
          ) : (
            <EmptyChart label="No attendance has been marked yet" />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title="Exam by exam"
          subtitle="Overall percentage in each published exam"
          className={series.fees ? "xl:col-span-2" : "xl:col-span-3"}
          delay={80}
          table={{
            columns: ["Exam", "Score %"],
            rows: series.examTrend.map((e) => [e.label, e.percentage]),
          }}
        >
          {derived.hasTrend ? (
            <ResponsiveContainer width="100%" height={216}>
              <AreaChart data={series.examTrend} margin={{ top: 16, right: 16, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="learnerExamWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={10} />
                <YAxis domain={[0, 100]} unit="%" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <ReferenceLine y={PASS_MARK} stroke={INK.axis} strokeWidth={1} />
                <Tooltip cursor={{ stroke: INK.axis, strokeWidth: 1 }} content={<VizTooltip unit="%" />} />
                <Area
                  type="monotone"
                  dataKey="percentage"
                  name="Score"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#learnerExamWash)"
                  dot={{ r: 4, fill: SERIES[0], stroke: INK.surface, strokeWidth: 2 }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: INK.surface }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart
              label={
                series.examTrend.length === 1
                  ? "One exam published so far — a trend needs a second"
                  : "Exam results appear here once they are published"
              }
            />
          )}
        </InsightCard>

        {series.fees ? (
          <InsightCard icon={Receipt} title="Fees" subtitle="Invoiced to date" delay={140}>
            <div className="flex h-full flex-col justify-center gap-5 py-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Still to pay</p>
                <p className="mt-1.5 text-4xl font-black leading-none tracking-tight text-[#1f1a23]">
                  {money(series.fees.balance)}
                </p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                  {series.fees.balance > 0 ? `of ${money(series.fees.billed)} invoiced` : "All cleared — nothing due"}
                </p>
              </div>
              <Meter
                label="Paid so far"
                value={series.fees.paid}
                max={series.fees.billed || 1}
                valueLabel={`${money(series.fees.paid)} / ${money(series.fees.billed)}`}
                color={series.fees.balance > 0 ? STATUS.warning : STATUS.good}
              />
            </div>
          </InsightCard>
        ) : null}
      </div>

      {series.attendanceByMonth.length > 1 ? (
        <InsightCard
          icon={BookOpen}
          title="Attendance month by month"
          subtitle={`How ${subject} attendance has moved`}
          delay={80}
          table={{
            columns: ["Month", "Rate %", "Days marked"],
            rows: series.attendanceByMonth.map((m) => [m.label, m.rate, m.marked]),
          }}
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={series.attendanceByMonth} margin={{ top: 18, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid vertical={false} stroke={INK.grid} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={8} />
              <YAxis domain={[0, 100]} unit="%" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <ReferenceLine y={75} stroke={INK.axis} strokeWidth={1} />
              <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit="%" />} />
              <Bar dataKey="rate" name="Attendance" radius={[4, 4, 0, 0]} maxBarSize={26}>
                {series.attendanceByMonth.map((m) => (
                  <Cell key={m.label} fill={m.rate >= 75 ? STATUS.good : STATUS.warning} />
                ))}
                <LabelList
                  dataKey="rate"
                  position="top"
                  offset={6}
                  formatter={(v: any) => `${v}%`}
                  style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <SeriesLegend
            className="mt-3"
            items={[
              { label: "At or above 75%", color: STATUS.good },
              { label: "Below 75%", color: STATUS.warning },
            ]}
          />
        </InsightCard>
      ) : null}
    </div>
  );
}

/* ─── Adapters ───────────────────────────────────────────── */

function monthKey(value: string | Date): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, (month ?? 1) - 1, 1);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString(undefined, { month: "short" });
}

/** Rolls dated attendance rows up into a per-month present rate. */
function attendanceMonths(rows: { date: string | Date; status: string }[]): LearnerSeries["attendanceByMonth"] {
  const byMonth = new Map<string, { present: number; marked: number }>();
  for (const row of rows) {
    if (!row?.date) continue;
    const key = monthKey(row.date);
    const bucket = byMonth.get(key) ?? { present: 0, marked: 0 };
    bucket.marked += 1;
    if (row.status === "PRESENT") bucket.present += 1;
    byMonth.set(key, bucket);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-9)
    .map(([key, b]) => ({
      label: monthLabel(key),
      rate: b.marked > 0 ? Math.round((b.present / b.marked) * 100) : 0,
      marked: b.marked,
    }));
}

/** The student portal's own payload. */
export function learnerSeriesFromStudent(user: any): LearnerSeries {
  const marks: any[] = user?.marks ?? [];
  const attendance: any[] = user?.attendance ?? [];
  const invoices: any[] = user?.invoices ?? [];

  // One point per exam: the whole paper set, not a single subject.
  const byExam = new Map<string, { label: string; obtained: number; total: number; order: number }>();
  marks.forEach((mark, index) => {
    const exam = mark?.exam;
    if (!exam?.id) return;
    const bucket = byExam.get(exam.id) ?? {
      label: exam.title || exam.term || "Exam",
      obtained: 0,
      total: 0,
      order: index,
    };
    // An absentee did not score zero — they did not sit the paper, so the
    // paper is left out of the total rather than dragging the average down.
    if (!mark.isAbsent) {
      bucket.obtained += mark.marksObtained ?? 0;
      bucket.total += mark.subject?.totalMarks ?? mark.totalMarks ?? 0;
    }
    byExam.set(exam.id, bucket);
  });

  const examTrend = [...byExam.values()]
    .filter((e) => e.total > 0)
    .sort((a, b) => b.order - a.order)
    .map((e) => ({ label: e.label, percentage: Math.round((e.obtained / e.total) * 100) }));

  // Latest published mark per subject — `marks` arrives newest-first.
  const bySubject = new Map<string, { subject: string; obtained: number; total: number }>();
  for (const mark of marks) {
    const name = mark?.subject?.name;
    if (!name || mark.isAbsent) continue;
    if (bySubject.has(name)) continue;
    const total = mark.subject?.totalMarks ?? mark.totalMarks ?? 0;
    if (!total) continue;
    bySubject.set(name, { subject: name, obtained: mark.marksObtained ?? 0, total });
  }

  const billed = invoices.reduce((sum, i) => sum + (i.totalAmount ?? 0), 0);
  const paid = invoices.reduce(
    (sum, i) => sum + (i.payments ?? []).reduce((p: number, x: any) => p + (x.amount ?? 0), 0),
    0,
  );

  return {
    examTrend,
    subjects: [...bySubject.values()].map((s) => ({
      ...s,
      percentage: Math.round((s.obtained / s.total) * 100),
    })),
    attendance: {
      present: attendance.filter((a) => a.status === "PRESENT").length,
      absent: attendance.filter((a) => a.status === "ABSENT").length,
      leave: attendance.filter((a) => a.status === "LEAVE").length,
      rate: user?.attendanceRate ?? null,
    },
    attendanceByMonth: attendanceMonths(attendance),
    fees: billed > 0
      ? { billed: fromMinor(billed), paid: fromMinor(paid), balance: fromMinor(user?.balanceDue ?? 0) }
      : null,
  };
}

/** The guardian portal's already-normalised payload. */
export function learnerSeriesFromParent(data: any): LearnerSeries {
  const marksByExam: any[] = data?.marksByExam ?? [];
  const fees: any[] = data?.fees ?? [];
  const attendance = data?.attendance ?? { rate: null, total: 0, present: 0, recent: [] };

  const examTrend = marksByExam
    .map((exam) => {
      const obtained = (exam.marks ?? []).reduce((sum: number, m: any) => sum + (m.obtained ?? 0), 0);
      const total = (exam.marks ?? []).reduce((sum: number, m: any) => sum + (m.total ?? 0), 0);
      return {
        label: exam.examTitle || exam.term || "Exam",
        percentage: total > 0 ? Math.round((obtained / total) * 100) : 0,
        total,
      };
    })
    .filter((e) => e.total > 0)
    .reverse()
    .map(({ label, percentage }) => ({ label, percentage }));

  // The most recent exam is the one whose subject breakdown is worth showing.
  const latest = marksByExam[0];
  const subjects = (latest?.marks ?? [])
    .filter((m: any) => (m.total ?? 0) > 0)
    .map((m: any) => ({
      subject: m.subject,
      obtained: m.obtained ?? 0,
      total: m.total ?? 0,
      percentage: Math.round(((m.obtained ?? 0) / m.total) * 100),
    }));

  const recent: any[] = attendance.recent ?? [];
  const billed = fees.reduce((sum, f) => sum + (f.totalAmount ?? 0), 0);
  const paid = fees.reduce((sum, f) => sum + (f.paid ?? 0), 0);
  const balance = fees.reduce((sum, f) => sum + (f.balance ?? 0), 0);

  return {
    examTrend,
    subjects,
    attendance: {
      present: attendance.present ?? 0,
      // The portal ships a present count and a total; the remainder is every
      // other state, which it does not break down further.
      absent: Math.max(0, (attendance.total ?? 0) - (attendance.present ?? 0)),
      leave: 0,
      rate: attendance.rate ?? null,
    },
    attendanceByMonth: attendanceMonths(recent),
    fees: billed > 0 ? { billed: fromMinor(billed), paid: fromMinor(paid), balance: fromMinor(balance) } : null,
  };
}
