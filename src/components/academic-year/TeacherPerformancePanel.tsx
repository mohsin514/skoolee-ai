"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Award, BarChart3, BookOpen, Download, LayoutGrid,
  Search, Table2, TrendingDown, TrendingUp, UserCheck, Users,
} from "lucide-react";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { userMessage } from "@/lib/errors";
import { downloadCSV } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { AvatarImage } from "@/components/ui/avatar-image";
import {
  DataTable,
  StatTiles,
  ViewSwitch,
  WorkspaceHeader,
  WorkspaceToolbar,
  type DataColumn,
  type WorkspaceView,
} from "@/components/shared-admin/workspace";

interface TeacherPerf {
  teacherId: string;
  fullName: string;
  email: string;
  profileImageUrl: string | null;
  subjectsCount: number;
  classesCount: number;
  ledClasses: { id: string; name: string; section: string | null }[];
  totalStudents: number;
  avgPercentage: number | null;
  passRate: number | null;
  attendanceCompletionRate: number | null;
  marksCompletionRate: number | null;
  reportCardsGenerated: number;
  teacherAttendanceRate: number | null;
  teacherPresentDays?: number;
  teacherTotalDays?: number;
}

type Lens = "all" | "attention" | "admin";

/**
 * Below this, a rate is treated as a problem rather than a number. Kept as one
 * constant so the "needs attention" count, the row highlight and the tile hint
 * can never disagree about what counts as behind.
 */
const ATTENTION_BELOW = 60;

/**
 * A teacher needs looking at when their classes are underperforming *or* when
 * the paperwork the school runs on has not been done. The two are different
 * problems and the second is the one an admin can act on today, so it is
 * surfaced rather than buried in a fourth metric tile.
 */
function needsAttention(t: TeacherPerf) {
  return (
    (t.avgPercentage !== null && t.avgPercentage < ATTENTION_BELOW) ||
    (t.passRate !== null && t.passRate < ATTENTION_BELOW) ||
    (t.marksCompletionRate !== null && t.marksCompletionRate < ATTENTION_BELOW) ||
    (t.teacherAttendanceRate !== null && t.teacherAttendanceRate < ATTENTION_BELOW)
  );
}

/** Marks and attendance registers that are not up to date. */
function adminBehind(t: TeacherPerf) {
  return (
    (t.marksCompletionRate !== null && t.marksCompletionRate < 100) ||
    (t.attendanceCompletionRate !== null && t.attendanceCompletionRate < 100)
  );
}

function rateColor(val: number | null) {
  if (val === null) return "text-ink-subtle";
  if (val >= 80) return "text-emerald-600";
  if (val >= ATTENTION_BELOW) return "text-amber-600";
  return "text-rose-600";
}

function rateBg(val: number | null) {
  if (val === null) return "bg-[#f3f4f9]";
  if (val >= 80) return "bg-emerald-50";
  if (val >= ATTENTION_BELOW) return "bg-amber-50";
  return "bg-rose-50";
}

function pct(val: number | null) {
  return val !== null ? `${val}%` : "—";
}

/** A number with the bar behind it, so a column of rates is scannable. */
function RateCell({ value }: { value: number | null }) {
  return (
    <div className="min-w-[68px]">
      <p className={cn("text-sm font-bold tabular-nums", rateColor(value))}>{pct(value)}</p>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#f0ecf4]">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value === null ? "bg-transparent"
              : value >= 80 ? "bg-emerald-500"
                : value >= ATTENTION_BELOW ? "bg-amber-500" : "bg-rose-500",
          )}
          style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

