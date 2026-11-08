"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useCountLabel } from "@/components/locale/use-count-label";
import { toast } from "@/components/ui/toast";
import {
  AlertCircle, Award, BarChart3, BrainCircuit, CalendarCheck, CheckCircle2, Download, FileText, Languages, Loader2, MessageCircle, Phone, RefreshCw, Save, Send, Star, TrendingDown, UserRound, Users,
} from "lucide-react";
import { useTeacherData as useTeacherDataContext } from "@/app/teacher/teacher-data-context";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UrduInput } from "@/components/ui/urdu-input";
import { downloadPdfFile, downloadReportCardPdf } from "@/lib/download";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { AvatarImage } from "@/components/ui/avatar-image";
import { SkeletonBar as SkeletonBlock } from "@/components/ui/skeleton";
import { Select as SystemSelect } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState as EmptyStateUi } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { WorkspacePageSkeleton } from "@/components/teacher/teacher-page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";
import { DeskPill, DeskStats, StatTile, type DeskTone } from "@/components/ui/desk";
import type { ModalTone } from "@/components/ui/modal";
import type { LucideIcon } from "lucide-react";


/* ── Pure helpers ── */

export function classLabel(item: any) {
  if (!item) return "Unassigned";
  const base = [item.name, item.section].filter(Boolean).join(" ");
  // A class name/section is reused every academic year (e.g. two distinct
  // "QA Grade 5 A" classes, one per year) — without the year, teacher-facing
  // dropdowns show duplicate, indistinguishable options for different classes.
  return item.academicYear ? `${base} - ${item.academicYear}` : base;
}

/** Workflow states in words (EN UI keys; StatusPill translates them). Unknown states read in sentence case. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", DRAFT: "Draft", ACTIVE: "Active", MARKS_ENTRY: "Marks entry", SUBMITTED: "Submitted", LOCKED: "Locked",
  REVIEWED: "Reviewed", PRINCIPAL_REVIEWED: "Reviewed by academic lead", APPROVED: "Approved", PUBLISHED: "Published",
  SENT: "Sent", NOT_SENT: "Not sent", QUEUED: "Queued", DELIVERED: "Delivered", FAILED: "Failed", BLOCKED: "Blocked",
  CORRECTED: "Corrected", REJECTED: "Rejected", CLOSED: "Closed", CANCELLED: "Cancelled", GENERATED: "Generated",
  PRESENT: "Present", ABSENT: "Absent", LEAVE: "Leave", LATE: "Late", EXCUSED: "Excused",
};

export function formatStatus(status?: string) {
  const key = status || "PENDING";
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  const words = key.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function todayIso() {
  // Local calendar date, not UTC. toISOString() rolls the day over for any
  // timezone ahead of UTC, which silently pointed attendance marking at
  // tomorrow. "en-CA" is the locale that formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA");
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  // The document language (set by the LocaleProvider), never the browser's default locale (F23).
  const lang = typeof document !== "undefined" ? document.documentElement.lang || undefined : undefined;
  return new Date(value).toLocaleDateString(lang, { month: "short", day: "numeric", year: "numeric" });
}

export function statusTone(status?: string) {
  if (["ACTIVE", "MARKS_ENTRY", "PUBLISHED", "SENT", "APPROVED", "PRESENT"].includes(status || "")) return "bg-status-success-surface text-status-success-text";
  if (["LOCKED", "PRINCIPAL_REVIEWED", "REVIEWED", "LEAVE"].includes(status || "")) return "bg-brand-50 text-primary";
  if (["ABSENT", "FAILED", "BLOCKED"].includes(status || "")) return "bg-status-error-surface text-status-error-text";
  return "bg-muted text-ink";
}

/* ── Reusable UI components ── */

/** `title` is an EN UI key (translated here). */
export function PanelTitle({ icon: Icon, title }: { icon: any; title: string }) {
  const ui = useUiText();
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-bold tracking-tight text-ink-strong">{ui(title)}</h3>
    </div>
  );
}

export function StudentMini({ student }: { student: any }) {
  const ui = useUiText();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 border-card bg-surface-subtle shadow-sm">
        <AvatarImage src={student.profileImageUrl} name={student.fullName} alt={student.fullName} initialsClassName="text-2xs" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink-strong">{student.fullName}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-ink-subtle">
          <bdi>{student.rollNo || ui("No roll number")}</bdi> {student.class ? <>- <bdi>{classLabel(student.class)}</bdi></> : null}
        </p>
      </div>
    </div>
  );
}

/** `label` is an EN UI key (translated here). */
export function MiniMetric({ label, value, active, danger }: { label: string; value: any; active?: boolean; danger?: boolean }) {
  const ui = useUiText();
  return (
    <div className="rounded-2xl bg-brand-50/70 px-3.5 py-3">
      <p className="text-2xs font-semibold text-ink-subtle">{ui(label)}</p>
      <p className={`mt-0.5 truncate text-lg font-bold tabular-nums ${danger ? "text-status-error-text" : active ? "text-primary" : "text-ink-strong"}`}>{value}</p>
    </div>
  );
}

/** The desk-kit tone a record status reads in (the same buckets as `statusTone`, plus "waiting" states in amber). */
export function statusDeskTone(status?: string): DeskTone {
  if (["ACTIVE", "MARKS_ENTRY", "PUBLISHED", "SENT", "APPROVED", "PRESENT"].includes(status || "")) return "success";
  if (["LOCKED", "PRINCIPAL_REVIEWED", "REVIEWED", "LEAVE"].includes(status || "")) return "brand";
  if (["ABSENT", "FAILED", "BLOCKED"].includes(status || "")) return "danger";
  if (["DRAFT", "PENDING", "PENDING_REVIEW", "SUBMITTED"].includes(status || "")) return "warning";
  return "neutral";
}

export function StatusPill({ status }: { status?: string }) {
  const ui = useUiText();
  return <DeskPill tone={statusDeskTone(status)} className="shrink-0">{ui(formatStatus(status))}</DeskPill>;
}

