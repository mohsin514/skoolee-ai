"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
import { toast } from "sonner";

import {
  TeacherPicker,
  useTeacherAvailability,
} from "@/components/shared-admin/teacher-picker";
import { SubjectSyllabus } from "@/components/shared-admin/subject-syllabus";
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
    },
  ) => Promise<boolean>;
  onChangeSubjectTeacher: (
    classId: string,
    subjectId: string,
    teacherId: string,
  ) => void;
  onAddStudent: () => void;
  onViewStudent: (student: any) => void;
  onDeleteClass: (cls: any) => void;
  onUpdateClass: (
    classId: string,
    updates: { name?: string; section?: string; academicYear?: number },
  ) => Promise<void>;
  onDeleteSubject: (subject: any) => void;
  onUpdateSubject: (
    classId: string,
    subjectId: string,
    updates: { name?: string; totalMarks?: number },
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
  ready: "bg-emerald-400",
  partial: "bg-amber-400",
  empty: "bg-gray-300",
};

function sectionStudentCount(
  section: any,
  allStudents: any[],
): number {
  return allStudents.filter((s: any) => s.classId === section.id).length;
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
/*  Settings Drawer                                                    */
/* ------------------------------------------------------------------ */

function SettingsDrawer({
  section,
  classUpdateBusy,
  onUpdateClass,
  onDeleteClass,
  onClose,
}: {
  section: any;
  classUpdateBusy: boolean;
  onUpdateClass: ClassManagerProps["onUpdateClass"];
  onDeleteClass: ClassManagerProps["onDeleteClass"];
  onClose: () => void;
}) {
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
    await onUpdateClass(section.id, {
      name: editName,
      section: editSection,
      academicYear: Number(editYear) || new Date().getFullYear(),
    });
    toast.success("Class details updated");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#1f1a23]/30 backdrop-blur-sm animate-backdrop-enter" />
      <div
        className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-[#cfc2d6]/15 px-6 py-5">
          <div>
            <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
              Settings
            </p>
            <h3 className="mt-1 text-lg font-black text-[#1f1a23]">
              {classLabel(section)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl text-[#4d4354]/40 transition-all duration-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 custom-scrollbar">
          <div className="space-y-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
              Edit Class Details
            </p>
            <FormInput
              label="Class Name"
              value={editName}
              placeholder="e.g. Class 10"
              onChange={setEditName}
            />
            <FormInput
              label="Section"
              value={editSection}
              placeholder="e.g. A"
              onChange={setEditSection}
            />
            <FormInput
              label="Academic Year"
              type="number"
              value={editYear}
              placeholder="2026"
              onChange={setEditYear}
            />
            <button
              type="button"
              onClick={save}
              disabled={classUpdateBusy}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#1f1a23] text-sm font-black text-white shadow-xl transition-all hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {classUpdateBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save Changes"
              )}
            </button>
          </div>

          {/* Danger zone */}
          <div className="rounded-3xl border border-rose-200/50 bg-rose-50/30 p-5">
            <p className="text-[9px] font-black uppercase tracking-wider text-rose-500/70">
              Danger Zone
            </p>
            <p className="mt-2 text-[11px] font-bold leading-relaxed text-[#4d4354]/60">
              Permanently delete this section and all its data including
              subjects, student enrollments, and exam records. This cannot
              be undone.
            </p>
            <button
              type="button"
              onClick={() => onDeleteClass(section)}
              className="mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-rose-500 text-sm font-black text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-600 active:scale-[0.98]"
            >
              <Trash2 className="h-4 w-4" />
              Delete Section
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Matrix View                                                        */
/* ------------------------------------------------------------------ */

function MatrixView({
  sections,
  allStudents,
  teachers,
  availability,
  subjectBusyId,
  onChangeSubjectTeacher,
  refreshAvailability,
  flashKey,
  flash,
}: {
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
  const subjects = useMemo(() => uniqueSubjects(sections), [sections]);
  const [openPickerKey, setOpenPickerKey] = useState<string | null>(null);

  if (sections.length === 0) {
    return <EmptyInline text="No sections to display." />;
  }
  if (subjects.length === 0) {
    return (
      <EmptyInline text="No subjects have been added yet. Select a section and add subjects." />
    );
  }

  const teachingMode = (sec: any): "SINGLE" | "SUBJECT" =>
    sec.teachingMode === "SUBJECT" ? "SUBJECT" : "SINGLE";

  return (
    <div className="overflow-x-auto rounded-3xl border border-[#cfc2d6]/15 custom-scrollbar">
      <table className="w-full min-w-[600px] border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 rounded-tl-3xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] px-5 py-4 text-left text-[9px] font-black uppercase tracking-wider text-white/90">
              Subject
            </th>
            {sections.map((sec) => (
              <th
                key={sec.id}
                className="bg-gradient-to-br from-[#8127cf] to-[#9c48ea] px-4 py-4 text-center text-[9px] font-black uppercase tracking-wider text-white/90 last:rounded-tr-3xl"
              >
                <span className="block">
                  {sec.section ? `Section ${sec.section}` : "Main"}
                </span>
                <span className="mt-1 block text-[8px] font-bold text-white/55">
                  {sectionStudentCount(sec, allStudents)} students
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
                rowIdx % 2 === 0 ? "bg-white" : "bg-[#fbf0fe]/25"
              }
            >
              {/* Subject name cell */}
              <td className="sticky left-0 z-10 border-t border-[#cfc2d6]/10 bg-inherit px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#8127cf]/60" />
                  <span className="text-xs font-black text-[#1f1a23]">
                    {subjectName}
                  </span>
                  {(() => {
                    const sample = findSubjectByName(
                      sections[0],
                      subjectName,
                    );
                    return sample?.totalMarks ? (
                      <span className="rounded-full bg-[#fbf0fe] px-2 py-0.5 text-[7px] font-black text-[#8127cf]">
                        {sample.totalMarks} marks
                      </span>
                    ) : null;
                  })()}
                </div>
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
                      "border-t border-[#cfc2d6]/10 px-3 py-2.5 text-center transition-all duration-300",
                      isFlashing && "bg-emerald-50",
                      !isFlashing && assigned && "bg-[#f0fdfa]/40",
                      !isFlashing && !assigned && !isSingle && "bg-[#fff1f2]/30",
                    )}
                  >
                    {!subject ? (
                      <span className="text-[9px] font-bold text-[#4d4354]/25">
                        --
                      </span>
                    ) : isBusy ? (
                      <div className="flex flex-col items-center gap-1.5 py-1">
                        <Loader2 className="h-5 w-5 animate-spin text-[#8127cf]" />
                        <span className="text-[8px] font-bold text-[#8127cf]/60">Saving...</span>
                      </div>
                    ) : isSingle ? (
                      <div className="flex flex-col items-center gap-1">
                        {teacher?.id ? (
                          <>
                            <div className="h-7 w-7 overflow-hidden rounded-lg border border-[#cfc2d6]/20 bg-white">
                              <AvatarImage
                                src={teacherAvatar(teacher)}
                                alt="Teacher"
                              />
                            </div>
                            <span className="max-w-[100px] truncate text-[9px] font-bold text-[#4d4354]/60">
                              {teacher.fullName || "Teacher"}
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] font-bold italic text-[#4d4354]/35">
                            No class teacher
                          </span>
                        )}
                        <span className="text-[7px] font-bold text-[#4d4354]/30">
                          Follows class teacher
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5">
                        {assigned ? (
                          <>
                            <div className="h-8 w-8 overflow-hidden rounded-xl border-2 border-emerald-200 bg-white shadow-sm">
                              <AvatarImage
                                src={teacherAvatar(teacher)}
                                alt="Teacher"
                              />
                            </div>
                            <span className="max-w-[110px] truncate text-[9px] font-bold text-[#1f1a23]">
                              {teacher.fullName || "Teacher"}
                            </span>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                            </span>
                            <span className="text-[9px] font-bold text-rose-400">
                              Unassigned
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setOpenPickerKey(isPickerOpen ? null : cellKey)
                          }
                          className={cn(
                            "rounded-lg px-2.5 py-1 text-[7px] font-black uppercase tracking-wider transition-all cursor-pointer",
                            isPickerOpen
                              ? "bg-[#8127cf] text-white shadow-md shadow-[#8127cf]/20"
                              : "bg-[#8127cf]/8 text-[#8127cf] hover:bg-[#8127cf]/15",
                          )}
                        >
                          {assigned ? "Change" : "Assign"}
                        </button>
                        {isPickerOpen ? (
                          <div className="mt-1 w-full max-w-[200px] rounded-xl border border-[#cfc2d6]/15 bg-white p-2 shadow-lg">
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
    });
    if (created) {
      setSubjectName("");
      setSubjectMarks("100");
      toast.success("Subject added");
    }
  };

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
          <div className="rounded-3xl border border-[#cfc2d6]/10 bg-gradient-to-br from-[#faf7fc] to-[#f8f5fb] p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
              Teaching Mode
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(
                [
                  {
                    mode: "SINGLE" as const,
                    title: "One Teacher",
                    desc: "Class teacher takes all subjects",
                    icon: UserCheck,
                    activeClasses: "border-[#0d9488] bg-gradient-to-br from-white to-[#f0fdfa] shadow-[0_6px_20px_-4px_rgba(13,148,136,0.25)]",
                    activeTitleColor: "text-[#0d9488]",
                    activeIconBg: "bg-[#0d9488]",
                  },
                  {
                    mode: "SUBJECT" as const,
                    title: "Per Subject",
                    desc: "Each subject has its own teacher",
                    icon: Users,
                    activeClasses: "border-[#d97706] bg-gradient-to-br from-white to-[#fffbeb] shadow-[0_6px_20px_-4px_rgba(217,119,6,0.25)]",
                    activeTitleColor: "text-[#d97706]",
                    activeIconBg: "bg-[#d97706]",
                  },
                ] as const
              ).map((option) => {
                const active = teachingMode === option.mode;
                const Icon = option.icon;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    disabled={teachingModeBusy}
                    onClick={() => {
                      if (!active)
                        onChangeTeachingMode(section.id, option.mode);
                    }}
                    className={cn(
                      "rounded-2xl border-2 p-3.5 text-left transition-all duration-300 cursor-pointer disabled:cursor-wait disabled:opacity-60",
                      active
                        ? option.activeClasses
                        : "border-transparent bg-white/70 hover:border-[#cfc2d6]/30 hover:bg-white hover:shadow-sm",
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
                            active
                              ? `${option.activeIconBg} text-white shadow-sm`
                              : "bg-[#f3f4f9] text-[#4d4354]/40",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <p
                          className={cn(
                            "text-xs font-black transition-colors",
                            active
                              ? option.activeTitleColor
                              : "text-[#1f1a23]",
                          )}
                        >
                          {option.title}
                        </p>
                      </div>
                      {active ? (
                        <CheckCircle2 className={cn("h-4 w-4 shrink-0", option.activeTitleColor)} />
                      ) : null}
                    </div>
                    <p className="mt-1.5 pl-9 text-[9px] font-bold leading-relaxed text-[#4d4354]/45">
                      {option.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
                <BookOpen className="h-3.5 w-3.5 text-[#8127cf]" />
                Subjects ({subjectCount})
              </p>
              {teachingMode === "SINGLE" && subjectCount > 0 ? (
                <span className="rounded-full bg-[#ccfbf1] px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-[#0d9488]">
                  All follow class teacher
                </span>
              ) : null}
            </div>

            {(section.subjects || []).map((subject: any) => {
              const isEditing = editingSubjectId === subject.id;
              const isSyllabusOpen = expandedSyllabusId === subject.id;

              return (
                <div
                  key={subject.id}
                  className="group/card rounded-2xl border border-[#cfc2d6]/10 border-l-[3px] border-l-[#8127cf]/40 bg-white p-4 transition-all duration-200 hover:border-l-[#8127cf] hover:shadow-md"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <FormInput
                          label="Subject Name"
                          value={editSubjectName}
                          placeholder="Subject name"
                          onChange={setEditSubjectName}
                        />
                        <FormInput
                          label="Total Marks"
                          type="number"
                          value={editSubjectMarks}
                          placeholder="100"
                          onChange={setEditSubjectMarks}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            saveEditingSubject(subject.id)
                          }
                          disabled={
                            subjectUpdateBusyId === subject.id
                          }
                          className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1f1a23] text-[10px] font-black uppercase tracking-wider text-white transition-all hover:bg-black active:scale-[0.98] disabled:opacity-50"
                        >
                          {subjectUpdateBusyId === subject.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSubjectId(null)}
                          className="h-10 cursor-pointer rounded-xl bg-[#f3f4f9] px-4 text-[10px] font-black uppercase tracking-wider text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-black text-[#1f1a23]">
                              {subject.name}
                            </p>
                            {subject.totalMarks ? (
                              <span className="shrink-0 rounded-full bg-[#fbf0fe] px-2 py-0.5 text-[7px] font-black text-[#8127cf]">
                                {subject.totalMarks} marks
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[9px] font-bold text-[#4d4354]/45">
                            {teachingMode === "SINGLE" ? (
                              <span className="text-[#0d9488]">
                                Follows class teacher
                              </span>
                            ) : subject.teacher?.fullName ? (
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-4 w-4 overflow-hidden rounded-md">
                                  <AvatarImage
                                    src={teacherAvatar(
                                      subject.teacher,
                                    )}
                                    alt=""
                                  />
                                </span>
                                {subject.teacher.fullName}
                              </span>
                            ) : (
                              <span className="text-rose-400">
                                Teacher unassigned
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
                          {/* Syllabus chip */}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSyllabusId(
                                isSyllabusOpen ? null : subject.id,
                              )
                            }
                            className="flex h-7 cursor-pointer items-center gap-1 rounded-lg bg-[#fbf0fe] px-2 text-[8px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#f0e0f8]"
                          >
                            <BookOpen className="h-3 w-3" />
                            Syllabus
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              startEditingSubject(subject)
                            }
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#4d4354]/30 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                            title="Edit subject"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onDeleteSubject(subject)
                            }
                            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[#4d4354]/30 transition-all hover:bg-rose-50 hover:text-rose-500"
                            title="Delete subject"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Subject teacher picker (SUBJECT mode only) */}
                      {teachingMode === "SUBJECT" ? (
                        <div className="relative mt-3">
                          <TeacherPicker
                            label={
                              subjectBusyId === subject.id
                                ? "Saving..."
                                : "Subject Teacher"
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
                            <Loader2 className="absolute right-4 top-[42px] h-4 w-4 animate-spin text-[#8127cf]" />
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
              <EmptyInline text="No subjects are attached to this section yet." />
            ) : null}
          </div>

          {/* Add subject form */}
          <div className="rounded-3xl border-2 border-dashed border-[#cfc2d6]/25 bg-gradient-to-br from-white to-[#faf7fc]/50 p-5">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-[#8127cf]/60">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#8127cf]/10">
                <Plus className="h-3 w-3 text-[#8127cf]" />
              </span>
              Add Subject
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormInput
                label="Subject Name"
                value={subjectName}
                placeholder="e.g. Mathematics"
                onChange={setSubjectName}
              />
              <FormInput
                label="Total Marks"
                type="number"
                value={subjectMarks}
                placeholder="100"
                onChange={setSubjectMarks}
              />
            </div>
            {teachingMode === "SUBJECT" ? (
              <div className="mt-3">
                <TeacherPicker
                  label="Subject Teacher (optional)"
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
              <button
                type="button"
                onClick={() => setApplyToAllSections((v) => !v)}
                className="mt-3 flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-[#fbf0fe]/60 p-3 text-left transition-all hover:bg-[#fbf0fe]"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                    applyToAllSections
                      ? "border-[#8127cf] bg-[#8127cf]"
                      : "border-[#cfc2d6]/50 bg-white",
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
                  <span className="block text-[11px] font-black text-[#1f1a23]">
                    Add to all {allSections.length} sections
                  </span>
                  <span className="block text-[9px] font-bold text-[#4d4354]/50">
                    Sections that already have this subject are
                    skipped.
                  </span>
                </span>
              </button>
            ) : null}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={createSubject}
                disabled={creatingSubject || !subjectName.trim()}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-2xl bg-[#1f1a23] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-xl transition-all hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingSubject ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Add Subject
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Section info sidebar */}
        <div className="space-y-4">
          {/* Class teacher card */}
          <div className="rounded-3xl border border-[#8127cf]/10 bg-gradient-to-br from-[#fbf0fe] via-[#f8f2fd] to-[#f3eeff] p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#8127cf]/15">
                <GraduationCap className="h-3 w-3 text-[#8127cf]" />
              </div>
              <p className="text-[9px] font-black uppercase tracking-wider text-[#8127cf]/60">
                {teachingMode === "SINGLE"
                  ? "Class Teacher"
                  : "Homeroom Teacher"}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-white shadow-md shadow-[#8127cf]/8">
                {section.classTeacher?.id ? (
                  <AvatarImage
                    src={teacherAvatar(section.classTeacher)}
                    alt="Teacher"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#f3f4f9]">
                    <User className="h-6 w-6 text-[#4d4354]/30" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-black text-[#1f1a23]">
                  {section.classTeacher?.fullName || "Unassigned"}
                </p>
                <p className="truncate text-[9px] font-bold text-[#4d4354]/45">
                  {section.classTeacher?.email || "No teacher assigned"}
                </p>
              </div>
            </div>
            <div className="relative mt-3">
              <TeacherPicker
                label={
                  teacherBusy
                    ? "Saving..."
                    : teachingMode === "SINGLE"
                      ? "Change Class Teacher"
                      : "Change Homeroom Teacher"
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
                <Loader2 className="absolute right-4 top-[42px] h-4 w-4 animate-spin text-[#8127cf]" />
              ) : null}
            </div>
          </div>

          {/* Student count with mini avatars */}
          <div className="rounded-3xl border border-[#f43f5e]/10 bg-gradient-to-br from-white to-[#fff8f8] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#f43f5e]/10">
                  <Users className="h-3 w-3 text-[#f43f5e]" />
                </div>
                <p className="text-[9px] font-black uppercase tracking-wider text-[#f43f5e]/60">
                  Students
                </p>
              </div>
              <span className="rounded-full bg-[#fff1f2] px-2.5 py-0.5 text-[10px] font-black text-[#f43f5e]">
                {students.length}
              </span>
            </div>
            {students.length > 0 ? (
              <div className="mt-3 flex items-center gap-1">
                {students.slice(0, 5).map((s: any) => (
                  <div
                    key={s.id}
                    className="h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-white bg-white shadow-sm"
                  >
                    <AvatarImage src={s.profileImageUrl} name={s.fullName} alt="" initialsClassName="text-[10px]" />
                  </div>
                ))}
                {students.length > 5 ? (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#fbf0fe] text-[8px] font-black text-[#8127cf] shadow-sm">
                    +{students.length - 5}
                  </span>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() =>
                students.length > 0
                  ? setShowAllStudents(!showAllStudents)
                  : onAddStudent()
              }
              className="mt-3 flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#fbf0fe] text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#f0e0f8]"
            >
              {students.length > 0 ? (
                <>
                  <Users className="h-3 w-3" />
                  {showAllStudents
                    ? "Collapse"
                    : "View All Students"}
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  Add First Student
                </>
              )}
            </button>
          </div>

          {/* Setup progress */}
          <div className={cn(
            "rounded-3xl border p-4 shadow-sm transition-all duration-500",
            completedSteps === totalSteps
              ? "border-emerald-200/50 bg-gradient-to-br from-white to-[#ecfdf5]"
              : "border-[#cfc2d6]/10 bg-white",
          )}>
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md",
                completedSteps === totalSteps ? "bg-emerald-100" : "bg-[#f3f4f9]",
              )}>
                <CheckCircle2 className={cn(
                  "h-3 w-3",
                  completedSteps === totalSteps ? "text-emerald-600" : "text-[#4d4354]/30",
                )} />
              </div>
              <p className={cn(
                "text-[9px] font-black uppercase tracking-wider",
                completedSteps === totalSteps ? "text-emerald-600/60" : "text-[#4d4354]/40",
              )}>
                {completedSteps === totalSteps ? "Setup Complete" : "Setup Progress"}
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
                    stroke="#f3f4f9"
                    strokeWidth="3.5"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke={
                      completedSteps === totalSteps
                        ? "#10b981"
                        : "#8127cf"
                    }
                    strokeWidth="3.5"
                    strokeDasharray={`${(completedSteps / totalSteps) * 88} 88`}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-[#1f1a23]">
                  {completedSteps}/{totalSteps}
                </span>
              </div>
              <div className="min-w-0 space-y-1">
                {[
                  {
                    done: hasTeacher,
                    label: "Class teacher assigned",
                  },
                  {
                    done: subjectCount > 0,
                    label: "Subjects added",
                  },
                  {
                    done: allSubjectsAssigned,
                    label: "Teachers assigned to subjects",
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
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-[#f3f4f9] text-[#4d4354]/25",
                      )}
                    >
                      <Check
                        className="h-2 w-2"
                        strokeWidth={3}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-[9px] font-bold",
                        step.done
                          ? "text-[#1f1a23]"
                          : "text-[#4d4354]/40",
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
            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/40">
              <GraduationCap className="h-3.5 w-3.5 text-[#8127cf]" />
              All Students ({students.length})
            </p>
            <button
              type="button"
              onClick={onAddStudent}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-[#fbf0fe] px-3 text-[9px] font-black uppercase tracking-wider text-[#8127cf] transition-all hover:bg-[#f0e0f8]"
            >
              <Plus className="h-3 w-3" />
              Add Student
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleStudents.map((student: any) => (
              <button
                key={student.id}
                type="button"
                onClick={() => onViewStudent(student)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-[#cfc2d6]/10 bg-white px-4 py-3 text-left transition-all hover:shadow-md sm:w-auto sm:min-w-[200px]"
              >
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-white bg-white shadow-sm">
                  <AvatarImage src={student.profileImageUrl} name={student.fullName} alt="" initialsClassName="text-[10px]" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-[#1f1a23]">
                    {student.fullName}
                  </p>
                  <p className="text-[9px] font-bold text-[#4d4354]/40">
                    Roll {student.rollNo || "N/A"}
                  </p>
                </div>
              </button>
            ))}
            {/* Add student card */}
            <button
              type="button"
              onClick={onAddStudent}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#cfc2d6]/30 px-4 py-3 text-[10px] font-black text-[#4d4354]/40 transition-all hover:border-[#8127cf]/30 hover:bg-[#fbf0fe]/30 hover:text-[#8127cf] sm:w-auto sm:min-w-[200px]"
            >
              <Plus className="h-4 w-4" />
              Add Student
            </button>
          </div>
          {students.length > 8 && !showAllStudents ? (
            <button
              type="button"
              onClick={() => setShowAllStudents(true)}
              className="text-[10px] font-black text-[#8127cf] underline decoration-[#8127cf]/30 underline-offset-2 transition-all hover:decoration-[#8127cf] cursor-pointer"
            >
              Show all {students.length} students
            </button>
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
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
  onRefresh,
}: ClassManagerProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<
    string | "all"
  >(cls.id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const { availability, refresh: refreshAvailability } =
    useTeacherAvailability();
  const { flashKey, flash } = useFlashCell();

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

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
            (s: any) => s.classId === selectedSection.id,
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
  const className = cls.name || "Class";
  const academicYear = cls.academicYear || new Date().getFullYear();

  // Teaching mode of the initially-selected class (for header badge)
  const primaryTeachingMode =
    cls.teachingMode === "SUBJECT" ? "SUBJECT" : "SINGLE";

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[120] bg-[#1f1a23]/50 backdrop-blur-md animate-backdrop-enter"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="fixed inset-0 z-[125] flex items-center justify-center p-4 sm:p-6 animate-modal-enter pointer-events-none">
      <div className="pointer-events-auto relative flex w-full max-w-6xl flex-col overflow-hidden rounded-[34px] border border-[#cfc2d6]/15 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)]" style={{ maxHeight: "min(92vh, 900px)" }}>
        {/* ============================================================ */}
        {/*  HEADER                                                       */}
        {/* ============================================================ */}
        <div className="shrink-0 rounded-t-[34px] border-b border-[#cfc2d6]/12 bg-gradient-to-r from-[#faf7fc] via-white to-[#f3eeff] px-5 py-4 sm:px-8 sm:py-5">
          <div>
            {/* Top row: title + close */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-lg shadow-[#8127cf]/20">
                  <School className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
                    <span className="bg-gradient-to-r from-[#8127cf] via-[#9c48ea] to-[#6a1fad] bg-clip-text text-transparent">
                      {className}
                    </span>
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f3eeff] px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#8127cf]">
                      {academicYear}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider",
                        primaryTeachingMode === "SINGLE"
                          ? "bg-[#ccfbf1] text-[#0d9488]"
                          : "bg-[#fef3c7] text-[#d97706]",
                      )}
                    >
                      {primaryTeachingMode === "SINGLE" ? (
                        <UserCheck className="h-2.5 w-2.5" />
                      ) : (
                        <Users className="h-2.5 w-2.5" />
                      )}
                      {primaryTeachingMode === "SINGLE"
                        ? "Single Teacher"
                        : "Per Subject"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {onRefresh ? (
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-[#4d4354]/35 transition-all duration-200 hover:bg-[#fbf0fe] hover:text-[#8127cf] active:scale-95"
                    title="Refresh data"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-[#f3f4f9] text-[#4d4354]/50 transition-all duration-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>

            {/* Stats row */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <div className="flex items-center gap-1.5 rounded-xl border border-[#8127cf]/10 bg-white px-3 py-1.5 shadow-sm">
                <Layers className="h-3 w-3 text-[#8127cf]" />
                <span className="text-[10px] font-black text-[#8127cf]">
                  {sortedSections.length}
                </span>
                <span className="text-[10px] font-bold text-[#4d4354]/45">
                  section{sortedSections.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl border border-[#0d9488]/10 bg-white px-3 py-1.5 shadow-sm">
                <BookOpen className="h-3 w-3 text-[#0d9488]" />
                <span className="text-[10px] font-black text-[#0d9488]">
                  {totalSubjects}
                </span>
                <span className="text-[10px] font-bold text-[#4d4354]/45">
                  subject{totalSubjects !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl border border-[#f43f5e]/10 bg-white px-3 py-1.5 shadow-sm">
                <GraduationCap className="h-3 w-3 text-[#f43f5e]" />
                <span className="text-[10px] font-black text-[#f43f5e]">
                  {totalStudents}
                </span>
                <span className="text-[10px] font-bold text-[#4d4354]/45">
                  student{totalStudents !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  BODY: Left Rail + Main Area                                  */}
        {/* ============================================================ */}
        <div className="flex min-h-0 flex-1">
          {/* Mobile rail toggle */}
          <button
            type="button"
            onClick={() => setMobileRailOpen(!mobileRailOpen)}
            className="absolute bottom-6 left-6 z-[130] flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/30 transition-all hover:scale-105 active:scale-95 lg:hidden"
          >
            <Layers className="h-5 w-5" />
          </button>

          {/* Left Rail */}
          <div
            className={cn(
              "shrink-0 border-r border-[#cfc2d6]/12 bg-gradient-to-b from-[#faf7fc] to-[#f5f0fa] transition-all duration-300",
              // Desktop: always visible
              "hidden lg:flex lg:w-[220px] lg:flex-col",
              // Mobile: overlay
              mobileRailOpen &&
                "absolute inset-y-0 left-0 z-[135] flex w-[260px] flex-col shadow-2xl",
            )}
          >
            {/* Mobile close */}
            {mobileRailOpen ? (
              <div className="flex items-center justify-between border-b border-[#cfc2d6]/10 px-4 py-3 lg:hidden">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40">
                  Sections
                </span>
                <button
                  type="button"
                  onClick={() => setMobileRailOpen(false)}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl text-[#4d4354]/40 hover:bg-rose-50 hover:text-rose-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              {/* All Sections button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedSectionId("all");
                  setMobileRailOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left transition-all duration-200",
                  selectedSectionId === "all"
                    ? "bg-white shadow-md shadow-[#8127cf]/8"
                    : "hover:bg-white/70",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all",
                    selectedSectionId === "all"
                      ? "bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-md shadow-[#8127cf]/25"
                      : "bg-[#fbf0fe] text-[#8127cf]",
                  )}
                >
                  <Grid3X3 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-xs font-black",
                      selectedSectionId === "all"
                        ? "text-[#8127cf]"
                        : "text-[#1f1a23]",
                    )}
                  >
                    All Sections
                  </p>
                  <p className="text-[8px] font-bold text-[#4d4354]/40">
                    Matrix view
                  </p>
                </div>
              </button>

              {/* Divider */}
              <div className="my-3 h-px bg-[#cfc2d6]/15" />

              {/* Section pills */}
              <div className="space-y-1.5">
                {sortedSections.map((sec) => {
                  const active = selectedSectionId === sec.id;
                  const status = sectionSetupStatus(sec);
                  const studentCount = sectionStudentCount(
                    sec,
                    allStudents,
                  );
                  const sectionSubjectCount =
                    sec.subjects?.length || 0;

                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        setSelectedSectionId(sec.id);
                        setMobileRailOpen(false);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-2.5 rounded-2xl px-3.5 py-3 text-left transition-all duration-200",
                        active
                          ? "border-l-[3px] border-l-[#8127cf] bg-white pl-3 shadow-md shadow-[#8127cf]/8"
                          : "border-l-[3px] border-l-transparent hover:bg-white/70",
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
                            "text-xs font-black",
                            active
                              ? "text-[#8127cf]"
                              : "text-[#1f1a23]",
                          )}
                        >
                          {sec.section
                            ? `Section ${sec.section}`
                            : "Main Section"}
                        </p>
                        <p className="mt-0.5 truncate text-[8px] font-bold text-[#4d4354]/40">
                          {sec.classTeacher?.fullName ||
                            "No teacher"}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[8px] font-bold text-[#4d4354]/30">
                            {studentCount} student
                            {studentCount !== 1 ? "s" : ""}
                          </span>
                          <span className="text-[8px] font-bold text-[#4d4354]/30">
                            {sectionSubjectCount} subject
                            {sectionSubjectCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
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
          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-[#faf7fc] to-white p-4 sm:p-6 lg:p-8 custom-scrollbar">
            <div className="mx-auto max-w-5xl">
              {selectedSectionId === "all" ? (
                <>
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] text-white shadow-md shadow-[#8127cf]/20">
                      <Grid3X3 className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-[#1f1a23]">
                        Subject-Teacher Matrix
                      </h2>
                      <p className="text-[10px] font-bold text-[#4d4354]/50">
                        Overview of all subjects and teacher
                        assignments across sections
                      </p>
                    </div>
                  </div>
                  <MatrixView
                    sections={sortedSections}
                    allStudents={allStudents}
                    teachers={teachers}
                    availability={availability}
                    subjectBusyId={subjectBusyId}
                    onChangeSubjectTeacher={onChangeSubjectTeacher}
                    refreshAvailability={refreshAvailability}
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
                            ? "bg-gradient-to-br from-[#10b981] to-[#34d399] text-white shadow-emerald-500/20"
                            : sectionSetupStatus(
                                  selectedSection,
                                ) === "partial"
                              ? "bg-gradient-to-br from-[#f59e0b] to-[#fbbf24] text-white shadow-amber-500/20"
                              : "bg-gradient-to-br from-[#cfc2d6] to-[#e2d8ea] text-white shadow-[#cfc2d6]/20",
                        )}
                      >
                        <LayoutGrid className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-[#1f1a23]">
                          {selectedSection.section
                            ? `Section ${selectedSection.section}`
                            : "Main Section"}
                        </h2>
                        <p className="text-[10px] font-bold text-[#4d4354]/50">
                          {selectedSection.classTeacher?.fullName ||
                            "No class teacher assigned"}{" "}
                          / {selectedStudents.length} student
                          {selectedStudents.length !== 1
                            ? "s"
                            : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl text-[#4d4354]/40 transition-all duration-200 hover:bg-[#fbf0fe] hover:text-[#8127cf] active:scale-95"
                      title="Section settings"
                    >
                      <Settings className="h-5 w-5" />
                    </button>
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
                    onChangeSubjectTeacher={onChangeSubjectTeacher}
                    onAddStudent={onAddStudent}
                    onViewStudent={onViewStudent}
                    onDeleteSubject={onDeleteSubject}
                    onUpdateSubject={onUpdateSubject}
                    refreshAvailability={refreshAvailability}
                  />
                </>
              ) : (
                <EmptyInline text="Select a section from the sidebar to view its details." />
              )}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  FOOTER                                                       */}
        {/* ============================================================ */}
        <div className="shrink-0 rounded-b-[34px] border-t border-[#cfc2d6]/10 bg-gradient-to-r from-[#faf7fc] via-white to-[#f3eeff] px-5 py-2.5 sm:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[9px] font-bold text-[#4d4354]/35">
              <span className="rounded-md bg-[#8127cf]/8 px-2 py-0.5 text-[8px] font-black text-[#8127cf]/50">
                {className}
              </span>
              <span>/</span>
              <span>{academicYear}</span>
              <span>/</span>
              <span>
                {sortedSections.length} section
                {sortedSections.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (selectedSection) {
                  setSettingsOpen(true);
                } else if (sortedSections.length > 0) {
                  setSelectedSectionId(sortedSections[0].id);
                  setSettingsOpen(true);
                }
              }}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-xl border border-[#cfc2d6]/15 bg-white px-3.5 text-[9px] font-black uppercase tracking-wider text-[#4d4354]/50 shadow-sm transition-all duration-200 hover:border-[#8127cf]/20 hover:text-[#8127cf]"
            >
              <Settings className="h-3 w-3" />
              Settings
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Settings drawer */}
      {settingsOpen && selectedSection
        ? createPortal(
            <SettingsDrawer
              section={selectedSection}
              classUpdateBusy={classUpdateBusy}
              onUpdateClass={onUpdateClass}
              onDeleteClass={onDeleteClass}
              onClose={() => setSettingsOpen(false)}
            />,
            document.body,
          )
        : null}
    </>,
    document.body,
  );
}
