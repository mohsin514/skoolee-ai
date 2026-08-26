"use client";

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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ModalSurface } from "@/components/ui/modal";
import { TeacherPicker, useTeacherAvailability, type PickerTeacher } from "@/components/shared-admin/teacher-picker";

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
    toast.success(`Copied ${source.subjects.length} subject(s) from ${source.name}${source.section ? ` ${source.section}` : ""}`);
  };

  const validateStep = (target: number): boolean => {
    if (target === 0) {
      if (!name.trim()) {
        toast.error("Class name is required");
        return false;
      }
    }
    if (target === 1) {
      if (hasSections && sectionNames.length === 0) {
        toast.error("Add at least one section, or choose “No sections”");
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
          `${clash.map((c: any) => `${c.name}${c.section ? ` ${c.section}` : ""}`).join(", ")} already exists`
        );
        return false;
      }
    }
    if (target === 2) {
      const incomplete = subjects.find((s) => !s.name.trim());
      if (incomplete) {
        toast.error("Every subject needs a name");
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

      const sectionLabel = effectiveSections.length > 1
        ? `${effectiveSections.length} sections`
        : effectiveSections[0].name || "no sections";
      toast.success(`"${name.trim()}" created with ${sectionLabel}`);
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Setup could not be completed");
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
      dirtyMessage="This class has not been created yet. Discard it?"
    >
        {/* Header */}
        <div className="shrink-0 border-b border-[#cfc2d6]/15 bg-[#fbf0fe]/70 px-7 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[#1f1a23]">Create Class</h2>
                <p className="text-xs font-semibold text-ink-muted">
                  {busy ? "Setting up…" : `Step ${step + 1} of ${WIZARD_STEPS.length}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl p-2 text-ink-subtle transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {WIZARD_STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <button
                  key={s.label}
                  type="button"
                  disabled={busy}
                  onClick={() => jumpTo(i)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                    isActive
                      ? "bg-[#8127cf] text-white shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]"
                      : isDone
                        ? "bg-[#8127cf]/10 text-[#8127cf]"
                        : "bg-white/60 text-ink-subtle"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#cfc2d6]/20">
            <div
              className={cn("h-full rounded-full transition-all duration-500 ease-out", busy ? "bg-gradient-to-r from-[#8127cf] to-[#9c48ea]" : "bg-gradient-to-r from-[#8127cf] to-[#9c48ea]")}
              style={{ width: busy ? `${progressPercent}%` : `${((step + 1) / WIZARD_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="sk-rise flex-1 overflow-y-auto p-7 custom-scrollbar" style={{ animationDelay: "60ms" }}>
          {step === 0 ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-[#fbf0fe]/50 p-5 border border-[#cfc2d6]/25">
                <label className="block">
                  <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">Class Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Grade 8"
                    className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
                  />
                </label>
              </div>
              <div className="rounded-3xl bg-[#fbf0fe]/50 p-5 border border-[#cfc2d6]/25">
                <label className="block">
                  <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">Academic Year</span>
                  <input
                    type="number"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2026"
                    className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
                  />
                </label>
              </div>

              {/* Asked up front because it decides whether the later steps ask
                  for one teacher per section or one per subject. */}
              <div className="rounded-3xl bg-[#fbf0fe]/50 p-5 border border-[#cfc2d6]/25">
                <span className="mb-3 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                  How will these sections be taught?
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {([
                    { mode: "SINGLE" as const, title: "One teacher", copy: "The class teacher takes every subject." },
                    { mode: "SUBJECT" as const, title: "Teacher per subject", copy: "Each subject gets its own teacher." },
                  ]).map((option) => {
                    const active = teachingMode === option.mode;
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        onClick={() => setTeachingMode(option.mode)}
                        className={cn(
                          "rounded-2xl border-2 p-4 text-left transition-all cursor-pointer",
                          active
                            ? "border-[#8127cf] bg-white shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]"
                            : "border-transparent bg-white/60 hover:border-[#8127cf]/25 hover:bg-white"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-sm font-black", active ? "text-[#8127cf]" : "text-[#1f1a23]")}>{option.title}</p>
                          {active ? <Check className="h-4 w-4 shrink-0 text-[#8127cf]" /> : null}
                        </div>
                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-ink-muted">{option.copy}</p>
                      </button>
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
              <div className="rounded-3xl bg-[#fbf0fe]/50 p-5 border border-[#cfc2d6]/25">
                <span className="mb-3 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                  Does this class have sections?
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {([
                    { has: true, title: "Yes, it has sections", copy: "e.g. Grade 8 - A, Grade 8 - B" },
                    { has: false, title: "No sections", copy: "One single class, no A/B split" },
                  ]).map((option) => {
                    const active = hasSections === option.has;
                    return (
                      <button
                        key={String(option.has)}
                        type="button"
                        onClick={() => setHasSections(option.has)}
                        className={cn(
                          "rounded-2xl border-2 p-4 text-left transition-all cursor-pointer",
                          active
                            ? "border-[#8127cf] bg-white shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]"
                            : "border-transparent bg-white/60 hover:border-[#8127cf]/25 hover:bg-white"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-sm font-black", active ? "text-[#8127cf]" : "text-[#1f1a23]")}>{option.title}</p>
                          {active ? <Check className="h-4 w-4 shrink-0 text-[#8127cf]" /> : null}
                        </div>
                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-ink-muted">{option.copy}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {!hasSections ? (
                <div className="rounded-3xl bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                  <p className="mb-3 text-sm font-black text-[#1f1a23]">
                    {name.trim() || "This class"}
                    {teachingMode === "SINGLE" ? (
                      <span className="ml-2 text-[9px] font-bold text-ink-subtle">Class Teacher</span>
                    ) : null}
                  </p>
                  {teachingMode === "SINGLE" ? (
                    <>
                      <TeacherPicker
                        label="Class Teacher"
                        value={sections[0]?.teacherId || ""}
                        teachers={teachers}
                        availability={availability}
                        assignmentMode="homeroom"
                        onChange={(teacherId) =>
                          setSections([{ key: sections[0]?.key || crypto.randomUUID(), name: "", teacherId }])
                        }
                      />
                      <p className="mt-3 text-[10px] font-bold leading-relaxed text-ink-muted">
                        This teacher takes every subject for this class.
                      </p>
                    </>
                  ) : (
                    <p className="text-[10px] font-bold leading-relaxed text-ink-muted">
                      Subject teachers are assigned in the Subjects step. You can add a homeroom teacher for this class later from the class.
                    </p>
                  )}
                  <p className="mt-2 text-[10px] font-bold leading-relaxed text-ink-muted">
                    You can split this into sections later — the students and subjects move across with it.
                  </p>
                </div>
              ) : (
              <>
              <div className="rounded-3xl bg-[#fbf0fe]/50 p-5 border border-[#cfc2d6]/25">
                <label className="block">
                  <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">
                    Sections <span className="text-ink-subtle">(comma separated)</span>
                  </span>
                  <input
                    type="text"
                    value={sectionsInput}
                    onChange={(e) => setSectionsInput(e.target.value)}
                    onBlur={syncSectionsFromInput}
                    placeholder="A, B, C"
                    className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
                  />
                </label>
                <p className="mt-2 pl-2 text-[10px] font-bold text-ink-muted">
                  {teachingMode === "SINGLE"
                    ? "Each section becomes its own class row (e.g. Grade 8 - A, Grade 8 - B). Assign the class teacher for each below."
                    : "Each section becomes its own class row (e.g. Grade 8 - A, Grade 8 - B). Subject teachers are assigned in the next step."}
                </p>
              </div>

              {(sections.length > 0 || sectionNames.length > 0) ? (
                <div className="space-y-3">
                  {sections.map((section) => (
                    <div key={section.key} className="rounded-3xl bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                      <p className="mb-3 text-sm font-black text-[#1f1a23]">
                        Section {section.name}
                        {teachingMode === "SINGLE" ? (
                          <span className="ml-2 text-[9px] font-bold text-ink-subtle">Class Teacher</span>
                        ) : null}
                      </p>
                      {teachingMode === "SINGLE" ? (
                        <>
                          <TeacherPicker
                            label="Class Teacher"
                            value={section.teacherId}
                            teachers={teachers}
                            availability={availability}
                            onChange={(teacherId) => updateSection(section.key, { teacherId })}
                          />
                          <p className="mt-2 text-[10px] font-bold leading-relaxed text-ink-muted">
                            This teacher takes every subject for this section.
                          </p>
                        </>
                      ) : (
                        <p className="text-[10px] font-bold leading-relaxed text-ink-muted">
                          Subject teachers are assigned in the Subjects step. The homeroom teacher can be added later from the class.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-3xl bg-[#fbf0fe]/30 p-5 text-xs font-bold text-ink-subtle">
                  {teachingMode === "SINGLE"
                    ? "Type section names above — teacher assignment rows appear automatically."
                    : "Type section names above to continue to subject setup."}
                </p>
              )}
              </>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-[#fbf0fe]/50 p-5 border border-[#cfc2d6]/25">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-[#1f1a23]">Subjects</p>
                    <p className="mt-1 text-[10px] font-bold text-ink-muted">
                      Created once per section ({sectionCount} section{sectionCount !== 1 ? "s" : ""}).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {copyableClasses.length > 0 ? (
                      <select
                        value={copyFromClassId}
                        onChange={(e) => applyCopySubjects(e.target.value)}
                        className="h-10 cursor-pointer rounded-xl border border-[#cfc2d6]/25 bg-white px-3 text-[10px] font-black text-[#8127cf] outline-none"
                      >
                        <option value="">Copy subjects from…</option>
                        {copyableClasses.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}{cls.section ? ` ${cls.section}` : ""} ({cls.subjects?.length} subjects)
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSubjects((current) => [...current, emptySubject()])}
                      className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[#8127cf] px-3 text-[10px] font-black text-white transition-all hover:bg-[#9c48ea] active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Subject
                    </button>
                  </div>
                </div>
              </div>

              {subjects.length > 0 ? (
                <div className="space-y-3">
                  {subjects.map((subject, index) => (
                    <div key={subject.key} className="rounded-3xl bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-[#1f1a23]">Subject {index + 1}</p>
                          {teachingMode === "SUBJECT" && hasSections && sectionNames.length > 0 ? (
                            <p className="mt-0.5 text-[10px] font-bold leading-snug text-ink-muted">
                              Created in every section ({sectionNames.length}): {sectionNames.join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSubjects((current) => current.filter((s) => s.key !== subject.key))}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-all hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                        <label className="block">
                          <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">Subject Name</span>
                          <input
                            type="text"
                            value={subject.name}
                            onChange={(e) => updateSubject(subject.key, { name: e.target.value })}
                            placeholder="e.g. Mathematics"
                            className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/40 focus:bg-white"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle">Total Marks</span>
                          <input
                            type="number"
                            value={subject.totalMarks}
                            onChange={(e) => updateSubject(subject.key, { totalMarks: e.target.value })}
                            className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all focus:border-[#8127cf]/40 focus:bg-white"
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
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSubjects((prev) => ({ ...prev, [subject.key]: !prev[subject.key] }))
                                }
                                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-black text-[#8127cf] transition-colors hover:bg-[#fbf0fe] cursor-pointer"
                              >
                                {expandedSubjects[subject.key] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                {expandedSubjects[subject.key] ? "Hide per-section teachers" : "Assign a different teacher per section"}
                              </button>
                              {expandedSubjects[subject.key] ? (
                                <div className="mt-3 space-y-3 border-l-2 border-[#cfc2d6]/25 pl-3">
                                  {sectionNames.map((sec) => {
                                    const hasOverride = !!subject.teacherBySection?.[sec];
                                    return (
                                      <div key={sec}>
                                        <TeacherPicker
                                          label={`Section ${sec} teacher`}
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
                                          <p className="mt-1 pl-1 text-[9px] font-bold text-[#8127cf]/70">
                                            Overrides the default for this section.
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
                <p className="rounded-3xl bg-[#fbf0fe]/30 p-5 text-xs font-bold text-ink-subtle">
                  No subjects yet — you can skip this and add them later from the class detail view.
                </p>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-[#fbf0fe]/50 p-5 border border-[#cfc2d6]/25">
                <p className="text-sm font-black text-[#1f1a23]">Syllabus Topics</p>
                <p className="mt-1 text-[10px] font-bold text-ink-muted">
                  Optional quick-entry — one topic per line. Can always be managed later from the class detail view.
                </p>
              </div>
              {subjects.length > 0 ? (
                <div className="space-y-3">
                  {subjects.map((subject, index) => (
                    <div key={subject.key} className="rounded-3xl bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                      <p className="mb-3 text-sm font-black text-[#1f1a23]">{subject.name.trim() || `Subject ${index + 1}`}</p>
                      <textarea
                        value={subject.topicsText}
                        onChange={(e) => updateSubject(subject.key, { topicsText: e.target.value })}
                        rows={3}
                        placeholder={"One topic per line, e.g.\nReal numbers\nLinear equations\nPerimeter & area"}
                        className="w-full resize-none rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/40 p-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/40 focus:bg-white"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-3xl bg-[#fbf0fe]/30 p-5 text-xs font-bold text-ink-subtle">
                  No subjects to plan yet — skip this step.
                </p>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border border-[#cfc2d6]/25 p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-[0_8px_22px_-4px_rgba(129,39,207,0.32)]">
                    <GraduationCap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-lg font-black text-[#1f1a23] tracking-tight">{name.trim() || "Untitled Class"}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
                      Academic Year {academicYear || new Date().getFullYear()} · {teachingMode === "SINGLE" ? "One teacher" : "Teacher per subject"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white border border-[#cfc2d6]/25 p-4">
                    <p className="text-[8px] font-black uppercase tracking-wider text-ink-subtle">Sections</p>
                    <p className="mt-1 text-xl font-black text-[#1f1a23]">{hasSections ? sectionCount : "—"}</p>
                    <p className="mt-1 text-[9px] font-bold text-ink-muted">
                      {hasSections
                        ? sections.map((s) => s.name).join(", ")
                        : "No sections — single class"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white border border-[#cfc2d6]/25 p-4">
                    <p className="text-[8px] font-black uppercase tracking-wider text-ink-subtle">{hasSections ? "Subjects per section" : "Subjects"}</p>
                    <p className="mt-1 text-xl font-black text-[#1f1a23]">{subjects.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white border border-[#cfc2d6]/25 p-4">
                    <p className="text-[8px] font-black uppercase tracking-wider text-ink-subtle">Syllabus topics</p>
                    <p className="mt-1 text-xl font-black text-[#1f1a23]">
                      {subjects.reduce((sum, s) => sum + parseTopics(s.topicsText).length, 0)}
                    </p>
                  </div>
                </div>
              </div>

              {subjects.length > 0 ? (
                <div className="rounded-3xl bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                  <p className="mb-3 text-[9px] font-black uppercase tracking-wider text-ink-subtle">Subject summary</p>
                  <div className="space-y-2">
                    {subjects.map((subject, index) => (
                      <div key={subject.key} className="flex items-center justify-between rounded-2xl bg-[#fbf0fe]/50 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#1f1a23]">{subject.name.trim() || `Subject ${index + 1}`}</p>
                          <p className="mt-0.5 text-[9px] font-bold text-ink-muted">
                            {subject.totalMarks || 100} marks · {parseTopics(subject.topicsText).length} topic{parseTopics(subject.topicsText).length !== 1 ? "s" : ""}
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
                                "rounded-full px-2.5 py-1 text-[8px] font-black",
                                unique.length === 1 ? "bg-[#fbf0fe] text-[#8127cf]" : "bg-[#f3f4f9] text-ink-muted"
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
        <div className="shrink-0 border-t border-[#cfc2d6]/15 bg-[#fbf0fe]/40 px-7 py-4">
          {busy ? (
            <div className="flex items-center gap-4">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#8127cf]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-black text-[#1f1a23]">
                    {progress.total > 0 ? `Creating… (${progress.done} of ${progress.total})` : "Creating…"}
                  </p>
                  <p className="text-[10px] font-bold text-ink-muted">{Math.round(progressPercent)}%</p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#cfc2d6]/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={step === 0 ? onClose : goBack}
                className="flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-ink transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
              >
                {step === 0 ? "Cancel" : (
                  <>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </>
                )}
              </button>
              {step < WIZARD_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] px-6 text-sm font-black text-white shadow-[0_10px_26px_-8px_rgba(129,39,207,0.45)] transition-all hover:shadow-[0_16px_38px_-10px_rgba(129,39,207,0.58)] active:scale-[0.98]"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  className="flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] px-6 text-sm font-black text-white shadow-[0_10px_26px_-8px_rgba(129,39,207,0.45)] transition-all hover:shadow-[0_16px_38px_-10px_rgba(129,39,207,0.58)] active:scale-[0.98]"
                >
                  <Copy className="h-4 w-4" />
                  Create Everything
                </button>
              )}
            </div>
          )}
        </div>
    </ModalSurface>
  );
}