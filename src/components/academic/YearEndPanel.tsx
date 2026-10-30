"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DeskPill, DeskStats, StatTile } from "@/components/ui/desk";
import { Progress } from "@/components/ui/progress";
import { SkeletonList } from "@/components/ui/skeleton";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  CalendarCheck,
  GraduationCap,
  TrendingUp,
  UserCheck,
  Users,
  X,
  PieChart,
  CalendarClock,
} from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { BrandButton } from "@/components/role-dashboard";
import { AcademicYearPanel } from "@/components/academic-year/AcademicYearPanel";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { InfoTip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { Input as SystemInput } from "@/components/ui/input";
import { useUiText } from "@/components/locale/LocaleProvider";

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

/**
 * `archiveRequest` / `hideArchive` (host-owned header, §4.4b admin "Year end & promotion"): each new number opens
 * the typed-confirmation "Archive this academic year?" dialog; `hideArchive` drops the in-panel button.
 */
export function YearEndPanel({ campusId, role = "ADMIN", archiveRequest, hideArchive = false }: { campusId?: string; role?: CalendarRole; archiveRequest?: number; hideArchive?: boolean }) {
  const ui = useUiText();
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
      toast.error(ui("The year-end summary could not be loaded"));
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
    if (!activeCycle) { toast.error(ui("No active cycle to archive")); return; }
    if (archiveConfirm.trim() !== activeCycle.label) { toast.error(ui("Type the year label exactly to confirm")); return; }
    setArchiving(true);
    try {
      const res = await fetch(`/api/academic-cycle${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", cycleId: activeCycle.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "");
      toast.success(ui("{0} is now closed", [activeCycle.label]));
      setShowArchive(false);
      setArchiveConfirm("");
      await load();
    } catch (err: any) {
      toast.error(friendlyErrorMessage(err, ui("Could not archive the academic year. Try again.")));
    } finally {
      setArchiving(false);
    }
  };

  const seenArchive = useRef(archiveRequest);
  useEffect(() => {
    if (archiveRequest === undefined || seenArchive.current === archiveRequest) return;
    seenArchive.current = archiveRequest;
    if (canArchive && activeCycle) { setArchiveConfirm(""); setShowArchive(true); }
  }, [archiveRequest, canArchive, activeCycle]);

  return (
    <div className="space-y-6">
      {/* ── Year Summary dashboard ── */}
      <section className="sk-panel overflow-hidden border-edge/15">
        <div className="flex flex-col gap-4 p-6 bg-gradient-to-r from-surface-subtle via-card to-brand-100 border-b border-edge/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-primary">
              <CalendarCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-ink-strong">{ui("Year-end summary")}</h2>
              <p className="text-2xs font-medium text-ink-muted">
                {ui("Academic year {0}", [activeYear ?? ""])}
                {activeCycle ? ` · ${activeCycle.label}` : ""}
              </p>
            </div>
          </div>
          {canArchive && activeCycle && !hideArchive && (
            <BrandButton variant="danger" icon={<Archive className="w-4 h-4" />} onClick={() => { setArchiveConfirm(""); setShowArchive(true); }}>
              {ui("Archive year")}
            </BrandButton>
          )}
        </div>

        <div className="p-6">
          {loading ? (
            <SkeletonList rows={3} label={ui("Loading…")} />
          ) : (
            <>
              {/* Headline counts */}
              <DeskStats data-year-end-totals>
                <StatTile index={0} icon={Users} tone="brand" label={ui("Students")} value={totals.totalStudents} />
                <StatTile index={1} icon={GraduationCap} tone="brand" label={ui("Classes")} value={totals.totalClasses} />
                <StatTile index={2} icon={UserCheck} tone="success" label={ui("Promoted")} value={totals.promoted} />
                <StatTile index={3} icon={ArrowRight} tone="info" label={ui("Transferred")} value={totals.transferred} />
                <StatTile index={4} icon={TrendingUp} tone="warning" label={ui("Retained")} value={totals.retained} />
                <StatTile index={5} icon={Archive} tone="neutral" label={ui("Graduated")} value={totals.graduated} />
              </DeskStats>

              {/* Average grades per class + attendance */}
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-edge/15 bg-surface-subtle p-4 lg:col-span-2">
                  <div className="mb-3 flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-primary" />
                    <h4 className="flex items-center gap-1.5 text-sm font-bold text-ink-strong">{ui("Average grades per class")}{" "}<InfoTip content={ui("Mean of each student's overall weighted percentage in the class for this year. Shown for classes that are completed or have exams.")} /></h4>
                  </div>
                  {classAvgs.length === 0 ? (
                    <EmptyState size="sm" icon={PieChart} title={ui("No completed classes with grades yet for {0}.", [activeYear ?? ""])} description={ui("Averages appear once a class is completed or has exam results.")} />
                  ) : (
                    <div className="space-y-2">
                      {classAvgs.map((c) => (
                        <div key={c.classId} className="sk-panel flex flex-wrap items-center gap-3 px-3 py-2">
                          <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-ink-strong">{c.label}</bdi>
                          <Progress className="w-28" size="sm" value={c.avg != null ? Math.min(100, Math.max(0, c.avg)) : 0} tone={c.avg == null ? "neutral" : c.avg >= 80 ? "success" : c.avg >= 50 ? "warning" : "danger"} label={c.label} />
                          <span className={cn("w-12 text-end text-sm font-bold tabular-nums", c.avg != null ? (c.avg >= 80 ? "text-status-success-text" : c.avg >= 50 ? "text-status-warning-text" : "text-status-error-text") : "text-ink-subtle")}>
                            {c.avg != null ? `${Math.round(c.avg)}%` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-dashed border-edge/20 bg-surface-subtle p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-ink-subtle" />
                    <h4 className="text-sm font-bold text-ink-strong">{ui("Attendance summary")}</h4>
                  </div>
                  <p className="text-2xs font-semibold leading-relaxed text-ink-muted">
                    {ui("A campus-wide attendance roll-up for the year is coming soon. Per-class attendance is available from each class profile.")}
                  </p>
                  <DeskPill tone="warning" className="mt-3">{ui("Coming soon")}</DeskPill>
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
          title={ui("Archive this academic year?")}
          eyebrow={ui("This cannot be undone")}
          subtitle={activeCycle?.label}
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
              <BrandButton variant="soft" onClick={() => setShowArchive(false)}>{ui("Keep editing")}</BrandButton>
              <Button variant="destructive"
                loading={archiving}
                onClick={doArchive}
                disabled={archiving || archiveConfirm.trim() !== activeCycle?.label}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5"
              >
                {archiving ? ui("Archiving…") : <><Archive className="h-4 w-4" aria-hidden="true" />{" "}{ui("Archive year")}</>}
              </Button>
            </div>
          }
        >
              <div>
                <Alert tone="danger" live="off" compact className="mb-4">
                  {ui("Archiving ends the active academic year {0}. It is marked as closed and this cannot be undone here.", [activeCycle?.label ?? ""])}
                </Alert>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
                    {ui("Type {0} to confirm", [activeCycle?.label ?? ""])}
                  </span>
                  <SystemInput
                    value={archiveConfirm}
                    onChange={(e) => setArchiveConfirm(e.target.value)}
                    placeholder={activeCycle?.label}
                    className="w-full"
                  />
                </label>
              </div>
        </Modal>
      )}
    </div>
  );
}

