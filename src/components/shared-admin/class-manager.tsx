"use client";

import { IconButton } from "@/components/ui/icon-button";
import { InfoTip } from "@/components/ui/tooltip";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { DeskFilterStatus, DeskStats, StatTile, deskRow } from "@/components/ui/desk";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button as SystemButton } from "@/components/ui/button";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ModalSurface, useDialogBehaviour } from "@/components/ui/modal";
import { parseSections } from "@/lib/class-sections";
import {
  Archive,
  AlertCircle,
  ArchiveRestore,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Grid3X3,
  Layers,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  School,
  Settings,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";

import {
  TeacherPicker,
  useTeacherAvailability,
} from "@/components/shared-admin/teacher-picker";
import { SubjectSyllabus } from "@/components/shared-admin/subject-syllabus";
import { BulkAllocate } from "@/components/shared-admin/bulk-allocate";
import { AvatarImage } from "@/components/ui/avatar-image";
import {
  classLabel,
  classGroupKey,
  FormInput,
  StatusPill,
  MiniMetric,
  EmptyInline,
} from "@/components/shared-admin";
import { cn } from "@/lib/utils";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";

/** Console rows carry the class as `class.id`; API rows as `classId`. */
const studentClassId = (student: any): string | undefined => student.classId ?? student.class?.id;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ClassManagerProps {
  cls: any;
  allSections: any[];
  students: any[];
  allStudents: any[];
  teachers: any[];
  classes: any[];

  teacherBusy: boolean;
  subjectBusyId: string | null;
  creatingSubject: boolean;
  teachingModeBusy?: boolean;
  classUpdateBusy: boolean;
  subjectUpdateBusyId: string | null;

  onClose: () => void;
  onChangeTeacher: (classId: string, classTeacherId: string) => void;
  onChangeTeachingMode: (
    classId: string,
    mode: "SINGLE" | "SUBJECT",
  ) => void;
  onCreateSubject: (
    classId: string,
    subject: {
      name: string;
      totalMarks: number;
      teacherId: string;
      applyToAllSections?: boolean;
      code?: string;
      isOptional?: boolean;
      packId?: string;
    },
  ) => Promise<boolean>;
  onChangeSubjectTeacher: (
    classId: string,
    subjectId: string,
    teacherId: string,
    /** SKO-462: ISO date the change takes effect; omitted means today. */
    effectiveFrom?: string,
  ) => void;
  onAddStudent: () => void;
  onViewStudent: (student: any) => void;
  creatingSections?: boolean;
  /** Adds sections to this class, optionally copying another section's subjects. */
  onCreateSections?: (
    source: any,
    input: { sections: string[]; cloneFromClassId?: string; teacherId?: string },
  ) => Promise<boolean>;
  onDeleteClass: (cls: any) => void;
  onUpdateClass: (
    classId: string,
    updates: { name?: string; section?: string; academicYear?: number },
  ) => Promise<boolean | void>;
  onDeleteSubject: (subject: any) => void;
  onUpdateSubject: (
    classId: string,
    subjectId: string,
    updates: { name?: string; totalMarks?: number; code?: string; isElective?: boolean; archived?: boolean },
  ) => Promise<void>;
  onRefresh?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function teacherAvatar(t: {
  fullName?: string | null;
  email?: string | null;
  id: string;
  profileImageUrl?: string | null;
}) {
  return t.profileImageUrl || undefined;
}

function sectionSetupStatus(section: any): "ready" | "partial" | "empty" {
  const hasTeacher = !!section.classTeacher?.id;
  const hasSubjects = (section.subjects?.length || 0) > 0;
  if (hasTeacher && hasSubjects) return "ready";
  if (hasTeacher || hasSubjects) return "partial";
  return "empty";
}

const STATUS_DOT: Record<string, string> = {
  ready: "bg-success",
  partial: "bg-warning",
  empty: "bg-muted",
};

/**
 * What a section still needs before it can actually run.
 *
 * The rail already showed a red/amber/green dot, but a colour on its own only
 * tells you that something is wrong — not what, and not where to go. These are
 * the same two conditions `sectionSetupStatus` scores, named so they can be
 * printed next to the section they belong to.
 */
function sectionGaps(section: any): string[] {
  const gaps: string[] = [];
  if (!section.classTeacher?.id) gaps.push("teacher");
  if ((section.subjects?.length || 0) === 0) gaps.push("subjects");
  return gaps;
}

function sectionStudentCount(
  section: any,
  allStudents: any[],
): number {
  return allStudents.filter((s: any) => studentClassId(s) === section.id).length;
}

/** Collect unique subjects across all sections by name. */
function uniqueSubjects(sections: any[]): string[] {
  const seen = new Set<string>();
  for (const sec of sections) {
    for (const sub of sec.subjects || []) {
      seen.add(sub.name);
    }
  }
  return Array.from(seen).sort();
}

/** Find a subject by name within a section. */
function findSubjectByName(section: any, name: string) {
  return (section.subjects || []).find(
    (s: any) => s.name === name,
  );
}

/* ------------------------------------------------------------------ */
/*  Flash animation hook                                               */
/* ------------------------------------------------------------------ */

function useFlashCell() {
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = useCallback((key: string) => {
    setFlashKey(key);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setFlashKey(null), 1200);
  }, []);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);
  return { flashKey, flash };
}

/* ------------------------------------------------------------------ */
/*  Section transfer (SKO-462)                                         */
/* ------------------------------------------------------------------ */

type TransferPreview = { students: number; ready: number; blocked: Array<{ studentId: string; name: string; reason: string }>; to: { label: string }; preserved: { attendance: number; reports: number; invoices: number } };

