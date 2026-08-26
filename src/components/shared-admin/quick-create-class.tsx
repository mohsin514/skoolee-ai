"use client";

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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ModalSurface } from "@/components/ui/modal";
import { parseSections, parseSubjectList } from "@/lib/class-sections";
import {
  TeacherPicker,
  useTeacherAvailability,
  type PickerTeacher,
} from "@/components/shared-admin/teacher-picker";

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

const SECTION_CHIP_COLORS = [
  { bg: "bg-[#ccfbf1]", text: "text-[#0d9488]", border: "border-[#0d9488]/20" },
  { bg: "bg-[#fef3c7]", text: "text-[#b45309]", border: "border-[#f59e0b]/20" },
  { bg: "bg-[#fff1f2]", text: "text-[#e11d48]", border: "border-[#f43f5e]/20" },
  { bg: "bg-[#f3eeff]", text: "text-[#7c3aed]", border: "border-[#8127cf]/20" },
  { bg: "bg-[#dbeafe]", text: "text-[#2563eb]", border: "border-[#3b82f6]/20" },
  { bg: "bg-[#fce7f3]", text: "text-[#be185d]", border: "border-[#ec4899]/20" },
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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

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
  const takenSections = useMemo(() => {
    const target = name.trim().toLowerCase();
    const taken = new Set<string>();
    if (!target) return taken;
    for (const cls of classes || []) {
      if ((cls.name || "").trim().toLowerCase() !== target) continue;
      if (Number(cls.academicYear) !== year) continue;
      taken.add((cls.section || "").trim().toLowerCase());
    }
    return taken;
  }, [classes, name, year]);

  const clashingSections = useMemo(
    () =>
      hasSections
        ? sectionNames.filter((section) => takenSections.has(section.toLowerCase()))
        : takenSections.has("")
          ? ["\u2014"]
          : [],
    [hasSections, sectionNames, takenSections],
  );

  /* What pressing Create will actually write. Sections become class rows; every
     subject is created once per section. */
  const classRowCount = hasSections ? sectionNames.length : 1;
  const subjectRowCount = classRowCount * subjects.length;

  /**
   * Everything standing between the form and a successful create, said before
   * the click rather than as a toast after it.
   */
  const blockedReason = !name.trim()
    ? "Name the class to continue."
    : hasSections && sectionNames.length === 0
      ? "Add at least one section, or turn sections off."
      : clashingSections.length > 0
        ? hasSections
          ? `${name.trim()} ${clashingSections.join(", ")} already exist${clashingSections.length === 1 ? "s" : ""} for ${year}.`
          : `${name.trim()} already exists for ${year}.`
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
      toast.error("Enter a subject name");
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
      toast.error(`${skipped.join(", ")} already added`);
      return;
    }

    setSubjects((prev) => [...prev, ...fresh]);
    setNewSubjectName("");
    setNewSubjectMarks("100");
    if (fresh.length > 1) {
      toast.success(`Added ${fresh.length} subjects`);
    }
    if (skipped.length > 0) {
      toast.info(`Skipped ${skipped.join(", ")} — already added`);
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
      `Copied ${source.subjects.length} subject(s) from ${source.name}${source.section ? ` ${source.section}` : ""}`,
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
      toast.error("Every subject needs a name");
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

    // 1 bulk class call + every subject per section.
    const totalOps = 1 + effectiveSections.length * subjects.length;

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
        }),
      });
      const classResult = await classRes.json();
      if (!classRes.ok)
        throw new Error(classResult.error || "Class could not be created");
      const createdClasses: any[] = Array.isArray(classResult.data)
        ? classResult.data
        : [classResult.data];
      tick();

      // Map each created row back to the section.
      const plan = effectiveSections.map((s) => ({
        ...s,
        cls:
          createdClasses.find(
            (c: any) => (c.section || "").trim() === s.name.trim(),
          ) || createdClasses[0],
      }));

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

      const sectionLabel =
        effectiveSections.length > 1
          ? `${effectiveSections.length} sections`
          : effectiveSections[0].name || "no sections";
      toast.success(`"${name.trim()}" created with ${sectionLabel}`);
      onCreated(createdClasses);
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
      dirtyMessage="This class has not been created yet. Discard it?"
    >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-[#cfc2d6]/15 bg-[#fbf0fe]/70 px-6 pt-5 pb-4 sm:px-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] via-[#9c48ea] to-[#14b8a6] shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[#1f1a23]">
                  Quick Setup
                </h2>
                <p className="text-[10px] font-bold text-ink-muted">
                  Create a class, then configure it fully
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="cursor-pointer rounded-xl p-2 text-ink-subtle transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar sm:p-7">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
            {/* ── LEFT COLUMN: Class Identity ─────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pl-1">
                <GraduationCap className="h-4 w-4 text-[#8127cf]" />
                <span className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
                  Class Identity
                </span>
              </div>

              {/* Class Name */}
              <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                <label className="block">
                  <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                    Class Name
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Grade 8"
                    autoFocus
                    className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-base font-black text-[#1f1a23] outline-none transition-all placeholder:font-bold placeholder:text-ink-subtle focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
                  />
                </label>
              </div>

              {/* Academic Year */}
              <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                <label className="block">
                  <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                    Academic Year
                  </span>
                  <input
                    type="number"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2026"
                    className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
                  />
                </label>
              </div>

              {/* Teaching Mode */}
              <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                <span className="mb-3 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                  Teaching Mode
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* One Teacher card */}
                  <button
                    type="button"
                    onClick={() => setTeachingMode("SINGLE")}
                    className={cn(
                      "group relative cursor-pointer overflow-hidden rounded-2xl border-2 p-4 text-left transition-all",
                      teachingMode === "SINGLE"
                        ? "border-[#0d9488] bg-white shadow-[0_0_0_1px_rgba(13,148,136,0.1),0_8px_22px_-4px_rgba(13,148,136,0.18)]"
                        : "border-transparent bg-white/60 hover:border-[#0d9488]/25 hover:bg-white",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0 left-0 h-full w-1 rounded-r-full transition-all",
                        teachingMode === "SINGLE"
                          ? "bg-[#0d9488]"
                          : "bg-transparent",
                      )}
                    />
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                          teachingMode === "SINGLE"
                            ? "bg-[#ccfbf1] text-[#0d9488]"
                            : "bg-[#f3f4f6] text-ink-subtle",
                        )}
                      >
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm font-black",
                              teachingMode === "SINGLE"
                                ? "text-[#0d9488]"
                                : "text-[#1f1a23]",
                            )}
                          >
                            One teacher
                          </p>
                          {teachingMode === "SINGLE" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0d9488]">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-ink-muted">
                          The class teacher takes every subject
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Teacher Per Subject card */}
                  <button
                    type="button"
                    onClick={() => setTeachingMode("SUBJECT")}
                    className={cn(
                      "group relative cursor-pointer overflow-hidden rounded-2xl border-2 p-4 text-left transition-all",
                      teachingMode === "SUBJECT"
                        ? "border-[#f59e0b] bg-white shadow-[0_0_0_1px_rgba(245,158,11,0.1),0_8px_22px_-4px_rgba(245,158,11,0.18)]"
                        : "border-transparent bg-white/60 hover:border-[#f59e0b]/25 hover:bg-white",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0 left-0 h-full w-1 rounded-r-full transition-all",
                        teachingMode === "SUBJECT"
                          ? "bg-[#f59e0b]"
                          : "bg-transparent",
                      )}
                    />
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                          teachingMode === "SUBJECT"
                            ? "bg-[#fef3c7] text-[#b45309]"
                            : "bg-[#f3f4f6] text-ink-subtle",
                        )}
                      >
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm font-black",
                              teachingMode === "SUBJECT"
                                ? "text-[#b45309]"
                                : "text-[#1f1a23]",
                            )}
                          >
                            Teacher per subject
                          </p>
                          {teachingMode === "SUBJECT" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f59e0b]">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-ink-muted">
                          Each subject gets its own teacher
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Structure ─────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pl-1">
                <Layers className="h-4 w-4 text-[#0d9488]" />
                <span className="text-[9px] font-black uppercase tracking-wider text-[#0d9488]">
                  Structure
                </span>
              </div>

              {/* Sections toggle */}
              <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                      Has Sections?
                    </span>
                    <p className="mt-1 text-[10px] font-bold text-ink-muted">
                      e.g. Grade 8 - A, Grade 8 - B
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHasSections(!hasSections)}
                    className={cn(
                      "relative h-7 w-12 cursor-pointer rounded-full transition-all duration-300",
                      hasSections
                        ? "bg-[#0d9488] shadow-[0_0_12px_rgba(13,148,136,0.3)]"
                        : "bg-[#cfc2d6]/40",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-300",
                        hasSections ? "left-[22px]" : "left-0.5",
                      )}
                    />
                  </button>
                </div>

                {/* Section names input */}
                {hasSections && (
                  <div className="mt-4">
                    <label className="block">
                      <span className="mb-2 flex items-baseline justify-between gap-2 pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                        <span>Section Names</span>
                        <span className="font-bold normal-case tracking-normal text-ink-subtle">
                          Type <code className="rounded bg-white px-1 font-mono text-[10px] text-[#0d9488]">A-D</code> for a run
                        </span>
                      </span>
                      <input
                        type="text"
                        value={sectionsInput}
                        onChange={(e) => setSectionsInput(e.target.value)}
                        placeholder="A, B, C  ·  or  A-D  ·  or  1-4"
                        className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#0d9488]/40 focus:shadow-[0_0_0_3px_rgba(13,148,136,0.08)]"
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
                          return (
                            <span
                              key={`${sec}-${i}`}
                              title={
                                taken
                                  ? `${name.trim()} ${sec} already exists for ${year}`
                                  : undefined
                              }
                              className={cn(
                                "group/chip inline-flex items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-1.5 text-[10px] font-black transition-all",
                                taken
                                  ? "border-rose-300 bg-rose-50 text-rose-600 line-through decoration-rose-400/70"
                                  : [color.bg, color.text, color.border],
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full bg-current",
                                  taken ? "opacity-90" : "opacity-50",
                                )}
                              />
                              {name.trim() || "Class"} - {sec}
                              <button
                                type="button"
                                onClick={() => removeSection(sec)}
                                aria-label={`Remove section ${sec}`}
                                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full opacity-40 transition-all hover:bg-black/10 hover:opacity-100"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {clashingSections.length > 0 && (
                      <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-rose-600">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                        <span>
                          Struck-through sections already exist for {year}. Remove them, or
                          change the class name or year.
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Copy subjects from... */}
              {copyableClasses.length > 0 && (
                <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                  <label className="block">
                    <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                      Copy Subjects From...
                    </span>
                    <div className="relative">
                      <select
                        value={copyFromClassId}
                        onChange={(e) => {
                          if (e.target.value) applyCopySubjects(e.target.value);
                        }}
                        className="h-12 w-full cursor-pointer appearance-none rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 pr-10 text-sm font-bold text-[#1f1a23] outline-none transition-all focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
                      >
                        <option value="">Select a class...</option>
                        {copyableClasses.map((cls: any) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}
                            {cls.section ? ` ${cls.section}` : ""} (
                            {cls.subjects?.length} subjects)
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                    </div>
                  </label>
                </div>
              )}

              {/* Quick-add subjects */}
              <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                <span className="mb-3 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                  Quick-Add Subjects
                </span>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSubject();
                        }
                      }}
                      placeholder="Subject name — or paste a whole list"
                      className="h-11 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
                    />
                  </div>
                  <div className="w-20">
                    <input
                      type="number"
                      value={newSubjectMarks}
                      onChange={(e) => setNewSubjectMarks(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSubject();
                        }
                      }}
                      placeholder="Marks"
                      className="h-11 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-3 text-center text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/40"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addSubject}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-[#8127cf] text-white transition-all hover:bg-[#9c48ea] active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 pl-2 text-[10px] font-bold leading-relaxed text-ink-subtle">
                  Paste from a syllabus and it splits itself —{" "}
                  <span className="font-mono text-[#8127cf]">Maths 100, English 75, Science</span>
                </p>

                {/* Subject chips/pills */}
                {subjects.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {subjects.map((subject, i) => (
                      <div
                        key={subject.key}
                        className="group flex items-center justify-between rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-2.5 transition-all hover:border-[#8127cf]/20 hover:shadow-[0_4px_12px_-4px_rgba(129,39,207,0.12)]"
                      >
                        {/* Editable in place: a typo in a pasted list used to
                            mean deleting the row and retyping it. */}
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[10px] font-black text-[#8127cf]">
                            {i + 1}
                          </div>
                          <input
                            value={subject.name}
                            onChange={(e) => updateSubject(subject.key, { name: e.target.value })}
                            aria-label={`Subject ${i + 1} name`}
                            className="min-w-0 flex-1 rounded-lg bg-transparent py-1 text-sm font-black text-[#1f1a23] outline-none transition-colors hover:bg-[#fbf0fe]/60 focus:bg-[#fbf0fe] focus:px-2"
                          />
                          <div className="flex shrink-0 items-baseline gap-1">
                            <input
                              type="number"
                              min="1"
                              value={subject.totalMarks}
                              onChange={(e) => updateSubject(subject.key, { totalMarks: e.target.value })}
                              aria-label={`${subject.name || "Subject"} total marks`}
                              className="w-12 rounded-lg bg-transparent py-1 text-right text-xs font-black text-ink-muted outline-none transition-colors hover:bg-[#fbf0fe]/60 focus:bg-[#fbf0fe]"
                            />
                            <span className="text-[9px] font-bold text-ink-subtle">marks</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSubject(subject.key)}
                          className="ml-2 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-subtle opacity-60 transition-all hover:bg-[#fff1f2] hover:text-[#f43f5e] focus-visible:opacity-100 group-hover:opacity-100 sm:opacity-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#cfc2d6]/30 bg-white/50 px-6 py-8 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff]">
                      <BookOpen className="h-5 w-5 text-[#8127cf]/40" />
                    </div>
                    <p className="mt-3 text-xs font-black text-ink-subtle">
                      No subjects yet
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-ink-subtle">
                      Add them now or later from the class manager
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-[#cfc2d6]/15 bg-[#fbf0fe]/40 px-6 py-4 sm:px-7">
          {busy ? (
            <div className="flex items-center gap-4">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#8127cf]" />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-black text-[#1f1a23]">
                    {progress.total > 0
                      ? `Creating... (${progress.done} of ${progress.total})`
                      : "Creating..."}
                  </p>
                  <p className="text-[10px] font-bold text-ink-muted">
                    {Math.round(progressPercent)}%
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#cfc2d6]/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#14b8a6] transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
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
                <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[11px] font-bold leading-relaxed text-amber-800">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  {blockedReason}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl bg-white px-3.5 py-2.5 text-[11px] font-bold text-ink-muted">
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
                    Will create
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[#f3eeff] px-2 py-0.5 font-black text-[#8127cf]">
                    <Layers className="h-3 w-3" />
                    {classRowCount} class{classRowCount === 1 ? "" : "es"}
                  </span>
                  {subjects.length > 0 ? (
                    <>
                      <span className="text-ink-subtle">&times;</span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[#ccfbf1] px-2 py-0.5 font-black text-[#0d9488]">
                        <BookOpen className="h-3 w-3" />
                        {subjects.length} subject{subjects.length === 1 ? "" : "s"}
                      </span>
                      <span className="text-ink-subtle">=</span>
                      <span className="font-black text-[#1f1a23]">
                        {subjectRowCount} subject record{subjectRowCount === 1 ? "" : "s"}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-subtle">
                      no subjects yet &mdash; you can add them from the class manager
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-ink transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={Boolean(blockedReason)}
                  title={blockedReason || "Create this class (\u2318\u21A9)"}
                  className="flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] px-6 text-sm font-black text-white shadow-[0_10px_26px_-8px_rgba(129,39,207,0.45)] transition-all hover:shadow-[0_16px_38px_-10px_rgba(129,39,207,0.58)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  {classRowCount > 1 ? `Create ${classRowCount} Classes` : "Create & Configure"}
                  <kbd className="ml-1 hidden rounded border border-white/25 bg-white/10 px-1.5 py-0.5 text-[9px] font-black sm:inline">
                    &#8984;&#8629;
                  </kbd>
                </button>
              </div>
            </div>
          )}
        </div>
    </ModalSurface>
  );
}
