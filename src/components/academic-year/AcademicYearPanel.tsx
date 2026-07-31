"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, Calendar, CheckCircle2, ChevronDown, ChevronRight, GraduationCap,
  History, Loader2, Lock, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";

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

export function AcademicYearPanel({ campusId }: { campusId?: string }) {
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteFrom, setPromoteFrom] = useState("");
  const [promoteTo, setPromoteTo] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [historyYear, setHistoryYear] = useState<number | null>(null);
  const [historyClassId, setHistoryClassId] = useState("");
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
    } catch (err: any) { toast.error(err.message); }
    finally { setClosing(false); }
  }, [campusId, load]);

  const handleBulkPromote = useCallback(async () => {
    if (!promoteFrom || !promoteTo) { toast.error("Select both source and target class"); return; }
    if (!confirm("Promote all students from the selected class? They will get new roll numbers in the target class.")) return;
    setPromoting(true);
    try {
      const res = await fetch("/api/academic-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk-promote", fromClassId: promoteFrom, toClassId: promoteTo, campusId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Promotion failed");
      toast.success(json.message);
      setShowPromoteModal(false);
      setPromoteFrom("");
      setPromoteTo("");
      await load();
    } catch (err: any) { toast.error(err.message); }
    finally { setPromoting(false); }
  }, [promoteFrom, promoteTo, campusId, load]);

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
  const completedClasses = allClasses.filter((c) => c.status === "COMPLETED");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <BrandButton variant="dark" icon={<ArrowRight className="w-4 h-4" />} onClick={() => setShowPromoteModal(true)}>
          Promote Students
        </BrandButton>
      </div>

      {/* Year Groups */}
      {yearGroups.length === 0 ? (
        <EmptyState icon={Calendar} title="No Academic Years" description="Create classes with an academic year to get started." />
      ) : (
        <div className="space-y-4">
          {yearGroups.map((yg) => (
            <div key={yg.year} className="rounded-[28px] border border-[#cfc2d6]/10 bg-white shadow-lg overflow-hidden">
              <div
                role="button"
                tabIndex={0}
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
                        {cls.status === "COMPLETED" && (
                          <button
                            type="button"
                            onClick={() => loadHistory(yg.year, cls.id)}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe]/60 hover:bg-[#fbf0fe] py-2 text-[10px] font-bold uppercase tracking-wider text-[#8127cf] transition-all cursor-pointer"
                          >
                            <History className="h-3.5 w-3.5" /> View History
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* History View */}
      {historyYear && historyClassId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5">
          <div className="bg-white w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar">
            <div className="flex justify-between items-start gap-5 mb-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">Academic Year {historyYear}</p>
                <h3 className="mt-1 text-2xl font-bold text-[#1d1b20] tracking-tight">Class History</h3>
              </div>
              <button type="button" onClick={() => { setHistoryYear(null); setHistoryClassId(""); setHistoryRecords([]); }}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500 cursor-pointer transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
              </div>
            ) : historyRecords.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">
                  <span>#</span>
                  <span>Student</span>
                  <span>Admission No</span>
                  <span>Roll No</span>
                  <span>Grade</span>
                  <span>Status</span>
                </div>
                {historyRecords.map((record, i) => (
                  <div key={record.id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-3 rounded-2xl hover:bg-[#fbf0fe]/30 transition-colors">
                    <span className="text-xs font-bold text-[#4d4354]/30">{i + 1}</span>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-[#fbf0fe] overflow-hidden">
                        <img
                          src={record.student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(record.student.fullName)}`}
                          alt="" className="h-full w-full object-cover"
                        />
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

      {/* Promote Modal */}
      {showPromoteModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5">
          <div className="bg-white w-full max-w-lg rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20">
            <div className="flex justify-between items-start gap-5 mb-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">Student Promotion</p>
                <h3 className="mt-1 text-2xl font-bold text-[#1d1b20]">Bulk Promote</h3>
              </div>
              <button type="button" onClick={() => setShowPromoteModal(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500 cursor-pointer transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs font-semibold text-[#4d4354]/50 mb-5">
              Move all students from a completed class to a new class. Each student will receive a new roll number.
              Their old class data (marks, attendance, report cards) remains accessible via history.
            </p>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">From Class (completed year)</span>
                <select value={promoteFrom} onChange={(e) => setPromoteFrom(e.target.value)}
                  className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none cursor-pointer">
                  <option value="">Select source class</option>
                  {completedClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.section ? ` - ${c.section}` : ""} ({c.academicYear}) — {c._count.students} students</option>
                  ))}
                  {activeClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.section ? ` - ${c.section}` : ""} ({c.academicYear}) — {c._count.students} students</option>
                  ))}
                </select>
              </label>

              <div className="flex items-center justify-center">
                <ArrowRight className="h-5 w-5 text-[#8127cf]" />
              </div>

              <label className="block">
                <span className="mb-1.5 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">To Class (new year)</span>
                <select value={promoteTo} onChange={(e) => setPromoteTo(e.target.value)}
                  className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none cursor-pointer">
                  <option value="">Select target class</option>
                  {activeClasses.filter((c) => c.id !== promoteFrom).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.section ? ` - ${c.section}` : ""} ({c.academicYear})</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-8 flex gap-4">
              <BrandButton variant="soft" className="flex-1 h-14" onClick={() => setShowPromoteModal(false)}>Cancel</BrandButton>
              <BrandButton variant="dark" className="flex-[2] h-14" onClick={handleBulkPromote} disabled={promoting || !promoteFrom || !promoteTo}>
                {promoting ? <><Loader2 className="w-5 h-5 animate-spin" /> Promoting...</> : "Promote All Students"}
              </BrandButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
