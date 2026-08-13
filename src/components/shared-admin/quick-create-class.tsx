"use client";

import { useEffect, useMemo, useState } from "react";
import {
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

  const sectionNames = useMemo(
    () =>
      sectionsInput
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [sectionsInput],
  );

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

  const addSubject = () => {
    const trimmed = newSubjectName.trim();
    if (!trimmed) {
      toast.error("Enter a subject name");
      return;
    }
    if (subjects.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`"${trimmed}" is already added`);
      return;
    }
    setSubjects((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        name: trimmed,
        totalMarks: newSubjectMarks || "100",
      },
    ]);
    setNewSubjectName("");
    setNewSubjectMarks("100");
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

  const validate = (): boolean => {
    if (!name.trim()) {
      toast.error("Class name is required");
      return false;
    }

    if (hasSections && sectionNames.length === 0) {
      toast.error("Add at least one section name, or turn off sections");
      return false;
    }

    // Catch collisions: the API creates one row per section, so a duplicate
    // discovered halfway would leave earlier sections already created.
    const year = Number(academicYear) || new Date().getFullYear();
    const targets = hasSections
      ? sectionNames.map((s) => s.toLowerCase())
      : [""];
    const clash = (classes || []).filter(
      (cls: any) =>
        (cls.name || "").trim().toLowerCase() === name.trim().toLowerCase() &&
        Number(cls.academicYear) === year &&
        targets.includes((cls.section || "").trim().toLowerCase()),
    );
    if (clash.length > 0) {
      toast.error(
        `${clash
          .map(
            (c: any) =>
              `${c.name}${c.section ? ` ${c.section}` : ""}`,
          )
          .join(", ")} already exists`,
      );
      return false;
    }

    // Check for duplicate section names
    const lowerSections = sectionNames.map((s) => s.toLowerCase());
    const dupes = lowerSections.filter(
      (s, i) => lowerSections.indexOf(s) !== i,
    );
    if (dupes.length > 0) {
      toast.error(`Duplicate section names: ${[...new Set(dupes)].join(", ")}`);
      return false;
    }

    const incomplete = subjects.find((s) => !s.name.trim());
    if (incomplete) {
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, busy]);

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div
      className="animate-backdrop-enter fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 p-4 backdrop-blur-md sm:p-5"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="animate-modal-enter flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[34px] border border-[#cfc2d6]/20 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)]"
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
                <p className="text-[10px] font-bold text-[#4d4354]/55">
                  Create a class, then configure it fully
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="cursor-pointer rounded-xl p-2 text-[#4d4354]/45 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
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
                  <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                    Class Name
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Grade 8"
                    autoFocus
                    className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-base font-black text-[#1f1a23] outline-none transition-all placeholder:font-bold placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
                  />
                </label>
              </div>

              {/* Academic Year */}
              <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                <label className="block">
                  <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                    Academic Year
                  </span>
                  <input
                    type="number"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2026"
                    className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
                  />
                </label>
              </div>

              {/* Teaching Mode */}
              <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                <span className="mb-3 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
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
                            : "bg-[#f3f4f6] text-[#4d4354]/40",
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
                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-[#4d4354]/50">
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
                            : "bg-[#f3f4f6] text-[#4d4354]/40",
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
                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-[#4d4354]/50">
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
                    <span className="block text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                      Has Sections?
                    </span>
                    <p className="mt-1 text-[10px] font-bold text-[#4d4354]/50">
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
                      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                        Section Names{" "}
                        <span className="text-[#4d4354]/30">
                          (comma separated)
                        </span>
                      </span>
                      <input
                        type="text"
                        value={sectionsInput}
                        onChange={(e) => setSectionsInput(e.target.value)}
                        placeholder="A, B, C"
                        className="h-12 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-[#4d4354]/30 focus:border-[#0d9488]/40 focus:shadow-[0_0_0_3px_rgba(13,148,136,0.08)]"
                      />
                    </label>

                    {/* Live section chips */}
                    {sectionNames.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sectionNames.map((sec, i) => {
                          const color =
                            SECTION_CHIP_COLORS[
                              i % SECTION_CHIP_COLORS.length
                            ];
                          return (
                            <span
                              key={`${sec}-${i}`}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black transition-all",
                                color.bg,
                                color.text,
                                color.border,
                              )}
                              style={{
                                animationDelay: `${i * 40}ms`,
                              }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                              {name.trim() || "Class"} - {sec}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Copy subjects from... */}
              {copyableClasses.length > 0 && (
                <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                  <label className="block">
                    <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
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
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4d4354]/30" />
                    </div>
                  </label>
                </div>
              )}

              {/* Quick-add subjects */}
              <div className="rounded-3xl border border-[#cfc2d6]/25 bg-[#fbf0fe]/50 p-5">
                <span className="mb-3 block pl-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
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
                      placeholder="Subject name"
                      className="h-11 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/40 focus:shadow-[0_0_0_3px_rgba(129,39,207,0.08)]"
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
                      className="h-11 w-full rounded-2xl border border-[#cfc2d6]/20 bg-white px-3 text-center text-sm font-bold text-[#1f1a23] outline-none transition-all placeholder:text-[#4d4354]/30 focus:border-[#8127cf]/40"
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

                {/* Subject chips/pills */}
                {subjects.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {subjects.map((subject, i) => (
                      <div
                        key={subject.key}
                        className="group flex items-center justify-between rounded-2xl border border-[#cfc2d6]/15 bg-white px-4 py-2.5 transition-all hover:border-[#8127cf]/20 hover:shadow-[0_4px_12px_-4px_rgba(129,39,207,0.12)]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[10px] font-black text-[#8127cf]">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-black text-[#1f1a23]">
                              {subject.name}
                            </p>
                            <p className="text-[9px] font-bold text-[#4d4354]/45">
                              {subject.totalMarks} marks
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSubject(subject.key)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#4d4354]/30 opacity-0 transition-all hover:bg-[#fff1f2] hover:text-[#f43f5e] group-hover:opacity-100"
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
                    <p className="mt-3 text-xs font-black text-[#4d4354]/35">
                      No subjects yet
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-[#4d4354]/25">
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
                  <p className="text-[10px] font-bold text-[#4d4354]/50">
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
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-[#4d4354]/70 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!name.trim()}
                className="flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] px-6 text-sm font-black text-white shadow-[0_10px_26px_-8px_rgba(129,39,207,0.45)] transition-all hover:shadow-[0_16px_38px_-10px_rgba(129,39,207,0.58)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                Create & Configure
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