/** The safe way out of an occupied section: preview, then move every pupil and archive, all or nothing. */
function SectionTransfer({ section, siblings, ui, onDone }: { section: any; siblings: any[]; ui: ReturnType<typeof useUiText>; onDone: () => void }) {
  const [target, setTarget] = useState(siblings[0]?.id ?? "");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const call = async (action: "preview" | "apply") => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/classes/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromClassId: section.id, toClassId: target, effectiveDate, action, archiveAfter: action === "apply" }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Transfer failed");
      if (action === "preview") { setPreview(json.preview); return; }
      toast.success(json.moved === 1 ? ui("Moved 1 student to {0}; the section is archived.", [json.preview.to.label]) : ui("Moved {0} students to {1}; the section is archived.", [json.moved, json.preview.to.label]));
      onDone();
    } catch (failure) {
      setError(friendlyErrorMessage(failure, ui("The students could not be moved. Nothing changed; try again.")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-3xl border border-edge/40 bg-surface-subtle p-5" data-testid="section-transfer">
      <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary">{ui("Move students to another section")}</p>
      {siblings.length === 0 ? (
        <p className="mt-2 text-sm font-normal leading-relaxed text-ink-muted">{ui("Add another section first, then move the students there.")}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block space-y-1 text-sm font-semibold text-ink">
            <span>{ui("Move to section")}</span>
            <SystemSelect aria-label={ui("Move to section")} value={target} onChange={(event) => { setTarget(event.target.value); setPreview(null); }}>
              {siblings.map((sibling) => <option key={sibling.id} value={sibling.id}>{classLabel(sibling)}</option>)}
            </SystemSelect>
          </label>
          <label className="block space-y-1 text-sm font-semibold text-ink">
            <span>{ui("Effective from")}</span>
            <SystemInput type="date" aria-label={ui("Effective from")} value={effectiveDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => { setEffectiveDate(event.target.value); setPreview(null); }} />
          </label>
          {error ? <Alert tone="danger" compact>{error}</Alert> : null}
          {preview ? (
            <Alert tone="info" compact live="polite">
              <div className="space-y-2">
              <p>{ui("{0} student(s) move to {1}. {2} attendance, {3} report and {4} invoice record(s) stay with their original enrollment.", [preview.ready, preview.to.label, preview.preserved.attendance, preview.preserved.reports, preview.preserved.invoices])}</p>
              {preview.blocked.length ? (
                <div className="text-status-error-text">
                  <p>{ui("{0} student(s) cannot move on this date:", [preview.blocked.length])}</p>
                  <ul className="list-disc ps-4">{preview.blocked.map((row) => <li key={row.studentId}>{row.name}: {row.reason}</li>)}</ul>
                </div>
              ) : null}
              </div>
            </Alert>
          ) : null}
          {preview && !preview.blocked.length ? (
            <SystemButton type="button" variant="dark" loading={busy} disabled={busy || !target} onClick={() => call("apply")} className="h-11 w-full">
              {ui("Move {0} student(s) and archive", [preview.ready])}
            </SystemButton>
          ) : (
            <SystemButton type="button" variant="secondary" loading={busy} disabled={busy || !target || !effectiveDate} onClick={() => call("preview")} className="h-11 w-full">
              {ui("Preview move")}
            </SystemButton>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings Drawer                                                    */
/* ------------------------------------------------------------------ */

function SettingsDrawer({
  section,
  siblings,
  enrolled,
  classUpdateBusy,
  onUpdateClass,
  onDeleteClass,
  onRefresh,
  onClose,
}: {
  section: any;
  siblings: any[];
  enrolled: number;
  classUpdateBusy: boolean;
  onUpdateClass: ClassManagerProps["onUpdateClass"];
  onDeleteClass: ClassManagerProps["onDeleteClass"];
  onRefresh?: () => void;
  onClose: () => void;
}) {
  const ui = useUiText();
  const [editName, setEditName] = useState(section.name || "");
  const [editSection, setEditSection] = useState(section.section || "");
  const [editYear, setEditYear] = useState(
    String(section.academicYear || new Date().getFullYear()),
  );

  useEffect(() => {
    setEditName(section.name || "");
    setEditSection(section.section || "");
    setEditYear(String(section.academicYear || new Date().getFullYear()));
  }, [section.id]);

  const save = async () => {
    const saved = await onUpdateClass(section.id, {
      name: editName,
      section: editSection,
      academicYear: Number(editYear) || new Date().getFullYear(),
    });
    if (saved === false) return;
    toast.success(ui("Class details updated"));
    onClose();
  };

  /* A side drawer rather than a centred dialog, so it keeps its own layout —
     but it had no focus trap, no scroll lock and a hand-picked `z-[150]`. */
  const drawerRef = useRef<HTMLDivElement>(null);
  const requestClose = () => { if (!classUpdateBusy) onClose(); };
  const { z, mounted } = useDialogBehaviour(drawerRef, { onClose: requestClose });

  return mounted ? createPortal((
    <div
      className="fixed inset-0 flex justify-end"
      style={{ zIndex: z }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div className="absolute inset-0 bg-ink-strong/30 backdrop-blur-sm animate-backdrop-enter" onMouseDown={requestClose} />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ui("{0} settings", [classLabel(section)])}
        tabIndex={-1}
        className="relative z-10 flex h-full w-full max-w-md flex-col bg-card shadow-2xl animate-modal-enter"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-edge/15 px-6 py-5">
          <div>
            <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary">
              {ui("Settings")}
            </p>
            <h3 className="mt-1 text-lg font-bold text-ink-strong">
              {classLabel(section)}
            </h3>
          </div>
          <SystemButton variant="ghost"
            type="button"
            onClick={requestClose}
            disabled={classUpdateBusy}
            aria-label={ui("Close class settings")}
            className="flex items-center justify-center"
          >
            <X className="h-5 w-5" />
          </SystemButton>
        </div>

        {/* Drawer body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 custom-scrollbar">
          <div className="space-y-4">
            <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
              {ui("Edit Class Details")}
            </p>
            <FormInput
              label={ui("Class Name")}
              value={editName}
              placeholder={ui("e.g. Class 10")}
              onChange={setEditName}
            />
            <FormInput
              label={ui("Section")}
              value={editSection}
              placeholder={ui("e.g. A")}
              onChange={setEditSection}
            />
            <FormInput
              label={ui("Academic Year")}
              type="number"
              value={editYear}
              placeholder="2026"
              onChange={setEditYear}
            />
            <SystemButton variant="dark"
              type="button"
              onClick={save}
              disabled={classUpdateBusy}
              loading={classUpdateBusy}
              className="flex h-12 w-full items-center justify-center gap-2"
            >
              {ui("Save Changes")}
            </SystemButton>
          </div>

          {enrolled > 0 ? (
            <SectionTransfer section={section} siblings={siblings} ui={ui} onDone={() => { onRefresh?.(); onClose(); }} />
          ) : null}

          <div className="rounded-3xl border border-status-warning-border bg-status-warning-surface/50 p-5">
            <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-status-warning-text">
              {ui("Class archive")}
            </p>
            <p className="mt-2 text-sm font-normal leading-relaxed text-ink-muted">
              {ui("Archive this class to remove it from current class lists. Its students, academic records, fees, and history are preserved.")}
            </p>
            <SystemButton variant="secondary"
              type="button"
              onClick={() => onDeleteClass(section)}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2"
            >
              <Archive className="h-4 w-4" />
              {ui("Archive Class")}
            </SystemButton>
          </div>
        </div>
      </div>
    </div>
  ), document.body) : null;
}

/* ------------------------------------------------------------------ */
/*  Matrix View                                                        */
/* ------------------------------------------------------------------ */

/**
 * Add sections to an existing class.
 *
 * Lives in the rail beside the sections it creates, because that is where the
 * question is asked: you are looking at "Section A" and the school has just
 * opened a B. Cloning is the default posture rather than an option — a
 * parallel section almost always teaches the same subjects, and rebuilding
 * that list by hand is the tedium this replaces.
 */
function AddSectionPanel({
  cls,
  sections,
  teachers,
  busy,
  onCreate,
  onDone,
}: {
  cls: any;
  sections: any[];
  teachers: any[];
  busy: boolean;
  onCreate: NonNullable<ClassManagerProps["onCreateSections"]>;
  onDone: () => void;
}) {
  const [input, setInput] = useState("");
  const [cloneFromId, setCloneFromId] = useState<string>(() => {
    // Default to whichever existing section has the most subjects — the one
    // most likely to be the fully set-up template.
    const richest = [...sections].sort(
      (a, b) => (b.subjects?.length || 0) - (a.subjects?.length || 0),
    )[0];
    return (richest?.subjects?.length || 0) > 0 ? richest.id : "";
  });
  const [teacherId, setTeacherId] = useState("");
  const ui = useUiText();

  /**
   * The panel opens at the foot of the section list, which on a rail with a
   * few sections in it is already below the fold — measured at 272px tall with
   * 177px of that, including the Add button, clipped by the rail's scroll box.
   * Autofocusing the name field only brings the panel's *top* into view, which
   * leaves the button just as unreachable.
   *
   * Scrolling the rail to its end is exact rather than approximate: this panel
   * is always the last thing in it. `scrollIntoView` was the first attempt and
   * is the wrong tool here — its smooth behaviour is throttled whenever the
   * tab is not foregrounded, so the scroll simply never arrived.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let scroller = panelRef.current?.parentElement ?? null;
      while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
        scroller = scroller.parentElement;
      }
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const names = useMemo(() => parseSections(input), [input]);

  const taken = useMemo(
    () => new Set(sections.map((sec) => (sec.section || "").trim().toLowerCase())),
    [sections],
  );
  const clashing = names.filter((n) => taken.has(n.toLowerCase()));

  const cloneSource = sections.find((sec) => sec.id === cloneFromId);
  const cloneCount = cloneSource?.subjects?.length || 0;

  const blocked = names.length === 0
    ? ui("Type a section name, or a run like A-D.")
    : clashing.length > 0
      ? ui("Section {0} already exists.", [clashing.join(", ")])
      : null;

  const submit = async () => {
    if (blocked || busy) return;
    const ok = await onCreate(cls, {
      sections: names,
      cloneFromClassId: cloneFromId || undefined,
      teacherId: teacherId || undefined,
    });
    if (ok) {
      setInput("");
      onDone();
    }
  };

  return (
    <div
      ref={panelRef}
      className="sk-panel mt-3 p-3.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary">
          {ui("New section")}
        </span>
        <SystemButton variant="ghost"
          type="button"
          onClick={onDone}
          disabled={busy}
          aria-label={ui("Cancel")}
          className="flex items-center justify-center"
        >
          <X className="h-3 w-3" />
        </SystemButton>
      </div>

      <SystemInput
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        autoFocus
        disabled={busy}
        placeholder={ui("B  ·  or  B-D")}
        className="mt-2 w-full px-3 transition-all"
      />

      {names.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {names.map((n) => {
            const isTaken = taken.has(n.toLowerCase());
            return (
              <Badge
                key={n}
                size="sm"
                variant={isTaken ? "danger" : "secondary"}
                className={cn(isTaken && "line-through")}
              >
                {cls.name} {n}
              </Badge>
            );
          })}
        </div>
      ) : null}

      {/* Copy subjects from — the reason most sections get added at all. */}
      {sections.some((sec) => (sec.subjects?.length || 0) > 0) ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
            {ui("Copy subjects from")}
          </span>
          <SystemSelect
            value={cloneFromId}
            onChange={(e) => setCloneFromId(e.target.value)}
            disabled={busy}
            className="w-full cursor-pointer px-2.5"
          >
            <option value="">{ui("Start empty")}</option>
            {sections
              .filter((sec) => (sec.subjects?.length || 0) > 0)
              .map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.section ? ui("Section {0}", [sec.section]) : ui("Main")} ({sec.subjects.length})
                </option>
              ))}
          </SystemSelect>
        </label>
      ) : null}

      <label className="mt-2 block">
        <span className="mb-1 block text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
          {ui("Class teacher")}
        </span>
        <SystemSelect
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          disabled={busy}
          className="w-full cursor-pointer px-2.5"
        >
          <option value="">{ui("Assign later")}</option>
          {teachers.map((t: any) => (
            <option key={t.id} value={t.id}>{t.fullName}</option>
          ))}
        </SystemSelect>
      </label>

      {blocked && input.trim() ? (
        <Alert tone="warning" compact live="off" className="mt-2">{blocked}</Alert>
      ) : names.length > 0 ? (
        <p className="mt-2 text-sm font-normal leading-relaxed text-ink-muted">
          {cloneCount > 0
            ? ui(names.length === 1 ? (cloneCount === 1 ? "Creates {0} section with {1} subject each." : "Creates {0} section with {1} subjects each.") : (cloneCount === 1 ? "Creates {0} sections with {1} subject each." : "Creates {0} sections with {1} subjects each."), [names.length, cloneCount])
            : ui(names.length === 1 ? "Creates {0} section." : "Creates {0} sections.", [names.length])}
        </p>
      ) : null}

      <SystemButton variant="default"
        type="button"
        onClick={submit}
        disabled={Boolean(blocked) || busy}
        loading={busy}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5"
      >
        {busy ? null : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
        {busy ? ui("Creating\u2026") : ui("Add section")}
      </SystemButton>
    </div>
  );
}

function MatrixView({
  sections,
  allStudents,
  teachers,
  availability,
  subjectBusyId,
  onChangeSubjectTeacher,
  refreshAvailability,
  onRefresh,
  flashKey,
  flash,
}: {
  onRefresh?: () => void;
  sections: any[];
  allStudents: any[];
  teachers: any[];
  availability: any[];
  subjectBusyId: string | null;
  onChangeSubjectTeacher: ClassManagerProps["onChangeSubjectTeacher"];
  refreshAvailability: () => void;
  flashKey: string | null;
  flash: (key: string) => void;
}) {
  const ui = useUiText();
  const subjects = useMemo(() => uniqueSubjects(sections), [sections]);
  const [openPickerKey, setOpenPickerKey] = useState<string | null>(null);

  if (sections.length === 0) {
    return <EmptyInline text={ui("No sections to display.")} />;
  }
  if (subjects.length === 0) {
    return (
      <EmptyInline text={ui("No subjects have been added yet. Select a section and add subjects.")} />
    );
  }

  const teachingMode = (sec: any): "SINGLE" | "SUBJECT" =>
    sec.teachingMode === "SUBJECT" ? "SUBJECT" : "SINGLE";

  return (
    <div className="overflow-x-auto rounded-3xl border border-edge/15 custom-scrollbar">
      <table className="w-full min-w-[600px] border-collapse">
        <thead>
          <tr>
            <th className="sticky start-0 z-10 rounded-ss-3xl bg-gradient-to-br from-primary to-brand-400 px-5 py-4 text-start text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-white/90">
              {ui("Subject")}
            </th>
            {sections.map((sec) => (
              <th
                key={sec.id}
                className="bg-gradient-to-br from-primary to-brand-400 px-4 py-4 text-center text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-white/90 last:rounded-se-3xl"
              >
                <span className="block">
                  {sec.section ? ui("Section {0}", [sec.section]) : ui("Main")}
                </span>
                <span className="mt-1 block text-2xs font-medium text-white/70">
                  {ui("{0} students", [sectionStudentCount(sec, allStudents)])}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subjects.map((subjectName, rowIdx) => (
            <tr
              key={subjectName}
              className={
                rowIdx % 2 === 0 ? "bg-card" : "bg-brand-50/25"
              }
            >
              {/* Subject name cell */}
              <td className="sticky start-0 z-10 border-t border-edge/10 bg-inherit px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                  <span className="text-xs font-bold text-ink-strong">
                    {subjectName}
                  </span>
                  {(() => {
                    const sample = findSubjectByName(
                      sections[0],
                      subjectName,
                    );
                    return sample?.totalMarks ? (
                      <Badge size="sm" variant="secondary" className="tabular-nums">
                        {ui("{0} marks", [sample.totalMarks])}
                      </Badge>
                    ) : null;
                  })()}
                </div>
                <BulkAllocate
                  subjectName={subjectName}
                  rows={sections.filter((sec) => teachingMode(sec) === "SUBJECT").map((sec) => findSubjectByName(sec, subjectName)).filter(Boolean).map((subject: any) => ({ subjectId: subject.id, expectedTeacherId: subject.teacher?.id ?? null }))}
                  teachers={teachers}
                  availability={availability}
                  onDone={() => { refreshAvailability(); onRefresh?.(); }}
                />
              </td>

              {/* One cell per section */}
              {sections.map((sec) => {
                const subject = findSubjectByName(sec, subjectName);
                const isSingle = teachingMode(sec) === "SINGLE";
                const cellKey = `${sec.id}::${subjectName}`;
                const isFlashing = flashKey === cellKey;
                const isBusy = subject?.id === subjectBusyId;
                const isPickerOpen = openPickerKey === cellKey;
                const teacher = isSingle
                  ? sec.classTeacher
                  : subject?.teacher;
                const assigned = !!teacher?.id;

                return (
                  <td
                    key={sec.id}
                    className={cn(
                      "border-t border-edge/10 px-3 py-2.5 text-center transition-all duration-300",
                      isFlashing && "bg-status-success-surface",
                      !isFlashing && assigned && "bg-status-success-surface/40",
                      !isFlashing && !assigned && !isSingle && "bg-status-error-surface/30",
                    )}
                  >
                    {!subject ? (
                      <span className="text-2xs font-bold text-ink-subtle">
                        --
                      </span>
                    ) : isBusy ? (
                      <div className="flex flex-col items-center gap-1.5 py-1">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-2xs font-semibold text-primary/60">{ui("Saving...")}</span>
                      </div>
                    ) : isSingle ? (
                      <div className="flex flex-col items-center gap-1">
                        {teacher?.id ? (
                          <>
                            <div className="h-7 w-7 overflow-hidden rounded-lg border border-edge/20 bg-card">
                              <AvatarImage
                                src={teacherAvatar(teacher)}
                                name={teacher.fullName}
                                alt={ui("Teacher")}
                                initialsClassName="text-2xs"
                              />
                            </div>
                            <span className="min-w-0 max-w-full truncate text-2xs font-bold text-ink-muted">
                              {teacher.fullName || ui("Teacher")}
                            </span>
                          </>
                        ) : (
                          <span className="text-2xs font-bold italic text-ink-subtle">
                            {ui("No class teacher")}
                          </span>
                        )}
                        <span className="text-2xs font-medium text-ink-subtle">
                          {ui("Follows class teacher")}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5">
                        {assigned ? (
                          <>
                            <div className="h-8 w-8 overflow-hidden rounded-xl border-2 border-status-success-border bg-card shadow-sm">
                              <AvatarImage
                                src={teacherAvatar(teacher)}
                                name={teacher.fullName}
                                alt={ui("Teacher")}
                                initialsClassName="text-2xs"
                              />
                            </div>
                            <span className="min-w-0 max-w-full truncate text-2xs font-bold text-ink-strong">
                              {teacher.fullName || ui("Teacher")}
                            </span>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                            </span>
                            <span className="text-2xs font-bold text-status-error-text">
                              {ui("Unassigned")}
                            </span>
                          </div>
                        )}
                        <SystemButton variant="ghost"
                          type="button"
                          onClick={() =>
                            setOpenPickerKey(isPickerOpen ? null : cellKey)
                          }
                          className={cn(
                            "px-2.5 py-1",
                            isPickerOpen
                              ? "bg-primary text-white shadow-md shadow-primary/20"
                              : "bg-primary/8 text-primary hover:bg-primary/15",
                          )}
                        >
                          {assigned ? ui("Change") : ui("Assign")}
                        </SystemButton>
                        {isPickerOpen ? (
                          <div className="mt-1 w-full max-w-[200px] rounded-xl border border-edge/15 bg-card p-2 shadow-lg">
                            <TeacherPicker
                              label=""
                              teachers={teachers}
                              availability={availability}
                              assignmentMode="subject"
                              subjectName={subjectName}
                              currentClassId={sec.id}
                              value={subject?.teacher?.id || ""}
                              onChange={(value) => {
                                if (
                                  value !==
                                  (subject?.teacher?.id || "")
                                ) {
                                  onChangeSubjectTeacher(
                                    sec.id,
                                    subject.id,
                                    value,
                                  );
                                  flash(cellKey);
                                  setOpenPickerKey(null);
                                  setTimeout(
                                    refreshAvailability,
                                    600,
                                  );
                                }
                              }}
                              allowUnassigned
                              showUnassignedHint={false}
                            />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Detail View                                                */
/* ------------------------------------------------------------------ */

function SectionDetailView({
  section,
  students,
  teachers,
  availability,
  allSections,
  teacherBusy,
  subjectBusyId,
  creatingSubject,
  teachingModeBusy,
  subjectUpdateBusyId,
  onChangeTeacher,
  onChangeTeachingMode,
  onCreateSubject,
  onChangeSubjectTeacher,
  onAddStudent,
  onViewStudent,
  onDeleteSubject,
  onUpdateSubject,
  refreshAvailability,
}: {
  section: any;
  students: any[];
  teachers: any[];
  availability: any[];
  allSections: any[];
  teacherBusy: boolean;
  subjectBusyId: string | null;
  creatingSubject: boolean;
  teachingModeBusy?: boolean;
  subjectUpdateBusyId: string | null;
  onChangeTeacher: ClassManagerProps["onChangeTeacher"];
  onChangeTeachingMode: ClassManagerProps["onChangeTeachingMode"];
  onCreateSubject: ClassManagerProps["onCreateSubject"];
  onChangeSubjectTeacher: ClassManagerProps["onChangeSubjectTeacher"];
  onAddStudent: ClassManagerProps["onAddStudent"];
  onViewStudent: ClassManagerProps["onViewStudent"];
  onDeleteSubject: ClassManagerProps["onDeleteSubject"];
  onUpdateSubject: ClassManagerProps["onUpdateSubject"];
  refreshAvailability: () => void;
}) {
  const ui = useUiText();
  const teachingMode: "SINGLE" | "SUBJECT" =
    section.teachingMode === "SUBJECT" ? "SUBJECT" : "SINGLE";
  const subjectCount = section.subjects?.length || 0;

  // Add subject form state
  const [subjectName, setSubjectName] = useState("");
  const [subjectMarks, setSubjectMarks] = useState("100");
  const [newSubjectTeacherId, setNewSubjectTeacherId] = useState(
    section.classTeacher?.id || "",
  );
  const [applyToAllSections, setApplyToAllSections] = useState(false);
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectElective, setSubjectElective] = useState(false);

  // Inline editing
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(
    null,
  );
  const [editSubjectName, setEditSubjectName] = useState("");
  const [editSubjectMarks, setEditSubjectMarks] = useState("100");

  // Syllabus expansion
  const [expandedSyllabusId, setExpandedSyllabusId] = useState<
    string | null
  >(null);

  // Student list expansion
  const [showAllStudents, setShowAllStudents] = useState(false);

  useEffect(() => {
    setNewSubjectTeacherId(section.classTeacher?.id || "");
    setEditingSubjectId(null);
    setApplyToAllSections(false);
    setShowAllStudents(false);
  }, [section.id]);

  const createSubject = async () => {
    const created = await onCreateSubject(section.id, {
      name: subjectName,
      totalMarks: Number(subjectMarks) || 100,
      teacherId:
        teachingMode === "SINGLE"
          ? section.classTeacher?.id || ""
          : newSubjectTeacherId,
      applyToAllSections,
      code: subjectCode,
      isOptional: subjectElective,
    });
    if (created) {
      setSubjectName("");
      setSubjectMarks("100");
      setSubjectCode("");
      setSubjectElective(false);
      toast.success(ui("Subject added"));
    }
  };

  // SKAI-149: bulk add from a curriculum pack; subjects already in the section are skipped.
  const addPack = (packId: string) =>
    onCreateSubject(section.id, { name: "", totalMarks: Number(subjectMarks) || 100, teacherId: teachingMode === "SINGLE" ? section.classTeacher?.id || "" : "", applyToAllSections, packId });

  const startEditingSubject = (subject: any) => {
    setEditingSubjectId(subject.id);
    setEditSubjectName(subject.name);
    setEditSubjectMarks(String(subject.totalMarks || 100));
  };

  const saveEditingSubject = async (subjectId: string) => {
    await onUpdateSubject(section.id, subjectId, {
      name: editSubjectName,
      totalMarks: Number(editSubjectMarks) || 100,
    });
    setEditingSubjectId(null);
  };

  const visibleStudents = showAllStudents
    ? students
    : students.slice(0, 8);

  // Setup progress
  const hasTeacher = !!section.classTeacher?.id;
  const allSubjectsAssigned =
    teachingMode === "SINGLE" ||
    (section.subjects || []).every((s: any) => !!s.teacher?.id);
  const setupSteps = [
    hasTeacher,
    subjectCount > 0,
    allSubjectsAssigned,
  ];
  const completedSteps = setupSteps.filter(Boolean).length;
  const totalSteps = setupSteps.length;

  return (
    <div className="space-y-6">
      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left: Subjects & Teachers */}
        <div className="min-w-0 space-y-5">
          {/* Teaching mode toggle */}
          <div className="rounded-3xl border border-edge/10 bg-gradient-to-br from-surface-subtle to-brand-50 p-4">
            <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
              {ui("Teaching Mode")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(
                [
                  {
                    mode: "SINGLE" as const,
                    title: ui("One Teacher"),
                    desc: ui("Class teacher takes all subjects"),
                    icon: UserCheck,
                    activeClasses: "border-status-info-text bg-gradient-to-br from-card to-status-success-surface shadow-md",
                    activeTitleColor: "text-status-info-text",
                    activeIconBg: "bg-status-info-text",
                  },
                  {
                    mode: "SUBJECT" as const,
                    title: ui("Per Subject"),
                    desc: ui("Each subject has its own teacher"),
                    icon: Users,
                    activeClasses: "border-status-warning-text bg-gradient-to-br from-card to-status-warning-surface shadow-md",
                    activeTitleColor: "text-status-warning-text",
                    activeIconBg: "bg-warning",
                  },
                ] as const
              ).map((option) => {
                const active = teachingMode === option.mode;
                const Icon = option.icon;
                return (
                  <SystemButton variant="ghost"
                    key={option.mode}
                    type="button"
                    disabled={teachingModeBusy}
                    onClick={() => {
                      if (!active)
                        onChangeTeachingMode(section.id, option.mode);
                    }}
                    className={cn(
                      "p-3.5 text-start",
                      active
                        ? option.activeClasses
                        : "border-transparent bg-card/70 hover:border-edge/30 hover:bg-card hover:shadow-sm",
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
                            active
                              ? `${option.activeIconBg} text-white shadow-sm`
                              : "bg-muted text-ink-subtle",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <p
                          className={cn(
                            "text-xs font-bold transition-colors",
                            active
                              ? option.activeTitleColor
                              : "text-ink-strong",
                          )}
                        >
                          {option.title}
                        </p>
                      </div>
                      {active ? (
                        <CheckCircle2 className={cn("h-4 w-4 shrink-0", option.activeTitleColor)} />
                      ) : null}
                    </div>
                    <p className="mt-1.5 ps-9 text-2xs font-medium leading-relaxed text-ink-subtle">
                      {option.desc}
                    </p>
                  </SystemButton>
                );
              })}
            </div>
          </div>

          {/* Subject cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                {ui("Subjects ({0})", [subjectCount])}
              </p>
              {teachingMode === "SINGLE" && subjectCount > 0 ? (
                <Badge size="sm" variant="success">
                  {ui("All follow class teacher")}
                </Badge>
              ) : null}
            </div>

            {(section.subjects || []).map((subject: any) => {
              const isEditing = editingSubjectId === subject.id;
              const isSyllabusOpen = expandedSyllabusId === subject.id;

              return (
                <div
                  key={subject.id}
                  // A subject nobody teaches carries the warning rail, so gaps show without opening each card.
                  data-tone={teachingMode !== "SINGLE" && !subject.teacher?.id ? "warning" : undefined}
                  className={cn(deskRow, "group/card p-4")}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <FormInput
                          label={ui("Subject Name")}
                          value={editSubjectName}
                          placeholder={ui("Subject name")}
                          onChange={setEditSubjectName}
                        />
                        <FormInput
                          label={ui("Total Marks")}
                          type="number"
                          value={editSubjectMarks}
                          placeholder="100"
                          onChange={setEditSubjectMarks}
                        />
                      </div>
                      <div className="flex gap-2">
                        <SystemButton variant="dark"
                          type="button"
                          onClick={() =>
                            saveEditingSubject(subject.id)
                          }
                          disabled={
                            subjectUpdateBusyId === subject.id
                          }
                          loading={subjectUpdateBusyId === subject.id}
                          className="flex flex-1 items-center justify-center gap-2"
                        >
                          {ui("Save")}
                        </SystemButton>
                        <SystemButton variant="ghost"
                          type="button"
                          onClick={() => setEditingSubjectId(null)}
                          className="px-4"
                        >
                          {ui("Cancel")}
                        </SystemButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="min-w-0 max-w-full truncate text-sm font-bold text-ink-strong">
                              {subject.name}
                            </p>
                            {subject.totalMarks ? (
                              <Badge size="sm" variant="secondary" className="shrink-0 tabular-nums">
                                {ui("{0} marks", [subject.totalMarks])}
                              </Badge>
                            ) : null}
                            {subject.code ? <Badge size="sm" variant="outline" className="shrink-0" dir="ltr">{subject.code}</Badge> : null}
                            <Badge size="sm" variant={subject.isElective ? "info" : "neutral"} className="shrink-0">{subject.isElective ? ui("Elective") : ui("Core")}</Badge>
                            {subject.archivedAt ? <Badge size="sm" variant="warning" className="shrink-0">{ui("Archived")}</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs font-medium text-ink-subtle">
                            {teachingMode === "SINGLE" ? (
                              <span className="text-status-info-text">
                                {ui("Follows class teacher")}
                              </span>
                            ) : subject.teacher?.fullName ? (
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-4 w-4 overflow-hidden rounded-md">
                                  <AvatarImage
                                    src={teacherAvatar(
                                      subject.teacher,
                                    )}
                                    name={subject.teacher?.fullName}
                                    alt=""
                                    initialsClassName="text-2xs"
                                  />
                                </span>
                                {subject.teacher.fullName}
                              </span>
                            ) : (
                              <span className="text-status-error-text">
                                {ui("Teacher unassigned")}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 transition-opacity sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100">
                          {/* Syllabus chip */}
                          <SystemButton variant="ghost"
                            type="button"
                            onClick={() =>
                              setExpandedSyllabusId(
                                isSyllabusOpen ? null : subject.id,
                              )
                            }
                            className="flex items-center gap-1 px-2 justify-start"
                          >
                            <BookOpen className="h-3 w-3" />
                            {ui("Syllabus")}
                          </SystemButton>
                          <IconButton variant="ghost" label={ui("Edit subject")}
                            onClick={() =>
                              startEditingSubject(subject)
                            }
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                          </IconButton>
                          <IconButton variant="ghost" label={subject.archivedAt ? ui("Restore subject") : ui("Archive subject")}
                            onClick={() => onUpdateSubject(section.id, subject.id, { archived: !subject.archivedAt })}
                          >
                            {subject.archivedAt ? <ArchiveRestore className="h-3 w-3" aria-hidden="true" /> : <Archive className="h-3 w-3" aria-hidden="true" />}
                          </IconButton>
                          <IconButton variant="ghost" label={ui("Delete subject")}
                            onClick={() =>
                              onDeleteSubject(subject)
                            }
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </IconButton>
                        </div>
                      </div>

                      {/* Subject teacher picker (SUBJECT mode only) */}
                      {teachingMode === "SUBJECT" ? (
                        <div className="relative mt-3">
                          <TeacherPicker
                            label={
                              subjectBusyId === subject.id
                                ? ui("Saving...")
                                : ui("Subject Teacher")
                            }
                            teachers={teachers}
                            availability={availability}
                            assignmentMode="subject"
                            subjectName={subject.name}
                            currentClassId={section.id}
                            value={subject.teacher?.id || ""}
                            onChange={(value) => {
                              if (
                                value !==
                                (subject.teacher?.id || "")
                              ) {
                                onChangeSubjectTeacher(
                                  section.id,
                                  subject.id,
                                  value,
                                );
                                setTimeout(
                                  refreshAvailability,
                                  600,
                                );
                              }
                            }}
                            allowUnassigned
                            showUnassignedHint={
                              !subject.teacher?.id
                            }
                          />
                          {subjectBusyId === subject.id ? (
                            <Loader2 className="absolute end-4 top-[42px] h-4 w-4 animate-spin text-primary" />
                          ) : null}
                        </div>
                      ) : null}

                      {/* Inline syllabus */}
                      {isSyllabusOpen ? (
                        <SubjectSyllabus subjectId={subject.id} />
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}

            {subjectCount === 0 ? (
              <EmptyInline text={ui("No subjects are attached to this section yet.")} />
            ) : null}
          </div>

          {/* Add subject form */}
          <div className="rounded-3xl border-2 border-dashed border-edge/25 bg-gradient-to-br from-card to-surface-subtle/50 p-5">
            <div className="flex items-center gap-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary/60">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                <Plus className="h-3 w-3 text-primary" />
              </span>
              {ui("Add Subject")}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormInput
                label={ui("Subject Name")}
                value={subjectName}
                placeholder={ui("e.g. Mathematics")}
                onChange={setSubjectName}
              />
              <FormInput
                label={ui("Total Marks")}
                type="number"
                value={subjectMarks}
                placeholder="100"
                onChange={setSubjectMarks}
              />
              <FormInput
                label={ui("Subject code (optional)")}
                value={subjectCode}
                placeholder={ui("e.g. MATH")}
                onChange={(value) => setSubjectCode(value.toUpperCase())}
              />
              <label className="flex items-center gap-3 self-end rounded-xl border border-edge/40 bg-card p-3 text-sm font-semibold text-ink-strong">
                <Checkbox checked={subjectElective} onChange={(event) => setSubjectElective(event.target.checked)} />
                {ui("Elective subject")}
              </label>
            </div>
            {teachingMode === "SUBJECT" ? (
              <div className="mt-3">
                <TeacherPicker
                  label={ui("Subject Teacher (optional)")}
                  teachers={teachers}
                  availability={availability}
                  assignmentMode="subject"
                  subjectName={subjectName}
                  value={newSubjectTeacherId}
                  onChange={setNewSubjectTeacherId}
                  allowUnassigned
                />
              </div>
            ) : null}
            {allSections.length > 1 ? (
              <SystemButton variant="ghost"
                type="button"
                onClick={() => setApplyToAllSections((v) => !v)}
                className="mt-3 flex w-full items-center gap-3 p-3 text-start justify-start"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                    applyToAllSections
                      ? "border-primary bg-primary"
                      : "border-edge/50 bg-card",
                  )}
                >
                  {applyToAllSections ? (
                    <Check
                      className="h-3 w-3 text-white"
                      strokeWidth={3.5}
                    />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-2xs font-bold text-ink-strong">
                    {ui("Add to all {0} sections", [allSections.length])}
                  </span>
                  <span className="block text-2xs font-bold text-ink-muted">
                    {ui("Sections that already have this subject are skipped.")}
                  </span>
                </span>
              </SystemButton>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {[["primary", ui("Add primary core pack")], ["secondary", ui("Add secondary core pack")]].map(([id, label]) => (
                <SystemButton key={id} variant="ghost" type="button" onClick={() => addPack(id)} disabled={creatingSubject} className="flex h-11 items-center gap-2 px-4">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                </SystemButton>
              ))}
              <SystemButton variant="dark"
                type="button"
                onClick={createSubject}
                disabled={creatingSubject || !subjectName.trim()}
                loading={creatingSubject}
                className="flex h-11 items-center gap-2 px-5 justify-start"
              >
                {creatingSubject ? null : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                {ui("Add Subject")}
              </SystemButton>
            </div>
          </div>
        </div>

        {/* Right: Section info sidebar */}
        <div className="space-y-4">
          {/* Class teacher card */}
          <div className="rounded-3xl border border-primary/10 bg-gradient-to-br from-brand-50 via-brand-50 to-brand-100 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15">
                <GraduationCap className="h-3 w-3 text-primary" />
              </div>
              <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary/60">
                {teachingMode === "SINGLE"
                  ? ui("Class Teacher")
                  : ui("Homeroom Teacher")}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-card shadow-md shadow-primary/8">
                {section.classTeacher?.id ? (
                  <AvatarImage
                    src={teacherAvatar(section.classTeacher)}
                    name={section.classTeacher?.fullName}
                    alt={ui("Teacher")}
                    initialsClassName="text-base"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <User className="h-6 w-6 text-ink-subtle" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-ink-strong">
                  {section.classTeacher?.fullName || ui("Unassigned")}
                </p>
                <p className="truncate text-xs font-normal text-ink-subtle">
                  {section.classTeacher?.email || ui("No teacher assigned")}
                </p>
              </div>
            </div>
            <div className="relative mt-3">
              <TeacherPicker
                label={
                  teacherBusy
                    ? ui("Saving...")
                    : teachingMode === "SINGLE"
                      ? ui("Change Class Teacher")
                      : ui("Change Homeroom Teacher")
                }
                teachers={teachers}
                availability={availability}
                assignmentMode={
                  teachingMode === "SINGLE" ? "homeroom" : "subject"
                }
                currentClassId={section.id}
                value={section.classTeacher?.id || ""}
                onChange={(value) => {
                  if (
                    value !== (section.classTeacher?.id || "")
                  ) {
                    onChangeTeacher(section.id, value);
                    setTimeout(refreshAvailability, 600);
                  }
                }}
                allowUnassigned
                showUnassignedHint={!section.classTeacher?.id}
              />
              {teacherBusy ? (
                <Loader2 className="absolute end-4 top-[42px] h-4 w-4 animate-spin text-primary" />
              ) : null}
            </div>
          </div>

          {/* Student count with mini avatars */}
          <div className="rounded-3xl border border-status-error-text/10 bg-gradient-to-br from-card to-status-error-surface p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-destructive/10">
                  <Users className="h-3 w-3 text-status-error-text" />
                </div>
                <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-status-error-text">
                  {ui("Students")}
                </p>
              </div>
              <Badge size="sm" variant="danger" className="tabular-nums">
                {students.length}
              </Badge>
            </div>
            {students.length > 0 ? (
              <div className="mt-3 flex items-center gap-1">
                {students.slice(0, 5).map((s: any) => (
                  <div
                    key={s.id}
                    className="h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-white bg-card shadow-sm"
                  >
                    <AvatarImage src={s.profileImageUrl} name={s.fullName} alt="" initialsClassName="text-2xs" />
                  </div>
                ))}
                {students.length > 5 ? (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-50 text-3xs font-bold text-primary shadow-sm">
                    +{students.length - 5}
                  </span>
                ) : null}
              </div>
            ) : null}
            <SystemButton variant="ghost"
              type="button"
              onClick={() =>
                students.length > 0
                  ? setShowAllStudents(!showAllStudents)
                  : onAddStudent()
              }
              className="mt-3 flex w-full items-center justify-center gap-1.5"
            >
              {students.length > 0 ? (
                <>
                  <Users className="h-3 w-3" />
                  {showAllStudents
                    ? ui("Collapse")
                    : ui("View All Students")}
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  {ui("Add First Student")}
                </>
              )}
            </SystemButton>
          </div>

          {/* Setup progress */}
          <div className={cn(
            "rounded-3xl border p-4 shadow-sm transition-all duration-500",
            completedSteps === totalSteps
              ? "border-status-success-border/50 bg-gradient-to-br from-card to-status-success-surface"
              : "border-edge/10 bg-card",
          )}>
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md",
                completedSteps === totalSteps ? "bg-status-success-surface" : "bg-muted",
              )}>
                <CheckCircle2 className={cn(
                  "h-3 w-3",
                  completedSteps === totalSteps ? "text-status-success-text" : "text-ink-subtle",
                )} />
              </div>
              <p className={cn(
                "text-2xs font-semibold ltr:uppercase ltr:tracking-wider",
                completedSteps === totalSteps ? "text-status-success-text/60" : "text-ink-subtle",
              )}>
                {completedSteps === totalSteps ? ui("Setup Complete") : ui("Setup Progress")}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="relative h-12 w-12">
                <svg
                  viewBox="0 0 36 36"
                  className="h-full w-full -rotate-90"
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="currentColor"
                    className="text-border-subtle"
                    strokeWidth="3.5"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeDasharray={`${(completedSteps / totalSteps) * 88} 88`}
                    strokeLinecap="round"
                    className={cn(
                      "transition-all duration-700",
                      completedSteps === totalSteps ? "text-status-success-text" : "text-primary",
                    )}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold text-ink-strong">
                  {completedSteps}/{totalSteps}
                </span>
              </div>
              <div className="min-w-0 space-y-1">
                {[
                  {
                    done: hasTeacher,
                    label: ui("Class teacher assigned"),
                  },
                  {
                    done: subjectCount > 0,
                    label: ui("Subjects added"),
                  },
                  {
                    done: allSubjectsAssigned,
                    label: ui("Teachers assigned to subjects"),
                  },
                ].map((step) => (
                  <div
                    key={step.label}
                    className="flex items-center gap-1.5"
                  >
                    <div
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full",
                        step.done
                          ? "bg-status-success-surface text-status-success-text"
                          : "bg-muted text-ink-subtle",
                      )}
                    >
                      <Check
                        className="h-2 w-2"
                        strokeWidth={3}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-2xs font-bold",
                        step.done
                          ? "text-ink-strong"
                          : "text-ink-subtle",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Student list (below both columns) */}
      {showAllStudents ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
              <GraduationCap className="h-3.5 w-3.5 text-primary" />
              {ui("All Students ({0})", [students.length])}
            </p>
            <SystemButton variant="ghost"
              type="button"
              onClick={onAddStudent}
              className="flex items-center gap-1.5 px-3 justify-start"
            >
              <Plus className="h-3 w-3" />
              {ui("Add Student")}
            </SystemButton>
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleStudents.map((student: any) => (
              <SystemButton variant="outline"
                key={student.id}
                type="button"
                onClick={() => onViewStudent(student)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start sm:w-auto sm:min-w-[200px] justify-start"
              >
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-white bg-card shadow-sm">
                  <AvatarImage src={student.profileImageUrl} name={student.fullName} alt="" initialsClassName="text-2xs" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-ink-strong">
                    {student.fullName}
                  </p>
                  <p className="text-xs font-normal text-ink-subtle tabular-nums">
                    {ui("Roll {0}", [student.rollNo || "N/A"])}
                  </p>
                </div>
              </SystemButton>
            ))}
            {/* Add student card */}
            <SystemButton variant="ghost"
              type="button"
              onClick={onAddStudent}
              className="flex w-full items-center justify-center gap-2 px-4 py-3 sm:w-auto sm:min-w-[200px]"
            >
              <Plus className="h-4 w-4" />
              {ui("Add Student")}
            </SystemButton>
          </div>
          {students.length > 8 && !showAllStudents ? (
            <SystemButton variant="ghost"
              type="button"
              onClick={() => setShowAllStudents(true)}
              className="underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
            >
              {ui("Show all {0} students", [students.length])}
            </SystemButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component: ClassManager                                       */
/* ------------------------------------------------------------------ */

export function ClassManager({
  cls,
  allSections,
  students,
  allStudents,
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
  creatingSections = false,
  onCreateSections,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
  onRefresh,
}: ClassManagerProps) {
  const [selectedSectionId, setSelectedSectionId] = useState<
    string | "all"
  >(cls.id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // SKO-462: teacher changes are effective-dated; earlier dates keep who taught before.
  const today = new Date().toISOString().slice(0, 10);
  const [assignmentDate, setAssignmentDate] = useState(today);
  const ui = useUiText();
  const changeSubjectTeacher: ClassManagerProps["onChangeSubjectTeacher"] = (classId, subjectId, teacherId) =>
    onChangeSubjectTeacher(classId, subjectId, teacherId, assignmentDate === today ? undefined : assignmentDate);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  // The readiness tile filters the rail to the sections that still need a class teacher or subjects.
  const [onlyGaps, setOnlyGaps] = useState(false);

  const { availability, refresh: refreshAvailability } =
    useTeacherAvailability();
  const { flashKey, flash } = useFlashCell();

  /** Sections with both a class teacher and at least one subject. */
  const readySections = useMemo(
    () => allSections.filter((sec) => sectionGaps(sec).length === 0).length,
    [allSections],
  );

  // Sort sections alphabetically
  const sortedSections = useMemo(
    () =>
      [...allSections].sort((a, b) =>
        (a.section || "").localeCompare(b.section || ""),
      ),
    [allSections],
  );

  const selectedSection =
    selectedSectionId === "all"
      ? null
      : sortedSections.find((s) => s.id === selectedSectionId) ||
        sortedSections[0] ||
        null;

  const selectedStudents = useMemo(
    () =>
      selectedSection
        ? allStudents.filter(
            (s: any) => studentClassId(s) === selectedSection.id,
          )
        : [],
    [selectedSection, allStudents],
  );

  // Aggregate stats
  const totalSubjects = useMemo(() => {
    const names = new Set<string>();
    for (const sec of sortedSections) {
      for (const sub of sec.subjects || []) names.add(sub.name);
    }
    return names.size;
  }, [sortedSections]);

  const totalStudents = allStudents.length;
  const gapsOnly = onlyGaps && readySections < sortedSections.length;
  const className = cls.name || ui("Class");
  const academicYear = cls.academicYear || new Date().getFullYear();

  // Teaching mode of the initially-selected class (for header badge)
  const primaryTeachingMode =
    cls.teachingMode === "SUBJECT" ? "SUBJECT" : "SINGLE";

  return (
    <>
      {/* The header here is bespoke — a gradient title, mode badges and a tab
          rail — so this sits on `ModalSurface` rather than `Modal`. Everything
          structural (portal, layer, focus trap, scroll lock, Escape, the mobile
          sheet) is the shared implementation. The old markup split the backdrop
          and the panel into two separate fixed layers at `z-[120]`/`z-[125]`
          with `pointer-events-none` juggling between them. */}
      <ModalSurface onClose={onClose} size="xl">
        {/* ============================================================ */}
        {/*  HEADER                                                       */}
        {/* ============================================================ */}
        <div className="shrink-0 rounded-t-[34px] border-b border-edge/12 bg-gradient-to-r from-surface-subtle via-card to-brand-100 px-5 py-4 sm:px-8 sm:py-5">
          <div>
            {/* Top row: title + close */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-400 shadow-lg shadow-primary/20">
                  <School className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  {/* A dialog over a console view: the view keeps the page's one h1 (§4.3), so this is an h2. */}
                  <h2 className="truncate text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">
                    <bdi className="bg-gradient-to-r from-primary via-brand-400 to-brand-700 bg-clip-text text-transparent">
                      {className}
                    </bdi>
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge size="sm" variant="secondary" className="tabular-nums">
                      {academicYear}
                    </Badge>
                    <Badge
                      size="sm"
                      variant={primaryTeachingMode === "SINGLE" ? "success" : "warning"}
                      className="gap-1"
                    >
                      {primaryTeachingMode === "SINGLE" ? (
                        <UserCheck className="h-2.5 w-2.5" />
                      ) : (
                        <Users className="h-2.5 w-2.5" />
                      )}
                      {primaryTeachingMode === "SINGLE"
                        ? ui("Single Teacher")
                        : ui("Per Subject")}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {onRefresh ? (
                  <IconButton variant="ghost" label={ui("Refresh data")}
                    onClick={onRefresh}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  </IconButton>
                ) : null}
                <SystemButton variant="ghost"
                  type="button"
                  onClick={onClose}
                  className="flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">{ui("Close")}</span>
                </SystemButton>
              </div>
            </div>

            {/* Stats row.
                The counts alone never said whether the class was actually
                ready to run — a class can show "3 sections, 12 subjects" and
                still have two sections nobody teaches. The readiness pill puts
                that on the same line as everything else. */}
            <DeskStats className="mt-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr))]" data-class-stats>
              {sortedSections.length > 0 ? (
                <StatTile
                  index={0}
                  className="py-3"
                  icon={readySections === sortedSections.length ? CheckCircle2 : AlertCircle}
                  tone={readySections === sortedSections.length ? "success" : "warning"}
                  value={readySections}
                  label={readySections === sortedSections.length ? ui("All sections ready") : ui("{0}/{1} ready", [readySections, sortedSections.length])}
                  hint={<span className="flex items-center gap-1.5"><Progress size="sm" className="flex-1" tone={readySections === sortedSections.length ? "success" : "warning"} value={Math.round((readySections / sortedSections.length) * 100)} label={ui("A section is ready once it has a class teacher and at least one subject")} />{/* The tile is a button while it can filter, so the tip (itself a button) only shows once every section is ready. */}{readySections === sortedSections.length ? <InfoTip content={ui("Every section has a class teacher and at least one subject")} /> : null}</span>}
                  onSelect={readySections === sortedSections.length ? undefined : () => setOnlyGaps(!onlyGaps)}
                  selected={gapsOnly}
                />
              ) : null}
              <StatTile index={1} className="py-3" icon={Layers} tone="brand" value={sortedSections.length} label={ui(sortedSections.length !== 1 ? "sections" : "section")} />
              <StatTile index={2} className="py-3" icon={BookOpen} tone="info" value={totalSubjects} label={ui(totalSubjects !== 1 ? "subjects" : "subject")} />
              <StatTile index={3} className="py-3" icon={GraduationCap} tone="neutral" value={totalStudents} label={ui(totalStudents !== 1 ? "students" : "student")} />
            </DeskStats>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  BODY: Left Rail + Main Area                                  */}
        {/* ============================================================ */}
        <div className="flex min-h-0 flex-1">
          {/* Mobile rail toggle */}
          <SystemButton variant="default"
            type="button"
            onClick={() => setMobileRailOpen(!mobileRailOpen)}
            className="absolute bottom-6 start-6 z-[130] flex h-12 w-12 items-center justify-center lg:hidden"
          >
            <Layers className="h-5 w-5" />
          </SystemButton>

          {/* Left Rail */}
          <div
            className={cn(
              "shrink-0 border-e border-edge/12 bg-gradient-to-b from-surface-subtle to-brand-50 transition-all duration-300",
              // Desktop: always visible
              "hidden lg:flex lg:w-[220px] lg:flex-col",
              // Mobile: overlay
              mobileRailOpen &&
                "absolute inset-y-0 start-0 z-[135] flex w-[260px] flex-col shadow-2xl",
            )}
          >
            {/* Mobile close */}
            {mobileRailOpen ? (
              <div className="flex items-center justify-between border-b border-edge/10 px-4 py-3 lg:hidden">
                <span className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {ui("Sections")}
                </span>
                <SystemButton variant="ghost"
                  type="button"
                  onClick={() => setMobileRailOpen(false)}
                  className="flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </SystemButton>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              {/* All Sections button */}
              <SystemButton variant="ghost"
                type="button"
                onClick={() => {
                  setSelectedSectionId("all");
                  setMobileRailOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3.5 py-3 text-start justify-start",
                  selectedSectionId === "all"
                    ? "bg-card shadow-md shadow-primary/8"
                    : "hover:bg-card/70",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all",
                    selectedSectionId === "all"
                      ? "bg-gradient-to-br from-primary to-brand-400 text-white shadow-md shadow-primary/25"
                      : "bg-brand-50 text-primary",
                  )}
                >
                  <Grid3X3 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-xs font-bold",
                      selectedSectionId === "all"
                        ? "text-primary"
                        : "text-ink-strong",
                    )}
                  >
                    {ui("All Sections")}
                  </p>
                  <p className="text-2xs font-medium text-ink-subtle">
                    {ui("Matrix view")}
                  </p>
                </div>
              </SystemButton>

              {/* Divider */}
              <div className="my-3 h-px bg-edge/15" />

              {/* Section pills */}
              {gapsOnly ? <div className="mb-2 px-1"><DeskFilterStatus shown={sortedSections.filter((sec) => sectionSetupStatus(sec) !== "ready").length} total={sortedSections.length} onClear={() => setOnlyGaps(false)} /></div> : null}
              <div className="space-y-1.5">
                {(gapsOnly ? sortedSections.filter((sec) => sectionSetupStatus(sec) !== "ready") : sortedSections).map((sec) => {
                  const active = selectedSectionId === sec.id;
                  const status = sectionSetupStatus(sec);
                  const studentCount = sectionStudentCount(
                    sec,
                    allStudents,
                  );
                  const sectionSubjectCount =
                    sec.subjects?.length || 0;
                  const gaps = sectionGaps(sec);

                  return (
                    <SystemButton variant="ghost"
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        setSelectedSectionId(sec.id);
                        setMobileRailOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-3.5 py-3 text-start justify-start",
                        active
                          ? "border-s-[3px] border-s-primary bg-card ps-3 shadow-md shadow-primary/8"
                          : "border-s-[3px] border-s-transparent hover:bg-card/70",
                      )}
                    >
                      {/* Status dot */}
                      <div className="mt-1.5 flex shrink-0 flex-col items-center">
                        <div
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            STATUS_DOT[status],
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-xs font-bold",
                            active
                              ? "text-primary"
                              : "text-ink-strong",
                          )}
                        >
                          {sec.section
                            ? ui("Section {0}", [sec.section])
                            : ui("Main Section")}
                        </p>
                        <p className="mt-0.5 truncate text-2xs font-medium text-ink-subtle">
                          {sec.classTeacher?.fullName || ui("No teacher yet")}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-2xs font-medium text-ink-subtle tabular-nums">
                            {ui(studentCount !== 1 ? "{0} students" : "{0} student", [studentCount])}
                          </span>
                          <span className="text-2xs font-medium text-ink-subtle tabular-nums">
                            {ui(sectionSubjectCount !== 1 ? "{0} subjects" : "{0} subject", [sectionSubjectCount])}
                          </span>
                          {/* Says what the dot means. A section can look fine
                              in the list and still have nobody teaching it. */}
                          {gaps.length > 0 ? (
                            <Badge size="sm" variant="warning" className="gap-1">
                              <AlertCircle className="h-2.5 w-2.5" aria-hidden="true" />
                              {ui(gaps.length === 2 ? "Needs teacher & subjects" : gaps[0] === "teacher" ? "Needs teacher" : "Needs subjects")}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </SystemButton>
                  );
                })}
              </div>

              {/* ── Add a section ──
                  The manager could rename, re-teacher and retire a section but
                  never create one, so "Grade 8 needs a B" sent the office back
                  out to Quick Setup — which then rejected Grade 8 as a
                  duplicate. It belongs here, next to the sections it joins. */}
              {onCreateSections ? (
                addingSection ? (
                  <AddSectionPanel
                    cls={cls}
                    sections={sortedSections}
                    teachers={teachers}
                    busy={creatingSections}
                    onCreate={onCreateSections}
                    onDone={() => setAddingSection(false)}
                  />
                ) : (
                  <SystemButton variant="outline"
                    type="button"
                    onClick={() => setAddingSection(true)}
                    className="mt-3 flex w-full items-center gap-2.5 px-3.5 py-3 text-start justify-start"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                      <Plus className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-primary">{ui("Add section")}</span>
                      <span className="block text-2xs font-medium text-ink-subtle">
                        {ui("Copies subjects across")}
                      </span>
                    </span>
                  </SystemButton>
                )
              ) : null}
            </div>
          </div>

          {/* Mobile overlay backdrop */}
          {mobileRailOpen ? (
            <div
              className="fixed inset-0 z-[132] bg-black/20 lg:hidden"
              onClick={() => setMobileRailOpen(false)}
            />
          ) : null}

          {/* Main Area */}
          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-surface-subtle to-card p-4 sm:p-6 lg:p-8 custom-scrollbar">
            <div className="mx-auto max-w-5xl">
              <label className="mb-4 flex flex-wrap items-center justify-end gap-2 text-2xs font-bold text-ink-muted">
                <span>{ui("Teacher changes take effect from")}</span>
                <SystemInput type="date" aria-label={ui("Teacher changes take effect from")} value={assignmentDate} onChange={(event) => setAssignmentDate(event.target.value || today)} className="w-auto" data-testid="assignment-effective-date" />
              </label>
              {selectedSectionId === "all" ? (
                <>
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-400 text-white shadow-md shadow-primary/20">
                      <Grid3X3 className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-ink-strong">
                        {ui("Subject-Teacher Matrix")}
                      </h2>
                      <p className="text-sm font-normal text-ink-muted">
                        {ui("Overview of all subjects and teacher assignments across sections")}
                      </p>
                    </div>
                  </div>
                  <MatrixView
                    sections={sortedSections}
                    allStudents={allStudents}
                    teachers={teachers}
                    availability={availability}
                    subjectBusyId={subjectBusyId}
                    onChangeSubjectTeacher={changeSubjectTeacher}
                    refreshAvailability={refreshAvailability}
                    onRefresh={onRefresh}
                    flashKey={flashKey}
                    flash={flash}
                  />
                </>
              ) : selectedSection ? (
                <>
                  <div className="mb-6 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-2xl shadow-md",
                          sectionSetupStatus(selectedSection) ===
                            "ready"
                            ? "bg-gradient-to-br from-success to-success text-white "
                            : sectionSetupStatus(
                                  selectedSection,
                                ) === "partial"
                              ? "bg-gradient-to-br from-warning to-warning text-white "
                              : "bg-gradient-to-br from-edge to-brand-200 text-white shadow-edge/20",
                        )}
                      >
                        <LayoutGrid className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-ink-strong">
                          {selectedSection.section
                            ? ui("Section {0}", [selectedSection.section])
                            : ui("Main Section")}
                        </h2>
                        <p className="text-sm font-normal text-ink-muted">
                          {selectedSection.classTeacher?.fullName ||
                            ui("No class teacher assigned")}{" "}
                          / {ui(selectedStudents.length !== 1 ? "{0} students" : "{0} student", [selectedStudents.length])}
                        </p>
                      </div>
                    </div>
                    <IconButton variant="ghost" label={ui("Section settings")}
                      onClick={() => setSettingsOpen(true)}
                    >
                      <Settings className="h-5 w-5" aria-hidden="true" />
                    </IconButton>
                  </div>
                  <SectionDetailView
                    section={selectedSection}
                    students={selectedStudents}
                    teachers={teachers}
                    availability={availability}
                    allSections={sortedSections}
                    teacherBusy={teacherBusy}
                    subjectBusyId={subjectBusyId}
                    creatingSubject={creatingSubject}
                    teachingModeBusy={teachingModeBusy}
                    subjectUpdateBusyId={subjectUpdateBusyId}
                    onChangeTeacher={onChangeTeacher}
                    onChangeTeachingMode={onChangeTeachingMode}
                    onCreateSubject={onCreateSubject}
                    onChangeSubjectTeacher={changeSubjectTeacher}
                    onAddStudent={onAddStudent}
                    onViewStudent={onViewStudent}
                    onDeleteSubject={onDeleteSubject}
                    onUpdateSubject={onUpdateSubject}
                    refreshAvailability={refreshAvailability}
                  />
                </>
              ) : (
                <EmptyInline text={ui("Select a section from the sidebar to view its details.")} />
              )}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  FOOTER                                                       */}
        {/* ============================================================ */}
        <div className="shrink-0 rounded-b-[34px] border-t border-edge/10 bg-gradient-to-r from-surface-subtle via-card to-brand-100 px-5 py-2.5 sm:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-2xs font-bold text-ink-subtle">
              <span className="rounded-md bg-primary/8 px-2 py-0.5 text-3xs font-bold text-primary/50">
                {className}
              </span>
              <span>/</span>
              <span>{academicYear}</span>
              <span>/</span>
              <span>
                {ui(sortedSections.length !== 1 ? "{0} sections" : "{0} section", [sortedSections.length])}
              </span>
            </div>
            <SystemButton variant="outline"
              type="button"
              onClick={() => {
                if (selectedSection) {
                  setSettingsOpen(true);
                } else if (sortedSections.length > 0) {
                  setSelectedSectionId(sortedSections[0].id);
                  setSettingsOpen(true);
                }
              }}
              className="flex items-center gap-2 px-3.5 justify-start"
            >
              <Settings className="h-3 w-3" />
              {ui("Settings")}
            </SystemButton>
          </div>
        </div>
      </ModalSurface>

      {/* Settings drawer */}
      {settingsOpen && selectedSection ? (
        <SettingsDrawer
          section={selectedSection}
          siblings={sortedSections.filter((s: any) => s.id !== selectedSection.id && !s.archivedAt && (s.academicYear ?? selectedSection.academicYear) === selectedSection.academicYear)}
          enrolled={selectedStudents.filter((s: any) => (s.status ?? "active") === "active" && !s.archivedAt).length}
          classUpdateBusy={classUpdateBusy}
          onUpdateClass={onUpdateClass}
          onDeleteClass={onDeleteClass}
          onRefresh={onRefresh}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}
