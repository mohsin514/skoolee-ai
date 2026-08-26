"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle, BarChart3, BrainCircuit, CalendarCheck, CheckCircle2, Download, FileText, GraduationCap, History, Languages, Loader2, Loader, LogOut, Mail, MessageCircle, Phone, RefreshCw, Save, School, Send, Star, Trash2, Users, X, Zap,
} from "lucide-react";
import { useTeacherData as useTeacherDataContext } from "@/app/teacher/teacher-data-context";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UrduInput } from "@/components/ui/urdu-input";
import { transliterateToUrdu } from "@/lib/urdu";
import { downloadPdfFile, downloadReportCardPdf } from "@/lib/download";
import {
  AiActionPanel, BrandButton, EmptyState, RoleShell, StatCard, type RoleNavItem,
} from "@/components/role-dashboard";
import { AvatarImage } from "@/components/ui/avatar-image";

/* ── Pure helpers ── */

export function classLabel(item: any) {
  if (!item) return "Unassigned";
  const base = [item.name, item.section].filter(Boolean).join(" ");
  // A class name/section is reused every academic year (e.g. two distinct
  // "QA Grade 5 A" classes, one per year) — without the year, teacher-facing
  // dropdowns show duplicate, indistinguishable options for different classes.
  return item.academicYear ? `${base} - ${item.academicYear}` : base;
}

export function formatStatus(status?: string) {
  return (status || "Pending").replaceAll("_", " ");
}

export function todayIso() {
  // Local calendar date, not UTC. toISOString() rolls the day over for any
  // timezone ahead of UTC, which silently pointed attendance marking at
  // tomorrow. "en-CA" is the locale that formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA");
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function statusTone(status?: string) {
  if (["ACTIVE", "MARKS_ENTRY", "PUBLISHED", "SENT", "APPROVED", "PRESENT"].includes(status || "")) return "bg-emerald-50 text-emerald-600";
  if (["LOCKED", "PRINCIPAL_REVIEWED", "REVIEWED", "LEAVE"].includes(status || "")) return "bg-[#fbf0fe] text-[#8127cf]";
  if (["ABSENT", "FAILED", "BLOCKED"].includes(status || "")) return "bg-rose-50 text-rose-600";
  return "bg-[#f3f4f9] text-ink";
}

/* ── Reusable UI components ── */

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

export function StudentMini({ student }: { student: any }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-slate-50 shadow-sm">
        <AvatarImage src={student.profileImageUrl} alt={student.fullName} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
          {student.rollNo || "No roll"} {student.class ? `- ${classLabel(student.class)}` : ""}
        </p>
      </div>
    </div>
  );
}

