"use client";

import { Button as SystemButton } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Progress } from "@/components/ui/progress";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  GraduationCap,
  Layers,
  Loader2,
  ListChecks,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { ModalSurface } from "@/components/ui/modal";
import { TeacherPicker, useTeacherAvailability, type PickerTeacher } from "@/components/shared-admin/teacher-picker";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { Textarea as SystemTextarea } from "@/components/ui/textarea";

interface WizardSection {
  key: string;
  name: string;
  teacherId: string;
}

interface WizardSubject {
  key: string;
  name: string;
  totalMarks: string;
  teacherId: string;
  /** Per-section teacher overrides. A section not present here falls back to
   *  `teacherId` (the default that applies to every section). */
  teacherBySection?: Record<string, string>;
  /** Raw textarea contents — parsed into topics only on submit, so typing
   *  (including pressing Enter) is never fought by the controlled value. */
  topicsText: string;
}

const WIZARD_STEPS = [
  { label: "Basics", icon: GraduationCap },
  { label: "Sections", icon: Layers },
  { label: "Subjects", icon: BookOpen },
  { label: "Syllabus", icon: ListChecks },
  { label: "Review", icon: Check },
];

const emptySubject = (): WizardSubject => ({
  key: crypto.randomUUID(),
  name: "",
  totalMarks: "100",
  teacherId: "",
  teacherBySection: {},
  topicsText: "",
});

/** Resolved teacher for a subject in a given section (override wins, else default). */
const resolveSubjectTeacher = (subject: WizardSubject, sectionName: string): string =>
  subject.teacherBySection?.[sectionName] ?? subject.teacherId ?? "";

const parseTopics = (text: string): string[] =>
  text.split("\n").map((t) => t.trim()).filter(Boolean);

/**
 * Run async jobs with bounded concurrency.
 *
 * Setup used to issue one sequential request per section → subject → topic,
 * which is why creating a class felt slow. These run in parallel instead, but
 * capped: the database sits behind a connection pooler, so firing hundreds of
 * writes at once would exhaust it rather than go faster.
 */
