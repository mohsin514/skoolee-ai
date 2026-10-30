"use client";

import { fillNodes } from "@/lib/auth/fill-nodes";
import { Button as SystemButton } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  GraduationCap,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { ModalSurface } from "@/components/ui/modal";
import { parseSections, parseSubjectList } from "@/lib/class-sections";
import {
  TeacherPicker,
  useTeacherAvailability,
  type PickerTeacher,
} from "@/components/shared-admin/teacher-picker";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { DraftRecovery } from "@/components/ui/draft-recovery";

/* ── Types ────────────────────────────────────────────────────────────── */

interface QuickSubject {
  key: string;
  name: string;
  totalMarks: string;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Run async jobs with bounded concurrency.
 *
 * The database sits behind a connection pooler, so firing hundreds of writes
 * at once would exhaust it — these run in parallel but capped.
 */
async function runPooled<T>(
  jobs: (() => Promise<T>)[],
  limit = 6,
): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, jobs.length) },
    async () => {
      while (cursor < jobs.length) {
        const index = cursor++;
        results[index] = await jobs[index]();
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Colours the section chips cycle through.
 *
 * Deliberately no rose or pink: a chip is struck through in red when that
 * section already exists, and the palette used to include two reds of its own —
 * so a perfectly fine "Grade 1 - C" sitting on a rose swatch read as a clash at
 * a glance. Red now means exactly one thing here.
 */
const SECTION_CHIP_COLORS = [
  { bg: "bg-status-info-surface", text: "text-status-info-text", border: "border-status-info-text/20" },
  { bg: "bg-status-warning-surface", text: "text-status-warning-text", border: "border-status-warning-text/20" },
  { bg: "bg-brand-100", text: "text-status-brand-text", border: "border-primary/20" },
  { bg: "bg-status-info-surface", text: "text-status-info-text", border: "border-status-info-text/20" },
  { bg: "bg-status-info-surface", text: "text-status-info-text", border: "border-status-info-text/20" },
  { bg: "bg-status-success-surface", text: "text-status-success-text", border: "border-status-success-text/20" },
];

/* ── Component ────────────────────────────────────────────────────────── */

export function QuickCreateClass({
  teachers,
  classes,
  onClose,
  onCreated,
}: {
  teachers: PickerTeacher[];
  classes: any[];
  onClose: () => void;
  onCreated: (createdClasses: any[]) => void;
}) {
  const ui = useUiText();
  /* ── State ────────────────────────────────────────────────────────── */
  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState(
    String(new Date().getFullYear()),
  );
  const [teachingMode, setTeachingMode] = useState<"SINGLE" | "SUBJECT">(
    "SINGLE",
  );
  const [hasSections, setHasSections] = useState(false);
  const [sectionsInput, setSectionsInput] = useState("");
  const [subjects, setSubjects] = useState<QuickSubject[]>([]);
  const [copyFromClassId, setCopyFromClassId] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectMarks, setNewSubjectMarks] = useState("100");
  // SKAI-148: seats per class, and "Grade 1 … Grade 5" in one go.
  const [capacity, setCapacity] = useState("");
  const [useRange, setUseRange] = useState(false);
  const [gradeFrom, setGradeFrom] = useState("1");
  const [gradeTo, setGradeTo] = useState("5");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const draftValues = { name, academicYear, teachingMode, hasSections, sectionsInput, subjects, copyFromClassId };
  const classDraft = useFormDraft({
    record: "admin:quick-create-class",
    schema: 1,
    values: draftValues,
    baseline: { name: "", academicYear: String(new Date().getFullYear()), teachingMode: "SINGLE", hasSections: false, sectionsInput: "", subjects: [], copyFromClassId: "" },
    fields: ["name", "academicYear", "teachingMode", "hasSections", "sectionsInput", "subjects", "copyFromClassId"] as const,
    apply: (next) => { setName(next.name); setAcademicYear(next.academicYear); setTeachingMode(next.teachingMode as "SINGLE" | "SUBJECT"); setHasSections(next.hasSections); setSectionsInput(next.sectionsInput); setSubjects(next.subjects); setCopyFromClassId(next.copyFromClassId); },
  });

  const { availability } = useTeacherAvailability();

  /* ── Derived ──────────────────────────────────────────────────────── */

  /** Expanded, de-duplicated section names, in the order they were typed. */
  const sectionNames = useMemo(() => parseSections(sectionsInput), [sectionsInput]);

  const year = Number(academicYear) || new Date().getFullYear();

  /**
   * Sections of this class that already exist for this year.
   *
   * The clash was previously only discovered on submit, as a toast, *after*
   * the office had filled in the whole form — and the API creates one row per
   * section, so a duplicate found halfway leaves the earlier ones created.
   * Checking as they type means the chip itself says so.
   */
  const fromGrade = Number(gradeFrom), toGrade = Number(gradeTo);
  const rangeInvalid = useRange && (!Number.isInteger(fromGrade) || !Number.isInteger(toGrade) || fromGrade < 0 || toGrade < fromGrade || toGrade - fromGrade >= 15);
  /** The class names this form writes: one, or every grade in the range. */
  const classNames = useMemo(() => {
    if (!useRange) return [name.trim()];
    if (rangeInvalid) return [];
    return Array.from({ length: toGrade - fromGrade + 1 }, (_, i) => `${name.trim()} ${fromGrade + i}`);
  }, [useRange, rangeInvalid, name, fromGrade, toGrade]);

  /** Sections of the first named class that already exist this year (drives the chip strike-through). */
  const takenSections = useMemo(() => {
    const target = (classNames[0] || "").toLowerCase();
    const taken = new Set<string>();
    if (!target || useRange) return taken;
    for (const cls of classes || []) {
      if ((cls.name || "").trim().toLowerCase() !== target) continue;
      if (Number(cls.academicYear) !== year) continue;
      taken.add((cls.section || "").trim().toLowerCase());
    }
    return taken;
  }, [classes, classNames, useRange, year]);

  const clashingSections = useMemo(() => {
    if (!useRange) {
      return hasSections
        ? sectionNames.filter((section) => takenSections.has(section.toLowerCase()))
        : takenSections.has("")
          ? ["\u2014"]
          : [];
    }
    const wanted = hasSections ? sectionNames : [""];
    const clashes: string[] = [];
    for (const className of classNames) {
      for (const section of wanted) {
        const exists = (classes || []).some((cls: any) => (cls.name || "").trim().toLowerCase() === className.toLowerCase() && (cls.section || "").trim().toLowerCase() === section.toLowerCase() && Number(cls.academicYear) === year);
        if (exists) clashes.push(section ? `${className} ${section}` : className);
      }
    }
    return clashes;
  }, [useRange, hasSections, sectionNames, takenSections, classNames, classes, year]);

  /* What pressing Create will actually write. Sections become class rows; every
     subject is created once per section. */
  const classRowCount = classNames.length * (hasSections ? sectionNames.length : 1);
  const subjectRowCount = classRowCount * subjects.length;

  /**
   * Everything standing between the form and a successful create, said before
   * the click rather than as a toast after it.
   */
  const capacityInvalid = capacity.trim() !== "" && !(Number.isInteger(Number(capacity)) && Number(capacity) >= 1 && Number(capacity) <= 200);
  const blockedReason = !name.trim()
    ? ui("Name the class to continue.")
    : hasSections && sectionNames.length === 0
      ? ui("Add at least one section, or turn sections off.")
      : rangeInvalid
        ? ui("The last grade must be the same as or after the first grade, at most 15 grades.")
      : capacityInvalid
        ? ui("Capacity must be a whole number from 1 to 200, or left blank.")
      : classRowCount > 60
        ? ui("That would create more than 60 classes at once. Split the range or the sections.")
      : useRange && clashingSections.length > 0
        ? ui("{0} already exist for {1}.", [clashingSections.join(", "), year])
      : clashingSections.length > 0
        ? hasSections
          ? clashingSections.length === 1
            ? ui("{0} {1} already exists for {2}.", [name.trim(), clashingSections[0], year])
            : ui("{0} {1} already exist for {2}.", [name.trim(), clashingSections.join(", "), year])
          : ui("{0} already exists for {1}.", [name.trim(), year])
        : null;

  const copyableClasses = useMemo(
    () =>
      (classes || [])
        .filter((cls: any) => (cls.subjects?.length || 0) > 0)
        .sort((a: any, b: any) =>
          (a.name || "").localeCompare(b.name || ""),
        ),
    [classes],
  );

  const progressPercent =
    progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  /* ── Actions ──────────────────────────────────────────────────────── */

  /**
   * Adds whatever is in the box — which may be one subject or a whole pasted
   * list. It used to reject anything with a comma in it as a single bad name.
   */
  const addSubject = () => {
    const raw = newSubjectName.trim();
    if (!raw) {
      toast.error(ui("Enter a subject name"));
      return;
    }

    const parsed = parseSubjectList(raw);
    const existing = new Set(subjects.map((s) => s.name.toLowerCase()));
    const fresh: QuickSubject[] = [];
    const skipped: string[] = [];

    for (const item of parsed) {
      const key = item.name.toLowerCase();
      if (existing.has(key)) {
        skipped.push(item.name);
        continue;
      }
      existing.add(key);
      fresh.push({
        key: crypto.randomUUID(),
        name: item.name,
        // A single subject keeps whatever is in the marks box beside it; a
        // pasted list carries its own totals, falling back to the same default.
        totalMarks: parsed.length === 1 ? newSubjectMarks || "100" : item.totalMarks,
      });
    }

    if (fresh.length === 0) {
      toast.error(ui("{0} already added", [skipped.join(", ")]));
      return;
    }

    setSubjects((prev) => [...prev, ...fresh]);
    setNewSubjectName("");
    setNewSubjectMarks("100");
    if (fresh.length > 1) {
      toast.success(ui("Added {0} subjects", [fresh.length]));
    }
    if (skipped.length > 0) {
      toast.info(ui("Skipped {0} — already added", [skipped.join(", ")]));
    }
  };

  /** Inline edit of a subject already in the list. */
  const updateSubject = (key: string, patch: Partial<QuickSubject>) => {
    setSubjects((prev) =>
      prev.map((subject) => (subject.key === key ? { ...subject, ...patch } : subject)),
    );
  };

  /**
   * Removing a chip rewrites the field from the expanded list, so a range
   * typed as "A-D" becomes "A, B, C" rather than silently dropping the range.
   */
  const removeSection = (target: string) => {
    setSectionsInput(
      sectionNames.filter((section) => section !== target).join(", "),
    );
  };

  const removeSubject = (key: string) => {
    setSubjects((prev) => prev.filter((s) => s.key !== key));
  };

  const applyCopySubjects = (classId: string) => {
    const source = (classes || []).find((cls: any) => cls.id === classId);
    if (!source?.subjects?.length) return;
    setSubjects(
      source.subjects.map((subject: any) => ({
        key: crypto.randomUUID(),
        name: subject.name,
        totalMarks: String(subject.totalMarks || 100),
      })),
    );
    setCopyFromClassId(classId);
    toast.success(
      ui(source.subjects.length === 1 ? "Copied {0} subject from {1}" : "Copied {0} subjects from {1}", [source.subjects.length, `${source.name}${source.section ? ` ${source.section}` : ""}`]),
    );
  };

  /* ── Validation ───────────────────────────────────────────────────── */

  /**
   * The name, section and clash rules are enforced live by `blockedReason`,
   * which disables the button and says why — so this is only the last gate
   * before a write, not the place the office first learns something is wrong.
   */
  const validate = (): boolean => {
    if (blockedReason) {
      toast.error(blockedReason);
      return false;
    }
    if (subjects.some((subject) => !subject.name.trim())) {
      toast.error(ui("Every subject needs a name"));
      return false;
    }
    return true;
  };

  /* ── Create ───────────────────────────────────────────────────────── */

  const handleCreate = async () => {
    if (!validate()) return;

    const effectiveSections =
      hasSections && sectionNames.length
        ? sectionNames.map((sectionName) => ({
            name: sectionName,
            teacherId: "",
          }))
        : [{ name: "", teacherId: "" }];

    // 1 bulk class call + every subject per created class.
    const totalOps = 1 + classRowCount * subjects.length;

    setBusy(true);
    setProgress({ done: 0, total: totalOps });
    let completed = 0;
    const tick = (n = 1) => {
      completed += n;
      setProgress({ done: completed, total: totalOps });
    };

    try {
      // -- Wave 1: create class (all sections in one transactional call) --
      const classRes = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          academicYear: Number(academicYear) || new Date().getFullYear(),
          sections: effectiveSections.map((s) => s.name).filter(Boolean),
          teachingMode,
          capacity: capacity.trim() || null,
          ...(useRange ? { gradeRange: { prefix: name.trim(), from: fromGrade, to: toGrade } } : {}),
        }),
      });
      const classResult = await classRes.json();
      if (!classRes.ok)
        throw new Error(classResult.error || "Class could not be created");
      const createdClasses: any[] = Array.isArray(classResult.data)
        ? classResult.data
        : [classResult.data];
      tick();

      // Every created row (grade × section) gets the subject list.
      const plan = createdClasses.map((cls: any) => ({ cls }));

      // -- Wave 2: subjects, in parallel --
      if (subjects.length > 0) {
        const subjectJobs: (() => Promise<void>)[] = [];
        for (const p of plan) {
          if (!p.cls?.id) continue;
          for (const subject of subjects) {
            subjectJobs.push(async () => {
              const res = await fetch("/api/subjects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  classId: p.cls.id,
                  name: subject.name.trim(),
                  totalMarks: Number(subject.totalMarks) || 100,
                }),
              });
              const j = await res.json();
              if (!res.ok)
                throw new Error(
                  j.error || "Subject could not be created",
                );
              tick();
            });
          }
        }
        await runPooled(subjectJobs);
      }

      toast.success(useRange
        ? ui("Created {0} classes, {1} to {2}", [createdClasses.length, classNames[0], classNames[classNames.length - 1]])
        : effectiveSections.length > 1
        ? ui("\"{0}\" created with {1} sections", [name.trim(), effectiveSections.length])
        : effectiveSections[0].name
          ? ui("\"{0}\" created with section {1}", [name.trim(), effectiveSections[0].name])
          : ui("\"{0}\" created with no sections", [name.trim()]));
      onCreated(createdClasses);
      classDraft.markSaved();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Setup could not be completed",
      );
    } finally {
      setBusy(false);
    }
  };

  /* ── Keyboard ─────────────────────────────────────────────────────── */

  /**
   * Cmd/Ctrl + Enter creates, from anywhere in the form.
   *
   * This is a form the office fills in dozens of times at the start of a year;
   * plain Enter cannot submit it because Enter is already how you commit a
   * subject, so the chord is the one that stays out of the way.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      if (busy || blockedReason) return;
      event.preventDefault();
      handleCreate();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });


  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <ModalSurface
      onClose={onClose}
      size="lg"
      // A half-created class should not disappear on a stray backdrop click,
      // and never while the create request is in flight.
      disableBackdropClose={busy}
      dirty={Boolean(name.trim()) && !busy}
      dirtyMessage={ui("This class has not been created yet. Discard it?")}
    >
        <DraftRecovery draft={classDraft} saving={busy} recordLabel={ui("Quick class setup")} excluded={ui("Passwords and server-generated records are never stored in this browser draft.")} />
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-edge/15 bg-brand-50/70 px-6 pt-5 pb-4 sm:px-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-brand-400 to-status-info-text shadow-brand">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-ink-strong">
                  {ui("Quick setup")}
                </h2>
                <p className="text-xs font-medium text-ink-muted">
                  {ui("Create a class, then configure it fully")}
                </p>
              </div>
            </div>
            <IconButton
              label={ui("Close")}
              onClick={onClose}
              disabled={busy}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar sm:p-7">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
            {/* ── LEFT COLUMN: Class Identity ─────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 ps-1">
                <GraduationCap className="h-4 w-4 text-primary" />
                <span className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary">
                  {ui("Class identity")}
                </span>
              </div>

              {/* Class Name */}
              <div className="rounded-3xl border border-edge/25 bg-brand-50/50 p-5">
                <label className="block">
                  <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                    {ui("Class Name")}
                  </span>
                  <SystemInput
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={useRange ? ui("e.g. Grade") : ui("e.g. Grade 8")}
                    autoFocus
                    className="h-14 w-full px-4 transition-all"
                  />
                </label>
                <label className="mt-4 flex min-h-10 cursor-pointer items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-strong">{ui("Create a range of grades")}</span>
                    <span className="mt-1 block text-xs text-ink-muted">{ui("e.g. Grade 1 to Grade 5, each with the same sections")}</span>
                  </span>
                  <Switch checked={useRange} onChange={(event) => setUseRange(event.target.checked)} />
                </label>
                {useRange ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block ps-2 text-2xs font-semibold text-ink-subtle">{ui("From grade")}</span>
                      <SystemInput type="number" inputMode="numeric" min={0} value={gradeFrom} onChange={(e) => setGradeFrom(e.target.value)} className="h-12 w-full px-4" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block ps-2 text-2xs font-semibold text-ink-subtle">{ui("To grade")}</span>
                      <SystemInput type="number" inputMode="numeric" min={0} value={gradeTo} onChange={(e) => setGradeTo(e.target.value)} className="h-12 w-full px-4" />
                    </label>
                  </div>
                ) : null}
              </div>

              {/* Academic Year */}
              <div className="rounded-3xl border border-edge/25 bg-brand-50/50 p-5">
                <label className="block">
                  <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                    {ui("Academic Year")}
                  </span>
                  <SystemInput
                    type="number"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2026"
                    className="h-14 w-full px-4 transition-all"
                  />
                </label>
              </div>

              {/* Capacity (SKAI-148): blank = not set */}
              <div className="rounded-3xl border border-edge/25 bg-brand-50/50 p-5">
                <label className="block">
                  <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                    {ui("Capacity (seats per class)")}
                  </span>
                  <SystemInput
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={200}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder={ui("Optional, e.g. 35")}
                    className="h-14 w-full px-4 transition-all"
                  />
                </label>
              </div>

              {/* Teaching Mode */}
              <div className="rounded-3xl border border-edge/25 bg-brand-50/50 p-5">
                <span className="mb-3 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {ui("Teaching Mode")}
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* One Teacher card */}
                  <SystemButton variant="ghost"
                    type="button"
                    onClick={() => setTeachingMode("SINGLE")}
                    className={cn(
                      "group relative overflow-hidden p-4 text-start",
                      teachingMode === "SINGLE"
                        ? "border-status-info-text bg-card shadow-md"
                        : "border-transparent bg-card/60 hover:border-status-info-text/25 hover:bg-card",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0 start-0 h-full w-1 rounded-e-full transition-all",
                        teachingMode === "SINGLE"
                          ? "bg-status-info-text"
                          : "bg-transparent",
                      )}
                    />
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                          teachingMode === "SINGLE"
                            ? "bg-status-info-surface text-status-info-text"
                            : "bg-surface-subtle text-ink-subtle",
                        )}
                      >
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm font-bold",
                              teachingMode === "SINGLE"
                                ? "text-status-info-text"
                                : "text-ink-strong",
                            )}
                          >
                            {ui("One teacher")}
                          </p>
                          {teachingMode === "SINGLE" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-status-info-text">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-normal leading-relaxed text-ink-muted">
                          {ui("The class teacher takes every subject")}
                        </p>
                      </div>
                    </div>
                  </SystemButton>

                  {/* Teacher Per Subject card */}
                  <SystemButton variant="ghost"
                    type="button"
                    onClick={() => setTeachingMode("SUBJECT")}
                    className={cn(
                      "group relative overflow-hidden p-4 text-start",
                      teachingMode === "SUBJECT"
                        ? "border-status-warning-text bg-card shadow-md"
                        : "border-transparent bg-card/60 hover:border-status-warning-text/25 hover:bg-card",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0 start-0 h-full w-1 rounded-e-full transition-all",
                        teachingMode === "SUBJECT"
                          ? "bg-warning"
                          : "bg-transparent",
                      )}
                    />
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                          teachingMode === "SUBJECT"
                            ? "bg-status-warning-surface text-status-warning-text"
                            : "bg-surface-subtle text-ink-subtle",
                        )}
                      >
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm font-bold",
                              teachingMode === "SUBJECT"
                                ? "text-status-warning-text"
                                : "text-ink-strong",
                            )}
                          >
                            {ui("Teacher per subject")}
                          </p>
                          {teachingMode === "SUBJECT" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-warning">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-normal leading-relaxed text-ink-muted">
                          {ui("Each subject gets its own teacher")}
                        </p>
                      </div>
                    </div>
                  </SystemButton>
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Structure ─────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 ps-1">
                <Layers className="h-4 w-4 text-status-info-text" />
                <span className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-status-info-text">
                  {ui("Structure")}
                </span>
              </div>

              {/* Sections toggle */}
              <div className="rounded-3xl border border-edge/25 bg-brand-50/50 p-5">
                <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-strong">
                      {ui("Has sections?")}
                    </span>
                    <span className="mt-1 block text-xs text-ink-muted">
                      {ui("e.g. Grade 8 - A, Grade 8 - B")}
                    </span>
                  </span>
                  <Switch
                    checked={hasSections}
                    onChange={(event) => setHasSections(event.target.checked)}
                  />
                </label>

                {/* Section names input */}
                {hasSections && (
                  <div className="mt-4">
                    <label className="block">
                      <span className="mb-2 flex items-baseline justify-between gap-2 ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                        <span>{ui("Section names")}</span>
                        <span className="font-bold normal-case tracking-normal text-ink-subtle">
                          {fillNodes(ui("Type {0} for a run"), <code dir="ltr" className="rounded bg-card px-1 font-mono text-2xs text-status-info-text">A-D</code>)}
                        </span>
                      </span>
                      <SystemInput
                        type="text"
                        value={sectionsInput}
                        onChange={(e) => setSectionsInput(e.target.value)}
                        placeholder={ui("A, B, C  ·  or  A-D  ·  or  1-4")}
                        className="h-12 w-full px-4 transition-all"
                      />
                    </label>

                    {/* Live section chips. Each one is the row that will be
                        created, named exactly as it will appear — and a chip
                        that collides with an existing class says so here
                        rather than as a toast after the form is submitted. */}
                    {sectionNames.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sectionNames.map((sec, i) => {
                          const taken = takenSections.has(sec.toLowerCase());
                          const color =
                            SECTION_CHIP_COLORS[
                              i % SECTION_CHIP_COLORS.length
                            ];
                          const chip = (
                            <span
                              key={`${sec}-${i}`}
                              tabIndex={taken ? 0 : undefined}
                              className={cn(
                                "group/chip inline-flex items-center gap-1.5 rounded-full border py-1.5 ps-3 pe-1.5 text-2xs font-bold transition-all",
                                taken
                                  ? "border-status-error-border bg-status-error-surface text-status-error-text line-through decoration-status-error-text/70"
                                  : [color.bg, color.text, color.border],
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full bg-current",
                                  taken ? "opacity-90" : "opacity-50",
                                )}
                              />
                              {name.trim() || ui("Class")} - {sec}
                              <SystemButton variant="ghost"
                                type="button"
                                onClick={() => removeSection(sec)}
                                aria-label={ui("Remove section {0}", [sec])}
                                className="flex items-center justify-center"
                              >
                                <X className="h-2.5 w-2.5" aria-hidden="true" />
                              </SystemButton>
                            </span>
                          );
                          return taken ? (
                            <Tooltip
                              key={`${sec}-${i}`}
                              content={ui("{0} {1} already exists for {2}", [name.trim(), sec, year])}
                            >
                              {chip}
                            </Tooltip>
                          ) : (
                            chip
                          );
                        })}
                      </div>
                    )}

                    {clashingSections.length > 0 && (
                      <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-status-error-surface px-3 py-2 text-2xs font-bold leading-relaxed text-status-error-text">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                        <span>
                          {ui("Struck-through sections already exist for {0}. Remove them, or change the class name or year.", [year])}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Copy subjects from... */}
              {copyableClasses.length > 0 && (
                <div className="rounded-3xl border border-edge/25 bg-brand-50/50 p-5">
                  <label className="block">
                    <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                      {ui("Copy subjects from…")}
                    </span>
                    <div className="relative">
                      <SystemSelect
                        value={copyFromClassId}
                        onChange={(e) => {
                          if (e.target.value) applyCopySubjects(e.target.value);
                        }}
                        className="h-12 w-full cursor-pointer appearance-none px-4 pe-10 transition-all"
                      >
                        <option value="">{ui("Select a class...")}</option>
                        {copyableClasses.map((cls: any) => (
                          <option key={cls.id} value={cls.id}>
                            {ui("{0} ({1} subjects)", [`${cls.name}${cls.section ? ` ${cls.section}` : ""}`, cls.subjects?.length ?? 0])}
                          </option>
                        ))}
                      </SystemSelect>

                    </div>
                  </label>
                </div>
              )}

              {/* Quick-add subjects */}
              <div className="rounded-3xl border border-edge/25 bg-brand-50/50 p-5">
                <span className="mb-3 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {ui("Quick-add subjects")}
                </span>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <SystemInput
                      type="text"
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSubject();
                        }
                      }}
                      placeholder={ui("Subject name — or paste a whole list")}
                      className="h-11 w-full px-3 transition-all"
                    />
                  </div>
                  <div className="w-20">
                    <SystemInput
                      type="number"
                      value={newSubjectMarks}
                      onChange={(e) => setNewSubjectMarks(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSubject();
                        }
                      }}
                      placeholder={ui("Marks")}
                      className="h-11 w-full px-3 text-center transition-all"
                    />
                  </div>
                  <SystemButton variant="default"
                    type="button"
                    onClick={addSubject}
                    className="flex h-11 w-11 shrink-0 items-center justify-center"
                  >
                    <Plus className="h-4 w-4" />
                  </SystemButton>
                </div>

                <p className="mt-2 ps-2 text-xs font-normal leading-relaxed text-ink-subtle">
                  {fillNodes(ui("Paste from a syllabus and it splits itself — {0}"), <span className="font-mono text-primary">{ui("Maths 100, English 75, Science")}</span>)}
                </p>

                {/* Subject chips/pills */}
                {subjects.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {subjects.map((subject, i) => (
                      <div
                        key={subject.key}
                        className="sk-panel group flex items-center justify-between px-4 py-2.5 transition-all hover:border-primary/20 hover:shadow-sm"
                      >
                        {/* Editable in place: a typo in a pasted list used to
                            mean deleting the row and retyping it. */}
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-50 to-brand-100 text-2xs font-bold text-primary">
                            {i + 1}
                          </div>
                          <SystemInput
                            value={subject.name}
                            onChange={(e) => updateSubject(subject.key, { name: e.target.value })}
                            aria-label={ui("Subject {0} name", [i + 1])}
                            className="min-w-0 flex-1 py-1 transition-colors"
                          />
                          <div className="flex shrink-0 items-baseline gap-1">
                            <SystemInput
                              type="number"
                              min="1"
                              value={subject.totalMarks}
                              onChange={(e) => updateSubject(subject.key, { totalMarks: e.target.value })}
                              aria-label={ui("{0} total marks", [subject.name || ui("Subject")])}
                              className="w-12 py-1 text-end tabular-nums transition-colors"
                            />
                            <span className="text-2xs font-bold text-ink-subtle">{ui("marks")}</span>
                          </div>
                        </div>
                        <IconButton
                          label={subject.name ? ui("Remove {0}", [subject.name]) : ui("Remove subject")}
                          onClick={() => removeSubject(subject.key)}
                          className="ms-2"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-edge/30 bg-card/50 px-6 py-8 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100">
                      <BookOpen className="h-5 w-5 text-primary/40" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-ink-strong">
                      {ui("No subjects yet")}
                    </p>
                    <p className="mt-1 text-xs text-ink-subtle">
                      {ui("Add them now or later from the class manager")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-edge/15 bg-brand-50/40 px-6 py-4 sm:px-7">
          {busy ? (
            <div className="flex items-center gap-4">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-bold text-ink-strong">
                    {progress.total > 0
                      ? ui("Creating\u2026 ({0} of {1})", [progress.done, progress.total])
                      : ui("Creating\u2026")}
                  </p>
                  <p className="text-2xs font-semibold tabular-nums text-ink-muted">
                    {Math.round(progressPercent)}%
                  </p>
                </div>
                <Progress value={progressPercent} label={ui("Creating classes")} size="sm" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* ── Build plan ──
                  The form asks for a name, a range and a subject list; what it
                  writes is a specific number of class rows and subject rows.
                  Stating that before the click is the difference between
                  "Create" and "Create 4 classes and 24 subjects". */}
              {blockedReason ? (
                <Alert tone="warning" compact live="off">
                  {blockedReason}
                </Alert>
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border border-edge bg-card px-3.5 py-2.5 text-xs font-medium text-ink-muted tabular-nums">
                  <span className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-primary">
                    {ui("Will create")}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-brand-100 px-2 py-0.5 font-bold text-primary">
                    <Layers className="h-3 w-3" />
                    {ui(classRowCount === 1 ? "{0} class" : "{0} classes", [classRowCount])}
                  </span>
                  {subjects.length > 0 ? (
                    <>
                      <span className="text-ink-subtle">&times;</span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-status-info-surface px-2 py-0.5 font-bold text-status-info-text">
                        <BookOpen className="h-3 w-3" />
                        {ui(subjects.length === 1 ? "{0} subject" : "{0} subjects", [subjects.length])}
                      </span>
                      <span className="text-ink-subtle">=</span>
                      <span className="font-bold text-ink-strong">
                        {ui(subjectRowCount === 1 ? "{0} subject record" : "{0} subject records", [subjectRowCount])}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-subtle">
                      {ui("No subjects yet — you can add them from the class manager")}
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <SystemButton variant="ghost"
                  type="button"
                  onClick={onClose}
                  className="flex h-12 items-center gap-2 px-5 justify-start"
                >
                  {ui("Cancel")}
                </SystemButton>
                <Tooltip content={blockedReason || ui("Create this class (⌘↩)")}>
                <span tabIndex={blockedReason ? 0 : undefined} className="inline-flex">
                <SystemButton variant="default"
                  type="button"
                  onClick={handleCreate}
                  disabled={Boolean(blockedReason)}
                  className="flex h-12 items-center gap-2 px-6 justify-start"
                >
                  <Sparkles className="h-4 w-4" />
                  {classRowCount > 1 ? ui("Create {0} classes", [classRowCount]) : ui("Create and configure")}
                  <kbd className="ms-1 hidden rounded border border-white/25 bg-white/10 px-1.5 py-0.5 text-2xs font-bold sm:inline">
                    &#8984;&#8629;
                  </kbd>
                </SystemButton>
                </span>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
    </ModalSurface>
  );
}
