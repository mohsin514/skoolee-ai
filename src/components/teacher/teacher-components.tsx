"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle, BarChart3, BookOpen, BrainCircuit, CalendarCheck, CheckCircle2, Download, FileText, GraduationCap, History, Loader2, Loader, LogOut, Mail, School, Send, Star, Trash2, Users, X, Zap,
} from "lucide-react";
import { useTeacherData as useTeacherDataContext } from "@/app/teacher/teacher-data-context";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { Select } from "@/components/ui/select";
import {
  AiActionPanel, BrandButton, EmptyState, RoleShell, StatCard, type RoleNavItem,
} from "@/components/role-dashboard";

/* ── Pure helpers ── */

export function classLabel(item: any) {
  if (!item) return "Unassigned";
  return [item.name, item.section].filter(Boolean).join(" ");
}

export function formatStatus(status?: string) {
  return (status || "Pending").replaceAll("_", " ");
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function statusTone(status?: string) {
  if (["ACTIVE", "MARKS_ENTRY", "PUBLISHED", "SENT", "APPROVED", "PRESENT"].includes(status || "")) return "bg-emerald-50 text-emerald-600";
  if (["LOCKED", "PRINCIPAL_REVIEWED", "REVIEWED", "LEAVE"].includes(status || "")) return "bg-[#fbf0fe] text-[#8127cf]";
  if (["ABSENT", "FAILED", "BLOCKED"].includes(status || "")) return "bg-rose-50 text-rose-600";
  return "bg-[#f3f4f9] text-[#4d4354]/70";
}

/* ── Reusable UI components ── */

export function PanelHeader({ icon: Icon, title, status }: { icon: any; title: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-bold text-[#1d1b20]">{title}</h3>
      </div>
      <StatusPill status={status} />
    </div>
  );
}

export function PanelTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-bold tracking-tight text-[#1d1b20]">{title}</h3>
    </div>
  );
}

export function ClassHubCard({ cls, students, onViewStudent }: { cls: any; students: any[]; onViewStudent?: (student: any) => void }) {
  const [showStudents, setShowStudents] = useState(false);
  return (
    <div className="rounded-[30px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">{cls.role || "Teacher"}</p>
          <h3 className="mt-1 truncate text-xl font-bold text-[#1d1b20] tracking-tight">{classLabel(cls)}</h3>
          <p className="mt-1 text-[11px] font-medium text-[#4d4354]/45">Academic year {cls.academicYear || "N/A"}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
          <GraduationCap className="h-6 w-6" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MiniMetric label="Students" value={students.length || cls._count?.students || 0} active />
        <MiniMetric label="Subjects" value={cls.subjects?.length || cls._count?.subjects || 0} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {(cls.subjects || []).slice(0, 6).map((subject: any) => (
          <span key={subject.id} className="rounded-full bg-[#fbf0fe] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#8127cf]">{subject.name}</span>
        ))}
        {!cls.subjects?.length ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600">No subjects</span>
        ) : null}
      </div>
      {students.length > 0 ? (
        <div className="mt-5">
          <button type="button" onClick={() => setShowStudents(!showStudents)} className="flex w-full cursor-pointer items-center justify-between rounded-2xl bg-[#fbf0fe]/50 px-4 py-2.5 text-left transition-all hover:bg-[#fbf0fe] hover:shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">{students.length} Student{students.length !== 1 ? "s" : ""}</span>
            <span className="text-[10px] font-semibold text-[#4d4354]/40">{showStudents ? "Hide" : "View"}</span>
          </button>
          {showStudents ? (
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto custom-scrollbar">
              {students.slice(0, 20).map((student: any) => (
                <button key={student.id} type="button" onClick={() => onViewStudent?.(student)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-3 py-2 text-left text-xs font-semibold text-[#1d1b20] transition-all hover:bg-white hover:shadow-sm active:scale-[0.98]">
                  <span className="text-[11px] font-bold text-[#4d4354]/40">{student.rollNo || "#"}</span>
                  <span className="truncate">{student.fullName}</span>
                </button>
              ))}
              {students.length > 20 ? <p className="px-3 py-1 text-[11px] font-semibold text-[#4d4354]/40">+{students.length - 20} more</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function StudentMini({ student }: { student: any }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-slate-50 shadow-sm">
        <img src={student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
          {student.rollNo || "No roll"} {student.class ? `- ${classLabel(student.class)}` : ""}
        </p>
      </div>
    </div>
  );
}

export function MiniMetric({ label, value, active, danger }: { label: string; value: any; active?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/70 px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold ${danger ? "text-rose-600" : active ? "text-[#8127cf]" : "text-[#1d1b20]"}`}>{value}</p>
    </div>
  );
}

export function SideMetric({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3.5 py-3 transition-colors hover:bg-white/20">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold text-white">{value}</p>
    </div>
  );
}

export function StatusPill({ status }: { status?: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone(status)}`}>
      {formatStatus(status)}
    </span>
  );
}

export function EmptyInline({ text }: { text: string }) {
  return <p className="rounded-2xl bg-[#fbf0fe]/60 border border-[#8127cf]/10 p-4 text-sm font-semibold text-[#4d4354]/55">{text}</p>;
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex h-32 items-center justify-center gap-3 text-sm font-black uppercase tracking-normal text-[#8127cf]">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

export function ModalFrame({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5">
      <div className={`bg-white w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar`}>
        <div className="flex justify-between items-start gap-5 mb-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">{eyebrow}</p>
            <h3 className="mt-1 text-2xl font-bold text-[#1d1b20] tracking-tight">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500 cursor-pointer transition-all active:scale-90">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3 transition-colors hover:bg-white">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-bold text-[#1d1b20]">{value}</span>
    </div>
  );
}

export function FormInput({ label, value, placeholder, type = "text", onChange }: { label: string; value: string; placeholder: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white hover:border-[#8127cf]/20" />
    </label>
  );
}

export function FormSelect({ label, value, children, onChange }: { label: string; value: string; children: ReactNode; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white hover:border-[#8127cf]/20">
        {children}
      </select>
    </label>
  );
}

export function ModalActions({ busy, busyLabel, actionLabel, onClose, onSave }: { busy: boolean; busyLabel: string; actionLabel: string; onClose: () => void; onSave: () => void }) {
  return (
    <div className="mt-8 flex gap-4">
      <BrandButton variant="soft" className="flex-1 h-14 hover:bg-rose-50 hover:text-rose-600 transition-all" onClick={onClose}>Cancel</BrandButton>
      <BrandButton variant="dark" className="flex-[2] h-14" onClick={onSave} disabled={busy}>
        {busy ? (<><Loader2 className="w-5 h-5 animate-spin" />{busyLabel}</>) : actionLabel}
      </BrandButton>
    </div>
  );
}

export function ConfigField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span className="mb-2 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-[#4d4354]/50">{label}</span>
      <input type="number" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white hover:border-[#8127cf]/20" />
    </div>
  );
}

/* ── Modal: Create Assessment ── */

export function CreateAssessmentModal({ open, classHubs, examForm, creatingExam, onClose, onFormChange, onCreate }: {
  open: boolean; classHubs: any[]; examForm: any; creatingExam: boolean;
  onClose: () => void; onFormChange: (field: string, value: string) => void; onCreate: () => void;
}) {
  if (!open) return null;
  return (
    <ModalFrame title="Create Assessment" eyebrow="Exam / Test setup" onClose={onClose}>
      <div className="space-y-4">
        <FormInput label="Assessment Title" value={examForm.title} placeholder="e.g. Week 3 Quiz, First Mid Term" onChange={(v) => onFormChange("title", v)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormSelect label="Type" value={examForm.examType} onChange={(v) => onFormChange("examType", v)}>
            <option value="CLASS_TEST">Class Test</option>
            <option value="QUIZ">Quiz</option>
            <option value="MID_TERM">Mid Term</option>
            <option value="FINAL">Final Exam</option>
            <option value="CUSTOM">Custom</option>
          </FormSelect>
          <FormSelect label="Class" value={examForm.classId} onChange={(v) => onFormChange("classId", v)}>
            <option value="">Select class</option>
            {classHubs.map((cls: any) => <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>)}
          </FormSelect>
        </div>
        <FormInput label="Term" value={examForm.term} placeholder="e.g. First Term, Annual" onChange={(v) => onFormChange("term", v)} />
        <FormSelect label="Subject (optional)" value={examForm.subjectId} onChange={(v) => onFormChange("subjectId", v)}>
          <option value="">All Subjects</option>
          {classHubs.find((c: any) => c.id === examForm.classId)?.subjects?.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </FormSelect>
      </div>
      <ModalActions busy={creatingExam} busyLabel="Creating..." actionLabel="Create Assessment" onClose={onClose} onSave={onCreate} />
    </ModalFrame>
  );
}

/* ── Modal: Grade Weight Config ── */

export function GradeConfigModal({ open, classHubs, selectedGradeClassId, gradeConfig, gradeConfigLoading, gradeConfigSaving, onClose, onClassChange, onConfigChange, onSave }: {
  open: boolean; classHubs: any[]; selectedGradeClassId: string; gradeConfig: Record<string, number>;
  gradeConfigLoading: boolean; gradeConfigSaving: boolean;
  onClose: () => void; onClassChange: (id: string) => void; onConfigChange: (config: Record<string, number>) => void; onSave: () => void;
}) {
  if (!open) return null;
  return (
    <ModalFrame title="Grade Weight Configuration" eyebrow="Final grade calculation" onClose={onClose} wide>
      <div className="mb-4">
        <FormSelect label="Class" value={selectedGradeClassId} onChange={onClassChange}>
          <option value="">Select class</option>
          {classHubs.map((cls: any) => <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>)}
        </FormSelect>
      </div>
      {gradeConfigLoading ? (
        <LoadingBlock label="Loading config..." />
      ) : selectedGradeClassId ? (
        <div className="space-y-5">
          <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Exam Type Weights (must total 100%)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ConfigField label="Quiz Weight (%)" value={gradeConfig.quizWeight} onChange={(v) => onConfigChange({ ...gradeConfig, quizWeight: v })} />
            <ConfigField label="Class Test Weight (%)" value={gradeConfig.classTestWeight} onChange={(v) => onConfigChange({ ...gradeConfig, classTestWeight: v })} />
            <ConfigField label="Mid Term Weight (%)" value={gradeConfig.midTermWeight} onChange={(v) => onConfigChange({ ...gradeConfig, midTermWeight: v })} />
            <ConfigField label="Final Exam Weight (%)" value={gradeConfig.finalWeight} onChange={(v) => onConfigChange({ ...gradeConfig, finalWeight: v })} />
          </div>
          <div className="rounded-2xl bg-[#fbf0fe]/60 p-4">
            <p className="text-[10px] font-bold">Total: {Object.entries(gradeConfig).filter(([k]) => k.endsWith("Weight")).reduce((s, [, v]) => s + (v as number), 0)}%</p>
          </div>
          <div className="border-t border-[#cfc2d6]/10 pt-5">
            <p className="mb-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Grade Thresholds</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ConfigField label="A+ ≥" value={gradeConfig.gradeAplus} onChange={(v) => onConfigChange({ ...gradeConfig, gradeAplus: v })} />
              <ConfigField label="A ≥" value={gradeConfig.gradeA} onChange={(v) => onConfigChange({ ...gradeConfig, gradeA: v })} />
              <ConfigField label="B ≥" value={gradeConfig.gradeB} onChange={(v) => onConfigChange({ ...gradeConfig, gradeB: v })} />
              <ConfigField label="C ≥" value={gradeConfig.gradeC} onChange={(v) => onConfigChange({ ...gradeConfig, gradeC: v })} />
              <ConfigField label="D ≥" value={gradeConfig.gradeD} onChange={(v) => onConfigChange({ ...gradeConfig, gradeD: v })} />
              <ConfigField label="Pass % ≥" value={gradeConfig.passingPercentage} onChange={(v) => onConfigChange({ ...gradeConfig, passingPercentage: v })} />
            </div>
          </div>
        </div>
      ) : (
        <EmptyInline text="Select a class to configure grade weights." />
      )}
      <ModalActions busy={gradeConfigSaving} busyLabel="Saving..." actionLabel="Save Grade Configuration" onClose={onClose} onSave={onSave} />
    </ModalFrame>
  );
}

/* ── Modal: Final Grades ── */

export function FinalGradesModal({ open, classHubs, selectedGradeClassId, weightedGradeResult, weightedGradeLoading, generatingReportCards, reportCardsGenerated, onClose, onClassChange, onGenerate, onGenerateReportCards }: {
  open: boolean; classHubs: any[]; selectedGradeClassId: string;
  weightedGradeResult: any[] | null; weightedGradeLoading: boolean;
  generatingReportCards: boolean; reportCardsGenerated: boolean;
  onClose: () => void; onClassChange: (id: string) => void; onGenerate: (classId: string) => void;
  onGenerateReportCards: () => void;
}) {
  const router = useRouter();

  if (!open) return null;
  return (
    <ModalFrame title="Final Grades" eyebrow="Weighted grade calculation" onClose={onClose} wide>
      <div className="mb-4">
        <FormSelect label="Class" value={selectedGradeClassId} onChange={onClassChange}>
          <option value="">Select class</option>
          {classHubs.map((cls: any) => <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>)}
        </FormSelect>
      </div>

      {!weightedGradeResult && !weightedGradeLoading && selectedGradeClassId ? (
        <div className="mb-4">
          <BrandButton variant="dark" icon={<BarChart3 className="w-4 h-4" />} onClick={() => onGenerate(selectedGradeClassId)}>
            Generate Final Grades
          </BrandButton>
        </div>
      ) : null}

      {weightedGradeLoading ? (
        <LoadingBlock label="Calculating grades..." />
      ) : weightedGradeResult?.length ? (
        <>
          <div className="overflow-hidden rounded-2xl border border-[#f3f4f9]">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="bg-[#fbf0fe]/40 text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/50">
                  <th className="px-5 py-4">Rank</th>
                  <th className="px-5 py-4">Student</th>
                  <th className="px-4 py-4 text-center">Roll No</th>
                  <th className="px-4 py-4 text-center">Percentage</th>
                  <th className="px-4 py-4 text-center">Grade</th>
                  <th className="px-4 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f9]">
                {weightedGradeResult.map((grade: any, i: number) => {
                  const cls = classHubs.find((c: any) => c.id === selectedGradeClassId);
                  return (
                    <tr key={grade.studentId} className="hover:bg-[#fbf0fe]/30 cursor-pointer transition-colors" onClick={() => router.push(`/teacher/reports?studentId=${grade.studentId}&classId=${selectedGradeClassId}`)}>
                      <td className="px-5 py-4"><span className="text-sm font-bold text-[#4d4354]/60">#{grade.rank || i + 1}</span></td>
                      <td className="px-5 py-4"><p className="text-sm font-bold text-[#1d1b20]">{grade.studentName}</p></td>
                      <td className="px-4 py-4 text-center text-sm font-semibold text-[#4d4354]/60">{grade.rollNo || "—"}</td>
                      <td className="px-4 py-4 text-center"><span className="text-lg font-bold text-[#8127cf]">{grade.overallPercentage}%</span></td>
                      <td className="px-4 py-4 text-center"><span className="rounded-full bg-white border border-[#cfc2d6]/10 px-3 py-1 text-[11px] font-bold text-[#1d1b20]">{grade.overallGrade}</span></td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${grade.passed ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${grade.passed ? "bg-emerald-500" : "bg-rose-500"}`} />
                          {grade.passed ? "PASS" : "FAIL"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold text-[#4d4354]/50">{weightedGradeResult.length} students</p>
            <div className="flex flex-wrap gap-3">
              <BrandButton variant="dark" icon={generatingReportCards ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                onClick={onGenerateReportCards} disabled={generatingReportCards || reportCardsGenerated}>
                {generatingReportCards ? "Generating..." : reportCardsGenerated ? "Report Cards Generated" : "Generate Report Cards"}
              </BrandButton>
              <BrandButton variant="dark" icon={<Download className="w-4 h-4" />} onClick={() => window.print()}>
                Print / Download PDF
              </BrandButton>
            </div>
          </div>
        </>
      ) : selectedGradeClassId ? (
        <div className="space-y-4">
          <EmptyInline text="Click 'Generate Final Grades' to calculate weighted grades from locked exams." />
          <BrandButton variant="dark" icon={<BarChart3 className="w-4 h-4" />} onClick={() => onGenerate(selectedGradeClassId)}>
            Generate Final Grades
          </BrandButton>
        </div>
      ) : (
        <EmptyInline text="Select a class to view final grades." />
      )}
    </ModalFrame>
  );
}

/* ── Modal: Student Detail ── */

export function StudentDetailModal({ student, exams, onClose }: { student: any; exams: any[]; onClose: () => void }) {
  const report = student.reportCards?.[0];
  const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;
  const latestMarks = (student.marks || []).slice(0, 8);

  return (
    <ModalFrame title={student.fullName} eyebrow="Student profile" onClose={onClose} wide>
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-gradient-to-br from-[#fbf0fe]/80 to-white p-5 sm:flex-row sm:items-center border border-[#8127cf]/10">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">Student Record</p>
          <h3 className="mt-1 truncate text-3xl font-bold tracking-tight text-[#1d1b20]">{student.fullName}</h3>
          <p className="mt-2 text-sm font-semibold text-[#4d4354]/55">
            {student.rollNo || "No roll number"} &mdash; {classLabel(student.class)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniMetric label="Roll No" value={student.rollNo || "N/A"} active />
        <MiniMetric label="Class" value={classLabel(student.class)} />
        <MiniMetric label="Latest" value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} />
      </div>
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
          <PanelTitle icon={Users} title="Guardian" />
          <div className="mt-4 space-y-2">
            <DetailRow label="Name" value={student.guardianName || "N/A"} />
            <DetailRow label="Phone" value={student.guardianPhone || student.guardianWhatsapp || "N/A"} />
            <DetailRow label="Email" value={student.guardianEmail || "N/A"} />
          </div>
        </div>
        <div className="rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
          <PanelTitle icon={FileText} title="Latest Report Card" />
          {report ? (
            <div className="mt-4 space-y-2">
              <DetailRow label="Exam" value={report.exam?.title || "N/A"} />
              <DetailRow label="Status" value={<StatusPill status={report.status} />} />
              <DetailRow label="Grade" value={report.grade || `${Math.round(report.percentage || 0)}%`} />
              <DetailRow label="Generated" value={formatDate(report.generatedAt)} />
            </div>
          ) : (
            <div className="mt-4"><EmptyInline text="No report card generated yet." /></div>
          )}
        </div>
      </div>
      <div className="mt-6 rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
        <PanelTitle icon={Star} title="Recent Marks" />
        {latestMarks.length > 0 ? (
          <div className="mt-4 space-y-2">
            {latestMarks.map((mark: any, idx: number) => (
              <DetailRow key={mark.id || idx} label={`${mark.subject?.name || "Subject"} \u2014 ${mark.exam?.title || "Exam"}`} value={`${mark.marksObtained}/${mark.subject?.totalMarks || 100}`} />
            ))}
          </div>
        ) : (<div className="mt-4"><EmptyInline text="No marks recorded for this student yet." /></div>)}
      </div>
      <div className="mt-6 rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
        <PanelTitle icon={CalendarCheck} title="Recent Attendance" />
        {(student.attendance || []).slice(0, 5).length > 0 ? (
          <div className="mt-4 space-y-2">
            {(student.attendance || []).slice(0, 5).map((att: any) => (
              <DetailRow key={att.id} label={formatDate(att.date)} value={<StatusPill status={att.status} />} />
            ))}
          </div>
        ) : (<div className="mt-4"><EmptyInline text="No attendance records available." /></div>)}
      </div>
    </ModalFrame>
  );
}

/* ── Modal: Report Card Detail ── */

export function ReportCardDetailModal({ report, busy, remarkBusy, onClose, onSend, onGenerateRemarks }: {
  report: any; busy: boolean; remarkBusy: string | null;
  onClose: () => void; onSend: () => void;
  onGenerateRemarks?: (studentId: string, examId: string) => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const avatar = report.student?.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(report.student?.fullName || "Student")}`;

  return (
    <ModalFrame title={`${report.student?.fullName || "Student"} \u2014 Report Card`} eyebrow="Academic result" onClose={onClose} wide>
      <div ref={printRef} id="report-card-print" className="space-y-6">
        <div className="flex flex-col gap-5 rounded-[30px] bg-gradient-to-br from-[#fbf0fe]/80 to-white p-5 sm:flex-row sm:items-center border border-[#8127cf]/10">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[28px] border-4 border-white bg-white shadow-xl">
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">{report.exam?.title || "Final Grade"} &middot; {report.exam?.term || ""}</p>
            <h3 className="mt-1 truncate text-3xl font-bold tracking-tight text-[#1d1b20]">{report.student?.fullName || "Student"}</h3>
            <p className="mt-2 text-sm font-semibold text-[#4d4354]/55">
              {report.student?.rollNo ? `Roll No: ${report.student.rollNo}` : ""} &middot; {classLabel(report.student?.class)}
            </p>
            <p className="mt-1 text-[11px] font-medium text-[#4d4354]/50">Generated {formatDate(report.generatedAt)}</p>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-center">
              <p className="text-4xl font-bold text-[#8127cf]">{Math.round(report.percentage || 0)}%</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">Percentage</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-[#1d1b20]">{report.grade || "\u2014"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">Grade</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniMetric label="Roll No" value={report.student?.rollNo || "N/A"} active />
          <MiniMetric label="Class" value={classLabel(report.student?.class)} />
          <MiniMetric label="Status" value={<StatusPill status={report.status} />} />
          <MiniMetric label="Delivery" value={report.deliveryStatus || "Pending"} />
        </div>

        <div className="rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
          <PanelTitle icon={BarChart3} title="Final Result" />
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 text-center transition-colors hover:border-[#8127cf]/20">
              <p className="text-2xl font-bold text-[#1d1b20]">{report.totalMarks || "\u2014"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">Total Marks</p>
            </div>
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 text-center transition-colors hover:border-[#8127cf]/20">
              <p className="text-2xl font-bold text-[#8127cf]">{report.obtainedMarks || "\u2014"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">Obtained</p>
            </div>
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 text-center transition-colors hover:border-[#8127cf]/20">
              <p className="text-2xl font-bold text-[#8127cf]">{Math.round(report.percentage || 0)}%</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">Percentage</p>
            </div>
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 text-center transition-colors hover:border-[#8127cf]/20">
              <p className={`text-2xl font-bold ${report.passed !== false ? "text-[#1d1b20]" : "text-rose-600"}`}>{report.grade || "\u2014"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">Grade</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
          <PanelTitle icon={BookOpen} title="Subject Marks" />
          {report.marks?.length ? (
            <div className="mt-4 space-y-2">
              {report.marks.map((mark: any) => (
                <DetailRow key={mark.id || mark.subjectId} label={mark.subject?.name || "Subject"} value={`${mark.marksObtained}/${mark.subject?.totalMarks || 100}`} />
              ))}
            </div>
          ) : report.subjectBreakdown?.length ? (
            <div className="mt-4 space-y-2">
              {report.subjectBreakdown.map((sb: any) => (
                <DetailRow key={sb.subjectId} label={sb.subjectName || "Subject"} value={`${sb.obtainedMarks}/${sb.totalMarks} (${sb.percentage}% \u2014 ${sb.grade})`} />
              ))}
            </div>
          ) : (<div className="mt-4"><EmptyInline text="Marks breakdown not available." /></div>)}
        </div>

        <div className="rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
          <PanelTitle icon={FileText} title="Remarks" />
          {report.remarksEn || report.remarksUr ? (
            <div className="mt-4 space-y-3">
              {report.remarksEn ? (
                <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 px-4 py-3 transition-colors hover:border-[#8127cf]/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">English</p>
                  <p className="mt-1 text-sm font-semibold text-[#1d1b20]">{report.remarksEn}</p>
                </div>
              ) : null}
              {report.remarksUr ? (
                <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 px-4 py-3 transition-colors hover:border-[#8127cf]/20" dir="rtl">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/45">Urdu</p>
                  <p className="mt-1 text-sm font-semibold text-[#1d1b20]">{report.remarksUr}</p>
                </div>
              ) : null}
            </div>
          ) : (<div className="mt-4"><EmptyInline text="No remarks drafted yet." /></div>)}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[#cfc2d6]/10 pt-5">
        {report.exam?.id && report.student?.id && onGenerateRemarks ? (
          <BrandButton variant="soft" icon={<BrainCircuit className="w-4 h-4" />}
            onClick={() => onGenerateRemarks(report.student.id, report.exam.id)}
            disabled={remarkBusy === report.student.id}>
            {remarkBusy === report.student.id ? "Generating..." : "Generate Remarks"}
          </BrandButton>
        ) : null}
        {report.isSent ? (
          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">Already Sent</span>
        ) : (
          <BrandButton variant="dark" icon={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} onClick={onSend} disabled={busy}>
            {busy ? "Sending..." : "Send to Guardian"}
          </BrandButton>
        )}
        <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={() => window.print()}>
          Download PDF
        </BrandButton>
      </div>
    </ModalFrame>
  );
}

/* ── Skeleton loaders ── */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative isolate overflow-hidden rounded-2xl bg-[#e8e0ec]/50 ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="relative p-7 px-9 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
              <div>
                <SkeletonBlock className="h-3 w-40 mb-1.5" />
                <SkeletonBlock className="h-2 w-48" />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <SkeletonBlock className="h-5 w-28 rounded-full" />
              <SkeletonBlock className="h-5 w-24 rounded-full" />
              <SkeletonBlock className="h-5 w-28 rounded-full" />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <SkeletonBlock className="h-11 w-36 rounded-2xl" />
            <SkeletonBlock className="h-11 w-40 rounded-2xl" />
            <SkeletonBlock className="h-11 w-32 rounded-2xl" />
            <SkeletonBlock className="h-11 w-28 rounded-2xl" />
            <SkeletonBlock className="h-11 w-28 rounded-2xl" />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 bg-[#fbf0fe]/20 space-y-7">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-3xl bg-white p-5 border border-[#cfc2d6]/10 shadow-sm">
              <SkeletonBlock className="h-11 w-11 rounded-2xl mb-3" />
              <SkeletonBlock className="h-7 w-16 mb-1" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
          ))}
        </div>
        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-[32px] p-6 border border-[#cfc2d6]/10 shadow-sm">
              <div className="flex justify-between mb-5">
                <div>
                  <SkeletonBlock className="h-3 w-24 mb-1" />
                  <SkeletonBlock className="h-5 w-36" />
                </div>
                <SkeletonBlock className="h-10 w-10 rounded-2xl" />
              </div>
              {i === 0 ? (
                <div className="flex items-center gap-6">
                  <SkeletonBlock className="h-[140px] w-[140px] rounded-full shrink-0" />
                  <div className="flex-1 space-y-3">
                    {[...Array(4)].map((_, j) => (
                      <div key={j} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <SkeletonBlock className="h-2.5 w-2.5 rounded-full" />
                          <SkeletonBlock className="h-3 w-16" />
                        </div>
                        <SkeletonBlock className="h-3 w-8" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : i === 1 ? (
                <div className="space-y-3">
                  <SkeletonBlock className="h-[160px] w-full rounded-2xl" />
                </div>
              ) : (
                <div className="space-y-5">
                  {[...Array(3)].map((_, j) => (
                    <div key={j}>
                      <div className="flex justify-between mb-1.5">
                        <SkeletonBlock className="h-3 w-24" />
                        <SkeletonBlock className="h-3 w-10" />
                      </div>
                      <SkeletonBlock className="h-2 w-full rounded-full" />
                      <SkeletonBlock className="h-2 w-20 mt-1.5" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Nav cards */}
        <div>
          <SkeletonBlock className="h-4 w-28 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-[28px] bg-white p-5 border border-[#cfc2d6]/10 shadow-sm">
                <div className="flex justify-between mb-4">
                  <SkeletonBlock className="h-12 w-12 rounded-2xl" />
                  <SkeletonBlock className="h-4 w-4" />
                </div>
                <SkeletonBlock className="h-5 w-28 mb-1" />
                <SkeletonBlock className="h-3 w-40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarksSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* Header */}
      <header className="p-7 px-9 border-b border-[#f3f4f9] bg-white z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-36" />
          </div>
          <SkeletonBlock className="h-9 w-56 mb-2" />
          <SkeletonBlock className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-11 w-40 rounded-2xl" />
          <SkeletonBlock className="h-11 w-32 rounded-2xl" />
          <SkeletonBlock className="h-11 w-32 rounded-2xl" />
        </div>
      </header>
      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20 space-y-6">
        {/* Exam selector control */}
        <div className="w-full max-w-md">
          <SkeletonBlock className="h-3 w-28 mb-1.5" />
          <SkeletonBlock className="h-12 w-full rounded-xl" />
        </div>
        {/* Exam cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-4 border border-[#cfc2d6]/10 shadow-sm">
              <div className="flex justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <SkeletonBlock className="h-4 w-32" />
                    <SkeletonBlock className="h-5 w-14 rounded-full shrink-0" />
                  </div>
                  <SkeletonBlock className="h-3 w-24" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#fbf0fe]/40 px-3 py-2 flex items-center gap-2">
                  <SkeletonBlock className="h-3 w-12" />
                  <SkeletonBlock className="h-5 w-6" />
                </div>
                <div className="rounded-xl bg-[#fbf0fe]/40 px-3 py-2 flex items-center gap-2">
                  <SkeletonBlock className="h-3 w-12" />
                  <SkeletonBlock className="h-5 w-6" />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Marks table card */}
        <div className="rounded-[26px] bg-white border border-[#cfc2d6]/10 shadow-sm overflow-hidden">
          <div className="bg-[#fbf0fe]/30 px-5 py-4 border-b border-[#cfc2d6]/10">
            <div className="flex gap-8">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-3 w-14" />
              <SkeletonBlock className="h-3 w-14" />
              <SkeletonBlock className="h-3 w-14" />
            </div>
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-[#cfc2d6]/8 last:border-b-0">
              <div className="flex items-center gap-3 flex-1">
                <SkeletonBlock className="h-10 w-10 rounded-xl shrink-0" />
                <div>
                  <SkeletonBlock className="h-4 w-28 mb-1" />
                  <SkeletonBlock className="h-3 w-20" />
                </div>
              </div>
              {[...Array(3)].map((_, j) => (
                <SkeletonBlock key={j} className="h-11 w-20 rounded-2xl" />
              ))}
            </div>
          ))}
        </div>
        {/* Actions bar */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <SkeletonBlock className="h-4 w-48" />
          <div className="flex gap-3">
            <SkeletonBlock className="h-11 w-36 rounded-2xl" />
            <SkeletonBlock className="h-11 w-32 rounded-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function AttendanceSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* Header */}
      <header className="p-7 px-9 border-b border-[#f3f4f9] bg-white z-10 shrink-0">
        <div className="flex items-center gap-2 text-[#8127cf] mb-2">
          <SkeletonBlock className="h-4 w-4 rounded" />
          <SkeletonBlock className="h-3 w-44" />
        </div>
        <SkeletonBlock className="h-9 w-56 mb-2" />
        <SkeletonBlock className="h-4 w-80" />
      </header>
      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20 space-y-6">
        {/* Class & Date picker controls */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] items-end">
            <div>
              <SkeletonBlock className="h-3 w-16 mb-1.5" />
              <SkeletonBlock className="h-12 w-[240px] rounded-xl" />
            </div>
            <div>
              <SkeletonBlock className="h-3 w-14 mb-1.5" />
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
                <SkeletonBlock className="h-9 w-[140px] rounded-xl" />
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-4 border border-[#cfc2d6]/10 shadow-sm flex items-center gap-3">
              <SkeletonBlock className="h-8 w-8 rounded-xl shrink-0" />
              <div>
                <SkeletonBlock className="h-3 w-14 mb-1" />
                <SkeletonBlock className="h-5 w-8" />
              </div>
            </div>
          ))}
        </div>
        {/* Bulk action controls */}
        <div className="flex gap-2">
          <SkeletonBlock className="h-8 w-24 rounded-xl" />
          <SkeletonBlock className="h-8 w-24 rounded-xl" />
          <SkeletonBlock className="h-8 w-24 rounded-xl" />
        </div>
        {/* Students list card */}
        <div className="rounded-[26px] bg-white border border-[#cfc2d6]/10 shadow-sm overflow-hidden divide-y divide-[#cfc2d6]/10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-10 w-10 rounded-xl shrink-0" />
                <div>
                  <SkeletonBlock className="h-4 w-32 mb-1" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
              </div>
              <div className="flex gap-1.5">
                <SkeletonBlock className="h-8 w-14 rounded-lg" />
                <SkeletonBlock className="h-8 w-14 rounded-lg" />
                <SkeletonBlock className="h-8 w-14 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
        {/* Save button */}
        <div className="flex justify-end">
          <SkeletonBlock className="h-11 w-40 rounded-2xl" />
        </div>
        {/* Attendance history card */}
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-32" />
          <div className="rounded-[26px] bg-white border border-[#cfc2d6]/10 shadow-sm overflow-hidden divide-y divide-[#cfc2d6]/10">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <SkeletonBlock className="h-9 w-9 rounded-xl" />
                  <div>
                    <SkeletonBlock className="h-4 w-24 mb-1" />
                    <SkeletonBlock className="h-3 w-20" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <SkeletonBlock className="h-6 w-12 rounded-full" />
                  <SkeletonBlock className="h-6 w-12 rounded-full" />
                  <SkeletonBlock className="h-6 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReportsSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* Header */}
      <header className="p-7 px-9 border-b border-[#f3f4f9] bg-white z-10 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <SkeletonBlock className="h-4 w-4 rounded" />
          <SkeletonBlock className="h-3 w-44" />
        </div>
        <SkeletonBlock className="h-9 w-64 mb-2" />
        <SkeletonBlock className="h-4 w-96" />
      </header>
      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20 space-y-6">
        {/* Controls: select + button */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <SkeletonBlock className="h-3 w-24 mb-1.5" />
              <SkeletonBlock className="h-12 w-[280px] rounded-xl" />
            </div>
            <SkeletonBlock className="h-11 w-36 rounded-2xl" />
          </div>
        </div>
        {/* Locked exam cards */}
        <div>
          <SkeletonBlock className="h-3 w-24 mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl bg-white p-4 border border-[#cfc2d6]/10 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <SkeletonBlock className="h-4 w-32 mb-1" />
                    <SkeletonBlock className="h-3 w-24" />
                  </div>
                  <SkeletonBlock className="h-6 w-14 rounded-full shrink-0" />
                </div>
                <div className="mt-3">
                  <SkeletonBlock className="h-6 w-24 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Report card list */}
        <div>
          <SkeletonBlock className="h-3 w-28 mb-3" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="rounded-2xl bg-white p-4 border border-[#cfc2d6]/10 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <SkeletonBlock className="h-10 w-10 rounded-xl shrink-0" />
                    <div>
                      <SkeletonBlock className="h-4 w-36 mb-1" />
                      <SkeletonBlock className="h-3 w-32" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <SkeletonBlock className="h-7 w-14 rounded-lg" />
                    <SkeletonBlock className="h-6 w-20 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function AISkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-44" />
          </div>
          <SkeletonBlock className="h-9 w-48 mb-2" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-[28px] bg-white border border-[#cfc2d6]/10 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
              </div>
              <SkeletonBlock className="h-7 w-20 mb-1" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0 space-y-6">
            <div className="bg-white p-6 rounded-[32px] border border-[#cfc2d6]/10 shadow-sm">
              <div className="flex items-start gap-4 mb-6">
                <SkeletonBlock className="h-12 w-12 rounded-2xl shrink-0" />
                <div>
                  <SkeletonBlock className="h-6 w-36 mb-1" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
              </div>
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-2xl border border-[#cfc2d6]/10 bg-[#fbf0fe]/20 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <SkeletonBlock className="h-4 w-4 rounded" />
                      <SkeletonBlock className="h-4 w-28" />
                    </div>
                    <SkeletonBlock className="h-12 w-full rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-6 w-full lg:w-[360px] shrink-0">
            <div className="bg-[#1f1a23] p-6 rounded-[32px]">
              <SkeletonBlock className="h-3 w-28 mb-3 opacity-15" />
              <SkeletonBlock className="h-10 w-24 mb-1 opacity-15" />
              <SkeletonBlock className="h-3 w-48 mb-6 opacity-15" />
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-2xl bg-white/10 p-3">
                    <SkeletonBlock className="h-3 w-14 mb-1.5 opacity-15" />
                    <SkeletonBlock className="h-6 w-10 opacity-15" />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white p-6 rounded-[32px] border border-[#cfc2d6]/10 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <SkeletonBlock className="h-4 w-4 rounded" />
                <SkeletonBlock className="h-4 w-32" />
              </div>
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-[#fbf0fe]/40 border border-[#8127cf]/10">
                    <SkeletonBlock className="h-3 w-24 mb-2" />
                    <SkeletonBlock className="h-3 w-full mb-1" />
                    <SkeletonBlock className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Hook to load teacher dashboard data ── */

export function useTeacherData() {
  const { data, loading, refetch } = useTeacherDataContext();
  return { data, loading, loadData: refetch };
}
