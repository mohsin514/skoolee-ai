"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, Calendar, CheckCircle2, ChevronDown, ChevronRight,
  GraduationCap, History, Loader2, Lock, RefreshCw, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";

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

  const handleCloseYear = useCallback(async (year: number) => {
    if (!confirm(`Close academic year ${year}? This will:\n• Save final grades to student history\n• Mark all classes as COMPLETED\n• Generate admission numbers for students without one\n\nYou can still view past year data after closing.`)) return;
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

  const openPromotionWizard = (sourceClassId?: string) => {
    setShowPromoteModal(true);
    setPromoteStep("source");
    setPromoteSourceId(sourceClassId || "");
    setPromoteTargetId("");
    setGradeResults([]);
    setGradeError("");
    setStudentDecisions(new Map());
    setPromotionResults(null);
  };

  const closePromotionWizard = () => {
    setShowPromoteModal(false);
    setPromoteStep("source");
    setPromoteSourceId("");
    setPromoteTargetId("");
    setGradeResults([]);
    setGradeError("");
    setStudentDecisions(new Map());
    setPromotionResults(null);
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

    setPromoting(true);
    try {
      const promotions = toPromote.map((g) => ({
        studentId: g.studentId,
        targetClassId: promoteTargetId,
      }));
      const res = await fetch("/api/academic-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote", promotions, campusId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Promotion failed");
      const retained = gradeResults.length - toPromote.length;
      setPromotionResults({ promoted: json.promoted || toPromote.length, retained });
      setPromoteStep("confirm");
      toast.success(json.message);
      await load();
    } catch (err: any) { toast.error(err.message); }
    finally { setPromoting(false); }
  }, [gradeResults, studentDecisions, promoteTargetId, campusId, load]);

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
          <div key={i} className="rounded-[28px] border border-[#cfc2d6]/10 bg-white shadow-lg overflow-hidden animate-skeleton-in" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-[#e8e0ec]/50 skeleton-shimmer" />
                <div className="space-y-2">
                  <div className="h-5 w-40 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-16 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                    <div className="h-3 w-20 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                  </div>
                </div>
              </div>
              <div className="h-5 w-5 rounded bg-[#e8e0ec]/30 skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <BrandButton variant="dark" icon={<ArrowRight className="w-4 h-4" />} onClick={() => openPromotionWizard()}>
          Promote Students
        </BrandButton>
      </div>

      {yearGroups.length === 0 ? (
        <EmptyState icon={Calendar} title="No Academic Years" description="Create classes with an academic year to get started." />
      ) : (
        <div className="space-y-4">
          {yearGroups.map((yg, i) => (
            <div key={yg.year} className="sk-rise rounded-[28px] border border-[#cfc2d6]/25 bg-white shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] overflow-hidden" style={{ animationDelay: `${i * 100}ms` }}>
              <div
                role="button" tabIndex={0}
                onClick={() => setExpandedYear(expandedYear === yg.year ? null : yg.year)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedYear(expandedYear === yg.year ? null : yg.year); } }}
                className="w-full flex items-center justify-between p-5 text-left cursor-pointer hover:bg-[#fbf0fe]/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${yg.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600" : "bg-[#fbf0fe] text-[#8127cf]"}`}>
                    {yg.status === "COMPLETED" ? <CheckCircle2 className="h-6 w-6" /> : <Calendar className="h-6 w-6" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#1d1b20]">Academic Year {yg.year}</h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${yg.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600" : "bg-[#fbf0fe] text-[#8127cf]"}`}>
                        {yg.status}
                      </span>
                      <span className="text-[11px] font-semibold text-[#4d4354]/50">{yg.classes.length} classes</span>
                      <span className="text-[11px] font-semibold text-[#4d4354]/50">{yg.classes.reduce((s, c) => s + c._count.students, 0)} students</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {yg.status === "ACTIVE" && (
                    <BrandButton
                      variant="soft"
                      icon={closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleCloseYear(yg.year); }}
                      disabled={closing}
                    >
                      Close Year
                    </BrandButton>
                  )}
                  {expandedYear === yg.year ? <ChevronDown className="h-5 w-5 text-[#4d4354]/30" /> : <ChevronRight className="h-5 w-5 text-[#4d4354]/30" />}
                </div>
              </div>

              {expandedYear === yg.year && (
                <div className="border-t border-[#cfc2d6]/10 p-5 bg-[#fbf0fe]/10">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {yg.classes.map((cls) => (
                      <div key={cls.id} className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="text-sm font-bold text-[#1d1b20]">{cls.name}{cls.section ? ` - ${cls.section}` : ""}</h4>
                            <p className="text-[10px] font-semibold text-[#4d4354]/40 mt-0.5">
                              {cls.classTeacher?.fullName || "No class teacher"}
                            </p>
                          </div>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600" : "bg-[#fbf0fe] text-[#8127cf]"}`}>
                            {cls.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="rounded-xl bg-[#fbf0fe]/60 px-2 py-1.5 text-center">
                            <p className="text-sm font-bold text-[#8127cf]">{cls._count.students}</p>
                            <p className="text-[8px] font-semibold uppercase text-[#4d4354]/35">Students</p>
                          </div>
                          <div className="rounded-xl bg-[#fbf0fe]/60 px-2 py-1.5 text-center">
                            <p className="text-sm font-bold text-[#1d1b20]">{cls._count.subjects}</p>
                            <p className="text-[8px] font-semibold uppercase text-[#4d4354]/35">Subjects</p>
                          </div>
                          <div className="rounded-xl bg-[#fbf0fe]/60 px-2 py-1.5 text-center">
                            <p className="text-sm font-bold text-[#1d1b20]">{cls._count.exams}</p>
                            <p className="text-[8px] font-semibold uppercase text-[#4d4354]/35">Exams</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {cls.status === "COMPLETED" && (
                            <>
                              <button type="button" onClick={() => loadHistory(yg.year, cls.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] py-2 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer">
                                <History className="h-3.5 w-3.5" /> History
                              </button>
                              <button type="button" onClick={() => openPromotionWizard(cls.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600 transition-all cursor-pointer">
                                <ArrowRight className="h-3.5 w-3.5" /> Promote
                              </button>
                            </>
                          )}
                          {cls.status === "ACTIVE" && cls._count.students > 0 && (
                            <button type="button" onClick={() => openPromotionWizard(cls.id)}
                              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] py-2 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer">
                              <ArrowRight className="h-3.5 w-3.5" /> Promote
                            </button>
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
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5 animate-backdrop-enter">
          <div className="bg-white w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/15 custom-scrollbar animate-modal-enter">
            <div className="flex justify-between items-start gap-5 mb-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">Academic Year {historyYear}</p>
                <h3 className="mt-1 text-2xl font-bold text-[#1d1b20] tracking-tight">Class History</h3>
              </div>
              <button type="button" onClick={() => { setHistoryYear(null); setHistoryClassId(""); setHistoryRecords([]); }}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500 cursor-pointer transition-all duration-200 active:scale-95">
                <X className="w-5 h-5" />
              </button>
            </div>

            {historyLoading ? (
              <div className="space-y-2 py-4 animate-skeleton-in">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-2.5 w-12 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                  ))}
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-3 rounded-2xl animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="h-3 w-5 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                    <div className="h-3.5 w-28 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                    <div className="h-3 w-16 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                    <div className="h-3 w-10 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                    <div className="h-3 w-8 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                    <div className="h-5 w-14 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                  </div>
                ))}
              </div>
            ) : historyRecords.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">
                  <span>#</span><span>Student</span><span>Admission No</span><span>Roll No</span><span>Grade</span><span>Status</span>
                </div>
                {historyRecords.map((record, i) => (
                  <div key={record.id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-3 rounded-2xl hover:bg-[#fbf0fe]/30 transition-colors">
                    <span className="text-xs font-bold text-[#4d4354]/30">{i + 1}</span>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-[#fbf0fe] overflow-hidden">
                        <img src={record.student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(record.student.fullName)}`} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1d1b20] truncate">{record.student.fullName}</p>
                        {record.student.class && (
                          <p className="text-[10px] font-semibold text-[#4d4354]/40">
                            Now in: {record.student.class.name}{record.student.class.section ? ` - ${record.student.class.section}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#8127cf]">{record.student.admissionNo || "—"}</span>
                    <span className="text-xs font-semibold text-[#4d4354]/60">{record.rollNo}</span>
                    <span className="text-sm font-bold text-[#1d1b20]">
                      {record.finalGrade || (record.finalPercentage ? `${Math.round(record.finalPercentage)}%` : "—")}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      record.status === "PROMOTED" ? "bg-emerald-50 text-emerald-600" :
                      record.status === "GRADUATED" ? "bg-blue-50 text-blue-600" :
                      record.status === "DROPPED" ? "bg-rose-50 text-rose-600" :
                      "bg-[#fbf0fe] text-[#8127cf]"
                    }`}>
                      {record.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm font-semibold text-[#4d4354]/50 py-12">No history records for this class.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Promotion Wizard ── */}
      {showPromoteModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-4 animate-backdrop-enter">
          <div className="bg-white w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/15 custom-scrollbar animate-modal-enter">
            <div className="flex justify-between items-start gap-5 mb-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">Student Promotion</p>
                <h3 className="mt-1 text-2xl font-bold text-[#1d1b20] tracking-tight">
                  {promoteStep === "source" ? "Select Source Class" :
                   promoteStep === "review" ? "Review Students & Results" :
                   promoteStep === "target" ? "Select Target & Preview" :
                   "Promotion Complete"}
                </h3>
              </div>
              <button type="button" onClick={closePromotionWizard}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500 cursor-pointer transition-all duration-200 active:scale-95">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step indicators */}
            {promoteStep !== "confirm" && (
              <div className="flex items-center gap-2 mb-6">
                {(["source", "review", "target"] as const).map((step, idx) => {
                  const stepIdx = ["source", "review", "target"].indexOf(promoteStep);
                  const isActive = step === promoteStep;
                  const isDone = idx < stepIdx;
                  return (
                    <div key={step} className="flex items-center gap-2">
                      {idx > 0 && <div className={cn("h-0.5 w-8", isDone || isActive ? "bg-[#8127cf]" : "bg-[#e8e0ec]")} />}
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition-all",
                        isActive ? "bg-[#8127cf] text-white" : isDone ? "bg-emerald-100 text-emerald-600" : "bg-[#f3f4f9] text-[#4d4354]/30"
                      )}>
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                      </div>
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider hidden sm:block",
                        isActive ? "text-[#8127cf]" : isDone ? "text-emerald-600" : "text-[#4d4354]/30"
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
                <p className="text-xs font-semibold text-[#4d4354]/50">
                  Select the class whose students you want to promote. You can choose any class with students.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {allClasses.filter((c) => c._count.students > 0).map((cls) => (
                    <button key={cls.id} type="button" onClick={() => setPromoteSourceId(cls.id)}
                      className={cn("text-left rounded-2xl border p-4 transition-all cursor-pointer",
                        promoteSourceId === cls.id ? "border-[#8127cf] bg-[#fbf0fe]/50 ring-2 ring-[#8127cf]/20 shadow-md" : "border-[#cfc2d6]/10 bg-white hover:shadow-md"
                      )}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-sm font-bold text-[#1d1b20]">{clsLabel(cls)}</h4>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600" : "bg-[#fbf0fe] text-[#8127cf]"}`}>
                          {cls.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-semibold text-[#4d4354]/50">
                        <span>{cls._count.students} students</span>
                        <span>Year {cls.academicYear}</span>
                        <span>{cls.classTeacher?.fullName || "No teacher"}</span>
                      </div>
                    </button>
                  ))}
                </div>
                {allClasses.filter((c) => c._count.students > 0).length === 0 && (
                  <div className="py-12 text-center">
                    <Users className="mx-auto h-10 w-10 text-[#4d4354]/20 mb-3" />
                    <p className="text-sm font-bold text-[#4d4354]/40">No classes with students found</p>
                  </div>
                )}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#cfc2d6]/10">
                  <BrandButton variant="soft" onClick={closePromotionWizard}>Cancel</BrandButton>
                  <BrandButton variant="dark" disabled={!promoteSourceId} onClick={() => {
                    const src = allClasses.find((c) => c.id === promoteSourceId);
                    setPromoteStep("review");
                    loadGrades(promoteSourceId, src?.academicYear ?? new Date().getFullYear());
                  }}>
                    Next <ArrowRight className="w-4 h-4 ml-1" />
                  </BrandButton>
                </div>
              </div>
            )}

            {/* ── Step 2: Review ── */}
            {promoteStep === "review" && (
              <div className="space-y-5">
                {sourceClass && (
                  <div className="flex items-center gap-3 rounded-2xl bg-[#fbf0fe]/50 border border-[#cfc2d6]/10 px-4 py-3">
                    <GraduationCap className="h-5 w-5 text-[#8127cf] shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-[#1f1a23]">{clsLabel(sourceClass)}</p>
                      <p className="text-[10px] font-semibold text-[#4d4354]/50">Year {sourceClass.academicYear} · {sourceClass._count.students} students</p>
                    </div>
                  </div>
                )}

                {gradeLoading ? (
                  <div className="space-y-3 py-4 animate-skeleton-in">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-2xl animate-skeleton-in" style={{ animationDelay: `${i * 60}ms` }}>
                        <div className="h-8 w-8 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 w-32 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
                          <div className="h-2.5 w-20 rounded-full bg-[#e8e0ec]/30 skeleton-shimmer" />
                        </div>
                        <div className="h-5 w-14 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {gradeError && (
                      <div className="rounded-2xl border border-amber-200/40 bg-amber-50 p-5">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-bold text-amber-800">{gradeError}</p>
                            <p className="text-xs font-semibold text-amber-700/70 mt-1">
                              Grade data not available — students are listed below without scores. You can still select who to promote.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {gradeResults.length > 0 ? (
                      <>
                        {/* Summary stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { label: "Total Students", value: gradeResults.length, tone: "bg-[#fbf0fe] text-[#8127cf]" },
                            ...(gradeError ? [] : [
                              { label: "Passed", value: gradeResults.filter((g) => g.passed).length, tone: "bg-emerald-50 text-emerald-600" },
                              { label: "Failed", value: gradeResults.filter((g) => !g.passed).length, tone: "bg-rose-50 text-rose-500" },
                            ]),
                            { label: "To Promote", value: studentsToPromote.length, tone: "bg-[#1f1a23] text-white" },
                          ].map((s) => (
                            <div key={s.label} className={cn("rounded-2xl px-4 py-3 text-center", s.tone)}>
                              <p className="text-xl font-black">{s.value}</p>
                              <p className="text-[9px] font-bold uppercase tracking-wider opacity-70">{s.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Student list with checkboxes */}
                        <div className="overflow-x-auto rounded-2xl border border-[#cfc2d6]/10">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-[#cfc2d6]/10 bg-[#fbf0fe]/30">
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">
                                  <input type="checkbox"
                                    checked={gradeResults.length > 0 && gradeResults.every((g) => studentDecisions.get(g.studentId) === "promote")}
                                    onChange={(e) => {
                                      const next = new Map(studentDecisions);
                                      gradeResults.forEach((g) => next.set(g.studentId, e.target.checked ? "promote" : "retain"));
                                      setStudentDecisions(next);
                                    }}
                                    className="accent-[#8127cf] h-4 w-4 rounded cursor-pointer"
                                  />
                                </th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">#</th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">Student</th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50">Roll No</th>
                                {!gradeError && (
                                  <>
                                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50 text-center">%</th>
                                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50 text-center">Grade</th>
                                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50 text-center">Status</th>
                                  </>
                                )}
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50 text-center">Decision</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gradeResults.map((g) => {
                                const decision = studentDecisions.get(g.studentId) || "promote";
                                return (
                                  <tr key={g.studentId} className={cn("border-b border-[#cfc2d6]/5 transition-colors",
                                    !g.passed && !gradeError ? "bg-rose-50/30" : decision === "retain" ? "bg-amber-50/20" : "hover:bg-[#fbf0fe]/20"
                                  )}>
                                    <td className="px-4 py-3">
                                      <input type="checkbox" checked={decision === "promote"}
                                        onChange={(e) => {
                                          const next = new Map(studentDecisions);
                                          next.set(g.studentId, e.target.checked ? "promote" : "retain");
                                          setStudentDecisions(next);
                                        }}
                                        className="accent-[#8127cf] h-4 w-4 rounded cursor-pointer"
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-xs font-bold text-[#4d4354]/40">{g.rank}</td>
                                    <td className="px-4 py-3 text-sm font-bold text-[#1f1a23] truncate max-w-[200px]">{g.studentName}</td>
                                    <td className="px-4 py-3 text-xs font-semibold text-[#4d4354]/50">{g.rollNo || "—"}</td>
                                    {!gradeError && (
                                      <>
                                        <td className="px-4 py-3 text-center">
                                          <span className={cn("text-sm font-black",
                                            g.overallPercentage >= 80 ? "text-emerald-600" : g.overallPercentage >= 50 ? "text-amber-600" : "text-rose-500"
                                          )}>{Math.round(g.overallPercentage)}%</span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-bold text-[#1f1a23]">{g.overallGrade}</td>
                                        <td className="px-4 py-3 text-center">
                                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                                            g.passed ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                                          )}>
                                            {g.passed ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                            {g.passed ? "Pass" : "Fail"}
                                          </span>
                                        </td>
                                      </>
                                    )}
                                    <td className="px-4 py-3 text-center">
                                      <select value={decision}
                                        onChange={(e) => {
                                          const next = new Map(studentDecisions);
                                          next.set(g.studentId, e.target.value as StudentDecision);
                                          setStudentDecisions(next);
                                        }}
                                        className={cn("rounded-lg border px-2 py-1 text-[10px] font-bold outline-none cursor-pointer",
                                          decision === "promote" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
                                        )}>
                                        <option value="promote">Promote</option>
                                        <option value="retain">Retain</option>
                                      </select>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="py-12 text-center">
                        <Users className="mx-auto h-10 w-10 text-[#4d4354]/20 mb-3" />
                        <p className="text-sm font-bold text-[#4d4354]/40">No students found in this class</p>
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-[#cfc2d6]/10">
                  <BrandButton variant="soft" onClick={() => setPromoteStep("source")}>
                    Back
                  </BrandButton>
                  <BrandButton variant="dark" disabled={studentsToPromote.length === 0} onClick={() => setPromoteStep("target")}>
                    Next — Select Target <ArrowRight className="w-4 h-4 ml-1" />
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
                      <span className="mb-1.5 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">Target Class</span>
                      <select value={promoteTargetId} onChange={(e) => setPromoteTargetId(e.target.value)}
                        className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none cursor-pointer">
                        <option value="">Select target class</option>
                        {activeClasses.filter((c) => c.id !== promoteSourceId).map((c) => (
                          <option key={c.id} value={c.id}>{clsLabel(c)} ({c.academicYear}) — {c._count.students} existing</option>
                        ))}
                      </select>
                    </label>

                    {/* Summary */}
                    <div className="rounded-2xl bg-[#fbf0fe]/50 border border-[#cfc2d6]/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#4d4354]/50">Students to promote</span>
                        <span className="text-sm font-black text-emerald-600">{studentsToPromote.length}</span>
                      </div>
                      {studentsToRetain.length > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#4d4354]/50">Students retained</span>
                          <span className="text-sm font-black text-amber-600">{studentsToRetain.length}</span>
                        </div>
                      )}
                      {sourceClass && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#4d4354]/50">From</span>
                          <span className="text-sm font-bold text-[#1f1a23]">{clsLabel(sourceClass)} ({sourceClass.academicYear})</span>
                        </div>
                      )}
                      {targetClass && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#4d4354]/50">To</span>
                          <span className="text-sm font-bold text-[#8127cf]">{clsLabel(targetClass)} ({targetClass.academicYear})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: roll number preview */}
                  <div>
                    <p className="mb-1.5 pl-2 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">New Roll Number Preview</p>
                    {promoteTargetId && targetClass ? (
                      <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-[#cfc2d6]/10 custom-scrollbar">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-[#cfc2d6]/10 bg-[#fbf0fe]/30 sticky top-0">
                              <th className="px-3 py-2 text-[9px] font-black uppercase text-[#4d4354]/50">Student</th>
                              <th className="px-3 py-2 text-[9px] font-black uppercase text-[#4d4354]/50">Old Roll</th>
                              <th className="px-3 py-2 text-[9px] font-black uppercase text-[#4d4354]/50 text-center">→</th>
                              <th className="px-3 py-2 text-[9px] font-black uppercase text-[#8127cf]">New Roll</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentsToPromote.map((g, idx) => (
                              <tr key={g.studentId} className="border-b border-[#cfc2d6]/5 hover:bg-[#fbf0fe]/20">
                                <td className="px-3 py-2 text-xs font-bold text-[#1f1a23] truncate max-w-[160px]">{g.studentName}</td>
                                <td className="px-3 py-2 text-xs font-semibold text-[#4d4354]/50">{g.rollNo || "—"}</td>
                                <td className="px-3 py-2 text-center"><ArrowRight className="h-3 w-3 text-[#8127cf] mx-auto" /></td>
                                <td className="px-3 py-2 text-xs font-black text-[#8127cf]">
                                  {generateRollNoPreview(targetClass.name, targetClass.section, idx, targetClass._count.students)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[200px] rounded-2xl border border-dashed border-[#cfc2d6]/20">
                        <p className="text-xs font-bold text-[#4d4354]/30">Select a target class to preview roll numbers</p>
                      </div>
                    )}
                  </div>
                </div>

                {studentsToRetain.length > 0 && (
                  <div className="rounded-2xl border border-amber-200/40 bg-amber-50 p-4">
                    <p className="text-xs font-bold text-amber-700 mb-2">
                      <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                      {studentsToRetain.length} student{studentsToRetain.length !== 1 ? "s" : ""} will be retained in {sourceClass ? clsLabel(sourceClass) : "current class"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {studentsToRetain.map((g) => (
                        <span key={g.studentId} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[9px] font-bold text-amber-700">{g.studentName}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-[#cfc2d6]/10">
                  <BrandButton variant="soft" onClick={() => setPromoteStep(gradeResults.length > 0 ? "review" : "source")}>
                    Back
                  </BrandButton>
                  <BrandButton variant="dark" disabled={promoting || !promoteTargetId || studentsToPromote.length === 0} onClick={handlePromote}>
                    {promoting ? <><Loader2 className="w-4 h-4 animate-spin" /> Promoting...</> : `Promote ${studentsToPromote.length} Students`}
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
                    <h3 className="text-2xl font-black text-[#1f1a23]">Promotion Complete</h3>
                    <p className="text-sm font-semibold text-[#4d4354]/50 mt-2">
                      {promotionResults.promoted} student{promotionResults.promoted !== 1 ? "s" : ""} promoted
                      {targetClass ? ` to ${clsLabel(targetClass)}` : ""}
                      {promotionResults.retained > 0 ? `, ${promotionResults.retained} retained` : ""}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <div className="rounded-2xl bg-emerald-50 p-4 text-center">
                    <p className="text-3xl font-black text-emerald-600">{promotionResults.promoted}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/70 mt-1">Promoted</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4 text-center">
                    <p className="text-3xl font-black text-amber-600">{promotionResults.retained}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600/70 mt-1">Retained</p>
                  </div>
                </div>

                <p className="text-xs font-semibold text-[#4d4354]/40">
                  New roll numbers have been assigned automatically. Student history records have been saved.
                </p>

                <div className="flex justify-center gap-3 pt-4 border-t border-[#cfc2d6]/10">
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
          </div>
        </div>
      )}
    </div>
  );
}
