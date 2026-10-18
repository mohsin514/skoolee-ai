"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, Calendar, CheckCircle2, ChevronDown, ChevronRight,
  GraduationCap, History, Lock, RefreshCw, Users, X,
} from "lucide-react";
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
    } catch { toast.error("Failed to load academic year data"); }
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
    } catch (err: any) { toast.error(err.message); }
    finally { setClosing(false); }
  }, [campusId, load]);

  // SKO-404: promotion is reviewed as one versioned year-end plan, so every
  // entry point leads there; the per-class wizard below no longer opens (its
  // endpoint is retired) and is kept only until its contract baseline is reviewed.
  const openPromotionWizard = (_sourceClassId?: string) => {
    const plan = document.getElementById("year-end-rollover");
    if (plan) { plan.scrollIntoView({ behavior: "smooth", block: "start" }); plan.focus(); return; }
    toast.info("Promotion is reviewed as a year-end plan under Promote Students.");
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
    if (toPromote.length === 0) { toast.error("No students selected for promotion"); return; }
    if (!promoteTargetId) { toast.error("Select a target class"); return; }
    const srcClass = yearGroups.flatMap((yg) => yg.classes).find((c) => c.id === promoteSourceId);
    if (!srcClass) { toast.error("Source class missing"); return; }

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
    } catch { toast.error("Failed to load history"); }
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
        title={`Close academic year ${confirmCloseYear ?? ""}?`}
        description="You can still view past year data after closing."
        detail={<ul className="list-disc space-y-1 ps-5 text-sm text-ink-muted"><li>Save final grades to student history</li><li>Mark all classes as COMPLETED</li><li>Generate admission numbers for students without one</li></ul>}
        confirmLabel="Close Year"
        busy={closing}
        onCancel={() => setConfirmCloseYear(null)}
        onConfirm={() => { const y = confirmCloseYear; setConfirmCloseYear(null); if (y !== null) void handleCloseYear(y); }}
      />
      <div className="flex flex-wrap gap-3">
        <BrandButton variant="dark" icon={<ArrowRight className="w-4 h-4 rtl:rotate-180" />} onClick={() => openPromotionWizard()}>
          Promote Students
        </BrandButton>
      </div>

      {yearGroups.length === 0 ? (
        <EmptyState icon={Calendar} title="No Academic Years" description="Create classes with an academic year to get started." />
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
                    <h3 className="text-lg font-bold text-ink-strong">Academic Year {yg.year}</h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      <Badge size="sm" dot variant={yg.status === "COMPLETED" ? "success" : "info"}>
                        {yearStatusLabel(yg.status)}
                      </Badge>
                      <span className="text-2xs font-semibold text-ink-muted">{yg.classes.length} classes</span>
                      <span className="text-2xs font-semibold text-ink-muted">{yg.classes.reduce((s, c) => s + c._count.students, 0)} students</span>
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
                      Close Year
                    </BrandButton>
                  )}
                  {expandedYear === yg.year ? <ChevronDown className="h-5 w-5 text-ink-subtle" /> : <ChevronRight className="h-5 w-5 text-ink-subtle" />}
                </div>
              </div>

              {expandedYear === yg.year && (
                <div className="border-t border-edge/10 p-5 bg-brand-50/10">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {yg.classes.map((cls) => (
                      <div key={cls.id} className="sk-panel p-4 transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="text-sm font-bold text-ink-strong">{cls.name}{cls.section ? ` - ${cls.section}` : ""}</h4>
                            <p className="text-2xs font-medium text-ink-subtle mt-0.5">
                              {cls.classTeacher?.fullName || "No class teacher"}
                            </p>
                          </div>
                          <Badge size="sm" dot variant={cls.status === "COMPLETED" ? "success" : "info"}>
                            {yearStatusLabel(cls.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="rounded-xl bg-brand-50/60 px-2 py-1.5 text-center">
                            <p className="text-sm font-bold text-primary">{cls._count.students}</p>
                            <p className="text-3xs font-semibold uppercase text-ink-subtle">Students</p>
                          </div>
                          <div className="rounded-xl bg-brand-50/60 px-2 py-1.5 text-center">
                            <p className="text-sm font-bold text-ink-strong">{cls._count.subjects}</p>
                            <p className="text-3xs font-semibold uppercase text-ink-subtle">Subjects</p>
                          </div>
                          <div className="rounded-xl bg-brand-50/60 px-2 py-1.5 text-center">
                            <p className="text-sm font-bold text-ink-strong">{cls._count.exams}</p>
                            <p className="text-3xs font-semibold uppercase text-ink-subtle">Exams</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {cls.status === "COMPLETED" && (
                            <>
                              <Button variant="secondary" size="sm" type="button" onClick={() => loadHistory(yg.year, cls.id)}
                                className="flex-1 flex items-center justify-center gap-1.5">
                                <History className="h-3.5 w-3.5" /> History
                              </Button>
                              <Button variant="secondary" size="sm" type="button" onClick={() => openPromotionWizard(cls.id)}
                                className="flex-1 flex items-center justify-center gap-1.5">
                                <ArrowRight className="h-3.5 w-3.5" /> Promote
                              </Button>
                            </>
                          )}
                          {cls.status === "ACTIVE" && cls._count.students > 0 && (
                            <Button variant="secondary" size="sm" type="button" onClick={() => openPromotionWizard(cls.id)}
                              className="flex-1 flex items-center justify-center gap-1.5">
                              <ArrowRight className="h-3.5 w-3.5" /> Promote
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
          title="Class History"
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
                <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
                  <span>#</span><span>Student</span><span>Admission No</span><span>Roll No</span><span>Grade</span><span>Status</span>
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
                            Now in: {record.student.class.name}{record.student.class.section ? ` - ${record.student.class.section}` : ""}
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
              <EmptyState size="sm" icon={History} title="No history records" description="No student records were saved for this class in this academic year." />
            )}
        </Modal>
      )}

      {/* ── Promotion Wizard ── */}
      {showPromoteModal && (
        <Modal
          title={
            promoteStep === "source" ? "Select Source Class" :
            promoteStep === "review" ? "Review Students & Results" :
            promoteStep === "target" ? "Select Target & Preview" :
            "Promotion Complete"
          }
          eyebrow="Student Promotion"
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
                      <span className={cn("text-2xs font-semibold uppercase tracking-wider hidden sm:block",
                        isActive ? "text-primary" : isDone ? "text-status-success-text" : "text-ink-subtle"
                      )}>
                        {step === "source" ? "Select Class" : step === "review" ? "Review" : "Promote"}
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
                  Select the class whose students you want to promote. You can choose any class with students.
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
                        <span>{cls._count.students} students</span>
                        <span>Year {cls.academicYear}</span>
                        <span>{cls.classTeacher?.fullName || "No teacher"}</span>
                      </div>
                    </Button>
                  ))}
                </div>
                {allClasses.filter((c) => c._count.students > 0).length === 0 && (
                  <EmptyState size="sm" icon={Users} title="No classes with students found" description="Enrol students in a class for this year, then come back to promote them." />
                )}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-edge/10">
                  <BrandButton variant="soft" onClick={closePromotionWizard}>Cancel</BrandButton>
                  <BrandButton variant="dark" disabled={!promoteSourceId} onClick={() => {
                    const src = allClasses.find((c) => c.id === promoteSourceId);
                    setPromoteStep("review");
                    loadGrades(promoteSourceId, src?.academicYear ?? new Date().getFullYear());
                  }}>
                    Next <ArrowRight className="w-4 h-4 ms-1 rtl:rotate-180" />
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
                      <p className="text-2xs font-medium text-ink-muted">Year {sourceClass.academicYear} · {sourceClass._count.students} students</p>
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
                        Grade data not available — students are listed below without scores. You can still select who to promote.
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
                            { label: "To Promote", value: studentsToPromote.length, tone: "bg-ink-strong text-white" },
                          ].map((s) => (
                            <div key={s.label} className={cn("rounded-2xl px-4 py-3 text-center", s.tone)}>
                              <p className="text-xl font-bold tabular-nums">{s.value}</p>
                              <p className="text-2xs font-semibold uppercase tracking-wider opacity-70">{s.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Student list with checkboxes */}
                        <div className="overflow-x-auto rounded-2xl border border-edge/10">
                          <table className="w-full text-start">
                            <thead>
                              <tr className="border-b border-edge/10 bg-brand-50/30">
                                <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
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
                                <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted">#</th>
                                <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted">Student</th>
                                <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted">Roll No</th>
                                {!gradeError && (
                                  <>
                                    <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted text-center">%</th>
                                    <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted text-center">Grade</th>
                                    <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted text-center">Status</th>
                                  </>
                                )}
                                <th className="px-4 py-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted text-center">Decision</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gradeResults.map((g) => {
                                const decision = studentDecisions.get(g.studentId) || "promote";
                                return (
                                  <tr key={g.studentId} className={cn("border-b border-edge/5 transition-colors",
                                    !g.passed && !gradeError ? "bg-rose-50/30" : decision === "retain" ? "bg-amber-50/20" : "hover:bg-brand-50/20"
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
                                            g.overallPercentage >= 80 ? "text-emerald-600" : g.overallPercentage >= 50 ? "text-amber-600" : "text-rose-500"
                                          )}>{Math.round(g.overallPercentage)}%</span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-ink-strong">{g.overallGrade}</td>
                                        <td className="px-4 py-3 text-center">
                                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wider",
                                            g.passed ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                                          )}>
                                            {g.passed ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                            {g.passed ? "Pass" : "Fail"}
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
                                        <option value="promote">Promote</option>
                                        <option value="retain">Retain</option>
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
                      <EmptyState size="sm" icon={Users} title="No students found in this class" description="Go back and choose a different source class." />
                    )}
                  </>
                )}

                <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-edge/10">
                  <BrandButton variant="soft" onClick={() => setPromoteStep("source")}>
                    Back
                  </BrandButton>
                  <BrandButton variant="dark" disabled={studentsToPromote.length === 0} onClick={() => setPromoteStep("target")}>
                    Next — Select Target <ArrowRight className="w-4 h-4 ms-1 rtl:rotate-180" />
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
                      <span className="mb-1.5 block ps-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">Target Class</span>
                      <SystemSelect value={promoteTargetId} onChange={(e) => setPromoteTargetId(e.target.value)}
                        className="h-14 w-full px-4">
                        <option value="">Select target class</option>
                        {activeClasses
                          .filter((c) => c.id !== promoteSourceId && c.academicYear === (sourceClass?.academicYear ?? 0) + 1)
                          .map((c) => (
                            <option key={c.id} value={c.id}>{clsLabel(c)} ({c.academicYear}) — {c._count.students} existing</option>
                          ))}
                      </SystemSelect>
                    </label>

                    {!activeClasses.some((c) => c.id !== promoteSourceId && c.academicYear === (sourceClass?.academicYear ?? 0) + 1) ? (
                      <div className="rounded-2xl border border-amber-200/40 bg-amber-50 p-4 mb-3">
                        <p className="text-xs font-bold text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 inline me-1" />
                          No class exists for {sourceClass ? sourceClass.academicYear + 1 : "next year"} yet.
                        </p>
                        <p className="text-2xs font-semibold text-amber-700/70 mt-1">
                          Create the destination class in the Academic Plan first, then promote into it.
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-primary/15 bg-brand-50/60 p-4 mb-3">
                      <p className="text-2xs font-bold text-primary">
                        <Lock className="h-3.5 w-3.5 inline me-1" />
                        Class changes are only allowed via promotion
                      </p>
                      <p className="text-2xs font-semibold text-ink-muted mt-0.5">
                        Moving a student mid-year is possible from the student profile, but year-end promotion records history and final results.
                      </p>
                    </div>

                    {/* Summary */}
                    <div className="rounded-2xl bg-brand-50/50 border border-edge/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-muted">Students to promote</span>
                        <span className="text-sm font-bold text-emerald-600">{studentsToPromote.length}</span>
                      </div>
                      {studentsToRetain.length > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink-muted">Students retained</span>
                          <span className="text-sm font-bold text-amber-600">{studentsToRetain.length}</span>
                        </div>
                      )}
                      {sourceClass && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink-muted">From</span>
                          <span className="text-sm font-bold text-ink-strong">{clsLabel(sourceClass)} ({sourceClass.academicYear})</span>
                        </div>
                      )}
                      {targetClass && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink-muted">To</span>
                          <span className="text-sm font-bold text-primary">{clsLabel(targetClass)} ({targetClass.academicYear})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: roll number preview */}
                  <div>
                    <p className="mb-1.5 ps-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">New Roll Number Preview</p>
                    {promoteTargetId && targetClass ? (
                      <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-edge/10 custom-scrollbar">
                        <table className="w-full text-start">
                          <thead>
                            <tr className="border-b border-edge/10 bg-brand-50/30 sticky top-0">
                              <th className="px-3 py-2 text-2xs font-semibold uppercase text-ink-muted">Student</th>
                              <th className="px-3 py-2 text-2xs font-semibold uppercase text-ink-muted">Old Roll</th>
                              <th className="px-3 py-2 text-2xs font-semibold uppercase text-ink-muted text-center">→</th>
                              <th className="px-3 py-2 text-2xs font-semibold uppercase text-primary">New Roll</th>
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
                        <p className="text-xs font-bold text-ink-subtle">Select a target class to preview roll numbers</p>
                      </div>
                    )}
                  </div>
                </div>

                {studentsToRetain.length > 0 && (
                  <div className="rounded-2xl border border-amber-200/40 bg-amber-50 p-4">
                    <p className="text-xs font-bold text-amber-700 mb-2">
                      <AlertTriangle className="h-3.5 w-3.5 inline me-1" />
                      {studentsToRetain.length} student{studentsToRetain.length !== 1 ? "s" : ""} will be retained in {sourceClass ? clsLabel(sourceClass) : "current class"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {studentsToRetain.map((g) => (
                        <span key={g.studentId} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-2xs font-bold text-amber-700">{g.studentName}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-edge/10">
                  <BrandButton variant="soft" onClick={() => setPromoteStep(gradeResults.length > 0 ? "review" : "source")}>
                    Back
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
                  <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-ink-strong">Promotion Complete</h3>
                    <p className="text-sm font-semibold text-ink-muted mt-2">
                      {promotionResults.promoted} student{promotionResults.promoted !== 1 ? "s" : ""} promoted
                      {targetClass ? ` to ${clsLabel(targetClass)}` : ""}
                      {promotionResults.retained > 0 ? `, ${promotionResults.retained} retained` : ""}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <div className="rounded-2xl bg-emerald-50 p-4 text-center">
                    <p className="text-3xl font-extrabold text-emerald-600">{promotionResults.promoted}</p>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-emerald-600/70 mt-1">Promoted</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4 text-center">
                    <p className="text-3xl font-extrabold text-amber-600">{promotionResults.retained}</p>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-amber-600/70 mt-1">Retained</p>
                  </div>
                </div>

                <p className="text-xs font-semibold text-ink-subtle">
                  New roll numbers have been assigned automatically. Student history records have been saved.
                </p>

                <div className="flex justify-center gap-3 pt-4 border-t border-edge/10">
                  <BrandButton variant="soft" onClick={closePromotionWizard}>Done</BrandButton>
                  <BrandButton variant="dark" icon={<RefreshCw className="w-4 h-4" />} onClick={() => {
                    setPromoteStep("source");
                    setPromoteSourceId("");
                    setPromoteTargetId("");
                    setGradeResults([]);
                    setStudentDecisions(new Map());
                    setPromotionResults(null);
                  }}>
                    Promote Another Class
                  </BrandButton>
                </div>
              </div>
            )}
        </Modal>
      )}
    </div>
  );
}
