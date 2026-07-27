"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  Building,
  ClipboardList,
  Clock,
  Download,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  Plus,
  School,
  Send,
  Shield,
  Sparkles,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getCampusDashboardData } from "@/app/actions/dashboard";
import { cancelInvitation, inviteStaff, removeStaff, resendInvitation } from "@/app/actions/invite";
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
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { ConfirmAction } from "@/components/ui/confirm-action";

type AdminView = "leadership" | "classes" | "teachers" | "students" | "ai";
type InviteRole = "CAMPUS_ADMIN" | "PRINCIPAL" | "TEACHER";
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

const inviteLabels: Record<InviteRole, string> = {
  CAMPUS_ADMIN: "Admin",
  PRINCIPAL: "Principal",
  TEACHER: "Teacher",
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
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [movingStudent, setMovingStudent] = useState<any>(null);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [inviteRole, setInviteRole] = useState<InviteRole>("TEACHER");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [classForm, setClassForm] = useState<ClassFormState>({
    name: "",
    section: "",
    academicYear: new Date().getFullYear(),
    classTeacherId: "",
  });
  const [studentForm, setStudentForm] = useState<StudentFormState>({
    fullName: "",
    rollNo: "",
    gender: "OTHER",
    classId: "",
    studentEmail: "",
    guardianName: "",
    guardianPhone: "",
    guardianEmail: "",
  });
  const [moveClassId, setMoveClassId] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [movingStudentBusy, setMovingStudentBusy] = useState(false);
  const [savingClassTeacherId, setSavingClassTeacherId] = useState<string | null>(null);
  const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
  const [creatingSubjectClassId, setCreatingSubjectClassId] = useState<string | null>(null);
  const [applyingSubjectClassId, setApplyingSubjectClassId] = useState<string | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

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

  const openInvite = (role: InviteRole) => {
    setInviteRole(role);
    setInviteEmail("");
    setShowInviteModal(true);
  };

  const openStudentModal = (classId?: string) => {
    const preferredClassId = typeof classId === "string" ? classId : data?.classes?.[0]?.id || "";
    setStudentForm({
      fullName: "",
      rollNo: "",
      gender: "OTHER",
      classId: preferredClassId,
      studentEmail: "",
      guardianName: "",
      guardianPhone: "",
      guardianEmail: "",
    });
    setShowStudentModal(true);
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

  const handleCreateStudent = async () => {
    if (!studentForm.fullName.trim()) return toast.error("Student name is required");
    if (!studentForm.rollNo.trim()) return toast.error("Roll number is required");
    if (!studentForm.classId) return toast.error("Select a class first");

    const guardianEmail = studentForm.guardianEmail.trim();
    const studentEmail = studentForm.studentEmail.trim();
    if (studentEmail && !isValidEmail(studentEmail)) {
      return toast.error("Enter a valid student login email or leave it blank");
    }
    if (guardianEmail && !isValidEmail(guardianEmail)) {
      return toast.error("Enter a valid guardian email or leave it blank");
    }
    if (studentEmail && guardianEmail && studentEmail.toLowerCase() === guardianEmail.toLowerCase()) {
      return toast.error("Student login email must be different from guardian email");
    }

    setSavingStudent(true);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: studentForm.fullName.trim(),
          rollNo: studentForm.rollNo.trim(),
          gender: studentForm.gender,
          classId: studentForm.classId,
          studentEmail: studentEmail || null,
          dateOfBirth: null,
          phone: null,
          guardianName: studentForm.guardianName.trim() || null,
          guardianPhone: studentForm.guardianPhone.trim() || null,
          guardianWhatsapp: null,
          guardianEmail: guardianEmail || null,
          address: null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Student could not be created");
      toast.success(result.message || "Student added");
      if (result.guardianInviteFailures?.length) {
        toast.warning("Student was created, but the guardian invite email could not be sent.");
      }
      setShowStudentModal(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Student could not be created");
    } finally {
      setSavingStudent(false);
    }
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

  const handleInvite = async () => {
    if (!inviteEmail) return toast.error("Email required");
    setInviting(true);
    try {
      await inviteStaff({ email: inviteEmail, role: inviteRole });
      toast.success(`${inviteLabels[inviteRole]} invitation dispatched`);
      setShowInviteModal(false);
      setInviteEmail("");
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setInviting(false);
    }
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

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Campus Control", active: activeView === "leadership", onClick: () => setActiveView("leadership") },
    { icon: School, label: "Academic Plan", active: activeView === "classes", onClick: () => setActiveView("classes") },
    { icon: Users, label: "Faculty Hub", active: activeView === "teachers", onClick: () => setActiveView("teachers") },
    { icon: GraduationCap, label: "Students", active: activeView === "students", onClick: () => setActiveView("students") },
    { icon: Sparkles, label: "AI Engine", active: activeView === "ai", onClick: () => setActiveView("ai") },
  ];
  const bottomItems: RoleNavItem[] = [
    { icon: HelpCircle, label: "Help Center", onClick: () => toast.info("Campus support is available from this role workspace.") },
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
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4">
        <GraduationCap className="h-12 w-12 text-[#8127cf] animate-bounce" />
        <p className="text-sm font-black text-[#1f1a23] uppercase tracking-normal leading-none">Accessing Campus Command...</p>
      </div>
    );
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
            <BrandButton variant="soft" icon={<Shield className="w-4 h-4" />} onClick={() => openInvite("CAMPUS_ADMIN")}>
              Add Admin
            </BrandButton>
          ) : null}
          <BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={() => setShowClassModal(true)}>
            Add Class
          </BrandButton>
          <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openStudentModal()} disabled={data.classes.length === 0}>
            Add Student
          </BrandButton>
          {canInvitePrincipal ? (
            <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openInvite("PRINCIPAL")}>
              Add Principal
            </BrandButton>
          ) : null}
          <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openInvite("TEACHER")}>
            Invite Teacher
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
              <BrandButton variant="soft" icon={<Shield className="w-4 h-4" />} onClick={() => openInvite("CAMPUS_ADMIN")}>
                Add Admin
              </BrandButton>
            ) : null}
            <BrandButton variant="soft" icon={<BookOpen className="w-4 h-4" />} onClick={() => setShowClassModal(true)}>
              Add Class
            </BrandButton>
            <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openStudentModal()} disabled={data.classes.length === 0}>
              Add Student
            </BrandButton>
            {canInvitePrincipal ? (
              <BrandButton variant="soft" icon={<GraduationCap className="w-4 h-4" />} onClick={() => openInvite("PRINCIPAL")}>
                Add Principal
              </BrandButton>
            ) : null}
            <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openInvite("TEACHER")}>
              Invite Teacher
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
              onInviteAdmin={() => openInvite("CAMPUS_ADMIN")}
              onInvitePrincipal={() => openInvite("PRINCIPAL")}
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
              onAddClass={() => setShowClassModal(true)}
              onAddStudent={openStudentModal}
              onViewClass={setSelectedClass}
            />
          ) : null}

          {activeView === "teachers" ? (
            <FacultyPanel
              teachers={data.teachers}
              pendingInvites={data.pendingTeacherInvitations}
              onInvite={() => openInvite("TEACHER")}
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
              onAddStudent={openStudentModal}
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

      {showInviteModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5">
          <div className="bg-white w-full max-w-md rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20">
            <div className="flex justify-between items-start gap-5 mb-8">
              <div>
                <p className="text-[10px] font-black uppercase text-[#8127cf]">Campus access</p>
                <h3 className="mt-1 text-2xl font-black text-[#1f1a23] tracking-normal">
                  Invite {inviteLabels[inviteRole]}
                </h3>
              </div>
              <button type="button" onClick={() => setShowInviteModal(false)} className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-[#fbf0fe] hover:text-rose-500 cursor-pointer transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 bg-[#fbf0fe] rounded-3xl border border-[#cfc2d6]/20 flex items-center gap-4 mb-8">
              <Mail className="w-6 h-6 text-[#8127cf]" />
              <input
                type="email"
                placeholder="Official Email Address"
                className="bg-transparent border-none outline-none font-bold text-sm w-full placeholder:text-[#4d4354]/35"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
            </div>
            <div className="flex gap-4">
              <BrandButton variant="soft" className="flex-1 h-14" onClick={() => setShowInviteModal(false)}>
                Cancel
              </BrandButton>
              <BrandButton variant="dark" className="flex-[2] h-14" onClick={handleInvite} disabled={inviting}>
                {inviting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Invite"}
              </BrandButton>
            </div>
          </div>
        </div>
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

      {showStudentModal ? (
        <StudentModal
          form={studentForm}
          classes={data.classes}
          busy={savingStudent}
          onChange={setStudentForm}
          onClose={() => setShowStudentModal(false)}
          onSave={handleCreateStudent}
        />
      ) : null}

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
          onClose={() => setSelectedClass(null)}
          onChangeTeacher={handleChangeClassTeacher}
          onCreateSubject={handleCreateSubject}
          onChangeSubjectTeacher={handleChangeSubjectTeacher}
          onApplyClassTeacherToSubjects={handleApplyClassTeacherToSubjects}
          onAddStudent={() => {
            setSelectedClass(null);
            openStudentModal(selectedClass.id);
          }}
          onViewStudent={(student) => {
            setSelectedClass(null);
            setSelectedStudent(student);
          }}
        />
      ) : null}

      {selectedStudent ? (
        <StudentDetailModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onMove={() => {
            openMoveStudent(selectedStudent);
            setSelectedStudent(null);
          }}
        />
      ) : null}

      {selectedTeacher ? (
        <TeacherDetailModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} />
      ) : null}

      {showBulkImportModal ? (
        <BulkStudentImport
          campusName={data.campusName}
          classes={data.classes || []}
          onClose={() => setShowBulkImportModal(false)}
          onComplete={loadData}
        />
      ) : null}

      {showActivityLogModal ? (
        <ActivityLogModal onClose={() => setShowActivityLogModal(false)} />
      ) : null}

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
  onActivityLog: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <ManagementCard
          title="Campus Administrator"
          icon={Shield}
          description="Standalone campus ownership and operational control for this one campus."
          user={data.campusAdmin}
          emptyLabel="Invite Admin"
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
          emptyLabel="Appoint Principal"
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

function CampusIdentityPanel({ data, onActivityLog }: { data: any; onActivityLog: () => void }) {
  return (
    <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
      <div className="mb-5 flex items-center justify-between gap-4">
        <PanelTitle icon={Building} title="Campus Identity" />
        <StatusPill status={data.isStandaloneCampus ? "Standalone" : "Campus"} />
      </div>
      <div className="space-y-3">
        <IdentityRow label="Campus" value={data.campusName} />
        <IdentityRow label="School" value={data.schoolName} />
        <IdentityRow label="City" value={data.campusCity || "Not set"} />
        <IdentityRow label="Reg ID" value={data.campusRegId || "Not set"} />
      </div>
      <div className="mt-5">
        <BrandButton variant="soft" icon={<ClipboardList className="w-4 h-4" />} onClick={onActivityLog} className="w-full">
          Activity Log
        </BrandButton>
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
  return (
    <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PanelTitle icon={Shield} title="Admin Team" />
        {data.canInviteAdmins ? (
          <BrandButton variant="soft" icon={<Plus className="w-4 h-4" />} onClick={onInvite}>
            Add Admin
          </BrandButton>
        ) : (
          <StatusPill status="Owner Managed" />
        )}
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
        {data.campusAdmins.length === 0 && data.pendingAdminInvitations.length === 0 ? (
          <EmptyInline text="No admin access is assigned yet." />
        ) : null}
      </div>
    </div>
  );
}

function AcademicPanel({
  classes,
  exams,
  reports,
  onAddClass,
  onAddStudent,
  onViewClass,
}: {
  classes: any[];
  exams: any[];
  reports: any[];
  onAddClass: () => void;
  onAddStudent: (classId?: string) => void;
  onViewClass: (cls: any) => void;
}) {
  const classGroups = groupClasses(classes);

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
      {classGroups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {classGroups.map((group) => (
            <ClassGroupCard
              key={group.key}
              group={group}
              onAddStudent={onAddStudent}
              onViewClass={onViewClass}
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <SnapshotColumn icon={FileText} title="Exam Cycles">
          {exams.map((exam: any) => (
            <div key={exam.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1f1a23]">{exam.title}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    {exam.term} - {classLabel(exam.class)}
                  </p>
                </div>
                <StatusPill status={exam.status} />
              </div>
            </div>
          ))}
          {exams.length === 0 ? <EmptyInline text="No exam cycles available yet." /> : null}
        </SnapshotColumn>

        <SnapshotColumn icon={GraduationCap} title="Recent Report Cards">
          {reports.map((report: any) => (
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
  if (teachers.length === 0 && pendingInvites.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No faculty records found"
        description="Invite teachers so subjects and classes can be assigned from the central model."
        action={<BrandButton onClick={onInvite}>Invite Teacher</BrandButton>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {teachers.map((teacher: any) => (
        <FacultyRow key={teacher.id} teacher={teacher} onView={() => onViewTeacher(teacher)} onRemove={() => onRemove(teacher.id)} />
      ))}
      {pendingInvites.map((invite: any) => (
        <PendingFacultyRow
          key={invite.id}
          invite={invite}
          onResend={() => onResend(invite.id)}
          onCancel={() => onCancel(invite.id)}
        />
      ))}
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
  const classGroups = groupClasses(classes);
  const selectedGroup = classGroups.find((group) => group.key === classFilter);
  const filteredStudents = students.filter((student) => {
    if (sectionFilter !== "all") return student.class?.id === sectionFilter;
    if (classFilter !== "all") return classGroupKey(student.class) === classFilter;
    return true;
  });

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
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PanelTitle icon={GraduationCap} title="Student Directory" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
          <StatusPill status={`${filteredStudents.length} Shown`} />
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredStudents.map((student: any) => {
          const report = student.reportCards?.[0];
          const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;
          return (
            <div key={student.id} className="rounded-[24px] bg-[#fbf0fe]/55 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl border-2 border-white bg-white shadow-sm">
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                      {student.rollNo} - {classLabel(student.class)}
                    </p>
                  </div>
                </div>
                <StatusPill status={report ? report.status : "NO_REPORT"} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MiniMetric label="Guardian" value={student.guardianName || "N/A"} />
                <MiniMetric label="Latest" value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} active />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onViewStudent(student)}
                  className="flex h-10 cursor-pointer items-center justify-center rounded-xl bg-white text-[10px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                >
                  View Profile
                </button>
                <button
                  type="button"
                  onClick={() => onMoveStudent(student)}
                  className="flex h-10 cursor-pointer items-center justify-center rounded-xl bg-white text-[10px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                >
                  Move Class
                </button>
              </div>
            </div>
          );
        })}
        {filteredStudents.length === 0 ? <EmptyInline text="No students match this class and section filter." /> : null}
      </div>
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
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-8">
      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
        <AiActionPanel title="Campus AI" options={features} compact onComplete={onComplete} />
      </div>
      <div className="space-y-8">
        <SnapshotColumn icon={Sparkles} title="AI Review Queue">
          <AIReviewQueue items={reviewItems} onComplete={onComplete} />
        </SnapshotColumn>
        <SnapshotColumn icon={FileText} title="Recent AI Insights">
          {insights?.length ? (
            insights.slice(0, 5).map((insight: any) => (
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
  onClose,
  onChangeTeacher,
  onCreateSubject,
  onChangeSubjectTeacher,
  onApplyClassTeacherToSubjects,
  onAddStudent,
  onViewStudent,
}: {
  cls: any;
  students: any[];
  teachers: any[];
  teacherBusy: boolean;
  subjectBusyId: string | null;
  creatingSubject: boolean;
  applyingSubjects: boolean;
  onClose: () => void;
  onChangeTeacher: (classId: string, classTeacherId: string) => void;
  onCreateSubject: (classId: string, subject: { name: string; totalMarks: number; teacherId: string }) => Promise<boolean>;
  onChangeSubjectTeacher: (classId: string, subjectId: string, teacherId: string) => void;
  onApplyClassTeacherToSubjects: (classId: string, classTeacherId: string, subjects: any[]) => void;
  onAddStudent: () => void;
  onViewStudent: (student: any) => void;
}) {
  const [classTeacherId, setClassTeacherId] = useState(cls.classTeacher?.id || "");
  const [teachingMode, setTeachingMode] = useState<"single" | "subject">(inferTeachingMode(cls));
  const [subjectTeacherIds, setSubjectTeacherIds] = useState<Record<string, string>>(subjectTeacherDefaults(cls));
  const [subjectName, setSubjectName] = useState("");
  const [subjectMarks, setSubjectMarks] = useState("100");
  const [newSubjectTeacherId, setNewSubjectTeacherId] = useState(cls.classTeacher?.id || "");

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

  return (
    <ModalFrame title={classLabel(cls)} eyebrow="Class profile" onClose={onClose} wide>
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
              return (
                <div key={subject.id} className="rounded-2xl bg-[#fbf0fe]/55 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#1f1a23]">{subject.name}</p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                        {subject.teacher?.fullName || "Teacher unassigned"} {subject.totalMarks ? `- ${subject.totalMarks} marks` : ""}
                      </p>
                    </div>
                    <StatusPill status={subject.teacher?.id ? "Assigned" : "Unassigned"} />
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
  onClose,
  onMove,
}: {
  student: any;
  onClose: () => void;
  onMove: () => void;
}) {
  const report = student.reportCards?.[0];
  const avatar = student.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(student.fullName)}`;

  return (
    <ModalFrame title={student.fullName} eyebrow="Student profile" onClose={onClose} wide>
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#fbf0fe]/65 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Student Record</p>
          <h3 className="mt-1 truncate text-3xl font-black tracking-normal text-[#1f1a23]">{student.fullName}</h3>
          <p className="mt-2 text-sm font-semibold uppercase tracking-normal text-[#4d4354]/55">
            {student.rollNo || "No roll number"} - {classLabel(student.class)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniMetric label="Roll No" value={student.rollNo || "N/A"} active />
        <MiniMetric label="Class" value={classLabel(student.class)} />
        <MiniMetric label="Latest Result" value={report ? report.grade || `${Math.round(report.percentage || 0)}%` : "N/A"} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={Users} title="Guardian" />
          <div className="mt-4 space-y-3">
            <DetailRow label="Student Login" value={student.studentUser?.email || "Not linked"} />
            <DetailRow label="Name" value={student.guardianName || "N/A"} />
            <DetailRow label="Phone" value={student.guardianPhone || student.guardianWhatsapp || "N/A"} />
            <DetailRow label="Email" value={student.guardianEmail || "N/A"} />
          </div>
        </div>

        <div className="rounded-3xl bg-[#fbf0fe]/60 p-5">
          <PanelTitle icon={FileText} title="Report Card" />
          {report ? (
            <div className="mt-4 space-y-3">
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
      </div>

      <div className="mt-6 flex justify-end">
        <BrandButton variant="dark" icon={<School className="w-4 h-4" />} onClick={onMove}>
          Move Class / Section
        </BrandButton>
      </div>
    </ModalFrame>
  );
}

function TeacherDetailModal({ teacher, onClose }: { teacher: any; onClose: () => void }) {
  const ledClasses = teacher.ledClasses || [];
  const taughtSubjects = teacher.taughtSubjects || [];
  const avatar = teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teacher.fullName)}`;

  return (
    <ModalFrame title={teacher.fullName} eyebrow="Teacher profile" onClose={onClose} wide>
      <div className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#fbf0fe]/65 p-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Faculty Record</p>
          <h3 className="mt-1 truncate text-3xl font-black tracking-normal text-[#1f1a23]">{teacher.fullName}</h3>
          <p className="mt-2 text-sm font-semibold uppercase tracking-normal text-[#4d4354]/55">
            {teacher.email || "No email"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <MiniMetric label="Subjects" value={teacher._count?.taughtSubjects || taughtSubjects.length} active />
        <MiniMetric label="Class Teacher" value={teacher._count?.ledClasses || ledClasses.length} />
        <MiniMetric label="Status" value={teacher.isActive ? "Active" : "Inactive"} />
        <MiniMetric label="Onboarding" value={teacher.onboardingComplete ? "Done" : "Pending"} />
      </div>

      <div className="mt-5 rounded-3xl bg-[#fbf0fe]/65 p-5">
        <DetailRow label="Email" value={teacher.email || "N/A"} />
        <DetailRow label="Phone" value={teacher.phone || "N/A"} />
      </div>

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
  onAddStudent,
  onViewClass,
}: {
  group: { name: string; academicYear: number | string; sections: any[] };
  onAddStudent: (classId?: string) => void;
  onViewClass: (cls: any) => void;
}) {
  const studentCount = group.sections.reduce((sum, cls) => sum + (cls._count?.students || 0), 0);
  const subjectCount = group.sections.reduce((sum, cls) => sum + (cls._count?.subjects || cls.subjects?.length || 0), 0);

  return (
    <div className="w-full rounded-[32px] border border-[#cfc2d6]/10 bg-white p-7 shadow-lg transition-all hover:border-[#8127cf]/20 hover:shadow-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Class Group</p>
          <h3 className="mt-1 truncate text-2xl font-black tracking-normal text-[#1f1a23]">{group.name}</h3>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
            {group.academicYear} - {group.sections.length} section{group.sections.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] shadow-sm">
          <BookOpen className="h-6 w-6" />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <MiniMetric label="Students" value={studentCount} active />
        <MiniMetric label="Subjects" value={subjectCount} />
      </div>

      <div className="space-y-3">
        {group.sections.map((cls) => {
          const classTeacherId = cls.classTeacher?.id || "";
          const hasSeparateSubjectTeachers = (cls.subjects || []).some(
            (subject: any) => subject.teacher?.id && subject.teacher.id !== classTeacherId
          );

          return (
            <div key={cls.id} className="rounded-2xl bg-[#fbf0fe]/55 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <button
                  type="button"
                  onClick={() => onViewClass(cls)}
                  className="min-w-0 cursor-pointer text-left"
                >
                  <p className="text-sm font-black text-[#1f1a23]">Section {sectionLabel(cls)}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    {cls.classTeacher?.fullName || "No class teacher"} - {cls._count?.students || 0} students
                  </p>
                </button>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <StatusPill status={hasSeparateSubjectTeachers ? "Subject Teachers" : "One Teacher"} />
                  <button
                    type="button"
                    onClick={() => onAddStudent(cls.id)}
                    className="h-9 cursor-pointer rounded-xl bg-white px-3 text-[9px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                  >
                    Add Student
                  </button>
                </div>
              </div>
              {cls.subjects?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {cls.subjects.slice(0, 5).map((subject: any) => (
                    <span key={subject.id} className="rounded-full bg-white px-3 py-1 text-[8px] font-black uppercase tracking-normal text-[#8127cf]">
                      {subject.name}{subject.teacher?.fullName ? ` - ${subject.teacher.fullName}` : ""}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[10px] font-bold text-[#4d4354]/45">
                  No subjects yet. Open this section to add subjects and assign teachers.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminRow({ admin, currentUserId, onRemove }: { admin: any; currentUserId?: string; onRemove: () => void }) {
  const isCurrentUser = admin.id === currentUserId;

  return (
    <div className="bg-[#fbf0fe]/45 p-5 rounded-[28px] border border-transparent hover:border-[#8127cf]/10 transition-all flex items-center justify-between gap-4">
      <div className="flex items-center gap-5 min-w-0">
        <div className="h-12 w-12 bg-white rounded-xl overflow-hidden border-2 border-white shadow-sm flex items-center justify-center shrink-0">
          <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(admin.email)}`} alt="" />
        </div>
        <div className="min-w-0">
          <h4 className="text-base font-black text-[#1f1a23] tracking-normal leading-none mb-1 truncate">{admin.fullName}</h4>
          <p className="text-[9px] font-bold text-[#4d4354]/45 uppercase tracking-normal leading-none truncate">{admin.email}</p>
          <p className="mt-2 text-[8px] font-black uppercase tracking-normal text-[#8127cf]">
            {isCurrentUser ? "Current owner session" : formatStatus(admin.role)}
          </p>
        </div>
      </div>
      {isCurrentUser ? (
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[8px] font-black uppercase tracking-normal text-[#8127cf]">
          Owner
        </span>
      ) : (
        <button
          type="button"
          onClick={onRemove}
          className="h-9 rounded-lg bg-rose-50 px-3 text-[9px] font-black uppercase tracking-normal text-rose-500 flex items-center gap-1.5 justify-center hover:bg-rose-500 hover:text-white transition-all cursor-pointer shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Revoke
        </button>
      )}
    </div>
  );
}

function PendingFacultyRow({ invite, onResend, onCancel }: { invite: any; onResend: () => void; onCancel: () => void }) {
  const expired = invite.expiresAt ? new Date() > new Date(invite.expiresAt) : false;
  const expiryLabel = invite.expiresAt
    ? new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div className="bg-amber-50/70 p-5 rounded-[28px] border border-amber-100 flex items-center justify-between gap-4 group">
      <div className="flex items-center gap-5 min-w-0">
        <div className="h-12 w-12 bg-white rounded-xl border-2 border-white shadow-sm flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-amber-500" />
        </div>
        <div className="min-w-0">
          <h4 className="text-base font-black text-[#1f1a23] tracking-normal leading-none mb-1 truncate">Invitation pending</h4>
          <p className="text-[9px] font-bold text-[#4d4354]/50 uppercase tracking-normal leading-none truncate">{invite.email}</p>
          {expiryLabel ? (
            <p className={`mt-2 text-[8px] font-black uppercase tracking-normal ${expired ? "text-rose-600" : "text-amber-600"}`}>
              {expired ? "Expired" : "Expires"} {expiryLabel}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
        <StatusPill status={expired ? "Expired" : formatStatus(invite.role)} />
        <button type="button" onClick={onResend} className="h-9 rounded-lg bg-white px-3 text-[9px] font-black uppercase tracking-normal text-[#8127cf] flex items-center gap-1.5 justify-center hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer">
          <Send className="w-3.5 h-3.5" />
          Resend
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-lg bg-white px-3 text-[9px] font-black uppercase tracking-normal text-rose-500 flex items-center gap-1.5 justify-center hover:bg-rose-500 hover:text-white transition-all cursor-pointer">
          <X className="w-4 h-4" />
          Cancel
        </button>
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

function SnapshotColumn({ icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <CollapsiblePanel icon={icon} title={title} defaultOpen>
      <div className="space-y-3">{children}</div>
    </CollapsiblePanel>
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
    <div className="rounded-2xl bg-[#fbf0fe]/70 px-3 py-3">
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

  const parseCSV = (text: string) => {
    setParsedError("");
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) {
      setPreview([]);
      return;
    }
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
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
      const cols = lines[i].split(",").map((c) => c.trim());
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/audit-log?limit=50");
        const result = await res.json();
        if (res.ok) setLogs(result.data || []);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <ModalFrame title="Activity Log" eyebrow="Campus audit trail" onClose={onClose} wide>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
        </div>
      ) : logs.length === 0 ? (
        <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">No activity recorded yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-2xl bg-[#fbf0fe]/50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-[#1f1a23]">
                    {log.tableName.replace(/_/g, " ")} — {log.recordId?.slice(0, 8) || "N/A"}
                  </p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    by {log.userId?.slice(0, 8) || "system"}
                  </p>
                </div>
                <span className="shrink-0 text-[9px] font-bold text-[#4d4354]/40">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalFrame>
  );
}
