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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BookOpen, GraduationCap, Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";

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

  const loadData = useCallback(async () => {
    setIsLoading(true);
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
      toast.success(data.count > 1 ? `${data.count} sections created` : "Class section created");
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
      toast.success("Subject assigned");
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

  return (
    <>
      <Header
        title="Classes"
        description="Manage classes, sections, teachers, and subject assignments"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSubjectDialog(true)} disabled={classes.length === 0}>
              <BookOpen className="h-4 w-4" />
              Add Subject
            </Button>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4" />
              Add Class
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : classes.length === 0 ? (
          <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "0ms" }}>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <GraduationCap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No classes yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a class before adding students, subjects, or fee structures.
              </p>
              <Button size="sm" className="mt-6" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4" />
                Create Class
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="sk-rise overflow-hidden border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "0ms" }}>
            <CardContent className="p-0">
              <Table>
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
                      <TableCell>
                        <div className="font-medium">{cls.name}</div>
                        <div className="text-xs text-muted-foreground">Section {cls.section || "None"}</div>
                      </TableCell>
                      <TableCell>{cls.academicYear}</TableCell>
                      <TableCell>{cls.classTeacher?.fullName || "Unassigned"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {cls._count.students}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cls.subjects.length ? (
                            cls.subjects.map((subject) => (
                              <Badge key={subject.id} variant="secondary">
                                {subject.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">No subjects</span>
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

        <Card className="sk-rise border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "160ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Subject Assignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subjects.length === 0 ? (
              <div className="py-8 text-sm text-muted-foreground">No subjects assigned yet.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {subjects.map((subject) => (
                  <div key={subject.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{subject.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {classLabel(subject.class)} - {subject.totalMarks} marks
                        </p>
                      </div>
                      <Badge variant="outline">{subject.teacher?.fullName || "Unassigned"}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      <Select
                        value={subject.teacher?.id || ""}
                        onChange={(event) => updateSubjectTeacher(subject.id, event.target.value)}
                        disabled={savingSubjectId === subject.id}
                      >
                        <option value="">Unassigned</option>
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                        ))}
                      </Select>
                      <Button type="button" size="sm" variant="outline" disabled={savingSubjectId === subject.id}>
                        {savingSubjectId === subject.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Teacher"}
                      </Button>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class Name *</Label>
                <Input value={classForm.name} onChange={(event) => setClassForm((form) => ({ ...form, name: event.target.value }))} placeholder="Class 10" required />
              </div>
              <div className="space-y-2">
                <Label>Sections</Label>
                <Input value={classForm.section} onChange={(event) => setClassForm((form) => ({ ...form, section: event.target.value }))} placeholder="A, B, C" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Academic Year *</Label>
                <Input type="number" value={classForm.academicYear} onChange={(event) => setClassForm((form) => ({ ...form, academicYear: Number(event.target.value) }))} min={2000} max={2100} required />
              </div>
              <div className="space-y-2">
                <Label>Class Teacher</Label>
                <Select value={classForm.classTeacherId} onChange={(event) => setClassForm((form) => ({ ...form, classTeacherId: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                  ))}
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
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
            <div className="space-y-2">
              <Label>Subject Name *</Label>
              <Input value={subjectForm.name} onChange={(event) => setSubjectForm((form) => ({ ...form, name: event.target.value }))} placeholder="Mathematics" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class *</Label>
                <Select value={selectedSubjectGroupKey} onChange={(event) => selectSubjectClassGroup(event.target.value)} required>
                  <option value="">Select class</option>
                  {classGroups.map((group) => (
                    <option key={group.key} value={group.key}>{group.name} - {group.academicYear}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section *</Label>
                <Select value={subjectForm.classId} onChange={(event) => setSubjectForm((form) => ({ ...form, classId: event.target.value }))} required>
                  <option value="">Select section</option>
                  {(selectedSubjectGroup?.sections || []).map((cls) => (
                    <option key={cls.id} value={cls.id}>Section {sectionLabel(cls)}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teacher</Label>
                <Select value={subjectForm.teacherId} onChange={(event) => setSubjectForm((form) => ({ ...form, teacherId: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Total Marks *</Label>
                <Input type="number" value={subjectForm.totalMarks} onChange={(event) => setSubjectForm((form) => ({ ...form, totalMarks: Number(event.target.value) }))} min={1} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSubjectDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Assign Subject
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