async function runPooled<T>(jobs: (() => Promise<T>)[], limit = 6): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      results[index] = await jobs[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

export function CreateClassWizard({
  teachers,
  classes,
  onClose,
  onCreated,
}: {
  teachers: PickerTeacher[];
  classes: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const ui = useUiText();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [teachingMode, setTeachingMode] = useState<"SINGLE" | "SUBJECT">("SINGLE");
  const [hasSections, setHasSections] = useState(true);
  const [sectionsInput, setSectionsInput] = useState("");
  const [sections, setSections] = useState<WizardSection[]>([]);
  const [subjects, setSubjects] = useState<WizardSubject[]>([]);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [copyFromClassId, setCopyFromClassId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const { availability } = useTeacherAvailability();

  const copyableClasses = useMemo(
    () =>
      (classes || [])
        .filter((cls) => (cls.subjects?.length || 0) > 0)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [classes]
  );

  const sectionNames = useMemo(
    () =>
      sectionsInput
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [sectionsInput]
  );

  const syncSectionsFromInput = () => {
    setSections((current) => {
      const next = sectionNames.map((sectionName) => {
        const existing = current.find((s) => s.name === sectionName);
        return existing ?? { key: crypto.randomUUID(), name: sectionName, teacherId: "" };
      });
      return next;
    });
  };

  const updateSection = (key: string, patch: Partial<WizardSection>) => {
    setSections((current) => current.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const updateSubject = (key: string, patch: Partial<WizardSubject>) => {
    setSubjects((current) => current.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const applyCopySubjects = (classId: string) => {
    const source = (classes || []).find((cls) => cls.id === classId);
    if (!source?.subjects?.length) return;
    setSubjects(
      source.subjects.map((subject: any) => ({
        key: crypto.randomUUID(),
        name: subject.name,
        totalMarks: String(subject.totalMarks || 100),
        teacherId: subject.teacher?.id || "",
        topicsText: "",
      }))
    );
    setCopyFromClassId(classId);
    toast.success(source.subjects.length === 1 ? ui("Copied 1 subject from {0}", [[source.name, source.section].filter(Boolean).join(" ")]) : ui("Copied {0} subjects from {1}", [source.subjects.length, [source.name, source.section].filter(Boolean).join(" ")]));
  };

  const validateStep = (target: number): boolean => {
    if (target === 0) {
      if (!name.trim()) {
        toast.error(ui("Class name is required"));
        return false;
      }
    }
    if (target === 1) {
      if (hasSections && sectionNames.length === 0) {
        toast.error(ui("Add at least one section, or choose “No sections”"));
        return false;
      }
      // Catch collisions here rather than mid-create: the API creates one row
      // per section, so a duplicate discovered halfway would leave the earlier
      // sections already created. A sectionless class occupies the "" slot.
      const year = Number(academicYear) || new Date().getFullYear();
      const targets = hasSections ? sectionNames.map((s) => s.toLowerCase()) : [""];
      const clash = (classes || []).filter(
        (cls: any) =>
          (cls.name || "").trim().toLowerCase() === name.trim().toLowerCase() &&
          Number(cls.academicYear) === year &&
          targets.includes((cls.section || "").trim().toLowerCase())
      );
      if (clash.length > 0) {
        toast.error(
          ui("{0} already exists", [clash.map((c: any) => `${c.name}${c.section ? ` ${c.section}` : ""}`).join(", ")])
        );
        return false;
      }
    }
    if (target === 2) {
      const incomplete = subjects.find((s) => !s.name.trim());
      if (incomplete) {
        toast.error(ui("Every subject needs a name"));
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (step === 0) syncSectionsFromInput();
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const jumpTo = (target: number) => {
    if (target > step && !validateStep(step)) return;
    if (target === 1) syncSectionsFromInput();
    setStep(target);
  };

  const handleCreate = async () => {
    if (!validateStep(0) || !validateStep(1) || !validateStep(2) || !validateStep(3)) return;

    const effectiveSections = hasSections && sectionNames.length
      ? sectionNames.map((sectionName) => {
          const existing = sections.find((s) => s.name === sectionName);
          return { name: sectionName, teacherId: existing?.teacherId || "" };
        })
      : [{ name: "", teacherId: "" }];

    const topicCount = subjects.reduce((sum, s) => sum + parseTopics(s.topicsText).length, 0);
    // 1 bulk class call + a teacher patch per section + every subject + every topic.
    const totalOps =
      1 +
      effectiveSections.filter((s) => s.teacherId).length +
      effectiveSections.length * subjects.length +
      effectiveSections.length * topicCount;

    setBusy(true);
    setProgress({ done: 0, total: totalOps });
    let completed = 0;
    const tick = (n = 1) => {
      completed += n;
      setProgress({ done: completed, total: totalOps });
    };

    try {
      // ── Wave 1: every section in ONE transactional call ──────────────
      // The classes API already accepts a `sections` array, so this replaces
      // what used to be one sequential round-trip per section.
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
      if (!classRes.ok) throw new Error(classResult.error || "Class could not be created");
      const createdClasses: any[] = Array.isArray(classResult.data) ? classResult.data : [classResult.data];
      tick();

      // Map each created row back to the section the admin configured.
      const bySection = new Map<string, any>();
      createdClasses.forEach((c) => bySection.set((c.section || "").trim(), c));
      const plan = effectiveSections.map((s) => ({
        ...s,
        cls: bySection.get(s.name.trim()) || createdClasses[0],
      }));

      // ── Wave 2: homeroom teachers, in parallel ───────────────────────
      // Done before subjects exist so SINGLE-mode propagation is a no-op here;
      // the subjects created below already carry the right teacher.
      await runPooled(
        plan.filter((p) => p.teacherId && p.cls?.id).map((p) => async () => {
          const res = await fetch("/api/classes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: p.cls.id, classTeacherId: p.teacherId }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || "Class teacher could not be assigned");
          }
          tick();
        })
      );

      // ── Wave 3: subjects, in parallel ────────────────────────────────
      const subjectJobs: (() => Promise<{ subjectId: string; topics: string[] }>)[] = [];
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
                // In SINGLE mode every subject follows the section's homeroom
                // teacher, so the per-subject picker isn't shown or used.
                teacherId:
                  teachingMode === "SINGLE"
                    ? p.teacherId
                    : resolveSubjectTeacher(subject, p.name) || undefined,
              }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || "Subject could not be created");
            tick();
            return { subjectId: j.data?.id as string, topics: parseTopics(subject.topicsText) };
          });
        }
      }
      const createdSubjects = await runPooled(subjectJobs);

      // ── Wave 4: syllabus topics, in parallel ─────────────────────────
      const topicJobs = createdSubjects.flatMap(({ subjectId, topics }) =>
        topics.map((title) => async () => {
          const res = await fetch(`/api/subjects/${subjectId}/syllabus`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || "Syllabus topic could not be created");
          }
          tick();
        })
      );
      await runPooled(topicJobs);

      toast.success(effectiveSections.length > 1
        ? ui("\"{0}\" created with {1} sections", [name.trim(), effectiveSections.length])
        : effectiveSections[0].name
          ? ui("\"{0}\" created with section {1}", [name.trim(), effectiveSections[0].name])
          : ui("\"{0}\" created with no sections", [name.trim()]));
      onCreated();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Setup could not be completed")));
    } finally {
      setBusy(false);
    }
  };

  const progressPercent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  const sectionCount = hasSections ? (sectionNames.length || Math.max(sections.length, 1)) : 0;

  return (
    <ModalSurface
      onClose={onClose}
      size="md"
      disableBackdropClose={busy}
      dirty={Boolean(name.trim()) && !busy}
      dirtyMessage={ui("This class has not been created yet. Discard it?")}
    >
        {/* Header */}
        <div className="shrink-0 border-b border-edge/15 bg-brand-50/70 px-7 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-400 shadow-brand">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold tabular-nums text-ink-strong">{ui("Create class")}</h2>
                <p className="text-xs font-semibold text-ink-muted">
                  {busy ? ui("Setting up…") : ui("Step {0} of {1}", [step + 1, WIZARD_STEPS.length])}
                </p>
              </div>
            </div>
            <IconButton label={ui("Close")} onClick={onClose} disabled={busy}>
              <X className="h-5 w-5" aria-hidden="true" />
            </IconButton>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {WIZARD_STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <SystemButton variant="ghost"
                  key={s.label}
                  type="button"
                  disabled={busy}
                  onClick={() => jumpTo(i)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 justify-start",
                    isActive
                      ? "bg-primary text-white shadow-brand"
                      : isDone
                        ? "bg-primary/10 text-primary"
                        : "bg-card/60 text-ink-subtle"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{ui(s.label)}</span>
                </SystemButton>
              );
            })}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-edge/20">
            <div
              className={cn("h-full rounded-full transition-all duration-500 ease-out", busy ? "bg-gradient-to-r from-primary to-brand-400" : "bg-gradient-to-r from-primary to-brand-400")}
              style={{ width: busy ? `${progressPercent}%` : `${((step + 1) / WIZARD_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="sk-rise flex-1 overflow-y-auto p-7 custom-scrollbar" style={{ animationDelay: "60ms" }}>
          {step === 0 ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-brand-50/50 p-5 border border-edge/25">
                <label className="block">
                  <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Class Name")}</span>
                  <SystemInput
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={ui("e.g. Grade 8")}
                    className="h-14 w-full px-4 transition-all"
                  />
                </label>
              </div>
              <div className="rounded-3xl bg-brand-50/50 p-5 border border-edge/25">
                <label className="block">
                  <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Academic Year")}</span>
                  <SystemInput
                    type="number"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2026"
                    className="h-14 w-full px-4 transition-all"
                  />
                </label>
              </div>

              {/* Asked up front because it decides whether the later steps ask
                  for one teacher per section or one per subject. */}
              <div className="rounded-3xl bg-brand-50/50 p-5 border border-edge/25">
                <span className="mb-3 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {ui("How will these sections be taught?")}
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {([
                    { mode: "SINGLE" as const, title: "One teacher", copy: "The class teacher takes every subject." },
                    { mode: "SUBJECT" as const, title: "Teacher per subject", copy: "Each subject gets its own teacher." },
                  ]).map((option) => {
                    const active = teachingMode === option.mode;
                    return (
                      <SystemButton variant="ghost"
                        key={option.mode}
                        type="button"
                        onClick={() => setTeachingMode(option.mode)}
                        className={cn(
                          "p-4 text-start",
                          active
                            ? "border-primary bg-card shadow-brand"
                            : "border-transparent bg-card/60 hover:border-primary/25 hover:bg-card"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-sm font-semibold", active ? "text-primary" : "text-ink-strong")}>{ui(option.title)}</p>
                          {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                        </div>
                        <p className="mt-1 text-xs font-normal leading-relaxed text-ink-muted">{ui(option.copy)}</p>
                      </SystemButton>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              {/* Not every school streams a grade into sections — "Grade 5" may
                  simply be one class. That's stored as a single row with no
                  section name. */}
              <div className="rounded-3xl bg-brand-50/50 p-5 border border-edge/25">
                <span className="mb-3 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                  {ui("Does this class have sections?")}
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {([
                    { has: true, title: "Yes, it has sections", copy: "e.g. Grade 8 - A, Grade 8 - B" },
                    { has: false, title: "No sections", copy: "One single class, no A/B split" },
                  ]).map((option) => {
                    const active = hasSections === option.has;
                    return (
                      <SystemButton variant="ghost"
                        key={String(option.has)}
                        type="button"
                        onClick={() => setHasSections(option.has)}
                        className={cn(
                          "p-4 text-start",
                          active
                            ? "border-primary bg-card shadow-brand"
                            : "border-transparent bg-card/60 hover:border-primary/25 hover:bg-card"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-sm font-semibold", active ? "text-primary" : "text-ink-strong")}>{ui(option.title)}</p>
                          {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                        </div>
                        <p className="mt-1 text-xs font-normal leading-relaxed text-ink-muted">{ui(option.copy)}</p>
                      </SystemButton>
                    );
                  })}
                </div>
              </div>

              {!hasSections ? (
                <div className="sk-panel p-5">
                  <p className="mb-3 text-sm font-semibold text-ink-strong">
                    {name.trim() || ui("This class")}
                    {teachingMode === "SINGLE" ? (
                      <span className="ms-2 text-2xs font-bold text-ink-subtle">{ui("Class Teacher")}</span>
                    ) : null}
                  </p>
                  {teachingMode === "SINGLE" ? (
                    <>
                      <TeacherPicker
                        label={ui("Class Teacher")}
                        value={sections[0]?.teacherId || ""}
                        teachers={teachers}
                        availability={availability}
                        assignmentMode="homeroom"
                        onChange={(teacherId) =>
                          setSections([{ key: sections[0]?.key || crypto.randomUUID(), name: "", teacherId }])
                        }
                      />
                      <p className="mt-3 text-xs font-normal leading-relaxed text-ink-muted">
                        {ui("This teacher takes every subject for this class.")}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs font-normal leading-relaxed text-ink-muted">
                      {ui("Subject teachers are assigned in the Subjects step. You can add a homeroom teacher for this class later from the class.")}
                    </p>
                  )}
                  <p className="mt-2 text-xs font-normal leading-relaxed text-ink-muted">
                    {ui("You can split this into sections later — the students and subjects move across with it.")}
                  </p>
                </div>
              ) : (
              <>
              <div className="rounded-3xl bg-brand-50/50 p-5 border border-edge/25">
                <label className="block">
                  <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                    {ui("Sections")}{" "} <span className="text-ink-subtle">{ui("(comma separated)")}</span>
                  </span>
                  <SystemInput
                    type="text"
                    value={sectionsInput}
                    onChange={(e) => setSectionsInput(e.target.value)}
                    onBlur={syncSectionsFromInput}
                    placeholder="A, B, C"
                    className="h-14 w-full px-4 transition-all"
                  />
                </label>
                <p className="mt-2 ps-2 text-xs font-normal text-ink-muted">
                  {teachingMode === "SINGLE"
                    ? ui("Each section becomes its own class row (e.g. Grade 8 - A, Grade 8 - B). Assign the class teacher for each below.")
                    : ui("Each section becomes its own class row (e.g. Grade 8 - A, Grade 8 - B). Subject teachers are assigned in the next step.")}
                </p>
              </div>

              {(sections.length > 0 || sectionNames.length > 0) ? (
                <div className="space-y-3">
                  {sections.map((section) => (
                    <div key={section.key} className="sk-panel p-5">
                      <p className="mb-3 text-sm font-semibold text-ink-strong">
                        {ui("Section {0}", [section.name])}
                        {teachingMode === "SINGLE" ? (
                          <span className="ms-2 text-2xs font-bold text-ink-subtle">{ui("Class Teacher")}</span>
                        ) : null}
                      </p>
                      {teachingMode === "SINGLE" ? (
                        <>
                          <TeacherPicker
                            label={ui("Class Teacher")}
                            value={section.teacherId}
                            teachers={teachers}
                            availability={availability}
                            onChange={(teacherId) => updateSection(section.key, { teacherId })}
                          />
                          <p className="mt-2 text-xs font-normal leading-relaxed text-ink-muted">
                            {ui("This teacher takes every subject for this section.")}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs font-normal leading-relaxed text-ink-muted">
                          {ui("Subject teachers are assigned in the Subjects step. The homeroom teacher can be added later from the class.")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-3xl bg-brand-50/30 p-5 text-xs font-medium text-ink-subtle">
                  {teachingMode === "SINGLE"
                    ? ui("Type section names above — teacher assignment rows appear automatically.")
                    : ui("Type section names above to continue to subject setup.")}
                </p>
              )}
              </>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-brand-50/50 p-5 border border-edge/25">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink-strong">{ui("Subjects")}</p>
                    <p className="mt-1 text-xs font-normal text-ink-muted">
                      {ui(sectionCount === 1 ? "Created once per section ({0} section)." : "Created once per section ({0} sections).", [sectionCount])}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {copyableClasses.length > 0 ? (
                      <SystemSelect
                        value={copyFromClassId}
                        onChange={(e) => applyCopySubjects(e.target.value)}
                        className="cursor-pointer px-3"
                      >
                        <option value="">{ui("Copy subjects from…")}</option>
                        {copyableClasses.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {ui("{0} ({1} subjects)", [`${cls.name}${cls.section ? ` ${cls.section}` : ""}`, cls.subjects?.length ?? 0])}
                          </option>
                        ))}
                      </SystemSelect>
                    ) : null}
                    <SystemButton variant="default"
                      type="button"
                      onClick={() => setSubjects((current) => [...current, emptySubject()])}
                      className="flex items-center gap-1.5 px-3 justify-start"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {ui("Add Subject")}
                    </SystemButton>
                  </div>
                </div>
              </div>

              {subjects.length > 0 ? (
                <div className="space-y-3">
                  {subjects.map((subject, index) => (
                    <div key={subject.key} className="sk-panel p-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-strong">{ui("Subject {0}", [index + 1])}</p>
                          {teachingMode === "SUBJECT" && hasSections && sectionNames.length > 0 ? (
                            <p className="mt-0.5 text-xs font-normal leading-snug text-ink-muted">
                              {ui("Created in every section ({0}): {1}", [sectionNames.length, sectionNames.join(", ")])}
                            </p>
                          ) : null}
                        </div>
                        <IconButton
                          label={ui("Remove {0}", [subject.name.trim() || ui("Subject {0}", [index + 1])])}
                          onClick={() => setSubjects((current) => current.filter((s) => s.key !== subject.key))}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                        <label className="block">
                          <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Subject Name")}</span>
                          <SystemInput
                            type="text"
                            value={subject.name}
                            onChange={(e) => updateSubject(subject.key, { name: e.target.value })}
                            placeholder={ui("e.g. Mathematics")}
                            className="h-12 w-full px-4 transition-all"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block ps-2 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Total Marks")}</span>
                          <SystemInput
                            type="number"
                            value={subject.totalMarks}
                            onChange={(e) => updateSubject(subject.key, { totalMarks: e.target.value })}
                            className="h-12 w-full px-4 transition-all"
                          />
                        </label>
                      </div>
                      {teachingMode === "SUBJECT" ? (
                        <div className="mt-3 space-y-3">
                          <TeacherPicker
                            label={
                              hasSections && sectionNames.length > 1
                                ? "Default teacher (applies to all sections)"
                                : "Subject Teacher (optional)"
                            }
                            value={subject.teacherId}
                            teachers={teachers}
                            availability={availability}
                            onChange={(teacherId) => updateSubject(subject.key, { teacherId })}
                          />
                          {hasSections && sectionNames.length > 1 ? (
                            <div>
                              <SystemButton variant="ghost"
                                type="button"
                                onClick={() =>
                                  setExpandedSubjects((prev) => ({ ...prev, [subject.key]: !prev[subject.key] }))
                                }
                                className="flex items-center gap-1.5 px-2 py-1 justify-start"
                              >
                                {expandedSubjects[subject.key] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3 rtl:rotate-180" aria-hidden="true" />}
                                {expandedSubjects[subject.key] ? ui("Hide per-section teachers") : ui("Assign a different teacher per section")}
                              </SystemButton>
                              {expandedSubjects[subject.key] ? (
                                <div className="mt-3 space-y-3 border-s-2 border-edge/25 ps-3">
                                  {sectionNames.map((sec) => {
                                    const hasOverride = !!subject.teacherBySection?.[sec];
                                    return (
                                      <div key={sec}>
                                        <TeacherPicker
                                          label={ui("Section {0} teacher", [sec])}
                                          value={resolveSubjectTeacher(subject, sec)}
                                          teachers={teachers}
                                          availability={availability}
                                          onChange={(teacherId) => {
                                            const next = { ...(subject.teacherBySection || {}) };
                                            if (teacherId) next[sec] = teacherId;
                                            else delete next[sec];
                                            updateSubject(subject.key, { teacherBySection: next });
                                          }}
                                        />
                                        {hasOverride ? (
                                          <p className="mt-1 ps-1 text-xs font-medium text-primary/70">
                                            {ui("Overrides the default for this section.")}
                                          </p>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-3xl bg-brand-50/30 p-5 text-xs font-medium text-ink-subtle">
                  {ui("No subjects yet — you can skip this and add them later from the class detail view.")}
                </p>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-brand-50/50 p-5 border border-edge/25">
                <p className="text-sm font-semibold text-ink-strong">{ui("Syllabus topics")}</p>
                <p className="mt-1 text-xs font-normal text-ink-muted">
                  {ui("Optional quick-entry — one topic per line. Can always be managed later from the class detail view.")}
                </p>
              </div>
              {subjects.length > 0 ? (
                <div className="space-y-3">
                  {subjects.map((subject, index) => (
                    <div key={subject.key} className="sk-panel p-5">
                      <p className="mb-3 text-sm font-semibold text-ink-strong">{subject.name.trim() || ui("Subject {0}", [index + 1])}</p>
                      <SystemTextarea
                        value={subject.topicsText}
                        onChange={(e) => updateSubject(subject.key, { topicsText: e.target.value })}
                        rows={3}
                        placeholder={ui("One topic per line, e.g.\nReal numbers\nLinear equations\nPerimeter & area")}
                        className="w-full resize-none p-4 transition-all"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-3xl bg-brand-50/30 p-5 text-xs font-medium text-ink-subtle">
                  {ui("No subjects to plan yet — skip this step.")}
                </p>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-gradient-to-br from-brand-50 via-card to-brand-100 border border-edge/25 p-6 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-400 shadow-brand">
                    <GraduationCap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-ink-strong tracking-tight">{name.trim() || ui("Untitled class")}</p>
                    <p className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
                      {ui("Academic year {0} · {1}", [academicYear || new Date().getFullYear(), ui(teachingMode === "SINGLE" ? "One teacher" : "Teacher per subject")])}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sk-panel p-4">
                    <p className="text-3xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Sections")}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-ink-strong">{hasSections ? sectionCount : "—"}</p>
                    <p className="mt-1 text-xs font-normal text-ink-muted">
                      {hasSections
                        ? sections.map((s) => s.name).join(", ")
                        : ui("No sections — single class")}
                    </p>
                  </div>
                  <div className="sk-panel p-4">
                    <p className="text-3xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{hasSections ? ui("Subjects per section") : ui("Subjects")}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-ink-strong">{subjects.length}</p>
                  </div>
                  <div className="sk-panel p-4">
                    <p className="text-3xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Syllabus topics")}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-ink-strong">
                      {subjects.reduce((sum, s) => sum + parseTopics(s.topicsText).length, 0)}
                    </p>
                  </div>
                </div>
              </div>

              {subjects.length > 0 ? (
                <div className="sk-panel p-5">
                  <p className="mb-3 text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">{ui("Subject summary")}</p>
                  <div className="space-y-2">
                    {subjects.map((subject, index) => (
                      <div key={subject.key} className="flex items-center justify-between rounded-2xl bg-brand-50/50 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-strong">{subject.name.trim() || ui("Subject {0}", [index + 1])}</p>
                          <p className="mt-0.5 text-xs font-normal text-ink-muted">
                            {ui(parseTopics(subject.topicsText).length === 1 ? "{0} marks · {1} topic" : "{0} marks · {1} topics", [subject.totalMarks || 100, parseTopics(subject.topicsText).length])}
                          </p>
                        </div>
                        {(() => {
                          const resolved = hasSections && sectionNames.length
                            ? sectionNames.map((s) => resolveSubjectTeacher(subject, s))
                            : [subject.teacherId];
                          const assigned = resolved.filter(Boolean);
                          const unique = Array.from(new Set(assigned));
                          const label =
                            unique.length === 1
                              ? (teachers.find((t) => t.id === unique[0])?.fullName || "Teacher")
                              : assigned.length > 0
                                ? "Varies by section"
                                : "Unassigned";
                          return (
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-1 text-3xs font-bold",
                                unique.length === 1 ? "bg-brand-50 text-primary" : "bg-muted text-ink-muted"
                              )}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-edge/15 bg-brand-50/40 px-7 py-4">
          {busy ? (
            <div className="flex items-center gap-4">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-bold text-ink-strong">
                    {progress.total > 0 ? ui("Creating… ({0} of {1})", [progress.done, progress.total]) : ui("Creating…")}
                  </p>
                  <p className="text-xs font-normal text-ink-muted">{Math.round(progressPercent)}%</p>
                </div>
                <Progress value={progressPercent} label={ui("Creating classes")} size="sm" />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SystemButton variant="ghost"
                type="button"
                onClick={step === 0 ? onClose : goBack}
                className="flex h-12 items-center gap-2 px-4 justify-start"
              >
                {step === 0 ? ui("Cancel") : (
                  <>
                    <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                    {ui("Back")}
                  </>
                )}
              </SystemButton>
              {step < WIZARD_STEPS.length - 1 ? (
                <SystemButton variant="default"
                  type="button"
                  onClick={goNext}
                  className="flex h-12 items-center gap-2 px-6 justify-start"
                >
                  {ui("Next")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </SystemButton>
              ) : (
                <SystemButton variant="default"
                  type="button"
                  onClick={handleCreate}
                  className="flex h-12 items-center gap-2 px-6 justify-start"
                >
                  <Copy className="h-4 w-4" />
                  {ui("Create everything")}
                </SystemButton>
              )}
            </div>
          )}
        </div>
    </ModalSurface>
  );
}
