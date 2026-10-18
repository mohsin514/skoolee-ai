"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Tooltip } from "@/components/ui/tooltip";
import { BookOpen, GraduationCap, Loader2, Plus, Users } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { SkeletonList } from "@/components/ui/skeleton";

interface Teacher {
  id: string;
  fullName: string;
  email: string;
}

interface SubjectRecord {
  id: string;
  name: string;
  totalMarks: number;
  teacher?: Teacher | null;
  class: { id: string; name: string; section?: string | null };
}

interface ClassRecord {
  id: string;
  name: string;
  section?: string | null;
  academicYear: number;
  classTeacher?: Teacher | null;
  subjects: SubjectRecord[];
  _count: { students: number; subjects: number };
}

function classLabel(cls: Pick<ClassRecord, "name" | "section"> | SubjectRecord["class"]) {
  return [cls.name, cls.section].filter(Boolean).join(" ");
}

function sectionLabel(cls: Pick<ClassRecord, "section">) {
  return cls.section || "Main";
}

function classGroupKey(cls: Pick<ClassRecord, "name" | "academicYear">) {
  return `${cls.academicYear}::${cls.name}`;
}

function groupClasses(classes: ClassRecord[]) {
  const groups = new Map<string, { key: string; name: string; academicYear: number; sections: ClassRecord[] }>();

  for (const cls of classes) {
    const key = classGroupKey(cls);
    const group = groups.get(key) || { key, name: cls.name, academicYear: cls.academicYear, sections: [] };
    group.sections.push(cls);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    sections: group.sections.sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b))),
  }));
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSubjectDialog, setShowSubjectDialog] = useState(false);
  const [classForm, setClassForm] = useState({ name: "", section: "", academicYear: new Date().getFullYear(), classTeacherId: "" });
  const [subjectForm, setSubjectForm] = useState({ name: "", classId: "", teacherId: "", totalMarks: 100 });
  const [isSaving, setIsSaving] = useState(false);
  const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const [classRes, subjectRes, staffRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/api/subjects"),
        fetch("/api/staff?role=TEACHER"),
      ]);
      const [classData, subjectData, staffData] = await Promise.all([
        classRes.json(),
        subjectRes.json(),
        staffRes.json(),
      ]);

      if (!classRes.ok) throw new Error(classData.error || "Could not load classes");
      if (!subjectRes.ok) throw new Error(subjectData.error || "Could not load subjects");
      if (!staffRes.ok) throw new Error(staffData.error || "Could not load teachers");

      setClasses(classData.data || []);
      setSubjects(subjectData.data || []);
      setTeachers(staffData.staff || []);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "Could not load academic data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const classGroups = groupClasses(classes);
  const selectedSubjectClass = classes.find((cls) => cls.id === subjectForm.classId);
  const selectedSubjectGroupKey = selectedSubjectClass ? classGroupKey(selectedSubjectClass) : "";
  const selectedSubjectGroup = classGroups.find((group) => group.key === selectedSubjectGroupKey);

  const selectSubjectClassGroup = (key: string) => {
    const group = classGroups.find((item) => item.key === key);
    setSubjectForm((form) => ({ ...form, classId: group?.sections[0]?.id || "" }));
  };

  const createClass = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...classForm,
          classTeacherId: classForm.classTeacherId || undefined,
          academicYear: Number(classForm.academicYear),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create class");
      toast.success(data.count > 1 ? `${data.count} class sections created` : "Class section created");
      setShowAddDialog(false);
      setClassForm({ name: "", section: "", academicYear: new Date().getFullYear(), classTeacherId: "" });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create class");
    } finally {
      setIsSaving(false);
    }
  };

  const createSubject = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...subjectForm,
          teacherId: subjectForm.teacherId || undefined,
          totalMarks: Number(subjectForm.totalMarks),
          maxMarks: Number(subjectForm.totalMarks),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create subject");
      toast.success(`${subjectForm.name.trim() || "Subject"} assigned`);
      setShowSubjectDialog(false);
      setSubjectForm({ name: "", classId: "", teacherId: "", totalMarks: 100 });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create subject");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSubjectTeacher = async (subjectId: string, teacherId: string) => {
    setSavingSubjectId(subjectId);
    try {
      const res = await fetch("/api/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subjectId, teacherId: teacherId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update subject teacher");
      toast.success("Subject teacher updated");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update subject teacher");
    } finally {
      setSavingSubjectId(null);
    }
  };

  const addSubjectButton = (
    <Button variant="outline" size="sm" onClick={() => setShowSubjectDialog(true)} disabled={classes.length === 0}>
      <BookOpen aria-hidden="true" className="h-4 w-4" />
      Add Subject
    </Button>
  );

  return (
    <>
      <Header
        title="Classes"
        description="Manage classes, sections, teachers, and subject assignments"
        actions={
          <div className="flex flex-wrap gap-2">
            {!isLoading && classes.length === 0 ? (
              <Tooltip content="Create a class first. Subjects are assigned to a class section.">
                <span tabIndex={0} className="inline-flex rounded-xl">{addSubjectButton}</span>
              </Tooltip>
            ) : addSubjectButton}
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add Class
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {isLoading ? (
          <SkeletonList rows={4} label="Loading classes" />
        ) : loadError && classes.length === 0 ? (
          <Card className="sk-enter">
            <ErrorState
              title="Classes could not be loaded"
              description="Your classes, subjects and teachers did not load. Check your connection and try again."
              onRetry={loadData}
            />
          </Card>
        ) : classes.length === 0 ? (
          <Card className="sk-enter">
            <EmptyState
              icon={GraduationCap}
              title="No classes yet"
              description="Create a class before adding students, subjects, or fee structures."
              action={
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Create Class
                </Button>
              }
            />
          </Card>
        ) : (
          <Card className="sk-enter overflow-hidden">
            <CardContent className="p-0">
              <Table containerClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Academic Year</TableHead>
                    <TableHead>Class Teacher</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Subjects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.map((cls) => (
                    <TableRow key={cls.id}>
                      <TableCell className="min-w-36">
                        <div className="font-semibold text-ink-strong">{cls.name}</div>
                        <div className="text-xs text-ink-subtle">Section {cls.section || "None"}</div>
                      </TableCell>
                      <TableCell className="tabular-nums">{cls.academicYear}</TableCell>
                      <TableCell className={cls.classTeacher ? "text-ink" : "text-ink-subtle"}>{cls.classTeacher?.fullName || "Unassigned"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-ink-muted tabular-nums">
                          <Users aria-hidden="true" className="h-3.5 w-3.5" />
                          {cls._count.students}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <div className="flex flex-wrap gap-1">
                          {cls.subjects.length ? (
                            cls.subjects.map((subject) => (
                              <Badge key={subject.id} variant="secondary" size="sm">
                                {subject.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-ink-subtle">No subjects</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card className="sk-enter" style={{ "--sk-delay": "120ms" } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen aria-hidden="true" className="h-4 w-4 text-primary" />
              Subject Assignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <SkeletonList rows={2} label="Loading subjects" />
            ) : subjects.length === 0 ? (
              <EmptyState
                size="sm"
                icon={BookOpen}
                title="No subjects assigned yet"
                description={classes.length === 0 ? "Create a class first, then assign its subjects and teachers." : "Assign a subject to a class section to set its teacher and total marks."}
                action={classes.length > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => setShowSubjectDialog(true)}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Assign Subject
                  </Button>
                ) : undefined}
              />
            ) : (
              <div className="sk-stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {subjects.map((subject) => (
                  <div key={subject.id} className="min-w-0 rounded-2xl border border-border-subtle bg-white p-4 shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-strong">{subject.name}</p>
                        <p className="text-xs text-ink-subtle">
                          {classLabel(subject.class)} · <span className="tabular-nums">{subject.totalMarks}</span> marks
                        </p>
                      </div>
                      <Badge variant={subject.teacher ? "outline" : "neutral"} size="sm" className="max-w-[50%] shrink-0">
                        <span className="truncate">{subject.teacher?.fullName || "Unassigned"}</span>
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Select
                        aria-label={`Teacher for ${subject.name}, ${classLabel(subject.class)}`}
                        className="min-w-0 flex-1"
                        value={subject.teacher?.id || ""}
                        onChange={(event) => updateSubjectTeacher(subject.id, event.target.value)}
                        disabled={savingSubjectId === subject.id}
                      >
                        <option value="">Unassigned</option>
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                        ))}
                      </Select>
                      {savingSubjectId === subject.id ? (
                        <span role="status" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-muted">
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                          Saving
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Class Sections</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createClass}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="class-name" label="Class name" required>
                <Input value={classForm.name} onChange={(event) => setClassForm((form) => ({ ...form, name: event.target.value }))} placeholder="Class 10" required />
              </FormField>
              <FormField name="class-sections" label="Sections" optional hint="Separate with commas to create several at once, e.g. A, B, C. Leave empty for one class without sections.">
                <Input value={classForm.section} onChange={(event) => setClassForm((form) => ({ ...form, section: event.target.value }))} placeholder="A, B, C" />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="class-year" label="Academic year" required hint="Between 2000 and 2100.">
                <Input type="number" className="tabular-nums" value={classForm.academicYear} onChange={(event) => setClassForm((form) => ({ ...form, academicYear: Number(event.target.value) }))} min={2000} max={2100} required />
              </FormField>
              <FormField name="class-teacher" label="Class teacher" optional>
                <Select value={classForm.classTeacherId} onChange={(event) => setClassForm((form) => ({ ...form, classTeacherId: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isSaving}>
                Create Sections
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubjectDialog} onOpenChange={setShowSubjectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Subject</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createSubject}>
            <FormField name="subject-name" label="Subject name" required>
              <Input value={subjectForm.name} onChange={(event) => setSubjectForm((form) => ({ ...form, name: event.target.value }))} placeholder="Mathematics" required />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="subject-class" label="Class" required>
                <Select value={selectedSubjectGroupKey} onChange={(event) => selectSubjectClassGroup(event.target.value)} required>
                  <option value="">Select class</option>
                  {classGroups.map((group) => (
                    <option key={group.key} value={group.key}>{group.name} - {group.academicYear}</option>
                  ))}
                </Select>
              </FormField>
              <FormField name="subject-section" label="Section" required hint={selectedSubjectGroup ? undefined : "Choose a class first."}>
                <Select value={subjectForm.classId} onChange={(event) => setSubjectForm((form) => ({ ...form, classId: event.target.value }))} required>
                  <option value="">Select section</option>
                  {(selectedSubjectGroup?.sections || []).map((cls) => (
                    <option key={cls.id} value={cls.id}>Section {sectionLabel(cls)}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField name="subject-teacher" label="Teacher" optional>
                <Select value={subjectForm.teacherId} onChange={(event) => setSubjectForm((form) => ({ ...form, teacherId: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                  ))}
                </Select>
              </FormField>
              <FormField name="subject-total" label="Total marks" required hint="The most a student can score in this subject.">
                <Input type="number" className="tabular-nums" value={subjectForm.totalMarks} onChange={(event) => setSubjectForm((form) => ({ ...form, totalMarks: Number(event.target.value) }))} min={1} required />
              </FormField>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSubjectDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isSaving}>
                Assign Subject
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
