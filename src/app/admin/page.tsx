"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  Briefcase,
  Building,
  Calendar,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  Download,
  FileText,
  GraduationCap,
  Heart,
  HelpCircle,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Plus,
  School,
  Send,
  Shield,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getCampusDashboardData } from "@/app/actions/dashboard";
import { cancelInvitation, removeStaff, resendInvitation } from "@/app/actions/invite";
import {
  AiActionPanel,
  AIReviewQueue,
  BrandButton,
  EmptyState,
  ManagementCard,
  RoleShell,
  StatCard,
  type RoleNavItem,
} from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { CornerSparkles } from "@/components/CornerSparkles";
import { AdmissionForm } from "@/app/dashboard/students/admission-form";
import { BulkImportDialog } from "@/app/dashboard/students/bulk-import-dialog";
import { AddTeacherForm } from "@/components/teacher/add-teacher-form";
import { AddStaffForm } from "@/components/staff/add-staff-form";

type AdminView = "leadership" | "classes" | "teachers" | "students" | "ai";
type ClassFormState = {
  name: string;
  section: string;
  academicYear: number;
  classTeacherId: string;
};
type StudentFormState = {
  fullName: string;
  rollNo: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  classId: string;
  studentEmail: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
};
type ClassGroup = {
  key: string;
  name: string;
  academicYear: number | string;
  sections: any[];
};

const viewCopy: Record<AdminView, { title: string; description: string }> = {
  leadership: {
    title: "Campus Control",
    description: "Manage the single campus owner workspace, admin access, principal authority, and pending invitations.",
  },
  classes: {
    title: "Academic Plan",
    description: "Review classes, class teachers, subject coverage, exam cycles, and report-card readiness.",
  },
  teachers: {
    title: "Faculty Hub",
    description: "Invite teachers, review active faculty, and revoke access when staff leaves the campus.",
  },
  students: {
    title: "Students & Records",
    description: "View enrolled students, guardian contacts, latest report-card status, and class placement.",
  },
  ai: {
    title: "AI Review Center",
    description: "Generate campus insights and approve queued AI recommendations before they become operational.",
  },
};

function formatStatus(status?: string) {
  return (status || "Pending").replaceAll("_", " ");
}

function statusTone(status?: string) {
  if (["ACTIVE", "Active", "PUBLISHED", "SENT", "APPROVED", "Assigned", "One Teacher"].includes(status || "")) {
    return "bg-emerald-50 text-emerald-600";
  }
  if (["Invited", "PENDING", "TRIAL", "REVIEW", "LOCKED", "Subject Teachers"].includes(status || "")) {
    return "bg-[#fbf0fe] text-[#8127cf]";
  }
  if (["Expired", "FAILED", "BLOCKED", "SUSPENDED", "NO_REPORT", "Unassigned"].includes(status || "")) {
    return "bg-rose-50 text-rose-600";
  }
  return "bg-[#f3f4f9] text-[#4d4354]/70";
}

function classLabel(item: any) {
  if (!item) return "Unassigned";
  return [item.name, item.section].filter(Boolean).join(" ");
}

function sectionLabel(item: any) {
  return item?.section || "Main";
}

function classGroupKey(item: any) {
  return `${item?.academicYear || ""}::${item?.name || ""}`;
}

