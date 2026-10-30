"use client";
import { loadListPages } from "@/lib/lists/load-pages";
import { useListPage } from "@/hooks/use-list-page";
import { useListField } from "@/hooks/use-list-field";
import { fillNodes } from "@/lib/auth/fill-nodes";
import { AiWorkflowsHome } from "@/components/ai-workflows/AiWorkflowsHome";
import { Tooltip } from "@/components/ui/tooltip";
import { IconButton } from "@/components/ui/icon-button";
import { Button as SystemButton, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";
import { InputGroup } from "@/components/ui/input-group";
import { checkStudentDocumentFile, cleanStudentDocumentName, studentDocumentContentType, STUDENT_DOCUMENT_ACCEPT, STUDENT_DOCUMENT_KINDS } from "@/lib/students/document-policy";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal, ModalActions as SharedModalActions, MODAL_TONES, type ModalTone, type ModalSize } from "@/components/ui/modal";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Archive,
  Award,
  Banknote,
  BookOpen,
  Briefcase,
  Building,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  DoorOpen,
  Download,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  Heart,
  History,
  Landmark,
  LayoutGrid,
  Layers,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Phone,
  PhoneCall,
  Plane,
  Plus,
  Printer,
  RotateCcw,
  School,
  Send,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  User,
  UserCheck,
  Users,
  Upload,
  Wallet,
  X,
  type LucideIcon,
  IdCard,
} from "lucide-react";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { maskIdentifier, parseEmiratesId, parseRegulatorId } from "@/lib/identity/regulator-ids";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader, type PageAction } from "@/components/ui/page-header";
import { ViewTabs } from "@/components/ui/view-tabs";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { translateUi } from "@/lib/locale/ui-messages";
import { AiActionPanel, AIReviewQueue, BrandButton, EmptyState } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { CornerSparkles } from "@/components/CornerSparkles";
import { ReviewedDelete, ReviewedDeleteDialog } from "@/components/ui/reviewed-delete";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { RestoreStudentDialog } from "./restore-student-dialog";
import { TeacherPicker, useTeacherAvailability } from "@/components/shared-admin/teacher-picker";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { Textarea as SystemTextarea } from "@/components/ui/textarea";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
export { TeacherConflictsBanner } from "@/components/shared-admin/teacher-conflicts-banner";
// The roster grew its own file once it gained table view, multi-select and
// bulk actions; the import path is unchanged.
export { StudentsPanel } from "@/components/shared-admin/students-panel";
import { SubjectSyllabus } from "@/components/shared-admin/subject-syllabus";
import { AvatarImage } from "@/components/ui/avatar-image";
import { resolveMediaUrl } from "@/lib/storage/s3";
import { Skeleton, SkeletonList, SkeletonRegion } from "@/components/ui/skeleton";
import { FormField } from "@/components/ui/form-field";
import { apiErrorMessage } from "@/lib/errors";
import { usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";
import { csvCell, downloadCSV } from "@/lib/csv";
import { isApiOk, readApiData, readApiError } from "@/lib/api/envelope-client";
import {
  DataTable,
  SearchField,
  SelectionBar,
  StatTiles,
  ModalPager,
  ToolbarSelect,
  Pagination,
  SortDirButton,
  ToolbarToggle,
  WorkspaceHeader,
  WorkspaceToolbar,
  usePaged,
  ViewSwitch,
  additionalWorkspaceViews,
  useWorkspacePrefs,
} from "@/components/shared-admin/workspace";

export type ClassFormState = {
  name: string;
  section: string;
  academicYear: number;
  classTeacherId: string;
};

export type StudentFormState = {
  fullName: string;
  rollNo: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  classId: string;
  studentEmail: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
};

export type ClassGroup = {
  key: string;
  name: string;
  academicYear: number | string;
  sections: any[];
};

/**
 * Words for the record states these panels show (R7: a translated word, never a raw enum). Keys are the API
 * values; the values are EN UI keys translated by `StatusPill`. Anything unknown falls back to sentence case.
 */
const STATUS_WORDS: Record<string, string> = {
  ACTIVE: "Active", INACTIVE: "Inactive", PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled",
  DRAFT: "Draft", SCHEDULED: "Scheduled", ONGOING: "In progress", IN_PROGRESS: "In progress", COMPLETED: "Completed",
  LOCKED: "Locked", PRINCIPAL_REVIEWED: "Reviewed", PUBLISHED: "Published", ARCHIVED: "Archived", SENT: "Sent",
  FAILED: "Failed", BLOCKED: "Blocked", SUSPENDED: "Suspended", TRIAL: "Trial", REVIEW: "In review", NO_REPORT: "No report",
  FOLLOW_UP: "Follow-up", CONVERTED: "Converted", LOST: "Lost", GRADUATED: "Graduated", TRANSFERRED: "Transferred",
  WITHDRAWN: "Withdrawn", EXPIRED: "Expired", INVITED: "Invited",
};

/** Sentence-case words for a status value: `FOLLOW_UP` → "Follow-up", `IN_PROGRESS` → "In progress". */
export function formatStatus(status?: string) {
  const value = status || "PENDING";
  if (STATUS_WORDS[value]) return STATUS_WORDS[value];
  if (value !== value.toUpperCase()) return value.replaceAll("_", " ");
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Status token classes (R10): success, brand, error or neutral. */
export function statusTone(status?: string) {
  if (["ACTIVE", "Active", "PUBLISHED", "SENT", "APPROVED", "Assigned", "One Teacher", "CONVERTED", "COMPLETED", "GRADUATED"].includes(status || "")) {
    return "bg-status-success-surface text-status-success-text";
  }
  if (["Invited", "INVITED", "PENDING", "TRIAL", "REVIEW", "LOCKED", "PRINCIPAL_REVIEWED", "Subject Teachers", "FOLLOW_UP", "SCHEDULED", "ONGOING", "IN_PROGRESS"].includes(status || "")) {
    return "bg-status-brand-surface text-status-brand-text";
  }
  if (["Expired", "EXPIRED", "FAILED", "BLOCKED", "SUSPENDED", "NO_REPORT", "Unassigned", "LOST", "REJECTED"].includes(status || "")) {
    return "bg-status-error-surface text-status-error-text";
  }
  return "bg-muted text-ink";
}

export function classLabel(item: any) {
  if (!item) return "Unassigned";
  return [item.name, item.section].filter(Boolean).join(" ");
}

// Initials live with the avatar component that renders them.
export { initialsOf } from "@/components/ui/avatar-image";

export function sectionLabel(item: any) {
  return item?.section || "Main";
}

/**
 * Some schools don't stream a grade into sections at all — "Grade 5" is one
 * single class. That's stored as a single Class row with `section = null`, and
 * the UI must not invent a fake "Section Main" heading for it.
 */
export function isSectionless(group: { sections?: any[] } | null | undefined) {
  const sections = group?.sections || [];
  return sections.length === 1 && !sections[0]?.section;
}

export function classGroupKey(item: any) {
  return `${item?.academicYear || ""}::${item?.name || ""}`;
}

/** Minutes from one "HH:MM" to another. 0 if either is unparseable or the
 *  second is not after the first. */
function minutesBetween(from: string, to: string) {
  const parse = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null || b <= a) return 0;
  return b - a;
}

export function groupClasses(classes: any[]) {
  const groups = new Map<string, ClassGroup>();

  for (const cls of classes || []) {
    const key = classGroupKey(cls);
    const group: ClassGroup = groups.get(key) || {
      key,
      name: cls.name || "Class",
      academicYear: cls.academicYear || "N/A",
      sections: [],
    };
    group.sections.push(cls);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sections: group.sections.sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b))),
    }))
    .sort(
      (a, b) =>
        (Number(b.academicYear) || 0) - (Number(a.academicYear) || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""))
    );
}

/**
 * Every field is quoted and inner quotes are doubled. The old inline versions
 * quoted only the name columns, so a class called "Year 1, Blue" or a guardian
 * name with a quote in it silently shifted every later column.
 *
 * A leading =, +, - or @ is prefixed with a quote character so spreadsheets
 * treat the value as text instead of a formula.
 */
/** Module-level helpers (CSV export) run outside React; they translate with the document's language. */
function translateNow(source: string, values: unknown[] = []): string {
  const base = typeof document === "undefined" ? "en" : document.documentElement.lang.toLowerCase().split("-")[0];
  const language = base === "ar" || base === "ur" ? base : "en";
  return translateUi(source, language).replace(/\{(\d+)\}/g, (match, index) => (index in values ? String(values[Number(index)]) : match));
}

const STUDENT_CSV_COLUMNS: [string, (s: any) => unknown][] = [
  ["Full Name", (s) => s.fullName],
  ["Roll No", (s) => s.rollNo],
  ["Gender", (s) => s.gender || ""],
  ["Class", (s) => classLabel(s.class)],
  ["Category", (s) => s.category?.name || ""],
  ["Group", (s) => s.group?.name || ""],
  ["Guardian Name", (s) => s.guardianName || ""],
  ["Guardian Phone", (s) => s.guardianPhone || ""],
  ["Guardian Email", (s) => s.guardianEmail || ""],
];