/** `text` is an EN UI key (translated here). */
export function EmptyInline({ text }: { text: string }) {
  const ui = useUiText();
  return <EmptyStateUi size="sm" title={ui(text)} />;
}

export function TeacherErrorState({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const ui = useUiText();
  return (
    // Directly in the shell's one page card (no panel of its own), the same shape as the family and learner consoles.
    <section className="flex flex-1 flex-col items-center justify-center p-4 sm:p-8">
      <ErrorState
        variant="page"
        title={ui("Couldn't load your workspace")}
        description={error ? ui(error) : ui("We couldn't load your teacher workspace. Check your connection, then try again. If it keeps happening, ask your school admin to confirm your teacher access.")}
        onRetry={onRetry}
        retryLabel={ui("Try again")}
      />
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
      <div className="rounded-2xl bg-brand-50/40 border border-edge/10 p-4">
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
export function ModalFrame({ title, eyebrow, subtitle, icon, avatar, chips, tone, children, onClose, wide = false, footer, dirty = false, dirtyMessage = "You have unsaved changes. Discard them?" }: {
  title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode;
  /** One plain line under the title; the header's icon tile (or a photo) and its colour. */
  subtitle?: ReactNode; icon?: LucideIcon; avatar?: ReactNode; chips?: ReactNode; tone?: ModalTone;
  /** Holds typed-but-unsaved input — closing then asks before discarding. */
  dirty?: boolean;
  dirtyMessage?: string;
}) {
  return (
    <Modal
      title={title}
      eyebrow={eyebrow}
      subtitle={subtitle}
      icon={icon}
      avatar={avatar}
      chips={chips}
      tone={tone}
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

/** `label` is an EN UI key or already-formatted data (a date, a subject name); keys are translated here. */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const ui = useUiText();
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-card/70 px-4 py-3 transition-colors hover:bg-card">
      <span className="text-2xs font-semibold text-ink-muted">{ui(label)}</span>
      <span className="min-w-0 truncate text-end text-sm font-bold text-ink-strong">{value}</span>
    </div>
  );
}

export function FormSelect({ label, value, children, required, onChange }: { label: string; value: string; children: ReactNode; required?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="sk-field-label">
        {label}{required ? <span className="ms-1 text-status-error-text" aria-hidden>*</span> : null}
      </span>
      <SystemSelect value={value} onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full px-4">
        {children}
      </SystemSelect>
    </label>
  );
}

/* ── Modal: Final grades preview ── */

/**
 * Weighted final grades for one of the teacher's classes — a preview and a PDF, never a write.
 *
 * Generating final grades publishes a FINAL exam and report cards for the whole class, which is the
 * academic lead's decision (M61, G33: the API refuses a teacher), so this dialog no longer offers it.
 */
export function FinalGradesModal({ open, classHubs, selectedGradeClassId, weightedGradeResult, weightedGradeLoading, weightedGradeError = null, onClose, onClassChange, onGenerate }: {
  open: boolean; classHubs: any[]; selectedGradeClassId: string;
  weightedGradeResult: any[] | null; weightedGradeLoading: boolean;
  /** A failed preview load (EN key or server sentence), shown inline with a retry (R4). */
  weightedGradeError?: string | null;
  onClose: () => void; onClassChange: (id: string) => void; onGenerate: (classId: string) => void;
}) {
  const router = useRouter();
  const ui = useUiText();
  const count = useCountLabel();
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!selectedGradeClassId) return;
    setDownloadingPdf(true);
    try {
      await downloadPdfFile(`/api/reports/class-grades-pdf?classId=${encodeURIComponent(selectedGradeClassId)}`, "final-grades.pdf");
      toast.success(ui("Final grades PDF downloaded."));
    } catch (error) {
      toast.error(error);
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

  const openReport = (grade: any) => router.push(`/teacher/reports?studentId=${encodeURIComponent(grade.studentId)}&classId=${encodeURIComponent(selectedGradeClassId)}`);

  if (!open) return null;
  return (
    <Modal
      title={ui("Final grades preview")}
      eyebrow={ui("Weighted grades")}
      icon={BarChart3}
      subtitle={ui("A preview from your marks. Your academic lead generates the final grades and report cards.")}
      size="lg"
      onClose={onClose}
      footer={
        weightedGradeResult?.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold text-ink-muted">{count(weightedGradeResult.length, "pupil")}</p>
            <Button variant="outline" type="button" onClick={handleDownloadPdf} loading={downloadingPdf}>
              {downloadingPdf ? null : <Download aria-hidden="true" />}
              {ui("Download PDF")}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="mb-4">
        <FormSelect label={ui("Class")} value={selectedGradeClassId} onChange={onClassChange}>
          <option value="">{ui("Select class")}</option>
          {classHubs.map((cls: any) => <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>)}
        </FormSelect>
      </div>

      {weightedGradeLoading ? (
        <ModalSkeleton fieldRows={3} />
      ) : weightedGradeError && selectedGradeClassId ? (
        <ErrorState
          title={ui("Couldn't load the grades preview")}
          description={ui(weightedGradeError)}
          onRetry={() => onGenerate(selectedGradeClassId)}
          retryLabel={ui("Try again")}
        />
      ) : weightedGradeResult?.length ? (
        <>
          {/* A ranked list of forty rows does not tell a teacher how the class
              did. Three numbers above it do. */}
          {summary ? (
            <DeskStats className="mb-4">
              <StatTile index={0} icon={BarChart3} tone="brand" label={ui("Class average")} value={<bdi>{summary.average}%</bdi>} />
              <StatTile index={1} icon={Award} tone="success" label={ui("Passing")} value={<bdi>{summary.passed}</bdi>} />
              <StatTile index={2} icon={TrendingDown} tone={summary.failed > 0 ? "danger" : "neutral"} label={ui("Below pass")} value={<bdi>{summary.failed}</bdi>} />
            </DeskStats>
          ) : null}
          <div className="overflow-x-auto rounded-2xl border border-muted">
            <table className="w-full min-w-[600px] text-start">
              <thead>
                <tr className="bg-brand-50/40 text-2xs font-semibold text-ink-muted">
                  <th className="px-5 py-4 text-start">{ui("Rank")}</th>
                  <th className="px-5 py-4 text-start">{ui("Pupil")}</th>
                  <th className="px-4 py-4 text-center">{ui("Roll number")}</th>
                  <th className="px-4 py-4 text-center">{ui("Percentage")}</th>
                  <th className="px-4 py-4 text-center">{ui("Grade")}</th>
                  <th className="px-4 py-4 text-center">{ui("Result")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted">
                {weightedGradeResult.map((grade: any, i: number) => (
                  <tr key={grade.studentId} tabIndex={0} role="link"
                    aria-label={ui("Open the report card for {0}", [grade.studentName])}
                    className="cursor-pointer transition-colors hover:bg-brand-50/30 focus-inset"
                    onClick={() => openReport(grade)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openReport(grade);
                      }
                    }}>
                    <td className="px-5 py-4"><bdi className="text-sm font-bold text-ink-muted">#{grade.rank || i + 1}</bdi></td>
                    <td className="px-5 py-4"><bdi className="text-sm font-bold text-ink-strong">{grade.studentName}</bdi></td>
                    <td className="px-4 py-4 text-center text-sm font-medium tabular-nums text-ink-muted"><bdi>{grade.rollNo || "—"}</bdi></td>
                    <td className="px-4 py-4 text-center"><bdi className="text-lg font-bold text-primary">{grade.overallPercentage}%</bdi></td>
                    <td className="px-4 py-4 text-center"><bdi className="rounded-full border border-border-subtle bg-card px-3 py-1 text-2xs font-bold text-ink-strong">{grade.overallGrade}</bdi></td>
                    <td className="px-4 py-4 text-center">
                      <Badge variant={grade.passed ? "success" : "danger"} size="sm" dot>
                        {grade.passed ? ui("Pass") : ui("Below pass")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : selectedGradeClassId ? (
        <EmptyStateUi
          size="sm"
          icon={BarChart3}
          title={ui("See this class's weighted grades")}
          description={ui("The preview weights your locked tests by the school's grading rules.")}
          action={
            <Button type="button" onClick={() => onGenerate(selectedGradeClassId)}>
              <BarChart3 aria-hidden="true" /> {ui("Show grades")}
            </Button>
          }
        />
      ) : (
        <EmptyInline text={ui("Select a class to preview its final grades.")} />
      )}
    </Modal>
  );
}

/* ── Modal: Student Detail ── */

export function StudentDetailModal({ student, onClose }: { student: any; exams?: any[]; onClose: () => void }) {
  const router = useRouter();
  // §4.5.11 (G14): a link into a module the school turned off for teachers is not offered.
  const access = useConsoleAccess();
  const canAttendance = access.leafVisible("teacher", "attendance");
  const canReports = access.leafVisible("teacher", "report-cards");
  const report = student.reportCards?.[0];
  const avatar = student.profileImageUrl;
  const latestMarks = (student.marks || []).slice(0, 8);
  const phone = student.guardianPhone ? String(student.guardianPhone).replace(/\s+/g, "") : (student.guardianWhatsapp ? String(student.guardianWhatsapp).replace(/[^\d+]/g, "") : "");
  const ui = useUiText();

  return (
    <ModalFrame
      title={student.fullName}
      eyebrow={ui("Pupil profile")}
      icon={UserRound}
      onClose={onClose}
      wide
      /* One primary contact route: a message on the school record (D6). A phone call stays as a
         quieter secondary; the WhatsApp deep link is gone — conversations belong in Messages. */
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Link href="/messages" className={buttonVariants({ variant: "default" })}>
              <MessageCircle aria-hidden="true" /> {ui("Message guardian")}
            </Link>
            {phone ? (
              <a href={`tel:${phone}`} className={buttonVariants({ variant: "outline" })} aria-label={ui("Call {0}", [student.guardianName || ui("guardian")])}>
                <Phone aria-hidden="true" /> {ui("Call")}
              </a>
            ) : null}
          </div>
          {canAttendance || canReports ? <div className="flex flex-wrap gap-2">
            {canAttendance ? <Button variant="outline" type="button"
              onClick={() => router.push(`/teacher/attendance?classId=${encodeURIComponent(student.class?.id || "")}`)}>
              <CalendarCheck aria-hidden="true" /> {ui("Attendance")}
            </Button> : null}
            {canReports ? <Button variant="outline" type="button"
              onClick={() => router.push(`/teacher/reports?studentId=${encodeURIComponent(student.id)}&classId=${encodeURIComponent(student.class?.id || "")}`)}>
              <FileText aria-hidden="true" /> {ui("Report card")}
            </Button> : null}
          </div> : null}
        </div>
      }
    >
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-gradient-to-br from-brand-50/80 to-card p-5 sm:flex-row sm:items-center border border-primary/10">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-card bg-card shadow-xl">
          <AvatarImage src={avatar} name={student.fullName} initialsClassName="text-3xl" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold text-primary">{ui("Pupil record")}</p>
          <h3 className="mt-1 truncate text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl"><bdi>{student.fullName}</bdi></h3>
          <p className="mt-2 text-sm font-medium text-ink-muted">
            <bdi>{student.rollNo || ui("No roll number")}</bdi> — <bdi>{classLabel(student.class)}</bdi>
          </p>
          {student.todayAttendance !== undefined ? (
            <p className="mt-2">
              <DeskPill tone={student.todayAttendance === "PRESENT" ? "success" : student.todayAttendance === "ABSENT" ? "danger" : student.todayAttendance === "LEAVE" ? "warning" : "neutral"}>
                {student.todayAttendance === "PRESENT" ? ui("In today")
                  : student.todayAttendance === "ABSENT" ? ui("Absent today")
                  : student.todayAttendance === "LEAVE" ? ui("On leave today")
                  : ui("Not marked today")}
              </DeskPill>
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniMetric label="Roll number" value={<bdi>{student.rollNo || "—"}</bdi>} active />
        <MiniMetric label="Class" value={<bdi>{classLabel(student.class)}</bdi>} />
        <MiniMetric label="Latest result" value={<bdi>{report ? report.grade || `${Math.round(report.percentage || 0)}%` : "—"}</bdi>} />
      </div>
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-brand-50/40 border border-edge/10 p-5 transition-colors hover:bg-brand-50/60">
          <PanelTitle icon={Users} title="Guardian" />
          <div className="mt-4 space-y-2">
            <DetailRow label="Name" value={<bdi>{student.guardianName || "—"}</bdi>} />
            <DetailRow label="Phone" value={<bdi dir="ltr">{student.guardianPhone || student.guardianWhatsapp || "—"}</bdi>} />
            <DetailRow label="Email" value={<bdi dir="ltr">{student.guardianEmail || "—"}</bdi>} />
          </div>
        </div>
        <div className="rounded-3xl bg-brand-50/40 border border-edge/10 p-5 transition-colors hover:bg-brand-50/60">
          <PanelTitle icon={FileText} title="Latest report card" />
          {report ? (
            <div className="mt-4 space-y-2">
              <DetailRow label="Exam" value={<bdi>{report.exam?.title || "—"}</bdi>} />
              <DetailRow label="Status" value={<StatusPill status={report.status} />} />
              <DetailRow label="Grade" value={report.grade || `${Math.round(report.percentage || 0)}%`} />
              <DetailRow label="Generated" value={formatDate(report.generatedAt)} />
            </div>
          ) : (
            <div className="mt-4"><EmptyInline text="No report card generated yet." /></div>
          )}
        </div>
      </div>
      <div className="mt-6 rounded-3xl bg-brand-50/40 border border-edge/10 p-5 transition-colors hover:bg-brand-50/60">
        <PanelTitle icon={Star} title="Recent marks" />
        {latestMarks.length > 0 ? (
          <div className="mt-4 space-y-2">
            {latestMarks.map((mark: any, idx: number) => (
              <DetailRow key={mark.id || idx} label={`${mark.subject?.name || ui("Subject")} — ${mark.exam?.title || ui("Exam")}`} value={<bdi>{mark.marksObtained}/{mark.subject?.totalMarks || 100}</bdi>} />
            ))}
          </div>
        ) : (<div className="mt-4"><EmptyInline text="No marks recorded for this pupil yet." /></div>)}
      </div>
      <div className="mt-6 rounded-3xl bg-brand-50/40 border border-edge/10 p-5 transition-colors hover:bg-brand-50/60">
        <PanelTitle icon={CalendarCheck} title="Recent attendance" />
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
  onClose: () => void; onSend: () => Promise<boolean | undefined>;
  onGenerateRemarks?: (studentId: string, examId: string) => void;
  onSaveRemarks?: (remarks: { en: string; ur: string }) => void | Promise<boolean | void>;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [detailReport, setDetailReport] = useState<any>(report);
  const [detailLoading, setDetailLoading] = useState(!report.subjectDistribution);
  // R4: a failed load of the breakdown is an inline ErrorState with retry inside the dialog, not a toast.
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [remarks, setRemarks] = useState({ en: report.remarksEn || "", ur: report.remarksUr || "" });
  const [translatingUr, setTranslatingUr] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const urduTouchedRef = useRef(Boolean(report.remarksUr));
  const translateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateSeq = useRef(0);
  const translationRequest = useRef<AbortController | null>(null);
  const avatar = report.student?.profileImageUrl;
  const ui = useUiText();
  const remarksDraft = useFormDraft({
    record: `teacher:report-remarks:${report.id}`,
    schema: 1,
    values: remarks,
    baseline: { en: detailReport.remarksEn || "", ur: detailReport.remarksUr || "" },
    fields: ["en", "ur"] as const,
    enabled: Boolean(onSaveRemarks),
    apply: (values) => setRemarks({ en: String(values.en ?? ""), ur: String(values.ur ?? "") }),
  });

  useEffect(() => {
    setDetailReport(report);
  }, [report]);

  useEffect(() => {
    let cancelled = false;
    if (report.subjectDistribution) { setDetailLoading(false); return; }
    setDetailLoading(true);
    setDetailFailed(false);
    (async () => {
      try {
        const res = await fetch(`/api/reports/${report.id}/detail`);
        if (!res.ok) throw new Error(String(res.status));
        const result = JSON.parse(await res.text());
        if (!cancelled && result.reportCard) setDetailReport(result.reportCard);
      } catch { if (!cancelled) setDetailFailed(true); }
      finally { if (!cancelled) setDetailLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [report.id, report.subjectDistribution, detailAttempt]);

  useEffect(() => {
    setRemarks({ en: detailReport.remarksEn || "", ur: detailReport.remarksUr || "" });
    urduTouchedRef.current = Boolean(detailReport.remarksUr);
  }, [detailReport.id, detailReport.remarksEn, detailReport.remarksUr]);

  useEffect(() => {
    return () => {
      if (translateTimer.current) clearTimeout(translateTimer.current);
      translateSeq.current += 1;
      translationRequest.current?.abort();
    };
  }, []);

  const runUrduTranslation = async (en: string) => {
    const seq = ++translateSeq.current;
    translationRequest.current?.abort();
    const controller = new AbortController();
    translationRequest.current = controller;
    setTranslatingUr(true);
    setTranslationError("");
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: en }),
        signal: controller.signal,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || ui("Urdu translation is unavailable. You can enter Urdu manually."));
      if (seq === translateSeq.current && !urduTouchedRef.current && result.translation) {
        setRemarks((r) => ({ ...r, ur: result.translation }));
      }
    } catch (error) {
      if (seq === translateSeq.current) setTranslationError(error instanceof Error ? error.message : ui("Urdu translation is unavailable. You can enter Urdu manually."));
    }
    finally {
      if (seq === translateSeq.current) setTranslatingUr(false);
    }
  };

  const handleRemarksEnChange = (en: string) => {
    translateSeq.current += 1;
    translationRequest.current?.abort();
    setTranslatingUr(false);
    setTranslationError("");
    setRemarks((r) => {
      const next = { ...r, en };
      if (!urduTouchedRef.current) next.ur = "";
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
    translationRequest.current?.abort();
    setTranslatingUr(false);
    setTranslationError("");
    setRemarks((r) => ({ ...r, ur }));
  };

  const handleTranslateUrdu = () => {
    urduTouchedRef.current = false;
    if (translateTimer.current) clearTimeout(translateTimer.current);
    const en = remarks.en.trim();
    if (en.length >= 4) runUrduTranslation(en);
  };

  const handleDownloadPdf = async () => {
    const id = viewReport?.id;
    if (!id) return;
    setDownloadingPdf(true);
    try {
      await downloadReportCardPdf(id, `${viewReport.student?.fullName || "report-card"}.pdf`);
      toast.success(ui("Report card PDF downloaded."));
    } catch (error) {
      toast.error(error);
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
      title={ui("{0} — report card", [viewReport.student?.fullName || ui("Pupil")])}
      eyebrow={ui("Academic result")}
      icon={FileText}
      tone={viewReport.isSent ? "emerald" : "violet"}
      onClose={onClose}
      wide
      dirty={Boolean(onSaveRemarks) && remarksDirty}
      dirtyMessage={ui("You have unsaved remarks. Close and discard them?")}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {remarksDirty && onSaveRemarks ? (
            <DeskPill tone="warning" className="me-auto">
              <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" /> {ui("Unsaved remarks")}
            </DeskPill>
          ) : null}
          {viewReport.exam?.id && viewReport.student?.id && onGenerateRemarks ? (
            <BrandButton variant="soft" icon={<BrainCircuit className="w-4 h-4" />}
              onClick={() => onGenerateRemarks(viewReport.student.id, viewReport.exam.id)}
              disabled={remarkBusy === viewReport.student.id}
              loading={remarkBusy === viewReport.student.id}>
              {remarkBusy === viewReport.student.id ? ui("Drafting…") : ui("Draft with AI")}
            </BrandButton>
          ) : null}
          <BrandButton variant="soft" icon={downloadingPdf ? undefined : <Download className="w-4 h-4" />} onClick={handleDownloadPdf} disabled={downloadingPdf} loading={downloadingPdf}>
            {downloadingPdf ? ui("Preparing PDF…") : ui("Download PDF")}
          </BrandButton>
          {viewReport.isSent ? (
            <DeskPill tone="success">
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> {ui("Already sent")}
            </DeskPill>
          ) : (
            /* Sending mails a family. It fired on a single click with no
               confirmation, and there is no way to unsend it afterwards. */
            <BrandButton variant="dark" icon={busy ? undefined : <Send className="w-4 h-4" />}
              onClick={() => setConfirmSend(true)} disabled={busy} loading={busy}>
              {busy ? ui("Sending…") : ui("Send to guardian")}
            </BrandButton>
          )}
        </div>
      }
    >
      <div ref={printRef} id="report-card-print" className="space-y-6">
        {viewReport.campus ? (
          <div className="flex items-center gap-3 rounded-[30px] border border-primary/10 bg-gradient-to-br from-brand-50/80 to-card p-4">
            {campusLogo ? (
              <img src={campusLogo} alt={ui("Campus logo")} className="h-14 w-14 shrink-0 rounded-2xl object-cover border border-edge/25" />
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink-strong">{viewReport.campus.school?.name || viewReport.campus.name}</p>
              <p className="truncate text-2xs font-semibold text-ink-muted">{campusContactLine}</p>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-5 rounded-[30px] bg-gradient-to-br from-brand-50/80 to-card p-5 sm:flex-row sm:items-center border border-primary/10">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[28px] border-4 border-card bg-card shadow-xl">
            <AvatarImage src={avatar} name={viewReport.student?.fullName} initialsClassName="text-2xl" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold text-primary"><bdi>{viewReport.exam?.title || ui("Final grade")}</bdi>{viewReport.exam?.term ? <> · <bdi>{viewReport.exam.term}</bdi></> : null}</p>
            <h3 className="mt-1 truncate text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl"><bdi>{viewReport.student?.fullName || ui("Pupil")}</bdi></h3>
            <p className="mt-2 text-sm font-medium text-ink-muted">
              {viewReport.student?.rollNo ? <>{ui("Roll number")}: <bdi>{viewReport.student.rollNo}</bdi> · </> : null}<bdi>{classLabel(viewReport.student?.class)}</bdi>
            </p>
            <p className="mt-1 text-2xs font-medium text-ink-muted">{ui("Generated {0}", [formatDate(viewReport.generatedAt)])}</p>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-center">
              <p className="text-4xl font-bold text-primary"><bdi>{Math.round(viewReport.percentage || 0)}%</bdi></p>
              <p className="text-2xs font-semibold text-ink-subtle">{ui("Percentage")}</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-ink-strong"><bdi>{viewReport.grade || "—"}</bdi></p>
              <p className="text-2xs font-semibold text-ink-subtle">{ui("Grade")}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniMetric label="Roll number" value={<bdi>{viewReport.student?.rollNo || "—"}</bdi>} active />
          <MiniMetric label="Class" value={<bdi>{classLabel(viewReport.student?.class)}</bdi>} />
          <MiniMetric label="Status" value={<StatusPill status={viewReport.status} />} />
          {/* Rendered the raw enum, so this tile read "NOT_SENT" in a column
              of title-cased values. formatStatus already existed for this. */}
          <MiniMetric label="Delivery" value={ui(formatStatus(viewReport.deliveryStatus))} />
        </div>

        <div className="rounded-3xl bg-brand-50/40 border border-edge/10 p-5 transition-colors hover:bg-brand-50/60">
          <PanelTitle icon={BarChart3} title="Final result" />
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="sk-panel p-4 text-center transition-colors">
              <p className="text-2xl font-bold text-ink-strong"><bdi>{viewReport.totalMarks || "—"}</bdi></p>
              <p className="text-2xs font-semibold text-ink-subtle">{ui("Total marks")}</p>
            </div>
            <div className="sk-panel p-4 text-center transition-colors">
              <p className="text-2xl font-bold text-primary"><bdi>{viewReport.obtainedMarks || "—"}</bdi></p>
              <p className="text-2xs font-semibold text-ink-subtle">{ui("Obtained")}</p>
            </div>
            <div className="sk-panel p-4 text-center transition-colors">
              <p className="text-2xl font-bold text-primary"><bdi>{Math.round(viewReport.percentage || 0)}%</bdi></p>
              <p className="text-2xs font-semibold text-ink-subtle">{ui("Percentage")}</p>
            </div>
            <div className="sk-panel p-4 text-center transition-colors">
              <p className={`text-2xl font-bold ${viewReport.passed !== false ? "text-ink-strong" : "text-status-error-text"}`}><bdi>{viewReport.grade || "—"}</bdi></p>
              <p className="text-2xs font-semibold text-ink-subtle">{ui("Grade")}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-brand-50/40 border border-edge/10 p-5 transition-colors hover:bg-brand-50/60">
          <PanelTitle icon={BarChart3} title="How the result is made up" />
          {viewReport.weightConfig ? (
            <p className="mt-3 text-2xs font-semibold text-ink-muted">
              {ui("Weights set by your academic lead: quizzes {0}% · class tests {1}% · term exams {2}% · final exams {3}%", [viewReport.weightConfig.quizWeight, viewReport.weightConfig.classTestWeight, viewReport.weightConfig.midTermWeight, viewReport.weightConfig.finalWeight])}
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
          ) : detailFailed ? (
            <ErrorState
              className="mt-4"
              title={ui("Couldn't load the result breakdown")}
              description={ui("The report card is still here; only the subject breakdown is missing.")}
              onRetry={() => setDetailAttempt((n) => n + 1)}
            />
          ) : (
            <>
          {viewReport.subjectDistribution?.length ? (
            <div className="mt-4 space-y-5">
              {viewReport.subjectDistribution.map((subject: any) => (
                <div key={subject.subjectId}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink-strong"><bdi>{subject.subjectName || ui("Subject")}</bdi></p>
                  </div>
                  {subject.exams?.length ? (
                    <div className="overflow-x-auto rounded-2xl border border-edge/10 bg-card">
                      <table className="w-full min-w-[520px] text-start">
                        <thead>
                          <tr className="bg-brand-50/40 text-2xs font-semibold text-ink-muted">
                            <th className="px-4 py-2.5 text-start">{ui("Exam")}</th>
                            <th className="px-4 py-2.5 text-center">{ui("Weight")}</th>
                            <th className="px-4 py-2.5 text-center">{ui("Marks")}</th>
                            <th className="px-4 py-2.5 text-center">%</th>
                            <th className="px-4 py-2.5 text-center">{ui("Contribution")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-muted">
                          {subject.exams.map((exam: any) => (
                            <tr key={exam.examId} className="hover:bg-brand-50/20 transition-colors">
                              <td className="px-4 py-2.5 text-sm font-semibold text-ink-strong"><bdi>{exam.examTitle}</bdi></td>
                              <td className="px-4 py-2.5 text-center text-sm font-semibold text-primary">{exam.weight}%</td>
                              <td className="px-4 py-2.5 text-center text-sm font-semibold text-ink-strong">{exam.obtainedMarks}/{exam.totalMarks}</td>
                              <td className="px-4 py-2.5 text-center text-sm font-semibold text-ink-strong">{exam.percentage}%</td>
                              <td className="px-4 py-2.5 text-center text-sm font-semibold text-primary">{Math.round((exam.contribution || 0) * 10) / 10}</td>
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card border border-edge/10 px-4 py-3">
              <p className="text-sm font-bold text-ink-strong">{ui("Overall weighted result")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <bdi className="rounded-full bg-brand-50 px-3 py-1 text-2xs font-bold text-primary">{viewReport.overall.overallPercentage}%</bdi>
                <bdi className="rounded-full bg-card border border-edge/10 px-3 py-1 text-2xs font-bold text-ink-strong">{viewReport.overall.overallGrade}</bdi>
                <DeskPill tone={viewReport.overall.passed ? "success" : "danger"}>
                  {viewReport.overall.passed ? ui("Pass") : ui("Below pass")}
                </DeskPill>
              </div>
            </div>
          ) : null}
            </>
          )}
        </div>

        <div className="rounded-3xl bg-brand-50/40 border border-edge/10 p-5 transition-colors hover:bg-brand-50/60">
          <PanelTitle icon={FileText} title="Remarks" />
          {onSaveRemarks ? (
            <div className="mt-4 space-y-3">
              <DraftRecovery recordLabel={ui("Report remarks")} draft={remarksDraft} saving={Boolean(savingRemarks)} excluded={ui("Only the English and Urdu remark text is stored in this signed-in browser draft.")} />
              <div>
                <p className="text-2xs font-semibold text-ink-subtle">{ui("English")}</p>
                <Textarea value={remarks.en} onChange={(e) => handleRemarksEnChange(e.target.value)} rows={3} className="mt-1.5" placeholder={ui("Write remarks for this pupil…")} aria-label={ui("Remarks in English")} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-2xs font-semibold text-ink-subtle">{ui("Urdu")}</p>
                  <div className="flex items-center gap-1.5">
                    {translatingUr ? (
                      <span className="inline-flex items-center gap-1 text-2xs font-semibold text-primary">
                        <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> {ui("Translating…")}
                      </span>
                    ) : null}
                    <Button variant="secondary" size="sm" type="button"
                      className="inline-flex justify-start items-center gap-1"
                      disabled={translatingUr || remarks.en.trim().length < 4}
                      onClick={handleTranslateUrdu} title={ui("Translate the English remark into Urdu")}>
                      <Languages aria-hidden="true" className="h-3 w-3" /> {ui("Auto-translate")}
                    </Button>
                  </div>
                </div>
                <div className="mt-1.5">
                  <UrduInput value={remarks.ur} onChange={handleRemarksUrChange} textarea placeholder="اردو میں نوٹس لکھیں..." />
                </div>
                {translationError ? <p className="mt-1.5 text-xs text-status-error-text" role="alert">{translationError}</p> : null}
                {!translationError && !remarks.ur && remarks.en ? (
                  <p className="mt-1.5 flex items-center gap-1 text-2xs font-medium text-ink-subtle">
                    <RefreshCw aria-hidden="true" className="h-3 w-3" /> {ui("Urdu auto-translates from the English remark as you type.")}
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end">
                <BrandButton variant="dark" icon={savingRemarks ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  onClick={async () => { const saved = await onSaveRemarks({ en: remarks.en, ur: remarks.ur }); if (saved !== false) remarksDraft.markSaved(); }} disabled={savingRemarks || translatingUr}>
                  {savingRemarks ? ui("Saving…") : ui("Save remarks")}
                </BrandButton>
              </div>
            </div>
          ) : viewReport.remarksEn || viewReport.remarksUr ? (
            <div className="mt-4 space-y-3">
              {viewReport.remarksEn ? (
                <div className="rounded-2xl bg-card border border-edge/10 px-4 py-3 transition-colors hover:border-primary/20">
                  <p className="text-2xs font-semibold text-ink-subtle">{ui("English")}</p>
                  <p className="mt-1 text-sm font-semibold text-ink-strong">{viewReport.remarksEn}</p>
                </div>
              ) : null}
              {viewReport.remarksUr ? (
                <div className="rounded-2xl bg-card border border-edge/10 px-4 py-3 transition-colors hover:border-primary/20" dir="rtl">
                  <p className="text-2xs font-semibold text-ink-subtle">{ui("Urdu")}</p>
                  <p className="mt-1 text-sm font-semibold text-ink-strong">{viewReport.remarksUr}</p>
                </div>
              ) : null}
            </div>
          ) : (<div className="mt-4"><EmptyInline text="No remarks drafted yet." /></div>)}
        </div>
      </div>
    </ModalFrame>

    <ConfirmAction
      open={confirmSend}
      tone="warning"
      title={ui("Send this report card?")}
      description={ui("{0}'s guardian will be emailed the result for {1}. A sent report card cannot be recalled.", [viewReport.student?.fullName || ui("This pupil"), viewReport.exam?.title || ui("this test")])}
      detail={
        remarksDirty ? (
          <span className="text-status-warning-text">
            {ui("Your remarks are not saved yet — save them first if they should go out with this report.")}
          </span>
        ) : (
          <span>
            <bdi>{Math.round(viewReport.percentage || 0)}%</bdi> · {ui("Grade {0}", [viewReport.grade || "—"])} · <bdi>{classLabel(viewReport.student?.class)}</bdi>
          </span>
        )
      }
      confirmLabel={ui("Send to guardian")}
      cancelLabel={ui("Keep editing")}
      busy={busy}
      onConfirm={async () => { if (await onSend()) setConfirmSend(false); }}
      onCancel={() => setConfirmSend(false)}
    />
    </>
  );
}

/* ── Skeleton loaders ── */


/**
 * The frame every skeleton here sits in: `WorkspacePageSkeleton`, the loading shape of the page itself
 * (PageHeader placeholder, the shared body padding, no card of its own — the shell draws the one page card).
 * Nothing moves when the data lands, and the sidebar stays usable while a screen is loading.
 */
function SkeletonFrame({ children, action = false }: { children: ReactNode; action?: boolean }) {
  const ui = useUiText();
  return <WorkspacePageSkeleton label={ui("Loading the teacher console")} action={action}>{children}</WorkspacePageSkeleton>;
}

/** Matches the compact stat tile the teacher pages actually render. */
function StatCardSkeleton({ valueWidth = "w-16" }: { valueWidth?: string }) {
  return (
    <div className="sk-panel px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <SkeletonBlock className={`h-5 ${valueWidth}`} />
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-2.5 w-24" />
        </div>
        <SkeletonBlock className="h-9 w-9 shrink-0 rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Today (and the other overview screens): the "needs you" rows, a flagship band, the day's lessons and four
 * figures — the shapes the page renders, in the new design (sk-panel sections inside the shell's page card).
 */
export function DashboardSkeleton() {
  return (
    <SkeletonFrame action>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="sk-panel flex items-center gap-3 p-3">
              <SkeletonBlock className="size-9 shrink-0 rounded-xl" delay={i * 60} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBlock className="h-3.5 w-40 max-w-full rounded-lg" delay={i * 60} />
                <SkeletonBlock className="h-2.5 w-56 max-w-full rounded-full" delay={i * 60} />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <SkeletonBlock className="size-11 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-56 max-w-full rounded-lg" />
                <SkeletonBlock className="h-3 w-72 max-w-full rounded-full" />
              </div>
            </div>
            <SkeletonBlock className="h-11 w-full shrink-0 rounded-xl sm:w-44" />
          </div>
        </div>
        <div className="sk-panel space-y-3 p-4 sm:p-5">
          <SkeletonBlock className="h-4 w-36 rounded-lg" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-16 shrink-0 rounded-xl" delay={i * 50} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBlock className="h-3 w-1/2 rounded-full" delay={i * 50} />
                <SkeletonBlock className="h-2.5 w-1/3 rounded-full" delay={i * 50} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    </SkeletonFrame>
  );
}

export function MarksSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        {/* Exam selector control */}
        <div className="w-full max-w-md">
          <SkeletonBlock className="h-3 w-28 mb-1.5" />
          <SkeletonBlock className="h-12 w-full rounded-xl" />
        </div>
        {/* Exam cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="sk-panel p-4">
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
                <div className="rounded-xl bg-brand-50/40 px-3 py-2 flex items-center gap-2">
                  <SkeletonBlock className="h-3 w-12" />
                  <SkeletonBlock className="h-5 w-6" />
                </div>
                <div className="rounded-xl bg-brand-50/40 px-3 py-2 flex items-center gap-2">
                  <SkeletonBlock className="h-3 w-12" />
                  <SkeletonBlock className="h-5 w-6" />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Marks table card */}
        <div className="rounded-[26px] bg-card border border-edge/10 shadow-sm overflow-hidden">
          <div className="bg-brand-50/30 px-5 py-4 border-b border-edge/10">
            <div className="flex gap-8">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-3 w-14" />
              <SkeletonBlock className="h-3 w-14" />
              <SkeletonBlock className="h-3 w-14" />
            </div>
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-edge/8 last:border-b-0">
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
    </SkeletonFrame>
  );
}

export function AttendanceSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
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
            <div key={i} className="sk-panel p-4 flex items-center gap-3">
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
        <div className="rounded-[26px] bg-card border border-edge/10 shadow-sm overflow-hidden divide-y divide-edge/10">
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
          <div className="rounded-[26px] bg-card border border-edge/10 shadow-sm overflow-hidden divide-y divide-edge/10">
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
    </SkeletonFrame>
  );
}

export function ReportsSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
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
              <div key={i} className="sk-panel p-4">
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
              <div key={i} className="sk-panel p-4">
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
    </SkeletonFrame>
  );
}

/** The classroom AI helpers page: a few tiles and the helper panels, in the new design. */
export function AISkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} valueWidth="w-20" />)}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="sk-panel space-y-4 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <SkeletonBlock className="size-11 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-5 w-40 rounded-lg" />
                <SkeletonBlock className="h-3 w-28 rounded-full" />
              </div>
            </div>
            {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-16 w-full rounded-2xl" delay={i * 60} />)}
          </div>
          <div className="sk-panel space-y-3 p-4 sm:p-5">
            <SkeletonBlock className="h-4 w-32 rounded-lg" />
            {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-12 w-full rounded-2xl" delay={i * 60} />)}
          </div>
        </div>
      </div>
    </SkeletonFrame>
  );
}

export function StudentsSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SkeletonBlock className="h-12 w-full sm:w-96 rounded-2xl" />
          <SkeletonBlock className="h-12 w-full sm:w-40 rounded-2xl" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
        {/* Student cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="sk-panel p-4">
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
    </SkeletonFrame>
  );
}

export function TimetableSkeleton({ weekendDays = [] }: { weekendDays?: number[] }) {
  const dayCount = weekendDays.length ? 6 - weekendDays.filter((d) => d >= 1 && d <= 6).length : 6;
  const dayCols = `w-16 ${[...Array(dayCount)].map(() => "minmax(0,1fr)").join(" ")}`;
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="rounded-[24px] bg-gradient-to-r from-primary/5 to-brand-50/50 border border-primary/10 p-5">
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

        <div className="rounded-[26px] overflow-hidden border border-edge/10 bg-card shadow-sm flex-1 flex flex-col">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-edge/10">
            <SkeletonBlock className="h-6 w-6 rounded-lg" />
            <SkeletonBlock className="h-4 w-44" />
          </div>
          <div className="px-5 py-3 flex flex-wrap gap-1.5">
            {[...Array(4)].map((_, i) => (
              <SkeletonBlock key={i} className="h-6 w-20 rounded-lg" />
            ))}
          </div>
          <div className="overflow-hidden border-t border-muted flex-1">
            <div className="grid border-b border-muted" style={{ gridTemplateColumns: `70px repeat(${dayCount}, 1fr)` }}>
              <div className="p-2" />
              {[...Array(dayCount)].map((_, i) => (
                <div key={i} className="flex items-center justify-center py-2.5 border-l border-muted">
                  <SkeletonBlock className="h-3 w-10 rounded-md" />
                </div>
              ))}
            </div>
            {[...Array(6)].map((_, p) => (
              <div key={p} className="grid border-b border-muted last:border-b-0" style={{ gridTemplateColumns: `70px repeat(${dayCount}, 1fr)` }}>
                <div className="flex flex-col items-center justify-center p-1.5 border-r border-muted">
                  <SkeletonBlock className="h-3 w-6 rounded-md" />
                  <SkeletonBlock className="h-2 w-8 rounded-md mt-1" />
                </div>
                {[...Array(dayCount)].map((_, d) => (
                  <div key={d} className="border-l border-muted p-1.5">
                    <SkeletonBlock className="h-12 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonFrame>
  );
}

/* ── Hook to load teacher dashboard data ── */

export function useTeacherData() {
  const { data, loading, error, refetch } = useTeacherDataContext();
  return { data, loading, error, loadData: refetch };
}

/**
 * What a route transition shows before the destination page mounts.
 *
 * `loading.tsx` renders inside the shell, so the sidebar and top bar stay
 * put — but it used to draw a centred spinner where the page card belongs,
 * which read as the console briefly losing its page. This puts the chrome up
 * immediately (header, section strip) and lets the page's own skeleton take
 * over from there, so nothing between click and content changes shape.
 */
export function TeacherRouteSkeleton() {
  return (
    <SkeletonFrame>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className={`sk-panel p-4 ${i === 0 ? "xl:col-span-2" : ""}`}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <SkeletonBlock className="h-8 w-8 shrink-0 rounded-xl" />
                <SkeletonBlock className="h-4 w-36" />
              </div>
              <div className="space-y-2">
                {[...Array(4)].map((_, j) => (
                  <SkeletonBlock key={j} className="h-12 w-full rounded-2xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}