function groupClasses(classes: any[]) {
  const groups = new Map<string, ClassGroup>();

  for (const cls of classes || []) {
    const key = classGroupKey(cls);
    const group: ClassGroup = groups.get(key) || {
      key,
      name: cls.name || "Class",
      academicYear: cls.academicYear || "N/A",
      sections: [],
    };
    group.sections.push(cls);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sections: group.sections.sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b))),
    }))
    .sort(
      (a, b) =>
        (Number(b.academicYear) || 0) - (Number(a.academicYear) || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""))
    );
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatDate(value?: string | Date | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function CampusAdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<AdminView>("leadership");
  const [showClassModal, setShowClassModal] = useState(false);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [movingStudent, setMovingStudent] = useState<any>(null);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [showAddPrincipalForm, setShowAddPrincipalForm] = useState(false);
  const [classForm, setClassForm] = useState<ClassFormState>({
    name: "",
    section: "",
    academicYear: new Date().getFullYear(),
    classTeacherId: "",
  });
  const [moveClassId, setMoveClassId] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [movingStudentBusy, setMovingStudentBusy] = useState(false);
  const [savingClassTeacherId, setSavingClassTeacherId] = useState<string | null>(null);
  const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
  const [creatingSubjectClassId, setCreatingSubjectClassId] = useState<string | null>(null);
  const [applyingSubjectClassId, setApplyingSubjectClassId] = useState<string | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showAddTeacherForm, setShowAddTeacherForm] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [savingClassUpdate, setSavingClassUpdate] = useState(false);
  const [savingStudentUpdate, setSavingStudentUpdate] = useState(false);
  const [savingSubjectUpdateId, setSavingSubjectUpdateId] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const nextData = await getCampusDashboardData();
      setData(nextData);
      return nextData;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const exportStudentsCSV = () => {
    const students = data?.students || [];
    if (!students.length) return toast.error("No student data to export");
    const headers = ["Full Name,Roll No,Gender,Class,Guardian Name,Guardian Phone,Guardian Email"];
    const rows = students.map((s: any) =>
      [
        `"${s.fullName}"`,
        s.rollNo,
        s.gender || "MALE",
        s.class ? `${s.class.name} ${s.class.section || ""}`.trim() : "",
        `"${s.guardianName || ""}"`,
        s.guardianPhone || "",
        s.guardianEmail || "",
      ].join(",")
    );
    const csv = [...headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.campusName.replace(/\s+/g, "_")}_students.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${students.length} students exported`);
  };

  const openAddStaff = (role: "CAMPUS_ADMIN" | "PRINCIPAL") => {
    if (role === "CAMPUS_ADMIN") setShowAddAdminForm(true);
    else setShowAddPrincipalForm(true);
  };

  const openAdmissionForm = () => {
    setShowAdmissionForm(true);
  };

  const openMoveStudent = (student: any) => {
    setMovingStudent(student);
    setMoveClassId(student.class?.id || data?.classes?.[0]?.id || "");
  };

  const syncSelectedClass = (nextData: any, classId: string) => {
    const nextClass = nextData?.classes?.find((item: any) => item.id === classId);
    if (nextClass) setSelectedClass(nextClass);
  };

  const handleCreateClass = async () => {
    if (!classForm.name.trim()) return toast.error("Class name is required");
    const sections = [
      ...new Set(
        classForm.section
          .split(/[,\n]/)
          .map((section) => section.trim())
          .filter(Boolean)
      ),
    ];
    setSavingClass(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: classForm.name.trim(),
          section: sections[0] || "",
          sections,
          academicYear: classForm.academicYear,
          classTeacherId: classForm.classTeacherId || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Class could not be created");
      toast.success(result.count > 1 ? `${result.count} sections created` : "Class section created");
      setShowClassModal(false);
      setClassForm({ name: "", section: "", academicYear: new Date().getFullYear(), classTeacherId: "" });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Class could not be created");
    } finally {
      setSavingClass(false);
    }
  };

  const handleAdmissionSuccess = () => {
    setShowAdmissionForm(false);
    loadData();
  };

  const handleMoveStudent = async () => {
    if (!movingStudent || !moveClassId) return;
    setMovingStudentBusy(true);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: movingStudent.id, classId: moveClassId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Student could not be moved");
      toast.success("Student moved");
      setMovingStudent(null);
      setMoveClassId("");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Student could not be moved");
    } finally {
      setMovingStudentBusy(false);
    }
  };

  const handleChangeClassTeacher = async (classId: string, classTeacherId: string) => {
    setSavingClassTeacherId(classId);
    try {
      const res = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, classTeacherId: classTeacherId || null }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Class teacher could not be updated");
      toast.success("Class teacher updated");
      setSelectedClass((current: any) =>
        current?.id === classId
          ? { ...current, classTeacher: result.data?.classTeacher || null, _count: result.data?._count || current._count }
          : current
      );
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Class teacher could not be updated");
    } finally {
      setSavingClassTeacherId(null);
    }
  };

  const handleCreateSubject = async (
    classId: string,
    subject: { name: string; totalMarks: number; teacherId: string }
  ) => {
    if (!subject.name.trim()) {
      toast.error("Subject name is required");
      return false;
    }

    setCreatingSubjectClassId(classId);
    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          name: subject.name.trim(),
          totalMarks: subject.totalMarks || 100,
          teacherId: subject.teacherId || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Subject could not be created");
      toast.success("Subject added");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subject could not be created");
      return false;
    } finally {
      setCreatingSubjectClassId(null);
    }
  };

  const handleChangeSubjectTeacher = async (classId: string, subjectId: string, teacherId: string) => {
    setSavingSubjectId(subjectId);
    try {
      const res = await fetch("/api/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subjectId, teacherId: teacherId || null }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Subject teacher could not be updated");
      toast.success("Subject teacher updated");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subject teacher could not be updated");
    } finally {
      setSavingSubjectId(null);
    }
  };

  const handleApplyClassTeacherToSubjects = async (classId: string, classTeacherId: string, subjects: any[]) => {
    if (!classTeacherId) return toast.error("Select a class teacher first");
    if (!subjects.length) return toast.info("Add subjects first, then apply the class teacher.");

    setApplyingSubjectClassId(classId);
    try {
      const classRes = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, classTeacherId }),
      });
      const classResult = await classRes.json();
      if (!classRes.ok) throw new Error(classResult.error || "Class teacher could not be updated");

      await Promise.all(
        subjects.map(async (subject) => {
          const res = await fetch("/api/subjects", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: subject.id, teacherId: classTeacherId }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "One subject could not be updated");
        })
      );

      toast.success("Class teacher applied to all subjects");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Teacher assignment could not be applied");
    } finally {
      setApplyingSubjectClassId(null);
    }
  };

  const handleStaffAdded = async () => {
    setShowAddAdminForm(false);
    setShowAddPrincipalForm(false);
    await loadData();
  };

  const handleRemove = async (userId: string, label: string) => {
    if (userId === data?.currentUserId) {
      toast.info("Your owner account stays active so this campus remains manageable.");
      return;
    }

    setConfirmAction({
      title: `Revoke ${label} access?`,
      description: `This will remove the selected ${label.toLowerCase()} from this campus workspace.`,
      confirmLabel: "Revoke access",
      run: async () => {
        await removeStaff(userId);
        toast.success(`${label} access revoked`);
        await loadData();
      },
    });
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      await resendInvitation(inviteId);
      toast.success("Invitation resent");
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    setConfirmAction({
      title: "Cancel invitation?",
      description: "The invited person will no longer be able to use this invitation link.",
      confirmLabel: "Cancel invite",
      run: async () => {
        await cancelInvitation(inviteId);
        toast.success("Invitation cancelled");
        await loadData();
      },
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction.run();
      setConfirmAction(null);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleDeleteClass = (cls: any) => {
    setConfirmAction({
      title: `Delete ${classLabel(cls)}?`,
      description: "This will permanently remove this class and all its subjects if no marks exist. Students must be moved first.",
      confirmLabel: "Delete Class",
      run: async () => {
        const res = await fetch(`/api/classes?id=${cls.id}`, { method: "DELETE" });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Class could not be deleted");
        toast.success("Class deleted");
        setSelectedClass(null);
        await loadData();
      },
    });
  };

  const handleDeleteStudent = (student: any) => {
    setConfirmAction({
      title: `Delete ${student.fullName}?`,
      description: "This will permanently remove this student record. This cannot be undone.",
      confirmLabel: "Delete Student",
      run: async () => {
        const res = await fetch(`/api/students?id=${student.id}`, { method: "DELETE" });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Student could not be deleted");
        toast.success("Student deleted");
        setSelectedStudent(null);
        await loadData();
      },
    });
  };

  const handleDeleteSubject = (subject: any) => {
    setConfirmAction({
      title: `Delete ${subject.name}?`,
      description: "This will permanently remove this subject. Subjects with existing marks cannot be deleted.",
      confirmLabel: "Delete Subject",
      run: async () => {
        const res = await fetch(`/api/subjects?id=${subject.id}`, { method: "DELETE" });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Subject could not be deleted");
        toast.success("Subject deleted");
        await loadData();
      },
    });
  };

  const handleUpdateClass = async (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => {
    setSavingClassUpdate(true);
    try {
      const res = await fetch("/api/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Class could not be updated");
      toast.success("Class updated");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Class could not be updated");
    } finally {
      setSavingClassUpdate(false);
    }
  };

  const handleUpdateStudent = async (studentId: string, updates: Record<string, any>) => {
    setSavingStudentUpdate(true);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: studentId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Student could not be updated");
      toast.success("Student updated");
      setSelectedStudent((current: any) =>
        current?.id === studentId ? { ...current, ...result.data } : current
      );
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Student could not be updated");
    } finally {
      setSavingStudentUpdate(false);
    }
  };

  const handleUpdateSubject = async (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => {
    setSavingSubjectUpdateId(subjectId);
    try {
      const res = await fetch("/api/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subjectId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Subject could not be updated");
      toast.success("Subject updated");
      const nextData = await loadData();
      syncSelectedClass(nextData, classId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subject could not be updated");
    } finally {
      setSavingSubjectUpdateId(null);
    }
  };

  const handleUpdateTeacher = async (teacherId: string, updates: Record<string, any>) => {
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: teacherId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Teacher could not be updated");
      toast.success("Teacher updated");
      setSelectedTeacher((current: any) =>
        current?.id === teacherId ? { ...current, ...result.data } : current
      );
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Teacher could not be updated");
    }
  };

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Campus Control", active: activeView === "leadership", onClick: () => setActiveView("leadership") },
    { icon: School, label: "Academic Plan", active: activeView === "classes", onClick: () => setActiveView("classes") },
    { icon: Users, label: "Faculty Hub", active: activeView === "teachers", onClick: () => setActiveView("teachers") },
    { icon: GraduationCap, label: "Students", active: activeView === "students", onClick: () => setActiveView("students") },
    { icon: Sparkles, label: "AI Engine", active: activeView === "ai", onClick: () => setActiveView("ai") },
  ];
  const bottomItems: RoleNavItem[] = [
    { icon: HelpCircle, label: "Help Center", onClick: () => setShowHelpModal(true) },
    { icon: LogOut, label: "Logout", onClick: handleLogout },
  ];
  const adminAIFeatures = [
    { feature: "at_risk_students", label: "At-risk Students", placeholder: "Class, exam, or attendance focus" },
    { feature: "class_performance_summary", label: "Class Summary", placeholder: "Class or term" },
    { feature: "teacher_class_comparison", label: "Class Comparison", placeholder: "Classes or teachers to compare" },
    { feature: "intervention_suggestions", label: "Intervention", placeholder: "Student or class concern" },
    { feature: "pending_review_queue", label: "Review Queue", placeholder: "Optional priority note" },
  ];

  if (loading && !data) {
    return <AdminSkeleton standalone={true} />;
  }

  if (!data) return null;

  const canInvitePrincipal = !data.principal;

  return (
    <RoleShell
      tagline={data.isStandaloneCampus ? "Standalone Campus Owner" : "Joyful Management"}
      navItems={navItems}
      bottomItems={bottomItems}
      searchPlaceholder="Search campus records..."
      userName={data.adminName}
      userRole={data.isStandaloneCampus ? "Standalone Campus Owner" : data.roleLabel}
      avatarSeed={data.adminEmail || data.adminName}
      dashboardHref="/admin"
      headerActions={
        <div className="hidden xl:flex items-center gap-2">
          {data.canInviteAdmins ? (
            <BrandButton variant="soft" icon={<Shield className="w-4 h-4" />} onClick={() => openAddStaff("CAMPUS_ADMIN")}>
              Add Admin
            </BrandButton>
          ) : null}
          <BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={() => setShowClassModal(true)}>
            Add Class
          </BrandButton>
          <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openAdmissionForm()} disabled={data.classes.length === 0}>
            Add Student
          </BrandButton>
          {canInvitePrincipal ? (
            <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openAddStaff("PRINCIPAL")}>
              Add Principal
            </BrandButton>
          ) : null}
          <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddTeacherForm(true)}>
            Add Teacher
          </BrandButton>
        </div>
      }
    >
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
        <div className="p-7 px-9 border-b border-[#f3f4f9] bg-white z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase text-[#8127cf] tracking-normal mb-2">
              {data.campusName} {data.campusCity ? `- ${data.campusCity}` : ""}
            </p>
            <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal">{viewCopy[activeView].title}</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-[#4d4354]/60 leading-relaxed">
              {viewCopy[activeView].description}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 xl:hidden">
            {data.canInviteAdmins ? (
              <BrandButton variant="soft" icon={<Shield className="w-4 h-4" />} onClick={() => openAddStaff("CAMPUS_ADMIN")}>
                Add Admin
              </BrandButton>
            ) : null}
            <BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={() => setShowClassModal(true)}>
              Add Class
            </BrandButton>
            <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openAdmissionForm()} disabled={data.classes.length === 0}>
              Add Student
            </BrandButton>
            {canInvitePrincipal ? (
              <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openAddStaff("PRINCIPAL")}>
                Add Principal
              </BrandButton>
            ) : null}
            <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddTeacherForm(true)}>
              Add Teacher
            </BrandButton>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-5 mb-8">
            <StatCard icon={Building} label="Campus" value="1" onClick={() => setActiveView("leadership")} />
            <StatCard icon={Users} label="Students" value={data.studentCount} tone="green" onClick={() => setActiveView("students")} />
            <StatCard icon={BookOpen} label="Classes" value={data.classes.length} tone="rose" onClick={() => setActiveView("classes")} />
            <StatCard icon={School} label="Teachers" value={data.teachers.length} tone="purple" onClick={() => setActiveView("teachers")} />
            <StatCard icon={Shield} label="Admins" value={data.campusAdmins.length} tone="dark" onClick={() => setActiveView("leadership")} />
            <StatCard icon={Clock} label="Pending Invites" value={data.pendingInviteCount || 0} tone="purple" onClick={() => setActiveView("leadership")} />
          </div>

          {activeView === "leadership" ? (
            <LeadershipPanel
              data={data}
              onInviteAdmin={() => openAddStaff("CAMPUS_ADMIN")}
              onInvitePrincipal={() => openAddStaff("PRINCIPAL")}
              onRemove={handleRemove}
              onResend={handleResendInvite}
              onCancel={handleCancelInvite}
              onActivityLog={() => setShowActivityLogModal(true)}
            />
          ) : null}

          {activeView === "classes" ? (
            <AcademicPanel
              classes={data.classes}
              exams={data.recentExams}
              reports={data.recentReportCards}
              teachers={data.teachers}
              students={data.students}
              attendanceRecords={data.attendanceRecords}
              attendanceSummary={data.attendanceSummary}
              invoiceSummary={data.invoiceSummary}
              campusName={data.campusName}
              onAddClass={() => setShowClassModal(true)}
              onAddStudent={openAdmissionForm}
              onViewClass={setSelectedClass}
              onChangeTeacher={handleChangeClassTeacher}
              onDeleteClass={handleDeleteClass}
              onUpdateClass={handleUpdateClass}
              onDeleteSubject={handleDeleteSubject}
              onUpdateSubject={handleUpdateSubject}
            />
          ) : null}

          {activeView === "teachers" ? (
            <FacultyPanel
              teachers={data.teachers}
              pendingInvites={data.pendingTeacherInvitations}
              onInvite={() => setShowAddTeacherForm(true)}
              onRemove={(id) => handleRemove(id, "Teacher")}
              onViewTeacher={setSelectedTeacher}
              onResend={handleResendInvite}
              onCancel={handleCancelInvite}
            />
          ) : null}

          {activeView === "students" ? (
            <StudentsPanel
              students={data.students}
              classes={data.classes}
              onAddStudent={openAdmissionForm}
              onMoveStudent={openMoveStudent}
              onViewStudent={setSelectedStudent}
              onBulkImport={() => setShowBulkImportModal(true)}
              onExport={exportStudentsCSV}
            />
          ) : null}

          {activeView === "ai" ? (
            <AIPanel
              features={adminAIFeatures}
              insights={data.aiInsights}
              reviewItems={data.pendingAIReviewItems}
              onComplete={loadData}
            />
          ) : null}
        </div>
      </section>

      {showAddAdminForm && (
        <AddStaffForm role="CAMPUS_ADMIN" onSuccess={handleStaffAdded} onClose={() => setShowAddAdminForm(false)} />
      )}

      {showAddPrincipalForm && (
        <AddStaffForm role="PRINCIPAL" onSuccess={handleStaffAdded} onClose={() => setShowAddPrincipalForm(false)} />
      )}

      {showClassModal ? (
        <ClassModal
          form={classForm}
          teachers={data.teachers}
          busy={savingClass}
          onChange={setClassForm}
          onClose={() => setShowClassModal(false)}
          onSave={handleCreateClass}
        />
      ) : null}

      {showAdmissionForm && (
        <AdmissionForm
          classes={data.classes || []}
          classGroups={groupClasses(data.classes || [])}
          onSuccess={handleAdmissionSuccess}
          onClose={() => setShowAdmissionForm(false)}
        />
      )}

      {showAddTeacherForm && (
        <AddTeacherForm
          onSuccess={() => { setShowAddTeacherForm(false); loadData(); }}
          onClose={() => setShowAddTeacherForm(false)}
        />
      )}

      {movingStudent ? (
        <MoveStudentModal
          student={movingStudent}
          classes={data.classes}
          classId={moveClassId}
          busy={movingStudentBusy}
          onClassChange={setMoveClassId}
          onClose={() => setMovingStudent(null)}
          onSave={handleMoveStudent}
        />
      ) : null}

      {selectedClass ? (
        <ClassDetailModal
          cls={selectedClass}
          students={data.students.filter((student: any) => student.class?.id === selectedClass.id)}
          teachers={data.teachers}
          teacherBusy={savingClassTeacherId === selectedClass.id}
          subjectBusyId={savingSubjectId}
          creatingSubject={creatingSubjectClassId === selectedClass.id}
          applyingSubjects={applyingSubjectClassId === selectedClass.id}
          classUpdateBusy={savingClassUpdate}
          subjectUpdateBusyId={savingSubjectUpdateId}
          onClose={() => setSelectedClass(null)}
          onChangeTeacher={handleChangeClassTeacher}
          onCreateSubject={handleCreateSubject}
          onChangeSubjectTeacher={handleChangeSubjectTeacher}
          onApplyClassTeacherToSubjects={handleApplyClassTeacherToSubjects}
          onAddStudent={() => {
            setSelectedClass(null);
            openAdmissionForm();
          }}
          onViewStudent={(student) => {
            setSelectedClass(null);
            setSelectedStudent(student);
          }}
          onDeleteClass={handleDeleteClass}
          onUpdateClass={handleUpdateClass}
          onDeleteSubject={handleDeleteSubject}
          onUpdateSubject={handleUpdateSubject}
        />
      ) : null}

      {selectedStudent ? (
        <StudentDetailModal
          student={selectedStudent}
          busy={savingStudentUpdate}
          onClose={() => setSelectedStudent(null)}
          onMove={() => {
            openMoveStudent(selectedStudent);
            setSelectedStudent(null);
          }}
          onDelete={handleDeleteStudent}
          onUpdate={handleUpdateStudent}
        />
      ) : null}

      {selectedTeacher ? (
        <TeacherDetailModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} onUpdate={handleUpdateTeacher} />
      ) : null}

      <BulkImportDialog
        open={showBulkImportModal}
        onOpenChange={setShowBulkImportModal}
        classes={data.classes || []}
        defaultClassId={data.classes?.[0]?.id || ""}
        onSuccess={loadData}
      />

      {showActivityLogModal ? (
        <ActivityLogModal onClose={() => setShowActivityLogModal(false)} />
      ) : null}

      {showHelpModal ? <HelpModal onClose={() => setShowHelpModal(false)} /> : null}

      <ConfirmAction
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ""}
        description={confirmAction?.description || ""}
        confirmLabel={confirmAction?.confirmLabel || "Confirm"}
        tone="danger"
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
    </RoleShell>
  );
}

function LeadershipPanel({
  data,
  onInviteAdmin,
  onInvitePrincipal,
  onRemove,
  onResend,
  onCancel,
  onActivityLog,
}: {
  data: any;
  onInviteAdmin: () => void;
  onInvitePrincipal: () => void;
  onRemove: (id: string, label: string) => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
  onActivityLog?: () => void;
}) {
  const summary = [
    { icon: Shield, label: "Admins", value: data.campusAdmins?.length || 0, color: "from-[#8127cf]/10 to-[#b876f0]/5 text-[#8127cf]" },
    { icon: GraduationCap, label: "Principal", value: data.principal ? 1 : 0, color: data.principal ? "from-emerald-50 to-emerald-100/50 text-emerald-600" : "from-amber-50 to-amber-100/50 text-amber-600" },
    { icon: Clock, label: "Pending", value: data.pendingAdminInvitations?.length || 0, color: "from-amber-50 to-amber-100/50 text-amber-600" },
    { icon: Building, label: "Campus", value: data.campusName || "—", color: "from-[#fbf0fe] to-[#f3eeff] text-[#8127cf]" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#1f1a23] tracking-normal">Campus Control</h2>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">Manage campus ownership, admin access, and identity</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={onInviteAdmin}>
            Add Admin
          </BrandButton>
          <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={onInvitePrincipal}>
            Add Principal
          </BrandButton>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summary.map((s, i) => (
          <div
            key={i}
            className="relative rounded-2xl bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white border border-[#cfc2d6]/10 p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 overflow-hidden"
          >
            <div className="absolute -top-8 -right-8 w-16 h-16 bg-gradient-to-bl from-[#8127cf]/4 to-transparent rounded-full blur-[40px] pointer-events-none" />
            <div className="relative flex items-center justify-between mb-2">
              <p className="text-[8px] font-black uppercase tracking-wider text-[#4d4354]/40">{s.label}</p>
              <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-sm`}>
                <s.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="relative">
              <p className="text-2xl font-black text-[#1f1a23]">{s.value}</p>
              <div className="mt-1 h-1 w-full max-w-[40px] rounded-full bg-gradient-to-r from-[#8127cf] to-[#b876f0]" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <ManagementCard
          title="Campus Administrator"
          icon={Shield}
          description="Standalone campus ownership and operational control for this one campus."
          user={data.campusAdmin}
          emptyLabel="Add Admin"
          onAdd={onInviteAdmin}
          onRemove={data.campusAdmin?.id === data.currentUserId ? undefined : (id) => onRemove(id, "Admin")}
          onResendInvite={onResend}
          onCancelInvite={onCancel}
        />
        <ManagementCard
          title="Principal / Academic Head"
          icon={GraduationCap}
          description="Academic authority for teachers, exams, report cards, and parent-facing review."
          user={data.principal}
          emptyLabel="Add Principal"
          onAdd={onInvitePrincipal}
          onRemove={(id) => onRemove(id, "Principal")}
          onResendInvite={onResend}
          onCancelInvite={onCancel}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.9fr] gap-8">
        <AdminTeamPanel data={data} onInvite={onInviteAdmin} onRemove={onRemove} onResend={onResend} onCancel={onCancel} />
        <CampusIdentityPanel data={data} onActivityLog={onActivityLog} />
      </div>
    </div>
  );
}