/** Downloads the given students as CSV. Shared by the admin and principal views. */
export function exportStudentsToCSV(students: any[], campusName?: string) {
  if (!students.length) {
    toast.error(translateNow("Nothing to export — no students match the current filters"));
    return;
  }
  const rows = [
    STUDENT_CSV_COLUMNS.map(([header]) => csvCell(header)).join(","),
    ...students.map((s) => STUDENT_CSV_COLUMNS.map(([, read]) => csvCell(read(s))).join(",")),
  ];
  // The BOM makes Excel read the file as UTF-8, so Urdu names survive.
  const blob = new Blob(["﻿", rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(campusName || "campus").replace(/\s+/g, "_")}_students.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(translateNow("{0} student(s) exported", [students.length]));
}

/** Every non-active roll state, as shown to admins. */
const ARCHIVED_STATUS_LABELS: Record<string, string> = {
  inactive: "Inactive",
  archived: "Archived",
  transferred: "Transferred",
  graduated: "Graduated",
};

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Student timeline event kinds (EN UI keys); anything else reads as sentence case, never a raw enum (R7). */
const TIMELINE_KIND_LABELS: Record<string, string> = {
  ADMITTED: "Admitted",
  PROMOTED: "Promoted",
  NOTE: "Note",
  DOC_UPLOADED: "Document uploaded",
  FEE_PAID: "Fee paid",
  ENROLLMENT_TRANSITION: "Enrolment change",
  GRADUATED: "Graduated",
  TRANSFERRED: "Transferred",
  WITHDRAWN: "Withdrawn",
};

/** Guardian relationships (EN UI keys; translated where shown). */
const GUARDIAN_RELATIONSHIP_LABELS: Record<string, string> = {
  FATHER: "Father",
  MOTHER: "Mother",
  GUARDIAN: "Guardian",
  UNCLE: "Uncle",
  AUNT: "Aunt",
  GRANDPARENT: "Grandparent",
  SIBLING: "Sibling",
};

/** Leave allocations made for a whole role (EN UI keys, plural). */
const ALLOCATION_ROLE_LABELS: Record<string, string> = {
  TEACHER: "Teachers",
  PRINCIPAL: "Principals",
  ACCOUNTANT: "Accountants",
  RECEPTIONIST: "Receptionists",
  LIBRARIAN: "Librarians",
  CAMPUS_ADMIN: "Campus admins",
  ADMIN: "Campus admins",
};

export function formatDate(value?: string | Date | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Staff & invites (campus admin) / Staff & leaders (single-school admin) — M22.
 *
 * The console's PageHeader owns the view's primary action ("Invite staff member"). This panel lists who
 * runs the campus, grouped by seat. Leadership changes (deputy admin, principal) are offered only to the
 * institution authority (`canAppointLeaders`); a campus admin sees the leaders read-only, with the console's
 * "Managed by …" note above. Office-staff changes need the membership delegation (`canInvite`); without it
 * the rows are read-only. Destructive actions live in each row's overflow menu, behind ConfirmAction.
 */
export function LeadershipPanel({
  data,
  canInvite = false,
  canAppointLeaders = false,
  onInviteAdmin,
  onInvitePrincipal,
  onRemove,
  onResend,
  onCancel,
}: {
  data: any;
  /** `memberships`: invite, resend, cancel and remove office staff on this campus. */
  canInvite?: boolean;
  /** `inviteLeaders`: appoint or revoke the principal and deputy admins (institution authority only). */
  canAppointLeaders?: boolean;
  onInviteAdmin?: () => void;
  onInvitePrincipal?: () => void;
  onRemove: (id: string, label: string) => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
  /** @deprecated The activity log lives in School settings › Activity log. Ignored. */
  onActivityLog?: () => void;
  /** @deprecated Office invites start from the console's "Invite staff member" primary action. Ignored. */
  onInviteAccountant?: () => void;
  onInviteLibrarian?: () => void;
  onInviteReceptionist?: () => void;
}) {
  const ui = useUiText();
  const admins: any[] = data.campusAdmins || [];
  const pendingAdmins: any[] = data.pendingAdminInvitations || [];
  const staff: any[] = data.operationsStaff || [];
  const pendingStaff: any[] = data.pendingOperationsInvitations || [];
  const principal = data.principal;
  const principalPending = principal && principal.status && String(principal.status).toLowerCase() === "pending";

  // §1.5: an ADMIN is the "School admin" only in a single school; inside a school group an ADMIN is a campus admin.
  const adminName = data.institutionKind === "STANDALONE" ? "School admin" : "Campus admin";
  const roleName = (role?: string) =>
    ui(({ ACCOUNTANT: "Accountant", LIBRARIAN: "Librarian", RECEPTIONIST: "Receptionist", CAMPUS_ADMIN: "Campus admin", ADMIN: adminName, PRINCIPAL: "Principal" } as Record<string, string>)[role || ""] ?? formatStatus(role));

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <section aria-labelledby="leaders-heading" className="sk-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-2xl bg-brand-50 text-primary"><Shield className="size-5" /></span>
            <div>
              <h2 id="leaders-heading" className="text-lg font-bold text-ink-strong">{ui("Leadership")}</h2>
              <p className="text-xs font-medium text-ink-muted">{ui("Who runs this campus and who leads teaching.")}</p>
            </div>
          </div>
          {canAppointLeaders && onInviteAdmin ? (
            <SystemButton variant="outline" size="sm" type="button" onClick={onInviteAdmin}>
              <Plus aria-hidden="true" />{ui("Add deputy admin")}
            </SystemButton>
          ) : null}
        </div>

        <div className="space-y-3">
          {admins.map((admin: any) => (
            <PersonRow
              key={admin.id}
              name={admin.fullName}
              detail={admin.email}
              badge={admin.id === data.currentUserId ? ui("You") : roleName(admin.role)}
              actions={canAppointLeaders && admin.id !== data.currentUserId ? [{ id: "revoke", label: ui("Revoke access"), tone: "danger", onSelect: () => onRemove(admin.id, admin.role || "CAMPUS_ADMIN") }] : []}
            />
          ))}
          {pendingAdmins.map((invite: any) => (
            <PendingFacultyRow key={invite.id} invite={invite} readOnly={!canAppointLeaders} onResend={() => onResend(invite.id)} onCancel={() => onCancel(invite.id)} />
          ))}

          {principal && !principalPending ? (
            <PersonRow
              name={principal.fullName}
              detail={principal.email}
              badge={roleName("PRINCIPAL")}
              actions={canAppointLeaders ? [{ id: "revoke", label: ui("Revoke access"), tone: "danger", onSelect: () => onRemove(principal.id, "PRINCIPAL") }] : []}
            />
          ) : principal && principalPending ? (
            <PendingFacultyRow invite={principal} readOnly={!canAppointLeaders} onResend={() => onResend(principal.id)} onCancel={() => onCancel(principal.id)} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-status-warning-border bg-status-warning-surface p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink-strong">{ui("No principal appointed")}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{ui("Until one is appointed, timetable, exams and report-card approvals stay with you.")}</p>
              </div>
              {canAppointLeaders && onInvitePrincipal ? (
                <SystemButton variant="outline" size="sm" type="button" onClick={onInvitePrincipal}>
                  <GraduationCap aria-hidden="true" />{ui("Appoint principal")}
                </SystemButton>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="office-staff-heading" className="sk-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-2xl bg-brand-50 text-primary"><Briefcase className="size-5" /></span>
            <div>
              <h2 id="office-staff-heading" className="text-lg font-bold text-ink-strong">{ui("Office staff")}</h2>
              <p className="text-xs font-medium text-ink-muted">{ui("Accountants, receptionists and librarians on this campus.")}</p>
            </div>
          </div>
          {staff.length ? <Badge variant="info" className="tabular-nums"><bdi>{staff.length}</bdi></Badge> : null}
        </div>
        <div className="space-y-3">
          {staff.map((member: any) => (
            <PersonRow
              key={member.id}
              name={member.fullName}
              detail={member.email}
              badge={roleName(member.role)}
              actions={canInvite ? [{ id: "revoke", label: ui("Revoke access"), tone: "danger", onSelect: () => onRemove(member.id, member.role) }] : []}
            />
          ))}
          {pendingStaff.map((invite: any) => (
            <PendingFacultyRow key={invite.id} invite={invite} readOnly={!canInvite} onResend={() => onResend(invite.id)} onCancel={() => onCancel(invite.id)} />
          ))}
          {!staff.length && !pendingStaff.length ? (
            <EmptyInline text={ui(canInvite ? "No office staff yet. Use Invite staff member to add an accountant, receptionist or librarian." : "No office staff yet.")} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** One person in a staff list: avatar, name, email, role chip and an overflow menu for the rest. */
function PersonRow({ name, detail, badge, actions }: { name: string; detail?: string; badge?: string; actions: MenuItem[] }) {
  const ui = useUiText();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border bg-brand-50">
        <AvatarImage name={detail || name} alt="" className="h-full w-full object-cover" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink-strong"><bdi>{name}</bdi></p>
        {detail ? <p dir="ltr" className="truncate text-start text-xs text-ink-muted">{detail}</p> : null}
      </div>
      {badge ? <Badge variant="neutral" size="sm" className="shrink-0">{badge}</Badge> : null}
      {actions.length ? (
        <Menu
          label={ui("More actions")}
          align="end"
          trigger={<IconButton label={ui("More actions for {0}", [name])}><MoreHorizontal aria-hidden="true" /></IconButton>}
          items={actions}
        />
      ) : null}
    </div>
  );
}

export function AcademicPanel({
  classes,
  teachers,
  students,
  campusName,
  onAddClass,
  onAddStudent,
  onBulkImport,
  onViewClass,
  onChangeTeacher,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
  onAddSection,
  title,
  description,
  secondaryActions,
  headingLevel = 1,
  notice,
}: {
  /** Shown under the page header (e.g. the teacher-conflicts banner), never above the view's title. */
  notice?: ReactNode;
  /** The view's one-sentence description (EN UI key, §4.3); the live class/section count then sits under it. */
  description?: string;
  /** The hosting view's secondaries (e.g. the principal's "Export"), forwarded to the header. */
  secondaryActions?: PageAction[];
  classes: any[];
  teachers: any[];
  students?: any[];
  campusName?: string;
  /** Without it the "Add class" primary is not rendered (read-only consoles). */
  onAddClass?: () => void;
  /** The registry label of the hosting view (defaults to "Classes & subjects"). */
  title?: string;
  /** 1 when this panel is the whole view (its header is the page's one h1). */
  headingLevel?: 1 | 2;
  /** Omitted for a viewer who cannot admit students (§4.5.11): the Add student controls are not rendered. */
  onAddStudent?: (classId?: string) => void;
  onBulkImport?: (classId?: string) => void;
  onViewClass: (cls: any) => void;
  onChangeTeacher: (classId: string, teacherId: string) => Promise<void>;
  onDeleteClass?: (cls: any) => void;
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number; capacity?: number | null }) => Promise<boolean | void>;
  onDeleteSubject?: (subject: any) => void;
  onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
  onAddSection?: (name: string, section: string, academicYear: number, convertClassId?: string) => Promise<void>;
}) {
  const ui = useUiText();
  const classGroups = groupClasses(classes);
  const [classSearch, setClassSearch] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);

  // Exams and report cards moved to their own screens; the state that fed the
  // old inline sections stayed behind and was still being computed on every
  // render, including an unused generate-report-cards request.

  const allSections = classGroups.flatMap((g) => g.sections || []);
  const subjectsTotal = allSections.reduce(
    (sum, sec: any) => sum + (sec._count?.subjects ?? sec.subjects?.length ?? 0),
    0,
  );
  const subjectsWithoutTeacher = allSections.reduce(
    (sum, sec: any) =>
      sum + (sec.subjects || []).filter((sub: any) => !sub.teacherId && !sub.teacher).length,
    0,
  );
  const sectionsWithoutTeacher = allSections.filter((sec: any) => !sec.classTeacherId).length;
  const studentTotal = (students || []).length;

  // A group is "incomplete" when it has no class teacher or an unassigned
  // subject — the two things that stop a timetable being built.
  const groupHasGap = (group: any) =>
    (group.sections || []).some(
      (sec: any) =>
        !sec.classTeacherId ||
        (sec.subjects || []).some((sub: any) => !sub.teacherId && !sub.teacher),
    );

  const visibleGroups = classGroups.filter((group) => {
    if (onlyGaps && !groupHasGap(group)) return false;
    const q = classSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(group.name).toLowerCase().includes(q) ||
      (group.sections || []).some((sec: any) =>
        `${sec.section || ""} ${(sec.subjects || []).map((x: any) => x.name).join(" ")}`
          .toLowerCase()
          .includes(q),
      )
    );
  });

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        icon={School}
        title={title ?? "Classes & subjects"}
        description={description}
        headingLevel={headingLevel}
        tone="classes"
        summary={
          <>
            {ui(classGroups.length === 1 ? "{0} class" : "{0} classes", [classGroups.length])}{" · "}
            {ui(allSections.length === 1 ? "{0} section" : "{0} sections", [allSections.length])}
            {campusName ? <> · <bdi>{campusName}</bdi></> : null}
          </>
        }
        primaryAction={onAddClass ? { id: "add-class", label: "Add class", icon: Plus, onClick: onAddClass } : undefined}
        secondaryActions={secondaryActions}
      />
      {notice}

      {classGroups.length > 0 ? (
        <>
          <StatTiles
            tiles={[
              { key: "classes", icon: School, label: ui("Classes"), value: classGroups.length, hint: ui(allSections.length === 1 ? "{0} section" : "{0} sections", [allSections.length]), tone: "violet" },
              { key: "students", icon: GraduationCap, label: ui("Students enrolled"), value: studentTotal, tone: "teal" },
              {
                key: "subjects",
                icon: BookOpen,
                label: ui("Subjects"),
                value: subjectsTotal,
                hint: subjectsWithoutTeacher ? ui("{0} with no teacher", [subjectsWithoutTeacher]) : ui("All assigned"),
                tone: subjectsWithoutTeacher ? "amber" : "emerald",
              },
              {
                key: "leads",
                icon: UserCheck,
                label: ui("Sections with no class teacher"),
                value: sectionsWithoutTeacher,
                hint: sectionsWithoutTeacher ? ui("Blocks the timetable") : ui("Every section is led"),
                tone: sectionsWithoutTeacher ? "amber" : "emerald",
              },
            ]}
          />

          {classGroups.length > 3 ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <SearchField
                value={classSearch}
                onChange={setClassSearch}
                placeholder={ui("Find a class, section or subject…")}
                autoFocusKey={null}
                className="max-w-xs"
              />
              <ToolbarToggle
                active={onlyGaps}
                icon={AlertTriangle}
                label={ui("Needs attention")}
                count={classGroups.filter(groupHasGap).length}
                onClick={() => setOnlyGaps((v) => !v)}
              />
              {classSearch || onlyGaps ? (
                <SystemButton variant="ghost"
                  type="button"
                  onClick={() => {
                    setClassSearch("");
                    setOnlyGaps(false);
                  }}
                  className="flex items-center gap-1.5 px-3 justify-start"
                >
                  <X className="h-3 w-3" /> {ui("Clear")}
                </SystemButton>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {visibleGroups.length > 0 ? (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {visibleGroups.map((group) => (
            <ClassGroupCard
              key={group.key}
              group={group}
              teachers={teachers}
              students={students || []}
              onAddStudent={onAddStudent}
              onBulkImport={onBulkImport}
              onViewClass={onViewClass}
              onChangeTeacher={onChangeTeacher}
              onDeleteClass={onDeleteClass}
              onUpdateClass={onUpdateClass}
              onDeleteSubject={onDeleteSubject}
              onUpdateSubject={onUpdateSubject}
              onAddSection={onAddSection}
            />
          ))}
        </div>
      ) : classGroups.length > 0 ? (
        <EmptyInline text={ui("No class matches that search. Try clearing it.")} />
      ) : (
        <EmptyState
          icon={BookOpen}
          title={ui("No classes defined")}
          description={ui("Create classes during onboarding or from the class management flow.")}
          action={onAddClass ? <SystemButton type="button" onClick={onAddClass}><Plus aria-hidden="true" />{ui("Add class")}</SystemButton> : undefined}
        />
      )}
    </div>
  );
}

/*
 * F30: ExamDetailModal, ExamCreateModal, the legacy ReportCardsPanel list, HelpModal, ActivityLogModal, AdminRow
 * and SnapshotColumn were reachable from no console (the exams workspace, the header Help menu and the audit
 * dialog own those jobs now); they were removed with the admin page's dead state.
 */

/**
 * Teachers on the campus. The console's PageHeader carries the view's title and its one primary action
 * ("Invite teacher", only with the membership delegation); this panel is the list beneath it. Without
 * `canInvite` the list is read-only: no invite, resend, cancel or revoke controls are rendered (§4.5.11).
 */
export function FacultyPanel({
  teachers,
  pendingInvites,
  onInvite,
  onRemove,
  onViewTeacher,
  onResend,
  onCancel,
  canInvite = true,
}: {
  teachers: any[];
  pendingInvites: any[];
  onInvite: () => void;
  onRemove: (id: string) => void;
  /** Receives the teacher and the list currently on screen. */
  onViewTeacher: (teacher: any, visible?: any[]) => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
  /** `memberships`: invite, resend, cancel and revoke. Default true for existing callers. */
  canInvite?: boolean;
}) {
  const ui = useUiText();
  const [searchQuery, setSearchQuery] = useListField<string>("teachers.search", "", "teachers.page");
  const [facultyFilter, setFacultyFilter] = useListField<"all" | "unassigned" | "classTeachers" | "onboarding">("teachers.filter", "all", "teachers.page");
  const [sortKey, setSortKey] = useListField<"name" | "subjects" | "classes">("teachers.sort", "name", "teachers.page");
  // Rows read well for eight teachers and badly for sixty, where the question
  // is usually "who is carrying what?" — which is a table question.
  const [facultyPrefs, patchFacultyPrefs] = useWorkspacePrefs("faculty", { view: "cards" });

  const q = searchQuery.trim().toLowerCase();
  const matches = (value?: string) => Boolean(value?.toLowerCase().includes(q));

  const subjectCount = (t: any) => t._count?.taughtSubjects ?? t.taughtSubjects?.length ?? 0;
  const classCount = (t: any) => t._count?.ledClasses ?? t.ledClasses?.length ?? 0;

  const filtered = useMemo(() => {
    const result = teachers.filter((t) => {
      if (facultyFilter === "unassigned" && subjectCount(t) > 0) return false;
      if (facultyFilter === "classTeachers" && classCount(t) === 0) return false;
      if (facultyFilter === "onboarding" && t.onboardingComplete) return false;
      if (!q) return true;
      return matches(t.fullName) || matches(t.email) || Boolean(t.phone?.includes(q));
    });
    return result.sort((a, b) => {
      if (sortKey === "subjects") return subjectCount(b) - subjectCount(a) || a.id.localeCompare(b.id);
      if (sortKey === "classes") return classCount(b) - classCount(a) || a.id.localeCompare(b.id);
      return (a.fullName || "").localeCompare(b.fullName || "") || a.id.localeCompare(b.id);
    });
  }, [teachers, q, facultyFilter, sortKey]);
  const teacherPage = useListPage(filtered, "teachers");

  /*
   * Pending invites used to disappear the moment you typed anything, so an
   * admin searching for the person they had just invited found nothing and
   * concluded the invite had failed. They are searchable like everyone else,
   * and only hidden when a filter genuinely does not apply to an invite.
   */
  const filteredInvites = useMemo(() => {
    if (facultyFilter !== "all") return [];
    if (!q) return pendingInvites;
    return pendingInvites.filter((i) => matches(i.email) || matches(i.profile?.fullName));
  }, [pendingInvites, q, facultyFilter]);

  const expiredInvites = pendingInvites.filter((i) => i.expiresAt && new Date() > new Date(i.expiresAt)).length;
  const unassigned = teachers.filter((t) => subjectCount(t) === 0).length;
  const onboarding = teachers.filter((t) => !t.onboardingComplete).length;

  const filtersActive = facultyFilter !== "all" || Boolean(q);
  const nothingToShow = filtered.length === 0 && filteredInvites.length === 0;

  if (teachers.length === 0 && pendingInvites.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={ui("No teachers yet")}
        // §4.5.11: only someone who can invite is told to invite.
        description={canInvite
          ? ui("Invite your teaching staff. Once they are here you can make them class teachers and assign them subjects, which is what the timetable and marks entry are built on.")
          : ui("Teachers appear here once they are invited. Then you can make them class teachers and assign them subjects, which is what the timetable and marks entry are built on.")}
        // The empty state repeats the PageHeader primary with the same label — the one allowed duplicate.
        action={canInvite ? <SystemButton type="button" onClick={onInvite}><Plus aria-hidden="true" />{ui("Invite teacher")}</SystemButton> : undefined}
      />
    );
  }

  return (
    <div className="space-y-6">

      {/* ── At a glance. The last three are chores, so they filter the list. ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          icon={Users}
          label={ui("Teachers on staff")}
          value={teachers.length}
          tone="violet"
          active={facultyFilter === "all"}
          onClick={() => setFacultyFilter("all")}
        />
        <MetricCard
          icon={BookOpen}
          label={ui("No subjects assigned")}
          value={unassigned}
          hint={unassigned ? ui("Tap to filter") : ui("Everyone is teaching")}
          tone={unassigned ? "amber" : "emerald"}
          active={facultyFilter === "unassigned"}
          onClick={unassigned ? () => setFacultyFilter(facultyFilter === "unassigned" ? "all" : "unassigned") : undefined}
        />
        <MetricCard
          icon={Clock}
          label={ui("Invites pending")}
          value={pendingInvites.length}
          hint={expiredInvites ? ui("{0} expired", [expiredInvites]) : pendingInvites.length ? ui("Awaiting sign-up") : ui("None outstanding")}
          tone={expiredInvites ? "amber" : "teal"}
        />
        <MetricCard
          icon={UserCheck}
          label={ui("Onboarding unfinished")}
          value={onboarding}
          hint={onboarding ? ui("Tap to filter") : ui("All set up")}
          tone={onboarding ? "amber" : "emerald"}
          active={facultyFilter === "onboarding"}
          onClick={onboarding ? () => setFacultyFilter(facultyFilter === "onboarding" ? "all" : "onboarding") : undefined}
        />
      </div>

      <div className="sk-panel sk-rise p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <SearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={ui("Name, email or phone…")}
            autoFocusKey={null}
            className="max-w-xs"
          />
          <ToolbarSelect
            label={ui("Show")}
            value={facultyFilter}
            onChange={(v) => setFacultyFilter(v as typeof facultyFilter)}
            options={[
              ["all", "Everyone"],
              ["classTeachers", "Class teachers only"],
              ["unassigned", "No subjects assigned"],
              ["onboarding", "Onboarding unfinished"],
            ]}
          />
          <ToolbarSelect
            label={ui("Sort by")}
            value={sortKey}
            onChange={(v) => setSortKey(v as typeof sortKey)}
            options={[
              ["name", "Name (A–Z)"],
              ["subjects", "Most subjects"],
              ["classes", "Most classes led"],
            ]}
          />
          <Badge variant="neutral" className="tabular-nums">{ui("{0} of {1} shown", [filtered.length, teachers.length])}</Badge>
          {filtersActive ? (
            <SystemButton variant="ghost"
              type="button"
              onClick={() => { setFacultyFilter("all"); setSearchQuery(""); }}
              className="flex items-center gap-1.5 px-3 justify-start"
            >
              <X aria-hidden="true" className="h-3 w-3" /> {ui("Clear")}
            </SystemButton>
          ) : null}
          <div className="ms-auto">
            <ViewSwitch
              value={facultyPrefs.view}
              onChange={(v) => patchFacultyPrefs({ view: v })}
              options={[
                { value: "cards", label: "Cards", icon: LayoutGrid },
                { value: "table", label: "List", icon: ClipboardList },
                ...additionalWorkspaceViews,
              ]}
            />
          </div>
        </div>

        <Pagination {...teacherPage.controls} />
        {facultyPrefs.view !== "cards" && filtered.length > 0 ? (
          <div className="mb-4">
            <DataTable
              view={facultyPrefs.view}
              calendarLabel="Joining date"
              getCalendarDate={(row) => ({ value: row.joiningDate, kind: "date" })}
              rows={teacherPage.rows}
              rowKey={(t: any) => t.id}
              minWidth={780}
              onRowClick={(t: any) => onViewTeacher(t, filtered)}
              columns={[
                {
                  key: "name",
                  label: "Teacher",
                  render: (t: any) => (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink-strong">{t.fullName}</p>
                      <p className="truncate text-2xs font-semibold text-ink-subtle">{t.email}</p>
                    </div>
                  ),
                },
                {
                  key: "phone",
                  label: "Phone",
                  secondary: true,
                  render: (t: any) => (
                    <span className="text-xs font-bold text-ink-muted">{t.phone || "—"}</span>
                  ),
                },
                {
                  key: "subjects",
                  label: "Subjects",
                  align: "center",
                  render: (t: any) => {
                    const n = subjectCount(t);
                    return (
                      <span
                        className={cn(
                          "inline-flex min-w-[28px] justify-center rounded-full px-2 py-0.5 text-2xs font-bold",
                          n === 0 ? "bg-status-warning-surface text-status-warning-text" : "bg-brand-50 text-primary",
                        )}
                      >
                        {n}
                      </span>
                    );
                  },
                },
                {
                  key: "classes",
                  label: "Classes led",
                  align: "center",
                  render: (t: any) => (
                    <span className="text-xs font-bold text-ink">{classCount(t)}</span>
                  ),
                },
                {
                  key: "onboarding",
                  label: "Onboarding",
                  align: "center",
                  render: (t: any) => (
                    <StatusPill status={t.onboardingComplete ? "Complete" : "Unfinished"} />
                  ),
                },
                {
                  key: "actions",
                  label: "",
                  align: "end",
                  render: (t: any) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <SystemButton variant="outline" size="sm"
                        type="button"
                        onClick={() => onViewTeacher(t, filtered)}
                      >
                        {ui("Open")}
                      </SystemButton>
                      {canInvite ? (
                        <Menu
                          label={ui("More actions")}
                          align="end"
                          trigger={<IconButton label={ui("More actions for {0}", [t.fullName])}><MoreHorizontal aria-hidden="true" /></IconButton>}
                          items={[{ id: "revoke", label: ui("Revoke access"), tone: "danger", onSelect: () => onRemove(t.id) }]}
                        />
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        ) : null}

        <div className="space-y-4">
          {facultyPrefs.view !== "cards"
            ? null
            : teacherPage.rows.map((teacher: any) => (
                <FacultyRow key={teacher.id} teacher={teacher} onView={() => onViewTeacher(teacher, filtered)} onRemove={canInvite ? () => onRemove(teacher.id) : undefined} />
              ))}

          {filteredInvites.length ? (
            <>
              <p className="pt-2 ps-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                {ui("Invited, not signed up yet")}
              </p>
              {filteredInvites.map((invite: any) => (
                <PendingFacultyRow
                  key={invite.id}
                  invite={invite}
                  readOnly={!canInvite}
                  onResend={() => onResend(invite.id)}
                  onCancel={() => onCancel(invite.id)}
                />
              ))}
            </>
          ) : null}

          {/* Covers the case the old check missed: no matches at all, whether
              that is teachers, invites, or both. */}
          {nothingToShow ? (
            <EmptyInline
              text={
                filtersActive
                  ? "Nobody matches your search and filters. Try clearing them."
                  : "No teachers to show."
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One headline number, optionally doubling as a filter toggle for the chore it
 * counts. Mirrors the academics `StatCard` so the students and staff sections
 * of the admin read as the same product.
 */
function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "violet",
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "violet" | "teal" | "amber" | "emerald";
  active?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    violet: "bg-brand-100 text-primary",
    teal: "bg-status-info-surface text-status-info-text",
    amber: "bg-status-warning-surface text-status-warning-text",
    emerald: "bg-status-success-surface text-status-success-text",
  } as const;
  const interactive = Boolean(onClick);
  const body = (
    <>
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", tones[tone])}>
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="mt-3 block text-3xl font-extrabold tracking-tight text-ink-strong"><bdi>{value}</bdi></span>
      <span className="mt-1 block text-xs font-semibold text-ink-muted">{label}</span>
      {hint ? <span className="mt-1 block text-2xs font-semibold text-ink-subtle">{hint}</span> : null}
    </>
  );
  // A card with nothing to do is not a button — rendering it as a disabled one announced "dimmed button" to screen
  // readers for what is just a number. The interactive card is the shared Button (no native control here, Rule 4).
  if (interactive) {
    return (
      <SystemButton
        type="button"
        variant="choice"
        aria-pressed={Boolean(active)}
        onClick={onClick}
        className={cn("sk-panel sk-hover-lift h-auto w-full flex-col items-start justify-start gap-0 whitespace-normal p-5 text-start", active && "border-primary shadow-brand")}
      >
        {body}
      </SystemButton>
    );
  }
  return <div className="sk-panel p-5 text-start">{body}</div>;
}

const STUDENT_SORTS = {
  name: { label: "Name (A–Z)", compare: (a: any, b: any) => (a.fullName || "").localeCompare(b.fullName || "") },
  roll: { label: "Roll number", compare: (a: any, b: any) => (a.rollNo || "").localeCompare(b.rollNo || "", undefined, { numeric: true }) },
  newest: {
    label: "Recently added",
    compare: (a: any, b: any) =>
      new Date(b.enrollmentDate || b.createdAt || 0).getTime() - new Date(a.enrollmentDate || a.createdAt || 0).getTime(),
  },
  classOrder: {
    label: "Class, then roll",
    compare: (a: any, b: any) =>
      classLabel(a.class).localeCompare(classLabel(b.class), undefined, { numeric: true }) ||
      (a.rollNo || "").localeCompare(b.rollNo || "", undefined, { numeric: true }),
  },
} as const;

type StudentSortKey = keyof typeof STUDENT_SORTS;

/**
 * The console's AI assistant. `reviewItems` is omitted for a viewer who does not approve AI drafts (a campus
 * admin while a principal is appointed), so no review queue is shown to them; the PageHeader's "New request"
 * focuses the composer (`AI_COMPOSER_INPUT_ID`). `hideHeading` (host-owned mode, §4.3): the hosting PageHeader
 * already carries the title and the one primary, so the home drops its own headline and demotes its spotlight
 * action (no second title, no second primary).
 */
export function AIPanel({
  features,
  insights,
  reviewItems,
  onComplete,
  title = "Campus AI",
  campusId,
  hideHeading = false,
}: {
  features: any[];
  insights: any[];
  reviewItems?: any[];
  onComplete: () => void;
  title?: string;
  campusId?: string | null;
  hideHeading?: boolean;
}) {
  return <AiWorkflowsHome title={title} hideHeading={hideHeading} features={features} insights={insights} reviewItems={reviewItems} canReview={reviewItems !== undefined} campusId={campusId} onComplete={onComplete} />;
}

export function MoveStudentModal({
  student,
  classes,
  classId,
  busy,
  onClassChange,
  onClose,
  onSave,
}: {
  student: any;
  classes: any[];
  classId: string;
  busy: boolean;
  onClassChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const ui = useUiText();
  const currentClassId = student.class?.id || student.classId;
  const classGroups = groupClasses(classes);
  const selectedClass = classes.find((cls) => cls.id === classId);
  const selectedGroupKey = selectedClass ? classGroupKey(selectedClass) : "";
  const selectedGroup = classGroups.find((group) => group.key === selectedGroupKey);
  const isSameClass = classId === currentClassId;

  const selectClassGroup = (key: string) => {
    const group = classGroups.find((item) => item.key === key);
    const firstNonCurrent = group?.sections?.find((s) => s.id !== currentClassId);
    onClassChange(firstNonCurrent?.id || group?.sections?.[0]?.id || "");
  };

  return (
    <ModalFrame
      title={ui("Move student")}
      eyebrow={ui("Class placement")}
      subtitle={ui("Moving a student re-issues their roll number in the new section.")}
      icon={ArrowRightLeft}
      tone="sky"
      onClose={onClose}
    >
      <div className="rounded-3xl bg-brand-50/65 p-5 mb-5">
        <p className="text-sm font-bold text-ink-strong">{student.fullName}</p>
        <p className="mt-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
          {ui("Current: {0} · Roll: {1}", [classLabel(student.class), student.rollNo])}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormSelect label={ui("New class")} value={selectedGroupKey} onChange={selectClassGroup}>
          <option value="">{ui("Select class")}</option>
          {classGroups.map((group) => (
            <option key={group.key} value={group.key}>
              {group.name} - {group.academicYear}
            </option>
          ))}
        </FormSelect>
        <FormSelect label={ui("New section")} value={classId} onChange={onClassChange}>
          <option value="">{ui("Select section")}</option>
          {(selectedGroup?.sections || []).map((cls) => (
            <option key={cls.id} value={cls.id} disabled={cls.id === currentClassId}>
              {cls.section ? ui("Section {0}", [cls.section]) : ui("Whole class")}{cls.id === currentClassId ? " " + ui("(current)") : ""}
            </option>
          ))}
        </FormSelect>
      </div>
      {isSameClass && classId ? (
        <p className="mt-3 text-xs font-semibold text-status-warning-text">{ui("Please select a different class or section to move the student.")}</p>
      ) : null}
      <ModalActions busy={busy || !classId || isSameClass} busyLabel={ui("Moving")} actionLabel={ui("Move student")} onClose={onClose} onSave={onSave} />
    </ModalFrame>
  );
}

export function ClassDetailModal({
  cls,
  students,
  teachers,
  classes,
  teacherBusy,
  subjectBusyId,
  creatingSubject,
  teachingModeBusy,
  classUpdateBusy,
  subjectUpdateBusyId,
  onClose,
  onChangeTeacher,
  onChangeTeachingMode,
  onCreateSubject,
  onChangeSubjectTeacher,
  onAddStudent,
  onViewStudent,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
}: {
  cls: any;
  students: any[];
  teachers: any[];
  classes?: any[];
  teacherBusy: boolean;
  subjectBusyId: string | null;
  creatingSubject: boolean;
  teachingModeBusy?: boolean;
  classUpdateBusy: boolean;
  subjectUpdateBusyId: string | null;
  onClose: () => void;
  onChangeTeacher: (classId: string, classTeacherId: string) => void;
  onChangeTeachingMode: (classId: string, mode: "SINGLE" | "SUBJECT") => void;
  onCreateSubject: (
    classId: string,
    subject: { name: string; totalMarks: number; teacherId: string; applyToAllSections?: boolean }
  ) => Promise<boolean>;
  onChangeSubjectTeacher: (classId: string, subjectId: string, teacherId: string) => void;
  /** §4.5.11: omitted for a viewer the server refuses (the principal); the control is then not rendered. */
  onAddStudent?: () => void;
  onViewStudent: (student: any) => void;
  /** Omitted for a read-only viewer: no Delete class control. */
  onDeleteClass?: (cls: any) => void;
  /** Omitted for a read-only viewer: no Edit control for the class details. */
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number; capacity?: number | null }) => Promise<boolean | void>;
  onDeleteSubject: (subject: any) => void;
  onUpdateSubject: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const ui = useUiText();
  type ManageTab = "overview" | "subjects" | "students";
  const [tab, setTab] = useState<ManageTab>("overview");
  // Campus-wide teacher load/clash data, refreshed after each assignment so
  // warnings reflect the change the admin just made.
  const { availability, refresh: refreshAvailability } = useTeacherAvailability();

  // Teaching mode is a saved property of the section, not a view toggle:
  // SINGLE  = the class teacher takes every subject
  // SUBJECT = each subject has its own teacher
  const teachingMode: "SINGLE" | "SUBJECT" = cls.teachingMode === "SUBJECT" ? "SUBJECT" : "SINGLE";

  const [subjectName, setSubjectName] = useState("");
  const [subjectMarks, setSubjectMarks] = useState("100");
  const [newSubjectTeacherId, setNewSubjectTeacherId] = useState("");
  const [applyToAllSections, setApplyToAllSections] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editSubjectName, setEditSubjectName] = useState("");
  const [editSubjectMarks, setEditSubjectMarks] = useState("100");

  // Only reset the add-subject teacher default when a *different* class is
  // opened. Keying on cls.id alone (not the subjects array, whose identity
  // changes on every parent refetch) is what stops in-progress edits from
  // being wiped mid-interaction.
  useEffect(() => {
    setNewSubjectTeacherId(cls.classTeacher?.id || "");
    setTab("overview");
    setEditingSubjectId(null);
    setApplyToAllSections(false);
  }, [cls.id]);

  const siblingSections = useMemo(
    () => (classes || []).filter((c: any) => classGroupKey(c) === classGroupKey(cls)),
    [classes, cls]
  );

  const createSubject = async () => {
    const created = await onCreateSubject(cls.id, {
      name: subjectName,
      totalMarks: Number(subjectMarks) || 100,
      teacherId: teachingMode === "SINGLE" ? cls.classTeacher?.id || "" : newSubjectTeacherId,
      applyToAllSections,
    });
    if (created) {
      setSubjectName("");
      setSubjectMarks("100");
    }
  };

  const [editingClass, setEditingClass] = useState(false);
  const [editClassName, setEditClassName] = useState(cls.name || "");
  const [editClassSection, setEditClassSection] = useState(cls.section || "");
  const [editClassAcademicYear, setEditClassAcademicYear] = useState(String(cls.academicYear || new Date().getFullYear()));
  const [editClassCapacity, setEditClassCapacity] = useState(cls.capacity ? String(cls.capacity) : "");

  useEffect(() => {
    if (!editingClass) {
      setEditClassCapacity(cls.capacity ? String(cls.capacity) : "");
      setEditClassName(cls.name || "");
      setEditClassSection(cls.section || "");
      setEditClassAcademicYear(String(cls.academicYear || new Date().getFullYear()));
    }
  }, [cls.id, editingClass]);

  const saveClassEdit = async () => {
    if (!onUpdateClass) return;
    const saved = await onUpdateClass(cls.id, {
      name: editClassName,
      section: editClassSection,
      academicYear: Number(editClassAcademicYear) || new Date().getFullYear(),
      capacity: editClassCapacity.trim() ? Number(editClassCapacity) : null,
    });
    if (saved !== false) setEditingClass(false);
  };

  const startEditingSubject = (subject: any) => {
    setEditingSubjectId(subject.id);
    setEditSubjectName(subject.name);
    setEditSubjectMarks(String(subject.totalMarks || 100));
  };

  const saveEditingSubject = async (subjectId: string) => {
    await onUpdateSubject(cls.id, subjectId, {
      name: editSubjectName,
      totalMarks: Number(editSubjectMarks) || 100,
    });
    setEditingSubjectId(null);
  };

  const subjectCount = cls.subjects?.length || 0;
  const unassignedCount = (cls.subjects || []).filter((s: any) => !s.teacher?.id).length;

  const TABS: { key: ManageTab; label: string; icon: LucideIcon; badge?: number }[] = [
    { key: "overview", label: "Overview", icon: LayoutGrid },
    { key: "subjects", label: "Subjects", icon: BookOpen, badge: subjectCount },
    { key: "students", label: "Students", icon: GraduationCap, badge: students.length },
  ];

  return (
    <ModalFrame title={classLabel(cls)} eyebrow={ui("Manage class")} icon={School} onClose={onClose} wide>
      {/* Tabs — the modal used to be one long scroll mixing class settings,
          subjects and students together, which made it hard to tell what a
          given control actually affected. */}
      <div className="mb-5 flex items-center gap-2 rounded-2xl bg-muted p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <SystemButton variant="ghost"
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5",
                active ? "bg-card text-primary shadow-sm" : "text-ink-muted hover:text-primary"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.badge !== undefined ? (
                <span className={cn("rounded-full px-1.5 py-0.5 text-3xs", active ? "bg-brand-50 text-primary" : "bg-card/70 text-ink-subtle")}>
                  {t.badge}
                </span>
              ) : null}
            </SystemButton>
          );
        })}
      </div>

      {tab === "overview" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MiniMetric label={ui("Students")} value={students.length} active />
            <MiniMetric label={ui("Subjects")} value={subjectCount} />
            <MiniMetric label={ui("Academic Year")} value={cls.academicYear || "N/A"} />
          </div>

          {/* Teaching mode — the single most important setting on this screen,
              so it leads and explains itself rather than sitting as an
              unexplained toggle next to the teacher field. */}
          <div className="rounded-3xl bg-brand-50/65 p-5">
            <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("How is this section taught?")}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                { mode: "SINGLE" as const, title: "One teacher", copy: "The class teacher takes every subject in this section." },
                { mode: "SUBJECT" as const, title: "Teacher per subject", copy: "Each subject is assigned its own teacher." },
              ]).map((option) => {
                const active = teachingMode === option.mode;
                return (
                  <SystemButton variant="ghost"
                    key={option.mode}
                    type="button"
                    disabled={teachingModeBusy}
                    onClick={() => { if (!active) onChangeTeachingMode(cls.id, option.mode); }}
                    className={cn(
                      "p-4 text-start",
                      active
                        ? "border-primary bg-card shadow-brand"
                        : "border-transparent bg-card/60 hover:border-primary/25 hover:bg-card"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-sm font-bold", active ? "text-primary" : "text-ink-strong")}>{option.title}</p>
                      {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : null}
                    </div>
                    <p className="mt-1 text-2xs font-bold leading-relaxed text-ink-muted">{option.copy}</p>
                  </SystemButton>
                );
              })}
            </div>
            {teachingMode === "SINGLE" ? (
              <p className="mt-3 rounded-2xl bg-card/70 p-3 text-2xs font-bold leading-relaxed text-ink-muted">
                {ui("Every subject below follows the class teacher automatically — changing the class teacher updates them all.")}
              </p>
            ) : null}
          </div>

          {/* Class teacher — saves on selection, no separate Save click. In
              SUBJECT mode this is an optional homeroom/coordinator, kept clearly
              distinct from the per-subject teachers set on the Subjects tab. */}
          <div className="rounded-3xl bg-brand-50/65 p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {teachingMode === "SINGLE" ? ui("Class Teacher") : ui("Homeroom teacher (optional)")}
                </p>
                <p className="mt-1 truncate text-base font-bold tracking-tight text-ink-strong">
                  {cls.classTeacher?.fullName || ui("Unassigned")}
                </p>
                <p className="mt-1 truncate text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {teachingMode === "SINGLE"
                    ? (cls.classTeacher?.email || ui("Assign a teacher to make this roster visible in the teacher dashboard."))
                    : ui("Optional coordinator for this section. Subject teachers are assigned on the Subjects tab.")}
                </p>
              </div>
              {cls.classTeacher?.profileImageUrl ? (
                <div className="hidden h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-card shadow-sm sm:block">
                  <AvatarImage src={cls.classTeacher.profileImageUrl} name={cls.classTeacher.fullName} alt={ui("Teacher photo")} initialsClassName="text-base" />
                </div>
              ) : null}
            </div>
            <div className="relative">
              <TeacherPicker
                label={teacherBusy ? "Saving…" : (teachingMode === "SINGLE" ? "Change Class Teacher" : "Change Homeroom Teacher")}
                teachers={teachers}
                availability={availability}
                assignmentMode={teachingMode === "SINGLE" ? "homeroom" : "subject"}
                currentClassId={cls.id}
                value={cls.classTeacher?.id || ""}
                onChange={(value) => {
                  if (value !== (cls.classTeacher?.id || "")) {
                    onChangeTeacher(cls.id, value);
                    setTimeout(refreshAvailability, 600);
                  }
                }}
                allowUnassigned
                showUnassignedHint={!cls.classTeacher?.id}
              />
              {teachingMode === "SUBJECT" ? (
                <p className="mt-2 text-2xs font-bold leading-relaxed text-ink-muted">
                  {ui("This is the section coordinator, separate from the subject teachers listed on the Subjects tab.")}
                </p>
              ) : null}
              {teacherBusy ? (
                <Loader2 className="absolute end-4 top-[42px] h-4 w-4 animate-spin text-primary" />
              ) : null}
            </div>
          </div>

          {/* Class identity + destructive actions, kept together at the bottom. */}
          <div className="sk-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <PanelTitle icon={School} title={ui("Class details")} />
              {onUpdateClass ? (
                <SystemButton variant="ghost"
                  type="button"
                  onClick={() => setEditingClass(!editingClass)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 justify-start",
                    editingClass ? "bg-muted text-ink-muted" : "bg-brand-50 text-primary hover:bg-brand-100"
                  )}
                >
                  {editingClass ? ui("Cancel") : ui("Edit")}
                </SystemButton>
              ) : null}
            </div>
            {editingClass && onUpdateClass ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <FormInput label={ui("Class Name")} value={editClassName} placeholder={ui("e.g. Class 10")} onChange={setEditClassName} />
                  <FormInput label={ui("Section")} value={editClassSection} placeholder="e.g. A" onChange={setEditClassSection} />
                  <FormInput label={ui("Academic Year")} type="number" value={editClassAcademicYear} placeholder="2026" onChange={setEditClassAcademicYear} />
                  <FormInput label={ui("Capacity (seats per class)")} type="number" value={editClassCapacity} placeholder={ui("Optional, e.g. 35")} onChange={setEditClassCapacity} />
                </div>
                <div className="flex justify-end">
                  <BrandButton variant="dark" className="h-12" onClick={saveClassEdit} disabled={classUpdateBusy}>
                    {classUpdateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : ui("Save class details")}
                  </BrandButton>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-ink-muted">
                  {cls.name}{cls.section ? " · " + ui("Section {0}", [cls.section]) : ""} · {cls.academicYear}
                  {" · "}{cls.capacity ? ui("{0} of {1} seats filled", [cls._count?.students ?? 0, cls.capacity]) : ui("Capacity not set")}
                </p>
                {onDeleteClass ? (
                  <SystemButton variant="ghost"
                    type="button"
                    onClick={() => onDeleteClass(cls)}
                    className="flex shrink-0 items-center gap-1.5 px-3 justify-start"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    {ui("Archive class")}
                  </SystemButton>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "subjects" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PanelTitle icon={BookOpen} title={ui("Subjects")} />
            <div className="flex items-center gap-2">
              {unassignedCount > 0 && teachingMode === "SUBJECT" ? (
                <Badge variant="warning" dot className="tabular-nums">
                  {ui("{0} unassigned", [unassignedCount])}
                </Badge>
              ) : null}
              <StatusPill status={teachingMode === "SINGLE" ? "One Teacher" : "Per Subject"} />
            </div>
          </div>

          {teachingMode === "SINGLE" ? (
            <p className="rounded-2xl bg-brand-50/60 p-4 text-2xs font-bold leading-relaxed text-ink-muted">
              {fillNodes(ui("All subjects are taught by {0}. Switch to “Teacher per subject” on the Overview tab to assign them individually."), <span className="text-primary"><bdi>{cls.classTeacher?.fullName || ui("the class teacher (unassigned)")}</bdi></span>)}
            </p>
          ) : null}

          <div className="space-y-3">
            {cls.subjects?.map((subject: any) => {
              const isEditing = editingSubjectId === subject.id;
              return (
                <div key={subject.id} className="rounded-2xl bg-brand-50/55 p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <FormInput label={ui("Subject Name")} value={editSubjectName} placeholder={ui("Subject name")} onChange={setEditSubjectName} />
                        <FormInput label={ui("Total Marks")} type="number" value={editSubjectMarks} placeholder="100" onChange={setEditSubjectMarks} />
                      </div>
                      <div className="flex gap-2">
                        <BrandButton
                          variant="dark"
                          className="h-11 flex-1"
                          onClick={() => saveEditingSubject(subject.id)}
                          disabled={subjectUpdateBusyId === subject.id}
                        >
                          {subjectUpdateBusyId === subject.id ? <Loader2 className="h-4 w-4 animate-spin" /> : ui("Save")}
                        </BrandButton>
                        <SystemButton variant="ghost"
                          type="button"
                          onClick={() => setEditingSubjectId(null)}
                          className="h-11 px-4"
                        >
                          {ui("Cancel")}
                        </SystemButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink-strong">{subject.name}</p>
                          <p className="mt-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                            {subject.teacher?.fullName || ui("Teacher unassigned")} {subject.totalMarks ? "- " + ui("{0} marks", [subject.totalMarks]) : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <IconButton label={ui("Edit subject")} variant="ghost" onClick={() => startEditingSubject(subject)}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </IconButton>
                          <IconButton label={ui("Delete subject")} variant="ghost" onClick={() => onDeleteSubject(subject)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </IconButton>
                        </div>
                      </div>
                      {teachingMode === "SUBJECT" ? (
                        <div className="relative mt-4">
                          <TeacherPicker
                            label={subjectBusyId === subject.id ? "Saving…" : "Subject Teacher"}
                            teachers={teachers}
                            availability={availability}
                            assignmentMode="subject"
                            subjectName={subject.name}
                            value={subject.teacher?.id || ""}
                            onChange={(value) => {
                              if (value !== (subject.teacher?.id || "")) {
                                onChangeSubjectTeacher(cls.id, subject.id, value);
                                setTimeout(refreshAvailability, 600);
                              }
                            }}
                            allowUnassigned
                            showUnassignedHint={!subject.teacher?.id}
                          />
                          {subjectBusyId === subject.id ? (
                            <Loader2 className="absolute end-4 top-[42px] h-4 w-4 animate-spin text-primary" />
                          ) : null}
                        </div>
                      ) : null}
                      <SubjectSyllabus subjectId={subject.id} />
                    </>
                  )}
                </div>
              );
            })}
            {!subjectCount ? <EmptyInline text={ui("No subjects are attached to this class yet.")} /> : null}
          </div>

          <div className="sk-panel p-4">
            <PanelTitle icon={Plus} title={ui("Add Subject")} />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormInput label={ui("Subject Name")} value={subjectName} placeholder={ui("e.g. Mathematics")} onChange={setSubjectName} />
              <FormInput label={ui("Total Marks")} type="number" value={subjectMarks} placeholder="100" onChange={setSubjectMarks} />
            </div>
            {teachingMode === "SUBJECT" ? (
              <div className="mt-3">
                <TeacherPicker label={ui("Subject Teacher (optional)")} teachers={teachers} availability={availability} assignmentMode="subject" subjectName={subjectName} value={newSubjectTeacherId} onChange={setNewSubjectTeacherId} allowUnassigned />
              </div>
            ) : null}
            {siblingSections.length > 1 ? (
              <SystemButton variant="ghost"
                type="button"
                onClick={() => setApplyToAllSections((v) => !v)}
                className="mt-3 flex w-full items-center gap-3 p-3 text-start justify-start"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                    applyToAllSections ? "border-primary bg-primary" : "border-edge/50 bg-card"
                  )}
                >
                  {applyToAllSections ? <Check className="h-3 w-3 text-white" strokeWidth={3.5} /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-2xs font-bold text-ink-strong">
                    {ui("Add to all {0} sections of {1}", [siblingSections.length, cls.name])}
                  </span>
                  <span className="block text-2xs font-bold text-ink-muted">
                    {ui("Sections that already have this subject are skipped.")}
                  </span>
                </span>
              </SystemButton>
            ) : null}
            <div className="mt-3 flex justify-end">
              <BrandButton variant="dark" className="h-12" onClick={createSubject} disabled={creatingSubject}>
                {creatingSubject ? <Loader2 className="h-4 w-4 animate-spin" /> : ui("Add Subject")}
              </BrandButton>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "students" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <PanelTitle icon={GraduationCap} title={ui("Students")} />
            {onAddStudent ? (
              <BrandButton variant="soft" icon={<Plus aria-hidden="true" />} onClick={onAddStudent}>
                {ui("Add student")}
              </BrandButton>
            ) : null}
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto pe-1 custom-scrollbar">
            {students.map((student) => (
              <SystemButton variant="ghost"
                key={student.id}
                type="button"
                onClick={() => onViewStudent(student)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start justify-start"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-white bg-card shadow-sm">
                  <img
                    src={resolveMediaUrl(student.profileImageUrl) ?? undefined}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-strong">{student.fullName}</p>
                  <p className="mt-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                    {ui("Roll {0} · Guardian {1}", [student.rollNo, student.guardianName || ui("Not recorded")])}
                  </p>
                </div>
              </SystemButton>
            ))}
            {students.length === 0 ? <EmptyInline text={ui("No students are enrolled in this class yet.")} /> : null}
          </div>
        </div>
      ) : null}
    </ModalFrame>
  );
}

/**
 * Taking a student off the roll without deleting them. The API has always
 * accepted these, but the admin had no way to reach them — the only exit from
 * the directory was a permanent delete, which loses the student's history.
 */
const STUDENT_STATUS_CHANGES = {
  archived: {
    label: "Archive",
    icon: Archive,
    title: "Archive this student?",
    // EN UI key with {0} = the student's name (translated where shown).
    describe: "{0} comes off the active roll and stops appearing in class lists, attendance and marks entry. Their record, results and history are kept, and you can restore them at any time from Year end & promotion.",
  },
  transferred: {
    label: "Mark transferred",
    icon: ArrowRightLeft,
    title: "Mark as transferred out?",
    describe: "{0} is recorded as having left for another school. They come off the active roll but keep their full history, and can be restored later.",
  },
  graduated: {
    label: "Mark graduated",
    icon: Award,
    title: "Mark as graduated?",
    describe: "{0} is recorded as having completed their schooling here. They come off the active roll and their results stay on file.",
  },
  active: {
    label: "Restore to roll",
    icon: RotateCcw,
    title: "Restore this student?",
    describe: "{0} goes back onto the active roll and will appear again in class lists, attendance and marks entry.",
  },
} as const;

type StudentStatusChange = keyof typeof STUDENT_STATUS_CHANGES;

function studentDraftValues(record: any): Record<string, string> {
  return {
      fullName: record.fullName || "",
      nameUr: record.nameUr || "",
      rollNo: record.rollNo || "",
      dateOfBirth: record.dateOfBirth ? new Date(record.dateOfBirth).toISOString().split("T")[0] : "",
      gender: record.gender || "",
      bloodType: record.bloodType || "",
      nationality: record.nationality || "",
      emiratesId: record.emiratesId || "",
      regulatorId: record.regulatorId || "",
      phone: record.phone || "",
      guardianName: record.guardianName || "",
      guardianNameUr: record.guardianNameUr || "",
      guardianPhone: record.guardianPhone || "",
      guardianEmail: record.guardianEmail || "",
      guardianRelationship: record.guardianRelationship || "",
      guardianOccupation: record.guardianOccupation || "",
      city: record.city || "",
      province: record.province || "",
      postalCode: record.postalCode || "",
      address: record.address || "",
      medicalNotes: record.medicalNotes || "",
      specialNeeds: record.specialNeeds || "",
      allergies: record.allergies || "",
      medications: record.medications || "",
      previousSchool: record.previousSchool || "",
      categoryId: record.category?.id || "",
      groupId: record.group?.id || "",
  };
}

export function StudentDetailModal({
  student: summary,
  busy,
  sequence,
  onNavigate,
  onClose,
  onMove,
  onDelete,
  onUpdate,
  onOpenGuardians,
  readOnly = false,
}: {
  student: any;
  busy: boolean;
  /** The students currently on screen, so the profile can step through them. */
  sequence?: { id: string; label: string }[];
  onNavigate?: (studentId: string) => void;
  onClose: () => void;
  onMove: () => void;
  onDelete: (student: any) => void;
  onUpdate: (studentId: string, updates: Record<string, any>) => Promise<void>;
  /** M34: opens Guardians & access for this child (replaces the retired "Parent Portal Link", D14). */
  onOpenGuardians?: () => void;
  /** Read-only profile (principal): no Move, Archive, status change or Edit controls. */
  readOnly?: boolean;
}) {
  const ui = useUiText();
  const { date: formatCalendarDate } = useLocaleFormat();
  // The roster carries a summary; address, medical notes, allergies,
  // medications and special needs live only on the full record and are fetched
  // when a profile is actually opened. Render the summary immediately and merge
  // the rest in when it lands, so the modal never shows a spinner for fields it
  // already has.
  const [full, setFull] = useState<any>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const student = full ?? summary;
  const report = student.reportCards?.[0];
  const avatar = student.profileImageUrl;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<{ categories: any[]; groups: any[] }>({ categories: [], groups: [] });
  const [tagsLoading, setTagsLoading] = useState(true);
  const [profileTab, setProfileTab] = useState<"overview" | "siblings" | "documents" | "timeline">("overview");
  const [siblingsVersion, setSiblingsVersion] = useState(0);
  const [statusChange, setStatusChange] = useState<StudentStatusChange | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const currentStatus = (student.status || "active").toLowerCase();
  const isActive = currentStatus === "active";

  useEffect(() => {
    let active = true;
    setFull(null);
    setDetailError(null);
    fetch(`/api/students/${summary.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json.success) setFull(json.data);
        else setDetailError(ui(json.error || "Could not load the full profile"));
      })
      .catch(() => {
        if (active) setDetailError(ui("Could not load the full profile"));
      });
    return () => {
      active = false;
    };
  }, [summary.id, ui]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/student-categories").then((r) => r.json()),
      fetch("/api/student-groups").then((r) => r.json()),
    ])
      .then(([cats, grps]) => {
        if (!active) return;
        setTags({
          categories: readApiData(cats, []),
          groups: readApiData(grps, []),
        });
      })
      .catch(() => {})
      .finally(() => {
        if (active) setTagsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [summary.id]);

  const baseline = studentDraftValues(student);
  const pupilDraft = useFormDraft({ record: `student:${summary.id}`, schema: 1, enabled: !!full && full.id === summary.id,
    values: edits, baseline,
    fields: ["fullName", "nameUr", "rollNo", "dateOfBirth", "gender", "nationality", "emiratesId", "regulatorId", "phone", "guardianName", "guardianNameUr", "guardianPhone", "guardianEmail", "guardianRelationship", "guardianOccupation", "city", "province", "postalCode", "address", "previousSchool", "categoryId", "groupId"],
    apply: (next) => { setEdits(next); setEditing(true); setProfileTab("overview"); },
    current: async () => {
      const response = await fetch(`/api/students/${summary.id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error([401, 403, 404].includes(response.status) ? "Access revoked" : "Server unavailable");
      return studentDraftValues(result.data);
    },
  });
  useEffect(() => { setEdits(studentDraftValues(student)); }, [student.id, full]);

  const ed = (field: string) => edits[field] || "";
  const setEd = (field: string, value: string) => setEdits((p) => ({ ...p, [field]: value }));

  const saveEdits = async () => {
    // SKAI-1149: normalise regulator IDs first, so a typed "784199..." matches the dashed value the server stores.
    let next: Record<string, string>;
    try { next = { ...edits, emiratesId: parseEmiratesId(edits.emiratesId) ?? "", regulatorId: parseRegulatorId(edits.regulatorId) ?? "" }; }
    catch (error) { toast.error(ui((error as Error).message)); return; }
    setEdits(next);
    const updates: Record<string, any> = {};
    const strFields = [
      "fullName", "nameUr", "rollNo", "gender", "bloodType", "nationality", "emiratesId", "regulatorId", "phone",
      "guardianName", "guardianNameUr", "guardianPhone", "guardianEmail",
      "guardianRelationship", "guardianOccupation",
      "city", "province", "postalCode", "address",
      "medicalNotes", "specialNeeds", "allergies", "medications", "previousSchool",
    ];
    for (const f of strFields) updates[f] = next[f] || null;
    if (next.fullName) updates.fullName = next.fullName;
    if (next.rollNo) updates.rollNo = next.rollNo;
    if (next.dateOfBirth) updates.dateOfBirth = next.dateOfBirth;
    updates.categoryId = next.categoryId || null;
    updates.groupId = next.groupId || null;
    updates.expectedValues = pupilDraft.baseline;
    try {
      await onUpdate(student.id, updates);
      // Some legacy callers catch their own request failure. Verify durability
      // before deleting the only recoverable copy of the input.
      const response = await fetch(`/api/students/${student.id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("Could not verify the saved record. Your draft is retained.");
      const saved = studentDraftValues(result.data);
      if (Object.keys(next).some(k => String(saved[k] ?? "") !== String(next[k] ?? ""))) { await pupilDraft.reviewCurrent(); throw new Error("The server has not confirmed these values. Review your draft against the current record."); }
      pupilDraft.markSaved(); setFull(result.data); setEditing(false);
    } catch (error) { toast.error(friendlyErrorMessage(error, ui("Could not save the changes. Your draft is kept."))); }
  };

  // R7: dates follow the school's locale package, never a hard-coded "en-PK".
  const formatDob = (d: any) => (d ? formatCalendarDate(d) : ui("Not recorded"));

  const genderLabel = (g: string) => {
    if (g === "MALE") return "Male";
    if (g === "FEMALE") return "Female";
    if (g === "OTHER") return "Other";
    return g || "Not recorded";
  };

  const relationshipLabel = (r: string) => {
    const map: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian", UNCLE: "Uncle", AUNT: "Aunt", GRANDPARENT: "Grandparent", SIBLING: "Sibling" };
    return map[r] || r || "N/A";
  };

  return (
    <ModalFrame
      title={student.fullName}
      eyebrow={ui("Student profile")}
      subtitle={`${student.rollNo || ui("No roll number")} · ${classLabel(student.class)}`}
      avatar={<AvatarImage src={avatar} name={student.fullName} initialsClassName="text-lg" />}
      chips={
        <>
          {student.nameUr ? (
            <span className="text-sm font-bold text-ink" dir="rtl">{student.nameUr}</span>
          ) : null}
          {student.category?.name ? (
            <Badge variant="success">
              {student.category.name}
            </Badge>
          ) : null}
          {student.group?.name ? (
            <Badge variant="info">
              {student.group.name}
            </Badge>
          ) : null}
        </>
      }
      tone={isActive ? "violet" : "amber"}
      onClose={onClose}
      dirty={pupilDraft.dirty}
      headerActions={
        sequence && onNavigate ? (
          <ModalPager
            sequence={sequence}
            currentId={student.id}
            onNavigate={onNavigate}
            noun="student"
          />
        ) : null
      }
      wide
    >
      {/* Pinned inside the scroll area: on a profile this long the actions
          and the tab strip used to scroll out of reach within one flick. */}
      {/* At narrow widths and enlarged text this action strip can grow taller than
          the usable viewport. Keeping it in normal flow prevents it from covering
          the next keyboard-focused field; desktop retains the pinned actions. */}
      <div className="relative z-10 mb-4 -mx-6 -mt-6 border-b border-edge/15 bg-card/95 px-6 pb-3 pt-6 backdrop-blur sm:sticky sm:top-0 sm:-mx-7 sm:px-7">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {readOnly ? null : (
            <SystemButton variant="outline" size="sm" type="button" onClick={onMove}>
              <ArrowRightLeft aria-hidden="true" />{ui("Move class")}
            </SystemButton>
          )}
          {onOpenGuardians ? (
            <SystemButton variant="outline" size="sm" type="button" onClick={onOpenGuardians}>
              <Users aria-hidden="true" />{ui("Guardians")}
            </SystemButton>
          ) : null}
          {/*
            Leaving the roll is the common case and archiving is reversible, so
            it leads. Delete is destructive and irreversible, so it is last and
            visually quiet rather than a headline action.
          */}
          {(readOnly ? [] : isActive
            ? (["archived", "transferred", "graduated"] as StudentStatusChange[])
            : (["active"] as StudentStatusChange[])
          ).map((key) => {
            const action = STUDENT_STATUS_CHANGES[key];
            const Icon = action.icon;
            return (
              <SystemButton variant="outline" size="sm"
                key={key}
                type="button"
                // SKO-389: archiving opens the server's dependency preview (marks, invoices, reports) first.
                onClick={() => (key === "archived" ? onDelete(student) : setStatusChange(key))}
                {...(key === "archived" ? { "data-archive-student": true } : {})}
                className={key === "active" ? "text-status-success-text" : "text-status-warning-text"}
              >
                <Icon aria-hidden="true" />
                {ui(action.label)}
              </SystemButton>
            );
          })}
        </div>
        {/* ml-auto, not just justify-between: once the row wraps, a
            justify-between child starts at the left edge of the new line, so
            Edit Details lost its separation and the whole strip read as one
            undifferentiated wall of buttons. */}
        {readOnly ? null : <SystemButton variant="ghost"
          type="button"
          // Editing is held back until the full record is in hand. A save
          // writes every field it holds, so editing a half-loaded profile
          // would blank the ones that had not arrived.
          disabled={!editing && !full}
          title={!full ? ui("Loading the full profile…") : undefined}
          onClick={() => {
            // The editable fields only exist on Overview. Turning on edit mode
            // from Siblings/Documents/Timeline otherwise showed the Cancel and
            // Save Changes footer over a tab with nothing editable on it.
            if (!editing) setProfileTab("overview");
            setEditing(!editing);
          }}
          className={cn(
            "ms-auto flex shrink-0 items-center gap-1.5 px-3 justify-start",
            editing ? "bg-muted text-ink-muted" : "bg-brand-50 text-primary hover:bg-brand-100"
          )}
        >
          <Pencil className="h-3.5 w-3.5" />{editing ? ui("Cancel") : ui("Edit details")}
        </SystemButton>}
      </div>
      <DraftRecovery draft={pupilDraft} saving={busy} excluded="Health notes, allergies, medications and special needs are not stored in device drafts." />
      {detailError ? (
        <p
          role="alert"
          className="mx-6 mb-2 rounded-lg bg-status-error-surface px-3 py-2 text-2xs font-bold text-status-error-text"
        >
          {ui("{0} — address, medical and guardian detail may be missing, so editing is disabled. Close and reopen the profile to retry.", [detailError])}
        </p>
      ) : null}

      {/* The shared tab strip (translated labels, roving focus, a Select on phones) instead of hand-made pills. */}
      <ViewTabs
        items={[
          { id: "overview", label: "Overview" },
          { id: "siblings", label: "Siblings" },
          { id: "documents", label: "Documents" },
          { id: "timeline", label: "Timeline" },
        ]}
        value={profileTab}
        onChange={(id) => setProfileTab(id as typeof profileTab)}
        ariaLabel="Student profile sections"
      />
      </div>

      {profileTab !== "overview" ? (
        <StudentAdmissionsPanel
          student={student}
          tab={profileTab}
          onUpdate={onUpdate}
          version={siblingsVersion}
          onVersionBump={() => setSiblingsVersion((v) => v + 1)}
        />
      ) : (
      <>
      {/*
        Name, roll, class, photo and tags all live in the dialog header now.
        This block used to repeat them a third time — once in the header, once
        as chips here, and once again in the metric row below.
      */}
      {editing ? (
        <div className="mb-5 space-y-3 rounded-[24px] border border-edge/25 bg-surface-subtle p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput label={ui("Full name (English)")} value={ed("fullName")} placeholder={ui("Student name")} onChange={(v) => setEd("fullName", v)} />
            <FormInput label={ui("Full name (Urdu)")} value={ed("nameUr")} placeholder="اردو نام" onChange={(v) => setEd("nameUr", v)} />
          </div>
          <FormInput label={ui("Roll number")} value={ed("rollNo")} placeholder={ui("Roll number")} onChange={(v) => setEd("rollNo", v)} />
        </div>
      ) : null}

      {/* Say plainly when this profile is not on the active roll. */}
      {!isActive ? (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-status-warning-border bg-status-warning-surface px-4 py-3">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-status-warning-text" />
          <p className="text-xs font-semibold text-status-warning-text">
            {fillNodes(ui("This student is {0} and is off the active roll — they will not appear in class lists, attendance or marks entry. Use {1} to bring them back."), <b>{ui(ARCHIVED_STATUS_LABELS[currentStatus] || currentStatus)}</b>, <b>{ui("Restore to roll")}</b>)}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10">
        <MiniMetric label={ui("Roll No")} value={student.rollNo || "N/A"} active />
        <MiniMetric label={ui("Class")} value={classLabel(student.class)} />
        <MiniMetric label={ui("Status")} value={ui(ARCHIVED_STATUS_LABELS[currentStatus] || "Active")} />
        <MiniMetric label={ui("Latest result")} value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal Info */}
        <div className="sk-panel p-5">
          <PanelTitle icon={User} title={ui("Personal Info")} />
          {editing ? (
            <div className="mt-4 space-y-3">
              {/* A real date picker — this used to be a free-text box that
                  silently dropped anything not typed as YYYY-MM-DD. */}
              <FormInput label={ui("Date of Birth")} type="date" value={ed("dateOfBirth")} placeholder={ui("YYYY-MM-DD")} onChange={(v) => setEd("dateOfBirth", v)} />
              <FormSelect label={ui("Gender")} value={ed("gender")} onChange={(v) => setEd("gender", v)}>
                <option value="">{ui("Not specified")}</option>
                <option value="MALE">{ui("Male")}</option>
                <option value="FEMALE">{ui("Female")}</option>
                <option value="OTHER">{ui("Other")}</option>
              </FormSelect>
              <FormSelect label={ui("Blood type")} value={ed("bloodType")} onChange={(v) => setEd("bloodType", v)}>
                <option value="">{ui("Not known")}</option>
                {["A+","A-","B+","B-","O+","O-","AB+","AB-"].map((bt) => <option key={bt} value={bt}>{bt}</option>)}
              </FormSelect>
              <FormInput label={ui("Nationality")} value={ed("nationality")} placeholder={ui("Pakistan")} onChange={(v) => setEd("nationality", v)} />
              <FormInput label={ui("Emirates ID")} value={ed("emiratesId")} placeholder="784-YYYY-NNNNNNN-C" onChange={(v) => setEd("emiratesId", v)} />
              <FormInput label={ui("eSIS / MOE ID")} value={ed("regulatorId")} placeholder={ui("Regulator record number")} onChange={(v) => setEd("regulatorId", v)} />
              <FormInput label={ui("Phone")} value={ed("phone")} placeholder="+92 300 1234567" onChange={(v) => setEd("phone", v)} />
              <FormInput label={ui("Previous school")} value={ed("previousSchool")} placeholder={ui("Previous school")} onChange={(v) => setEd("previousSchool", v)} />
              <div className="grid grid-cols-2 gap-3">
                {tagsLoading ? (
                  <>
                    <Skeleton className="h-11 w-full rounded-xl" />
                    <Skeleton className="h-11 w-full rounded-xl" />
                  </>
                ) : (
                  <>
                    <FormSelect label={ui("Category")} value={ed("categoryId")} onChange={(v) => setEd("categoryId", v)}>
                      <option value="">{ui("No category")}</option>
                      {tags.categories
                        .filter((c) => c.isActive !== false || c.id === student.category?.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </FormSelect>
                    <FormSelect label={ui("Group")} value={ed("groupId")} onChange={(v) => setEd("groupId", v)}>
                      <option value="">{ui("No group")}</option>
                      {tags.groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </FormSelect>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label={ui("Student login")} value={student.studentUser?.email || "Not linked"} />
              <DetailRow label={ui("Date of Birth")} value={formatCalendarDate(student.dateOfBirth)} />
              <DetailRow label={ui("Gender")} value={ui(genderLabel(student.gender))} />
              <DetailRow label={ui("Blood type")} value={student.bloodType || "N/A"} />
              <DetailRow label={ui("Nationality")} value={student.nationality || "N/A"} />
              <DetailRow label={ui("Emirates ID")} value={maskIdentifier(student.emiratesId) || "N/A"} />
              <DetailRow label={ui("eSIS / MOE ID")} value={student.regulatorId || "N/A"} />
              <DetailRow label={ui("Phone")} value={student.phone || "N/A"} />
              <DetailRow label={ui("Previous school")} value={student.previousSchool || "N/A"} />
              <DetailRow label={ui("Category")} value={student.category?.name || "None"} />
              <DetailRow label={ui("Group")} value={student.group?.name || "None"} />
              <DetailRow label={ui("Enrolled")} value={formatDob(student.enrollmentDate)} />
            </div>
          )}
        </div>

        {/* Guardian Details */}
        <div className="sk-panel p-5">
          <PanelTitle icon={Users} title={ui("Guardian")} />
          {editing ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormInput label={ui("Name (English)")} value={ed("guardianName")} placeholder={ui("Guardian name")} onChange={(v) => setEd("guardianName", v)} />
                <FormInput label={ui("Name (Urdu)")} value={ed("guardianNameUr")} placeholder="سرپرست کا نام" onChange={(v) => setEd("guardianNameUr", v)} />
              </div>
              <FormSelect label={ui("Relationship")} value={ed("guardianRelationship")} onChange={(v) => setEd("guardianRelationship", v)}>
                <option value="">{ui("Select")}</option>
                {Object.entries(GUARDIAN_RELATIONSHIP_LABELS).map(([r, label]) => <option key={r} value={r}>{ui(label)}</option>)}
              </FormSelect>
              <FormInput label={ui("Occupation")} value={ed("guardianOccupation")} placeholder={ui("Occupation")} onChange={(v) => setEd("guardianOccupation", v)} />
              <FormInput label={ui("Phone")} value={ed("guardianPhone")} placeholder={ui("Guardian phone")} onChange={(v) => setEd("guardianPhone", v)} />
              <FormInput label={ui("Email")} value={ed("guardianEmail")} placeholder={ui("Guardian email")} onChange={(v) => setEd("guardianEmail", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label={ui("Name")} value={student.guardianName || "N/A"} />
              {student.guardianNameUr ? <DetailRow label={ui("Name (Urdu)")} value={<span dir="rtl">{student.guardianNameUr}</span>} /> : null}
              <DetailRow label={ui("Relationship")} value={relationshipLabel(student.guardianRelationship)} />
              <DetailRow label={ui("Occupation")} value={student.guardianOccupation || "N/A"} />
              <DetailRow label={ui("Phone")} value={student.guardianPhone || student.guardianWhatsapp || "N/A"} />
              <DetailRow label={ui("Email")} value={student.guardianEmail || "N/A"} />
            </div>
          )}
        </div>

        {/* Address */}
        <div className="sk-panel p-5">
          <PanelTitle icon={MapPin} title={ui("Address")} />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label={ui("Address")} value={ed("address")} placeholder={ui("Street address")} onChange={(v) => setEd("address", v)} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label={ui("City")} value={ed("city")} placeholder={ui("City")} onChange={(v) => setEd("city", v)} />
                <FormInput label={ui("Province")} value={ed("province")} placeholder={ui("Province")} onChange={(v) => setEd("province", v)} />
              </div>
              <FormInput label={ui("Postal Code")} value={ed("postalCode")} placeholder={ui("Postal code")} onChange={(v) => setEd("postalCode", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label={ui("Address")} value={student.address || "N/A"} />
              <DetailRow label={ui("City")} value={student.city || "N/A"} />
              <DetailRow label={ui("Province")} value={student.province || "N/A"} />
              <DetailRow label={ui("Postal Code")} value={student.postalCode || "N/A"} />
            </div>
          )}
        </div>

        {/* Medical & Report */}
        <div className="sk-panel p-5">
          <PanelTitle icon={Heart} title={ui("Medical and health")} />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label={ui("Medical notes")} value={ed("medicalNotes")} placeholder={ui("Medical conditions")} onChange={(v) => setEd("medicalNotes", v)} />
              <FormInput label={ui("Special needs")} value={ed("specialNeeds")} placeholder={ui("Special needs")} onChange={(v) => setEd("specialNeeds", v)} />
              <FormInput label={ui("Allergies")} value={ed("allergies")} placeholder={ui("Allergies")} onChange={(v) => setEd("allergies", v)} />
              <FormInput label={ui("Medications")} value={ed("medications")} placeholder={ui("Medications")} onChange={(v) => setEd("medications", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label={ui("Medical notes")} value={student.medicalNotes || "None"} />
              <DetailRow label={ui("Special needs")} value={student.specialNeeds || "None"} />
              <DetailRow label={ui("Allergies")} value={student.allergies || "None"} />
              <DetailRow label={ui("Medications")} value={student.medications || "None"} />
            </div>
          )}
        </div>
      </div>

      {/* Report Card */}
      <div className="sk-panel mt-5 p-5">
        <PanelTitle icon={FileText} title={ui("Report Card")} />
        {report ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DetailRow label={ui("Exam")} value={report.exam?.title || "N/A"} />
            <DetailRow label={ui("Status")} value={<StatusPill status={report.status} />} />
            <DetailRow label={ui("Generated")} value={formatCalendarDate(report.generatedAt)} />
          </div>
        ) : (
          <div className="mt-4">
            <EmptyInline text={ui("No report card has been generated for this student yet.")} />
          </div>
        )}
      </div>
      </>
      )}

      {/*
        Save is the only footer action now. "Move Class / Section" used to sit
        here as well as in the toolbar above — the same action twice in one
        dialog, which just made the footer look like it did something else.
      */}
      {editing ? (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <BrandButton variant="soft" className="h-12" onClick={() => setEditing(false)} disabled={busy}>
            {ui("Cancel")}
          </BrandButton>
          <BrandButton variant="dark" className="h-12" onClick={saveEdits} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : ui("Save Changes")}
          </BrandButton>
        </div>
      ) : null}

      <ConfirmAction
        open={Boolean(statusChange)}
        title={statusChange ? ui(STUDENT_STATUS_CHANGES[statusChange].title) : ""}
        description={statusChange ? ui(STUDENT_STATUS_CHANGES[statusChange].describe, [student.fullName]) : ""}
        confirmLabel={statusChange ? ui(STUDENT_STATUS_CHANGES[statusChange].label) : ""}
        tone={statusChange === "active" ? "primary" : "warning"}
        busy={statusBusy}
        onCancel={() => setStatusChange(null)}
        onConfirm={async () => {
          if (!statusChange) return;
          setStatusBusy(true);
          try {
            await onUpdate(student.id, { status: statusChange });
            setStatusChange(null);
          } finally {
            setStatusBusy(false);
          }
        }}
      />
    </ModalFrame>
  );
}

export function StudentAdmissionsPanel({
  student,
  tab,
  onUpdate,
  version,
  onVersionBump,
}: {
  student: any;
  tab: "siblings" | "documents" | "timeline";
  onUpdate: (studentId: string, updates: Record<string, any>) => Promise<void>;
  version: number;
  onVersionBump: () => void;
}) {
  const ui = useUiText();
  const { date: formatWhen } = useLocaleFormat();
  const [siblings, setSiblings] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  // SKAI-165: a failed or denied list load is its own state, never "no documents yet".
  const [documentsError, setDocumentsError] = useState<"denied" | "failed" | null>(null);
  const [uploadProblem, setUploadProblem] = useState<string | null>(null);
  const [uploadKind, setUploadKind] = useState("BIRTH_CERTIFICATE");
  const fileInput = useRef<HTMLInputElement>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<any[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      tab === "siblings"
        ? fetch(`/api/students/siblings?studentId=${encodeURIComponent(student.id)}`).then((r) => r.json())
        : Promise.resolve({ success: true, data: [] }),
      tab === "documents"
        ? fetch(`/api/students/documents?studentId=${encodeURIComponent(student.id)}`)
            .then(async (r) => ({ ...(await r.json().catch(() => ({}))), status: r.status }))
            .catch(() => ({ success: false, status: 0 }))
        : Promise.resolve({ success: true, data: [] }),
      tab === "timeline"
        ? fetch(`/api/students/timeline?studentId=${encodeURIComponent(student.id)}`).then((r) => r.json())
        : Promise.resolve({ success: true, data: [] }),
    ])
      .then(([sib, doc, tl]) => {
        if (!active) return;
        if (sib.success) setSiblings(sib.data || []);
        if (doc.success) setDocuments(doc.data || []);
        setDocumentsError(doc.success ? null : [401, 403, 404].includes(doc.status) ? "denied" : "failed");
        if (tl.success) setTimeline(tl.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [student.id, tab, version]);

  const uploadFile = async (file: File) => {
    const kindsLabel: Record<string, string> = {
      BIRTH_CERTIFICATE: "Birth certificate",
      TRANSFER_CERTIFICATE: "Transfer certificate",
      PHOTO: "Photo",
      OTHER: "Other",
    };
    const problem = checkStudentDocumentFile(file);
    if (problem) {
      // Rejected before any bytes are sent; the chosen type stays selected so the user can pick another file.
      setUploadProblem(problem === "too_large" ? ui("{0} is larger than 10 MB. Choose a smaller file.", [file.name])
        : problem === "empty" ? ui("{0} is empty. Choose another file.", [file.name])
        : ui("{0} is not a supported file. Use PDF, JPG, PNG, WebP or Word.", [file.name]));
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setUploadProblem(null);
    const safeName = cleanStudentDocumentName(file.name);
    const contentType = studentDocumentContentType(file)!;
    setUploading(true);
    try {
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          fileName: safeName,
          contentType,
          sizeBytes: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presign.success) throw new Error(presign.error || "Presign failed");

      const putRes = await fetch(presign.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!putRes.ok) throw new Error(ui("The file could not be stored. Your choice is kept; try again."));

      const recRes = await fetch("/api/students/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          kind: uploadKind,
          fileKey: presign.data.key,
          fileName: safeName,
        }),
      });
      const rec = await recRes.json();
      if (!rec.success) throw new Error(rec.error || "Could not save document");

      toast.success(ui("{0} uploaded", [ui(kindsLabel[uploadKind] ?? "Document")]));
      onVersionBump();
    } catch (error) {
      const message = friendlyErrorMessage(error, ui("Could not upload the document. Please try again."));
      setUploadProblem(message);
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };



  const addNote = async () => {
    if (!noteDraft.trim()) return;
    setNoteBusy(true);
    try {
      const res = await fetch("/api/students/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, title: noteDraft.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "");
      setNoteDraft("");
      toast.success(ui("Note added to timeline"));
      onVersionBump();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not add the note. Please try again.")));
    } finally {
      setNoteBusy(false);
    }
  };

  const linkSiblings = async (targetId: string) => {
    setLinkBusy(true);
    try {
      await onUpdate(student.id, { siblingStudentId: targetId });
      onVersionBump();
      toast.success(ui("Linked as siblings"));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not link the sibling. Please try again.")));
    } finally {
      setLinkBusy(false);
    }
  };

  const kindLabel = (kind: string) => {
    const map: Record<string, string> = {
      BIRTH_CERTIFICATE: "Birth certificate",
      TRANSFER_CERTIFICATE: "Transfer certificate",
      PHOTO: "Photo",
      OTHER: "Other",
    };
    return ui(map[kind] || formatStatus(kind));
  };

  if (loading) {
    return (
      // The shared skeleton pieces (one shimmer, one shape language), laid out like the sections that arrive.
      <SkeletonRegion className="space-y-4" label={ui("Loading the profile…")}>
        <div className="sk-panel p-5">
          <Skeleton className="h-4 w-36 rounded-lg" />
          <SkeletonList rows={3} className="mt-4" />
        </div>
        <div className="sk-panel p-5">
          <Skeleton className="h-4 w-36 rounded-lg" />
          <Skeleton className="mt-4 h-14 w-full max-w-xs rounded-2xl" />
        </div>
      </SkeletonRegion>
    );
  }

  if (tab === "siblings") {
    return (
      <div className="space-y-4">
        <div className="sk-panel p-5">
          <PanelTitle icon={Users} title={ui("Siblings")} />
          {siblings.length === 0 ? (
            <div className="mt-4">
              <EmptyInline text={ui("Not linked to any siblings yet. Link the student to a sibling below (or pick the guardian when admitting a new child — the group auto-links).")} />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {siblings.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-card/70 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-ink-strong">
                      {s.id === student.id ? ui("{0} (this student)", [s.fullName]) : s.fullName}
                    </p>
                    <p className="text-xs font-semibold text-ink-muted">
                      {s.rollNo || ui("No roll")} · {classLabel(s.class)}
                    </p>
                  </div>
                  {s.id !== student.id ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary">
                      {ui("Sibling")}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sk-panel p-5">
          <PanelTitle icon={UserCheck} title={ui("Link a sibling")} />
          <div className="mt-4 space-y-3">
            <FormInput
              label={ui("Search a student by name, roll or admission no.")}
              value={linkSearch}
              placeholder={ui("e.g. Ahmed or ALG-A-001")}
              onChange={(v) => {
                setLinkSearch(v);
                const q = v.trim().toLowerCase();
                fetch(`/api/students?search=${encodeURIComponent(q)}&limit=6`)
                  .then((r) => r.json())
                  .then((j) => {
                    if (j.success) {
                      setLinkResults((j.data || []).filter((s: any) => s.id !== student.id));
                    }
                  })
                  .catch(() => {});
              }}
            />
            {linkResults.length > 0 ? (
              <div className="space-y-2">
                {linkResults.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-card/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-ink-strong">{s.fullName}</p>
                      <p className="text-xs font-semibold text-ink-muted">{s.rollNo} · {classLabel(s.class)}</p>
                    </div>
                    <SystemButton type="button" variant="secondary" size="sm" loading={linkBusy} onClick={() => linkSiblings(s.id)} aria-label={ui("Link {0} as a sibling", [s.fullName])}>
                      {ui("Link")}
                    </SystemButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-semibold text-ink-subtle">{ui("Type at least 2 characters to search.")}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (tab === "documents") {
    return (
      <div className="space-y-4">
        <div className="sk-panel p-5">
          <PanelTitle icon={FileText} title={ui("Admission documents")} />
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-48">
              <FormSelect label={ui("Document type")} value={uploadKind} onChange={setUploadKind}>
                {STUDENT_DOCUMENT_KINDS.map((k) => (
                  <option key={k} value={k}>{kindLabel(k)}</option>
                ))}
              </FormSelect>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={STUDENT_DOCUMENT_ACCEPT}
              aria-label={ui("Choose a document to upload")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
              }}
            />
            <BrandButton
              variant="dark"
              className="h-14"
              icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? ui("Uploading…") : ui("Upload (max 10 MB)")}
            </BrandButton>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{ui("PDF, JPG, PNG, WebP or Word, up to 10 MB. Files are private to this school.")}</p>
          {uploadProblem ? <Alert tone="danger" className="mt-3" role="alert">{uploadProblem}</Alert> : null}
        </div>

        {documentsError ? (
          <Alert tone={documentsError === "denied" ? "warning" : "danger"} title={documentsError === "denied" ? ui("You don't have access to these documents.") : ui("Could not load the documents.")}>
            {documentsError === "failed" ? (
              <SystemButton type="button" variant="secondary" size="sm" className="mt-2" onClick={onVersionBump}>{ui("Try again")}</SystemButton>
            ) : ui("Ask a school administrator for student access.")}
          </Alert>
        ) : documents.length === 0 ? (
          <EmptyInline text={ui("No documents uploaded yet.")} />
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-strong">{doc.fileName}</p>
                  <p className="text-xs font-semibold text-ink-muted">
                    {kindLabel(doc.kind)} · {formatWhen(doc.uploadedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {doc.downloadUrl ? (
                    <a
                      href={doc.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-8 items-center gap-1.5 rounded-xl bg-brand-50 px-3 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary hover:bg-primary hover:text-white transition-all"
                    >
                      <Download className="h-3 w-3" />{ui("View")}
                    </a>
                  ) : null}
                  <ReviewedDelete endpoint="students/documents" record={{ id: doc.id, campusId: student.campusId }} label={doc.fileName} onDeleted={onVersionBump} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sk-panel p-5">
        <PanelTitle icon={History} title={ui("Timeline")} />
        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <FormInput label={ui("Add a note")} value={noteDraft} placeholder={ui("e.g. Fee discount applied, meeting held…")} onChange={setNoteDraft} />
          </div>
          <SystemButton type="button" variant="secondary" loading={noteBusy} disabled={!noteDraft.trim()} onClick={addNote}>
            {noteBusy ? null : <Plus aria-hidden="true" />}{ui("Add note")}
          </SystemButton>
        </div>
      </div>

      {timeline.length === 0 ? (
        <EmptyInline text={ui("No timeline events yet. Admissions, class transfers, fee payments and document uploads are recorded here automatically.")} />
      ) : (
        <div className="space-y-0">
          {timeline.map((ev, idx) => (
            <div key={ev.id} className="relative flex gap-3 ps-5">
              {idx < timeline.length - 1 ? <div className="absolute start-[5px] top-5 h-full w-px bg-edge/40" /> : null}
              <div className="absolute start-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-card" />
              <div className="pb-4">
                <p className="text-sm font-bold text-ink-strong">{ev.title}</p>
                {ev.detail ? <p className="text-xs font-semibold text-ink-muted">{ev.detail}</p> : null}
                <p className="mt-0.5 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {ui(TIMELINE_KIND_LABELS[ev.kind] ?? formatStatus(ev.kind))} · {formatWhen(ev.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeacherDetailModal({
  teacher,
  sequence,
  onNavigate,
  onClose,
  onUpdate,
  showStaffRecord = true,
}: {
  teacher: any;
  /** The teachers currently on screen, for stepping between profiles. */
  sequence?: { id: string; label: string }[];
  onNavigate?: (teacherId: string) => void;
  onClose: () => void;
  onUpdate?: (teacherId: string, updates: Record<string, any>) => Promise<void>;
  /** M47: the Staff Record tab (salary, bank, documents) is campus operations only; the principal passes false. */
  showStaffRecord?: boolean;
}) {
  const ui = useUiText();
  const { date: formatCalendarDate, money: formatStaffMoney } = useLocaleFormat();
  const { currency: schoolCurrency } = useLocale();
  const avatar = teacher.profileImageUrl;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [teachesAll, setTeachesAll] = useState(false);
  const [specialtyDraft, setSpecialtyDraft] = useState("");
  const [teacherTab, setTeacherTab] = useState<"overview" | "teaching" | "record">("overview");

  // ── Staff Records (payroll / bank / documents / timeline) ──
  const isStaffAdmin = Boolean(onUpdate) && showStaffRecord;
  const [staff, setStaff] = useState<any>(null);
  const [staffDocs, setStaffDocs] = useState<any[]>([]);
  const [staffTimeline, setStaffTimeline] = useState<any[]>([]);
  const [editStaff, setEditStaff] = useState(false);
  const [staffForm, setStaffForm] = useState<Record<string, string>>({});
  const [staffSaving, setStaffSaving] = useState(false);
  const [allowances, setAllowances] = useState<{ name: string; amount: string }[]>([]);
  const [deductions, setDeductions] = useState<{ name: string; amount: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadKind, setUploadKind] = useState("CV");
  const fileInput = useRef<HTMLInputElement>(null);

  // SKAI-1117: prefer the assignments served by /api/staff/profile; fall back to the list row.
  const ledClasses: any[] = staff?.ledClasses ?? teacher.ledClasses ?? [];
  const taughtSubjects: any[] = staff?.taughtSubjects ?? teacher.taughtSubjects ?? [];

  const loadStaffRecords = useCallback(async () => {
    if (!isStaffAdmin) return;
    try {
      const res = await fetch(`/api/staff/profile?userId=${encodeURIComponent(teacher.id)}`);
      const json = await res.json();
      if (!json.success) return;
      setStaff(json.data);
      setStaffDocs(json.data.staffDocuments || []);
      setStaffTimeline(json.data.staffTimelineEvents || []);
    } catch {
    }
  }, [isStaffAdmin, teacher.id]);

  useEffect(() => {
    loadStaffRecords();
  }, [loadStaffRecords]);

  const openStaffEditor = () => {
    const p = staff?.staffProfile || {};
    setStaffForm({
      designation: p.designation || "",
      contractType: p.contractType || "",
      basicSalary: String((p.basicSalary ?? 0) / 100),
      bankAccountName: p.bankAccountName || "",
      bankAccountNumber: p.bankAccountNumber || "",
      bankName: p.bankName || "",
      emiratesId: p.emiratesId || "",
      nationality: p.nationality || "",
      regulatorId: p.regulatorId || "",
    });
    setAllowances(
      Object.entries((p.allowancesJson as Record<string, number>) || {}).map(([name, amount]) => ({
        name,
        amount: String(amount / 100),
      }))
    );
    setDeductions(
      Object.entries((p.deductionsJson as Record<string, number>) || {}).map(([name, amount]) => ({
        name,
        amount: String(amount / 100),
      }))
    );
    setEditStaff(true);
  };

  const saveStaff = async () => {
    // SKAI-1149: catch a malformed regulator ID here; the route enforces the same rule.
    let regulator: { emiratesId: string | null; regulatorId: string | null };
    try { regulator = { emiratesId: parseEmiratesId(staffForm.emiratesId), regulatorId: parseRegulatorId(staffForm.regulatorId) }; }
    catch (error) { toast.error(ui((error as Error).message)); return; }
    setStaffSaving(true);
    try {
      const toObject = (rows: { name: string; amount: string }[]) => {
        const out: Record<string, number> = {};
        for (const row of rows) {
          const name = row.name.trim();
          const amount = Math.round(Number(row.amount) * 100);
          if (name && Number.isFinite(amount) && amount !== 0) out[name] = amount;
        }
        return out;
      };
      const res = await fetch("/api/staff/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: teacher.id,
          designation: staffForm.designation,
          contractType: staffForm.contractType,
          basicSalary: Math.round(Number(staffForm.basicSalary) * 100) || 0,
          allowances: toObject(allowances),
          deductions: toObject(deductions),
          bankAccountName: staffForm.bankAccountName,
          bankAccountNumber: staffForm.bankAccountNumber,
          bankName: staffForm.bankName,
          nationality: staffForm.nationality,
          ...regulator,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "");
      toast.success(json.events ? ui(json.events === 1 ? "Saved ({0} change logged)" : "Saved ({0} changes logged)", [json.events]) : ui("Staff record saved"));
      setEditStaff(false);
      await loadStaffRecords();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not save the staff record. Please try again.")));
    } finally {
      setStaffSaving(false);
    }
  };

  const uploadStaffDoc = async (file: File) => {
    const safeName = file.name.replace(/[^\w.\- ]/g, "_");
    setUploading(true);
    try {
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: teacher.id,
          fileName: safeName,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presign.success) throw new Error(presign.error || "Presign failed");

      const putRes = await fetch(presign.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      const recRes = await fetch("/api/staff/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: teacher.id,
          kind: uploadKind,
          fileKey: presign.data.key,
          fileName: safeName,
        }),
      });
      const rec = await recRes.json();
      if (!rec.success) throw new Error(rec.error || "Could not save document");
      toast.success(ui("Document uploaded"));
      await loadStaffRecords();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not upload the document. Please try again.")));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };



  // R7: money and dates through the locale package (never "Rs." or a hard-coded en-PK).
  const rupee = (minor: number) => formatStaffMoney(minor, schoolCurrency);
  const maskAccount = (num: string) =>
    num.length <= 4 ? (num ? "••••" : "") : `•••• •••• ${num.slice(-4)}`;
  const formatStaffDate = (d: any) => {
    if (!d) return ui("Not recorded");
    try { return formatCalendarDate(d instanceof Date ? d.toISOString() : String(d)); } catch { return ui("Not recorded"); }
  };

  useEffect(() => {
    setSpecialties(
      teacher.subjectSpecialties?.length
        ? teacher.subjectSpecialties
        : (teacher.specialization || "").split(",").map((x: string) => x.trim()).filter(Boolean)
    );
    setTeachesAll(Boolean(teacher.teachesAllSubjects));
    setSpecialtyDraft("");
  }, [teacher.id]);

  useEffect(() => {
    setEdits({
      fullName: teacher.fullName || "",
      phone: teacher.phone || "",
      cnic: teacher.cnic || "",
      dateOfBirth: teacher.dateOfBirth ? new Date(teacher.dateOfBirth).toISOString().split("T")[0] : "",
      gender: teacher.gender || "",
      qualification: teacher.qualification || "",
      specialization: teacher.specialization || "",
      experience: teacher.experience || "",
      joiningDate: teacher.joiningDate ? new Date(teacher.joiningDate).toISOString().split("T")[0] : "",
      address: teacher.address || "",
      city: teacher.city || "",
      province: teacher.province || "",
      postalCode: teacher.postalCode || "",
      emergencyContact: teacher.emergencyContact || "",
      emergencyPhone: teacher.emergencyPhone || "",
    });
  }, [teacher.id]);

  const ed = (field: string) => edits[field] || "";
  const setEd = (field: string, value: string) => setEdits((p) => ({ ...p, [field]: value }));

  const saveEdits = async () => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      const strFields = [
        "fullName", "phone", "cnic", "gender", "qualification", "specialization",
        "experience", "address", "city", "province", "postalCode",
        "emergencyContact", "emergencyPhone",
      ];
      for (const f of strFields) updates[f] = edits[f] || null;
      updates.subjectSpecialties = specialties;
      updates.teachesAllSubjects = teachesAll;
      // Keep the legacy free-text field readable for anything still showing it.
      updates.specialization = teachesAll ? "All subjects" : specialties.join(", ") || null;
      if (edits.fullName) updates.fullName = edits.fullName;
      if (edits.dateOfBirth) updates.dateOfBirth = edits.dateOfBirth;
      if (edits.joiningDate) updates.joiningDate = edits.joiningDate;
      await onUpdate(teacher.id, updates);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: any) => {
    if (!d) return ui("Not recorded");
    try { return formatCalendarDate(d instanceof Date ? d.toISOString() : String(d)); } catch { return ui("Not recorded"); }
  };

  const genderLabel = (g: string) => {
    if (g === "MALE") return "Male";
    if (g === "FEMALE") return "Female";
    if (g === "OTHER") return "Other";
    return g || "Not recorded";
  };

  return (
    <ModalFrame
      title={teacher.fullName}
      eyebrow={ui("Teacher profile")}
      subtitle={teacher.email || ui("No email on file")}
      avatar={<AvatarImage src={avatar} name={teacher.fullName} initialsClassName="text-lg" />}
      chips={
        <>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider",
              (teacher._count?.taughtSubjects || taughtSubjects.length) === 0
                ? "bg-status-warning-surface text-status-warning-text"
                : "bg-status-success-surface text-status-success-text",
            )}
          >
            {(teacher._count?.taughtSubjects || taughtSubjects.length) === 0
              ? ui("No subjects")
              : ui("{0} subjects", [teacher._count?.taughtSubjects || taughtSubjects.length])}
          </span>
          {(teacher._count?.ledClasses || ledClasses.length) > 0 ? (
            <Badge variant="info">
              {ui("Class teacher · {0}", [teacher._count?.ledClasses || ledClasses.length])}
            </Badge>
          ) : null}
          {!teacher.onboardingComplete ? (
            <Badge variant="warning">
              {ui("Onboarding pending")}
            </Badge>
          ) : null}
        </>
      }
      headerActions={
        sequence && onNavigate ? (
          <ModalPager
            sequence={sequence}
            currentId={teacher.id}
            onNavigate={onNavigate}
            noun="teacher"
          />
        ) : null
      }
      onClose={onClose}
      wide
    >
      {/* Pinned inside the scroll area so the tab strip and Edit stay reachable. */}
      <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-4 border-b border-edge/15 bg-card/95 px-6 pt-6 pb-3 backdrop-blur sm:-mx-7 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/*
          Tabs, matching the student profile. This dialog used to be a single
          scroll of ten sections — personal, professional, address, emergency,
          classes, subjects, payroll, bank, documents, timeline — so finding
          anything below the fold meant scrolling past everything above it.
        */}
        <div className="min-w-0 flex-1">
          <ViewTabs
            items={[
              { id: "overview", label: "Overview" },
              { id: "teaching", label: "Teaching" },
              { id: "record", label: "Staff record", hidden: !isStaffAdmin },
            ]}
            value={teacherTab}
            onChange={(id) => setTeacherTab(id as typeof teacherTab)}
            ariaLabel="Teacher profile sections"
          />
        </div>
        {onUpdate && teacherTab === "overview" ? (
          <SystemButton variant="ghost"
            type="button"
            onClick={() => setEditing(!editing)}
            className={cn(
              "flex items-center gap-1.5 px-3 justify-start",
              editing ? "bg-muted text-ink-muted" : "bg-brand-50 text-primary hover:bg-brand-100"
            )}
          >
            <Pencil className="h-3 w-3" />
            {editing ? ui("Cancel") : ui("Edit details")}
          </SystemButton>
        ) : null}
      </div>
      </div>

      {/* ── Header Card ── */}
      {/* Photo, name, email and flags are all in the dialog header now. */}
      {editing ? (
        <div className="mb-5 rounded-[24px] border border-edge/25 bg-surface-subtle p-5">
          <FormInput label={ui("Full Name")} value={ed("fullName")} placeholder={ui("Teacher name")} onChange={(v) => setEd("fullName", v)} />
        </div>
      ) : null}

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10">
        <MiniMetric label={ui("Subjects")} value={teacher._count?.taughtSubjects || taughtSubjects.length} active />
        <MiniMetric label={ui("Class Teacher")} value={teacher._count?.ledClasses || ledClasses.length} />
        <MiniMetric label={ui("Status")} value={teacher.isActive ? "Active" : "Inactive"} />
        <MiniMetric label={ui("Onboarding")} value={teacher.onboardingComplete ? "Done" : "Pending"} />
      </div>

      {/* ── Profile Sections ── */}
      {teacherTab === "overview" ? (
      <>
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal Info */}
        <div className="sk-panel p-5">
          <PanelTitle icon={User} title={ui("Personal Info")} />
          {editing ? (
            <div className="mt-4 space-y-3">
              {/*
                Email is the login identity and is not editable here. It used to
                render as a normal input wired to a no-op onChange, so it looked
                editable, accepted nothing, and gave no reason why.
              */}
              <div>
                <span className="sk-field-label">{ui("Email")}</span>
                <div className="flex h-14 w-full items-center rounded-2xl border border-edge/20 bg-muted px-4 text-sm font-bold text-ink-muted">
                  <Lock className="me-2 h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                  <span className="truncate">{teacher.email || ui("No email")}</span>
                </div>
                <p className="mt-1.5 ps-2 text-2xs font-semibold text-ink-subtle">
                  {ui("This is the teacher's sign-in address and cannot be changed here.")}
                </p>
              </div>
              <FormInput label={ui("Phone")} value={ed("phone")} placeholder="+92 300 1234567" onChange={(v) => setEd("phone", v)} />
              <FormInput label={ui("CNIC")} value={ed("cnic")} placeholder="12345-1234567-1" onChange={(v) => setEd("cnic", v)} />
              {/* A real date picker — this used to be a free-text box that
                  silently dropped anything not typed as YYYY-MM-DD. */}
              <FormInput label={ui("Date of Birth")} type="date" value={ed("dateOfBirth")} placeholder={ui("YYYY-MM-DD")} onChange={(v) => setEd("dateOfBirth", v)} />
              <FormSelect label={ui("Gender")} value={ed("gender")} onChange={(v) => setEd("gender", v)}>
                <option value="">{ui("Not specified")}</option>
                <option value="MALE">{ui("Male")}</option>
                <option value="FEMALE">{ui("Female")}</option>
                <option value="OTHER">{ui("Other")}</option>
              </FormSelect>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label={ui("Email")} value={teacher.email || "N/A"} />
              <DetailRow label={ui("Phone")} value={teacher.phone || "N/A"} />
              <DetailRow label={ui("CNIC")} value={teacher.cnic || "N/A"} />
              <DetailRow label={ui("Date of Birth")} value={formatCalendarDate(teacher.dateOfBirth)} />
              <DetailRow label={ui("Gender")} value={ui(genderLabel(teacher.gender))} />
            </div>
          )}
        </div>

        {/* Professional Details */}
        <div className="sk-panel p-5">
          <PanelTitle icon={Briefcase} title={ui("Professional")} />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormSelect label={ui("Qualification")} value={ed("qualification")} onChange={(v) => setEd("qualification", v)}>
                <option value="">{ui("Select qualification")}</option>
                <option value="Matric">{ui("Matric")}</option>
                <option value="Intermediate">{ui("Intermediate")}</option>
                <option value="Bachelors">{ui("Bachelors")}</option>
                <option value="Masters">{ui("Masters")}</option>
                <option value="MPhil">{ui("MPhil")}</option>
                <option value="PhD">{ui("PhD")}</option>
                <option value="B.Ed">{ui("B.Ed")}</option>
                <option value="M.Ed">{ui("M.Ed")}</option>
              </FormSelect>
              <FormInput label={ui("Experience")} value={ed("experience")} placeholder={ui("e.g. 5 years")} onChange={(v) => setEd("experience", v)} />
              {/* Was free text; anything not typed as YYYY-MM-DD was dropped. */}
              <FormInput label={ui("Joining Date")} type="date" value={ed("joiningDate")} placeholder={ui("YYYY-MM-DD")} onChange={(v) => setEd("joiningDate", v)} />
              <div className="sm:col-span-2">
                <SpecialtyEditor
                  specialties={specialties}
                  teachesAll={teachesAll}
                  draft={specialtyDraft}
                  onDraftChange={setSpecialtyDraft}
                  onAdd={(name) => {
                    const clean = name.trim();
                    if (!clean) return;
                    setSpecialties((cur) => (cur.some((s) => s.toLowerCase() === clean.toLowerCase()) ? cur : [...cur, clean]));
                    setSpecialtyDraft("");
                  }}
                  onRemove={(name) => setSpecialties((cur) => cur.filter((s) => s !== name))}
                  onToggleAll={() => setTeachesAll((v) => !v)}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label={ui("Qualification")} value={teacher.qualification || "N/A"} />
              <DetailRow
                label={ui("Teaches")}
                value={teachesAll ? "All subjects" : specialties.length ? specialties.join(", ") : "Not set"}
              />
              <DetailRow label={ui("Experience")} value={teacher.experience || "N/A"} />
              <DetailRow label={ui("Joining Date")} value={formatCalendarDate(teacher.joiningDate)} />
            </div>
          )}
        </div>

        {/* Address */}
        <div className="sk-panel p-5">
          <PanelTitle icon={MapPin} title={ui("Address")} />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label={ui("Address")} value={ed("address")} placeholder={ui("Street address")} onChange={(v) => setEd("address", v)} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label={ui("City")} value={ed("city")} placeholder={ui("City")} onChange={(v) => setEd("city", v)} />
                <FormSelect label={ui("Province")} value={ed("province")} onChange={(v) => setEd("province", v)}>
                  <option value="">{ui("Select province")}</option>
                  <option value="Punjab">{ui("Punjab")}</option>
                  <option value="Sindh">{ui("Sindh")}</option>
                  <option value="KPK">{ui("KPK")}</option>
                  <option value="Balochistan">{ui("Balochistan")}</option>
                  <option value="Islamabad">{ui("Islamabad")}</option>
                  <option value="AJK">{ui("AJK")}</option>
                  <option value="Gilgit-Baltistan">{ui("Gilgit-Baltistan")}</option>
                </FormSelect>
              </div>
              <FormInput label={ui("Postal Code")} value={ed("postalCode")} placeholder={ui("Postal code")} onChange={(v) => setEd("postalCode", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label={ui("Address")} value={teacher.address || "N/A"} />
              <DetailRow label={ui("City")} value={teacher.city || "N/A"} />
              <DetailRow label={ui("Province")} value={teacher.province || "N/A"} />
              <DetailRow label={ui("Postal Code")} value={teacher.postalCode || "N/A"} />
            </div>
          )}
        </div>

        {/* Emergency Contact */}
        <div className="sk-panel p-5">
          <PanelTitle icon={Shield} title={ui("Emergency contact")} />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label={ui("Contact Person")} value={ed("emergencyContact")} placeholder={ui("Emergency contact name")} onChange={(v) => setEd("emergencyContact", v)} />
              <FormInput label={ui("Contact Phone")} value={ed("emergencyPhone")} placeholder={ui("Emergency phone")} onChange={(v) => setEd("emergencyPhone", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label={ui("Contact Person")} value={teacher.emergencyContact || "N/A"} />
              <DetailRow label={ui("Contact Phone")} value={teacher.emergencyPhone || "N/A"} />
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-6 flex justify-end gap-3">
          <BrandButton variant="soft" className="h-12" onClick={() => setEditing(false)} disabled={saving}>
            {ui("Cancel")}
          </BrandButton>
          <BrandButton variant="dark" className="h-12" onClick={saveEdits} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : ui("Save Changes")}
          </BrandButton>
        </div>
      ) : null}
      </>
      ) : null}

      {/* ── Led Classes & Taught Subjects ── */}
      {teacherTab === "teaching" ? (
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={School} title={ui("Classes led")} />
            <Badge variant="neutral" className="tabular-nums">{ledClasses.length === 1 ? ui("1 class") : ui("{0} classes", [ledClasses.length])}</Badge>
          </div>
          <div className="space-y-2">
            {ledClasses.map((cls: any) => (
              <div key={cls.id} className="rounded-2xl border border-edge/20 bg-surface-subtle px-4 py-3">
                <p className="text-sm font-bold text-ink-strong">{classLabel(cls)}</p>
                <p className="mt-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {ui("{0} students · {1} subjects", [cls._count?.students || 0, cls._count?.subjects || 0])}
                </p>
              </div>
            ))}
            {ledClasses.length === 0 ? <EmptyInline text={ui("This teacher is not the class teacher for any class yet.")} /> : null}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={BookOpen} title={ui("Subjects taught")} />
            <Badge variant="neutral" className="tabular-nums">{taughtSubjects.length === 1 ? ui("1 subject") : ui("{0} subjects", [taughtSubjects.length])}</Badge>
          </div>
          <div className="space-y-2">
            {taughtSubjects.map((subject: any) => (
              <div key={subject.id} className="rounded-2xl border border-edge/20 bg-surface-subtle px-4 py-3">
                <p className="text-sm font-bold text-ink-strong">{subject.name}</p>
                <p className="mt-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {ui("{0} · {1} marks", [classLabel(subject.class), subject.totalMarks || 100])}
                </p>
              </div>
            ))}
            {taughtSubjects.length === 0 ? <EmptyInline text={ui("No subjects are assigned to this teacher yet. Assign them in Classes & subjects; until then they cannot be placed on a timetable or enter marks.")} /> : null}
          </div>
        </div>
      </div>
      ) : null}

      {isStaffAdmin && teacherTab === "record" ? (
        <div className="mt-6 rounded-3xl border border-edge/20 bg-brand-50/40 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-700 text-white shadow-brand">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight text-ink-strong">{ui("Staff records")}</h3>
                <p className="text-2xs font-bold text-ink-muted">{ui("Payroll · Bank · Documents · Timeline")}</p>
              </div>
            </div>
            <BrandButton
              variant={editStaff ? "soft" : "dark"}
              icon={editStaff ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              onClick={editStaff ? () => setEditStaff(false) : openStaffEditor}
            >
              {editStaff ? ui("Cancel") : staff?.staffProfile ? ui("Edit staff record") : ui("Set up staff record")}
            </BrandButton>
          </div>

          {editStaff ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="sk-panel p-5">
                <PanelTitle icon={Banknote} title={ui("Payroll")} />
                <div className="mt-4 space-y-3">
                  <FormInput label={ui("Designation")} value={staffForm.designation || ""} placeholder={ui("e.g. Senior Maths Teacher")} onChange={(v) => setStaffForm((p) => ({ ...p, designation: v }))} />
                  <FormSelect label={ui("Contract type")} value={staffForm.contractType || ""} onChange={(v) => setStaffForm((p) => ({ ...p, contractType: v }))}>
                    <option value="">{ui("Not specified")}</option>
                    <option value="PERMANENT">{ui("Permanent")}</option>
                    <option value="CONTRACT">{ui("Contract")}</option>
                    <option value="PART_TIME">{ui("Part-time")}</option>
                  </FormSelect>
                  <FormInput label={ui("Basic salary (per month)")} type="number" value={staffForm.basicSalary || ""} placeholder="e.g. 85000" onChange={(v) => setStaffForm((p) => ({ ...p, basicSalary: v }))} />
                  <AmountRowsEditor title={ui("Allowances")} rows={allowances} onChange={setAllowances} />
                  <AmountRowsEditor title={ui("Deductions")} rows={deductions} onChange={setDeductions} />
                </div>
              </div>
              <div className="sk-panel p-5">
                <PanelTitle icon={Landmark} title={ui("Bank details")} />
                <p className="mt-1 text-2xs font-bold text-ink-subtle">{ui("Sensitive — only visible to administrators")}</p>
                <div className="mt-4 space-y-3">
                  <FormInput label={ui("Account holder name")} value={staffForm.bankAccountName || ""} placeholder={ui("Name on account")} onChange={(v) => setStaffForm((p) => ({ ...p, bankAccountName: v }))} />
                  <FormInput label={ui("Account Number")} value={staffForm.bankAccountNumber || ""} placeholder={ui("IBAN / account number")} onChange={(v) => setStaffForm((p) => ({ ...p, bankAccountNumber: v }))} />
                  <FormInput label={ui("Bank Name")} value={staffForm.bankName || ""} placeholder={ui("e.g. HBL, Meezan")} onChange={(v) => setStaffForm((p) => ({ ...p, bankName: v }))} />
                </div>
              </div>
              <div className="sk-panel p-5">
                <PanelTitle icon={IdCard} title={ui("Regulator IDs")} />
                <p className="mt-1 text-2xs font-bold text-ink-subtle">{ui("Optional. Used for UAE regulator returns (KHDA, ADEK, SPEA, MOE).")}</p>
                <div className="mt-4 space-y-3">
                  <FormInput label={ui("Emirates ID")} value={staffForm.emiratesId || ""} placeholder="784-YYYY-NNNNNNN-C" onChange={(v) => setStaffForm((p) => ({ ...p, emiratesId: v }))} />
                  <FormInput label={ui("Nationality")} value={staffForm.nationality || ""} placeholder={ui("Nationality")} onChange={(v) => setStaffForm((p) => ({ ...p, nationality: v }))} />
                  <FormInput label={ui("eSIS / MOE ID")} value={staffForm.regulatorId || ""} placeholder={ui("Regulator record number")} onChange={(v) => setStaffForm((p) => ({ ...p, regulatorId: v }))} />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="sk-panel p-5">
                <PanelTitle icon={Banknote} title={ui("Payroll")} />
                <div className="mt-4 space-y-3">
                  <DetailRow label={ui("Designation")} value={staff?.staffProfile?.designation || "Not set"} />
                  <DetailRow label={ui("Contract type")} value={staff?.staffProfile?.contractType ? staff.staffProfile.contractType.replace("_", " ") : "Not set"} />
                  <DetailRow label={ui("Basic salary")} value={staff?.staffProfile ? rupee(staff.staffProfile.basicSalary) : "Not set"} />
                  <DetailRow
                    label={ui("Allowances")}
                    value={
                      staff?.staffProfile?.allowancesJson
                        ? Object.entries(staff.staffProfile.allowancesJson as Record<string, number>)
                            .map(([name, amt]) => `${name} (${rupee(amt)})`)
                            .join(", ")
                        : "None"
                    }
                  />
                  <DetailRow
                    label={ui("Deductions")}
                    value={
                      staff?.staffProfile?.deductionsJson
                        ? Object.entries(staff.staffProfile.deductionsJson as Record<string, number>)
                            .map(([name, amt]) => `${name} (${rupee(amt)})`)
                            .join(", ")
                        : "None"
                    }
                  />
                </div>
              </div>
              <div className="sk-panel p-5">
                <PanelTitle icon={Landmark} title={ui("Bank details")} />
                <p className="mt-1 text-2xs font-bold text-ink-subtle">{ui("Sensitive — only visible to administrators")}</p>
                <div className="mt-4 space-y-3">
                  <DetailRow label={ui("Account holder")} value={staff?.staffProfile?.bankAccountName || "Not set"} />
                  <DetailRow label={ui("Account Number")} value={staff?.staffProfile?.bankAccountNumber ? maskAccount(staff.staffProfile.bankAccountNumber) : "Not set"} />
                  <DetailRow label={ui("Bank")} value={staff?.staffProfile?.bankName || "Not set"} />
                </div>
              </div>
              <div className="sk-panel p-5">
                <PanelTitle icon={IdCard} title={ui("Regulator IDs")} />
                <div className="mt-4 space-y-3">
                  <DetailRow label={ui("Emirates ID")} value={maskIdentifier(staff?.staffProfile?.emiratesId) || "Not set"} />
                  <DetailRow label={ui("Nationality")} value={staff?.staffProfile?.nationality || "Not set"} />
                  <DetailRow label={ui("eSIS / MOE ID")} value={staff?.staffProfile?.regulatorId || "Not set"} />
                </div>
              </div>
            </div>
          )}

          {editStaff ? (
            <div className="mt-5 flex justify-end">
              <BrandButton variant="dark" className="h-11" onClick={saveStaff} disabled={staffSaving}>
                {staffSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : ui("Save staff record")}
              </BrandButton>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="sk-panel p-5">
              <PanelTitle icon={FileText} title={ui("Documents")} />
              <div className="mt-4 space-y-2">
                {staffDocs.length === 0 ? (
                  <EmptyInline text={ui("No documents uploaded yet.")} />
                ) : (
                  staffDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 rounded-2xl border border-edge/20 bg-surface-subtle px-4 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-ink-strong">{doc.fileName}</p>
                        <p className="mt-0.5 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                          {doc.kind} · {formatStaffDate(doc.uploadedAt)}
                        </p>
                      </div>
                      <a href={doc.downloadUrl || "#"} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-xl text-ink-subtle transition-colors hover:bg-card hover:text-primary">
                        <Download className="h-4 w-4" />
                      </a>
                      <ReviewedDelete endpoint="staff/documents" record={{ id: doc.id, campusId: teacher.campusId }} label={doc.fileName} onDeleted={loadStaffRecords} />
                    </div>
                  ))
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <FormSelect label="" value={uploadKind} onChange={setUploadKind}>
                    <option value="CV">{ui("CV")}</option>
                    <option value="CNIC">{ui("CNIC")}</option>
                    <option value="DEGREE">{ui("Degree")}</option>
                    <option value="CONTRACT">{ui("Contract")}</option>
                    <option value="PHOTO">{ui("Photo")}</option>
                    <option value="OTHER">{ui("Other")}</option>
                  </FormSelect>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadStaffDoc(file);
                    }}
                  />
                  <SystemButton type="button" variant="secondary" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>
                    {uploading ? null : <Upload aria-hidden="true" />}{uploading ? ui("Uploading\u2026") : ui("Upload document")}
                  </SystemButton>
                </div>
              </div>
            </div>

            <div className="sk-panel p-5">
              <PanelTitle icon={History} title={ui("Timeline")} />
              <div className="mt-4 space-y-2 max-h-80 overflow-y-auto custom-scrollbar pe-1">
                {staffTimeline.length === 0 ? (
                  <EmptyInline text={ui("No staff record events yet.")} />
                ) : (
                  staffTimeline.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 rounded-2xl border border-edge/20 bg-surface-subtle px-4 py-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
                        {event.kind === "SALARY" ? <Banknote className="h-3.5 w-3.5" /> : event.kind === "BANK" ? <CreditCard className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-ink-strong">{event.title}</p>
                        {event.detail ? <p className="mt-0.5 text-2xs font-semibold text-ink-muted">{event.detail}</p> : null}
                        <p className="mt-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{formatStaffDate(event.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </ModalFrame>
  );
}

function AmountRowsEditor({
  title,
  rows,
  onChange,
}: {
  title: string;
  rows: { name: string; amount: string }[];
  onChange: (rows: { name: string; amount: string }[]) => void;
}) {
  const ui = useUiText();
  const update = (index: number, field: "name" | "amount", value: string) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  return (
    <div>
      <span className="sk-field-label">{title}</span>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <SystemInput
              value={row.name}
              placeholder={ui("Label")}
              onChange={(e) => update(index, "name", e.target.value)}
              className="min-w-0 flex-1 px-3"
            />
            <SystemInput
              value={row.amount}
              type="number"
              placeholder="0.00"
              dir="ltr"
              onChange={(e) => update(index, "amount", e.target.value)}
              className="w-24 px-3"
            />
            <SystemButton variant="ghost"
              type="button"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              className="flex shrink-0 items-center justify-center"
            >
              <X className="h-4 w-4" />
            </SystemButton>
          </div>
        ))}
        <SystemButton variant="ghost"
          type="button"
          onClick={() => onChange([...rows, { name: "", amount: "" }])}
          className="flex items-center gap-1.5 px-3 justify-start"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" /> {ui("Add a line")}
        </SystemButton>
      </div>
    </div>
  );
}

/**
 * Accent colours a modal can carry. The tone drives the header wash, the icon
 * tile and the eyebrow, so a destructive dialog never looks like a create one.
 *
 * Re-exported from the shared dialog shell rather than redefined here — the two
 * copies had drifted to slightly different ambers.
 */
export { MODAL_TONES };
export type { ModalTone, ModalSize };

/**
 * @deprecated New dialogs use `Modal` from `@/components/ui/modal` directly (R2). This thin adapter keeps the
 * admin-facing name and prop shape for existing callers.
 *
 * The shell every admin dialog sits in.
 *
 * The layout, layering and keyboard behaviour now come from the single `Modal`
 * in ui/ — this stays as the admin-facing name and prop shape so the ~40 call
 * sites in this file are untouched, and so `wide` keeps meaning what it always
 * meant here.
 */
export function ModalFrame({
  title,
  eyebrow,
  subtitle,
  icon,
  avatar,
  chips,
  tone = "violet",
  children,
  onClose,
  wide = false,
  size,
  footer,
  headerActions,
  dirty,
  dirtyMessage,
}: {
  title: string;
  eyebrow?: string;
  /** One plain line under the title saying what this dialog is for. */
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** A photo shown instead of the icon tile — used by the profile dialogs. */
  avatar?: ReactNode;
  /** Small status pills under the subtitle. */
  chips?: ReactNode;
  tone?: ModalTone;
  children: ReactNode;
  onClose: () => void;
  /** Legacy shorthand for size="lg". */
  wide?: boolean;
  size?: ModalSize;
  /** Pinned to the bottom, outside the scroll area. */
  footer?: ReactNode;
  /** Sits beside the close button, e.g. an Edit toggle. */
  headerActions?: ReactNode;
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
      size={size ?? (wide ? "lg" : "sm")}
      footer={footer}
      headerActions={headerActions}
      onClose={onClose}
      dirty={dirty}
      dirtyMessage={dirtyMessage}
    >
      {children}
    </Modal>
  );
}

/**
 * @deprecated Use `ModalActions` from `@/components/ui/modal` (onCancel / onAction). This keeps the admin-era
 * prop shape (onClose / onSave / hint) for existing callers and renders the one shared footer (F15, R2).
 */
export function ModalActions({
  busy,
  busyLabel,
  actionLabel,
  onClose,
  onSave,
  tone = "violet",
  hint,
  blockedReason,
}: {
  busy: boolean;
  busyLabel: string;
  actionLabel: string;
  onClose: () => void;
  onSave: () => void;
  tone?: ModalTone;
  /** Optional note explaining what the action will do. */
  hint?: ReactNode;
  blockedReason?: string | null;
}) {
  const footerTone: "violet" | "rose" | "emerald" = tone === "rose" ? "rose" : tone === "emerald" ? "emerald" : "violet";
  return (
    <div className="mt-6 space-y-3 border-t border-border pt-5">
      {hint ? <p className="text-xs font-semibold text-ink-muted">{hint}</p> : null}
      <SharedModalActions
        busy={busy}
        busyLabel={busyLabel}
        actionLabel={actionLabel}
        onCancel={onClose}
        onAction={onSave}
        tone={footerTone}
        blockedReason={blockedReason}
      />
    </div>
  );
}

export function FormInput({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block group/input">
      <span className="sk-field-label">{label}</span>
      <SystemInput
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full px-4 transition-all duration-250"
      />
    </label>
  );
}

export function FormSelect({
  label,
  value,
  children,
  onChange,
}: {
  label: string;
  value: string;
  children: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block group/select">
      <span className="sk-field-label">{label}</span>
      <SystemSelect
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full cursor-pointer px-4 transition-all duration-250"
      >
        {children}
      </SystemSelect>
    </label>
  );
}

export function ClassGroupCard({
  group,
  teachers,
  students,
  onAddStudent,
  onBulkImport,
  onViewClass,
  onChangeTeacher,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
  onAddSection,
}: {
  group: { name: string; academicYear: number | string; sections: any[] };
  teachers: any[];
  students: any[];
  /** Omitted for a viewer who cannot admit students (§4.5.11): the Add student controls are not rendered. */
  onAddStudent?: (classId?: string) => void;
  onBulkImport?: (classId?: string) => void;
  onViewClass: (cls: any) => void;
  onChangeTeacher: (classId: string, teacherId: string) => Promise<void>;
  onDeleteClass?: (cls: any) => void;
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number; capacity?: number | null }) => Promise<boolean | void>;
  onDeleteSubject?: (subject: any) => void;
  onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
  onAddSection?: (name: string, section: string, academicYear: number, convertClassId?: string) => Promise<void>;
}) {
  const ui = useUiText();
  const [open, setOpen] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSectionBusy, setAddingSectionBusy] = useState(false);
  const studentCount = group.sections.reduce((sum, cls) => sum + (cls._count?.students || 0), 0);
  const subjectCount = group.sections.reduce((sum, cls) => sum + (cls._count?.subjects || cls.subjects?.length || 0), 0);
  const sectionless = isSectionless(group);

  const handleAddSection = async () => {
    if (!newSectionName.trim()) return;
    setAddingSectionBusy(true);
    try {
      if (onAddSection) {
        // A sectionless class already occupies the "no section" slot. Adding
        // its first real section must rename that row, otherwise the students
        // stay stranded on an unnamed sibling class.
        await onAddSection(
          group.name,
          newSectionName.trim(),
          Number(group.academicYear),
          sectionless ? group.sections[0]?.id : undefined
        );
      }
      setNewSectionName("");
      setAddingSection(false);
    } finally {
      setAddingSectionBusy(false);
    }
  };

  return (
    <div className={cn(
      "sk-panel sk-rise group transition-all self-start",
      open
        ? "border-edge/25 hover:border-primary/25 hover:shadow-lg"
        : "border-edge/5 hover:border-primary/10",
      // Expanded, the card carries per-section rows with their own metadata and
      // action buttons. In a half-width grid column those wrapped into a jumble,
      // so an open card takes the whole row.
      open && "md:col-span-2"
    )}>
      {/* div, not <button>: the Delete control below is itself a button, and
          nested interactive elements are invalid HTML (triggers a hydration
          mismatch). This reproduces button semantics/keyboard behavior without
          that constraint. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={cn(
          "group/classrow flex w-full cursor-pointer items-center justify-between gap-4 text-start transition-all",
          open ? "p-5" : "px-4 py-3"
        )}
        aria-expanded={open}
      >
        <div className="relative flex items-center gap-3 min-w-0">
          <div className={cn(
            "relative flex shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary shadow-sm transition-all",
            open ? "h-10 w-10" : "h-8 w-8"
          )}>
            <BookOpen className={cn("transition-all", open ? "h-5 w-5" : "h-4 w-4")} />
          </div>
          <div className="min-w-0">
            <p className={cn("truncate font-bold text-ink-strong transition-all", open ? "text-base" : "text-sm")}>
              {group.name}
            </p>
            {open ? (
              <p className="mt-0.5 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                {group.academicYear} - {sectionless
                  ? ui("No sections")
                  : ui(group.sections.length === 1 ? "{0} section" : "{0} sections", [group.sections.length])} · {ui(studentCount === 1 ? "{0} student" : "{0} students", [studentCount])} · {ui(subjectCount === 1 ? "{0} subject" : "{0} subjects", [subjectCount])}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/*
            Deleting a class cascades to its sections, subjects, marks and the
            students on its roll, so it does not get to sit in every row as a
            permanently lit red button competing with the row itself. It appears
            on hover, and on keyboard focus so it stays reachable.
          */}
          {onDeleteClass ? (
            <SystemButton variant="ghost"
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteClass(group.sections[0]); }}
              aria-label={ui("Delete {0}", [group.name])}
              className="flex items-center gap-1 px-2 justify-start"
            >
              <Trash2 className="h-3 w-3" />
              {ui("Delete")}
            </SystemButton>
          ) : null}
          <span className="text-3xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
            {ui(group.sections.length === 1 ? "{0} section" : "{0} sections", [group.sections.length])}
          </span>
          <ChevronDown
            className={cn(
              "text-primary transition-all duration-200",
              open ? "h-5 w-5 rotate-180" : "h-4 w-4"
            )}
          />
        </div>
      </div>

      {open ? (
        <div className="border-t border-edge/10 p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label={ui("Students")} value={studentCount} active />
            <MiniMetric label={ui("Subjects")} value={subjectCount} />
          </div>
          {group.sections.map((cls) => (
            <SectionCard
              key={cls.id}
              cls={cls}
              teachers={teachers}
              classTeacherId={cls.classTeacher?.id || ""}
              students={(students || []).filter((s: any) => s.class?.id === cls.id || s.classId === cls.id)}
              onViewClass={onViewClass}
              onAddStudent={onAddStudent}
              onBulkImport={onBulkImport}
              onChangeTeacher={onChangeTeacher}
              onDeleteClass={onDeleteClass}
              onUpdateClass={onUpdateClass}
              onDeleteSubject={onDeleteSubject}
              onUpdateSubject={onUpdateSubject}
            />
          ))}
          <div className="pt-2">
            {addingSection ? (
              <div className="flex items-center gap-2">
                <SystemInput
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder={sectionless ? ui("First section name (e.g. A)") : ui("Section name (e.g. C)")}
                  className="flex-1 px-3"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
                />
                <SystemButton variant="default"
                  type="button"
                  onClick={handleAddSection}
                  disabled={addingSectionBusy || !newSectionName.trim()}
                  className="flex items-center gap-1 px-4 justify-start"
                >
                  {addingSectionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ui("Add")}
                </SystemButton>
                <SystemButton variant="ghost"
                  type="button"
                  onClick={() => { setAddingSection(false); setNewSectionName(""); }}
                  className="flex items-center gap-1 px-4 justify-start"
                >
                  {ui("Cancel")}
                </SystemButton>
              </div>
            ) : (
              <SystemButton variant="ghost"
                type="button"
                onClick={() => setAddingSection(true)}
                className="flex w-full items-center justify-center gap-2 py-3"
              >
                <Plus className="w-4 h-4" />
                {sectionless ? ui("Split into sections") : ui("Add Section")}
              </SystemButton>
            )}
            {sectionless && addingSection ? (
              <p className="mt-2 px-1 text-2xs font-bold leading-relaxed text-ink-muted">
                {ui("This class currently has no sections. Naming one moves the existing students and subjects into it — nothing is lost.")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SectionCard({
  cls,
  teachers,
  classTeacherId,
  students,
  onViewClass,
  onAddStudent,
  onBulkImport,
  onChangeTeacher,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
}: {
  cls: any;
  teachers: any[];
  classTeacherId: string;
  students: any[];
  onViewClass: (cls: any) => void;
  /** Omitted for a viewer who cannot admit students (§4.5.11): the Add student controls are not rendered. */
  onAddStudent?: (classId?: string) => void;
  onBulkImport?: (classId?: string) => void;
  onChangeTeacher: (classId: string, teacherId: string) => Promise<void>;
  onDeleteClass?: (cls: any) => void;
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number; capacity?: number | null }) => Promise<boolean | void>;
  onDeleteSubject?: (subject: any) => void;
  onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const ui = useUiText();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const subjectCount = cls.subjects?.length || cls._count?.subjects || 0;
  const studentCount = students.length || cls._count?.students || 0;
  const isSubjectMode = cls.teachingMode === "SUBJECT";
  const assignedSubjectTeachers = (cls.subjects || []).filter((s: any) => s.teacher?.id).length;
  const displayStudents = showAllStudents ? students : students.slice(0, 6);

  return (
    <div className="rounded-2xl bg-brand-50/55 overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-strong">{cls.section ? ui("Section {0}", [cls.section]) : ui("Whole class")}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {isSubjectMode ? (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                <UserCheck className="h-3 w-3" />
                {subjectCount ? ui("{0}/{1} teachers", [assignedSubjectTeachers, subjectCount]) : ui("No subjects yet")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                <UserCheck className="h-3 w-3" />
                {cls.classTeacher?.fullName || ui("No class teacher")}
              </span>
            )}
            <span className="text-ink-subtle">|</span>
            <span className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui(studentCount === 1 ? "{0} student" : "{0} students", [studentCount])}</span>
            <span className="text-ink-subtle">|</span>
            <span className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui(subjectCount === 1 ? "{0} subject" : "{0} subjects", [subjectCount])}</span>
            <span
              className="rounded-full bg-card px-2 py-0.5 text-3xs font-semibold ltr:uppercase ltr:tracking-wider text-primary"
              title={cls.teachingMode === "SUBJECT" ? ui("Each subject has its own teacher") : ui("The class teacher takes every subject")}
            >
              {cls.teachingMode === "SUBJECT" ? ui("Per subject") : ui("One teacher")}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SystemButton variant="default"
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewClass(cls); }}
            className="flex items-center gap-1 px-2.5 justify-start"
            title={ui("Manage section: teachers, subjects, syllabus")}
          >
            <Settings className="h-3 w-3" />
            {ui("Manage")}
          </SystemButton>
          {onDeleteClass ? (
            <SystemButton variant="ghost"
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteClass(cls); }}
              className="flex items-center justify-center"
              title={ui("Delete section")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </SystemButton>
          ) : null}
          {onAddStudent ? (
            <SystemButton variant="default"
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddStudent(cls.id); }}
              className="px-2"
              title={ui("Add a single student")}
            >
              {ui("+ Student")}
            </SystemButton>
          ) : null}

          <SystemButton variant="ghost"
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex items-center justify-center"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", detailsOpen && "rotate-180")} />
          </SystemButton>
        </div>
      </div>

      {detailsOpen ? (
        <div className="border-t border-edge/10">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                {ui("Subjects ({0})", [subjectCount])}
              </p>
            </div>
            {cls.subjects?.length ? (
              <div className="space-y-1.5">
                {cls.subjects.map((subject: any) => (
                  <div key={subject.id} className="flex items-center justify-between rounded-xl bg-card px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-ink-strong truncate">{subject.name}</p>
                      <p className="text-3xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle mt-0.5">
                        {subject.teacher?.fullName || ui("No teacher")} · {ui("{0} marks", [subject.totalMarks || 100])}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold ltr:uppercase ltr:tracking-wider",
                        subject.teacher?.id ? "bg-status-success-surface text-status-success-text" : "bg-status-warning-surface text-status-warning-text"
                      )}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", subject.teacher?.id ? "bg-success" : "bg-warning")} />
                        {subject.teacher?.id ? ui("Assigned") : ui("Unassigned")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-card/70 px-3 py-2 text-2xs font-bold text-ink-subtle">
                {ui("No subjects yet. Click Manage to add subjects, assign teachers, and build the syllabus.")}
              </p>
            )}
          </div>

          <div className="border-t border-edge/10 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle flex items-center gap-1">
                <GraduationCap className="h-3 w-3" />
                {ui("Students ({0})", [studentCount])}
              </p>
              {students.length > 6 ? (
                <SystemButton variant="ghost"
                  type="button"
                  onClick={() => setShowAllStudents(!showAllStudents)}
                  className="hover:underline"
                >
                  {showAllStudents ? ui("Show Less") : ui("View All {0}", [students.length])}
                </SystemButton>
              ) : null}
            </div>
            {students.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {displayStudents.map((student: any) => (
                  <div key={student.id} className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-2">
                    <div className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-brand-50 border border-white">
                      <img
                        src={resolveMediaUrl(student.profileImageUrl) ?? undefined}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-2xs font-bold text-ink-strong truncate">{student.fullName}</p>
                      <p className="text-3xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Roll {0}", [student.rollNo || "—"])}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-card/70 px-3 py-2 text-2xs font-bold text-ink-subtle">
                {ui("No students enrolled yet. Click + Student to add.")}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PendingFacultyRow({ invite, onResend, onCancel, readOnly = false }: { invite: any; onResend: () => void; onCancel: () => void; readOnly?: boolean }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const expired = invite.expiresAt ? new Date() > new Date(invite.expiresAt) : false;
  const inviteName = invite.profile?.fullName || invite.fullName || null;
  const deliveryFailed = invite.deliveryStatus === "failed";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-status-warning-border bg-status-warning-surface px-4 py-3">
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-status-warning-border bg-card text-status-warning-text">
        <Clock className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-bold text-ink-strong">{inviteName ? <bdi>{inviteName}</bdi> : ui("Invitation pending")}</p>
          <Badge variant={deliveryFailed || expired ? "danger" : "warning"} size="sm">
            {deliveryFailed ? ui("Delivery failed") : expired ? ui("Expired") : ui(formatStatus(invite.role))}
          </Badge>
        </div>
        <p dir="ltr" className="truncate text-start text-xs text-ink-muted">{invite.email}</p>
        {deliveryFailed ? <p role="status" className="mt-1 text-xs text-status-error-text">{ui("Email could not be delivered. Resend to try again.")}</p> : null}
        {invite.expiresAt ? (
          <p className="mt-1 text-xs font-medium text-ink-muted">
            {expired ? ui("Expired {0}", [date(invite.expiresAt)]) : ui("Expires {0}", [date(invite.expiresAt)])}
          </p>
        ) : null}
      </div>
      {readOnly ? null : (
        <div className="flex shrink-0 items-center gap-1.5">
          <SystemButton variant="outline" size="sm" type="button" onClick={onResend}>
            <Send aria-hidden="true" />{ui("Resend")}
          </SystemButton>
          <Menu
            label={ui("More actions")}
            align="end"
            trigger={<IconButton label={ui("More actions for {0}", [inviteName || invite.email || ""])}><MoreHorizontal aria-hidden="true" /></IconButton>}
            items={[{ id: "cancel", label: ui("Cancel invitation"), tone: "danger", onSelect: onCancel }]}
          />
        </div>
      )}
    </div>
  );
}

export function FacultyRow({ teacher, onView, onRemove }: { teacher: any; onView: () => void; onRemove?: () => void }) {
  const ui = useUiText();
  const avatar = teacher.profileImageUrl;
  const subjects = teacher._count?.taughtSubjects ?? teacher.taughtSubjects?.length ?? 0;
  const classes = teacher._count?.ledClasses ?? teacher.ledClasses?.length ?? 0;
  return (
    <div className="sk-rise flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30">
      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-border bg-brand-50">
        <AvatarImage src={avatar} name={teacher.fullName} initialsClassName="text-sm" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink-strong"><bdi>{teacher.fullName}</bdi></p>
        <p dir="ltr" className="truncate text-start text-xs text-ink-muted">{teacher.email}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {classes > 0 ? (
            <Badge variant="info" size="sm">
              <School className="h-2.5 w-2.5" aria-hidden="true" />
              {ui("Class teacher · {0}", [classes])}
            </Badge>
          ) : null}
          {!teacher.onboardingComplete ? (
            <Badge variant="warning" size="sm">
              <Clock className="h-2.5 w-2.5" aria-hidden="true" />
              {ui("Onboarding")}
            </Badge>
          ) : null}
          {/* Zero subjects is the thing that blocks the timetable, so it reads as a warning. */}
          <Badge variant={subjects === 0 ? "warning" : "success"} size="sm">
            {subjects === 0 ? ui("No subjects") : ui(subjects === 1 ? "{0} subject" : "{0} subjects", [subjects])}
          </Badge>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <SystemButton variant="outline" size="sm" type="button" onClick={onView}>
          {ui("Open")}
        </SystemButton>
        {onRemove ? (
          <Menu
            label={ui("More actions")}
            align="end"
            trigger={<IconButton label={ui("More actions for {0}", [teacher.fullName])}><MoreHorizontal aria-hidden="true" /></IconButton>}
            items={[{ id: "revoke", label: ui("Revoke access"), tone: "danger", onSelect: onRemove }]}
          />
        ) : null}
      </div>
    </div>
  );
}

/* The helpers below take EN UI keys (or text a caller already translated) and translate them here (R11). */

export function PanelTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  const ui = useUiText();
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-bold tracking-tight text-ink-strong">{ui(title)}</h3>
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const ui = useUiText();
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-card/70 px-4 py-3 transition-colors duration-200 hover:bg-card">
      <span className="shrink-0 text-xs font-semibold text-ink-subtle">{ui(label)}</span>
      <span className="min-w-0 truncate text-end text-sm font-bold text-ink-strong">{value}</span>
    </div>
  );
}

export function MiniMetric({ label, value, active }: { label: string; value: any; active?: boolean }) {
  const ui = useUiText();
  return (
    <div className={cn(
      "rounded-2xl px-4 py-3.5 transition-all duration-200",
      active ? "bg-brand-100" : "bg-brand-50/60"
    )}>
      <p className="text-2xs font-semibold leading-none text-ink-subtle">{ui(label)}</p>
      <bdi className={cn("mt-1.5 block truncate text-base font-bold leading-none tabular-nums", active ? "text-primary" : "text-ink-strong")}>{value}</bdi>
    </div>
  );
}

export function StatusPill({ status }: { status?: string }) {
  const ui = useUiText();
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-2xs font-semibold transition-all duration-200",
      statusTone(status)
    )}>
      {ui(formatStatus(status))}
    </span>
  );
}

export function EmptyInline({ text }: { text: string }) {
  const ui = useUiText();
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-5 text-center">
      <p className="text-sm font-semibold leading-relaxed text-ink-muted">{ui(text)}</p>
    </div>
  );
}

/**
 * Chip-based editor for a teacher's subject specialities.
 *
 * Free text rather than a fixed list, because subject naming varies by school
 * ("Maths" vs "Mathematics") and specialities aren't always real subject rows.
 * The "teaches all subjects" toggle covers generalists (primary class teachers),
 * for whom an out-of-speciality warning would just be noise.
 */
export function SpecialtyEditor({
  specialties,
  teachesAll,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  onToggleAll,
}: {
  specialties: string[];
  teachesAll: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onToggleAll: () => void;
}) {
  const ui = useUiText();
  return (
    <div className="rounded-2xl border border-edge/25 bg-brand-50/40 p-4">
      <p className="mb-2 ps-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
        {ui("Teaching specialities")}
      </p>

      <SystemButton variant="ghost"
        type="button"
        onClick={onToggleAll}
        className="mb-3 flex w-full items-center gap-3 p-3 text-start justify-start"
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
            teachesAll ? "border-status-success-text bg-success" : "border-edge/50 bg-card"
          )}
        >
          {teachesAll ? <Check className="h-3 w-3 text-white" strokeWidth={3.5} /> : null}
        </span>
        <span className="min-w-0">
          <span className="block text-2xs font-bold text-ink-strong">{ui("Can teach all subjects")}</span>
          <span className="block text-2xs font-bold text-ink-muted">
            {ui("Generalist — never warned about subject mismatch.")}
          </span>
        </span>
      </SystemButton>

      {!teachesAll ? (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {specialties.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-2xs font-bold text-primary"
              >
                {s}
                <SystemButton variant="ghost"
                  type="button"
                  onClick={() => onRemove(s)}
                  className=""
                  aria-label={ui("Remove {0}", [s])}
                >
                  <X className="h-2.5 w-2.5" />
                </SystemButton>
              </span>
            ))}
            {specialties.length === 0 ? (
              <span className="text-2xs font-bold text-ink-subtle">
                {ui("No specialities yet — add the subjects this teacher is qualified for.")}
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <SystemInput
              type="text"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdd(draft);
                }
              }}
              placeholder={ui("e.g. Mathematics")}
              className="flex-1 px-3 transition-all"
            />
            <SystemButton variant="default"
              type="button"
              onClick={() => onAdd(draft)}
              className="shrink-0 px-4"
            >
              {ui("Add")}
            </SystemButton>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── STUDENT SETUP (Categories & Groups) ───────────────────
// Self-contained CRUD for the student tag lists. Both tags feed fee
// discounts (Module 2) and reports; both are optional per student.
// Deletion is blocked (409) while any student references the tag.

type StudentTagKind = "category" | "group";

const STUDENT_TAG_API: Record<StudentTagKind, string> = {
  category: "/api/student-categories",
  group: "/api/student-groups",
};

export function StudentSetupPanel({
  studentCount,
  onViewStudents,
}: {
  /** Roster size, so the panel can say how many students are untagged. */
  studentCount?: number;
  /** Jumps to the roster filtered by this tag. Omit to hide the link. */
  onViewStudents?: (filter: { categoryId?: string; groupId?: string }) => void;
} = {}) {
  const ui = useUiText();
  const [categories, setCategories] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ kind: StudentTagKind; item: any } | null>(null);
  const [creating, setCreating] = useState<StudentTagKind | null>(null);
  const [deleting, setDeleting] = useState<{ kind: StudentTagKind; item: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, grps] = await Promise.all([
        fetch(STUDENT_TAG_API.category, { cache: "no-store" }).then((r) => r.json()),
        fetch(STUDENT_TAG_API.group, { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (!Array.isArray(cats.data) || !Array.isArray(grps.data)) throw new Error(readApiError(cats.data ? grps : cats, "Categories could not be loaded."));
      setCategories(cats.data ?? []);
      setGroups(grps.data ?? []);
      setLoadFailed(false);
    } catch {
      // R4: an inline ErrorState with retry, never a toast.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveTag = async (kind: StudentTagKind, payload: { name: string; description?: string; isActive?: boolean }) => {
    setBusy(true);
    try {
      const body = editing
        ? { id: editing.item.id, ...payload }
        : payload;
      const res = await fetch(STUDENT_TAG_API[kind], {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiError(json, ui("The change could not be saved. Please try again.")));
      toast.success(ui(editing ? (kind === "category" ? "Category updated" : "Group updated") : (kind === "category" ? "Category created" : "Group created")));
      setEditing(null);
      setCreating(null);
      await load();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("The change could not be saved. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  const modal = editing || (creating ? { kind: creating, item: null } : null);
  const kind = modal?.kind as StudentTagKind;

  const countOf = (t: { _count?: { students?: number } }) => t._count?.students ?? 0;
  const taggedStudents = categories.reduce((sum, c) => sum + countOf(c), 0);
  const unusedTags = [...categories, ...groups].filter((t) => countOf(t) === 0).length;

  return (
    <div className="space-y-8">
      {/* A section of Campus setup: the view's page title sits above, so this is an h2. */}
      <PageHeader
        headingLevel={2}
        icon={Tag}
        title={ui("Categories & groups")}
        description={ui("Categories tag fee or scholarship eligibility and drive fee discounts; groups tag logistics and cohorts such as transport users or houses. Both are optional for each student.")}
        status={<Badge variant="neutral" className="tabular-nums">{ui("{0} tags defined", [categories.length + groups.length])}</Badge>}
      />

      {/* A tag nobody uses and a roster nobody has tagged are the two things
          worth knowing here, and neither was visible before. */}
      <StatTiles
        tiles={[
          { key: "cats", icon: Tag, label: "Categories", value: categories.length, tone: "violet" },
          { key: "grps", icon: Layers, label: "Groups", value: groups.length, tone: "teal" },
          {
            key: "tagged",
            icon: UserCheck,
            label: "Students with a category",
            value: taggedStudents,
            hint: studentCount ? ui("of {0} on roll", [studentCount]) : undefined,
            tone: "emerald",
          },
          {
            key: "unused",
            icon: AlertTriangle,
            label: "Tags nobody uses",
            value: unusedTags,
            hint: unusedTags ? "Safe to remove" : "All in use",
            tone: unusedTags ? "amber" : "emerald",
          },
        ]}
      />

      {loadFailed && !categories.length && !groups.length ? (
        <ErrorState
          variant="panel"
          title={ui("Couldn't load categories and groups")}
          description={ui("The student tags didn't come back. Check your connection and try again.")}
          onRetry={() => load()}
        />
      ) : (
      <div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TagListCard
            kind="category"
            icon={Tag}
            title={ui("Student categories")}
            items={categories}
            loading={loading}
            onAdd={() => setCreating("category")}
            onEdit={(item) => setEditing({ kind: "category", item })}
            onDelete={(item) => setDeleting({ kind: "category", item })}
            onViewStudents={
              onViewStudents ? (item) => onViewStudents({ categoryId: item.id }) : undefined
            }
          />
          <TagListCard
            kind="group"
            icon={Layers}
            title={ui("Student groups")}
            items={groups}
            loading={loading}
            onAdd={() => setCreating("group")}
            onEdit={(item) => setEditing({ kind: "group", item })}
            onDelete={(item) => setDeleting({ kind: "group", item })}
            onViewStudents={onViewStudents ? (item) => onViewStudents({ groupId: item.id }) : undefined}
          />
        </div>
      </div>
      )}

      {modal ? (
        <TagFormModal
          kind={kind}
          item={editing?.item}
          busy={busy}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
          onSave={saveTag}
        />
      ) : null}

      {deleting ? <ReviewedDeleteDialog endpoint={deleting.kind === "category" ? "student-categories" : "student-groups"}
        record={deleting.item} label={deleting.item.name} onCancel={() => setDeleting(null)} onDeleted={load} /> : null}
    </div>
  );
}

function TagListCard({
  kind,
  icon: Icon,
  title,
  items,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onViewStudents,
}: {
  kind: StudentTagKind;
  icon: LucideIcon;
  title: string;
  items: any[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
  onViewStudents?: (item: any) => void;
}) {
  const ui = useUiText();
  const noun = kind === "category" ? "category" : "group";
  return (
    <section aria-label={ui(title)} className="sk-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-ink-strong">{ui(title)}</h3>
            <p className="text-xs font-semibold text-ink-subtle">
              {ui(items.length === 1 ? "{0} tag" : "{0} tags", [items.length])}
            </p>
          </div>
        </div>
        <SystemButton type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus aria-hidden="true" />{ui(kind === "category" ? "Add category" : "Add group")}
        </SystemButton>
      </div>

      <div className="space-y-2.5">
        {loading ? (
          <SkeletonList rows={3} label={ui("Loading tags…")} />
        ) : items.length === 0 ? (
          <EmptyInline text={kind === "category" ? "No categories yet — add your first one." : "No groups yet — add your first one."} />
        ) : (
          items.map((item) => {
            const studentCount = item._count?.students ?? 0;
            return (
              <div
                key={item.id}
                className="group flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-subtle px-4 py-3 transition-all hover:border-primary/25 hover:bg-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-ink-strong"><bdi>{item.name}</bdi></p>
                    {kind === "category" ? (
                      <StatusPill status={item.isActive === false ? "INACTIVE" : "ACTIVE"} />
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs font-semibold text-ink-muted">
                    {item.description ? <bdi>{item.description}</bdi> : ui("No description")}
                  </p>
                </div>
                {onViewStudents && studentCount > 0 ? (
                  <SystemButton variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => onViewStudents(item)}
                    aria-label={ui("Show the students tagged {0}", [item.name])}
                    className="shrink-0 gap-1 px-2.5"
                  >
                    {ui(studentCount === 1 ? "{0} student" : "{0} students", [studentCount])}
                    <ArrowRight className="h-3 w-3 rtl:rotate-180" aria-hidden="true" />
                  </SystemButton>
                ) : (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-2xs font-semibold",
                      studentCount > 0 ? "bg-card text-primary" : "bg-muted text-ink-subtle",
                    )}
                  >
                    {studentCount === 0 ? ui("Unused") : ui(studentCount === 1 ? "{0} student" : "{0} students", [studentCount])}
                  </span>
                )}
                {/* §4.5.2: rename and delete live in the row's overflow menu; delete is confirmed. */}
                <Menu
                  label={ui("More actions")}
                  align="end"
                  trigger={<IconButton label={ui("More actions for {0}", [item.name])}><MoreHorizontal aria-hidden="true" /></IconButton>}
                  items={[
                    { id: "rename", label: noun === "category" ? "Rename category" : "Rename group", icon: Pencil, onSelect: () => onEdit(item) },
                    { id: "delete", label: noun === "category" ? "Delete category" : "Delete group", icon: Trash2, tone: "danger", onSelect: () => onDelete(item) },
                  ]}
                />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function TagFormModal({
  kind,
  item,
  busy,
  onClose,
  onSave,
}: {
  kind: StudentTagKind;
  item: any;
  busy: boolean;
  onClose: () => void;
  onSave: (kind: StudentTagKind, payload: { name: string; description?: string; isActive?: boolean }) => void;
}) {
  const ui = useUiText();
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [isActive, setIsActive] = useState(item?.isActive !== false);
  const [error, setError] = useState("");
  const category = kind === "category";

  const submit = () => {
    if (!name.trim()) {
      setError(ui("Give it a name."));
      return;
    }
    onSave(kind, {
      name: name.trim(),
      description: description.trim() || undefined,
      ...(category ? { isActive } : {}),
    });
  };

  return (
    <Modal
      title={ui(item ? (category ? "Edit category" : "Edit group") : (category ? "New category" : "New group"))}
      eyebrow={ui("Categories & groups")}
      icon={category ? Tag : Layers}
      tone={category ? "emerald" : "sky"}
      size="sm"
      dirty={name !== (item?.name || "") || description !== (item?.description || "")}
      onClose={onClose}
      footer={
        <SharedModalActions
          busy={busy}
          busyLabel={ui("Saving…")}
          actionLabel={ui(item ? "Save changes" : (category ? "Create category" : "Create group"))}
          onCancel={onClose}
          onAction={submit}
        />
      }
    >
      <div className="space-y-4">
        <FormField name="tag-name" label={ui("Name")} required error={error || undefined}>
          <SystemInput
            value={name}
            placeholder={ui(category ? "e.g. Scholarship" : "e.g. Transport users")}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
          />
        </FormField>
        <FormField name="tag-description" label={ui("Description")} optional>
          <SystemTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={ui(category ? "e.g. 50% fee concession for staff children" : "e.g. Students using the morning van route")}
            rows={3}
          />
        </FormField>
        {category ? (
          <label className="flex min-h-11 items-start gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3">
            <SystemCheckbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink-strong">{ui("Active")}</span>
              <span className="block text-xs text-ink-muted">
                {ui("Inactive categories stay on existing students but can't be chosen for new admissions.")}
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </Modal>
  );
}

const QUERY_SOURCES_LABELS: Record<string, string> = {
  WALK_IN: "Walk-in",
  PHONE: "Phone call",
  WEBSITE: "Website",
  REFERRAL: "Referral",
  ADVERT: "Advert",
};

function querySourceIcon(source: string) {
  if (source === "PHONE") return Phone;
  if (source === "WEBSITE") return Globe;
  if (source === "REFERRAL") return Users;
  if (source === "ADVERT") return Megaphone;
  return UserCheck;
}

const OPEN_ENQUIRY = ["ACTIVE", "FOLLOW_UP"];
const isOverdueEnquiry = (q: any, now: number) =>
  OPEN_ENQUIRY.includes(q.status) && Boolean(q.nextFollowUp) && new Date(q.nextFollowUp).getTime() < now;

/**
 * Admission enquiries (§3.1 admin `admissions&tab=enquiries`; receptionist `admissions&tab=enquiries`).
 * Self-sufficient for consoles that host it without campus data: `classes` are fetched when absent, and
 * "Convert to student" is offered only when `onConvert` is passed (the front desk logs and follows up; the
 * campus admin enrols). A console whose PageHeader carries "New enquiry" and "Export" passes `headerless`
 * and sends those as `command`s (`new-enquiry`, `export`); otherwise the panel shows its own section header.
 * A load failure is an inline ErrorState with retry (R4), never a silently empty list.
 */
export function AdmissionQueriesPanel({
  classes: providedClasses,
  version: providedVersion,
  onVersionBump,
  onConvert,
  command,
  headerless = false,
}: {
  classes?: any[];
  version?: number;
  onVersionBump?: () => void;
  onConvert?: (query: any) => void;
  /** Header commands from the hosting console: `new-enquiry` opens the form, `export` downloads the shown list. */
  command?: PanelCommand | null;
  /** The console's PageHeader carries this panel's actions, so the panel renders no header of its own. */
  headerless?: boolean;
}) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [localVersion, setLocalVersion] = useState(0);
  const version = (providedVersion ?? 0) + localVersion;
  const bumpVersion = () => { if (onVersionBump) onVersionBump(); else setLocalVersion((v) => v + 1); };
  const [fetchedClasses, setFetchedClasses] = useState<any[]>([]);
  useEffect(() => {
    if (providedClasses) return;
    let live = true;
    fetch("/api/classes", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => { if (live && json?.success !== false) setFetchedClasses(json.data || []); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [providedClasses]);
  const classes = providedClasses ?? fetchedClasses;
  const [queries, setQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useListField<string>("enquiries.status", "ALL", "enquiries.page");
  const [sourceFilter, setSourceFilter] = useListField<string>("enquiries.source", "ALL", "enquiries.page");
  const [searchQuery, setSearchQuery] = useListField<string>("enquiries.search", "", "enquiries.page");
  const [showOverdue, setShowOverdue] = useListField<boolean>("enquiries.overdue", false, "enquiries.page");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [now, setNow] = useState(0);
  // A follow-up desk works off "who is furthest past due", which the old
  // fixed order could not answer.
  const [querySort, setQuerySort] = useListField<"overdue" | "next" | "newest" | "name">("enquiries.sort", "overdue", "enquiries.page");
  const [queryPrefs, patchQueryPrefs] = useWorkspacePrefs("enquiries", { view: "cards" });

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /*
   * Status, source and overdue are applied client-side (see `filtered`), so
   * sending them to the API as well made every count on this screen wrong the
   * moment a chip was pressed. Only `search` still goes to the server, because
   * the complete bounded-page reader retrieves every matching row, so counts and exports
   * remain complete beyond the old 200-row cap.
   */
  const loadQueries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      setQueries(await loadListPages("/api/admission-queries", params));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadQueries();
  }, [loadQueries, version]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ACTIVE: 0, FOLLOW_UP: 0, CONVERTED: 0, LOST: 0, OVERDUE: 0, UNASSIGNED: 0, NO_DATE: 0 };
    for (const q of queries) {
      if (c[q.status] !== undefined) c[q.status] += 1;
      const open = OPEN_ENQUIRY.includes(q.status);
      if (isOverdueEnquiry(q, now)) c.OVERDUE += 1;
      // An open lead with nobody on it, or with no next date, is not overdue —
      // it is worse, because nothing will ever make it surface.
      if (open && !q.assignedTo) c.UNASSIGNED += 1;
      if (open && !q.nextFollowUp) c.NO_DATE += 1;
    }
    return c;
  }, [queries, now]);

  /**
   * Of the enquiries that have been decided either way, how many enrolled.
   * Leads still in play are excluded — counting them as failures makes a busy
   * week look like a bad one.
   */
  const conversionRate = useMemo(() => {
    const decided = counts.CONVERTED + counts.LOST;
    if (!decided) return null;
    return Math.round((counts.CONVERTED / decided) * 100);
  }, [counts]);

  const filtered = useMemo(() => {
    const rows = queries.filter((q) => {
      if (statusFilter !== "ALL" && q.status !== statusFilter) return false;
      if (sourceFilter !== "ALL" && q.source !== sourceFilter) return false;
      if (searchQuery.trim()) {
        const s = searchQuery.toLowerCase();
        if (!q.name.toLowerCase().includes(s) && !q.phone.includes(s) && !(q.email || "").toLowerCase().includes(s)) return false;
      }
      if (showOverdue && !isOverdueEnquiry(q, now)) return false;
      return true;
    });

    const due = (q: any) => (q.nextFollowUp ? new Date(q.nextFollowUp).getTime() : Infinity);
    return rows.sort((a, b) => {
      switch (querySort) {
        case "overdue": {
          // Most overdue first; anything without a date sinks to the bottom
          // rather than pretending to be urgent.
          const da = due(a);
          const db = due(b);
          if (da === db) return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
          return da - db;
        }
        case "next":
          return due(b) - due(a) || a.id.localeCompare(b.id);
        case "newest":
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime() || a.id.localeCompare(b.id);
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [queries, statusFilter, sourceFilter, searchQuery, showOverdue, now, querySort]);
  const enquiryPage = useListPage(filtered, "enquiries");

  const exportQueries = () => {
    if (!filtered.length) {
      toast.error(ui("Nothing to export — no enquiries match the current filters"));
      return;
    }
    downloadCSV("admission_enquiries", [
      ["Name", "Phone", "Email", "Source", "Status", "Class of interest", "Next follow-up",
        "Follow-ups logged", "Owner", "Converted student", "Enquired on", "Note"].map((heading) => ui(heading)),
      ...filtered.map((q: any) => [
        q.name,
        q.phone,
        q.email,
        ui(QUERY_SOURCES_LABELS[q.source] || q.source),
        ui(formatStatus(q.status)),
        q.classInterested ? classLabel(q.classInterested) : "",
        q.nextFollowUp ? String(q.nextFollowUp).slice(0, 10) : "",
        q._count?.followUps ?? 0,
        q.assignedTo?.fullName,
        q.convertedStudent?.fullName,
        String(q.createdAt || "").slice(0, 10),
        q.note,
      ]),
    ]);
    toast.success(ui(filtered.length === 1 ? "{0} enquiry exported" : "{0} enquiries exported", [filtered.length]));
  };

  usePanelCommand(command, { "new-enquiry": () => setShowNewModal(true), export: exportQueries }, !loading);

  /*
   * `active` is passed in rather than derived from the two arguments: the chip
   * compared its own prefixed key against its value, which is never equal, so
   * no chip ever rendered as selected.
   */
  const filterChip = (key: string, label: string, active: boolean, onSelect: () => void) => (
    <SystemButton variant="choice" size="sm"
      key={key}
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="px-3.5"
    >
      {label}
    </SystemButton>
  );

  const followUpChip = (q: any) => {
    const overdue = isOverdueEnquiry(q, now);
    if (!q.nextFollowUp) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-2xs font-semibold text-ink-muted">
          <Clock aria-hidden="true" className="h-3 w-3" /> {ui("No follow-up set")}
        </span>
      );
    }
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold",
        overdue ? "bg-status-error-surface text-status-error-text" : "bg-status-brand-surface text-status-brand-text",
      )}>
        <CalendarClock aria-hidden="true" className="h-3 w-3" />
        {ui(overdue ? "Overdue since {0}" : "Next {0}", [date(q.nextFollowUp)])}
      </span>
    );
  };

  return (
    <div className={cn("space-y-4", headerless ? "" : "sk-panel sk-rise p-6")}>
      {headerless ? null : (
        // Same anatomy as every console section: title, one sentence and the one action that starts new work.
        <PageHeader
          headingLevel={2}
          icon={PhoneCall}
          title={ui("Enquiries")}
          description={onConvert
            ? "Families who have asked about a place. Follow them up, then convert the ones who enrol."
            : "Families who have asked about a place. Log each one and follow it up; your campus admin enrols."}
          primaryAction={{ id: "new-enquiry", label: "New enquiry", icon: Plus, onClick: () => setShowNewModal(true) }}
          secondaryActions={[{ id: "export-enquiries", label: "Export", icon: Download, onClick: exportQueries, disabled: !filtered.length, disabledReason: "Nothing to export yet." }]}
        />
      )}

      {/* The pipeline in four numbers. Conversion rate is the one figure a head asks for. */}
      <StatTiles
        tiles={[
          {
            key: "open",
            icon: PhoneCall,
            label: "Open enquiries",
            value: counts.ACTIVE + counts.FOLLOW_UP,
            hint: ui("{0} in total", [queries.length]),
            tone: "violet",
          },
          {
            key: "overdue",
            icon: CalendarClock,
            label: "Overdue follow-ups",
            value: counts.OVERDUE,
            hint: counts.NO_DATE ? ui("{0} with no date set", [counts.NO_DATE]) : ui("All have a next date"),
            tone: counts.OVERDUE ? "rose" : "emerald",
            active: showOverdue,
            onClick: () => {
              setStatusFilter("ALL");
              setSourceFilter("ALL");
              setShowOverdue(!showOverdue);
            },
          },
          {
            key: "converted",
            icon: GraduationCap,
            label: "Converted",
            value: counts.CONVERTED,
            hint: conversionRate !== null ? ui("{0}% of decided enquiries", [conversionRate]) : ui("None decided yet"),
            tone: "emerald",
            active: statusFilter === "CONVERTED",
            onClick: () => {
              setShowOverdue(false);
              setSourceFilter("ALL");
              setStatusFilter(statusFilter === "CONVERTED" ? "ALL" : "CONVERTED");
            },
          },
          {
            key: "unassigned",
            icon: UserCheck,
            label: "Nobody assigned",
            value: counts.UNASSIGNED,
            hint: counts.UNASSIGNED ? ui("No one is chasing these") : ui("Every lead has an owner"),
            tone: counts.UNASSIGNED ? "amber" : "emerald",
          },
        ]}
      />

      {/* Overdue follow-ups are the only thing here that goes wrong on its own, so they are called out above the list. */}
      {counts.OVERDUE > 0 && !showOverdue ? (
        <Alert
          tone="danger"
          compact
          live="off"
          actions={
            <SystemButton type="button" size="sm" variant="outline" onClick={() => { setStatusFilter("ALL"); setShowOverdue(true); setSourceFilter("ALL"); }}>
              {ui("Show overdue")}
            </SystemButton>
          }
        >
          {ui(counts.OVERDUE === 1 ? "{0} follow-up is overdue." : "{0} follow-ups are overdue.", [counts.OVERDUE])}
        </Alert>
      ) : null}

      <div role="group" aria-label={ui("Filter by status")} className="flex flex-wrap gap-2">
        {[
          { key: "ALL", label: ui("All ({0})", [queries.length]) },
          { key: "ACTIVE", label: ui("Active ({0})", [counts.ACTIVE]) },
          { key: "FOLLOW_UP", label: ui("Follow-up ({0})", [counts.FOLLOW_UP]) },
          { key: "CONVERTED", label: ui("Converted ({0})", [counts.CONVERTED]) },
          { key: "OVERDUE", label: ui("Overdue ({0})", [counts.OVERDUE]) },
        ].map((c) =>
          filterChip(
            `status-${c.key}`,
            c.label,
            c.key === "OVERDUE" ? showOverdue : !showOverdue && statusFilter === c.key,
            () => {
              setStatusFilter(c.key === "OVERDUE" ? "ALL" : c.key);
              setShowOverdue(c.key === "OVERDUE");
              setSourceFilter("ALL");
            },
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={ui("Name, phone or email…")}
          label={ui("Search enquiries")}
          autoFocusKey={null}
          className="max-w-xs"
        />
        <ToolbarSelect
          label={ui("Source")}
          value={sourceFilter}
          onChange={setSourceFilter}
          options={[
            ["ALL", "All sources"],
            ...Object.entries(QUERY_SOURCES_LABELS).map(([k, v]) => [k, v] as [string, string]),
          ]}
        />
        <ToolbarSelect
          label={ui("Sort by")}
          value={querySort}
          onChange={(v) => setQuerySort(v as typeof querySort)}
          options={[
            ["overdue", "Most overdue first"],
            ["next", "Furthest away"],
            ["newest", "Newest enquiry"],
            ["name", "Name (A–Z)"],
          ]}
        />
        <span className="text-xs font-semibold text-ink-muted" aria-live="polite">{ui("{0} shown", [filtered.length])}</span>
        <div className="ms-auto">
          <ViewSwitch
            value={queryPrefs.view}
            onChange={(v) => patchQueryPrefs({ view: v })}
            options={[
              { value: "cards", label: "Cards", icon: LayoutGrid },
              { value: "table", label: "List", icon: ClipboardList },
                ...additionalWorkspaceViews,
            ]}
          />
        </div>
      </div>

      <Pagination {...enquiryPage.controls} />
      {loading && !queries.length ? (
        <SkeletonList rows={4} label={ui("Loading enquiries…")} />
      ) : loadFailed && !queries.length ? (
        <ErrorState
          variant="panel"
          title={ui("Couldn't load enquiries")}
          description={ui("The enquiry list didn't come back. Check your connection and try again.")}
          onRetry={() => void loadQueries()}
        />
      ) : queries.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title={ui("No enquiries yet")}
          description={ui("Log a family's first call or visit and follow it up from here.")}
          action={<SystemButton type="button" onClick={() => setShowNewModal(true)}><Plus aria-hidden="true" />{ui("New enquiry")}</SystemButton>}
        />
      ) : filtered.length === 0 ? (
        <EmptyInline text={ui("No enquiries match these filters. Try clearing them.")} />
      ) : queryPrefs.view !== "cards" ? (
        <DataTable
          view={queryPrefs.view}
          calendarLabel="Next follow-up"
          getCalendarDate={(row) => ({ value: row.nextFollowUp, kind: "date" })}
          rows={enquiryPage.rows}
          rowKey={(q: any) => q.id}
          minWidth={860}
          caption={ui("Admission enquiries")}
          getRowLabel={(q: any) => q.name}
          onRowClick={(q: any) => setSelected(q)}
          rowClassName={(q: any) => (isOverdueEnquiry(q, now) ? "bg-status-error-surface/40" : undefined)}
          columns={[
            {
              key: "name",
              label: "Enquiry",
              render: (q: any) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-strong"><bdi>{q.name}</bdi></p>
                  <p className="truncate text-xs font-semibold text-ink-subtle">
                    {ui(QUERY_SOURCES_LABELS[q.source] || q.source)}
                  </p>
                </div>
              ),
            },
            {
              key: "contact",
              label: "Contact",
              render: (q: any) => <EnquiryContact query={q} />,
            },
            {
              key: "class",
              label: "Class",
              secondary: true,
              render: (q: any) => (
                <span className="text-xs font-bold text-ink">
                  {q.classInterested ? <bdi>{classLabel(q.classInterested)}</bdi> : ui("Not set")}
                </span>
              ),
            },
            {
              key: "follow",
              label: "Next follow-up",
              render: (q: any) => followUpChip(q),
            },
            {
              key: "owner",
              label: "Owner",
              secondary: true,
              render: (q: any) => (
                <span className="text-xs font-bold text-ink-muted">
                  {q.assignedTo?.fullName ? <bdi>{q.assignedTo.fullName}</bdi> : ui("Unassigned")}
                </span>
              ),
            },
            {
              key: "status",
              label: "Status",
              align: "end",
              render: (q: any) => <StatusPill status={q.status} />,
            },
          ]}
        />
      ) : (
        <ul className="space-y-3" aria-label={ui("Admission enquiries")}>
          {enquiryPage.rows.map((q) => {
            const overdue = isOverdueEnquiry(q, now);
            const SourceIcon = querySourceIcon(q.source);
            return (
              <li
                key={q.id}
                className={cn(
                  "sk-panel relative flex flex-wrap items-start gap-3 overflow-hidden p-4",
                  overdue ? "border-status-error-border bg-status-error-surface/40" : "",
                )}
              >
                {overdue ? <span aria-hidden="true" className="absolute inset-y-4 start-0 w-1 rounded-e-full bg-status-error-text" /> : null}
                {/* The row opens the record; calling back stays one tap away beside it (§4.5.2). */}
                <SystemButton
                  variant="ghost"
                  type="button"
                  onClick={() => setSelected(q)}
                  className="h-auto min-w-0 flex-1 justify-start gap-3 p-0 text-start font-normal"
                  aria-label={ui("Open enquiry from {0}", [q.name])}
                >
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary">
                    <SourceIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-md font-bold tracking-tight text-ink-strong"><bdi>{q.name}</bdi></span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-ink-muted">
                      <bdi dir="ltr">{q.phone}</bdi>
                      {q.email ? <> · <bdi dir="ltr">{q.email}</bdi></> : null}
                      {" · "}
                      {q.classInterested ? <bdi>{classLabel(q.classInterested)}</bdi> : ui("Class not set")}
                    </span>
                  </span>
                </SystemButton>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <EnquiryContact query={q} />
                  <StatusPill status={q.status} />
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 border-t border-muted pt-2.5">
                  {followUpChip(q)}
                  <span className="text-2xs font-semibold text-ink-subtle">{ui(QUERY_SOURCES_LABELS[q.source] || q.source)}</span>
                  {q.assignedTo ? (
                    <Badge variant="info">
                      <User className="h-3 w-3" aria-hidden="true" /> <bdi>{q.assignedTo.fullName}</bdi>
                    </Badge>
                  ) : null}
                  {q.convertedStudent ? (
                    <Badge variant="success">
                      <UserCheck className="h-3 w-3" aria-hidden="true" /> <bdi>{q.convertedStudent.fullName}</bdi>
                    </Badge>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showNewModal ? (
        <NewQueryModal
          classes={classes}
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            loadQueries();
            bumpVersion();
          }}
        />
      ) : null}

      {selected ? (
        <QueryDetailModal
          query={selected}
          classes={classes}
          now={now}
          onConvert={onConvert ? () => { setSelected(null); onConvert(selected); } : undefined}
          onClose={() => setSelected(null)}
          onChanged={(updated) => {
            if (updated?._deleted) setSelected(null);
            else setSelected(updated);
            loadQueries();
            bumpVersion();
          }}
        />
      ) : null}
    </div>
  );
}


/**
 * Call / WhatsApp / email an enquiry straight from the list. Each is its own 44 px link beside the row's
 * open control (never nested inside it).
 */
function EnquiryContact({ query }: { query: any }) {
  const ui = useUiText();
  const digits = String(query.phone || "").replace(/[^\d+]/g, "");
  const wa = String(query.phone || "").replace(/\D/g, "");
  const cls = buttonVariants({ variant: "outline", size: "icon", className: "rounded-full text-ink-muted" });
  return (
    <div className="flex shrink-0 items-center gap-1">
      {digits.length >= 6 ? (
        <Tooltip content={ui("Call {0}", [query.phone])} describe={false}>
          <a href={`tel:${digits}`} aria-label={ui("Call {0}", [query.name])} className={cls}>
            <PhoneCall aria-hidden="true" className="h-4 w-4" />
          </a>
        </Tooltip>
      ) : null}
      {wa.length >= 8 ? (
        <Tooltip content={ui("Message on WhatsApp")} describe={false}>
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={ui("Message {0} on WhatsApp", [query.name])}
            className={cls}
          >
            <MessageCircle aria-hidden="true" className="h-4 w-4" />
          </a>
        </Tooltip>
      ) : null}
      {query.email ? (
        <Tooltip content={query.email} describe={false}>
          <a href={`mailto:${query.email}`} aria-label={ui("Email {0}", [query.name])} className={cls}>
            <Mail aria-hidden="true" className="h-4 w-4" />
          </a>
        </Tooltip>
      ) : null}
    </div>
  );
}

function NewQueryModal({
  classes,
  onClose,
  onCreated,
}: {
  classes: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const ui = useUiText();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    classInterestedId: "",
    source: "WALK_IN",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const draft = useFormDraft({
    record: "admin:admission-enquiry",
    schema: 1,
    values: form,
    baseline: { name: "", phone: "", email: "", classInterestedId: "", source: "WALK_IN", note: "" },
    fields: ["name", "phone", "email", "classInterestedId", "source", "note"] as const,
    apply: (values) => setForm({ name: String(values.name ?? ""), phone: String(values.phone ?? ""), email: String(values.email ?? ""), classInterestedId: String(values.classInterestedId ?? ""), source: String(values.source ?? "WALK_IN"), note: String(values.note ?? "") }),
  });
  const dirty = Boolean(form.name || form.phone || form.email || form.note);

  // Group the flat class rows into their class groups (name + academic year)
  // so the dropdown lists each class once, not every section.
  const classGroups = useMemo(() => groupClasses(classes), [classes]);
  const nameError = attempted && !form.name.trim() ? ui("Enter the guardian's or the child's name.") : undefined;
  const phoneError = attempted && !form.phone.trim() ? ui("Enter a phone number so the office can call back.") : undefined;

  const submit = async () => {
    // R4: a missing field is shown on the field itself, never as a toast.
    if (!form.name.trim() || !form.phone.trim()) {
      setAttempted(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admission-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, classInterestedId: form.classInterestedId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(data.error, ui("The enquiry could not be saved. Please try again.")));
      draft.markSaved();
      toast.success(ui("Enquiry created"));
      onCreated();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("The enquiry could not be saved. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={ui("New enquiry")}
      eyebrow={ui("Admissions")}
      subtitle={ui("Log a family who has asked about a place.")}
      icon={PhoneCall}
      tone="emerald"
      size="sm"
      dirty={dirty}
      onClose={onClose}
      footer={<SharedModalActions busy={busy} busyLabel={ui("Saving…")} actionLabel={ui("Create enquiry")} onCancel={onClose} onAction={submit} tone="emerald" />}
    >
      <div className="space-y-4">
        <DraftRecovery recordLabel={ui("Admissions enquiry")} draft={draft} saving={busy} excluded={ui("Only enquiry fields are stored in this signed-in browser draft.")} />
        <FormField name="enquiry-name" label={ui("Name")} required error={nameError}>
          <SystemInput value={form.name} placeholder={ui("Guardian or student name")} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField name="enquiry-phone" label={ui("Phone")} required error={phoneError}>
            <SystemInput type="tel" dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </FormField>
          <FormField name="enquiry-email" label={ui("Email")} optional>
            <SystemInput type="email" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField name="enquiry-class" label={ui("Class interested in")}>
            <SystemSelect value={form.classInterestedId} onChange={(e) => setForm((f) => ({ ...f, classInterestedId: e.target.value }))}>
              <option value="">{ui("Not specified")}</option>
              {classGroups.map((group) => {
                const rep = group.sections.find((s) => !s.section) || group.sections[0];
                return (
                  <option key={group.key} value={rep?.id}>
                    {group.name}{group.academicYear ? ` (${group.academicYear})` : ""}
                  </option>
                );
              })}
            </SystemSelect>
          </FormField>
          <FormField name="enquiry-source" label={ui("Source")}>
            <SystemSelect value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}>
              {Object.entries(QUERY_SOURCES_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{ui(v)}</option>
              ))}
            </SystemSelect>
          </FormField>
        </div>
        <FormField name="enquiry-note" label={ui("Note")} optional>
          <SystemTextarea
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder={ui("What is this enquiry about?")}
            className="min-h-24"
          />
        </FormField>
      </div>
    </Modal>
  );
}

function QueryDetailModal({
  query,
  classes,
  now,
  onConvert,
  onClose,
  onChanged,
}: {
  query: any;
  classes: any[];
  now: number;
  /** Absent for the front desk: enrolment is the campus admin's decision (§2.2 #51). */
  onConvert?: () => void;
  onClose: () => void;
  onChanged: (updated: any) => void;
}) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [noteAttempted, setNoteAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: query.name, phone: query.phone, email: query.email || "" });
  void classes;

  const loadFollowUps = useCallback(async () => {
    const res = await fetch(`/api/admission-queries/follow-ups?queryId=${query.id}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (json.success) setFollowUps(json.data || []);
  }, [query.id]);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  const failed = ui("The enquiry could not be updated. Please try again.");
  const patch = async (body: Record<string, any>, success = "Enquiry updated") => {
    setBusy(true);
    try {
      const res = await fetch("/api/admission-queries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: query.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(data.error, failed));
      toast.success(ui(success));
      onChanged(data.data);
      return data.data;
    } catch (error) {
      toast.error(friendlyErrorMessage(error, failed));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addFollowUp = async () => {
    if (!noteDraft.trim()) {
      setNoteAttempted(true);
      return;
    }
    const saved = await patch({ followUp: { note: noteDraft.trim(), nextDate: nextDate || null } }, "Follow-up logged");
    if (!saved) return;
    setNoteDraft("");
    setNextDate("");
    setNoteAttempted(false);
    loadFollowUps();
  };

  const doDelete = async () => {
    const res = await fetch(`/api/admission-queries?id=${query.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(apiErrorMessage(data.error, ui("The enquiry could not be deleted. Please try again.")));
    toast.success(ui("Enquiry deleted"));
    setDeleteConfirm(false);
    onChanged({ ...query, _deleted: true });
  };

  const startApplication = async () => {
    setBusy(true);
    try {
      const forms = await (await fetch("/api/admissions?forms=1", { cache: "no-store" })).json();
      const form = (forms.data ?? []).find((item: { currentVersion: number; isOpen: boolean }) => item.currentVersion > 0 && item.isOpen);
      if (!form) { toast.error(ui("Publish an application form under Applications first.")); return; }
      const response = await fetch("/api/admissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", formId: form.id, enquiryId: query.id }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(apiErrorMessage(json.error, ui("The application could not be started.")));
      toast.success(ui("Application {0} started from this enquiry. Continue it under Applications.", [json.data.reference]));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("The application could not be started.")));
    } finally {
      setBusy(false);
    }
  };

  const overdue = isOverdueEnquiry(query, now);
  const open = query.status !== "CONVERTED";
  const moreActions: MenuItem[] = [
    { id: "edit", label: "Edit details", icon: Pencil, onSelect: () => setEditing(true) },
    ...(open && query.status !== "FOLLOW_UP" && query.status !== "LOST" ? [{ id: "follow-up", label: "Mark as follow-up", icon: Send, onSelect: () => void patch({ status: "FOLLOW_UP" }) }] : []),
    ...(open && query.status !== "LOST" ? [{ id: "lost", label: "Mark as lost", icon: X, onSelect: () => void patch({ status: "LOST" }) }] : []),
  ];

  return (
    <Modal
      title={query.name}
      eyebrow={`${ui("Admission enquiry")} · ${ui(QUERY_SOURCES_LABELS[query.source] || query.source)}`}
      subtitle={<bdi dir="ltr">{query.phone}</bdi>}
      chips={<><StatusPill status={query.status} />{overdue ? <Badge variant="danger" size="sm"><CalendarClock aria-hidden="true" className="h-3 w-3" />{ui("Follow-up overdue")}</Badge> : null}</>}
      icon={PhoneCall}
      size="lg"
      dirty={Boolean(noteDraft.trim()) || editing}
      onClose={onClose}
      headerActions={
        <Menu
          label={ui("More actions")}
          align="end"
          trigger={<IconButton label={ui("More actions for {0}", [query.name])}><MoreHorizontal aria-hidden="true" /></IconButton>}
          items={moreActions}
        />
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* §4.5.3: the destructive action sits at the start of the footer, behind a confirmation. */}
          <SystemButton type="button" variant="ghost" className="text-status-error-text" onClick={() => setDeleteConfirm(true)} disabled={busy}>
            <Trash2 aria-hidden="true" />{ui("Delete enquiry")}
          </SystemButton>
          <SystemButton type="button" variant="outline" onClick={onClose}>{ui("Close")}</SystemButton>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          {editing ? (
            <div className="space-y-3">
              <FormField name="enquiry-edit-name" label={ui("Name")} required>
                <SystemInput value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </FormField>
              <FormField name="enquiry-edit-phone" label={ui("Phone")} required>
                <SystemInput type="tel" dir="ltr" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </FormField>
              <FormField name="enquiry-edit-email" label={ui("Email")} optional>
                <SystemInput type="email" dir="ltr" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </FormField>
              <div className="flex gap-2">
                <SystemButton type="button" variant="outline" onClick={() => { setEditing(false); setEditForm({ name: query.name, phone: query.phone, email: query.email || "" }); }}>{ui("Keep editing")}</SystemButton>
                <SystemButton
                  type="button"
                  loading={busy}
                  disabled={!editForm.name.trim() || !editForm.phone.trim()}
                  onClick={async () => {
                    const updated = await patch({ name: editForm.name, phone: editForm.phone, email: editForm.email });
                    if (updated) setEditing(false);
                  }}
                >
                  {ui("Save changes")}
                </SystemButton>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                <DetailRow label={ui("Phone")} value={<bdi dir="ltr">{query.phone}</bdi>} />
                <DetailRow label={ui("Email")} value={query.email ? <bdi dir="ltr">{query.email}</bdi> : "—"} />
                <DetailRow label={ui("Class interested")} value={query.classInterested ? <bdi>{classLabel(query.classInterested)}</bdi> : ui("Not specified")} />
                <DetailRow label={ui("Assigned to")} value={query.assignedTo?.fullName ? <bdi>{query.assignedTo.fullName}</bdi> : ui("Unassigned")} />
                <DetailRow label={ui("Next follow-up")} value={query.nextFollowUp ? (overdue ? ui("{0} (overdue)", [date(query.nextFollowUp)]) : date(query.nextFollowUp)) : ui("None")} />
                <DetailRow label={ui("Logged on")} value={date(query.createdAt)} />
                {query.convertedStudent ? (
                  <DetailRow label={ui("Converted to")} value={<bdi>{`${query.convertedStudent.fullName} (${query.convertedStudent.rollNo})`}</bdi>} />
                ) : null}
              </div>
              {query.note ? (
                <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                  <p className="mb-1.5 text-xs font-semibold text-ink-subtle">{ui("Note")}</p>
                  <p className="whitespace-pre-wrap text-sm font-semibold text-ink-strong">{query.note}</p>
                </div>
              ) : null}
              {open ? (
                // SKO-398: an enquiry becomes an application on the published form, which then runs to enrolment.
                <div className="flex flex-wrap gap-2">
                  <SystemButton type="button" loading={busy} onClick={() => void startApplication()}>
                    <Send aria-hidden="true" />{ui("Start application")}
                  </SystemButton>
                  {onConvert ? (
                    <SystemButton type="button" variant="outline" onClick={onConvert} disabled={busy}>
                      <UserCheck aria-hidden="true" />{ui("Convert to student")}
                    </SystemButton>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-4 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-ink-strong">{ui("Follow-up timeline")}</h3>
            <span className="text-xs font-semibold text-ink-subtle">{ui("{0} logged", [query._count?.followUps ?? followUps.length])}</span>
          </div>
          <div className="max-h-[420px] space-y-3 overflow-y-auto custom-scrollbar pe-1">
            {followUps.length === 0 ? (
              <EmptyInline text={ui("No follow-ups yet — log the first call below")} />
            ) : (
              followUps.map((fu) => (
                <div key={fu.id} className="sk-panel p-4">
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                    <span className="text-primary">{date(fu.date)}</span>
                    {fu.actor?.fullName ? <span className="text-ink-subtle">{ui("by {0}", [fu.actor.fullName])}</span> : null}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold text-ink-strong">{fu.note}</p>
                  {fu.nextDate ? (
                    <p className="mt-2 text-xs font-semibold text-primary">{ui("Next: {0}", [date(fu.nextDate)])}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
            <FormField name="enquiry-follow-up" label={ui("Log a follow-up")} error={noteAttempted && !noteDraft.trim() ? ui("Write what happened on this call or visit.") : undefined}>
              <SystemTextarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={ui("What happened on this call or visit?")}
                className="min-h-20"
              />
            </FormField>
            <div className="flex flex-wrap items-end gap-3">
              <FormField name="enquiry-next-date" label={ui("Next follow-up")} optional className="w-48">
                <SystemInput type="date" dir="ltr" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              </FormField>
              <SystemButton type="button" variant="outline" loading={busy} onClick={addFollowUp} className="ms-auto">
                <Send aria-hidden="true" />{ui("Log follow-up")}
              </SystemButton>
            </div>
          </div>
        </div>
      </div>

      <ConfirmAction
        open={deleteConfirm}
        title={ui("Delete this enquiry?")}
        description={ui("{0}'s enquiry and its follow-up notes are removed. This cannot be undone.", [query.name])}
        confirmLabel={ui("Delete enquiry")}
        cancelLabel={ui("Keep enquiry")}
        tone="danger"
        busy={deleting}
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await doDelete();
          } catch (error) {
            // The dialog stays open so the person can retry or keep the enquiry.
            toast.error(friendlyErrorMessage(error, ui("The enquiry could not be deleted. Please try again.")));
          } finally {
            setDeleting(false);
          }
        }}
      />
    </Modal>
  );
}

export function ArchivedStudentsPanel({ version, onVersionBump }: { version: number; onVersionBump: () => void }) {
  const ui = useUiText();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useListField<string>("archive.search", "", "archive.page");
  const [statusFilter, setStatusFilter] = useListField<string>("archive.status", "all", "archive.page");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Restoring one student at a time is fine for a mistake; it is not fine after
  // a bulk archive, which the roster can now do in a single action.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [restoring, setRestoring] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStudents(await loadListPages("/api/students", new URLSearchParams({ status: "archived" })));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of students) c[s.status] = (c[s.status] || 0) + 1;
    return c;
  }, [students]);

  const filtered = students.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return Boolean(
      s.fullName?.toLowerCase().includes(q) ||
      s.rollNo?.toLowerCase().includes(q) ||
      s.guardianName?.toLowerCase().includes(q)
    );
  });

  const archivePage = useListPage(filtered, "archive");

  const runBulkStatus = async (status: string, verb: string) => {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ui("Could not change the selected students. Please try again."));
      toast.success(ui(status === "active" ? "{0} student(s) restored to the active roll" : "{0} student(s) marked as graduated", [data.updated]));
      setSelected(new Set());
      await load();
      onVersionBump();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not change the selected students. Please try again.")));
    } finally {
      setBulkBusy(false);
    }
  };

  const exportArchived = () => {
    if (!filtered.length) {
      toast.error(ui("Nothing to export — no records match the current filters"));
      return;
    }
    downloadCSV("archived_students", [
      ["Name", "Roll No", "Class", "Status", "Guardian", "Guardian Phone", "Left on"],
      ...filtered.map((s: any) => [
        s.fullName,
        s.rollNo,
        s.class ? classLabel(s.class) : "",
        ARCHIVED_STATUS_LABELS[s.status] || s.status,
        s.guardianName,
        s.guardianPhone,
        String(s.updatedAt || s.createdAt || "").slice(0, 10),
      ]),
    ]);
    toast.success(ui("{0} record(s) exported", [filtered.length]));
  };

  const changeStatus = async (student: any, status: string, successMsg: string) => {
    setBusyId(student.id);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: student.id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "");
      toast.success(successMsg);
      await load();
      onVersionBump();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not change the student's status. Please try again.")));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="sk-panel sk-rise p-6">
      <RestoreStudentDialog student={restoring} onClose={() => setRestoring(null)} onRestored={message => { toast.success(message); void load(); onVersionBump(); }} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={Archive} title={ui("Archived and inactive students")} />
        <div className="flex items-center gap-2 pb-1.5">
          <Badge variant="neutral" className="tabular-nums">{filtered.length === 1 ? ui("1 record") : ui("{0} records", [filtered.length])}</Badge>
          <BrandButton
            variant="soft"
            icon={<Download className="w-4 h-4" />}
            onClick={exportArchived}
            disabled={!filtered.length}
          >
            {ui("Export")}
          </BrandButton>
        </div>
      </div>
      <p className="mb-5 max-w-2xl text-xs font-semibold leading-relaxed text-ink-muted">
        {ui("Students who have left the active roll. Their results and history stay on file. Restore anyone who was taken off by mistake, or mark a leaver as graduated so the record shows why they left. Take a student off the roll from their profile in the Student Directory.")}
      </p>

      {/* Status chips: "archived" and "graduated" are different situations and
          admins usually want one or the other, not the pile. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { key: "all", label: ui("All ({0})", [students.length]) },
          ...Object.keys(ARCHIVED_STATUS_LABELS)
            .filter((k) => counts[k])
            .map((k) => ({ key: k, label: ui("{0} ({1})", [ui(ARCHIVED_STATUS_LABELS[k]), counts[k]]) })),
        ].map((chip) => (
          <SystemButton variant="ghost"
            key={chip.key}
            type="button"
            onClick={() => setStatusFilter(chip.key)}
            className={cn(
              "px-3.5",
              statusFilter === chip.key
                ? "bg-primary text-white shadow-brand"
                : "border border-edge/25 bg-card text-ink-muted hover:border-primary/30 hover:text-primary",
            )}
          >
            {chip.label}
          </SystemButton>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={ui("Search archived students…")}
          autoFocusKey={null}
          className="max-w-xs"
        />
        {filtered.length > 0 ? (
          <SystemButton variant="outline"
            type="button"
            onClick={() =>
              setSelected((prev) =>
                filtered.every((s) => prev.has(s.id)) ? new Set() : new Set(filtered.map((s) => s.id)),
              )
            }
            className="flex items-center gap-1.5 px-3 justify-start"
          >
            {filtered.every((s) => selected.has(s.id)) ? ui("Deselect all") : ui("Select all {0}", [filtered.length])}
          </SystemButton>
        ) : null}
      </div>

      <SelectionBar
        total={selected.size}
        busy={bulkBusy}
        onClear={() => setSelected(new Set())}
        actions={[
          {
            key: "restore",
            label: "Restore to roll",
            icon: RotateCcw,
            onRun: () => runBulkStatus("active", "restored to the active roll"),
          },
          {
            key: "graduated",
            label: "Mark graduated",
            icon: Award,
            onRun: () => runBulkStatus("graduated", "marked as graduated"),
          },
        ]}
      />

      <Pagination {...archivePage.controls} />
      {loading ? (
        <SkeletonList rows={4} label={ui("Loading archived students")} />
      ) : loadFailed ? <ErrorState onRetry={load} /> : filtered.length === 0 ? (
        <EmptyInline text={ui("No archived or inactive students — archived profiles appear here")} />
      ) : (
        <div className="space-y-3">
          {archivePage.rows.map((s, i) => (
            <div
              key={s.id}
              className="sk-rise sk-panel flex flex-wrap items-center gap-4 p-4 transition-all duration-300 hover:border-primary/30 hover:shadow-lg"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <SystemCheckbox

                checked={selected.has(s.id)}
                onChange={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
                aria-label={ui("Select {0}", [s.fullName])}
                className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
              />
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-ink-muted">
                <Archive className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-md font-bold text-ink-strong tracking-tight">{s.fullName}</p>
                <p className="mt-0.5 truncate text-xs font-bold text-ink-muted">
                  {s.rollNo}
                  {s.class ? ` · ${classLabel(s.class)}` : " · " + ui("No class")}
                  {s.guardianPhone ? ` · ${s.guardianPhone}` : ""}
                </p>
              </div>
              <StatusPill status={ARCHIVED_STATUS_LABELS[s.status] || s.status} />
              <div className="flex shrink-0 items-center gap-2">
                <BrandButton
                  variant="soft"
                  icon={<RotateCcw className="w-4 h-4" />}
                  disabled={busyId === s.id}
                  onClick={() => setRestoring(s)}
                >
                  {busyId === s.id ? ui("Working…") : ui("Restore")}
                </BrandButton>
                {/*
                  Marking a leaver as graduated was already wired in the handler
                  but had no button, so the status could never be reached here.
                */}
                {s.status === "graduated" ? null : (
                  <BrandButton
                    variant="soft"
                    icon={<Award className="w-4 h-4" />}
                    disabled={busyId === s.id}
                    onClick={() => changeStatus(s, "graduated", ui("{0} marked as graduated", [s.fullName]))}
                  >
                    {ui("Graduated")}
                  </BrandButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const LEAVE_TABS = [
  { id: "requests", label: "Requests", icon: CheckCircle2 },
  { id: "balances", label: "Balances", icon: Users },
  { id: "types", label: "Leave types", icon: Layers },
  { id: "allocations", label: "Allocations", icon: UserCheck },
] as const;

/** Leave decisions read as the verbs on the queue (§4.4b "Approve / Decline"), on status tokens (R7, R10). */
const LEAVE_STATUS: Record<string, { label: string; variant: "warning" | "success" | "danger" | "neutral" }> = {
  PENDING: { label: "Waiting for a decision", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Declined", variant: "danger" },
  CANCELLED: { label: "Withdrawn", variant: "neutral" },
};

/** Who asked for leave, as a translated role word (R7: never the raw enum). */
const LEAVE_ROLE_WORDS: Record<string, string> = {
  TEACHER: "Teacher", PRINCIPAL: "Principal", ACCOUNTANT: "Accountant", RECEPTIONIST: "Receptionist",
  LIBRARIAN: "Librarian", CAMPUS_ADMIN: "Campus admin", ADMIN: "Campus admin",
};

/** Leave is stored in tenths of a day; one translated template per form (R11). */
function leaveDaysLabel(tenths: number, ui: (source: string, values?: unknown[]) => string) {
  const d = tenths / 10;
  return d === 1 ? ui("1 day") : ui("{0} days", [d]);
}


type LeaveTabId = (typeof LEAVE_TABS)[number]["id"];
type LeaveTabKey = "queue" | "balances" | "types" | "allocations";

/**
 * Leave approvals for the campus. Hosts its own PageHeader (h1 by default: the panel is the whole view),
 * with the tab-level primary ("Add leave type", "Allocate leave") and Export as a secondary. `tabs` limits
 * the sections — a principal decides teaching-staff leave only (`["queue"]`), the campus operator also owns
 * leave types and allowances (M52). A load failure is an inline ErrorState with retry, never a silent empty list.
 */
export function LeaveManagementPanel({
  campusId,
  tabs,
  title = "Leave approvals",
  description = "Decide staff leave, set leave types and allowances, and see what everyone has left.",
  headingLevel = 1,
  activeTab,
  onTabChange,
}: {
  campusId?: string;
  tabs?: LeaveTabKey[];
  /** Controlled section (the console keeps it in `?tab=`); unknown or hidden ids fall back to the first tab. */
  activeTab?: string | null;
  onTabChange?: (tab: LeaveTabKey) => void;
  /** EN UI key; the hosting view's registry label. */
  title?: string;
  description?: string;
  headingLevel?: 1 | 2;
}) {
  const ui = useUiText();
  const { date: formatDay } = useLocaleFormat();
  const leaveDateLabel = (iso: string) => (iso ? formatDay(iso) : ui("Not recorded"));
  const allowedTabs = useMemo(() => {
    const wanted = new Set<LeaveTabId>((tabs ?? ["queue", "types", "allocations", "balances"]).map((t) => (t === "queue" ? "requests" : t) as LeaveTabId));
    return LEAVE_TABS.filter((t) => wanted.has(t.id));
  }, [tabs]);
  const ownsSetup = allowedTabs.some((t) => t.id === "types" || t.id === "allocations");
  const showsBalances = allowedTabs.some((t) => t.id === "balances");
  const [tabState, setTabState] = useState<LeaveTabId>(allowedTabs[0]?.id ?? "requests");
  const requestedTab = (activeTab === "queue" ? "requests" : activeTab) as LeaveTabId | null | undefined;
  const tab: LeaveTabId = requestedTab && allowedTabs.some((t) => t.id === requestedTab) ? requestedTab : allowedTabs.some((t) => t.id === tabState) ? tabState : allowedTabs[0]?.id ?? "requests";
  const setTab = (next: LeaveTabId) => {
    if (!allowedTabs.some((t) => t.id === next)) return;
    setTabState(next);
    onTabChange?.(next === "requests" ? "queue" : next);
  };
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "type" | "allocation"; id: string; name: string } | null>(null);
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [balanceSearch, setBalanceSearch] = useState("");
  // Reviewing used one shared note box for the whole list, so typing a note
  // against one request put the same text on every other Approve button.
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const [types, setTypes] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  const [showAddType, setShowAddType] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: "", defaultDays: "10" });
  const [typeBusy, setTypeBusy] = useState(false);

  const [showAddAllocation, setShowAddAllocation] = useState(false);
  const [allocForm, setAllocForm] = useState({ leaveTypeId: "", scope: "role", role: "TEACHER", userId: "", days: "10" });
  const [allocBusy, setAllocBusy] = useState(false);

  const [staffBalances, setStaffBalances] = useState<any[]>([]);

  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  // Decline asks for the reason the person will read (§4.5.2: Approve / Decline pair, Decline outline).
  const [declining, setDeclining] = useState<any>(null);
  const roleWord = (role?: string) => (role ? ui(LEAVE_ROLE_WORDS[role] ?? formatStatus(role)) : ui("Staff"));
  const days = (tenths: number) => leaveDaysLabel(tenths, ui);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const scope = campusId ? `&campusId=${encodeURIComponent(campusId)}` : "";
    const read = (url: string) => fetch(url, { cache: "no-store" }).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) }));
    try {
      const [typesRes, allocRes, reqRes] = await Promise.all([
        ownsSetup || showsBalances ? read(`/api/leave/types${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`) : Promise.resolve(null),
        ownsSetup ? read(`/api/leave/allocations?academicYear=${academicYear}${scope}`) : Promise.resolve(null),
        read(`/api/leave?mode=all&academicYear=${academicYear}${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}${scope}`),
      ]);
      // The queue is what this view is for: without it there is nothing honest to show.
      if (!reqRes.ok || !isApiOk(reqRes.json)) throw new Error(readApiError(reqRes.json, "Leave requests could not be loaded."));
      setRequests(reqRes.json.data.requests || []);
      setStaffUsers(reqRes.json.data.users || []);
      if (typesRes && isApiOk(typesRes.json)) setTypes(typesRes.json.data || []);
      if (allocRes && isApiOk(allocRes.json)) setAllocations(allocRes.json.data || []);
      if (showsBalances) {
        const balRes = await read(`/api/leave?mode=balances&academicYear=${academicYear}${scope}`);
        if (isApiOk(balRes.json)) setStaffBalances(balRes.json.data.staff || []);
      }
    } catch (error) {
      setLoadError(friendlyErrorMessage(error, ui("Leave requests could not be loaded.")));
    } finally {
      setLoading(false);
    }
  }, [campusId, academicYear, statusFilter, ownsSetup, showsBalances]);

  useEffect(() => {
    load();
  }, [load, reloadTick]);

  const addType = async () => {
    if (!typeForm.name.trim()) {
      toast.error(ui("Type name is required"));
      return;
    }
    setTypeBusy(true);
    try {
      const res = await fetch("/api/leave/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: typeForm.name, defaultDays: Number(typeForm.defaultDays) || 0, campusId }),
      });
      const json = await res.json();
      if (!isApiOk(json)) throw new Error(readApiError(json, ui("Could not create the leave type. Please try again.")));
      toast.success(ui("Leave type \"{0}\" created", [typeForm.name]));
      setShowAddType(false);
      setTypeForm({ name: "", defaultDays: "10" });
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not create the leave type. Please try again.")));
    } finally {
      setTypeBusy(false);
    }
  };

  const updateTypeDays = async (id: string, defaultDays: string) => {
    try {
      const res = await fetch("/api/leave/types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, defaultDays: Number(defaultDays) || 0 }),
      });
      const json = await res.json();
      if (!isApiOk(json)) throw new Error(readApiError(json, ""));
      toast.success(ui("Default days updated"));
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not update the default days. Please try again.")));
    }
  };

  const addAllocation = async () => {
    if (!allocForm.leaveTypeId) {
      toast.error(ui("Select a leave type"));
      return;
    }
    setAllocBusy(true);
    try {
      const res = await fetch("/api/leave/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: allocForm.leaveTypeId,
          role: allocForm.scope === "role" ? allocForm.role : null,
          userId: allocForm.scope === "user" ? allocForm.userId : null,
          days: Number(allocForm.days) || 0,
          academicYear,
          campusId,
        }),
      });
      const json = await res.json();
      if (!isApiOk(json)) throw new Error(readApiError(json, ui("Could not create the allocation. Please try again.")));
      toast.success(ui("Allocation created"));
      setShowAddAllocation(false);
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not create the allocation. Please try again.")));
    } finally {
      setAllocBusy(false);
    }
  };

  const review = async (request: any, status: "APPROVED" | "REJECTED", note?: string) => {
    setReviewing(request.id);
    try {
      const res = await fetch("/api/leave/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          status,
          reviewNote: note ?? reviewNotes[request.id] ?? "",
          override: Boolean(overrides[request.id]),
        }),
      });
      const json = await res.json();
      if (!isApiOk(json)) throw new Error(readApiError(json, ui("Could not save the decision. Please try again.")));
      toast.success(status === "APPROVED" ? ui("Leave approved for {0}", [request.user?.fullName || ui("this request")]) : ui("Leave declined for {0}", [request.user?.fullName || ui("this request")]));
      // Clear only this request's draft; the others are still being worked on.
      setReviewNotes((prev) => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      setReloadTick((t) => t + 1);
      return true;
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not save the decision. Please try again.")));
      return false;
    } finally {
      setReviewing(null);
    }
  };

  /*
   * "Pending" was the only figure this screen carried, which made it a queue and
   * nothing else. The questions an admin actually arrives with — who is off
   * today, who goes off next week, whose allowance is already spent — were all
   * answerable from data the panel had loaded, but only via a tab hop and a
   * mental diff. They are derived here and shown up front instead.
   */
  const leaveStats = useMemo(() => {
    const startOfDay = (value: string) => {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const weekAhead = todayMs + 7 * 24 * 60 * 60 * 1000;

    const approved = requests.filter((r) => r.status === "APPROVED");
    const outToday = approved.filter(
      (r) => startOfDay(r.fromDate) <= todayMs && startOfDay(r.toDate) >= todayMs
    );
    const upcoming = approved.filter((r) => {
      const from = startOfDay(r.fromDate);
      return from > todayMs && from <= weekAhead;
    });
    // The API floors `remaining` at zero, so an overspend has to be recomputed
    // from allocated vs approved or it reads as a staff member on exactly nil.
    const overdrawn = staffBalances.filter((row: any) =>
      ((row.balances as any[]) || []).some((b: any) => b.approved > b.allocated)
    );
    return {
      pending: requests.filter((r) => r.status === "PENDING").length,
      approvedDays: approved.reduce((sum, r) => sum + (r.days || 0), 0) / 10,
      outToday,
      upcoming,
      overdrawn,
    };
  }, [requests, staffBalances]);

  const pendingCount = leaveStats.pending;

  /** Chasing "whose leave was that" starts from a name or a reason, not a status. */
  const visibleRequests = useMemo(() => {
    const q = requestSearch.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      [r.user?.fullName, r.user?.role, r.leaveType?.name, r.reason]
        .filter(Boolean)
        .some((field: any) => String(field).toLowerCase().includes(q))
    );
  }, [requests, requestSearch]);

  const visibleBalances = useMemo(() => {
    const q = balanceSearch.trim().toLowerCase();
    if (!q) return staffBalances;
    return staffBalances.filter((row: any) =>
      [row.user?.fullName, row.user?.role]
        .filter(Boolean)
        .some((field: any) => String(field).toLowerCase().includes(q))
    );
  }, [staffBalances, balanceSearch]);

  const exportRequests = () => {
    if (!visibleRequests.length) {
      toast.error(ui("Nothing to export — no requests match the current filters"));
      return;
    }
    downloadCSV(`leave_requests_${academicYear}`, [
      [ui("Staff member"), ui("Role"), ui("Leave type"), ui("Days"), ui("From"), ui("To"), ui("Status"), ui("Reason"), ui("Reviewed by"), ui("Review note")],
      ...visibleRequests.map((r) => [
        r.user?.fullName,
        roleWord(r.user?.role),
        r.leaveType?.name,
        (r.days || 0) / 10,
        String(r.fromDate || "").slice(0, 10),
        String(r.toDate || "").slice(0, 10),
        ui(LEAVE_STATUS[r.status]?.label ?? formatStatus(r.status)),
        r.reason,
        r.reviewedBy?.fullName,
        r.reviewNote,
      ]),
    ]);
    toast.success(ui("{0} request(s) exported", [visibleRequests.length]));
  };

  const exportBalances = () => {
    if (!visibleBalances.length) {
      toast.error(ui("Nothing to export — no staff balances to show"));
      return;
    }
    downloadCSV(`leave_balances_${academicYear}`, [
      [ui("Staff member"), ui("Role"), ...types.flatMap((t: any) => [ui("{0}: allocated", [t.name]), ui("{0}: used", [t.name]), ui("{0}: left", [t.name])])],
      ...visibleBalances.map((row: any) => [
        row.user?.fullName,
        roleWord(row.user?.role),
        ...types.flatMap((t: any) => {
          const b = ((row.balances as any[]) || []).find((bl: any) => bl.leaveTypeId === t.id);
          if (!b) return [0, 0, 0];
          return [b.allocated / 10, b.approved / 10, (b.allocated - b.approved) / 10];
        }),
      ]),
    ]);
    toast.success(ui("{0} staff balance(s) exported", [visibleBalances.length]));
  };

  const tabPrimary: PageAction | undefined =
    tab === "types" ? { id: "add-leave-type", label: "Add leave type", icon: Plus, onClick: () => setShowAddType(true) }
    : tab === "allocations" ? { id: "allocate-leave", label: "Allocate leave", icon: Plus, onClick: () => setShowAddAllocation(true) }
    : undefined;
  const tabExport: PageAction[] =
    tab === "requests" ? [{ id: "export-requests", label: "Export", icon: Download, onClick: exportRequests }]
    : tab === "balances" ? [{ id: "export-balances", label: "Export", icon: Download, onClick: exportBalances }]
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        icon={Plane}
        headingLevel={headingLevel}
        primaryAction={tabPrimary}
        secondaryActions={tabExport}
        status={
          <>
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
              {ui("Year")}
              <SystemInput
                type="number"
                value={academicYear}
                onChange={(e) => setAcademicYear(Number(e.target.value) || new Date().getFullYear())}
                className="w-24 px-3"
                aria-label={ui("Academic year")}
              />
            </label>
            <Badge variant={pendingCount ? "warning" : "neutral"} className="tabular-nums">{ui("{0} pending", [pendingCount])}</Badge>
          </>
        }
        tabs={allowedTabs.length > 1 ? (
          <ViewTabs
            items={allowedTabs.map((t) => ({ id: t.id, label: t.label, count: t.id === "requests" && pendingCount ? pendingCount : undefined }))}
            value={tab}
            onChange={(id) => setTab(id as LeaveTabId)}
            ariaLabel="Leave sections"
          />
        ) : undefined}
      />

      {pendingDelete ? <ReviewedDeleteDialog endpoint={pendingDelete.kind === "type" ? "leave/types" : "leave/allocations"}
        record={{ id: pendingDelete.id, campusId }} label={pendingDelete.name} onCancel={() => setPendingDelete(null)} onDeleted={() => setReloadTick(t => t + 1)} /> : null}

      {loadError ? (
        <ErrorState title={ui("Leave records could not be loaded")} description={ui(loadError)} onRetry={() => setReloadTick((t) => t + 1)} />
      ) : (
      // The shell's page card is the surface (addendum 2): rows sit on it as their own panels, never card-in-card.
      <div className="sk-rise">
      {/* Pending approvals are the only thing here that blocks someone else, so they get called out
          rather than sitting inside a tab. */}
      {pendingCount > 0 && tab !== "requests" ? (
        <Alert
          tone="warning"
          className="mb-4"
          actions={<SystemButton variant="outline" size="sm" type="button" onClick={() => { setTab("requests"); setStatusFilter("PENDING"); }}>{ui("Review requests")}</SystemButton>}
        >
          {ui(pendingCount === 1 ? "{0} leave request waiting on you" : "{0} leave requests waiting on you", [pendingCount])}
        </Alert>
      ) : null}

      {/* The four numbers worth knowing before opening a tab. Each is also the
          fastest route to the rows behind it. */}
      <div className="mb-4">
        <StatTiles
          tiles={[
            {
              key: "pending",
              icon: CheckCircle2,
              label: "Awaiting review",
              value: leaveStats.pending,
              hint: leaveStats.pending ? "Blocking someone" : "Queue clear",
              tone: leaveStats.pending ? "amber" : "emerald",
              active: tab === "requests" && statusFilter === "PENDING",
              onClick: () => { setTab("requests"); setStatusFilter("PENDING"); },
            },
            {
              key: "out-today",
              icon: Plane,
              label: "Off today",
              value: leaveStats.outToday.length,
              hint: leaveStats.outToday.length
                ? leaveStats.outToday.map((r) => r.user?.fullName).filter(Boolean).slice(0, 2).join(", ")
                : "Everyone in",
              tone: leaveStats.outToday.length ? "violet" : "slate",
              active: tab === "requests" && statusFilter === "APPROVED",
              onClick: () => { setTab("requests"); setStatusFilter("APPROVED"); },
            },
            {
              key: "upcoming",
              icon: CalendarDays,
              label: "Off next 7 days",
              value: leaveStats.upcoming.length,
              hint: "Approved and scheduled",
              tone: "teal",
              active: tab === "requests" && statusFilter === "APPROVED",
              onClick: () => { setTab("requests"); setStatusFilter("APPROVED"); },
            },
            {
              key: "overdrawn",
              icon: AlertTriangle,
              label: "Over allowance",
              value: leaveStats.overdrawn.length,
              hint: leaveStats.approvedDays === 1 ? ui("1 day approved this year") : ui("{0} days approved this year", [leaveStats.approvedDays]),
              tone: leaveStats.overdrawn.length ? "rose" : "slate",
              active: tab === "balances",
              onClick: () => setTab("balances"),
            },
          ]}
        />
      </div>

      {/* Who is actually out. Cover is a scheduling problem, and answering it
          previously meant reading every approved row and comparing dates. */}
      {leaveStats.outToday.length > 0 ? (
        <div className="mb-4 rounded-[20px] border border-edge/25 bg-brand-50/40 p-4">
          <p className="text-xs font-semibold text-primary">{ui("Out of school today")}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {leaveStats.outToday.map((r) => (
              <span
                key={r.id}
                title={`${r.leaveType?.name || ui("Leave")} · ${ui("{0} to {1}", [leaveDateLabel(r.fromDate), leaveDateLabel(r.toDate)])}`}
                className="flex items-center gap-2 rounded-full border border-edge/30 bg-card px-3 py-1.5 text-2xs font-bold text-ink-strong shadow-sm"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                <bdi>{r.user?.fullName || ui("Unknown")}</bdi>
                <span className="font-semibold text-ink-subtle">
                  {ui("back {0}", [leaveDateLabel(new Date(new Date(r.toDate).getTime() + 86400000).toISOString())])}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <SkeletonList rows={5} label={ui("Loading leave records")} />
      ) : tab === "requests" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SystemSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={ui("Filter by status")}
              className="w-auto min-w-44 cursor-pointer"
            >
              <option value="">{ui("All statuses")}</option>
              <option value="PENDING">{ui("Waiting for a decision")}</option>
              <option value="APPROVED">{ui("Approved")}</option>
              <option value="REJECTED">{ui("Declined")}</option>
              <option value="CANCELLED">{ui("Withdrawn")}</option>
            </SystemSelect>
            <SearchField
              value={requestSearch}
              onChange={setRequestSearch}
              placeholder={ui("Search staff, type or reason…")}
              label={ui("Search leave requests")}
              className="min-w-[220px] flex-1"
            />
          </div>

          {requests.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Plane}
              title={ui("No leave requests for this year")}
              description={ui("Requests staff send from My leave appear here for you to approve or decline.")}
            />
          ) : visibleRequests.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Plane}
              title={ui("No requests match “{0}”", [requestSearch])}
              description={ui("Try a different name or clear the search.")}
              action={<SystemButton type="button" variant="outline" size="sm" onClick={() => setRequestSearch("")}>{ui("Clear search")}</SystemButton>}
            />
          ) : (
            visibleRequests.map((r) => {
              const name = r.user?.fullName || ui("Unknown");
              const state = LEAVE_STATUS[r.status];
              return (
                <div key={r.id} className="sk-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-strong">
                      <bdi>{name}</bdi> <span className="font-semibold text-ink-subtle">· {roleWord(r.user?.role)}</span>
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-ink-muted">
                      <bdi>{r.leaveType?.name || ui("Leave")}</bdi> · {days(r.days)} · {ui("{0} to {1}", [leaveDateLabel(r.fromDate), leaveDateLabel(r.toDate)])}
                    </p>
                    {r.reason ? <p className="mt-1 text-xs text-ink-subtle"><bdi>{r.reason}</bdi></p> : null}
                    {r.reviewedBy ? (
                      <p className="mt-1 text-xs font-semibold text-ink-subtle">
                        {r.reviewNote ? ui("Reviewed by {0}: {1}", [r.reviewedBy.fullName, r.reviewNote]) : ui("Reviewed by {0}", [r.reviewedBy.fullName])}
                      </p>
                    ) : null}
                  </div>
                  {r.status === "PENDING" && r.canDecide === false ? (
                    // SKAI-1026: visible on this desk, decided by the academic lead or the campus operator (§7.6).
                    <Badge variant="warning" className="shrink-0 self-start sm:self-center">
                      {ui(r.user?.role === "TEACHER" ? "Waiting for the principal" : "Waiting for the campus admin")}
                    </Badge>
                  ) : r.status === "PENDING" ? (
                    // §4.5.2: the queue row's one inline pair — Approve, then Decline as outline (both 44 px).
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-ink-muted">
                        <SystemCheckbox
                          checked={Boolean(overrides[r.id])}
                          onChange={(e) => setOverrides((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                        />
                        {ui("Override balance")}
                      </label>
                      <SystemButton type="button" size="sm" loading={reviewing === r.id} onClick={() => void review(r, "APPROVED")} aria-label={ui("Approve leave for {0}", [name])}>
                        {ui("Approve")}
                      </SystemButton>
                      <SystemButton type="button" size="sm" variant="outline" disabled={reviewing === r.id} onClick={() => setDeclining(r)} aria-label={ui("Decline leave for {0}", [name])}>
                        {ui("Decline")}
                      </SystemButton>
                    </div>
                  ) : (
                    <Badge variant={state?.variant ?? "neutral"} className="shrink-0 self-start sm:self-center">{ui(state?.label ?? formatStatus(r.status))}</Badge>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : tab === "types" ? (
        <div className="space-y-3">
          {types.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Layers}
              title={ui("No leave types yet")}
              description={ui("Add the kinds of leave staff can ask for, with how many days each allows per year.")}
              primaryAction={{ id: "add-leave-type", label: "Add leave type", icon: Plus, onClick: () => setShowAddType(true) }}
            />
          ) : (
            types.map((t) => (
              <div key={t.id} className="sk-panel flex flex-wrap items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary">
                  <Layers className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-strong">{t.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink-muted">
                    {ui((t._count?.allocations || 0) === 1 ? "{0} allocation" : "{0} allocations", [t._count?.allocations || 0])} ·{" "}
                    {ui((t._count?.requests || 0) === 1 ? "{0} request" : "{0} requests", [t._count?.requests || 0])}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                    {ui("Default")}
                    <SystemInput
                      type="number"
                      inputMode="numeric"
                      dir="ltr"
                      defaultValue={t.defaultDaysDisplay}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== t.defaultDaysDisplay) updateTypeDays(t.id, e.target.value);
                      }}
                      className="w-20"
                      aria-label={ui("Default days per year for {0}", [t.name])}
                    />
                    {ui("days")}
                  </label>
                  <Menu
                    label={ui("More actions")}
                    align="end"
                    trigger={<IconButton label={ui("More actions for {0}", [t.name])}><MoreHorizontal aria-hidden="true" /></IconButton>}
                    items={[{ id: "delete", label: ui("Delete leave type"), tone: "danger", onSelect: () => setPendingDelete({ kind: "type", id: t.id, name: t.name }) }]}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === "allocations" ? (
        <div className="space-y-3">
          {allocations.length === 0 ? (
            <EmptyState
              size="sm"
              icon={UserCheck}
              title={ui("No allocations for this year yet")}
              description={ui("Give a whole role or one staff member their days for each leave type.")}
              primaryAction={{ id: "allocate-leave", label: "Allocate leave", icon: Plus, onClick: () => setShowAddAllocation(true) }}
            />
          ) : (
            allocations.map((a) => (
              <div key={a.id} className="sk-panel flex flex-wrap items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary">
                  {a.userId ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-strong">
                    <bdi>{a.leaveType?.name || ui("Leave")}</bdi> · {days(a.days)}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-ink-muted">
                    {a.userId ? ui("User: {0}", [a.user?.fullName || "—"]) : a.role ? ui("All {0}", [ui(ALLOCATION_ROLE_LABELS[a.role] ?? a.role)]) : ui("All staff")} · {a.academicYear}
                  </p>
                </div>
                <Menu
                  label={ui("More actions")}
                  align="end"
                  trigger={<IconButton label={ui("More actions for {0}", [a.leaveType?.name || ui("Leave")])}><MoreHorizontal aria-hidden="true" /></IconButton>}
                  items={[{ id: "remove", label: ui("Remove allocation"), tone: "danger", onSelect: () => setPendingDelete({ kind: "allocation", id: a.id, name: a.leaveType?.name || "" }) }]}
                />
              </div>
            ))
          )}
        </div>
      ) : null}

      {showAddType ? (
        <Modal
          title={ui("Add leave type")}
          eyebrow={ui("Leave approvals")}
          subtitle={ui("Staff choose from these types when they ask for leave.")}
          icon={Plane}
          size="sm"
          dirty={Boolean(typeForm.name.trim())}
          onClose={() => setShowAddType(false)}
          footer={(
            <SharedModalActions
              busy={typeBusy}
              busyLabel={ui("Creating…")}
              actionLabel={ui("Create leave type")}
              onCancel={() => setShowAddType(false)}
              onAction={() => void addType()}
              blockedReason={typeForm.name.trim() ? null : ui("Name the leave type first.")}
            />
          )}
        >
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void addType(); }}>
            <FormField name="leave-type-name" label={ui("Type name")} required>
              <SystemInput value={typeForm.name} placeholder={ui("e.g. Casual leave")} onChange={(e) => setTypeForm((p) => ({ ...p, name: e.target.value }))} />
            </FormField>
            <FormField name="leave-type-days" label={ui("Default days per year")}>
              <SystemInput type="number" inputMode="numeric" dir="ltr" min={0} value={typeForm.defaultDays} onChange={(e) => setTypeForm((p) => ({ ...p, defaultDays: e.target.value }))} />
            </FormField>
          </form>
        </Modal>
      ) : null}

      {showAddAllocation ? (
        <Modal
          title={ui("Allocate leave")}
          eyebrow={ui("Leave approvals")}
          subtitle={ui("Give a whole role or one staff member their days for a leave type this year.")}
          icon={Plane}
          size="sm"
          onClose={() => setShowAddAllocation(false)}
          footer={(
            <SharedModalActions
              busy={allocBusy}
              busyLabel={ui("Creating…")}
              actionLabel={ui("Create allocation")}
              onCancel={() => setShowAddAllocation(false)}
              onAction={() => void addAllocation()}
              blockedReason={!allocForm.leaveTypeId ? ui("Choose a leave type first.") : allocForm.scope === "user" && !allocForm.userId ? ui("Choose the staff member first.") : null}
            />
          )}
        >
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void addAllocation(); }}>
            <FormField name="allocation-type" label={ui("Leave type")} required>
              <SystemSelect value={allocForm.leaveTypeId} onChange={(e) => setAllocForm((p) => ({ ...p, leaveTypeId: e.target.value }))}>
                <option value="">{ui("Select type")}</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </SystemSelect>
            </FormField>
            <FormField name="allocation-scope" label={ui("Who it is for")}>
              <SystemSelect value={allocForm.scope} onChange={(e) => setAllocForm((p) => ({ ...p, scope: e.target.value }))}>
                <option value="role">{ui("Whole role")}</option>
                <option value="user">{ui("Specific staff member")}</option>
              </SystemSelect>
            </FormField>
            {allocForm.scope === "role" ? (
              <FormField name="allocation-role" label={ui("Role")}>
                <SystemSelect value={allocForm.role} onChange={(e) => setAllocForm((p) => ({ ...p, role: e.target.value }))}>
                  {Object.entries(ALLOCATION_ROLE_LABELS).filter(([role]) => role !== "ADMIN").map(([role, label]) => (
                    <option key={role} value={role}>{ui(label)}</option>
                  ))}
                </SystemSelect>
              </FormField>
            ) : (
              <FormField name="allocation-user" label={ui("Staff member")} required>
                <SystemSelect value={allocForm.userId} onChange={(e) => setAllocForm((p) => ({ ...p, userId: e.target.value }))}>
                  <option value="">{ui("Select staff member")}</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName} · {roleWord(u.role)}</option>
                  ))}
                </SystemSelect>
              </FormField>
            )}
            <FormField name="allocation-days" label={ui("Days per year")}>
              <SystemInput type="number" inputMode="numeric" dir="ltr" min={0} value={allocForm.days} onChange={(e) => setAllocForm((p) => ({ ...p, days: e.target.value }))} />
            </FormField>
          </form>
        </Modal>
      ) : null}

      <ConfirmAction
        open={Boolean(declining)}
        title={ui("Decline leave for {0}?", [declining?.user?.fullName || ui("this request")])}
        description={ui("They see your reason on their leave request. Nothing is taken from their allowance.")}
        confirmLabel={ui("Decline")}
        cancelLabel={ui("Keep editing")}
        tone="warning"
        busy={Boolean(declining && reviewing === declining.id)}
        requireReason={{ label: ui("Reason they will read"), minLength: 5 }}
        onCancel={() => setDeclining(null)}
        onConfirm={async (reason?: string) => {
          if (!declining) return;
          if (await review(declining, "REJECTED", reason)) setDeclining(null);
        }}
      />

      {/* ── Staff Balances ──────────────────────────────── */}
      {tab === "balances" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              value={balanceSearch}
              onChange={setBalanceSearch}
              placeholder={ui("Search staff…")}
              label={ui("Search staff balances")}
              className="min-w-[220px] flex-1"
            />
          </div>
          {staffBalances.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Users}
              title={ui("No staff with leave allocations yet")}
              description={ui("Balances appear once leave is allocated to a role or a staff member.")}
            />
          ) : visibleBalances.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Users}
              title={ui("No staff match “{0}”", [balanceSearch])}
              description={ui("Try a different name or clear the search.")}
              action={<SystemButton type="button" variant="outline" size="sm" onClick={() => setBalanceSearch("")}>{ui("Clear search")}</SystemButton>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge/15 text-xs text-ink-muted">
                    <th className="text-start py-2 px-3 font-medium">{ui("Staff member")}</th>
                    <th className="text-start py-2 px-3 font-medium">{ui("Role")}</th>
                    {types.map((t: any) => (
                      <th key={t.id} className="text-center py-2 px-3 font-medium" colSpan={3}>{t.name}</th>
                    ))}
                  </tr>
                  {types.length > 0 ? (
                    <tr className="border-b border-edge/10 text-2xs text-ink-subtle">
                      <th />
                      <th />
                      {types.map((t: any) => (
                        <React.Fragment key={t.id}>
                          <th className="text-center py-1 px-1 font-normal">{ui("Allocated")}</th>
                          <th className="text-center py-1 px-1 font-normal">{ui("Used")}</th>
                          <th className="text-center py-1 px-1 font-normal">{ui("Left")}</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  ) : null}
                </thead>
                <tbody>
                  {visibleBalances.map((row: any) => (
                    <tr key={row.user.id} className="border-b border-edge/8 hover:bg-muted/50">
                      <td className="py-2 px-3 font-medium text-ink"><bdi>{row.user.fullName}</bdi></td>
                      <td className="py-2 px-3 text-ink-muted">{roleWord(row.user.role)}</td>
                      {types.map((t: any) => {
                        const b = (row.balances as any[]).find((bl: any) => bl.leaveTypeId === t.id);
                        const alloc = b ? b.allocated / 10 : 0;
                        const used = b ? b.approved / 10 : 0;
                        // `remaining` is floored at 0 by the API, which hid
                        // over-allocation: 15 allocated against 23 approved
                        // showed "0 left" rather than 8 days overdrawn. Show the
                        // real shortfall so it can be acted on.
                        const left = used > alloc ? alloc - used : b ? b.remaining / 10 : 0;
                        const overdrawn = left < 0;
                        return (
                          <React.Fragment key={t.id}>
                            <td className="text-center py-2 px-1 text-ink">{alloc}</td>
                            <td className="text-center py-2 px-1 text-ink">{used}</td>
                            <td
                              title={
                                overdrawn
                                  ? (Math.abs(left) === 1 ? ui("1 day over the allocation") : ui("{0} days over the allocation", [Math.abs(left)]))
                                  : undefined
                              }
                              className={`text-center py-2 px-1 font-semibold ${left <= 0 && alloc > 0 ? "text-status-error-text" : left <= alloc * 0.2 && alloc > 0 ? "text-status-warning-text" : "text-status-success-text"}`}
                            >
                              {left}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
      </div>
      )}
    </div>
  );
}

// M76: the legacy PayrollPanel (every write 403s for its only caller) is retired; payroll runs live in
// `PayrollRunsPanel` (prepare in /accountant, approve in /admin?view=payroll).

// ────────────────────────────────────────────────────────────
// The school-wide matrix has a localized, scoped recovery surface.
export { RolePermissionsPanel } from "./role-permissions-panel";

// ────────────────────────────────────────────────────────────
// Module 12 — Period Definitions
export function PeriodsPanel({ campusId }: { campusId?: string }) {
  const ui = useUiText();
  const [timeType, setTimeType] = useState<"CLASS" | "EXAM">("CLASS");
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ periodNumber: "", startTime: "08:00", endTime: "08:40" });
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  /**
   * Time inputs are edited locally and saved on blur. They used to be
   * controlled straight off the server value with a PATCH on every change
   * event, so typing "09:15" fired a request per keystroke — and then the blur
   * handler saved it a second time.
   */
  const [drafts, setDrafts] = useState<Record<string, { startTime: string; endTime: string }>>({});
  const [confirmPeriod, setConfirmPeriod] = useState<any>(null);
  // SKAI-146: a time change on a period that timetables already use waits for this confirmation before slots move.
  const [confirmRetime, setConfirmRetime] = useState<{ id: string; field: "startTime" | "endTime" | "periodNumber"; value: string } | null>(null);
  // R4: a load failure is an inline ErrorState with retry, never an empty list that looks like "no periods".
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/academic/periods?timeType=${timeType}${campusId ? `&campusId=${encodeURIComponent(campusId)}` : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "");
      setLoadFailed(false);
      const rows = json.data || [];
      setPeriods(rows);
      setDrafts(Object.fromEntries(rows.map((r: any) => [r.id, { startTime: r.startTime, endTime: r.endTime }])));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [campusId, timeType]);

  useEffect(() => {
    load();
  }, [load, reloadTick]);

  const addPeriod = async () => {
    const num = parseInt(form.periodNumber, 10);
    if (!Number.isFinite(num) || num < 1) {
      toast.error(ui("Period number must be 1 or more"));
      return;
    }
    if (!form.startTime || !form.endTime || form.startTime >= form.endTime) {
      toast.error(ui("End time must be after start time"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/academic/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeType, periodNumber: num, startTime: form.startTime, endTime: form.endTime, campusId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "");
      toast.success(ui("Period {0} ({1}–{2}) added", [num, form.startTime, form.endTime]));
      setShowAdd(false);
      setForm({ periodNumber: String(periods.length + 1), startTime: form.endTime, endTime: shiftMinutes(form.endTime, 40) });
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not add the period. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  const updatePeriod = async (id: string, field: "startTime" | "endTime" | "periodNumber", value: string, applyToTimetables = false) => {
    try {
      const res = await fetch("/api/academic/periods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value, ...(applyToTimetables ? { applyToTimetables: true } : {}) }),
      });
      const json = await res.json();
      if (json.code === "PERIOD_TIMETABLE_CONFIRM") {
        setConfirmRetime({ id, field, value });
        return;
      }
      if (!json.success) throw new Error(json.error || "");
      if (json.warning) toast.warning(json.warning);
      else toast.success(ui("Period updated"));
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not update the period. Please try again.")));
      // Put the saved times back in the inputs so the row never shows a value the server refused.
      setReloadTick((t) => t + 1);
    }
  };

  const deletePeriod = async (id: string) => {
    try {
      const res = await fetch(`/api/academic/periods?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "");
      if (json.warning) toast.warning(json.warning);
      else toast.success(ui("Period removed"));
      setReloadTick((t) => t + 1);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not remove the period. Please try again.")));
    }
  };

  const teachingMinutes = periods.reduce(
    (sum, p) => sum + Math.max(0, minutesBetween(p.startTime, p.endTime)),
    0,
  );
  const dayLength =
    periods.length > 0
      ? Math.max(0, minutesBetween(periods[0].startTime, periods[periods.length - 1].endTime))
      : 0;
  const breakMinutes = Math.max(0, dayLength - teachingMinutes);

  return (
    <div className="sk-panel sk-rise p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={Clock} title={ui("Class and exam times")} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-muted p-1">
            {(["CLASS", "EXAM"] as const).map((t) => (
              <SystemButton variant="ghost"
                key={t}
                onClick={() => setTimeType(t)}
                className={cn(
                  "px-4 py-1.5",
                  timeType === t ? "bg-ink-strong text-white" : "text-ink-muted hover:text-ink"
                )}
              >
                {t === "CLASS" ? ui("Class periods") : ui("Exam periods")}
              </SystemButton>
            ))}
          </div>
          <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd((v) => !v)}>
            {ui("Add period")}
          </BrandButton>
        </div>
      </div>

      {showAdd ? (
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-edge/20 bg-surface-sunken p-4">
          <div>
            <label className="mb-1 block ps-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Period #")}</label>
            <SystemInput
              type="number"
              min={1}
              className="w-20 px-3"
              value={form.periodNumber}
              onChange={(e) => setForm((f) => ({ ...f, periodNumber: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block ps-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Start")}</label>
            <SystemInput
              type="time"
              className="w-28 px-3"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block ps-1 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("End")}</label>
            <SystemInput
              type="time"
              className="w-28 px-3"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </div>
          <BrandButton variant="dark" icon={<Check className="h-4 w-4" />} onClick={addPeriod} disabled={busy}>
            {busy ? ui("Adding…") : ui("Create")}
          </BrandButton>
        </div>
      ) : null}

      {periods.length > 0 && !loading ? (
        <div className="mb-5">
          <StatTiles
            tiles={[
              { key: "count", icon: Clock, label: timeType === "CLASS" ? "Class periods" : "Exam periods", value: periods.length, tone: "violet" },
              {
                key: "window",
                icon: Sun,
                label: "School day",
                value: `${periods[0].startTime}–${periods[periods.length - 1].endTime}`,
                hint: ui("{0} h {1} min from first to last bell", [Math.floor(dayLength / 60), dayLength % 60]),
                tone: "teal",
              },
              {
                key: "teaching",
                icon: BookOpen,
                label: "Teaching time",
                value: `${Math.floor(teachingMinutes / 60)}h ${teachingMinutes % 60}m`,
                hint: "Sum of every period",
                tone: "emerald",
              },
              {
                key: "breaks",
                icon: CalendarClock,
                label: "Break time",
                value: `${breakMinutes} min`,
                hint: breakMinutes ? "Unscheduled gaps between periods" : "No gaps — back-to-back",
                tone: breakMinutes ? "amber" : "slate",
              },
            ]}
          />
        </div>
      ) : null}

      {loadFailed && !loading ? (
        <ErrorState title={ui("Periods could not be loaded")} onRetry={() => setReloadTick((t) => t + 1)} retryLabel={ui("Try again")} />
      ) : loading ? (
        <SkeletonList rows={4} label={ui("Loading periods…")} />
      ) : periods.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Clock}
          title={ui("No periods yet")}
          description={ui("Periods are the rows of every timetable. Add the first one with its start and end time.")}
          action={showAdd ? undefined : <SystemButton type="button" variant="outline" size="sm" onClick={() => setShowAdd(true)}><Plus aria-hidden="true" />{ui("Add period")}</SystemButton>}
        />
      ) : (
        <div className="space-y-2">
          {periods.map((p, i) => {
            // Unscheduled time between two periods is the school's break. There
            // is no break record to render, so the list used to jump straight
            // from "Period 3, ends 10:00" to "Period 5, starts 10:40" and read
            // as a missing period rather than as an intended gap.
            const prev = i > 0 ? periods[i - 1] : null;
            const gapMinutes =
              prev && prev.endTime && p.startTime ? minutesBetween(prev.endTime, p.startTime) : 0;
            const draft = drafts[p.id] ?? { startTime: p.startTime, endTime: p.endTime };
            const lengthMinutes = minutesBetween(p.startTime, p.endTime);
            return (
            <React.Fragment key={p.id}>
            {gapMinutes > 0 ? (
              <div className="flex items-center gap-3 px-4 py-1" aria-hidden="true">
                <span className="h-px flex-1 bg-edge/25" />
                <span className="text-2xs font-semibold text-ink-subtle">
                  {ui("{0} min break", [gapMinutes])}
                </span>
                <span className="h-px flex-1 bg-edge/25" />
              </div>
            ) : null}
            <div
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge/15 bg-brand-50/25 px-4 py-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                <bdi>{p.periodNumber}</bdi>
              </span>
              <span className="text-sm font-bold text-ink-subtle">{ui("Class period {0}", [p.periodNumber])}</span>
              <SystemInput
                type="time"
                aria-label={ui("Period {0} start time", [p.periodNumber])}
                className="px-2.5"
                value={draft.startTime}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [p.id]: { ...draft, startTime: e.target.value } }))
                }
                onBlur={(e) => {
                  const next = e.target.value;
                  if (!next || next === p.startTime) return;
                  if (next >= draft.endTime) {
                    toast.error(ui("Start time must be before the end time"));
                    setDrafts((d) => ({ ...d, [p.id]: { ...draft, startTime: p.startTime } }));
                    return;
                  }
                  updatePeriod(p.id, "startTime", next);
                }}
              />
              <span className="text-xs font-bold text-ink-subtle">{ui("to")}</span>
              <SystemInput
                type="time"
                aria-label={ui("Period {0} end time", [p.periodNumber])}
                className="px-2.5"
                value={draft.endTime}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [p.id]: { ...draft, endTime: e.target.value } }))
                }
                onBlur={(e) => {
                  const next = e.target.value;
                  if (!next || next === p.endTime) return;
                  if (next <= draft.startTime) {
                    toast.error(ui("End time must be after the start time"));
                    setDrafts((d) => ({ ...d, [p.id]: { ...draft, endTime: p.endTime } }));
                    return;
                  }
                  updatePeriod(p.id, "endTime", next);
                }}
              />
              <span className="rounded-full bg-card px-2 py-0.5 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary">
                {lengthMinutes > 0 ? ui("{0} min", [lengthMinutes]) : "—"}
              </span>
              <SystemButton variant="ghost"
                type="button"
                onClick={() => setConfirmPeriod(p)}
                className="ms-auto p-1.5"
                aria-label={ui("Delete period {0}", [p.periodNumber])}
              >
                <Trash2 className="h-4 w-4" />
              </SystemButton>
            </div>
            </React.Fragment>
            );
          })}
          <p className="pt-2 text-xs font-bold text-ink-subtle">
            {ui("Overlapping times within a type are rejected. Changing the time of a period that timetables use asks first, then moves those lessons; a period in use cannot be renumbered or deleted.")}
          </p>
        </div>
      )}

      <ConfirmAction
        open={Boolean(confirmPeriod)}
        title={ui("Delete period {0}?", [confirmPeriod?.periodNumber ?? ""])}
        description={
          confirmPeriod
            ? ui(timeType === "CLASS"
              ? "The {0}–{1} period is removed from this campus's bell schedule. If any timetable still has lessons in it, the delete is refused until they are cleared."
              : "The {0}–{1} slot disappears from every exam date sheet row on this campus. Nothing already placed in it is moved anywhere — it stops being shown.", [confirmPeriod.startTime, confirmPeriod.endTime])
            : ""
        }
        confirmLabel={ui("Delete period")}
        tone="danger"
        onCancel={() => setConfirmPeriod(null)}
        onConfirm={async () => {
          const target = confirmPeriod;
          setConfirmPeriod(null);
          if (target) await deletePeriod(target.id);
        }}
      />
      <ConfirmAction
        open={Boolean(confirmRetime)}
        title={ui("Move timetable lessons to the new time?")}
        description={ui("Timetables already have lessons in this period. Confirming moves those lessons to the new time in every draft; published timetables keep the old time until you republish them.")}
        confirmLabel={ui("Move lessons")}
        cancelLabel={ui("Keep current time")}
        tone="warning"
        onCancel={() => { setConfirmRetime(null); setReloadTick((t) => t + 1); }}
        onConfirm={async () => {
          const target = confirmRetime;
          setConfirmRetime(null);
          if (target) await updatePeriod(target.id, target.field, target.value, true);
        }}
      />
    </div>
  );
}

function shiftMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + mins) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

