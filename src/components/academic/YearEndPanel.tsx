"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  CalendarCheck,
  GraduationCap,
  Loader2,
  TrendingUp,
  UserCheck,
  Users,
  AlertTriangle,
  X,
  PieChart,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton } from "@/components/role-dashboard";
import { AcademicYearPanel } from "@/components/academic-year/AcademicYearPanel";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

type CalendarRole = "ADMIN" | "PRINCIPAL" | "TEACHER" | "STUDENT" | "PARENT";

interface YearGroup {
  year: number;
  status: string;
  classes: {
    id: string;
    name: string;
    section: string | null;
    academicYear: number;
    status: string;
    _count: { students: number; subjects: number; exams: number };
  }[];
}
interface HistoryItem { classId: string; status: string; _count: number; }
interface ClassAvg { classId: string; label: string; avg: number | null; students: number; }

export function YearEndPanel({ campusId, role = "ADMIN" }: { campusId?: string; role?: CalendarRole }) {
  const canArchive = role === "ADMIN" || role === "PRINCIPAL";

  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [historySummary, setHistorySummary] = useState<HistoryItem[]>([]);
  const [classAvgs, setClassAvgs] = useState<ClassAvg[]>([]);
  const [activeCycle, setActiveCycle] = useState<{ id: string; label: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [showArchive, setShowArchive] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState("");
  const [archiving, setArchiving] = useState(false);

  const qs = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const activeYear = useMemo(() => {
    const active = yearGroups.find((y) => y.status === "ACTIVE");
    if (active) return active.year;
    return yearGroups.length ? Math.max(...yearGroups.map((y) => y.year)) : new Date().getFullYear();
  }, [yearGroups]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ygRes, cycRes, histRes] = await Promise.all([
        fetch(`/api/academic-year${qs}`).then((r) => r.json()),
        fetch(`/api/academic-cycle${qs}`).then((r) => r.json()),
        fetch(`/api/academic-year/history?academicYear=${activeYear}${campusId ? `&campusId=${encodeURIComponent(campusId)}` : ""}`).then((r) => r.json()),
      ]);
      if (ygRes.success) setYearGroups(ygRes.data || []);
      if (cycRes.success && cycRes.active) setActiveCycle({ id: cycRes.active.id, label: cycRes.active.label });
      if (histRes.success) setHistorySummary(histRes.data?.historySummary || []);
    } catch {
      toast.error("Failed to load year-end summary");
    } finally {
      setLoading(false);
    }
  }, [qs, activeYear, campusId]);

  useEffect(() => { load(); }, [load]);

  // Average grades per class for the active year (real data, bounded to its classes).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const classes = yearGroups.find((y) => y.year === activeYear)?.classes || [];
      const completed = classes.filter((c) => c.status === "COMPLETED" || c._count.exams > 0);
      const results = await Promise.all(
        completed.map(async (c) => {
          try {
            const res = await fetch(`/api/grade-config/weighted-result?classId=${c.id}&academicYear=${activeYear}`);
            const json = await res.json();
            const grades = (json.grades || []) as { overallPercentage: number }[];
            const avg = grades.length ? grades.reduce((s, g) => s + (g.overallPercentage || 0), 0) / grades.length : null;
            return { classId: c.id, label: c.section ? `${c.name} - ${c.section}` : c.name, avg, students: c._count.students };
          } catch {
            return { classId: c.id, label: c.section ? `${c.name} - ${c.section}` : c.name, avg: null, students: c._count.students };
          }
        })
      );
      if (!cancelled) setClassAvgs(results);
    };
    run();
    return () => { cancelled = true; };
  }, [yearGroups, activeYear]);

  const totals = useMemo(() => {
    const totalStudents = yearGroups
      .filter((y) => y.year === activeYear)
      .reduce((s, y) => s + y.classes.reduce((cs, c) => cs + c._count.students, 0), 0);
    const totalClasses = yearGroups.filter((y) => y.year === activeYear).reduce((s, y) => s + y.classes.length, 0);
    const sum = (status: string) => historySummary.filter((h) => h.status === status).reduce((s, h) => s + h._count, 0);
    return {
      totalStudents,
      totalClasses,
      promoted: sum("PROMOTED"),
      transferred: sum("TRANSFERRED"),
      retained: sum("ACTIVE"),
      graduated: sum("GRADUATED"),
      dropped: sum("DROPPED"),
    };
  }, [yearGroups, historySummary, activeYear]);

  const doArchive = async () => {
    if (!activeCycle) { toast.error("No active cycle to archive"); return; }
    if (archiveConfirm.trim() !== activeCycle.label) { toast.error("Type the year label exactly to confirm"); return; }
    setArchiving(true);
    try {
      const res = await fetch(`/api/academic-cycle${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", cycleId: activeCycle.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to archive year");
      toast.success(json.message || "Academic year archived");
      setShowArchive(false);
      setArchiveConfirm("");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to archive year");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Year Summary dashboard ── */}
      <section className="overflow-hidden rounded-3xl border border-[#cfc2d6]/15 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.18)]">
        <div className="flex flex-col gap-4 p-6 bg-gradient-to-r from-[#faf7fc] via-white to-[#f3eeff] border-b border-[#cfc2d6]/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
              <CalendarCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-[#1d1b20]">Year-End Summary</h2>
              <p className="text-[11px] font-semibold text-ink-muted">
                Academic Year {activeYear}
                {activeCycle ? ` · ${activeCycle.label}` : ""}
              </p>
            </div>
          </div>
          {canArchive && activeCycle && (
            <BrandButton variant="danger" icon={<Archive className="w-4 h-4" />} onClick={() => { setArchiveConfirm(""); setShowArchive(true); }}>
              Archive Year
            </BrandButton>
          )}
        </div>

        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
              ))}
            </div>
          ) : (
            <>
              {/* Headline counts */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard icon={<Users className="h-4 w-4" />} tone="bg-[#fbf0fe] text-[#8127cf]" label="Students" value={totals.totalStudents} />
                <StatCard icon={<GraduationCap className="h-4 w-4" />} tone="bg-[#fbf0fe] text-[#8127cf]" label="Classes" value={totals.totalClasses} />
                <StatCard icon={<UserCheck className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-600" label="Promoted" value={totals.promoted} />
                <StatCard icon={<ArrowRight className="h-4 w-4" />} tone="bg-blue-50 text-blue-600" label="Transferred" value={totals.transferred} />
                <StatCard icon={<TrendingUp className="h-4 w-4" />} tone="bg-amber-50 text-amber-600" label="Retained" value={totals.retained} />
                <StatCard icon={<Archive className="h-4 w-4" />} tone="bg-rose-50 text-rose-500" label="Graduated" value={totals.graduated} />
              </div>

              {/* Average grades per class + attendance */}
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-[#cfc2d6]/15 bg-[#faf7fc] p-4 lg:col-span-2">
                  <div className="mb-3 flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-[#8127cf]" />
                    <h4 className="text-sm font-black text-[#1d1b20]">Average Grades per Class</h4>
                  </div>
                  {classAvgs.length === 0 ? (
                    <p className="py-6 text-center text-xs font-semibold text-ink-subtle">
                      No completed classes with grades yet for {activeYear}.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {classAvgs.map((c) => (
                        <div key={c.classId} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 border border-[#cfc2d6]/10">
                          <span className="flex-1 truncate text-xs font-bold text-[#1d1b20]">{c.label}</span>
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-[#e8e0ec]/50">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#6a1fb0]"
                              style={{ width: `${c.avg != null ? Math.min(100, Math.max(0, c.avg)) : 0}%` }}
                            />
                          </div>
                          <span className={cn("w-12 text-right text-sm font-black", c.avg != null ? (c.avg >= 80 ? "text-emerald-600" : c.avg >= 50 ? "text-amber-600" : "text-rose-500") : "text-ink-subtle")}>
                            {c.avg != null ? `${Math.round(c.avg)}%` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-dashed border-[#cfc2d6]/20 bg-[#faf7fc] p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-ink-subtle" />
                    <h4 className="text-sm font-black text-[#1d1b20]">Attendance Summary</h4>
                  </div>
                  <p className="text-[11px] font-semibold leading-relaxed text-ink-muted">
                    A campus-wide attendance roll-up for the year is coming soon. Per-class attendance is available from each class profile.
                  </p>
                  <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-white/70 px-3 py-2 border border-[#cfc2d6]/10">
                    <span className="h-2 w-2 rounded-full bg-[#d97706]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#d97706]">Coming soon</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Existing promotion wizard (preserved) ── */}
      <AcademicYearPanel campusId={campusId} />

      {/* ── Archive confirmation modal ── */}
      {showArchive && (
        <Modal
          title="Archive Academic Year"
          eyebrow="This cannot be undone"
          icon={Archive}
          tone="rose"
          role="alertdialog"
          size="xs"
          onClose={() => setShowArchive(false)}
          // The typed confirmation is the whole safeguard; a backdrop click
          // that wiped it would just make the user type the year again.
          disableBackdropClose={archiving}
          footer={
            <div className="flex justify-end gap-3">
              <BrandButton variant="soft" onClick={() => setShowArchive(false)}>Cancel</BrandButton>
              <button
                onClick={doArchive}
                disabled={archiving || archiveConfirm.trim() !== activeCycle?.label}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-black text-white shadow-lg transition-all hover:bg-rose-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {archiving ? <><Loader2 className="h-4 w-4 animate-spin" /> Archiving…</> : <><Archive className="h-4 w-4" /> Archive Year</>}
              </button>
            </div>
          }
        >
              <div>
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200/50 bg-rose-50 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                  <p className="text-xs font-semibold leading-relaxed text-rose-700">
                    Archiving ends the active cycle <span className="font-black">{activeCycle?.label}</span>. This marks the year as closed and cannot be undone from this panel.
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    Type <span className="font-black text-rose-600">{activeCycle?.label}</span> to confirm
                  </span>
                  <input
                    value={archiveConfirm}
                    onChange={(e) => setArchiveConfirm(e.target.value)}
                    placeholder={activeCycle?.label}
                    className="w-full rounded-xl border border-[#cfc2d6]/30 px-4 py-3 text-sm font-bold outline-none focus:border-rose-400"
                  />
                </label>
              </div>
        </Modal>
      )}
    </div>
  );
}

function StatCard({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: number }) {
  return (
    <div className={cn("rounded-2xl px-4 py-3", tone)}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-70">
        {icon} {label}
      </div>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}
