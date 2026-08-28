"use client";

/**
 * The charts on a teacher's dashboard.
 *
 * A teacher's console already leads with what needs doing today; these sit
 * underneath and answer the slower question — how the term is going. Both
 * charts are about *their own* classes, so nothing here needs a fetch the
 * dashboard was not already making.
 */

import { useMemo } from "react";
import { CalendarCheck, ClipboardList, GraduationCap, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyChart, InsightCard, SeriesLegend, SingleFigure, VizTooltip } from "./chart-kit";
import { AXIS_TICK, GRADE_COLOR, GRADE_ORDER, INK, NO_ENTRY_ANIMATION, SERIES, STATUS } from "./palette";

interface TeachingInsightsProps {
  /** The exam summaries the dashboard already holds. */
  exams: {
    id: string;
    title: string;
    class?: { name?: string; section?: string | null } | null;
    subject?: { name?: string } | null;
    enteredMarks: number;
    expectedMarks: number;
    missingMarks: number;
  }[];
  attendance: { total: number; present: number; absent: number; leave: number; unmarked: number };
  classHubs: { id: string; name: string; section?: string | null; _count?: { students?: number } }[];
  reportCards: { grade?: string | null }[];
  onNavigate: (path: string) => void;
}

export function TeachingInsights({
  exams,
  attendance,
  classHubs,
  reportCards,
  onNavigate,
}: TeachingInsightsProps) {
  const derived = useMemo(() => {
    // Only papers that actually expect marks — a test with nothing to enter
    // is not "0% complete", it is not yet a task.
    const markProgress = exams
      .filter((exam) => exam.expectedMarks > 0)
      .map((exam) => ({
        id: exam.id,
        label: [
          exam.class ? `${exam.class.name}${exam.class.section ? `-${exam.class.section}` : ""}` : null,
          exam.subject?.name ?? exam.title,
        ]
          .filter(Boolean)
          .join(" · "),
        Entered: exam.enteredMarks,
        Missing: exam.missingMarks,
        percent: Math.round((exam.enteredMarks / exam.expectedMarks) * 100),
      }))
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 8);

    const register = [
      { name: "Present", value: attendance.present, color: STATUS.good },
      { name: "Absent", value: attendance.absent, color: STATUS.critical },
      { name: "On leave", value: attendance.leave, color: STATUS.warning },
      { name: "Not marked", value: attendance.unmarked, color: STATUS.neutral },
    ].filter((s) => s.value > 0);

    const rolls = classHubs
      .map((hub) => ({
        name: hub.section ? `${hub.name}-${hub.section}` : hub.name,
        students: hub._count?.students ?? 0,
      }))
      .filter((r) => r.students > 0)
      .sort((a, b) => b.students - a.students);

    const grades = new Map<string, number>();
    for (const card of reportCards) {
      const grade = (card?.grade ?? "").trim().toUpperCase();
      if (!grade) continue;
      grades.set(grade, (grades.get(grade) ?? 0) + 1);
    }
    const gradeRows = [...grades.entries()]
      .sort((a, b) => {
        const ai = GRADE_ORDER.indexOf(a[0]);
        const bi = GRADE_ORDER.indexOf(b[0]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map(([grade, count]) => ({ grade, count, color: GRADE_COLOR[grade] ?? "#918a95" }));

    return { markProgress, register, rolls, gradeRows };
  }, [exams, attendance, classHubs, reportCards]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <InsightCard
          icon={ClipboardList}
          title="Marks still to enter"
          subtitle="Papers with marks outstanding, least complete first"
          className="xl:col-span-2"
          delay={80}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("/teacher/marks")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Enter marks
            </button>
          }
          table={{
            columns: ["Paper", "Entered", "Missing", "Complete %"],
            rows: derived.markProgress.map((m) => [m.label, m.Entered, m.Missing, m.percent]),
          }}
        >
          {derived.markProgress.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(200, derived.markProgress.length * 34 + 40)}>
                <BarChart
                  data={derived.markProgress}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
                  barCategoryGap="24%"
                >
                  <CartesianGrid horizontal={false} stroke={INK.grid} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={128}
                    tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)}
                  />
                  <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" marks" />} />
                  {/* 2px of surface separates the two segments — no stroke. */}
                  <Bar {...NO_ENTRY_ANIMATION} dataKey="Entered" stackId="marks" fill={SERIES[0]} stroke={INK.surface} strokeWidth={2} maxBarSize={22} />
                  <Bar
                    {...NO_ENTRY_ANIMATION}
                    dataKey="Missing"
                    stackId="marks"
                    fill={STATUS.warning}
                    stroke={INK.surface}
                    strokeWidth={2}
                    maxBarSize={22}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
              <SeriesLegend
                className="mt-3"
                items={[
                  { label: "Entered", color: SERIES[0] },
                  { label: "Still missing", color: STATUS.warning },
                ]}
              />
            </>
          ) : (
            <EmptyChart label="No papers are waiting on marks" />
          )}
        </InsightCard>

        <InsightCard
          icon={CalendarCheck}
          title="Today's register"
          subtitle={`${attendance.total} students in your classes`}
          delay={140}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("/teacher/attendance")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Mark
            </button>
          }
          table={{
            columns: ["Status", "Students"],
            rows: derived.register.map((r) => [r.name, r.value]),
          }}
        >
          {derived.register.length === 1 ? (
            <SingleFigure
              value={derived.register[0].value}
              label={derived.register[0].name}
              color={derived.register[0].color}
              note={
                derived.register[0].name === "Not marked"
                  ? "Nobody has been marked today yet."
                  : "Every student is in the same state today."
              }
            />
          ) : derived.register.length > 1 ? (
            <>
              <ResponsiveContainer width="100%" height={196}>
                <PieChart>
                  <Pie
                    {...NO_ENTRY_ANIMATION}
                    data={derived.register}
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
                    {derived.register.map((r) => (
                      <Cell key={r.name} fill={r.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<VizTooltip unit=" students" />} />
                </PieChart>
              </ResponsiveContainer>
              <SeriesLegend
                className="mt-1 justify-center"
                items={derived.register.map((r) => ({ label: r.name, color: r.color, value: r.value }))}
              />
            </>
          ) : (
            <EmptyChart label="No students to mark today" />
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <InsightCard
          icon={Users}
          title="Class sizes"
          subtitle="Students in each class you teach"
          delay={80}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("/teacher/classes")}
              className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:text-[#9c48ea]"
            >
              Classes
            </button>
          }
          table={{ columns: ["Class", "Students"], rows: derived.rolls.map((r) => [r.name, r.students]) }}
        >
          {derived.rolls.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, derived.rolls.length * 30 + 30)}>
              <BarChart data={derived.rolls} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap="24%">
                <CartesianGrid horizontal={false} stroke={INK.grid} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={86} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" students" />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="students" name="Students" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList dataKey="students" position="right" offset={8} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No classes assigned yet" />
          )}
        </InsightCard>

        <InsightCard
          icon={GraduationCap}
          title="Grades you have awarded"
          subtitle="Across your recent report cards"
          delay={140}
          table={{ columns: ["Grade", "Students"], rows: derived.gradeRows.map((g) => [g.grade, g.count]) }}
        >
          {derived.gradeRows.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, 200)}>
              <BarChart data={derived.gradeRows} margin={{ top: 18, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="grade" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(129,39,207,0.06)" }} content={<VizTooltip unit=" students" />} />
                <Bar {...NO_ENTRY_ANIMATION} dataKey="count" name="Students" radius={[4, 4, 0, 0]} maxBarSize={26}>
                  {derived.gradeRows.map((g) => (
                    <Cell key={g.grade} fill={g.color} />
                  ))}
                  <LabelList dataKey="count" position="top" offset={6} style={{ fill: INK.secondary, fontSize: 10, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Grades appear once report cards are generated" />
          )}
        </InsightCard>
      </div>
    </div>
  );
}