function CampusIdentityPanel({ data, onActivityLog }: { data: any; onActivityLog?: () => void }) {
  const fields = [
    { icon: Building, label: "Campus", value: data.campusName },
    { icon: School, label: "School", value: data.schoolName },
    { icon: MapPin, label: "City", value: data.campusCity || "Not set" },
    { icon: FileText, label: "Reg ID", value: data.campusRegId || "Not set", copyable: true },
    { icon: GraduationCap, label: "Academic Year", value: data.academicYear || "Not set" },
    { icon: Users, label: "Students", value: `${data.studentCount || 0}` },
  ];
  return (
    <div className="relative group rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg transition-all duration-500 hover:shadow-2xl hover:border-[#8127cf]/20 overflow-hidden">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-bl from-[#8127cf]/5 to-transparent rounded-full blur-[70px] pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-gradient-to-tr from-[#b876f0]/4 to-transparent rounded-full blur-[60px] pointer-events-none" />
      <div className="relative">
        <CornerSparkles />
        <div className="mb-5 flex items-center justify-between gap-4">
          <PanelTitle icon={Building} title="Campus Identity" />
          <StatusPill status={data.isStandaloneCampus ? "Standalone" : "Campus"} />
        </div>
        <div className="grid grid-cols-1 gap-3">
          {fields.map((f, i) => (
            <div
              key={i}
              className="group/row flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#fbf0fe]/50 via-white to-[#fbf0fe]/20 px-4 py-3.5 border border-transparent transition-all hover:bg-[#fbf0fe]/80 hover:border-[#8127cf]/15 hover:shadow-sm"
            >
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 flex items-center justify-center text-[#8127cf] shrink-0 transition-all group-hover/row:from-[#8127cf] group-hover/row:to-[#b876f0] group-hover/row:text-white">
                <f.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-black uppercase tracking-wider text-[#4d4354]/40">{f.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm font-black text-[#1f1a23] truncate">{f.value}</p>
                  {f.copyable && f.value && f.value !== "Not set" ? (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(f.value)}
                      className="shrink-0 rounded-lg bg-white p-1 text-[#4d4354]/30 opacity-0 transition-all group-hover/row:opacity-100 hover:text-[#8127cf] hover:bg-[#8127cf]/10"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        {onActivityLog ? (
          <div className="mt-5">
            <BrandButton variant="soft" icon={<ClipboardList className="w-4 h-4" />} onClick={onActivityLog} className="w-full">
              View Activity Log
            </BrandButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AdminTeamPanel({
  data,
  onInvite,
  onRemove,
  onResend,
  onCancel,
}: {
  data: any;
  onInvite: () => void;
  onRemove: (id: string, label: string) => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const total = data.campusAdmins?.length || 0;
  const pending = data.pendingAdminInvitations?.length || 0;
  return (
    <div className="relative group rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg transition-all duration-500 hover:shadow-2xl hover:border-[#8127cf]/20 overflow-hidden">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-bl from-[#8127cf]/5 to-transparent rounded-full blur-[70px] pointer-events-none" />
      <div className="relative">
        <CornerSparkles />
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <PanelTitle icon={Shield} title="Admin Team" />
            {total > 0 ? (
              <span className="inline-flex items-center rounded-full bg-[#8127cf]/10 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#8127cf]">
                {total} active
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {pending > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-600">
                <Clock className="w-2.5 h-2.5" />
                {pending} pending
              </span>
            ) : null}
            {data.canInviteAdmins ? (
              <BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={onInvite}>
                Add Admin
              </BrandButton>
            ) : (
              <StatusPill status="Owner Managed" />
            )}
          </div>
        </div>
        <div className="space-y-3">
          {data.campusAdmins.map((admin: any) => (
            <AdminRow
              key={admin.id}
              admin={admin}
              currentUserId={data.currentUserId}
              onRemove={() => onRemove(admin.id, "Admin")}
            />
          ))}
          {data.pendingAdminInvitations.map((invite: any) => (
            <PendingFacultyRow
              key={invite.id}
              invite={invite}
              onResend={() => onResend(invite.id)}
              onCancel={() => onCancel(invite.id)}
            />
          ))}
          {total === 0 && pending === 0 ? (
            <EmptyInline text="No admin access is assigned yet." />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AcademicPanel({
  classes,
  exams,
  reports,
  teachers,
  students,
  attendanceRecords,
  attendanceSummary,
  invoiceSummary,
  campusName,
  onAddClass,
  onAddStudent,
  onViewClass,
  onChangeTeacher,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
}: {
  classes: any[];
  exams: any[];
  reports: any[];
  teachers: any[];
  students?: any[];
  attendanceRecords?: any[];
  attendanceSummary?: { present: number; absent: number; leave: number };
  invoiceSummary?: { total: number; totalAmount: number; byStatus: any[] };
  campusName?: string;
  onAddClass: () => void;
  onAddStudent: (classId?: string) => void;
  onViewClass: (cls: any) => void;
  onChangeTeacher: (classId: string, teacherId: string) => Promise<void>;
  onDeleteClass?: (cls: any) => void;
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>;
  onDeleteSubject?: (subject: any) => void;
  onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const classGroups = groupClasses(classes);
  const [showAllExams, setShowAllExams] = useState(false);
  const [showAllReports, setShowAllReports] = useState(false);
  const [generatingExamId, setGeneratingExamId] = useState<string | null>(null);
  const lockedExams = exams.filter((e) => e.isLocked);
  const displayExams = showAllExams ? exams : exams.slice(0, 6);
  const displayReports = showAllReports ? reports : reports.slice(0, 6);
  const totalCollected = invoiceSummary?.byStatus?.reduce((sum, g: any) => {
    const paid = g.status === "PAID" || g.status === "PARTIAL";
    return paid ? sum + (g._sum?.totalAmount || 0) : sum;
  }, 0) || 0;

  const generateReportCards = async (examId: string) => {
    setGeneratingExamId(examId);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", examId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Generation failed");
      toast.success("Report cards generated");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setGeneratingExamId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-end gap-3">
        <BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={onAddClass}>
          Add Class
        </BrandButton>
        <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => onAddStudent()} disabled={classes.length === 0}>
          Add Student
        </BrandButton>
      </div>

      <AttendanceView
        attendanceRecords={attendanceRecords || []}
        classes={classes}
        students={students || []}
        invoiceSummary={invoiceSummary}
        totalCollected={totalCollected}
      />

      {classGroups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {classGroups.map((group) => (
            <ClassGroupCard
              key={group.key}
              group={group}
              teachers={teachers}
              onAddStudent={onAddStudent}
              onViewClass={onViewClass}
              onChangeTeacher={onChangeTeacher}
              onDeleteClass={onDeleteClass}
              onUpdateClass={onUpdateClass}
              onDeleteSubject={onDeleteSubject}
              onUpdateSubject={onUpdateSubject}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No classes defined"
          description="Create classes during onboarding or from the class management flow."
          action={<BrandButton onClick={onAddClass}>Add Class</BrandButton>}
        />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <SnapshotColumn
          icon={FileText}
          title="Exam Cycles"
          after={exams.length > 6 ? (
            <button
              type="button"
              onClick={() => setShowAllExams(!showAllExams)}
              className="text-[9px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer"
            >
              {showAllExams ? "Show Less" : `View All (${exams.length})`}
            </button>
          ) : null}
        >
          {displayExams.map((exam: any) => (
            <div key={exam.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1f1a23]">{exam.title}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    {exam.term} - {classLabel(exam.class)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill status={exam.status} />
                  {exam.isLocked && exam._count?.reportCards === 0 ? (
                    <button
                      type="button"
                      onClick={() => generateReportCards(exam.id)}
                      disabled={generatingExamId === exam.id}
                      className="flex h-7 items-center gap-1 rounded-lg bg-[#8127cf] px-2 text-[8px] font-black uppercase tracking-normal text-white transition-all hover:bg-[#6a1fad] cursor-pointer disabled:opacity-50"
                    >
                      {generatingExamId === exam.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Generate"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {exams.length === 0 ? <EmptyInline text="No exam cycles available yet." /> : null}
        </SnapshotColumn>

        <SnapshotColumn
          icon={GraduationCap}
          title="Report Cards"
          after={reports.length > 6 ? (
            <button
              type="button"
              onClick={() => setShowAllReports(!showAllReports)}
              className="text-[9px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer"
            >
              {showAllReports ? "Show Less" : `View All (${reports.length})`}
            </button>
          ) : null}
        >
          {displayReports.map((report: any) => (
            <div key={report.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1f1a23]">{report.student?.fullName || "Student"}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    {report.exam?.title || "Report"} - {report.grade || Math.round(report.percentage || 0) + "%"}
                  </p>
                </div>
                <StatusPill status={report.status} />
              </div>
            </div>
          ))}
          {reports.length === 0 ? <EmptyInline text="Report cards will appear after exams are processed." /> : null}
        </SnapshotColumn>
      </div>
    </div>
  );
}

function AttendanceView({
  attendanceRecords,
  classes,
  students,
  invoiceSummary,
  totalCollected,
}: {
  attendanceRecords: any[];
  classes: any[];
  students: any[];
  invoiceSummary?: { total: number; totalAmount: number; byStatus: any[] };
  totalCollected: number;
}) {
  const sections = useMemo(() => classes.map((c) => ({ id: c.id, label: `${c.name} ${c.section || ""}`.trim() })), [classes]);
  const [selectedSectionId, setSelectedSectionId] = useState(sections[0]?.id || "");
  useEffect(() => { setSelectedSectionId((prev: string) => sections.some((s) => s.id === prev) ? prev : sections[0]?.id || ""); }, [sections]);
  const [open, setOpen] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dateAttendance, setDateAttendance] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [loadingInv, setLoadingInv] = useState(false);

  const sectionStudents = useMemo(() => students.filter((s) => s.class?.id === selectedSectionId), [students, selectedSectionId]);

  const fetchAttendance = useCallback(async (classId: string, date: string) => {
    setLoadingAtt(true);
    try {
      const res = await fetch(`/api/attendance?classId=${classId}&date=${date}`);
      const json = await res.json();
      if (json.success) setDateAttendance(json.students || []);
    } catch { /* ignore */ } finally { setLoadingAtt(false); }
  }, []);

  const fetchInvoices = useCallback(async (classId: string) => {
    setLoadingInv(true);
    try {
      const res = await fetch(`/api/billing/invoices?classId=${classId}`);
      const json = await res.json();
      if (json.success) setInvoices(json.invoices || []);
    } catch { /* ignore */ } finally { setLoadingInv(false); }
  }, []);

  useEffect(() => {
    if (selectedSectionId) {
      fetchAttendance(selectedSectionId, selectedDate);
      fetchInvoices(selectedSectionId);
    }
  }, [selectedSectionId, selectedDate, fetchAttendance, fetchInvoices]);

  const roster = dateAttendance;
  const present = roster.filter((s: any) => s.attendance?.status === "PRESENT").length;
  const absent = roster.filter((s: any) => s.attendance?.status === "ABSENT").length;
  const leave = roster.filter((s: any) => s.attendance?.status === "LEAVE").length;
  const unmarked = roster.filter((s: any) => !s.attendance).length;

  return (
    <div className={cn(
      "rounded-[32px] border bg-white shadow-lg transition-all",
      open
        ? "border-[#cfc2d6]/10 hover:border-[#8127cf]/20 hover:shadow-2xl"
        : "border-[#cfc2d6]/5 hover:border-[#8127cf]/10"
    )}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-all",
          open ? "p-5" : "px-4 py-3"
        )}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] shadow-sm transition-all",
            open ? "h-10 w-10" : "h-8 w-8"
          )}>
            <Users className={cn("transition-all", open ? "h-5 w-5" : "h-4 w-4")} />
          </div>
          <div className="min-w-0">
            <p className={cn("truncate font-black text-[#1f1a23] transition-all", open ? "text-base" : "text-sm")}>
              Attendance &amp; Fees
            </p>
            {open ? (
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                {sections.find((s) => s.id === selectedSectionId)?.label || "Select a section"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {sections.length > 1 ? (
            <select
              value={selectedSectionId}
              onChange={(e) => { e.stopPropagation(); setSelectedSectionId(e.target.value); }}
              onClick={(e) => e.stopPropagation()}
              className="h-9 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354] outline-none cursor-pointer border border-[#cfc2d6]/10"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          ) : null}
          <ChevronDown
            className={cn(
              "text-[#8127cf] transition-all duration-200 shrink-0",
              open ? "h-5 w-5 rotate-180" : "h-4 w-4"
            )}
          />
        </div>
      </button>

      {open ? (
        <div className="border-t border-[#cfc2d6]/10 px-5 pb-5 pt-4 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60">Attendance</p>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 rounded-lg border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354] outline-none cursor-pointer"
                />
              </div>
              {loadingAtt ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#8127cf]" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-normal text-emerald-700">P {present}</span>
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-normal text-rose-700">A {absent}</span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-normal text-amber-700">L {leave}</span>
                  <span className="rounded-full bg-[#f3f4f9] px-2 py-0.5 text-[8px] font-black uppercase tracking-normal text-[#4d4354]/60">? {unmarked}</span>
                </div>
              )}
            </div>
            {selectedSectionId && roster.length > 0 ? (
              <div className="max-h-80 overflow-y-auto rounded-2xl border border-[#cfc2d6]/10 divide-y divide-[#cfc2d6]/5">
                <div className="flex items-center gap-2 bg-[#fbf0fe]/40 px-4 py-2 text-[8px] font-black uppercase tracking-normal text-[#4d4354]/60 sticky top-0">
                  <span className="w-7 text-center">#</span>
                  <span className="flex-[2]">Student</span>
                  <span className="w-14 text-center">Date</span>
                  <span className="w-12 text-center">%</span>
                  <span className="w-20 text-center">Fee</span>
                  <span className="w-16 text-center">Balance</span>
                </div>
                {roster.map((entry: any, i: number) => {
                  const student = sectionStudents.find((s) => s.id === entry.id);
                  const totalAtt = student?.attendance?.length || 0;
                  const presentAtt = student?.attendance?.filter((a: any) => a.status === "PRESENT").length || 0;
                  const pct = totalAtt ? Math.round((presentAtt / totalAtt) * 100) : null;
                  const inv = invoices.find((inv) => inv.studentId === entry.id);
                  return (
                    <div key={entry.id} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                      <span className="w-7 text-center text-[#4d4354]/40 font-black">{i + 1}</span>
                      <span className="flex-[2] font-black text-[#1f1a23] truncate">{entry.fullName}</span>
                      <span className="w-14 flex justify-center">
                        {entry.attendance ? (
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-normal",
                            entry.attendance.status === "PRESENT" && "bg-emerald-50 text-emerald-700",
                            entry.attendance.status === "ABSENT" && "bg-rose-50 text-rose-700",
                            entry.attendance.status === "LEAVE" && "bg-amber-50 text-amber-700",
                          )}>
                            {entry.attendance.status === "PRESENT" ? "P" : entry.attendance.status === "ABSENT" ? "A" : "L"}
                          </span>
                        ) : (
                          <span className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/30">—</span>
                        )}
                      </span>
                      <span className="w-12 flex justify-center">
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[8px] font-black",
                          pct === null ? "text-[#4d4354]/30" : pct >= 80 ? "bg-emerald-50 text-emerald-700" : pct >= 60 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                        )}>
                          {pct !== null ? `${pct}%` : "—"}
                        </span>
                      </span>
                      <span className="w-20 flex justify-center">
                        {inv ? (
                          <StatusPill status={inv.status} />
                        ) : (
                          <span className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/30">—</span>
                        )}
                      </span>
                      <span className="w-16 text-right font-black text-[#1f1a23]">
                        {inv ? (inv.balanceDue || 0).toLocaleString() : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : selectedSectionId ? (
              <div className="rounded-2xl border border-[#cfc2d6]/10 px-4 py-6 text-center">
                <p className="text-[10px] font-bold text-[#4d4354]/45">{loadingAtt ? "Loading..." : "No students enrolled in this section."}</p>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[#cfc2d6]/10 pt-4">
            <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 mb-3">Fee Summary</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[#cfc2d6]/10 px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60">Total Invoices</p>
                <p className="mt-1 text-xl font-black text-[#1f1a23]">{invoiceSummary?.total ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-[#cfc2d6]/10 px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60">Total Collected</p>
                <p className="mt-1 text-xl font-black text-[#1f1a23]">{totalCollected ? `${(totalCollected / 100).toLocaleString()}` : "—"}</p>
              </div>
            </div>
            {invoiceSummary?.byStatus?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {invoiceSummary.byStatus.map((g: any) => (
                  <div key={g.status} className="rounded-xl bg-[#fbf0fe]/50 px-3 py-2">
                    <p className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/60">{g.status}</p>
                    <p className="text-xs font-black text-[#1f1a23]">{g._count} ({((g._sum?.totalAmount || 0) / 100).toLocaleString()})</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FacultyPanel({
  teachers,
  pendingInvites,
  onInvite,
  onRemove,
  onViewTeacher,
  onResend,
  onCancel,
}: {
  teachers: any[];
  pendingInvites: any[];
  onInvite: () => void;
  onRemove: (id: string) => void;
  onViewTeacher: (teacher: any) => void;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const filtered = teachers.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.fullName?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q);
  });

  if (teachers.length === 0 && pendingInvites.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No faculty records found"
        description="Invite teachers so subjects and classes can be assigned from the central model."
        action={<BrandButton onClick={onInvite}>Add Teacher</BrandButton>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-white px-4 h-12 w-full max-w-xs">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#4d4354]/40">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text" placeholder="Search teachers..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ml-2 h-full w-full bg-transparent border-none outline-none text-sm font-bold placeholder:text-[#4d4354]/35"
          />
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={onInvite}>
          Add Teacher
        </BrandButton>
      </div>
      {filtered.map((teacher: any) => (
        <FacultyRow key={teacher.id} teacher={teacher} onView={() => onViewTeacher(teacher)} onRemove={() => onRemove(teacher.id)} />
      ))}
      {!searchQuery.trim() ? pendingInvites.map((invite: any) => (
        <PendingFacultyRow
          key={invite.id}
          invite={invite}
          onResend={() => onResend(invite.id)}
          onCancel={() => onCancel(invite.id)}
        />
      )) : null}
      {filtered.length === 0 && teachers.length > 0 ? <EmptyInline text="No teachers match your search." /> : null}
    </div>
  );
}

function StudentsPanel({
  students,
  classes,
  onAddStudent,
  onMoveStudent,
  onViewStudent,
  onBulkImport,
  onExport,
}: {
  students: any[];
  classes: any[];
  onAddStudent: (classId?: string) => void;
  onMoveStudent: (student: any) => void;
  onViewStudent: (student: any) => void;
  onBulkImport?: () => void;
  onExport?: () => void;
}) {
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 12;
  const classGroups = groupClasses(classes);
  const selectedGroup = classGroups.find((group) => group.key === classFilter);
  const filteredStudents = students.filter((student) => {
    if (sectionFilter !== "all") return student.class?.id === sectionFilter;
    if (classFilter !== "all") return classGroupKey(student.class) === classFilter;
    return true;
  }).filter((student) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      student.fullName?.toLowerCase().includes(q) ||
      student.rollNo?.toLowerCase().includes(q) ||
      student.guardianName?.toLowerCase().includes(q) ||
      student.guardianPhone?.includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = filteredStudents.slice((safePage - 1) * perPage, safePage * perPage);

  useEffect(() => { setPage(1); }, [classFilter, sectionFilter, searchQuery]);

  if (students.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No students linked yet"
        description="Student profiles will appear here after classes and enrollment records are created."
        action={<BrandButton onClick={() => onAddStudent()} disabled={classes.length === 0}>Add Student</BrandButton>}
      />
    );
  }

  return (
    <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <PanelTitle icon={GraduationCap} title="Student Directory" />
          <div className="flex items-center gap-2">
            <BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={() => onAddStudent()}>
              Add Student
            </BrandButton>
            {onBulkImport ? (
              <BrandButton variant="soft" icon={<FileText className="w-4 h-4" />} onClick={onBulkImport}>
                Bulk Import
              </BrandButton>
            ) : null}
            {onExport ? (
              <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={onExport}>
                Export CSV
              </BrandButton>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Search</span>
            <div className="flex items-center rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 h-14 w-full">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#4d4354]/40">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text" placeholder="Search students..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ml-2 h-full w-full bg-transparent border-none outline-none text-sm font-bold placeholder:text-[#4d4354]/35"
              />
            </div>
          </div>
          <FormSelect
            label="Class"
            value={classFilter}
            onChange={(value) => {
              setClassFilter(value);
              setSectionFilter("all");
            }}
          >
            <option value="all">All classes</option>
            {classGroups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.name} - {group.academicYear}
              </option>
            ))}
          </FormSelect>
          <FormSelect label="Section" value={sectionFilter} onChange={setSectionFilter}>
            <option value="all">All sections</option>
            {(selectedGroup?.sections || classes).map((cls) => (
              <option key={cls.id} value={cls.id}>
                {classLabel(cls)}
              </option>
            ))}
          </FormSelect>
          <div className="pb-1.5">
            <StatusPill status={`${filteredStudents.length} Shown`} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {pagedStudents.map((student: any) => {
          const report = student.reportCards?.[0];
          const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;
          return (
            <div key={student.id} className="rounded-[24px] bg-white border border-[#cfc2d6]/10 p-5 shadow-sm transition-all hover:border-[#8127cf]/20 hover:shadow-lg hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-[#fbf0fe] shadow-sm">
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/40">
                      {student.rollNo} · {classLabel(student.class)}
                    </p>
                  </div>
                </div>
                <StatusPill status={report ? report.status : "NO_REPORT"} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MiniMetric label="Guardian" value={student.guardianName || "N/A"} />
                <MiniMetric label="Latest" value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} active />
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => onViewStudent(student)}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#fbf0fe] text-[10px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                >
                  View Profile
                </button>
                <button
                  type="button"
                  onClick={() => onMoveStudent(student)}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#fbf0fe] text-[10px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                >
                  Move Class
                </button>
              </div>
            </div>
          );
        })}
        {pagedStudents.length === 0 ? <EmptyInline text="No students match your search and filters." /> : null}
      </div>
      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-4 text-[10px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Previous
          </button>
          <span className="text-[10px] font-black uppercase tracking-normal text-[#4d4354]/50">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#f3f4f9] px-4 text-[10px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AIPanel({
  features,
  insights,
  reviewItems,
  onComplete,
}: {
  features: any[];
  insights: any[];
  reviewItems: any[];
  onComplete: () => void;
}) {
  const [showAllInsights, setShowAllInsights] = useState(false);
  const displayInsights = showAllInsights ? insights : insights?.slice(0, 5);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-8">
      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg relative overflow-hidden">
        <CornerSparkles />
        <AiActionPanel title="Campus AI" options={features} compact onComplete={onComplete} />
      </div>
      <div className="space-y-8">
        <SnapshotColumn icon={Sparkles} title="AI Review Queue">
          <AIReviewQueue items={reviewItems} onComplete={onComplete} />
        </SnapshotColumn>
        <SnapshotColumn
          icon={FileText}
          title="AI Insights"
          after={insights?.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAllInsights(!showAllInsights)}
              className="text-[9px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer"
            >
              {showAllInsights ? "Show Less" : `View All (${insights.length})`}
            </button>
          ) : null}
        >
          {displayInsights?.length ? (
            displayInsights.map((insight: any) => (
              <div key={insight.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">{insight.feature.replaceAll("_", " ")}</p>
                <p className="mt-1 text-sm font-black text-[#1f1a23]">{insight.title}</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-[#4d4354]/60">{insight.summary}</p>
              </div>
            ))
          ) : (
            <EmptyInline text="Class, review, and intervention drafts will appear here." />
          )}
        </SnapshotColumn>
      </div>
    </div>
  );
}

function ClassModal({
  form,
  teachers,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  form: ClassFormState;
  teachers: any[];
  busy: boolean;
  onChange: (form: ClassFormState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalFrame title="Add Class / Section" eyebrow="Academic setup" onClose={onClose}>
      <div className="space-y-4">
        <FormInput
          label="Class Name"
          value={form.name}
          placeholder="e.g. Grade 8"
          onChange={(value) => onChange({ ...form, name: value })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="Sections"
            value={form.section}
            placeholder="A, B, C"
            onChange={(value) => onChange({ ...form, section: value })}
          />
          <FormInput
            label="Academic Year"
            type="number"
            value={String(form.academicYear)}
            placeholder="2026"
            onChange={(value) => onChange({ ...form, academicYear: Number(value) || new Date().getFullYear() })}
          />
        </div>
        <FormSelect
          label="Class Teacher"
          value={form.classTeacherId}
          onChange={(value) => onChange({ ...form, classTeacherId: value })}
        >
          <option value="">Unassigned</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.fullName}
            </option>
          ))}
        </FormSelect>
      </div>
      <ModalActions busy={busy} busyLabel="Creating" actionLabel="Create Class Sections" onClose={onClose} onSave={onSave} />
    </ModalFrame>
  );
}

function StudentModal({
  form,
  classes,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  form: StudentFormState;
  classes: any[];
  busy: boolean;
  onChange: (form: StudentFormState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const classGroups = groupClasses(classes);
  const selectedClass = classes.find((cls) => cls.id === form.classId);
  const selectedGroupKey = selectedClass ? classGroupKey(selectedClass) : classGroups[0]?.key || "";
  const selectedGroup = classGroups.find((group) => group.key === selectedGroupKey);

  const selectClassGroup = (key: string) => {
    const group = classGroups.find((item) => item.key === key);
    onChange({ ...form, classId: group?.sections?.[0]?.id || "" });
  };

  return (
    <ModalFrame title="Add Student" eyebrow="Enrollment" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormSelect label="Class" value={selectedGroupKey} onChange={selectClassGroup}>
            <option value="">Select class</option>
            {classGroups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.name} - {group.academicYear}
              </option>
            ))}
          </FormSelect>
          <FormSelect label="Section" value={form.classId} onChange={(value) => onChange({ ...form, classId: value })}>
            <option value="">Select section</option>
            {(selectedGroup?.sections || []).map((cls) => (
              <option key={cls.id} value={cls.id}>
                Section {sectionLabel(cls)}
              </option>
            ))}
          </FormSelect>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="Student Name"
            value={form.fullName}
            placeholder="Full name"
            onChange={(value) => onChange({ ...form, fullName: value })}
          />
          <FormInput
            label="Roll No"
            value={form.rollNo}
            placeholder="e.g. 08-A-12"
            onChange={(value) => onChange({ ...form, rollNo: value })}
          />
        </div>
        <FormSelect label="Gender" value={form.gender} onChange={(value) => onChange({ ...form, gender: value as StudentFormState["gender"] })}>
          <option value="OTHER">Other</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </FormSelect>
        <FormInput
          label="Student Login Email"
          type="email"
          value={form.studentEmail}
          placeholder="student@example.com"
          onChange={(value) => onChange({ ...form, studentEmail: value })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="Guardian Name"
            value={form.guardianName}
            placeholder="Parent / guardian"
            onChange={(value) => onChange({ ...form, guardianName: value })}
          />
          <FormInput
            label="Guardian Phone"
            value={form.guardianPhone}
            placeholder="+92..."
            onChange={(value) => onChange({ ...form, guardianPhone: value })}
          />
        </div>
        <FormInput
          label="Guardian Email"
          type="email"
          value={form.guardianEmail}
          placeholder="parent@example.com"
          onChange={(value) => onChange({ ...form, guardianEmail: value })}
        />
      </div>
      <ModalActions busy={busy} busyLabel="Adding" actionLabel="Add Student" onClose={onClose} onSave={onSave} />
    </ModalFrame>
  );
}

function MoveStudentModal({
  student,
  classes,
  classId,
  busy,
  onClassChange,
  onClose,
  onSave,
}: {
  student: any;
  classes: any[];
  classId: string;
  busy: boolean;
  onClassChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const classGroups = groupClasses(classes);
  const selectedClass = classes.find((cls) => cls.id === classId);
  const selectedGroupKey = selectedClass ? classGroupKey(selectedClass) : classGroups[0]?.key || "";
  const selectedGroup = classGroups.find((group) => group.key === selectedGroupKey);

  const selectClassGroup = (key: string) => {
    const group = classGroups.find((item) => item.key === key);
    onClassChange(group?.sections?.[0]?.id || "");
  };

  return (
    <ModalFrame title="Move Student" eyebrow="Class placement" onClose={onClose}>
      <div className="rounded-3xl bg-[#fbf0fe]/65 p-5 mb-5">
        <p className="text-sm font-black text-[#1f1a23]">{student.fullName}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
          Current: {classLabel(student.class)}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormSelect label="New Class" value={selectedGroupKey} onChange={selectClassGroup}>
          <option value="">Select class</option>
          {classGroups.map((group) => (
            <option key={group.key} value={group.key}>
              {group.name} - {group.academicYear}
            </option>
          ))}
        </FormSelect>
        <FormSelect label="New Section" value={classId} onChange={onClassChange}>
          <option value="">Select section</option>
          {(selectedGroup?.sections || []).map((cls) => (
            <option key={cls.id} value={cls.id}>
              Section {sectionLabel(cls)}
            </option>
          ))}
        </FormSelect>
      </div>
      <ModalActions busy={busy} busyLabel="Moving" actionLabel="Move Student" onClose={onClose} onSave={onSave} />
    </ModalFrame>
  );
}

function inferTeachingMode(cls: any): "single" | "subject" {
  const classTeacherId = cls.classTeacher?.id || "";
  const hasSeparateSubjectTeacher = (cls.subjects || []).some(
    (subject: any) => subject.teacher?.id && subject.teacher.id !== classTeacherId
  );
  return hasSeparateSubjectTeacher ? "subject" : "single";
}

function subjectTeacherDefaults(cls: any) {
  const subjects: any[] = cls.subjects || [];
  return subjects.reduce<Record<string, string>>((acc, subject) => {
    acc[subject.id] = subject.teacher?.id || "";
    return acc;
  }, {});
}

function ClassDetailModal({
  cls,
  students,
  teachers,
  teacherBusy,
  subjectBusyId,
  creatingSubject,
  applyingSubjects,
  classUpdateBusy,
  subjectUpdateBusyId,
  onClose,
  onChangeTeacher,
  onCreateSubject,
  onChangeSubjectTeacher,
  onApplyClassTeacherToSubjects,
  onAddStudent,
  onViewStudent,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
}: {
  cls: any;
  students: any[];
  teachers: any[];
  teacherBusy: boolean;
  subjectBusyId: string | null;
  creatingSubject: boolean;
  applyingSubjects: boolean;
  classUpdateBusy: boolean;
  subjectUpdateBusyId: string | null;
  onClose: () => void;
  onChangeTeacher: (classId: string, classTeacherId: string) => void;
  onCreateSubject: (classId: string, subject: { name: string; totalMarks: number; teacherId: string }) => Promise<boolean>;
  onChangeSubjectTeacher: (classId: string, subjectId: string, teacherId: string) => void;
  onApplyClassTeacherToSubjects: (classId: string, classTeacherId: string, subjects: any[]) => void;
  onAddStudent: () => void;
  onViewStudent: (student: any) => void;
  onDeleteClass: (cls: any) => void;
  onUpdateClass: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>;
  onDeleteSubject: (subject: any) => void;
  onUpdateSubject: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const [classTeacherId, setClassTeacherId] = useState(cls.classTeacher?.id || "");
  const [teachingMode, setTeachingMode] = useState<"single" | "subject">(inferTeachingMode(cls));
  const [subjectTeacherIds, setSubjectTeacherIds] = useState<Record<string, string>>(subjectTeacherDefaults(cls));
  const [subjectName, setSubjectName] = useState("");
  const [subjectMarks, setSubjectMarks] = useState("100");
  const [newSubjectTeacherId, setNewSubjectTeacherId] = useState(cls.classTeacher?.id || "");
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editSubjectName, setEditSubjectName] = useState("");
  const [editSubjectMarks, setEditSubjectMarks] = useState("100");

  useEffect(() => {
    setClassTeacherId(cls.classTeacher?.id || "");
    setTeachingMode(inferTeachingMode(cls));
    setSubjectTeacherIds(subjectTeacherDefaults(cls));
    setNewSubjectTeacherId(cls.classTeacher?.id || "");
  }, [cls.id, cls.classTeacher?.id, cls.subjects]);

  const createSubject = async () => {
    const created = await onCreateSubject(cls.id, {
      name: subjectName,
      totalMarks: Number(subjectMarks) || 100,
      teacherId: newSubjectTeacherId,
    });
    if (created) {
      setSubjectName("");
      setSubjectMarks("100");
    }
  };

  const [editingClass, setEditingClass] = useState(false);
  const [editClassName, setEditClassName] = useState(cls.name || "");
  const [editClassSection, setEditClassSection] = useState(cls.section || "");
  const [editClassAcademicYear, setEditClassAcademicYear] = useState(String(cls.academicYear || new Date().getFullYear()));

  useEffect(() => {
    if (!editingClass) {
      setEditClassName(cls.name || "");
      setEditClassSection(cls.section || "");
      setEditClassAcademicYear(String(cls.academicYear || new Date().getFullYear()));
    }
  }, [cls.id, editingClass]);

  const saveClassEdit = async () => {
    await onUpdateClass(cls.id, {
      name: editClassName,
      section: editClassSection,
      academicYear: Number(editClassAcademicYear) || new Date().getFullYear(),
    });
    setEditingClass(false);
  };

  const startEditingSubject = (subject: any) => {
    setEditingSubjectId(subject.id);
    setEditSubjectName(subject.name);
    setEditSubjectMarks(String(subject.totalMarks || 100));
  };

  const saveEditingSubject = async (subjectId: string) => {
    await onUpdateSubject(cls.id, subjectId, {
      name: editSubjectName,
      totalMarks: Number(editSubjectMarks) || 100,
    });
    setEditingSubjectId(null);
  };

  return (
    <ModalFrame title={classLabel(cls)} eyebrow="Class profile" onClose={onClose} wide>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDeleteClass(cls)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-rose-50 px-3 text-[10px] font-black uppercase tracking-normal text-rose-600 transition-all hover:bg-rose-100 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Class
          </button>
          <button
            type="button"
            onClick={() => setEditingClass(!editingClass)}
            className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-normal transition-all cursor-pointer ${
              editingClass ? "bg-[#f3f4f9] text-[#4d4354]/60" : "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e0f8]"
            }`}
          >
            {editingClass ? "Cancel" : "Edit Class"}
          </button>
        </div>
      </div>

      {editingClass ? (
        <div className="mb-4 rounded-3xl bg-[#fbf0fe]/65 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormInput label="Class Name" value={editClassName} placeholder="e.g. Class 10" onChange={setEditClassName} />
            <FormInput label="Section" value={editClassSection} placeholder="e.g. A" onChange={setEditClassSection} />
            <FormInput label="Academic Year" type="number" value={editClassAcademicYear} placeholder="2026" onChange={setEditClassAcademicYear} />
          </div>
          <div className="flex justify-end">
            <BrandButton variant="dark" className="h-12" onClick={saveClassEdit} disabled={classUpdateBusy}>
              {classUpdateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Class Details"}
            </BrandButton>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniMetric label="Students" value={students.length} active />
        <MiniMetric label="Subjects" value={cls._count?.subjects || cls.subjects?.length || 0} />
        <MiniMetric label="Academic Year" value={cls.academicYear || "N/A"} />
      </div>

      <div className="mt-5 rounded-3xl bg-[#fbf0fe]/65 p-5">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Class Teacher</p>
            <p className="mt-1 text-base font-black text-[#1f1a23]">{cls.classTeacher?.fullName || "Unassigned"}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
              {cls.classTeacher?.email || "Assign a teacher to make this roster visible in the teacher dashboard."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-2xl bg-white p-1 shadow-sm">
              {(["single", "subject"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTeachingMode(mode)}
                  className={`h-10 cursor-pointer rounded-xl px-4 text-[10px] font-black uppercase tracking-normal transition-all ${
                    teachingMode === mode ? "bg-[#8127cf] text-white shadow-md" : "text-[#4d4354]/50 hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                  }`}
                >
                  {mode === "single" ? "One Teacher" : "Subject Teachers"}
                </button>
              ))}
            </div>
            {cls.classTeacher?.profileImageUrl ? (
              <div className="hidden h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-white shadow-sm sm:block">
                <img src={cls.classTeacher.profileImageUrl} alt="" className="h-full w-full object-cover" />
              </div>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <FormSelect label="Change Class Teacher" value={classTeacherId} onChange={setClassTeacherId}>
            <option value="">Unassigned</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName}
              </option>
            ))}
          </FormSelect>
          <BrandButton
            variant="dark"
            className="h-14"
            onClick={() => onChangeTeacher(cls.id, classTeacherId)}
            disabled={teacherBusy || classTeacherId === (cls.classTeacher?.id || "")}
          >
            {teacherBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Teacher"}
          </BrandButton>
        </div>
        {teachingMode === "single" ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold leading-relaxed text-[#4d4354]/55">
              This keeps the same teacher responsible for the class and every subject in the class.
            </p>
            <BrandButton
              variant="soft"
              className="h-12 shrink-0"
              onClick={() => onApplyClassTeacherToSubjects(cls.id, classTeacherId, cls.subjects || [])}
              disabled={applyingSubjects || !classTeacherId || !cls.subjects?.length}
            >
              {applyingSubjects ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply To Subjects"}
            </BrandButton>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-white/70 p-4 text-xs font-bold leading-relaxed text-[#4d4354]/55">
            Each subject can be assigned to a different teacher. Those teachers will see their subjects, marks, and attendance tools in their own dashboard.
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={BookOpen} title="Subjects" />
            <StatusPill status={`${cls.subjects?.length || 0} Listed`} />
          </div>
          <div className="space-y-3">
            {cls.subjects?.map((subject: any) => {
              const selectedTeacherId = subjectTeacherIds[subject.id] ?? "";
              const isEditing = editingSubjectId === subject.id;
              return (
                <div key={subject.id} className="rounded-2xl bg-[#fbf0fe]/55 p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <FormInput label="Subject Name" value={editSubjectName} placeholder="Subject name" onChange={setEditSubjectName} />
                        <FormInput label="Total Marks" type="number" value={editSubjectMarks} placeholder="100" onChange={setEditSubjectMarks} />
                      </div>
                      <div className="flex gap-2">
                        <BrandButton
                          variant="dark"
                          className="h-11 flex-1"
                          onClick={() => saveEditingSubject(subject.id)}
                          disabled={subjectUpdateBusyId === subject.id}
                        >
                          {subjectUpdateBusyId === subject.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </BrandButton>
                        <button
                          type="button"
                          onClick={() => setEditingSubjectId(null)}
                          className="h-11 rounded-xl bg-[#f3f4f9] px-4 text-[10px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#1f1a23]">{subject.name}</p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                            {subject.teacher?.fullName || "Teacher unassigned"} {subject.totalMarks ? `- ${subject.totalMarks} marks` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusPill status={subject.teacher?.id ? "Assigned" : "Unassigned"} />
                          <button
                            type="button"
                            onClick={() => startEditingSubject(subject)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-[#8127cf] cursor-pointer"
                            title="Edit subject"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSubject(subject)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-rose-500 cursor-pointer"
                            title="Delete subject"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {teachingMode === "subject" ? (
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                          <FormSelect
                            label="Subject Teacher"
                            value={selectedTeacherId}
                            onChange={(value) => setSubjectTeacherIds((current) => ({ ...current, [subject.id]: value }))}
                          >
                            <option value="">Unassigned</option>
                            {teachers.map((teacher) => (
                              <option key={teacher.id} value={teacher.id}>
                                {teacher.fullName}
                              </option>
                            ))}
                          </FormSelect>
                          <BrandButton
                            variant="dark"
                            className="h-14"
                            onClick={() => onChangeSubjectTeacher(cls.id, subject.id, selectedTeacherId)}
                            disabled={subjectBusyId === subject.id || selectedTeacherId === (subject.teacher?.id || "")}
                          >
                            {subjectBusyId === subject.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                          </BrandButton>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
            {!cls.subjects?.length ? <EmptyInline text="No subjects are attached to this class yet." /> : null}
          </div>

          <div className="mt-4 rounded-3xl border border-[#cfc2d6]/10 bg-white p-4">
            <PanelTitle icon={Plus} title="Add Subject" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormInput label="Subject Name" value={subjectName} placeholder="e.g. Mathematics" onChange={setSubjectName} />
              <FormInput label="Total Marks" type="number" value={subjectMarks} placeholder="100" onChange={setSubjectMarks} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <FormSelect label="Initial Teacher" value={newSubjectTeacherId} onChange={setNewSubjectTeacherId}>
                <option value="">Unassigned</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.fullName}
                  </option>
                ))}
              </FormSelect>
              <BrandButton variant="dark" className="h-14" onClick={createSubject} disabled={creatingSubject}>
                {creatingSubject ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Subject"}
              </BrandButton>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={GraduationCap} title="Students" />
            <BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={onAddStudent}>
              Add
            </BrandButton>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            {students.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => onViewStudent(student)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-[#fbf0fe]/55 px-4 py-3 text-left transition-all hover:bg-white hover:shadow-md"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-white shadow-sm">
                  <img
                    src={student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    Roll {student.rollNo} - Guardian {student.guardianName || "N/A"}
                  </p>
                </div>
              </button>
            ))}
            {students.length === 0 ? <EmptyInline text="No students are enrolled in this class yet." /> : null}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

function StudentDetailModal({
  student,
  busy,
  onClose,
  onMove,
  onDelete,
  onUpdate,
}: {
  student: any;
  busy: boolean;
  onClose: () => void;
  onMove: () => void;
  onDelete: (student: any) => void;
  onUpdate: (studentId: string, updates: Record<string, any>) => Promise<void>;
}) {
  const report = student.reportCards?.[0];
  const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    setEdits({
      fullName: student.fullName || "",
      nameUr: student.nameUr || "",
      rollNo: student.rollNo || "",
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split("T")[0] : "",
      gender: student.gender || "",
      bloodType: student.bloodType || "",
      nationality: student.nationality || "",
      phone: student.phone || "",
      guardianName: student.guardianName || "",
      guardianNameUr: student.guardianNameUr || "",
      guardianPhone: student.guardianPhone || "",
      guardianEmail: student.guardianEmail || "",
      guardianRelationship: student.guardianRelationship || "",
      guardianOccupation: student.guardianOccupation || "",
      city: student.city || "",
      province: student.province || "",
      postalCode: student.postalCode || "",
      address: student.address || "",
      medicalNotes: student.medicalNotes || "",
      specialNeeds: student.specialNeeds || "",
      allergies: student.allergies || "",
      medications: student.medications || "",
      previousSchool: student.previousSchool || "",
    });
  }, [student.id]);

  const ed = (field: string) => edits[field] || "";
  const setEd = (field: string, value: string) => setEdits((p) => ({ ...p, [field]: value }));

  const saveEdits = async () => {
    const updates: Record<string, any> = {};
    const strFields = [
      "fullName", "nameUr", "rollNo", "gender", "bloodType", "nationality", "phone",
      "guardianName", "guardianNameUr", "guardianPhone", "guardianEmail",
      "guardianRelationship", "guardianOccupation",
      "city", "province", "postalCode", "address",
      "medicalNotes", "specialNeeds", "allergies", "medications", "previousSchool",
    ];
    for (const f of strFields) updates[f] = edits[f] || null;
    if (edits.fullName) updates.fullName = edits.fullName;
    if (edits.rollNo) updates.rollNo = edits.rollNo;
    if (edits.dateOfBirth) updates.dateOfBirth = edits.dateOfBirth;
    await onUpdate(student.id, updates);
    setEditing(false);
  };

  const formatDob = (d: any) => {
    if (!d) return "N/A";
    try { return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" }); } catch { return "N/A"; }
  };

  const genderLabel = (g: string) => {
    if (g === "MALE") return "Male";
    if (g === "FEMALE") return "Female";
    if (g === "OTHER") return "Other";
    return g || "N/A";
  };

  const relationshipLabel = (r: string) => {
    const map: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian", UNCLE: "Uncle", AUNT: "Aunt", GRANDPARENT: "Grandparent", SIBLING: "Sibling" };
    return map[r] || r || "N/A";
  };

  return (
    <ModalFrame title={student.fullName} eyebrow="Student profile" onClose={onClose} wide>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onDelete(student)} className="flex h-9 items-center gap-1.5 rounded-xl bg-rose-50 px-3 text-[10px] font-black uppercase tracking-normal text-rose-600 transition-all hover:bg-rose-100 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />Delete Student
          </button>
        </div>
        <button type="button" onClick={() => setEditing(!editing)} className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-normal transition-all cursor-pointer ${editing ? "bg-[#f3f4f9] text-[#4d4354]/60" : "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e0f8]"}`}>
          <Pencil className="h-3.5 w-3.5" />{editing ? "Cancel" : "Edit Details"}
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#fbf0fe]/65 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Full Name (English)" value={ed("fullName")} placeholder="Student name" onChange={(v) => setEd("fullName", v)} />
                <FormInput label="Full Name (Urdu)" value={ed("nameUr")} placeholder="اردو نام" onChange={(v) => setEd("nameUr", v)} />
              </div>
              <FormInput label="Roll Number" value={ed("rollNo")} placeholder="Roll number" onChange={(v) => setEd("rollNo", v)} />
            </div>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Student Record</p>
              <h3 className="mt-1 truncate text-3xl font-black tracking-normal text-[#1f1a23]">{student.fullName}</h3>
              {student.nameUr ? <p className="mt-0.5 text-lg font-semibold text-[#4d4354]/70" dir="rtl">{student.nameUr}</p> : null}
              <p className="mt-2 text-sm font-semibold uppercase tracking-normal text-[#4d4354]/55">
                {student.rollNo || "No roll number"} - {classLabel(student.class)}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Roll No" value={student.rollNo || "N/A"} active />
        <MiniMetric label="Class" value={classLabel(student.class)} />
        <MiniMetric label="Status" value={student.status === "active" ? "Active" : student.status || "Active"} />
        <MiniMetric label="Latest Result" value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal Info */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={User} title="Personal Info" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Date of Birth" value={ed("dateOfBirth")} placeholder="YYYY-MM-DD" onChange={(v) => setEd("dateOfBirth", v)} />
              <FormSelect label="Gender" value={ed("gender")} onChange={(v) => setEd("gender", v)}>
                <option value="">Not specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </FormSelect>
              <FormSelect label="Blood Type" value={ed("bloodType")} onChange={(v) => setEd("bloodType", v)}>
                <option value="">Not known</option>
                {["A+","A-","B+","B-","O+","O-","AB+","AB-"].map((bt) => <option key={bt} value={bt}>{bt}</option>)}
              </FormSelect>
              <FormInput label="Nationality" value={ed("nationality")} placeholder="Pakistan" onChange={(v) => setEd("nationality", v)} />
              <FormInput label="Phone" value={ed("phone")} placeholder="+92 300 1234567" onChange={(v) => setEd("phone", v)} />
              <FormInput label="Previous School" value={ed("previousSchool")} placeholder="Previous school" onChange={(v) => setEd("previousSchool", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Student Login" value={student.studentUser?.email || "Not linked"} />
              <DetailRow label="Date of Birth" value={formatDob(student.dateOfBirth)} />
              <DetailRow label="Gender" value={genderLabel(student.gender)} />
              <DetailRow label="Blood Type" value={student.bloodType || "N/A"} />
              <DetailRow label="Nationality" value={student.nationality || "N/A"} />
              <DetailRow label="Phone" value={student.phone || "N/A"} />
              <DetailRow label="Previous School" value={student.previousSchool || "N/A"} />
              <DetailRow label="Enrolled" value={formatDob(student.enrollmentDate)} />
            </div>
          )}
        </div>

        {/* Guardian Details */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Users} title="Guardian" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Name (English)" value={ed("guardianName")} placeholder="Guardian name" onChange={(v) => setEd("guardianName", v)} />
                <FormInput label="Name (Urdu)" value={ed("guardianNameUr")} placeholder="سرپرست کا نام" onChange={(v) => setEd("guardianNameUr", v)} />
              </div>
              <FormSelect label="Relationship" value={ed("guardianRelationship")} onChange={(v) => setEd("guardianRelationship", v)}>
                <option value="">Select</option>
                {["FATHER","MOTHER","GUARDIAN","UNCLE","AUNT","GRANDPARENT","SIBLING"].map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
              </FormSelect>
              <FormInput label="Occupation" value={ed("guardianOccupation")} placeholder="Occupation" onChange={(v) => setEd("guardianOccupation", v)} />
              <FormInput label="Phone" value={ed("guardianPhone")} placeholder="Guardian phone" onChange={(v) => setEd("guardianPhone", v)} />
              <FormInput label="Email" value={ed("guardianEmail")} placeholder="Guardian email" onChange={(v) => setEd("guardianEmail", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Name" value={student.guardianName || "N/A"} />
              {student.guardianNameUr ? <DetailRow label="Name (Urdu)" value={<span dir="rtl">{student.guardianNameUr}</span>} /> : null}
              <DetailRow label="Relationship" value={relationshipLabel(student.guardianRelationship)} />
              <DetailRow label="Occupation" value={student.guardianOccupation || "N/A"} />
              <DetailRow label="Phone" value={student.guardianPhone || student.guardianWhatsapp || "N/A"} />
              <DetailRow label="Email" value={student.guardianEmail || "N/A"} />
            </div>
          )}
        </div>

        {/* Address */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={MapPin} title="Address" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Address" value={ed("address")} placeholder="Street address" onChange={(v) => setEd("address", v)} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="City" value={ed("city")} placeholder="City" onChange={(v) => setEd("city", v)} />
                <FormInput label="Province" value={ed("province")} placeholder="Province" onChange={(v) => setEd("province", v)} />
              </div>
              <FormInput label="Postal Code" value={ed("postalCode")} placeholder="Postal code" onChange={(v) => setEd("postalCode", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Address" value={student.address || "N/A"} />
              <DetailRow label="City" value={student.city || "N/A"} />
              <DetailRow label="Province" value={student.province || "N/A"} />
              <DetailRow label="Postal Code" value={student.postalCode || "N/A"} />
            </div>
          )}
        </div>

        {/* Medical & Report */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Heart} title="Medical & Health" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Medical Notes" value={ed("medicalNotes")} placeholder="Medical conditions" onChange={(v) => setEd("medicalNotes", v)} />
              <FormInput label="Special Needs" value={ed("specialNeeds")} placeholder="Special needs" onChange={(v) => setEd("specialNeeds", v)} />
              <FormInput label="Allergies" value={ed("allergies")} placeholder="Allergies" onChange={(v) => setEd("allergies", v)} />
              <FormInput label="Medications" value={ed("medications")} placeholder="Medications" onChange={(v) => setEd("medications", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Medical Notes" value={student.medicalNotes || "None"} />
              <DetailRow label="Special Needs" value={student.specialNeeds || "None"} />
              <DetailRow label="Allergies" value={student.allergies || "None"} />
              <DetailRow label="Medications" value={student.medications || "None"} />
            </div>
          )}
        </div>
      </div>

      {/* Report Card */}
      <div className="mt-5 rounded-3xl bg-[#fbf0fe]/60 p-5">
        <PanelTitle icon={FileText} title="Report Card" />
        {report ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DetailRow label="Exam" value={report.exam?.title || "N/A"} />
            <DetailRow label="Status" value={<StatusPill status={report.status} />} />
            <DetailRow label="Generated" value={formatDate(report.generatedAt)} />
          </div>
        ) : (
          <div className="mt-4">
            <EmptyInline text="No report card has been generated for this student yet." />
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {editing ? (
          <BrandButton variant="dark" className="h-12" onClick={saveEdits} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </BrandButton>
        ) : null}
        <BrandButton variant="soft" icon={<School className="w-4 h-4" />} onClick={onMove}>
          Move Class / Section
        </BrandButton>
      </div>
    </ModalFrame>
  );
}

function TeacherDetailModal({ teacher, onClose, onUpdate }: { teacher: any; onClose: () => void; onUpdate?: (teacherId: string, updates: Record<string, any>) => Promise<void> }) {
  const ledClasses = teacher.ledClasses || [];
  const taughtSubjects = teacher.taughtSubjects || [];
  const avatar = teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teacher.fullName)}`;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEdits({
      fullName: teacher.fullName || "",
      phone: teacher.phone || "",
      cnic: teacher.cnic || "",
      dateOfBirth: teacher.dateOfBirth ? new Date(teacher.dateOfBirth).toISOString().split("T")[0] : "",
      gender: teacher.gender || "",
      qualification: teacher.qualification || "",
      specialization: teacher.specialization || "",
      experience: teacher.experience || "",
      joiningDate: teacher.joiningDate ? new Date(teacher.joiningDate).toISOString().split("T")[0] : "",
      address: teacher.address || "",
      city: teacher.city || "",
      province: teacher.province || "",
      postalCode: teacher.postalCode || "",
      emergencyContact: teacher.emergencyContact || "",
      emergencyPhone: teacher.emergencyPhone || "",
    });
  }, [teacher.id]);

  const ed = (field: string) => edits[field] || "";
  const setEd = (field: string, value: string) => setEdits((p) => ({ ...p, [field]: value }));

  const saveEdits = async () => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      const strFields = [
        "fullName", "phone", "cnic", "gender", "qualification", "specialization",
        "experience", "address", "city", "province", "postalCode",
        "emergencyContact", "emergencyPhone",
      ];
      for (const f of strFields) updates[f] = edits[f] || null;
      if (edits.fullName) updates.fullName = edits.fullName;
      if (edits.dateOfBirth) updates.dateOfBirth = edits.dateOfBirth;
      if (edits.joiningDate) updates.joiningDate = edits.joiningDate;
      await onUpdate(teacher.id, updates);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: any) => {
    if (!d) return "N/A";
    try { return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" }); } catch { return "N/A"; }
  };

  const genderLabel = (g: string) => {
    if (g === "MALE") return "Male";
    if (g === "FEMALE") return "Female";
    if (g === "OTHER") return "Other";
    return g || "N/A";
  };

  return (
    <ModalFrame title={teacher.fullName} eyebrow="Teacher profile" onClose={onClose} wide>
      <div className="mb-4 flex justify-end">
        {onUpdate ? (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-normal transition-all cursor-pointer ${
              editing ? "bg-[#f3f4f9] text-[#4d4354]/60" : "bg-[#fbf0fe] text-[#8127cf] hover:bg-[#f0e0f8]"
            }`}
          >
            <Pencil className="h-3 w-3" />
            {editing ? "Cancel" : "Edit Details"}
          </button>
        ) : null}
      </div>

      {/* ── Header Card ── */}
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#fbf0fe]/65 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <FormInput label="Full Name" value={ed("fullName")} placeholder="Teacher name" onChange={(v) => setEd("fullName", v)} />
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Faculty Record</p>
              <h3 className="mt-1 truncate text-3xl font-black tracking-normal text-[#1f1a23]">{teacher.fullName}</h3>
              <p className="mt-2 text-sm font-semibold uppercase tracking-normal text-[#4d4354]/55">
                {teacher.email || "No email"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniMetric label="Subjects" value={teacher._count?.taughtSubjects || taughtSubjects.length} active />
        <MiniMetric label="Class Teacher" value={teacher._count?.ledClasses || ledClasses.length} />
        <MiniMetric label="Status" value={teacher.isActive ? "Active" : "Inactive"} />
        <MiniMetric label="Onboarding" value={teacher.onboardingComplete ? "Done" : "Pending"} />
      </div>

      {/* ── Profile Sections ── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal Info */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={User} title="Personal Info" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Email" value={teacher.email || ""} placeholder="Email" onChange={() => {}} />
              <FormInput label="Phone" value={ed("phone")} placeholder="+92 300 1234567" onChange={(v) => setEd("phone", v)} />
              <FormInput label="CNIC" value={ed("cnic")} placeholder="12345-1234567-1" onChange={(v) => setEd("cnic", v)} />
              <FormInput label="Date of Birth" value={ed("dateOfBirth")} placeholder="YYYY-MM-DD" onChange={(v) => setEd("dateOfBirth", v)} />
              <FormSelect label="Gender" value={ed("gender")} onChange={(v) => setEd("gender", v)}>
                <option value="">Not specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </FormSelect>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Email" value={teacher.email || "N/A"} />
              <DetailRow label="Phone" value={teacher.phone || "N/A"} />
              <DetailRow label="CNIC" value={teacher.cnic || "N/A"} />
              <DetailRow label="Date of Birth" value={formatDate(teacher.dateOfBirth)} />
              <DetailRow label="Gender" value={genderLabel(teacher.gender)} />
            </div>
          )}
        </div>

        {/* Professional Details */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Briefcase} title="Professional" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormSelect label="Qualification" value={ed("qualification")} onChange={(v) => setEd("qualification", v)}>
                <option value="">Select qualification</option>
                <option value="Matric">Matric</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Bachelors">Bachelors</option>
                <option value="Masters">Masters</option>
                <option value="MPhil">MPhil</option>
                <option value="PhD">PhD</option>
                <option value="B.Ed">B.Ed</option>
                <option value="M.Ed">M.Ed</option>
              </FormSelect>
              <FormInput label="Specialization" value={ed("specialization")} placeholder="e.g. Mathematics" onChange={(v) => setEd("specialization", v)} />
              <FormInput label="Experience" value={ed("experience")} placeholder="e.g. 5 years" onChange={(v) => setEd("experience", v)} />
              <FormInput label="Joining Date" value={ed("joiningDate")} placeholder="YYYY-MM-DD" onChange={(v) => setEd("joiningDate", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Qualification" value={teacher.qualification || "N/A"} />
              <DetailRow label="Specialization" value={teacher.specialization || "N/A"} />
              <DetailRow label="Experience" value={teacher.experience || "N/A"} />
              <DetailRow label="Joining Date" value={formatDate(teacher.joiningDate)} />
            </div>
          )}
        </div>

        {/* Address */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={MapPin} title="Address" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Address" value={ed("address")} placeholder="Street address" onChange={(v) => setEd("address", v)} />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="City" value={ed("city")} placeholder="City" onChange={(v) => setEd("city", v)} />
                <FormSelect label="Province" value={ed("province")} onChange={(v) => setEd("province", v)}>
                  <option value="">Select province</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Sindh">Sindh</option>
                  <option value="KPK">KPK</option>
                  <option value="Balochistan">Balochistan</option>
                  <option value="Islamabad">Islamabad</option>
                  <option value="AJK">AJK</option>
                  <option value="Gilgit-Baltistan">Gilgit-Baltistan</option>
                </FormSelect>
              </div>
              <FormInput label="Postal Code" value={ed("postalCode")} placeholder="Postal code" onChange={(v) => setEd("postalCode", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Address" value={teacher.address || "N/A"} />
              <DetailRow label="City" value={teacher.city || "N/A"} />
              <DetailRow label="Province" value={teacher.province || "N/A"} />
              <DetailRow label="Postal Code" value={teacher.postalCode || "N/A"} />
            </div>
          )}
        </div>

        {/* Emergency Contact */}
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Shield} title="Emergency Contact" />
          {editing ? (
            <div className="mt-4 space-y-3">
              <FormInput label="Contact Person" value={ed("emergencyContact")} placeholder="Emergency contact name" onChange={(v) => setEd("emergencyContact", v)} />
              <FormInput label="Contact Phone" value={ed("emergencyPhone")} placeholder="Emergency phone" onChange={(v) => setEd("emergencyPhone", v)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DetailRow label="Contact Person" value={teacher.emergencyContact || "N/A"} />
              <DetailRow label="Contact Phone" value={teacher.emergencyPhone || "N/A"} />
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-6 flex justify-end">
          <BrandButton variant="dark" className="h-12" onClick={saveEdits} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </BrandButton>
        </div>
      ) : null}

      {/* ── Led Classes & Taught Subjects ── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={School} title="Led Classes" />
            <StatusPill status={`${ledClasses.length} Classes`} />
          </div>
          <div className="space-y-2">
            {ledClasses.map((cls: any) => (
              <div key={cls.id} className="rounded-2xl bg-[#fbf0fe]/55 px-4 py-3">
                <p className="text-sm font-black text-[#1f1a23]">{classLabel(cls)}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                  {cls._count?.students || 0} students - {cls._count?.subjects || 0} subjects
                </p>
              </div>
            ))}
            {ledClasses.length === 0 ? <EmptyInline text="This teacher is not the class teacher for any class yet." /> : null}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={BookOpen} title="Taught Subjects" />
            <StatusPill status={`${taughtSubjects.length} Subjects`} />
          </div>
          <div className="space-y-2">
            {taughtSubjects.map((subject: any) => (
              <div key={subject.id} className="rounded-2xl bg-[#fbf0fe]/55 px-4 py-3">
                <p className="text-sm font-black text-[#1f1a23]">{subject.name}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                  {classLabel(subject.class)} - {subject.totalMarks || 100} marks
                </p>
              </div>
            ))}
            {taughtSubjects.length === 0 ? <EmptyInline text="No subjects are assigned to this teacher yet." /> : null}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5">
      <div className={`bg-white w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar`}>
        <div className="flex justify-between items-start gap-5 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase text-[#8127cf]">{eyebrow}</p>
            <h3 className="mt-1 text-2xl font-black text-[#1f1a23] tracking-normal">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-[#fbf0fe] hover:text-rose-500 cursor-pointer transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  busy,
  busyLabel,
  actionLabel,
  onClose,
  onSave,
}: {
  busy: boolean;
  busyLabel: string;
  actionLabel: string;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-8 flex gap-4">
      <BrandButton variant="soft" className="flex-1 h-14" onClick={onClose}>
        Cancel
      </BrandButton>
      <BrandButton variant="dark" className="flex-[2] h-14" onClick={onSave} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {busyLabel}
          </>
        ) : (
          actionLabel
        )}
      </BrandButton>
    </div>
  );
}

function FormInput({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white"
      />
    </label>
  );
}

function FormSelect({
  label,
  value,
  children,
  onChange,
}: {
  label: string;
  value: string;
  children: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all focus:border-[#8127cf]/35 focus:bg-white"
      >
        {children}
      </select>
    </label>
  );
}

function ClassGroupCard({
  group,
  teachers,
  onAddStudent,
  onViewClass,
  onChangeTeacher,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
}: {
  group: { name: string; academicYear: number | string; sections: any[] };
  teachers: any[];
  onAddStudent: (classId?: string) => void;
  onViewClass: (cls: any) => void;
  onChangeTeacher: (classId: string, teacherId: string) => Promise<void>;
  onDeleteClass?: (cls: any) => void;
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>;
  onDeleteSubject?: (subject: any) => void;
  onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const studentCount = group.sections.reduce((sum, cls) => sum + (cls._count?.students || 0), 0);
  const subjectCount = group.sections.reduce((sum, cls) => sum + (cls._count?.subjects || cls.subjects?.length || 0), 0);

  return (
    <div className={cn(
      "rounded-[32px] border bg-white shadow-lg transition-all self-start",
      open
        ? "border-[#cfc2d6]/10 hover:border-[#8127cf]/20 hover:shadow-2xl"
        : "border-[#cfc2d6]/5 hover:border-[#8127cf]/10"
    )}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-all",
          open ? "p-5" : "px-4 py-3"
        )}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] shadow-sm transition-all",
            open ? "h-10 w-10" : "h-8 w-8"
          )}>
            <BookOpen className={cn("transition-all", open ? "h-5 w-5" : "h-4 w-4")} />
          </div>
          <div className="min-w-0">
            <p className={cn("truncate font-black text-[#1f1a23] transition-all", open ? "text-base" : "text-sm")}>
              {group.name}
            </p>
            {open ? (
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                {group.academicYear} - {group.sections.length} section{group.sections.length === 1 ? "" : "s"} · {studentCount} student{studentCount === 1 ? "" : "s"} · {subjectCount} subject{subjectCount === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDeleteClass ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteClass(group.sections[0]); }}
              className="flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-2 text-[8px] font-black uppercase tracking-normal text-rose-600 transition-all hover:bg-rose-100 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          ) : null}
          <span className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">
            {group.sections.length} cls
          </span>
          <ChevronDown
            className={cn(
              "text-[#8127cf] transition-all duration-200",
              open ? "h-5 w-5 rotate-180" : "h-4 w-4"
            )}
          />
        </div>
      </button>

      {open ? (
        <div className="border-t border-[#cfc2d6]/10 p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Students" value={studentCount} active />
            <MiniMetric label="Subjects" value={subjectCount} />
          </div>
          {group.sections.map((cls) => (
            <SectionCard
              key={cls.id}
              cls={cls}
              teachers={teachers}
              classTeacherId={cls.classTeacher?.id || ""}
              onViewClass={onViewClass}
              onAddStudent={onAddStudent}
              onChangeTeacher={onChangeTeacher}
              onDeleteClass={onDeleteClass}
              onUpdateClass={onUpdateClass}
              onDeleteSubject={onDeleteSubject}
              onUpdateSubject={onUpdateSubject}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({
  cls,
  teachers,
  classTeacherId,
  onViewClass,
  onAddStudent,
  onChangeTeacher,
  onDeleteClass,
  onUpdateClass,
  onDeleteSubject,
  onUpdateSubject,
}: {
  cls: any;
  teachers: any[];
  classTeacherId: string;
  onViewClass: (cls: any) => void;
  onAddStudent: (classId?: string) => void;
  onChangeTeacher: (classId: string, teacherId: string) => Promise<void>;
  onDeleteClass?: (cls: any) => void;
  onUpdateClass?: (classId: string, updates: { name?: string; section?: string; academicYear?: number }) => Promise<void>;
  onDeleteSubject?: (subject: any) => void;
  onUpdateSubject?: (classId: string, subjectId: string, updates: { name?: string; totalMarks?: number }) => Promise<void>;
}) {
  const [subjectsOpen, setSubjectsOpen] = useState(true);
  const [changingTeacher, setChangingTeacher] = useState(false);
  const [editingSection, setEditingSection] = useState(false);
  const [editName, setEditName] = useState(cls.name || "");
  const [editSection, setEditSection] = useState(cls.section || "");

  const saveSection = async () => {
    if (onUpdateClass) {
      await onUpdateClass(cls.id, { name: editName, section: editSection });
      setEditingSection(false);
    }
  };

  if (editingSection) {
    return (
      <div className="rounded-2xl bg-white border border-[#8127cf]/20 p-4 space-y-3">
        <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Edit Section</p>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Class Name" value={editName} placeholder="e.g. Class 10" onChange={setEditName} />
          <FormInput label="Section" value={editSection} placeholder="e.g. A" onChange={setEditSection} />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setEditingSection(false)}
            className="h-10 rounded-xl bg-[#f3f4f9] px-4 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] cursor-pointer"
          >
            Cancel
          </button>
          <BrandButton variant="dark" className="h-10" onClick={saveSection}>
            Save
          </BrandButton>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#fbf0fe]/55">
      <div className="flex items-center justify-between gap-3 p-4">
        <div
          onClick={(e) => {
            e.stopPropagation();
            onViewClass(cls);
          }}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <p className="text-sm font-black text-[#1f1a23]">Section {sectionLabel(cls)}</p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
            {cls.classTeacher?.fullName || "No class teacher"} - {cls._count?.students || 0} students
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditingSection(true); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-[#8127cf] cursor-pointer"
            title="Edit section"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
          {onDeleteClass ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteClass(cls); }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4d4354]/40 transition-all hover:bg-white hover:text-rose-500 cursor-pointer"
              title="Delete section"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {changingTeacher ? (
            <select
              value={classTeacherId || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== classTeacherId) {
                  onChangeTeacher(cls.id, val);
                }
                setChangingTeacher(false);
              }}
              className="h-9 rounded-xl bg-white px-3 text-[9px] font-black uppercase tracking-normal text-[#8127cf] border border-[#8127cf]/20 outline-none cursor-pointer"
              autoFocus
              onBlur={() => setChangingTeacher(false)}
            >
              <option value="">No teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setChangingTeacher(true);
              }}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-[8px] font-black uppercase tracking-normal transition-all",
                cls.classTeacher
                  ? "bg-emerald-50 text-emerald-700 hover:bg-amber-50 hover:text-amber-700"
                  : "bg-amber-50 text-amber-700 hover:bg-emerald-50 hover:text-emerald-700"
              )}
            >
              <Users className="h-3 w-3" />
              {cls.classTeacher ? "Chg" : "Asgn"}
            </button>
          )}
          {onAddStudent ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddStudent(cls.id);
              }}
              className="h-8 cursor-pointer rounded-lg bg-white px-2 text-[8px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
            >
              + Student
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSubjectsOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8127cf] transition-all hover:bg-white cursor-pointer"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                subjectsOpen && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>
      {subjectsOpen ? (
        <div className="border-t border-[#cfc2d6]/10 px-4 py-3">
          {cls.subjects?.length ? (
            <div className="flex flex-wrap gap-2">
              {cls.subjects.slice(0, 5).map((subject: any) => (
                <div key={subject.id} className="flex items-center gap-1 rounded-full bg-white pl-3 pr-1 py-1">
                  <span className="text-[8px] font-black uppercase tracking-normal text-[#8127cf]">
                    {subject.name}{subject.teacher?.fullName ? ` - ${subject.teacher.fullName}` : ""}
                  </span>
                  {onDeleteSubject ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteSubject(subject); }}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[#4d4354]/30 transition-all hover:bg-rose-50 hover:text-rose-500 cursor-pointer"
                      title="Delete subject"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-white/70 px-3 py-2 text-[10px] font-bold text-[#4d4354]/45">
              No subjects yet. Open this section to add subjects and assign teachers.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AdminRow({ admin, currentUserId, onRemove }: { admin: any; currentUserId?: string; onRemove: () => void }) {
  const isCurrentUser = admin.id === currentUserId;

  return (
    <div className="group/row relative bg-gradient-to-br from-[#fbf0fe]/50 via-white to-[#fbf0fe]/20 p-5 rounded-[28px] border border-transparent transition-all duration-300 hover:border-[#8127cf]/15 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden">
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-to-bl from-[#8127cf]/6 to-transparent rounded-full blur-[50px] opacity-0 group-hover/row:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 min-w-0">
          <div className="relative shrink-0">
            <div className="absolute -inset-2 bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/8 rounded-2xl blur-md opacity-0 group-hover/row:opacity-100 transition-opacity duration-500" />
            <div className="relative h-14 w-14 rounded-2xl bg-white border-2 border-[#8127cf]/10 shadow-sm flex items-center justify-center overflow-hidden transition-all duration-300 group-hover/row:border-[#8127cf]/30 group-hover/row:shadow-md">
              <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(admin.email)}`} alt="" className="h-full w-full object-cover" />
            </div>
            <div className={`absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white ${isCurrentUser ? "bg-emerald-500" : "bg-[#8127cf]"}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-black text-[#1f1a23] tracking-normal leading-none truncate">{admin.fullName}</h4>
              {isCurrentUser && (
                <span className="shrink-0 inline-flex items-center rounded-full bg-gradient-to-r from-[#8127cf] to-[#b876f0] px-2 py-0.5 text-[7px] font-black uppercase tracking-wider text-white shadow-sm">
                  Owner
                </span>
              )}
            </div>
            <p className="text-[9px] font-bold text-[#4d4354]/45 uppercase tracking-wider leading-none mt-1 truncate">{admin.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-[#8127cf]/60">
                <Shield className="w-2.5 h-2.5" />
                {isCurrentUser ? "Current session" : formatStatus(admin.role)}
              </span>
            </div>
          </div>
        </div>
        {!isCurrentUser && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 h-10 rounded-xl bg-rose-50 px-4 text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5 justify-center border border-rose-100 transition-all hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md hover:shadow-rose-500/20 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}

function PendingFacultyRow({ invite, onResend, onCancel }: { invite: any; onResend: () => void; onCancel: () => void }) {
  const expired = invite.expiresAt ? new Date() > new Date(invite.expiresAt) : false;
  const expiryLabel = invite.expiresAt
    ? new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div className="group/pending relative bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 p-5 rounded-[28px] border border-amber-200/60 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden">
      <div className="absolute -top-12 -right-12 w-24 h-24 bg-gradient-to-bl from-amber-300/10 to-transparent rounded-full blur-[50px] pointer-events-none" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 min-w-0">
          <div className="relative shrink-0">
            <div className="absolute -inset-2 bg-amber-200/20 rounded-2xl blur-md opacity-0 group-hover/pending:opacity-100 transition-opacity duration-500" />
            <div className="relative h-14 w-14 rounded-2xl bg-white border-2 border-amber-200 shadow-sm flex items-center justify-center transition-all duration-300 group-hover/pending:border-amber-300 group-hover/pending:shadow-md">
              <Clock className={`w-6 h-6 ${expired ? "text-rose-500" : "text-amber-500"}`} />
            </div>
            <div className={`absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white ${expired ? "bg-rose-500" : "bg-amber-400"}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-black text-[#1f1a23] tracking-normal leading-none truncate">Invitation pending</h4>
              <StatusPill status={expired ? "Expired" : formatStatus(invite.role)} />
            </div>
            <p className="text-[9px] font-bold text-[#4d4354]/50 uppercase tracking-wider leading-none mt-1 truncate">{invite.email}</p>
            {expiryLabel ? (
              <div className="flex items-center gap-1.5 mt-2">
                <Clock className={`w-2.5 h-2.5 ${expired ? "text-rose-500" : "text-amber-500"}`} />
                <span className={`text-[8px] font-black uppercase tracking-wider ${expired ? "text-rose-600" : "text-amber-600"}`}>
                  {expired ? "Expired" : "Expires"} {expiryLabel}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button type="button" onClick={onResend} className="h-10 rounded-xl bg-white px-4 text-[9px] font-black uppercase tracking-wider text-[#8127cf] flex items-center gap-1.5 justify-center border border-[#8127cf]/10 shadow-sm transition-all hover:bg-[#8127cf] hover:text-white hover:border-[#8127cf] hover:shadow-md hover:shadow-[#8127cf]/20 cursor-pointer">
            <Send className="w-3.5 h-3.5" />
            Resend
          </button>
          <button type="button" onClick={onCancel} className="h-10 rounded-xl bg-rose-50 px-4 text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5 justify-center border border-rose-100 transition-all hover:bg-rose-500 hover:text-white hover:border-rose-500 hover:shadow-md hover:shadow-rose-500/20 cursor-pointer">
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function FacultyRow({ teacher, onView, onRemove }: { teacher: any; onView: () => void; onRemove: () => void }) {
  const avatar = teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teacher.fullName)}`;

  return (
    <div className="bg-white p-5 rounded-[28px] border border-transparent hover:border-[#8127cf]/10 hover:shadow-xl transition-all flex items-center justify-between group">
      <div className="flex items-center gap-5 min-w-0">
        <div className="h-12 w-12 bg-[#fbf0fe] rounded-xl overflow-hidden border-2 border-white shadow-sm flex items-center justify-center shrink-0">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <h4 className="text-base font-black text-[#1f1a23] tracking-normal leading-none mb-1 truncate">{teacher.fullName}</h4>
          <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-normal leading-none truncate">{teacher.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-6 shrink-0">
        <span className="text-[8px] font-black uppercase tracking-normal text-emerald-600">
          {teacher._count?.taughtSubjects || 0} subjects
        </span>
        <button
          type="button"
          onClick={onView}
          className="h-9 rounded-lg bg-[#fbf0fe] px-3 text-[9px] font-black uppercase tracking-normal text-[#8127cf] flex items-center gap-1.5 justify-center hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
        >
          View
        </button>
        <button type="button" onClick={onRemove} className="h-9 rounded-lg bg-rose-50 px-3 text-[9px] font-black uppercase tracking-normal text-rose-500 flex items-center gap-1.5 justify-center hover:bg-rose-500 hover:text-white transition-all cursor-pointer">
          <Trash2 className="w-3.5 h-3.5" />
          Revoke
        </button>
      </div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-black tracking-normal text-[#1f1a23]">{title}</h3>
    </div>
  );
}

function SnapshotColumn({ icon: Icon, title, after, children }: { icon: LucideIcon; title: string; after?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const childCount = useMemo(() => {
    let count = 0;
    if (Array.isArray(children)) {
      count = children.filter(Boolean).length;
    } else if (children) {
      count = 1;
    }
    return count;
  }, [children]);

  return (
    <div className={cn(
      "rounded-[32px] border bg-white shadow-lg transition-all self-start",
      open
        ? "border-[#cfc2d6]/10 hover:border-[#8127cf]/20 hover:shadow-2xl"
        : "border-[#cfc2d6]/5 hover:border-[#8127cf]/10"
    )}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-all",
          open ? "p-5" : "px-4 py-3"
        )}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf] shadow-sm transition-all",
            open ? "h-10 w-10" : "h-8 w-8"
          )}>
            <Icon className={cn("transition-all", open ? "h-5 w-5" : "h-4 w-4")} />
          </div>
          <div className="min-w-0">
            <p className={cn("truncate font-black text-[#1f1a23] transition-all", open ? "text-base" : "text-sm")}>
              {title}
            </p>
            {open ? (
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                {childCount} item{childCount === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {open ? null : (
            <span className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">
              {childCount} items
            </span>
          )}
          <ChevronDown
            className={cn(
              "text-[#8127cf] transition-all duration-200",
              open ? "h-5 w-5 rotate-180" : "h-4 w-4"
            )}
          />
        </div>
      </button>

      {open ? (
        <div className="border-t border-[#cfc2d6]/10 p-5">
          {after ? (
            <div className="mb-3 flex justify-end">{after}</div>
          ) : null}
          <div className="space-y-3">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
      <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">{label}</span>
      <span className="truncate text-sm font-black text-[#1f1a23]">{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3">
      <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-black text-[#1f1a23]">{value}</span>
    </div>
  );
}

function MiniMetric({ label, value, active }: { label: string; value: any; active?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/70 px-4 py-[14px]">
      <p className="text-[7px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p>
      <p className={`mt-1 truncate text-base font-black ${active ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status?: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${statusTone(status)}`}>
      {formatStatus(status)}
    </span>
  );
}

function EmptyInline({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">
      {text}
    </p>
  );
}

function BulkStudentImport({
  campusName,
  classes,
  onClose,
  onComplete,
}: {
  campusName: string;
  classes: any[];
  onClose: () => void;
  onComplete: () => Promise<any>;
}) {
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<any[]>([]);
  const [parsedError, setParsedError] = useState("");
  const [importing, setImporting] = useState(false);

  const parseCSVRow = (line: string): string[] => {
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cols.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());
    return cols;
  };

  const downloadTemplate = () => {
    const csv = "Full Name,Roll No,Gender,Class,Guardian Name,Guardian Phone,Guardian Email\nJohn Doe,101,MALE,Grade 8 A,Jane Doe,+923001234567,jane@example.com\nJane Smith,102,FEMALE,Grade 8 A,,+923001234568,\nAlex Lee,103,OTHER,Grade 8 B,,,";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string) => {
    setParsedError("");
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) {
      setPreview([]);
      return;
    }
    const headers = parseCSVRow(lines[0]).map((h) => h.trim().toLowerCase());
    const nameIdx = headers.findIndex((h) => h.includes("name") || h === "fullname" || h === "full_name");
    const rollIdx = headers.findIndex((h) => h.includes("roll") || h === "rollno" || h === "roll_no");
    const genderIdx = headers.findIndex((h) => h.includes("gender"));
    const classIdx = headers.findIndex((h) => h.includes("class"));
    const guardianIdx = headers.findIndex((h) => h.includes("guardian") && h.includes("name"));
    const guardianPhoneIdx = headers.findIndex((h) => h.includes("guardian") && (h.includes("phone") || h.includes("whatsapp")));
    const guardianEmailIdx = headers.findIndex((h) => h.includes("guardian") && h.includes("email"));

    if (nameIdx === -1 || rollIdx === -1) {
      setParsedError("CSV must have at least \"Full Name\" and \"Roll No\" columns");
      setPreview([]);
      return;
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVRow(lines[i]).map((c) => c.trim());
      const name = cols[nameIdx] || "";
      const rollNo = cols[rollIdx] || "";
      if (!name || !rollNo) continue;

      const className = classIdx >= 0 ? cols[classIdx] || "" : "";
      const matchedClass = className
        ? classes.find((c) => `${c.name} ${c.section || ""}`.trim().toLowerCase() === className.toLowerCase())
        : null;

      rows.push({
        fullName: name,
        rollNo,
        gender: genderIdx >= 0 ? (cols[genderIdx]?.toUpperCase() === "F" || cols[genderIdx]?.toUpperCase() === "FEMALE" ? "FEMALE" : cols[genderIdx]?.toUpperCase() === "OTHER" ? "OTHER" : "MALE") : "MALE",
        classId: matchedClass?.id || (classIdx >= 0 ? "__unknown__" : classes[0]?.id || ""),
        className: matchedClass ? `${matchedClass.name} ${matchedClass.section || ""}`.trim() : className || (classes[0] ? `${classes[0].name} ${classes[0].section || ""}`.trim() : "Unknown"),
        guardianName: guardianIdx >= 0 ? cols[guardianIdx] || "" : "",
        guardianPhone: guardianPhoneIdx >= 0 ? cols[guardianPhoneIdx] || "" : "",
        guardianEmail: guardianEmailIdx >= 0 ? cols[guardianEmailIdx] || "" : "",
        _unknownClass: !matchedClass && className ? className : "",
      });
    }
    setPreview(rows);
  };

  const handleImport = async () => {
    if (preview.length === 0) return toast.error("No valid rows to import");
    const unknownClasses = [...new Set(preview.filter((r) => r._unknownClass).map((r) => r._unknownClass))];
    if (unknownClasses.length > 0) {
      return toast.error(`Unknown classes: ${unknownClasses.join(", ")}. Check the class names or add them first.`);
    }
    setImporting(true);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          students: preview.map(({ _unknownClass, className, ...rest }) => rest),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Import failed");
      toast.success(result.message || `${preview.length} students imported`);
      setCsvText("");
      setPreview([]);
      await onComplete();
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <ModalFrame title={`Bulk Import Students — ${campusName}`} eyebrow="Student enrollment" onClose={onClose} wide>
      <div className="mb-4 rounded-2xl bg-[#fbf0fe]/60 p-4">
        <p className="text-[10px] font-bold text-[#4d4354]/60">
          Paste CSV data with columns: Full Name, Roll No, Gender (MALE/FEMALE/OTHER), Class (e.g. &quot;Grade 8 A&quot;), Guardian Name, Guardian Phone, Guardian Email
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="mt-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-normal text-[#8127cf] hover:underline cursor-pointer"
        >
          <Download className="h-3 w-3" />
          Download CSV Template
        </button>
      </div>
      <textarea
        value={csvText}
        onChange={(e) => { setCsvText(e.target.value); parseCSV(e.target.value); }}
        placeholder={`Full Name, Roll No, Gender, Class, Guardian Name, Guardian Phone, Guardian Email\nJohn Doe, 101, MALE, Grade 8 A, Jane Doe, +923001234567, jane@example.com`}
        className="h-40 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/30 p-4 text-sm font-bold outline-none resize-none transition-all focus:border-[#8127cf]/35 focus:bg-white"
      />
      {parsedError ? (
        <p className="mt-2 text-xs font-bold text-rose-600">{parsedError}</p>
      ) : null}
      {preview.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
            Preview: {preview.length} students
          </p>
          <div className="max-h-48 overflow-y-auto rounded-2xl border border-[#cfc2d6]/10 custom-scrollbar">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="bg-[#f3f4f9]/60 text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Roll</th>
                  <th className="px-4 py-2">Class</th>
                  <th className="px-4 py-2">Guardian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f9]">
                {preview.slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-bold text-[#1f1a23]">{row.fullName}</td>
                    <td className="px-4 py-2 text-[#4d4354]/60">{row.rollNo}</td>
                    <td className="px-4 py-2 text-[#4d4354]/60">{row.className}</td>
                    <td className="px-4 py-2 text-[#4d4354]/60">{row.guardianName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 20 ? (
              <p className="p-3 text-center text-[10px] font-bold text-[#4d4354]/40">+{preview.length - 20} more rows</p>
            ) : null}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <BrandButton variant="soft" onClick={() => { setCsvText(""); setPreview([]); }}>Clear</BrandButton>
            <BrandButton variant="dark" onClick={handleImport} disabled={importing}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : `Import ${preview.length} Students`}
            </BrandButton>
          </div>
        </div>
      ) : null}
    </ModalFrame>
  );
}

function ActivityLogModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filter !== "all") params.set("tableName", filter);
      const res = await fetch(`/api/audit-log?${params}`);
      const result = await res.json();
      if (res.ok) setLogs(result.data || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [filter]);

  const filtered = logs;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pagedLogs = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  useEffect(() => { setPage(1); }, [filter]);

  const tableOptions = [
    { value: "all", label: "All Events" },
    { value: "student", label: "Students" },
    { value: "class", label: "Classes" },
    { value: "subject", label: "Subjects" },
    { value: "invitation", label: "Invitations" },
    { value: "marks", label: "Marks" },
  ];

  function describeLog(log: any): { label: string; detail: string; userName: string } {
    const userName = log.user?.fullName || log.user?.email || "System";
    const table = log.tableName.replace(/_/g, " ");
    const isCreate = !log.oldValue;
    const isDelete = !log.newValue;
    const oldV = log.oldValue || {};
    const newV = log.newValue || {};

    if (table === "student") {
      const name = newV.fullName || oldV.fullName || "a student";
      if (isCreate) return { label: `Added ${name}`, detail: `Roll ${newV.rollNo || ""}`, userName };
      if (oldV.classId && newV.classId && oldV.classId !== newV.classId)
        return { label: `Moved ${name}`, detail: `Class changed`, userName };
      return { label: `Updated ${name}`, detail: "", userName };
    }
    if (table === "class") {
      const name = newV.name || oldV.name || "";
      const section = newV.section || oldV.section || "";
      if (isCreate) return { label: `Created class ${name}`, detail: `Section ${section}, ${newV.academicYear || ""}`, userName };
      const oldTeacher = oldV.classTeacherId;
      const newTeacher = newV.classTeacherId;
      if (oldTeacher !== undefined && newTeacher !== undefined && oldTeacher !== newTeacher)
        return { label: `Changed teacher for ${name}`, detail: `Teacher assigned`, userName };
      return { label: `Updated class ${name}`, detail: `Section ${section}`, userName };
    }
    if (table === "subject") {
      const name = newV.name || oldV.name || "";
      if (isCreate) return { label: `Added subject ${name}`, detail: "", userName };
      if (isDelete) return { label: `Removed subject ${name}`, detail: "", userName };
      const oldT = oldV.teacherId;
      const newT = newV.teacherId;
      if (oldT !== newT)
        return { label: `Changed teacher for ${name}`, detail: newT ? `Teacher assigned` : "Unassigned", userName };
      return { label: `Updated subject ${name}`, detail: "", userName };
    }
    if (table === "invitation") {
      const email = newV.email || oldV.email || "";
      const role = newV.role || oldV.role || "";
      if (isCreate) return { label: `Invited ${role?.replace(/_/g, " ")}`, detail: email, userName };
      return { label: `Updated invitation`, detail: email, userName };
    }
    if (table === "marks") {
      return { label: `Entered marks`, detail: `${Object.keys(newV).length} subjects`, userName };
    }
    return { label: `${isCreate ? "Created" : isDelete ? "Deleted" : "Updated"} ${table}`, detail: "", userName };
  }

  return (
    <ModalFrame title="Activity Log" eyebrow="Campus audit trail" onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1">
          {tableOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-normal transition-all cursor-pointer ${
                filter === opt.value ? "bg-white text-[#8127cf] shadow-sm" : "text-[#4d4354]/50 hover:text-[#8127cf]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-[9px] font-bold text-[#4d4354]/40">{filtered.length} entries</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
        </div>
      ) : pagedLogs.length === 0 ? (
        <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">No activity recorded yet.</p>
      ) : (
        <>
          <div className="max-h-80 overflow-y-auto custom-scrollbar space-y-2">
            {pagedLogs.map((log) => {
              const { label, detail, userName } = describeLog(log);
              return (
                <div key={log.id} className="rounded-2xl bg-[#fbf0fe]/50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-[#1f1a23]">{label}</p>
                      {detail ? (
                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                          {detail}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/35">
                        by {userName}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[9px] font-bold text-[#4d4354]/40">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/50">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="flex h-9 items-center gap-1 rounded-xl bg-[#f3f4f9] px-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/60 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </ModalFrame>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalFrame title="Help Center" eyebrow="Campus support" onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-3xl bg-[#fbf0fe]/65 p-5">
          <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Getting Started</p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-[#4d4354]/70">
            This is your campus admin workspace. From here you can manage classes, teachers, students, exams, and AI-powered insights.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4">
            <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Classes</p>
            <p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Add classes with sections, assign class teachers, create subjects, and enroll students.</p>
          </div>
          <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4">
            <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Teachers</p>
            <p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Invite teachers, assign them to subjects or as class teachers, and manage their access.</p>
          </div>
          <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4">
            <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Students</p>
            <p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Add students individually or via CSV bulk import. Track report cards and move between classes.</p>
          </div>
          <div className="rounded-2xl bg-white border border-[#cfc2d6]/10 p-4">
            <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Exams & Reports</p>
            <p className="mt-1 text-xs font-semibold text-[#4d4354]/60">Create exam cycles, enter marks from teacher dashboards, and generate report cards.</p>
          </div>
        </div>
        <div className="rounded-3xl bg-[#fbf0fe]/50 p-5">
          <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Need more help?</p>
          <p className="mt-1 text-xs font-semibold text-[#4d4354]/55">
            Contact your school administration for advanced support. Additional documentation and FAQs are available through your school&apos;s IT department.
          </p>
        </div>
      </div>
    </ModalFrame>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`relative isolate overflow-hidden rounded-2xl bg-[#e8e0ec]/50 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

function AdminSkeleton({ standalone }: { standalone?: boolean }) {
  return (
    <div className="min-h-screen bg-[#fbf0fe] flex font-sans">
      <div className="hidden md:flex w-64 shrink-0 flex-col bg-white border-r border-[#cfc2d6]/10 p-5 gap-6">
        <SkeletonBlock className="h-8 w-32 rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonBlock key={i} className="h-11 w-full rounded-2xl" />
          ))}
        </div>
        <div className="mt-auto space-y-3">
          <SkeletonBlock className="h-11 w-full rounded-2xl" />
          <SkeletonBlock className="h-11 w-full rounded-2xl" />
        </div>
      </div>
      <main className="flex-1 p-4 md:p-8 flex flex-col h-screen">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-4 w-36" />
          </div>
          <div className="flex gap-3">
            <SkeletonBlock className="h-10 w-10 rounded-full" />
            <SkeletonBlock className="h-10 w-10 rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonBlock key={i} className="h-24 rounded-[20px]" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-8">
              <div className="flex items-center gap-4 mb-5">
                <SkeletonBlock className="h-12 w-12 rounded-2xl" />
                <div className="space-y-2 flex-1">
                  <SkeletonBlock className="h-5 w-44" />
                  <SkeletonBlock className="h-3 w-64" />
                </div>
              </div>
              <SkeletonBlock className="h-28 w-full rounded-[24px]" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.9fr] gap-8">
          <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6">
            <SkeletonBlock className="h-6 w-32 mb-5" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <SkeletonBlock key={i} className="h-20 w-full rounded-[28px]" />
              ))}
            </div>
          </div>
          <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6">
            <SkeletonBlock className="h-6 w-36 mb-5" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonBlock key={i} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