export function MiniMetric({ label, value, active, danger }: { label: string; value: any; active?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/70 px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold ${danger ? "text-rose-600" : active ? "text-[#8127cf]" : "text-[#1d1b20]"}`}>{value}</p>
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
  return <p className="rounded-2xl bg-[#fbf0fe]/60 border border-[#8127cf]/10 p-4 text-sm font-semibold text-ink-muted">{text}</p>;
}

export function TeacherErrorState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-50 text-rose-600">
          <AlertCircle className="h-8 w-8" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">Something went wrong</p>
        <h2 className="mt-2 text-2xl font-bold text-[#1d1b20] tracking-tight">Couldn&apos;t load your workspace</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-ink-muted">
          {error || "We couldn't load your teacher workspace. This may be a permission or connectivity issue."}
        </p>
        <div className="mt-6 inline-block">
          <BrandButton variant="dark" icon={<RefreshCw className="w-4 h-4" />} onClick={onRetry}>
            Try Again
          </BrandButton>
        </div>
      </div>
    </section>
  );
}

export function ModalSkeleton({ fieldRows = 4 }: { fieldRows?: number }) {
  return (
    <div className="space-y-5 animate-skeleton-in">
      <div>
        <SkeletonBlock className="h-3 w-24 mb-2" />
        <SkeletonBlock className="h-12 w-full rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...Array(Math.min(fieldRows, 4))].map((_, i) => (
          <div key={i}>
            <SkeletonBlock className="h-3 w-20 mb-2" />
            <SkeletonBlock className="h-12 w-full rounded-2xl" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-4">
        <SkeletonBlock className="h-4 w-40 rounded-full" />
      </div>
      <div className="flex gap-4 pt-2">
        <SkeletonBlock className="h-14 flex-1 rounded-2xl" />
        <SkeletonBlock className="h-14 flex-[2] rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * The teacher console's dialog shell.
 *
 * This was one of two components in the codebase called `ModalFrame` — the
 * other lives in shared-admin — and they had drifted into different behaviour
 * under the same name. Both now delegate to the single `Modal` in ui/, so the
 * focus trap, scroll lock, layering and mobile sheet are defined once. The
 * teacher-facing prop shape is kept so the call sites in this file read the
 * same as before.
 */
export function ModalFrame({ title, eyebrow, children, onClose, wide = false, footer, dirty = false, dirtyMessage = "You have unsaved changes. Discard them?" }: {
  title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode;
  /** Holds typed-but-unsaved input — closing then asks before discarding. */
  dirty?: boolean;
  dirtyMessage?: string;
}) {
  return (
    <Modal
      title={title}
      eyebrow={eyebrow}
      onClose={onClose}
      size={wide ? "lg" : "sm"}
      footer={footer}
      dirty={dirty}
      dirtyMessage={dirtyMessage}
    >
      {children}
    </Modal>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3 transition-colors hover:bg-white">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-bold text-[#1d1b20]">{value}</span>
    </div>
  );
}

export function FormInput({ label, value, placeholder, type = "text", required, onChange }: { label: string; value: string; placeholder: string; type?: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}{required ? <span className="ml-1 text-rose-500" aria-hidden>*</span> : null}
      </span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/35 focus:bg-white hover:border-[#8127cf]/20" />
    </label>
  );
}

export function FormSelect({ label, value, children, required, onChange }: { label: string; value: string; children: ReactNode; required?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}{required ? <span className="ml-1 text-rose-500" aria-hidden>*</span> : null}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white hover:border-[#8127cf]/20">
        {children}
      </select>
    </label>
  );
}

export function ModalActions({ busy, busyLabel, actionLabel, onClose, onSave, blockedReason }: {
  busy: boolean; busyLabel: string; actionLabel: string; onClose: () => void; onSave: () => void;
  /** Non-empty means the form is not ready: the button is disabled and this
      says exactly what is missing. The dialogs previously left the primary
      action live regardless, so a required field the teacher had not filled in
      was reported as a failed request instead of a visible gap in the form. */
  blockedReason?: string | null;
}) {
  const blocked = Boolean(blockedReason);
  return (
    <div className="space-y-2.5">
      {blocked ? (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2 text-[12px] font-semibold text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {blockedReason}
        </p>
      ) : null}
      <div className="flex gap-4">
        <BrandButton variant="soft" className="flex-1 h-14 hover:bg-rose-50 hover:text-rose-600 transition-all" onClick={onClose}>Cancel</BrandButton>
        <BrandButton
          variant="dark"
          className="flex-[2] h-14"
          onClick={onSave}
          disabled={busy || blocked}
          title={blockedReason || actionLabel}
        >
          {busy ? (<><Loader2 className="w-5 h-5 animate-spin" />{busyLabel}</>) : actionLabel}
        </BrandButton>
      </div>
    </div>
  );
}

export function ConfigField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string>(value === undefined || value === null || Number.isNaN(value) ? "" : String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) {
      setText(value === undefined || value === null || Number.isNaN(value) ? "" : String(value));
    }
  }, [value]);

  return (
    <div>
      <span className="mb-2 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <input type="number" min={0} max={100} value={text}
        onFocus={() => { editing.current = true; }}
        onBlur={() => {
          editing.current = false;
          const n = Number(text);
          const valid = text !== "" && Number.isFinite(n) && n >= 0;
          setText(valid ? String(Math.min(n, 100)) : "0");
          onChange(valid ? Math.min(n, 100) : 0);
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n) && n >= 0 && n <= 100) onChange(n);
        }}
        className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white hover:border-[#8127cf]/20" />
    </div>
  );
}

/* ── Modal: Create Assessment ── */

export function CreateAssessmentModal({ open, classHubs, examForm, creatingExam, onClose, onFormChange, onCreate }: {
  open: boolean; classHubs: any[]; examForm: any; creatingExam: boolean;
  onClose: () => void; onFormChange: (field: string, value: string) => void; onCreate: () => void;
}) {
  const selectedClass = classHubs.find((c: any) => c.id === examForm.classId);
  const subjects = selectedClass?.subjects || [];

  // The three starred fields were decorative: Create stayed live with all of
  // them blank and the server rejected the request, so a missing class read as
  // a failure rather than as a form the teacher had not finished.
  const missing = [
    !examForm.title?.trim() && "a title",
    !examForm.classId && "a class",
    !examForm.term?.trim() && "a term",
  ].filter(Boolean) as string[];
  const blockedReason = missing.length
    ? `Add ${missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`} to continue.`
    : null;

  if (!open) return null;
  return (
    <ModalFrame
      title="Create Assessment"
      eyebrow="Exam / Test setup"
      onClose={onClose}
      dirty={Boolean(examForm.title?.trim() || examForm.term?.trim())}
      dirtyMessage="Discard this assessment without creating it?"
      footer={
        <ModalActions busy={creatingExam} busyLabel="Creating..." actionLabel="Create Assessment"
          onClose={onClose} onSave={onCreate} blockedReason={blockedReason} />
      }
    >
      {/* Enter submits, the way every other short form on the web does. */}
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); if (!blockedReason && !creatingExam) onCreate(); }}
      >
        <FormInput label="Assessment Title" required value={examForm.title} placeholder="e.g. Week 3 Quiz, First Mid Term" onChange={(v) => onFormChange("title", v)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormSelect label="Type" value={examForm.examType} onChange={(v) => onFormChange("examType", v)}>
            <option value="CLASS_TEST">Class Test</option>
            <option value="QUIZ">Quiz</option>
            <option value="MID_TERM">Mid Term</option>
            <option value="FINAL">Final Exam</option>
            <option value="CUSTOM">Custom</option>
          </FormSelect>
          <FormSelect label="Class" required value={examForm.classId} onChange={(v) => onFormChange("classId", v)}>
            <option value="">Select class</option>
            {classHubs.map((cls: any) => (
              <option key={cls.id} value={cls.id}>
                {classLabel(cls)}{cls.inActiveCycle === false ? " (outside active cycle)" : ""}
              </option>
            ))}
          </FormSelect>
        </div>
        <FormInput label="Term" required value={examForm.term} placeholder="e.g. First Term, Annual" onChange={(v) => onFormChange("term", v)} />
        <div>
          <FormSelect label="Subject (optional)" value={examForm.subjectId} onChange={(v) => onFormChange("subjectId", v)}>
            <option value="">All Subjects</option>
            {subjects.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </FormSelect>
          {/* This list is empty until a class is picked. Left unexplained it
              reads as "this class has no subjects". */}
          <p className="mt-1.5 pl-2 text-[11px] font-semibold text-ink-subtle">
            {!examForm.classId
              ? "Pick a class first to choose one of its subjects."
              : subjects.length === 0
                ? "This class has no subjects assigned yet — the assessment will cover all of them."
                : `Leave as All Subjects to mark every subject in ${classLabel(selectedClass)} on one sheet.`}
          </p>
        </div>
        {/* Submits the form on Enter from any field without adding a second
            visible button next to the one in the footer. */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </ModalFrame>
  );
}

/* ── Modal: Grade Weight Config ── */

export function GradeConfigModal({ open, classHubs, selectedGradeClassId, gradeConfig, gradeConfigLoading, gradeConfigSaving, onClose, onClassChange, onConfigChange, onSave }: {
  open: boolean; classHubs: any[]; selectedGradeClassId: string; gradeConfig: Record<string, number>;
  gradeConfigLoading: boolean; gradeConfigSaving: boolean;
  onClose: () => void; onClassChange: (id: string) => void; onConfigChange: (config: Record<string, number>) => void; onSave: () => void;
}) {
  const WEIGHTS = [
    ["quizWeight", "Quiz"],
    ["classTestWeight", "Class Test"],
    ["midTermWeight", "Mid Term"],
    ["finalWeight", "Final Exam"],
  ] as const;

  const weightTotal = WEIGHTS.reduce((sum, [key]) => sum + (Number(gradeConfig[key]) || 0), 0);
  const weightsOk = weightTotal === 100;

  /* The five grade bands have to descend strictly, or a student on 85% is
     graded against whichever band the server happens to test first. The dialog
     never checked, so an A set below a B saved silently and mis-graded a whole
     class.

     The pass mark is deliberately not part of that chain: it is a line drawn
     across the same scale rather than another band, and setting it equal to
     the D threshold — D being the lowest passing grade — is the ordinary
     configuration. It only contradicts itself when it sits *above* D, which
     would award a D to a student the same config counts as failing. */
  const BANDS = [
    ["gradeAplus", "A+"],
    ["gradeA", "A"],
    ["gradeB", "B"],
    ["gradeC", "C"],
    ["gradeD", "D"],
  ] as const;
  const THRESHOLDS = [...BANDS, ["passingPercentage", "Pass"]] as const;

  const outOfOrder = BANDS.findIndex(
    ([key], i) => i > 0 && (Number(gradeConfig[key]) || 0) >= (Number(gradeConfig[BANDS[i - 1][0]]) || 0),
  );
  const passAboveD =
    (Number(gradeConfig.passingPercentage) || 0) > (Number(gradeConfig.gradeD) || 0);

  const blockedReason = !selectedGradeClassId
    ? "Select a class first."
    : !weightsOk
      ? `Weights total ${weightTotal}% — they must add up to exactly 100%.`
      : outOfOrder > 0
        ? `${BANDS[outOfOrder][1]} must be lower than ${BANDS[outOfOrder - 1][1]}.`
        : passAboveD
          ? "The pass mark is above the D threshold, so a student could be graded D and still fail."
          : null;

  /* One click to a valid split. Getting four numbers to land on 100 by hand is
     arithmetic the teacher came here to delegate. */
  const evenSplit = () => {
    const each = Math.floor(100 / WEIGHTS.length);
    const next: Record<string, number> = { ...gradeConfig };
    WEIGHTS.forEach(([key], i) => {
      next[key] = i === WEIGHTS.length - 1 ? 100 - each * (WEIGHTS.length - 1) : each;
    });
    onConfigChange(next);
  };

  if (!open) return null;
  return (
    <ModalFrame
      title="Grade Weight Configuration"
      eyebrow="Final grade calculation"
      onClose={onClose}
      wide
      footer={
        <ModalActions busy={gradeConfigSaving} busyLabel="Saving..." actionLabel="Save Grade Configuration"
          onClose={onClose} onSave={onSave} blockedReason={blockedReason} />
      }
    >
      <div className="mb-4">
        <FormSelect label="Class" value={selectedGradeClassId} onChange={onClassChange}>
          <option value="">Select class</option>
          {classHubs.map((cls: any) => <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>)}
        </FormSelect>
      </div>
      {gradeConfigLoading ? (
        <ModalSkeleton fieldRows={3} />
      ) : selectedGradeClassId ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle">Exam Type Weights</p>
            <button type="button" onClick={evenSplit}
              title="Split 100% evenly across the four exam types"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#fbf0fe] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#8127cf] transition-colors hover:bg-[#8127cf] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
              <RefreshCw className="h-3 w-3" /> Even split
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {WEIGHTS.map(([key, label]) => (
              <ConfigField key={key} label={`${label} Weight (%)`} value={gradeConfig[key]}
                onChange={(v) => onConfigChange({ ...gradeConfig, [key]: v })} />
            ))}
          </div>

          {/* The total used to be a grey line of text that read the same at 87%
              as at 100%, next to a Save button that was live either way. */}
          <div className={cn(
            "rounded-2xl border p-4 transition-colors",
            weightsOk ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70",
          )}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider",
                weightsOk ? "text-emerald-700" : "text-amber-800")}>
                {weightsOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                Total {weightTotal}%
              </span>
              <span className={cn("text-[11px] font-semibold", weightsOk ? "text-emerald-700" : "text-amber-800")}>
                {weightsOk
                  ? "Ready to save"
                  : weightTotal > 100
                    ? `${weightTotal - 100}% over — take it off one of the four`
                    : `${100 - weightTotal}% still to allocate`}
              </span>
            </div>
            <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-white">
              {WEIGHTS.map(([key], i) => {
                const v = Number(gradeConfig[key]) || 0;
                if (!v) return null;
                const shades = ["bg-[#8127cf]", "bg-[#9c48ea]", "bg-[#b876f0]", "bg-[#d2aef7]"];
                return (
                  <span key={key} className={cn("h-full transition-all duration-300", shades[i])}
                    style={{ width: `${Math.min(v, 100)}%` }} />
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#cfc2d6]/10 pt-5">
            <p className="mb-1 text-[9px] font-black uppercase tracking-wider text-ink-subtle">Grade Thresholds</p>
            <p className="mb-3 text-[11px] font-semibold text-ink-subtle">
              The lowest percentage that still earns each grade. Each one must sit below the grade above it.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {THRESHOLDS.map(([key, label], i) => (
                <div key={key} className={cn(
                  (outOfOrder === i || (passAboveD && key === "passingPercentage")) &&
                    "rounded-2xl ring-2 ring-rose-300 ring-offset-2",
                )}>
                  <ConfigField label={label === "Pass" ? "Pass % ≥" : `${label} ≥`} value={gradeConfig[key]}
                    onChange={(v) => onConfigChange({ ...gradeConfig, [key]: v })} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <EmptyInline text="Select a class to configure grade weights." />
      )}
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!selectedGradeClassId) return;
    setDownloadingPdf(true);
    try {
      await downloadPdfFile(`/api/reports/class-grades-pdf?classId=${encodeURIComponent(selectedGradeClassId)}`, "final-grades.pdf");
      toast.success("Final grades PDF downloaded");
    } catch (error: any) {
      toast.error(error?.message || "Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const summary = weightedGradeResult?.length
    ? {
        passed: weightedGradeResult.filter((g: any) => g.passed).length,
        failed: weightedGradeResult.filter((g: any) => !g.passed).length,
        average: Math.round(
          weightedGradeResult.reduce((sum: number, g: any) => sum + (Number(g.overallPercentage) || 0), 0) /
            weightedGradeResult.length,
        ),
      }
    : null;

  if (!open) return null;
  return (
    <ModalFrame
      title="Final Grades"
      eyebrow="Weighted grade calculation"
      onClose={onClose}
      wide
      footer={
        weightedGradeResult?.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold text-ink-muted">
              {weightedGradeResult.length} student{weightedGradeResult.length === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-3">
              <BrandButton variant="soft" icon={downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} onClick={handleDownloadPdf} disabled={downloadingPdf}>
                {downloadingPdf ? "Preparing PDF..." : "Download PDF"}
              </BrandButton>
              <BrandButton variant="dark" icon={generatingReportCards ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                onClick={onGenerateReportCards} disabled={generatingReportCards || reportCardsGenerated}
                title={reportCardsGenerated ? "These grades have already been saved" : "Write these weighted grades to each student's report card"}>
                {generatingReportCards ? "Saving..." : reportCardsGenerated ? "Grades Saved" : "Generate & Save Grades"}
              </BrandButton>
            </div>
          </div>
        ) : null
      }
    >
      <div className="mb-4">
        <FormSelect label="Class" value={selectedGradeClassId} onChange={onClassChange}>
          <option value="">Select class</option>
          {classHubs.map((cls: any) => <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>)}
        </FormSelect>
      </div>

      {weightedGradeLoading ? (
        <ModalSkeleton fieldRows={3} />
      ) : weightedGradeResult?.length ? (
        <>
          {/* A ranked list of forty rows does not tell a teacher how the class
              did. Three numbers above it do. */}
          {summary ? (
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-[#8127cf]/10 bg-[#fbf0fe]/60 px-4 py-3 text-center">
                <p className="text-2xl font-black tabular-nums text-[#8127cf]">{summary.average}%</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">Class average</p>
              </div>
              <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/70 px-4 py-3 text-center">
                <p className="text-2xl font-black tabular-nums text-emerald-700">{summary.passed}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700/80">Passing</p>
              </div>
              <div className={cn(
                "rounded-2xl border px-4 py-3 text-center",
                summary.failed > 0 ? "border-rose-200/60 bg-rose-50/70" : "border-[#cfc2d6]/25 bg-white",
              )}>
                <p className={cn("text-2xl font-black tabular-nums", summary.failed > 0 ? "text-rose-700" : "text-ink-subtle")}>
                  {summary.failed}
                </p>
                <p className={cn("text-[10px] font-black uppercase tracking-wider", summary.failed > 0 ? "text-rose-700/80" : "text-ink-subtle")}>
                  Below pass
                </p>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-2xl border border-[#f3f4f9]">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="bg-[#fbf0fe]/40 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
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
                  return (
                    /* Was a bare <tr onClick>: no role, no tab stop, no Enter.
                       The only route from a grade to that student's report card
                       was unavailable to anyone not using a mouse. */
                    <tr key={grade.studentId} tabIndex={0} role="link"
                      aria-label={`Open the report card for ${grade.studentName}`}
                      title={`Open ${grade.studentName}'s report card`}
                      className="cursor-pointer transition-colors hover:bg-[#fbf0fe]/30 focus-visible:bg-[#fbf0fe]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8127cf]/40"
                      onClick={() => router.push(`/teacher/reports?studentId=${grade.studentId}&classId=${selectedGradeClassId}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/teacher/reports?studentId=${grade.studentId}&classId=${selectedGradeClassId}`);
                        }
                      }}>
                      <td className="px-5 py-4"><span className="text-sm font-bold text-ink-muted">#{grade.rank || i + 1}</span></td>
                      <td className="px-5 py-4"><p className="text-sm font-bold text-[#1d1b20]">{grade.studentName}</p></td>
                      <td className="px-4 py-4 text-center text-sm font-semibold text-ink-muted">{grade.rollNo || "—"}</td>
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

        </>
      ) : selectedGradeClassId ? (
        <div className="space-y-4">
          <EmptyInline text="Click 'View Possible Grades' to calculate weighted grades from your exams." />
          <BrandButton variant="dark" icon={<BarChart3 className="w-4 h-4" />} onClick={() => onGenerate(selectedGradeClassId)}>
            View Possible Grades
          </BrandButton>
        </div>
      ) : (
        <EmptyInline text="Select a class to view final grades." />
      )}
    </ModalFrame>
  );
}

/* ── Modal: Student Detail ── */

export function StudentDetailModal({ student, onClose }: { student: any; exams?: any[]; onClose: () => void }) {
  const router = useRouter();
  const report = student.reportCards?.[0];
  const avatar = student.profileImageUrl;
  const latestMarks = (student.marks || []).slice(0, 8);
  const phone = student.guardianPhone ? String(student.guardianPhone).replace(/\s+/g, "") : "";
  const whatsapp = student.guardianWhatsapp ? String(student.guardianWhatsapp).replace(/[^\d+]/g, "") : phone;

  return (
    <ModalFrame
      title={student.fullName}
      eyebrow="Student profile"
      onClose={onClose}
      wide
      /* The profile was read-only: a teacher who opened it to check on a child
         then had to close it, navigate, and find them again to do anything
         about what they had just read. */
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {phone ? (
              <a href={`tel:${phone}`} title={`Call ${student.guardianName || "guardian"}`}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-2xl border border-[#8127cf]/10 bg-[#fbf0fe] px-4 text-xs font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                <Phone className="h-3.5 w-3.5" /> Call guardian
              </a>
            ) : null}
            {whatsapp ? (
              <a href={`https://wa.me/${whatsapp.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer"
                title={`Message ${student.guardianName || "guardian"} on WhatsApp`}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-2xl border border-[#8127cf]/10 bg-[#fbf0fe] px-4 text-xs font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/25">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <BrandButton variant="soft" icon={<CalendarCheck className="h-4 w-4" />}
              onClick={() => router.push(`/teacher/attendance?classId=${encodeURIComponent(student.class?.id || "")}`)}
              title={`Mark attendance for ${classLabel(student.class)}`}>
              Attendance
            </BrandButton>
            <BrandButton variant="dark" icon={<FileText className="h-4 w-4" />}
              onClick={() => router.push(`/teacher/reports?studentId=${encodeURIComponent(student.id)}&classId=${encodeURIComponent(student.class?.id || "")}`)}
              title={`Open ${student.fullName}'s report card`}>
              Report Card
            </BrandButton>
          </div>
        </div>
      }
    >
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-gradient-to-br from-[#fbf0fe]/80 to-white p-5 sm:flex-row sm:items-center border border-[#8127cf]/10">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <AvatarImage src={avatar} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">Student Record</p>
          <h3 className="mt-1 truncate text-3xl font-bold tracking-tight text-[#1d1b20]">{student.fullName}</h3>
          <p className="mt-2 text-sm font-semibold text-ink-muted">
            {student.rollNo || "No roll number"} &mdash; {classLabel(student.class)}
          </p>
          {student.todayAttendance !== undefined ? (
            <p className="mt-2">
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                student.todayAttendance === "PRESENT" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : student.todayAttendance === "ABSENT" ? "border-rose-200 bg-rose-50 text-rose-700"
                  : student.todayAttendance === "LEAVE" ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-[#cfc2d6]/30 bg-white text-ink-subtle",
              )}>
                {student.todayAttendance === "PRESENT" ? "In today"
                  : student.todayAttendance === "ABSENT" ? "Absent today"
                  : student.todayAttendance === "LEAVE" ? "On leave today"
                  : "Not marked today"}
              </span>
            </p>
          ) : null}
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

export function ReportCardDetailModal({ report, busy, remarkBusy, savingRemarks, onClose, onSend, onGenerateRemarks, onSaveRemarks }: {
  report: any; busy: boolean; remarkBusy: string | null; savingRemarks?: boolean;
  onClose: () => void; onSend: () => void;
  onGenerateRemarks?: (studentId: string, examId: string) => void;
  onSaveRemarks?: (remarks: { en: string; ur: string }) => void | Promise<void>;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [detailReport, setDetailReport] = useState<any>(report);
  const [detailLoading, setDetailLoading] = useState(!report.subjectDistribution);
  const [remarks, setRemarks] = useState({ en: report.remarksEn || "", ur: report.remarksUr || "" });
  const [translatingUr, setTranslatingUr] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const urduTouchedRef = useRef(Boolean(report.remarksUr));
  const translateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateSeq = useRef(0);
  const avatar = report.student?.profileImageUrl;

  useEffect(() => {
    setDetailReport(report);
  }, [report]);

  useEffect(() => {
    let cancelled = false;
    if (report.subjectDistribution) { setDetailLoading(false); return; }
    setDetailLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/reports/${report.id}/detail`);
        const result = JSON.parse(await res.text());
        if (!cancelled && result.reportCard) setDetailReport(result.reportCard);
      } catch { if (!cancelled) toast.error("Failed to load report details"); }
      finally { if (!cancelled) setDetailLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [report.id, report.subjectDistribution]);

  useEffect(() => {
    setRemarks({ en: detailReport.remarksEn || "", ur: detailReport.remarksUr || "" });
    urduTouchedRef.current = Boolean(detailReport.remarksUr);
  }, [detailReport.id, detailReport.remarksEn, detailReport.remarksUr]);

  useEffect(() => {
    return () => {
      if (translateTimer.current) clearTimeout(translateTimer.current);
      translateSeq.current += 1;
    };
  }, []);

  const runUrduTranslation = async (en: string) => {
    const seq = ++translateSeq.current;
    setTranslatingUr(true);
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: en }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Translation failed");
      if (seq === translateSeq.current && !urduTouchedRef.current && result.translation) {
        setRemarks((r) => ({ ...r, ur: result.translation }));
      }
    } catch { /* auto-translation failure is non-critical */ }
    finally {
      if (seq === translateSeq.current) setTranslatingUr(false);
    }
  };

  const handleRemarksEnChange = (en: string) => {
    setRemarks((r) => {
      const next = { ...r, en };
      if (!urduTouchedRef.current) next.ur = transliterateToUrdu(en);
      return next;
    });
    if (translateTimer.current) clearTimeout(translateTimer.current);
    if (!urduTouchedRef.current && en.trim().length >= 4) {
      translateTimer.current = setTimeout(() => runUrduTranslation(en.trim()), 800);
    }
  };

  const handleRemarksUrChange = (ur: string) => {
    urduTouchedRef.current = true;
    if (translateTimer.current) clearTimeout(translateTimer.current);
    translateSeq.current += 1;
    setTranslatingUr(false);
    setRemarks((r) => ({ ...r, ur }));
  };

  const handleTranslateUrdu = () => {
    urduTouchedRef.current = false;
    if (translateTimer.current) clearTimeout(translateTimer.current);
    const en = remarks.en.trim();
    setRemarks((r) => ({ ...r, ur: transliterateToUrdu(en) }));
    if (en.length >= 4) runUrduTranslation(en);
  };

  const handleDownloadPdf = async () => {
    const id = viewReport?.id;
    if (!id) return;
    setDownloadingPdf(true);
    try {
      await downloadReportCardPdf(id, `${viewReport.student?.fullName || "report-card"}.pdf`);
      toast.success("Report card PDF downloaded");
    } catch (error: any) {
      toast.error(error?.message || "Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const viewReport = detailReport || report;
  const campusLogo = viewReport.campus?.logoUrl || viewReport.campus?.school?.logoUrl || null;
  const campusContactLine = [
    viewReport.campus?.school?.name,
    viewReport.campus?.name,
    viewReport.campus?.city,
    viewReport.campus?.address,
    viewReport.campus?.school?.phone,
    viewReport.campus?.school?.contactEmail,
    viewReport.campus?.school?.website,
  ].filter(Boolean).join(" · ");

  /* Remarks live in local state until Save Remarks is pressed. Closing the
     dialog — including by a stray click on the backdrop — used to drop a page
     of typed feedback without a word. */
  const remarksDirty =
    remarks.en !== (viewReport.remarksEn || "") || remarks.ur !== (viewReport.remarksUr || "");

  return (
    <>
    <ModalFrame
      title={`${viewReport.student?.fullName || "Student"} \u2014 Report Card`}
      eyebrow="Academic result"
      onClose={onClose}
      wide
      dirty={Boolean(onSaveRemarks) && remarksDirty}
      dirtyMessage="You have unsaved remarks. Close and discard them?"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {remarksDirty && onSaveRemarks ? (
            <span className="mr-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-amber-800">
              <AlertCircle className="h-3.5 w-3.5" /> Unsaved remarks
            </span>
          ) : null}
          {viewReport.exam?.id && viewReport.student?.id && onGenerateRemarks ? (
            <BrandButton variant="soft" icon={<BrainCircuit className="w-4 h-4" />}
              onClick={() => onGenerateRemarks(viewReport.student.id, viewReport.exam.id)}
              disabled={remarkBusy === viewReport.student.id}
              title="Draft remarks for this student with AI">
              {remarkBusy === viewReport.student.id ? "Generating..." : "Generate Remarks"}
            </BrandButton>
          ) : null}
          <BrandButton variant="soft" icon={downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} onClick={handleDownloadPdf} disabled={downloadingPdf}>
            {downloadingPdf ? "Preparing PDF..." : "Download PDF"}
          </BrandButton>
          {viewReport.isSent ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Already Sent
            </span>
          ) : (
            /* Sending mails a family. It fired on a single click with no
               confirmation, and there is no way to unsend it afterwards. */
            <BrandButton variant="dark" icon={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              onClick={() => setConfirmSend(true)} disabled={busy}
              title="Email this report card to the student's guardian">
              {busy ? "Sending..." : "Send to Guardian"}
            </BrandButton>
          )}
        </div>
      }
    >
      <div ref={printRef} id="report-card-print" className="space-y-6">
        {viewReport.campus ? (
          <div className="flex items-center gap-3 rounded-[30px] border border-[#8127cf]/10 bg-gradient-to-br from-[#fbf0fe]/80 to-white p-4">
            {campusLogo ? (
              <img src={campusLogo} alt="Campus logo" className="h-14 w-14 shrink-0 rounded-2xl object-cover border border-[#cfc2d6]/25" />
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-black text-[#1d1b20]">{viewReport.campus.school?.name || viewReport.campus.name}</p>
              <p className="truncate text-[11px] font-semibold text-ink-muted">{campusContactLine}</p>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-5 rounded-[30px] bg-gradient-to-br from-[#fbf0fe]/80 to-white p-5 sm:flex-row sm:items-center border border-[#8127cf]/10">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[28px] border-4 border-white bg-white shadow-xl">
            <AvatarImage src={avatar} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8127cf]">{viewReport.exam?.title || "Final Grade"} &middot; {viewReport.exam?.term || ""}</p>
            <h3 className="mt-1 truncate text-3xl font-bold tracking-tight text-[#1d1b20]">{viewReport.student?.fullName || "Student"}</h3>
            <p className="mt-2 text-sm font-semibold text-ink-muted">
              {viewReport.student?.rollNo ? `Roll No: ${viewReport.student.rollNo}` : ""} &middot; {classLabel(viewReport.student?.class)}
            </p>
            <p className="mt-1 text-[11px] font-medium text-ink-muted">Generated {formatDate(viewReport.generatedAt)}</p>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-center">
              <p className="text-4xl font-bold text-[#8127cf]">{Math.round(viewReport.percentage || 0)}%</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Percentage</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-[#1d1b20]">{viewReport.grade || "\u2014"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Grade</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniMetric label="Roll No" value={viewReport.student?.rollNo || "N/A"} active />
          <MiniMetric label="Class" value={classLabel(viewReport.student?.class)} />
          <MiniMetric label="Status" value={<StatusPill status={viewReport.status} />} />
          {/* Rendered the raw enum, so this tile read "NOT_SENT" in a column
              of title-cased values. formatStatus already existed for this. */}
          <MiniMetric label="Delivery" value={formatStatus(viewReport.deliveryStatus)} />
        </div>

        <div className="rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
          <PanelTitle icon={BarChart3} title="Final Result" />
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 text-center transition-colors hover:border-[#8127cf]/20">
              <p className="text-2xl font-bold text-[#1d1b20]">{viewReport.totalMarks || "\u2014"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Total Marks</p>
            </div>
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 text-center transition-colors hover:border-[#8127cf]/20">
              <p className="text-2xl font-bold text-[#8127cf]">{viewReport.obtainedMarks || "\u2014"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Obtained</p>
            </div>
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 text-center transition-colors hover:border-[#8127cf]/20">
              <p className="text-2xl font-bold text-[#8127cf]">{Math.round(viewReport.percentage || 0)}%</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Percentage</p>
            </div>
            <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4 text-center transition-colors hover:border-[#8127cf]/20">
              <p className={`text-2xl font-bold ${viewReport.passed !== false ? "text-[#1d1b20]" : "text-rose-600"}`}>{viewReport.grade || "\u2014"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Grade</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
          <PanelTitle icon={BarChart3} title="Marks Distribution" />
          {viewReport.weightConfig ? (
            <p className="mt-3 text-[11px] font-semibold text-ink-muted">
              Weights &mdash; Quiz {viewReport.weightConfig.quizWeight}% &middot; Class Test {viewReport.weightConfig.classTestWeight}% &middot; Mid Term {viewReport.weightConfig.midTermWeight}% &middot; Final {viewReport.weightConfig.finalWeight}%
            </p>
          ) : null}
          {detailLoading ? (
            <div className="mt-4 space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <SkeletonBlock className="h-4 w-32 rounded-xl" />
                    <div className="flex items-center gap-2">
                      <SkeletonBlock className="h-6 w-20 rounded-full" />
                      <SkeletonBlock className="h-6 w-24 rounded-full" />
                    </div>
                  </div>
                  <SkeletonBlock className="h-24 rounded-2xl" />
                </div>
              ))}
            </div>
          ) : (
            <>
          {viewReport.subjectDistribution?.length ? (
            <div className="mt-4 space-y-5">
              {viewReport.subjectDistribution.map((subject: any) => (
                <div key={subject.subjectId}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-[#1d1b20]">{subject.subjectName || "Subject"}</p>
                  </div>
                  {subject.exams?.length ? (
                    <div className="overflow-x-auto rounded-2xl border border-[#cfc2d6]/10 bg-white">
                      <table className="w-full min-w-[520px] text-left">
                        <thead>
                          <tr className="bg-[#fbf0fe]/40 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                            <th className="px-4 py-2.5">Exam</th>
                            <th className="px-4 py-2.5 text-center">Weight</th>
                            <th className="px-4 py-2.5 text-center">Marks</th>
                            <th className="px-4 py-2.5 text-center">%</th>
                            <th className="px-4 py-2.5 text-center">Contribution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f3f4f9]">
                          {subject.exams.map((exam: any) => (
                            <tr key={exam.examId} className="hover:bg-[#fbf0fe]/20 transition-colors">
                              <td className="px-4 py-2.5 text-sm font-semibold text-[#1d1b20]">{exam.examTitle}</td>
                              <td className="px-4 py-2.5 text-center text-sm font-semibold text-[#8127cf]">{exam.weight}%</td>
                              <td className="px-4 py-2.5 text-center text-sm font-semibold text-[#1d1b20]">{exam.obtainedMarks}/{exam.totalMarks}</td>
                              <td className="px-4 py-2.5 text-center text-sm font-semibold text-[#1d1b20]">{exam.percentage}%</td>
                              <td className="px-4 py-2.5 text-center text-sm font-semibold text-[#8127cf]">{Math.round((exam.contribution || 0) * 10) / 10}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (<div className="mt-2"><EmptyInline text="No exam records for this subject." /></div>)}
                </div>
              ))}
            </div>
          ) : (<div className="mt-4"><EmptyInline text="Exam breakdown not available." /></div>)}
          {viewReport.overall ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border border-[#cfc2d6]/10 px-4 py-3">
              <p className="text-sm font-bold text-[#1d1b20]">Overall Weighted Result</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#fbf0fe] px-3 py-1 text-[11px] font-bold text-[#8127cf]">{viewReport.overall.overallPercentage}%</span>
                <span className="rounded-full bg-white border border-[#cfc2d6]/10 px-3 py-1 text-[11px] font-bold text-[#1d1b20]">{viewReport.overall.overallGrade}</span>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${viewReport.overall.passed ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {viewReport.overall.passed ? "Pass" : "Fail"}
                </span>
              </div>
            </div>
          ) : null}
            </>
          )}
        </div>

        <div className="rounded-3xl bg-[#fbf0fe]/40 border border-[#cfc2d6]/10 p-5 transition-colors hover:bg-[#fbf0fe]/60">
          <PanelTitle icon={FileText} title="Remarks" />
          {onSaveRemarks ? (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">English</p>
                <Textarea value={remarks.en} onChange={(e) => handleRemarksEnChange(e.target.value)} rows={3} className="mt-1.5 text-sm" placeholder="Write remarks for this student..." />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Urdu</p>
                  <div className="flex items-center gap-1.5">
                    {translatingUr ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#8127cf]">
                        <Loader2 className="h-3 w-3 animate-spin" /> Translating...
                      </span>
                    ) : null}
                    <button type="button"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-[#8127cf] hover:bg-[#fbf0fe] transition-colors"
                      onClick={handleTranslateUrdu} title="Auto-convert from English remarks">
                      <Languages className="h-3 w-3" /> Auto-translate
                    </button>
                  </div>
                </div>
                <div className="mt-1.5">
                  <UrduInput value={remarks.ur} onChange={handleRemarksUrChange} textarea placeholder="اردو میں نوٹس لکھیں..." />
                </div>
                {!remarks.ur && remarks.en ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-ink-subtle">
                    <RefreshCw className="h-3 w-3" /> Urdu auto-translates from the English remark as you type.
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end">
                <BrandButton variant="dark" icon={savingRemarks ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  onClick={() => onSaveRemarks({ en: remarks.en, ur: remarks.ur })} disabled={savingRemarks}>
                  {savingRemarks ? "Saving..." : "Save Remarks"}
                </BrandButton>
              </div>
            </div>
          ) : viewReport.remarksEn || viewReport.remarksUr ? (
            <div className="mt-4 space-y-3">
              {viewReport.remarksEn ? (
                <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 px-4 py-3 transition-colors hover:border-[#8127cf]/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">English</p>
                  <p className="mt-1 text-sm font-semibold text-[#1d1b20]">{viewReport.remarksEn}</p>
                </div>
              ) : null}
              {viewReport.remarksUr ? (
                <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 px-4 py-3 transition-colors hover:border-[#8127cf]/20" dir="rtl">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Urdu</p>
                  <p className="mt-1 text-sm font-semibold text-[#1d1b20]">{viewReport.remarksUr}</p>
                </div>
              ) : null}
            </div>
          ) : (<div className="mt-4"><EmptyInline text="No remarks drafted yet." /></div>)}
        </div>
      </div>
    </ModalFrame>

    <ConfirmAction
      open={confirmSend}
      tone="primary"
      title="Send this report card?"
      description={`${viewReport.student?.fullName || "This student"}'s guardian will be emailed the result for ${viewReport.exam?.title || "this assessment"}. A sent report card cannot be recalled.`}
      detail={
        remarksDirty ? (
          <span className="text-amber-800">
            Your remarks are not saved yet — save them first if they should go out with this report.
          </span>
        ) : (
          <span>
            {Math.round(viewReport.percentage || 0)}% · Grade {viewReport.grade || "—"} · {classLabel(viewReport.student?.class)}
          </span>
        )
      }
      confirmLabel="Send to guardian"
      busy={busy}
      onConfirm={() => { setConfirmSend(false); onSend(); }}
      onCancel={() => setConfirmSend(false)}
    />
    </>
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

export function StudentsSkeleton() {
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#8127cf]/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-36" />
          </div>
          <SkeletonBlock className="h-9 w-48 mb-2" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 bg-[#fbf0fe]/20 space-y-6">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SkeletonBlock className="h-12 w-full sm:w-96 rounded-2xl" />
          <SkeletonBlock className="h-12 w-full sm:w-40 rounded-2xl" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
        {/* Student cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-[28px] border border-[#cfc2d6]/10 bg-white p-5 shadow-lg">
              <div className="flex items-start gap-4 mb-4">
                <SkeletonBlock className="h-14 w-14 rounded-2xl shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <SkeletonBlock className="h-4 w-3/4" />
                  <SkeletonBlock className="h-3 w-2/4" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <SkeletonBlock className="h-14 rounded-xl" />
                <SkeletonBlock className="h-14 rounded-xl" />
              </div>
              <SkeletonBlock className="h-12 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TimetableSkeleton({ weekendDays = [] }: { weekendDays?: number[] }) {
  const dayCount = weekendDays.length ? 6 - weekendDays.filter((d) => d >= 1 && d <= 6).length : 6;
  const dayCols = `w-16 ${[...Array(dayCount)].map(() => "minmax(0,1fr)").join(" ")}`;
  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 min-h-[100vh] relative overflow-hidden flex flex-col">
      {/* Header card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white border-b border-[#cfc2d6]/12 shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-3 w-28" />
          </div>
          <SkeletonBlock className="h-9 w-56 mb-2" />
          <SkeletonBlock className="h-4 w-80" />
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20 space-y-6">
        <div className="rounded-[24px] bg-gradient-to-r from-[#8127cf]/5 to-[#fbf0fe]/50 border border-[#8127cf]/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <SkeletonBlock className="h-7 w-7 rounded-lg" />
            <SkeletonBlock className="h-4 w-36" />
          </div>
          <div className="flex flex-wrap gap-2">
            {[...Array(3)].map((_, i) => (
              <SkeletonBlock key={i} className="h-8 w-40 rounded-xl" />
            ))}
          </div>
        </div>

        <div className="rounded-[26px] overflow-hidden border border-[#cfc2d6]/10 bg-white shadow-sm flex-1 flex flex-col">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#cfc2d6]/10">
            <SkeletonBlock className="h-6 w-6 rounded-lg" />
            <SkeletonBlock className="h-4 w-44" />
          </div>
          <div className="px-5 py-3 flex flex-wrap gap-1.5">
            {[...Array(4)].map((_, i) => (
              <SkeletonBlock key={i} className="h-6 w-20 rounded-lg" />
            ))}
          </div>
          <div className="overflow-hidden border-t border-[#f3f4f9] flex-1">
            <div className="grid border-b border-[#f3f4f9]" style={{ gridTemplateColumns: `70px repeat(${dayCount}, 1fr)` }}>
              <div className="p-2" />
              {[...Array(dayCount)].map((_, i) => (
                <div key={i} className="flex items-center justify-center py-2.5 border-l border-[#f3f4f9]">
                  <SkeletonBlock className="h-3 w-10 rounded-md" />
                </div>
              ))}
            </div>
            {[...Array(6)].map((_, p) => (
              <div key={p} className="grid border-b border-[#f3f4f9] last:border-b-0" style={{ gridTemplateColumns: `70px repeat(${dayCount}, 1fr)` }}>
                <div className="flex flex-col items-center justify-center p-1.5 border-r border-[#f3f4f9]">
                  <SkeletonBlock className="h-3 w-6 rounded-md" />
                  <SkeletonBlock className="h-2 w-8 rounded-md mt-1" />
                </div>
                {[...Array(dayCount)].map((_, d) => (
                  <div key={d} className="border-l border-[#f3f4f9] p-1.5">
                    <SkeletonBlock className="h-12 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Hook to load teacher dashboard data ── */

export function useTeacherData() {
  const { data, loading, error, refetch } = useTeacherDataContext();
  return { data, loading, error, loadData: refetch };
}