export function TeacherPerformancePanel({ campusId }: { campusId?: string }) {
  const [teachers, setTeachers] = useState<TeacherPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lens, setLens] = useState<Lens>("all");
  const [view, setView] = useState<WorkspaceView>("cards");
  const [sortBy, setSortBy] = useState<"avgPercentage" | "passRate" | "teacherAttendanceRate" | "marksCompletionRate">("avgPercentage");
  const [year, setYear] = useState(() => new Date().getFullYear());

  const qs = campusId ? `&campusId=${campusId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/teachers/performance?academicYear=${year}${qs}`);
      const json = await res.json().catch(() => null);
      // fetch resolves on a 4xx/5xx, so the old `if (json.success)` quietly did
      // nothing and the panel rendered zeros — a broken endpoint was
      // indistinguishable from a campus with no teachers.
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      setTeachers(json.data || []);
    } catch (error) {
      setTeachers([]);
      setLoadError(userMessage(error, "Could not load teacher performance."));
    } finally {
      setLoading(false);
    }
  }, [year, qs]);

  useEffect(() => { load(); }, [load]);

  const attentionList = useMemo(() => teachers.filter(needsAttention), [teachers]);
  const adminList = useMemo(() => teachers.filter(adminBehind), [teachers]);

  const sorted = useMemo(() => {
    const pool =
      lens === "attention" ? attentionList : lens === "admin" ? adminList : teachers;
    return [...pool]
      .filter((t) => !search || t.fullName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1));
  }, [teachers, attentionList, adminList, lens, search, sortBy]);

  /**
   * Averages are taken over the teachers who actually have a figure. Dividing a
   * sum that skipped nulls by the full headcount — as this did — pulled the
   * campus average down every time a new teacher joined mid-year.
   */
  const avgOf = (read: (t: TeacherPerf) => number | null) => {
    const values = teachers.map(read).filter((v): v is number => v !== null);
    if (!values.length) return null;
    return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
  };

  const avgScore = useMemo(() => avgOf((t) => t.avgPercentage), [teachers]);
  const avgPass = useMemo(() => avgOf((t) => t.passRate), [teachers]);
  const avgMarks = useMemo(() => avgOf((t) => t.marksCompletionRate), [teachers]);

  const exportCSV = () => {
    if (!sorted.length) return;
    downloadCSV(`teacher_performance_${year}`, [
      ["Teacher", "Email", "Subjects", "Classes", "Students", "Class teacher of",
        "Avg score %", "Pass rate %", "Own attendance %", "Marks entry %",
        "Attendance entry %", "Report cards", "Needs attention"],
      ...sorted.map((t) => [
        t.fullName,
        t.email,
        t.subjectsCount,
        t.classesCount,
        t.totalStudents,
        t.ledClasses.map((c) => `${c.name}${c.section ? `-${c.section}` : ""}`).join(" / "),
        t.avgPercentage ?? "",
        t.passRate ?? "",
        t.teacherAttendanceRate ?? "",
        t.marksCompletionRate ?? "",
        t.attendanceCompletionRate ?? "",
        t.reportCardsGenerated,
        needsAttention(t) ? "Yes" : "No",
      ]),
    ]);
  };

  const columns: DataColumn<TeacherPerf>[] = [
    {
      key: "name",
      label: "Teacher",
      width: "w-64",
      render: (t) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-[#fbf0fe]">
            <AvatarImage src={t.profileImageUrl} name={t.fullName} alt="" className="h-full w-full object-cover" initialsClassName="text-[10px]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-[#1d1b20]">{t.fullName}</p>
            <p className="truncate text-[10px] font-semibold text-ink-subtle">
              {t.subjectsCount} subjects · {t.classesCount} classes · {t.totalStudents} students
            </p>
          </div>
        </div>
      ),
    },
    { key: "avgPercentage", label: "Avg score", align: "center", render: (t) => <RateCell value={t.avgPercentage} /> },
    { key: "passRate", label: "Pass rate", align: "center", render: (t) => <RateCell value={t.passRate} /> },
    { key: "teacherAttendanceRate", label: "Own attendance", align: "center", secondary: true, render: (t) => <RateCell value={t.teacherAttendanceRate} /> },
    { key: "marksCompletionRate", label: "Marks entry", align: "center", render: (t) => <RateCell value={t.marksCompletionRate} /> },
    { key: "attendanceCompletionRate", label: "Register entry", align: "center", secondary: true, render: (t) => <RateCell value={t.attendanceCompletionRate} /> },
    {
      key: "reportCardsGenerated",
      label: "Reports",
      align: "center",
      secondary: true,
      render: (t) => <span className="text-sm font-bold tabular-nums text-ink">{t.reportCardsGenerated}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <WorkspaceHeader
        icon={Award}
        eyebrow="Staff"
        title="Teacher Performance"
        tone="reports"
        summary={
          loadError
            ? "Figures unavailable — the performance service did not respond."
            : `${teachers.length} teacher${teachers.length === 1 ? "" : "s"} in ${year}${attentionList.length ? ` · ${attentionList.length} need a look` : " · all on track"}`
        }
        actions={
          <>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Academic year"
              className="h-10 cursor-pointer rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold outline-none transition-colors focus:border-[#8127cf]/30"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <BrandButton
              variant="soft"
              icon={<Download className="h-4 w-4" />}
              onClick={exportCSV}
              disabled={!sorted.length}
              className="h-10"
            >
              Export
            </BrandButton>
          </>
        }
      />

      {/* Four figures, each of which is also a filter. "Behind on paperwork" is
          the one that changes what an admin does this afternoon. */}
      <StatTiles
        tiles={[
          {
            key: "teachers",
            icon: Users,
            label: "Teachers",
            value: loadError ? "—" : teachers.length,
            hint: `${teachers.reduce((s, t) => s + t.totalStudents, 0)} students taught`,
            tone: "violet",
            active: lens === "all",
            onClick: () => setLens("all"),
          },
          {
            key: "avg",
            icon: BarChart3,
            label: "Avg score",
            value: loadError ? "—" : pct(avgScore),
            hint: avgPass !== null ? `${avgPass}% average pass rate` : "No results recorded yet",
            tone: avgScore === null ? "slate" : avgScore >= 80 ? "emerald" : avgScore >= ATTENTION_BELOW ? "amber" : "rose",
          },
          {
            key: "attention",
            icon: AlertTriangle,
            label: "Need a look",
            value: loadError ? "—" : attentionList.length,
            hint: `Any rate under ${ATTENTION_BELOW}%`,
            tone: attentionList.length ? "rose" : "emerald",
            active: lens === "attention",
            onClick: () => setLens(lens === "attention" ? "all" : "attention"),
          },
          {
            key: "admin",
            icon: BookOpen,
            label: "Behind on entry",
            value: loadError ? "—" : adminList.length,
            hint: avgMarks !== null ? `${avgMarks}% of marks entered` : "Marks not started",
            tone: adminList.length ? "amber" : "emerald",
            active: lens === "admin",
            onClick: () => setLens(lens === "admin" ? "all" : "admin"),
          },
        ]}
      />

      <WorkspaceToolbar
        trailing={
          <>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sort teachers"
              className="h-10 cursor-pointer rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold outline-none transition-colors focus:border-[#8127cf]/30"
            >
              <option value="avgPercentage">Sort: Avg Score</option>
              <option value="passRate">Sort: Pass Rate</option>
              <option value="teacherAttendanceRate">Sort: Own Attendance</option>
              <option value="marksCompletionRate">Sort: Marks Entry</option>
            </select>
            <ViewSwitch
              value={view}
              onChange={setView}
              options={[
                { value: "cards", label: "Cards", icon: LayoutGrid },
                { value: "table", label: "Table", icon: Table2 },
              ]}
            />
          </>
        }
      >
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teachers..."
            aria-label="Search teachers"
            className="h-10 w-full rounded-xl border border-[#cfc2d6]/20 bg-white pl-9 pr-3 text-sm font-semibold outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/30 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
          />
        </div>
        {lens !== "all" ? (
          <button
            type="button"
            onClick={() => setLens("all")}
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[#fbf0fe] px-3 text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:bg-[#f0e0f8]"
          >
            {lens === "attention" ? "Showing: need a look" : "Showing: behind on entry"} · Clear
          </button>
        ) : null}
      </WorkspaceToolbar>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-skeleton-in rounded-2xl border border-[#cfc2d6]/10 bg-white p-5" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-start gap-4">
                <div className="h-8 w-8 rounded-xl bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="h-11 w-11 rounded-xl bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                  <div className="h-3 w-48 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="rounded-xl bg-[#f3f4f9] p-2">
                    <div className="mb-1 h-4 w-10 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                    <div className="h-2 w-14 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        // A failed request is not an empty campus. Say so, and offer a retry,
        // rather than showing zeros that read as "there are no teachers".
        <div className="rounded-2xl border border-rose-200/60 bg-rose-50/50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-rose-500" />
          <p className="text-sm font-black text-[#1f1a23]">Couldn&apos;t load teacher performance</p>
          <p className="mt-1 text-xs font-semibold text-ink-muted">{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="mt-4 rounded-xl bg-[#1f1a23] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:bg-[#332b38] active:scale-95"
          >
            Try again
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Award}
          title={lens === "all" ? "No Performance Data" : "Nothing in this filter"}
          description={
            lens === "all"
              ? "No teacher performance data available for this year."
              : "Every teacher is clear of this filter — switch back to all teachers."
          }
        />
      ) : view === "table" ? (
        <DataTable
          rows={sorted}
          columns={columns}
          rowKey={(t) => t.teacherId}
          rowClassName={(t) => (needsAttention(t) ? "bg-rose-50/40" : undefined)}
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((teacher, rank) => (
            <div
              key={teacher.teacherId}
              className={cn(
                "sk-rise rounded-2xl border bg-white p-5 transition-all duration-200 hover:border-[#8127cf]/25 hover:shadow-md",
                needsAttention(teacher) ? "border-rose-200/70" : "border-[#cfc2d6]/25",
              )}
              style={{ animationDelay: `${rank * 60}ms` }}
            >
              <div className="flex items-start gap-4">
                {/* Rank is only meaningful while the list is the whole staff in
                    score order; under a filter it would number an arbitrary
                    subset, so it is dropped rather than made up. */}
                {lens === "all" && !search ? (
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold",
                    rank === 0 ? "bg-amber-50 text-amber-600" :
                      rank === 1 ? "bg-slate-100 text-slate-500" :
                        rank === 2 ? "bg-orange-50 text-orange-500" :
                          "bg-[#f3f4f9] text-ink-subtle",
                  )}>
                    {rank + 1}
                  </div>
                ) : null}

                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[#fbf0fe]">
                  <AvatarImage src={teacher.profileImageUrl} name={teacher.fullName} alt="" className="h-full w-full object-cover" initialsClassName="text-xs" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold tracking-tight text-[#1d1b20]">{teacher.fullName}</p>
                    {lens === "all" && !search && rank === 0 && teacher.avgPercentage !== null && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">Top Performer</span>
                    )}
                    {needsAttention(teacher) && (
                      <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-600">
                        <AlertTriangle className="h-3 w-3" /> Needs a look
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold text-ink-subtle">{teacher.subjectsCount} subjects</span>
                    <span className="text-ink-subtle">|</span>
                    <span className="text-[10px] font-semibold text-ink-subtle">{teacher.classesCount} classes</span>
                    <span className="text-ink-subtle">|</span>
                    <span className="text-[10px] font-semibold text-ink-subtle">{teacher.totalStudents} students</span>
                    {teacher.ledClasses.length > 0 && (
                      <>
                        <span className="text-ink-subtle">|</span>
                        <span className="text-[10px] font-semibold text-[#8127cf]">
                          CT: {teacher.ledClasses.map((c) => `${c.name}${c.section ? `-${c.section}` : ""}`).join(", ")}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-ink-subtle">Report cards</p>
                  <p className="text-lg font-black tabular-nums leading-tight text-[#1f1a23]">{teacher.reportCardsGenerated}</p>
                </div>
              </div>

              {/* Six rates, not four: whether the register is up to date is as
                  actionable as the class average, and it was only in the CSV. */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <div className={cn("rounded-xl px-3 py-2", rateBg(teacher.avgPercentage))}>
                  <div className="flex items-center gap-1">
                    {teacher.avgPercentage !== null && teacher.avgPercentage >= 70
                      ? <TrendingUp className={cn("h-3.5 w-3.5", rateColor(teacher.avgPercentage))} />
                      : <TrendingDown className={cn("h-3.5 w-3.5", rateColor(teacher.avgPercentage))} />}
                    <p className={cn("text-sm font-bold tabular-nums", rateColor(teacher.avgPercentage))}>{pct(teacher.avgPercentage)}</p>
                  </div>
                  <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-ink-subtle">Avg Score</p>
                </div>

                <div className={cn("rounded-xl px-3 py-2", rateBg(teacher.passRate))}>
                  <p className={cn("text-sm font-bold tabular-nums", rateColor(teacher.passRate))}>{pct(teacher.passRate)}</p>
                  <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-ink-subtle">Pass Rate</p>
                </div>

                <div className={cn("rounded-xl px-3 py-2", rateBg(teacher.teacherAttendanceRate))}>
                  <div className="flex items-center gap-1">
                    <UserCheck className={cn("h-3.5 w-3.5", rateColor(teacher.teacherAttendanceRate))} />
                    <p className={cn("text-sm font-bold tabular-nums", rateColor(teacher.teacherAttendanceRate))}>{pct(teacher.teacherAttendanceRate)}</p>
                  </div>
                  <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-ink-subtle">
                    Own Attendance
                    {teacher.teacherTotalDays
                      ? ` · ${teacher.teacherPresentDays ?? 0}/${teacher.teacherTotalDays}`
                      : ""}
                  </p>
                </div>

                <div className={cn("rounded-xl px-3 py-2", rateBg(teacher.marksCompletionRate))}>
                  <p className={cn("text-sm font-bold tabular-nums", rateColor(teacher.marksCompletionRate))}>{pct(teacher.marksCompletionRate)}</p>
                  <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-ink-subtle">Marks Entry</p>
                </div>

                <div className={cn("rounded-xl px-3 py-2", rateBg(teacher.attendanceCompletionRate))}>
                  <p className={cn("text-sm font-bold tabular-nums", rateColor(teacher.attendanceCompletionRate))}>{pct(teacher.attendanceCompletionRate)}</p>
                  <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-ink-subtle">Register Entry</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
