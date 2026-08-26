"use client";

/* TEMPORARY verification harness for the class dialogs. Delete after use. */

import { useState } from "react";
import { QuickCreateClass } from "@/components/shared-admin/quick-create-class";
import { ClassManager } from "@/components/shared-admin/class-manager";

const teachers = [
  { id: "t1", fullName: "Ayesha Khan", email: "ayesha@school.pk" },
  { id: "t2", fullName: "Bilal Ahmed", email: "bilal@school.pk" },
  { id: "t3", fullName: "Sana Malik", email: "sana@school.pk" },
];

const subjectsA = [
  { id: "s1", name: "Mathematics", totalMarks: 100, teacher: { id: "t1", fullName: "Ayesha Khan" } },
  { id: "s2", name: "English", totalMarks: 75, teacher: { id: "t2", fullName: "Bilal Ahmed" } },
  { id: "s3", name: "Science", totalMarks: 100, teacher: null },
];

// Grade 8 A is fully set up; B has a teacher but no subjects; C has neither.
const gradeEightA = {
  id: "c1", name: "Grade 8", section: "A", academicYear: 2026,
  teachingMode: "SUBJECT", classTeacher: { id: "t1", fullName: "Ayesha Khan" },
  subjects: subjectsA,
};
const gradeEightB = {
  id: "c2", name: "Grade 8", section: "B", academicYear: 2026,
  teachingMode: "SUBJECT", classTeacher: { id: "t3", fullName: "Sana Malik" },
  subjects: [],
};
const gradeEightC = {
  id: "c3", name: "Grade 8", section: "C", academicYear: 2026,
  teachingMode: "SUBJECT", classTeacher: null, subjects: [],
};
const gradeSeven = {
  id: "c4", name: "Grade 7", section: "A", academicYear: 2026,
  teachingMode: "SINGLE", classTeacher: { id: "t2", fullName: "Bilal Ahmed" },
  subjects: subjectsA,
};

const allSections = [gradeEightA, gradeEightB, gradeEightC];
const classes = [...allSections, gradeSeven];

const students = [
  { id: "st1", fullName: "Hamza Iqbal", rollNo: "01", class: { id: "c1" }, classId: "c1" },
  { id: "st2", fullName: "Fatima Noor", rollNo: "02", class: { id: "c1" }, classId: "c1" },
  { id: "st3", fullName: "Zain Raza", rollNo: "01", class: { id: "c2" }, classId: "c2" },
];

const noop = () => {};
const asyncNoop = async () => {};

export default function ClassLab() {
  const [showCreate, setShowCreate] = useState(false);
  const [showManage, setShowManage] = useState(false);

  return (
    <div className="min-h-screen bg-[#fbf0fe] p-10">
      <h1 className="mb-6 text-2xl font-black text-[#1f1a23]">Class dialog harness</h1>
      <div className="flex gap-3">
        <button
          id="open-create"
          onClick={() => setShowCreate(true)}
          className="rounded-2xl bg-[#8127cf] px-6 py-3 font-bold text-white"
        >
          Add class
        </button>
        <button
          id="open-manage"
          onClick={() => setShowManage(true)}
          className="rounded-2xl bg-[#0d9488] px-6 py-3 font-bold text-white"
        >
          Manage class
        </button>
      </div>

      {showCreate && (
        <QuickCreateClass
          teachers={teachers}
          classes={classes}
          onClose={() => setShowCreate(false)}
          onCreated={() => setShowCreate(false)}
        />
      )}

      {showManage && (
        <ClassManager
          cls={gradeEightA}
          allSections={allSections}
          students={students.filter((s) => s.class?.id === "c1")}
          allStudents={students}
          teachers={teachers}
          classes={classes}
          teacherBusy={false}
          subjectBusyId={null}
          creatingSubject={false}
          classUpdateBusy={false}
          subjectUpdateBusyId={null}
          creatingSections={false}
          onCreateSections={async () => true}
          onClose={() => setShowManage(false)}
          onChangeTeacher={noop}
          onChangeTeachingMode={noop}
          onCreateSubject={async () => true}
          onChangeSubjectTeacher={noop}
          onAddStudent={noop}
          onViewStudent={noop}
          onDeleteClass={noop}
          onUpdateClass={asyncNoop}
          onDeleteSubject={noop}
          onUpdateSubject={asyncNoop}
        />
      )}
    </div>
  );
}
