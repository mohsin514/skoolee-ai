"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, Calendar, CheckCircle2, ChevronDown, ChevronRight,
  GraduationCap, History, Lock, RefreshCw, Users, X,
} from "lucide-react";
import { BookOpenCheck, Layers3, LibraryBig, UsersRound } from "lucide-react";
import { DeskStats, StatTile, deskRow } from "@/components/ui/desk";
import { toast } from "@/components/ui/toast";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { AvatarImage } from "@/components/ui/avatar-image";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
import { Select as SystemSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { resultGradeLabel } from "@/lib/locale/result-grade";


interface ClassSummary {
  id: string;
  name: string;
  section: string | null;
  academicYear: number;
  status: string;
  classTeacher?: { fullName: string } | null;
  _count: { students: number; subjects: number; exams: number };
}

interface YearGroup {
  year: number;
  status: string;
  classes: ClassSummary[];
}

/**
 * How a class/year roll-up status reads on screen.
 *
 * The underlying value is Class.status (ACTIVE | COMPLETED), which says whether
 * a year's classes have been closed out. That is a different question from
 * AcademicCycle.status, which says which session the campus is currently
 * running and is also rendered as an "ACTIVE" pill. Both used to appear on this
 * screen at once — "2027 · ACTIVE" for the cycle and "2026 · ACTIVE" for the
 * classes — which just looked like the page contradicting itself. Open/Closed
 * keeps this one about the classes and pairs with the Close Year button beside
 * it.
 */
function yearStatusLabel(status: string) {
  if (status === "ACTIVE") return "Open";
  if (status === "COMPLETED") return "Closed";
  return status;
}

interface HistoryRecord {
  id: string;
  rollNo: string;
  academicYear: number;
  status: string;
  finalGrade: string | null;
  finalPercentage: number | null;
  promotedToClassId: string | null;
  student: { id: string; fullName: string; admissionNo: string | null; profileImageUrl: string | null; class?: { name: string; section: string | null } };
  class: { id: string; name: string; section: string | null };
}

interface GradeResult {
  studentId: string;
  studentName: string;
  rollNo: string | null;
  overallPercentage: number;
  overallGrade: string;
  passed: boolean;
  rank: number;
}

type PromotionStep = "source" | "review" | "target" | "confirm";
type StudentDecision = "promote" | "retain";

function clsLabel(c: { name: string; section: string | null }) {
  return c.section ? `${c.name} - ${c.section}` : c.name;
}

function generateRollNoPreview(targetName: string, targetSection: string | null, index: number, existingMax: number) {
  const abbrev = targetName.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  const secChar = (targetSection || "A").charAt(0).toUpperCase();
  const seqNum = existingMax + 1 + index;
  return `${abbrev}-${secChar}-${String(seqNum).padStart(3, "0")}`;
}

export function AcademicYearPanel({ campusId }: { campusId?: string }) {
  const ui = useUiText();
  // SKO-496: a result grade is not the school level ("Grade" in the interface catalog).
  const gradeLabel = resultGradeLabel(useLocale().language);
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [historyYear, setHistoryYear] = useState<number | null>(null);
  const [historyClassId, setHistoryClassId] = useState("");
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Promotion wizard
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteStep, setPromoteStep] = useState<PromotionStep>("source");
  const [promoteSourceId, setPromoteSourceId] = useState("");
  const [promoteTargetId, setPromoteTargetId] = useState("");
  const [gradeResults, setGradeResults] = useState<GradeResult[]>([]);
  const [gradeLoading, setGradeLoading] = useState(false);
  const [gradeError, setGradeError] = useState("");
  const [studentDecisions, setStudentDecisions] = useState<Map<string, StudentDecision>>(new Map());
  const [promoting, setPromoting] = useState(false);
  const [confirmCloseYear, setConfirmCloseYear] = useState<number | null>(null);
  const [promotionResults, setPromotionResults] = useState<{ promoted: number; retained: number } | null>(null);

  const qs = campusId ? `?campusId=${campusId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/academic-year${qs}`);
      const json = await res.json();
      if (json.success) setYearGroups(json.data || []);
    } catch { toast.error(ui("Academic year data could not be loaded")); }
    finally { setLoading(false); }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  const closePromotionWizard = useCallback(() => {
    setShowPromoteModal(false);
    setPromoteStep("source");
    setPromoteSourceId("");
    setPromoteTargetId("");
    setGradeResults([]);
    setGradeError("");
    setStudentDecisions(new Map());
    setPromotionResults(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showPromoteModal) { closePromotionWizard(); return; }
      if (historyYear && historyClassId) { setHistoryYear(null); setHistoryClassId(""); setHistoryRecords([]); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showPromoteModal, historyYear, historyClassId, closePromotionWizard]);

  const handleCloseYear = useCallback(async (year: number) => {
    setClosing(true);
    try {
      const res = await fetch("/api/academic-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close-year", academicYear: year, campusId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to close year");
      toast.success(json.message);
      await load();
      openPromotionWizard();
      return true;
    } catch (err: any) { toast.error(err.message); return false; }
    finally { setClosing(false); }
  }, [campusId, load]);

  // SKO-404: promotion is reviewed as one versioned year-end plan, so every
  // entry point leads there; the per-class wizard below no longer opens (its
  // endpoint is retired) and is kept only until its contract baseline is reviewed.
  const openPromotionWizard = (_sourceClassId?: string) => {
    const plan = document.getElementById("year-end-rollover");
    if (plan) { plan.scrollIntoView({ behavior: "smooth", block: "start" }); plan.focus(); return; }
    toast.info(ui("Promotion is reviewed as a year-end plan under Promote Students."));
  };

  const loadStudentsFallback = useCallback(async (classId: string) => {
    try {
      const res = await fetch(`/api/students?classId=${classId}`);
      const json = await res.json();
      const students: any[] = json.success ? (json.data || []) : [];
      const fallback: GradeResult[] = students.map((s: any, idx: number) => ({
        studentId: s.id,
        studentName: s.fullName || s.name || "Unknown",
        rollNo: s.rollNo || null,
        overallPercentage: 0,
        overallGrade: "—",
        passed: true,
        rank: idx + 1,
      }));
      setGradeResults(fallback);
      const decisions = new Map<string, StudentDecision>();
      fallback.forEach((g) => decisions.set(g.studentId, "promote"));
      setStudentDecisions(decisions);
    } catch { /* keep gradeResults empty */ }
  }, []);

  const loadGrades = useCallback(async (classId: string, academicYear: number) => {
    setGradeLoading(true);
    setGradeError("");
    try {
      const res = await fetch(`/api/grade-config/weighted-result?classId=${classId}&academicYear=${academicYear}`);
      const json = await res.json();
      if (!res.ok) {
        setGradeError(json.error || "Could not load grades");
        await loadStudentsFallback(classId);
      } else {
        const grades: GradeResult[] = (json.grades || []).map((g: any) => ({
          studentId: g.studentId,
          studentName: g.studentName,
          rollNo: g.rollNo,
          overallPercentage: g.overallPercentage || 0,
          overallGrade: g.overallGrade || "—",
          passed: g.passed ?? true,
          rank: g.rank || 0,
        }));
        setGradeResults(grades);
        const decisions = new Map<string, StudentDecision>();
        grades.forEach((g) => decisions.set(g.studentId, g.passed ? "promote" : "retain"));
        setStudentDecisions(decisions);
      }
    } catch {
      setGradeError("Failed to load grade data");
      await loadStudentsFallback(classId);
    }
    finally { setGradeLoading(false); }
  }, [loadStudentsFallback]);

  const handlePromote = useCallback(async () => {
    const toPromote = gradeResults.filter((g) => studentDecisions.get(g.studentId) === "promote");
    if (toPromote.length === 0) { toast.error(ui("No students selected for promotion")); return; }
    if (!promoteTargetId) { toast.error(ui("Select a target class")); return; }
    const srcClass = yearGroups.flatMap((yg) => yg.classes).find((c) => c.id === promoteSourceId);
    if (!srcClass) { toast.error(ui("The source class could not be found")); return; }

    setPromoting(true);
    try {
      const results = gradeResults.map((g) => ({
        studentId: g.studentId,
        outcome: studentDecisions.get(g.studentId) === "promote" ? "PASS" : "FAIL",
        finalGrade: g.overallGrade || null,
        finalPercentage: g.overallPercentage || null,
      }));
      const res = await fetch("/api/students/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromClassId: promoteSourceId,
          toClassId: promoteTargetId,
          academicYear: srcClass.academicYear,
          results,
          campusId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Promotion failed");
      const retained = gradeResults.length - (json.promoted || toPromote.length);
      setPromotionResults({ promoted: json.promoted || toPromote.length, retained: json.retained ?? retained });
      setPromoteStep("confirm");
      toast.success(json.message);
      await load();
    } catch (err: any) { toast.error(err.message); }
    finally { setPromoting(false); }
  }, [gradeResults, studentDecisions, promoteTargetId, promoteSourceId, yearGroups, campusId, load]);

  const loadHistory = useCallback(async (year: number, classId: string) => {
    setHistoryLoading(true);
    setHistoryYear(year);
    setHistoryClassId(classId);
    try {
      const res = await fetch(`/api/academic-year/history?academicYear=${year}&classId=${classId}${campusId ? `&campusId=${campusId}` : ""}`);
      const json = await res.json();
      if (json.success) setHistoryRecords(json.data?.students || []);
    } catch { toast.error(ui("Year history could not be loaded")); }
    finally { setHistoryLoading(false); }
  }, [campusId]);

  const allClasses = yearGroups.flatMap((yg) => yg.classes);
  const activeClasses = allClasses.filter((c) => c.status === "ACTIVE");
  const sourceClass = allClasses.find((c) => c.id === promoteSourceId);
  const targetClass = allClasses.find((c) => c.id === promoteTargetId);

  const studentsToPromote = gradeResults.filter((g) => studentDecisions.get(g.studentId) === "promote");
  const studentsToRetain = gradeResults.filter((g) => studentDecisions.get(g.studentId) === "retain");

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="sk-panel overflow-hidden animate-skeleton-in" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-border-subtle/50 skeleton-shimmer" />
                <div className="space-y-2">
                  <div className="h-5 w-40 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-16 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                    <div className="h-3 w-20 rounded-full bg-border-subtle/30 skeleton-shimmer" />
                  </div>
                </div>
              </div>
              <div className="h-5 w-5 rounded bg-border-subtle/30 skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmAction
        open={confirmCloseYear !== null}
        tone="danger"
        title={ui("Close academic year {0}?", [confirmCloseYear ?? ""])}
        description={ui("You can still view past year data after closing.")}
        detail={<ul className="list-disc space-y-1 ps-5 text-sm text-ink-muted"><li>{ui("Save final grades to student history")}</li><li>{ui("Mark all classes as completed")}</li><li>{ui("Generate admission numbers for students without one")}</li></ul>}
        confirmLabel={ui("Close year")}
        busy={closing}
        onCancel={() => setConfirmCloseYear(null)}
        onConfirm={async () => { const y = confirmCloseYear; if (y !== null && await handleCloseYear(y)) setConfirmCloseYear(null); }}
      />
      <div className="flex flex-wrap gap-3">
        <BrandButton variant="dark" icon={<ArrowRight className="w-4 h-4 rtl:rotate-180" />} onClick={() => openPromotionWizard()}>
          {ui("Promote students")}
        </BrandButton>
      </div>

      {/* The most recent year at a glance, before the per-year breakdown. */}
      {yearGroups.length > 0 ? (() => {
        const latest = yearGroups.reduce((a, b) => (b.year > a.year ? b : a));
        const sum = (key: keyof ClassSummary["_count"]) => latest.classes.reduce((n, c) => n + c._count[key], 0);
        const hint = ui("Academic year {0}", [latest.year]);
        return (
          <DeskStats data-year-stats={latest.year}>
            <StatTile index={0} icon={UsersRound} tone="brand" value={sum("students")} label={ui("Students")} hint={hint} />
            <StatTile index={1} icon={Layers3} tone="info" value={latest.classes.length} label={ui("Classes")} hint={hint} />
            <StatTile index={2} icon={LibraryBig} tone="success" value={sum("subjects")} label={ui("Subjects")} hint={hint} />
            <StatTile index={3} icon={BookOpenCheck} tone="warning" value={sum("exams")} label={ui("Exams")} hint={hint} />
          </DeskStats>
        );
      })() : null}

      {yearGroups.length === 0 ? (
        <EmptyState icon={Calendar} title={ui("No academic years")} description={ui("Create classes with an academic year to get started.")} />
      ) : (
        <div className="space-y-4">
          {yearGroups.map((yg, i) => (
            <div key={yg.year} className="sk-panel sk-rise overflow-hidden" style={{ animationDelay: `${i * 100}ms` }}>
              <div
                role="button" tabIndex={0}
                onClick={() => setExpandedYear(expandedYear === yg.year ? null : yg.year)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedYear(expandedYear === yg.year ? null : yg.year); } }}
                className="w-full flex items-center justify-between p-5 text-start cursor-pointer hover:bg-brand-50/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${yg.status === "COMPLETED" ? "bg-status-success-surface text-status-success-text" : "bg-brand-50 text-primary"}`}>
                    {yg.status === "COMPLETED" ? <CheckCircle2 className="h-6 w-6" /> : <Calendar className="h-6 w-6" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-ink-strong">{ui("Academic year {0}", [yg.year])}</h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      <Badge size="sm" dot variant={yg.status === "COMPLETED" ? "success" : "info"}>
                        {yearStatusLabel(yg.status)}
                      </Badge>
                      <span className="text-2xs font-semibold text-ink-muted">{ui("{0} classes", [yg.classes.length])}</span>
                      <span className="text-2xs font-semibold text-ink-muted">{ui("{0} students", [yg.classes.reduce((s, c) => s + c._count.students, 0)])}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {yg.status === "ACTIVE" && (
                    <BrandButton
                      variant="soft"
                      icon={closing ? null : <Lock className="w-4 h-4" />}
                      loading={closing}
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); setConfirmCloseYear(yg.year); }}
                      disabled={closing}
                    >
                      {ui("Close year")}
                    </BrandButton>
                  )}
                  {expandedYear === yg.year ? <ChevronDown className="h-5 w-5 text-ink-subtle" /> : <ChevronRight className="h-5 w-5 text-ink-subtle" />}
                </div>
              </div>

              {expandedYear === yg.year && (
                <div className="border-t border-edge/10 p-5 bg-brand-50/10">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {yg.classes.map((cls) => (
                      <div key={cls.id} data-tone={cls.status === "COMPLETED" ? "success" : undefined} className={cn(deskRow, "p-4")}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="text-sm font-bold text-ink-strong">{cls.name}{cls.section ? ` - ${cls.section}` : ""}</h4>
                            <p className="text-2xs font-medium text-ink-subtle mt-0.5">
                              {cls.classTeacher?.fullName ? <bdi>{cls.classTeacher.fullName}</bdi> : ui("No class teacher")}
                            </p>
                          </div>
                          <Badge size="sm" dot variant={cls.status === "COMPLETED" ? "success" : "info"}>
                            {yearStatusLabel(cls.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="rounded-xl bg-brand-50/60 px-2 py-1.5 text-center">
                            <p className="text-sm font-bold text-primary">{cls._count.students}</p>
                            <p className="text-3xs font-semibold text-ink-subtle">{ui("Students")}</p>
                          </div>
                          <div className="rounded-xl bg-brand-50/60 px-2 py-1.5 text-center">
                            <p className="text-sm font-bold text-ink-strong">{cls._count.subjects}</p>
                            <p className="text-3xs font-semibold text-ink-subtle">{ui("Subjects")}</p>
                          </div>
                          <div className="rounded-xl bg-brand-50/60 px-2 py-1.5 text-center">
                            <p className="text-sm font-bold text-ink-strong">{cls._count.exams}</p>
                            <p className="text-3xs font-semibold text-ink-subtle">{ui("Exams")}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {cls.status === "COMPLETED" && (
                            <>
                              <Button variant="secondary" size="sm" type="button" onClick={() => loadHistory(yg.year, cls.id)}
                                className="flex-1 flex items-center justify-center gap-1.5">
                                <History className="h-3.5 w-3.5" />{" "}{ui("History")}
                              </Button>
                              <Button variant="secondary" size="sm" type="button" onClick={() => openPromotionWizard(cls.id)}
                                className="flex-1 flex items-center justify-center gap-1.5">
                                <ArrowRight className="h-3.5 w-3.5" />{" "}{ui("Promote")}
                              </Button>
                            </>
                          )}
                          {cls.status === "ACTIVE" && cls._count.students > 0 && (
                            <Button variant="secondary" size="sm" type="button" onClick={() => openPromotionWizard(cls.id)}
                              className="flex-1 flex items-center justify-center gap-1.5">
                              <ArrowRight className="h-3.5 w-3.5" />{" "}{ui("Promote")}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── History Modal ── */}
      {historyYear && historyClassId && (
        <Modal
          title={ui("Class history")}
          eyebrow={`Academic Year ${historyYear}`}
          icon={History}
          size="lg"
          onClose={() => { setHistoryYear(null); setHistoryClassId(""); setHistoryRecords([]); }}
        >

            {historyLoading ? (
              <div className="space-y-2 py-4 animate-skeleton-in">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-2.5 w-12 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                  ))}
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-3 rounded-2xl animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="h-3 w-5 rounded-full bg-border-subtle/30 skeleton-shimmer" />
                    <div className="h-3.5 w-28 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                    <div className="h-3 w-16 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                    <div className="h-3 w-10 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                    <div className="h-3 w-8 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                    <div className="h-5 w-14 rounded-full bg-border-subtle/30 skeleton-shimmer" />
                  </div>
                ))}
              </div>
            ) : historyRecords.length > 0 ? (
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-2 text-2xs font-semibold text-ink-subtle">
                  <span>#</span><span>{ui("Student")}</span><span>{ui("Admission no.")}</span><span>{ui("Roll no.")}</span><span>{gradeLabel}</span><span>{ui("Status")}</span>
                </div>
                {historyRecords.map((record, i) => (
                  <div key={record.id} className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-4 gap-y-1 items-center px-4 py-3 rounded-2xl hover:bg-brand-50/30 transition-colors">
                    <span className="text-xs font-bold text-ink-subtle tabular-nums">{i + 1}</span>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-brand-50 overflow-hidden">
                        <AvatarImage src={record.student.profileImageUrl} name={record.student.fullName} alt="" className="h-full w-full object-cover" initialsClassName="text-2xs" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink-strong truncate">{record.student.fullName}</p>
                        {record.student.class && (
                          <p className="text-2xs font-semibold text-ink-subtle">
                            {ui("Now in:")}{" "}{record.student.class.name}{record.student.class.section ? ` - ${record.student.class.section}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="hidden sm:inline text-xs font-bold text-primary tabular-nums">{record.student.admissionNo || "—"}</span>
                    <span className="hidden sm:inline text-xs font-semibold text-ink-muted tabular-nums">{record.rollNo}</span>
                    <span className="hidden sm:inline text-sm font-bold text-ink-strong tabular-nums">
                      {record.finalGrade || (record.finalPercentage ? `${Math.round(record.finalPercentage)}%` : "—")}
                    </span>
                    <Badge size="sm" dot variant={
                      record.status === "PROMOTED" ? "success" :
                      record.status === "GRADUATED" ? "info" :
                      record.status === "DROPPED" ? "danger" :
                      "default"
                    }>
                      {record.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState size="sm" icon={History} title={ui("No history records")} description={ui("No student records were saved for this class in this academic year.")} />
            )}
        </Modal>
      )}

      {/* ── Promotion Wizard ── */}
      {showPromoteModal && (
        <Modal
          title={ui(
            promoteStep === "source" ? "Select the source class" :
            promoteStep === "review" ? "Review students and results" :
            promoteStep === "target" ? "Select the target and preview" :
            "Promotion complete"
          )}
          eyebrow={ui("Student promotion")}
          icon={GraduationCap}
          size="xl"
          onClose={closePromotionWizard}
        >

            {/* Step indicators */}
            {promoteStep !== "confirm" && (
              <div className="flex items-center gap-2 mb-6">
                {(["source", "review", "target"] as const).map((step, idx) => {
                  const stepIdx = ["source", "review", "target"].indexOf(promoteStep);
                  const isActive = step === promoteStep;
                  const isDone = idx < stepIdx;
                  return (
                    <div key={step} className="flex items-center gap-2">
                      {idx > 0 && <div className={cn("h-0.5 w-8", isDone || isActive ? "bg-primary" : "bg-border-subtle")} />}
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all",
                        isActive ? "bg-primary text-white" : isDone ? "bg-status-success-surface text-status-success-text" : "bg-muted text-ink-subtle"
                      )}>
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                      </div>
                      <span className={cn("text-2xs font-semibold hidden sm:block",
                        isActive ? "text-primary" : isDone ? "text-status-success-text" : "text-ink-subtle"
                      )}>
                        {ui(step === "source" ? "Select class" : step === "review" ? "Review" : "Promote")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Step 1: Source ── */}
            {promoteStep === "source" && (
              <div className="space-y-4">
                <p className="text-sm font-normal leading-relaxed text-ink-muted">
                  {ui("Select the class whose students you want to promote. You can choose any class with students.")}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {allClasses.filter((c) => c._count.students > 0).map((cls) => (
                    <Button aria-pressed={promoteSourceId === cls.id} variant="choice" key={cls.id} type="button" onClick={() => setPromoteSourceId(cls.id)}
                      className="block text-start">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-sm font-bold text-ink-strong">{clsLabel(cls)}</h4>
                        <Badge size="sm" dot variant={cls.status === "COMPLETED" ? "success" : "info"}>
                          {yearStatusLabel(cls.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-2xs font-semibold text-ink-muted">
                        <span>{ui("{0} students", [cls._count.students])}</span>
                        <span>{ui("Year {0}", [cls.academicYear])}</span>
                        <span>{cls.classTeacher?.fullName || "No teacher"}</span>
                      </div>
                    </Button>
                  ))}
                </div>
                {allClasses.filter((c) => c._count.students > 0).length === 0 && (
                  <EmptyState size="sm" icon={Users} title={ui("No classes with students found")} description={ui("Enrol students in a class for this year, then come back to promote them.")} />
                )}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-edge/10">
                  <BrandButton variant="soft" onClick={closePromotionWizard}>{ui("Cancel")}</BrandButton>
                  <BrandButton variant="dark" disabled={!promoteSourceId} onClick={() => {
                    const src = allClasses.find((c) => c.id === promoteSourceId);
                    setPromoteStep("review");
                    loadGrades(promoteSourceId, src?.academicYear ?? new Date().getFullYear());
                  }}>
                    {ui("Next")}{" "}<ArrowRight className="w-4 h-4 ms-1 rtl:rotate-180" />
                  </BrandButton>
                </div>
              </div>
            )}

            {/* ── Step 2: Review ── */}
            {promoteStep === "review" && (
              <div className="space-y-5">
                {sourceClass && (
                  <div className="flex items-center gap-3 rounded-2xl bg-brand-50/50 border border-edge/10 px-4 py-3">
                    <GraduationCap className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-ink-strong">{clsLabel(sourceClass)}</p>
                      <p className="text-2xs font-medium text-ink-muted">{ui("Year {0}", [sourceClass.academicYear])} · {ui("{0} students", [sourceClass._count.students])}</p>
                    </div>
                  </div>
                )}

                {gradeLoading ? (
                  <div className="space-y-3 py-4 animate-skeleton-in">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-2xl animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                        <div className="h-8 w-8 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 w-32 rounded-full bg-border-subtle/50 skeleton-shimmer" />
                          <div className="h-2.5 w-20 rounded-full bg-border-subtle/30 skeleton-shimmer" />
                        </div>
                        <div className="h-5 w-14 rounded-full bg-border-subtle/40 skeleton-shimmer" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {gradeError && (
                      <Alert tone="warning" title={gradeError} live="polite">
                        {ui("Grade data not available — students are listed below without scores. You can still select who to promote.")}
                      </Alert>
                    )}

                    {gradeResults.length > 0 ? (
                      <>
                        {/* Summary stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { label: "Total Students", value: gradeResults.length, tone: "bg-brand-50 text-primary" },
                            ...(gradeError ? [] : [
                              { label: "Passed", value: gradeResults.filter((g) => g.passed).length, tone: "bg-status-success-surface text-status-success-text" },
                              { label: "Failed", value: gradeResults.filter((g) => !g.passed).length, tone: "bg-status-error-surface text-status-error-text" },
                            ]),
                            { label: "To promote", value: studentsToPromote.length, tone: "bg-primary text-primary-foreground" },
                          ].map((s) => (
                            <div key={s.label} className={cn("rounded-2xl px-4 py-3 text-center", s.tone)}>
                              <p className="text-xl font-bold tabular-nums">{s.value}</p>
                              <p className="text-2xs font-semibold opacity-70">{s.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Student list with checkboxes */}
                        <div className="overflow-x-auto rounded-2xl border border-edge/10">
                          <table className="w-full text-start">
                            <thead>
                              <tr className="border-b border-edge/10 bg-brand-50/30">
                                <th className="px-4 py-3 text-2xs font-semibold text-ink-muted">
                                  <SystemCheckbox
                                    checked={gradeResults.length > 0 && gradeResults.every((g) => studentDecisions.get(g.studentId) === "promote")}
                                    onChange={(e) => {
                                      const next = new Map(studentDecisions);
                                      gradeResults.forEach((g) => next.set(g.studentId, e.target.checked ? "promote" : "retain"));
                                      setStudentDecisions(next);
                                    }}
                                    className="accent-primary h-4 w-4 rounded cursor-pointer"
                                  />
                                </th>
                                <th className="px-4 py-3 text-2xs font-semibold text-ink-muted">#</th>
                                <th className="px-4 py-3 text-2xs font-semibold text-ink-muted">{ui("Student")}</th>
                                <th className="px-4 py-3 text-2xs font-semibold text-ink-muted">{ui("Roll no.")}</th>
                                {!gradeError && (
                                  <>
                                    <th className="px-4 py-3 text-2xs font-semibold text-ink-muted text-center">%</th>
                                    <th className="px-4 py-3 text-2xs font-semibold text-ink-muted text-center">{gradeLabel}</th>
                                    <th className="px-4 py-3 text-2xs font-semibold text-ink-muted text-center">{ui("Status")}</th>
                                  </>
                                )}
                                <th className="px-4 py-3 text-2xs font-semibold text-ink-muted text-center">{ui("Decision")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gradeResults.map((g) => {
                                const decision = studentDecisions.get(g.studentId) || "promote";
                                return (
                                  <tr key={g.studentId} className={cn("border-b border-edge/5 transition-colors",
                                    !g.passed && !gradeError ? "bg-status-error-surface/30" : decision === "retain" ? "bg-status-warning-surface/20" : "hover:bg-brand-50/20"
                                  )}>
                                    <td className="px-4 py-3">
                                      <SystemCheckbox  checked={decision === "promote"}
                                        onChange={(e) => {
                                          const next = new Map(studentDecisions);
                                          next.set(g.studentId, e.target.checked ? "promote" : "retain");
                                          setStudentDecisions(next);
                                        }}
                                        className="accent-primary h-4 w-4 rounded cursor-pointer"
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-xs font-bold text-ink-subtle">{g.rank}</td>
                                    <td className="px-4 py-3 text-sm font-bold text-ink-strong truncate max-w-[200px]">{g.studentName}</td>
                                    <td className="px-4 py-3 text-xs font-semibold text-ink-muted">{g.rollNo || "—"}</td>
                                    {!gradeError && (
                                      <>
                                        <td className="px-4 py-3 text-center">
                                          <span className={cn("text-sm font-bold",
                                            g.overallPercentage >= 80 ? "text-status-success-text" : g.overallPercentage >= 50 ? "text-status-warning-text" : "text-status-error-text"
                                          )}>{Math.round(g.overallPercentage)}%</span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-ink-strong">{g.overallGrade}</td>
                                        <td className="px-4 py-3 text-center">
                                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-semibold",
                                            g.passed ? "bg-status-success-surface text-status-success-text" : "bg-status-error-surface text-status-error-text"
                                          )}>
                                            {g.passed ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                            {ui(g.passed ? "Pass" : "Fail")}
                                          </span>
                                        </td>
                                      </>
                                    )}
                                    <td className="px-4 py-3 text-center">
                                      <SystemSelect value={decision}
                                        onChange={(e) => {
                                          const next = new Map(studentDecisions);
                                          next.set(g.studentId, e.target.value as StudentDecision);
                                          setStudentDecisions(next);
                                        }}
                                        className={cn("px-2 py-1",
                                          decision === "promote" ? "" : ""
                                        )}>
                                        <option value="promote">{ui("Promote")}</option>
                                        <option value="retain">{ui("Retain")}</option>
                                      </SystemSelect>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <EmptyState size="sm" icon={Users} title={ui("No students found in this class")} description={ui("Go back and choose a different source class.")} />
                    )}
                  </>
                )}

                <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-edge/10">
                  <BrandButton variant="soft" onClick={() => setPromoteStep("source")}>
                    {ui("Back")}
                  </BrandButton>
                  <BrandButton variant="dark" disabled={studentsToPromote.length === 0} onClick={() => setPromoteStep("target")}>
                    {ui("Next: choose the target")}{" "}<ArrowRight className="w-4 h-4 ms-1 rtl:rotate-180" />
                  </BrandButton>
                </div>
              </div>
            )}

            {/* ── Step 3: Target & Preview ── */}
            {promoteStep === "target" && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: target selection */}
                  <div>
                    <label className="block mb-4">
                      <span className="mb-1.5 block ps-2 text-2xs font-semibold text-ink-muted">{ui("Target class")}</span>
                      <SystemSelect value={promoteTargetId} onChange={(e) => setPromoteTargetId(e.target.value)}
                        className="h-14 w-full px-4">
                        <option value="">{ui("Select target class")}</option>
                        {activeClasses
                          .filter((c) => c.id !== promoteSourceId && c.academicYear === (sourceClass?.academicYear ?? 0) + 1)
                          .map((c) => (
                            <option key={c.id} value={c.id}>{clsLabel(c)} ({c.academicYear}) — {ui("{0} existing", [c._count.students])}</option>
                          ))}
                      </SystemSelect>
                    </label>

                    {!activeClasses.some((c) => c.id !== promoteSourceId && c.academicYear === (sourceClass?.academicYear ?? 0) + 1) ? (
                      <div className="rounded-2xl border border-status-warning-border/40 bg-status-warning-surface p-4 mb-3">
                        <p className="text-xs font-bold text-status-warning-text">
                          <AlertTriangle className="h-3.5 w-3.5 inline me-1" />
                          {sourceClass ? ui("No class exists for {0} yet.", [sourceClass.academicYear + 1]) : ui("No class exists for next year yet.")}
                        </p>
                        <p className="text-2xs font-semibold text-status-warning-text/70 mt-1">
                          {ui("Create the destination class in the Academic Plan first, then promote into it.")}
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-primary/15 bg-brand-50/60 p-4 mb-3">
                      <p className="text-2xs font-bold text-primary">
                        <Lock className="h-3.5 w-3.5 inline me-1" />
                        {ui("Class changes are only allowed via promotion")}
                      </p>
                      <p className="text-2xs font-semibold text-ink-muted mt-0.5">
                        {ui("Moving a student mid-year is possible from the student profile, but year-end promotion records history and final results.")}
                      </p>
                    </div>

                    {/* Summary */}
                    <div className="rounded-2xl bg-brand-50/50 border border-edge/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-muted">{ui("Students to promote")}</span>
                        <span className="text-sm font-bold text-status-success-text">{studentsToPromote.length}</span>
                      </div>
                      {studentsToRetain.length > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink-muted">{ui("Students retained")}</span>
                          <span className="text-sm font-bold text-status-warning-text">{studentsToRetain.length}</span>
                        </div>
                      )}
                      {sourceClass && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink-muted">{ui("From")}</span>
                          <span className="text-sm font-bold text-ink-strong">{clsLabel(sourceClass)} ({sourceClass.academicYear})</span>
                        </div>
                      )}
                      {targetClass && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink-muted">{ui("To")}</span>
                          <span className="text-sm font-bold text-primary">{clsLabel(targetClass)} ({targetClass.academicYear})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: roll number preview */}
                  <div>
                    <p className="mb-1.5 ps-2 text-2xs font-semibold text-ink-muted">{ui("New roll number preview")}</p>
                    {promoteTargetId && targetClass ? (
                      <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-edge/10 custom-scrollbar">
                        <table className="w-full text-start">
                          <thead>
                            <tr className="border-b border-edge/10 bg-brand-50/30 sticky top-0">
                              <th className="px-3 py-2 text-2xs font-semibold text-ink-muted">{ui("Student")}</th>
                              <th className="px-3 py-2 text-2xs font-semibold text-ink-muted">{ui("Old roll no.")}</th>
                              <th className="px-3 py-2 text-2xs font-semibold text-ink-muted text-center">→</th>
                              <th className="px-3 py-2 text-2xs font-semibold text-primary">{ui("New roll no.")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentsToPromote.map((g, idx) => (
                              <tr key={g.studentId} className="border-b border-edge/5 hover:bg-brand-50/20">
                                <td className="px-3 py-2 text-xs font-bold text-ink-strong truncate max-w-[160px]">{g.studentName}</td>
                                <td className="px-3 py-2 text-xs font-semibold text-ink-muted">{g.rollNo || "—"}</td>
                                <td className="px-3 py-2 text-center"><ArrowRight className="h-3 w-3 text-primary mx-auto" /></td>
                                <td className="px-3 py-2 text-xs font-bold text-primary">
                                  {generateRollNoPreview(targetClass.name, targetClass.section, idx, targetClass._count.students)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[200px] rounded-2xl border border-dashed border-edge/20">
                        <p className="text-xs font-bold text-ink-subtle">{ui("Select a target class to preview roll numbers")}</p>
                      </div>
                    )}
                  </div>
                </div>

                {studentsToRetain.length > 0 && (
                  <div className="rounded-2xl border border-status-warning-border/40 bg-status-warning-surface p-4">
                    <p className="text-xs font-bold text-status-warning-text mb-2">
                      <AlertTriangle className="h-3.5 w-3.5 inline me-1" />
                      {studentsToRetain.length === 1 ? ui("1 student will be retained in {0}", [sourceClass ? clsLabel(sourceClass) : ui("the current class")]) : ui("{0} students will be retained in {1}", [studentsToRetain.length, sourceClass ? clsLabel(sourceClass) : ui("the current class")])}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {studentsToRetain.map((g) => (
                        <span key={g.studentId} className="rounded-full bg-status-warning-surface px-2.5 py-0.5 text-2xs font-bold text-status-warning-text">{g.studentName}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-edge/10">
                  <BrandButton variant="soft" onClick={() => setPromoteStep(gradeResults.length > 0 ? "review" : "source")}>
                    {ui("Back")}
                  </BrandButton>
                  <BrandButton variant="dark" loading={promoting} disabled={promoting || !promoteTargetId || studentsToPromote.length === 0} onClick={handlePromote}>
                    {`Promote ${studentsToPromote.length} Students`}
                  </BrandButton>
                </div>
              </div>
            )}

            {/* ── Step 4: Confirmation ── */}
            {promoteStep === "confirm" && promotionResults && (
              <div className="space-y-6 text-center">
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="h-20 w-20 rounded-full bg-status-success-surface flex items-center justify-center">
                    <CheckCircle2 className="h-10 w-10 text-status-success-text" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-ink-strong">{ui("Promotion complete")}</h3>
                    <p className="text-sm font-semibold text-ink-muted mt-2">
                      {promotionResults.promoted === 1 ? ui("1 student promoted") : ui("{0} students promoted", [promotionResults.promoted])}
                      {targetClass ? ` to ${clsLabel(targetClass)}` : ""}
                      {promotionResults.retained > 0 ? `, ${promotionResults.retained} retained` : ""}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <div className="rounded-2xl bg-status-success-surface p-4 text-center">
                    <p className="text-3xl font-extrabold text-status-success-text">{promotionResults.promoted}</p>
                    <p className="text-2xs font-semibold text-status-success-text/70 mt-1">{ui("Promoted")}</p>
                  </div>
                  <div className="rounded-2xl bg-status-warning-surface p-4 text-center">
                    <p className="text-3xl font-extrabold text-status-warning-text">{promotionResults.retained}</p>
                    <p className="text-2xs font-semibold text-status-warning-text/70 mt-1">{ui("Retained")}</p>
                  </div>
                </div>

                <p className="text-xs font-semibold text-ink-subtle">
                  {ui("New roll numbers have been assigned automatically. Student history records have been saved.")}
                </p>

                <div className="flex justify-center gap-3 pt-4 border-t border-edge/10">
                  <BrandButton variant="soft" onClick={closePromotionWizard}>{ui("Done")}</BrandButton>
                  <BrandButton variant="dark" icon={<RefreshCw className="w-4 h-4" />} onClick={() => {
                    setPromoteStep("source");
                    setPromoteSourceId("");
                    setPromoteTargetId("");
                    setGradeResults([]);
                    setStudentDecisions(new Map());
                    setPromotionResults(null);
                  }}>
                    {ui("Promote another class")}
                  </BrandButton>
                </div>
              </div>
            )}
        </Modal>
      )}
    </div>
  );
}
