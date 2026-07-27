"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  BarChart3,
  Building2,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Plus,
  School,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import BillingPage from "@/app/dashboard/billing/page";
import { getSuperAdminDashboardData } from "@/app/actions/dashboard";
import { addCampus } from "@/app/actions/addCampus";
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

function formatStatus(status?: string) {
  return (status || "Pending").replaceAll("_", " ");
}

function statusTone(status?: string) {
  if (["ACTIVE", "Active", "PAID", "SENT", "PUBLISHED", "APPROVED"].includes(status || "")) {
    return "bg-emerald-50 text-emerald-600";
  }
  if (["Onboarding", "Invited", "PENDING", "PARTIAL", "TRIAL", "REVIEW"].includes(status || "")) {
    return "bg-[#fbf0fe] text-[#8127cf]";
  }
  if (["Expired", "FAILED", "BLOCKED", "SUSPENDED", "MISSING", "NO_REPORT"].includes(status || "")) {
    return "bg-rose-50 text-rose-600";
  }
  return "bg-[#f3f4f9] text-[#4d4354]/70";
}

function classLabel(item: any) {
  if (!item) return "Unassigned";
  return [item.name, item.section].filter(Boolean).join(" ");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasActiveSlot(slot: any) {
  return Boolean(slot && slot.status !== "Invited" && slot.status !== "Expired");
}

const generateRegId = (prefix = "BR") => `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

type SuperView = "schools" | "billing";
type ClassFormState = {
  name: string;
  section: string;
  academicYear: number;
  classTeacherId: string;
};
export default function SuperAdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<SuperView>("schools");
  const [selectedCampus, setSelectedCampus] = useState<any>(null);
  const [showAddCampusModal, setShowAddCampusModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [movingStudent, setMovingStudent] = useState<any>(null);
  const [newCampusData, setNewCampusData] = useState({ name: "", location: "", regId: "", autoId: true });
  const [addingCampus, setAddingCampus] = useState(false);
  const [inviteRole, setInviteRole] = useState<"CAMPUS_ADMIN" | "PRINCIPAL">("CAMPUS_ADMIN");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [classForm, setClassForm] = useState<ClassFormState>({
    name: "",
    section: "",
    academicYear: new Date().getFullYear(),
    classTeacherId: "",
  });
  const [moveClassId, setMoveClassId] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [movingStudentBusy, setMovingStudentBusy] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [subjectModalClass, setSubjectModalClass] = useState<any>(null);
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
      const result = await getSuperAdminDashboardData();
      setData(result);
      setSelectedCampus((current: any) =>
        current ? result.campuses.find((campus: any) => campus.id === current.id) || null : null
      );
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "billing") {
      setActiveView("billing");
      setSelectedCampus(null);
    }
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const exportStudentsCSV = (campus: any) => {
    if (!campus?.students?.length) return toast.error("No student data to export");
    const headers = ["Full Name,Roll No,Gender,Class,Guardian Name,Guardian Phone,Guardian Email"];
    const rows = campus.students.map((s: any) =>
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
    a.download = `${campus.name.replace(/\s+/g, "_")}_students.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${campus.students.length} students exported`);
  };
  const syncSuperUrl = (view: SuperView) => {
    window.history.replaceState(null, "", view === "billing" ? "/super?view=billing" : "/super");
  };
  const openSchools = () => {
    setActiveView("schools");
    setSelectedCampus(null);
    syncSuperUrl("schools");
  };
  const openBilling = () => {
    setActiveView("billing");
    setSelectedCampus(null);
    syncSuperUrl("billing");
  };
  const openCampus = (campus: any) => {
    setActiveView("schools");
    setSelectedCampus(campus);
    syncSuperUrl("schools");
  };
  const openAI = () => {
    setActiveView("schools");
    setSelectedCampus(null);
    syncSuperUrl("schools");
    window.requestAnimationFrame(() => {
      document.getElementById("network-ai-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleInvite = async () => {
    if (!selectedCampus) return;
    if (!inviteEmail) return toast.error("Email is required");
    setInviting(true);
    try {
      await inviteStaff({ email: inviteEmail, role: inviteRole, campusId: selectedCampus.id });
      toast.success("Invitation dispatched successfully");
      setShowInviteModal(false);
      setInviteEmail("");
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setInviting(false);
    }
  };

  const handleAddCampus = async () => {
    if (!newCampusData.name || !newCampusData.location) {
      return toast.error("Please fill all required fields");
    }
    setAddingCampus(true);
    try {
      await addCampus(
        newCampusData.name,
        newCampusData.location,
        "Default",
        undefined,
        newCampusData.autoId ? newCampusData.regId || undefined : newCampusData.regId
      );
      toast.success("New campus created");
      setShowAddCampusModal(false);
      setNewCampusData({ name: "", location: "", regId: "", autoId: true });
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setAddingCampus(false);
    }
  };

  const openMoveStudent = (student: any) => {
    if (!selectedCampus) return;
    setMovingStudent(student);
    setMoveClassId(student.class?.id || selectedCampus.classes?.[0]?.id || "");
  };

  const handleCreateClass = async () => {
    if (!selectedCampus) return;
    if (!classForm.name.trim()) return toast.error("Class name is required");
    setSavingClass(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campusId: selectedCampus.id,
          name: classForm.name.trim(),
          section: classForm.section.trim(),
          academicYear: classForm.academicYear,
          classTeacherId: classForm.classTeacherId || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Class could not be created");
      toast.success("Class created");
      setShowClassModal(false);
      setClassForm({ name: "", section: "", academicYear: new Date().getFullYear(), classTeacherId: "" });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Class could not be created");
    } finally {
      setSavingClass(false);
    }
  };

  const handleMoveStudent = async () => {
    if (!selectedCampus || !movingStudent || !moveClassId) return;
    setMovingStudentBusy(true);
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: movingStudent.id, campusId: selectedCampus.id, classId: moveClassId }),
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

  const handleRemove = async (userId: string, type: "Admin" | "Principal") => {
    setConfirmAction({
      title: `Revoke ${type} access?`,
      description: `This will remove the selected ${type.toLowerCase()} from the campus authority slot.`,
      confirmLabel: "Revoke access",
      run: async () => {
        await removeStaff(userId);
        toast.success(`${type} access revoked`);
        await loadData();
      },
    });
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

  const handleResendInvite = async (inviteId: string) => {
    try {
      await resendInvitation(inviteId);
      toast.success("Invitation resent");
      await loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
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
    { icon: LayoutGrid, label: "Schools", active: activeView === "schools" && !selectedCampus, onClick: openSchools },
    { icon: CreditCard, label: "Plans & Billing", active: activeView === "billing", onClick: openBilling },
    { icon: Sparkles, label: "AI Engine", onClick: openAI },
  ];
  const bottomItems: RoleNavItem[] = [
    { icon: HelpCircle, label: "Support", onClick: () => toast.info("Network support is available from this role workspace.") },
    { icon: LogOut, label: "Logout", onClick: handleLogout },
  ];
  const superAIFeatures = [
    { feature: "campus_comparison", label: "Campus Comparison", placeholder: "Optional academic year or term" },
    { feature: "weak_campuses", label: "Weak Campuses", placeholder: "Support focus or threshold" },
    { feature: "ai_usage_by_campus", label: "AI Usage", placeholder: "Optional governance focus" },
    { feature: "fee_recovery_insights", label: "Fee Recovery", placeholder: "Optional date or campus focus" },
    { feature: "academic_trend_summary", label: "Academic Trends", placeholder: "Optional exam or term focus" },
  ];

  if (loading && !data) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4">
        <GraduationCap className="h-12 w-12 text-[#8127cf] animate-bounce" />
        <p className="text-sm font-black text-[#1f1a23] uppercase tracking-normal">Synchronizing School Network...</p>
      </div>
    );
  }

  return (
    <RoleShell
      navItems={navItems}
      bottomItems={bottomItems}
      searchPlaceholder="Search facilities or users..."
      userName={data.user.fullName}
      userRole={data.user.role}
      avatarSeed={data.user.email || data.user.fullName}
      dashboardHref="/super"
      headerActions={
        <BrandButton
          variant="soft"
          icon={<CreditCard className="w-4 h-4" />}
          onClick={openBilling}
          className="min-h-10 px-3 sm:px-4 rounded-xl whitespace-nowrap"
          title="Plans & Billing"
        >
          <span className="hidden lg:inline">Plans & Billing</span>
        </BrandButton>
      }
    >
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 overflow-hidden flex flex-col">
        {activeView === "billing" ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <BillingPage embedded />
          </div>
        ) : !selectedCampus ? (
          <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
              <div>
                <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal">School Network</h2>
                <p className="text-[#4d4354]/40 font-bold mt-1 uppercase text-[10px] tracking-normal italic">
                  {data.schoolName} Group
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <BrandButton variant="soft" icon={<CreditCard className="w-5 h-5" />} onClick={openBilling}>
                  Plans & Billing
                </BrandButton>
                <BrandButton icon={<Plus className="w-5 h-5" />} onClick={() => setShowAddCampusModal(true)}>
                  Add New School
                </BrandButton>
              </div>
            </div>

            <BillingBanner billing={data.billing} onOpen={openBilling} />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
              <StatCard
                icon={CreditCard}
                label="Plan"
                value={data.billing?.plan || "FREE"}
                sub={data.billing?.status || "TRIAL"}
                tone={data.billing?.status === "SUSPENDED" ? "rose" : "purple"}
              />
              <StatCard icon={School} label="Campuses" value={data.campuses.length} />
              <StatCard
                icon={GraduationCap}
                label="Students"
                value={data.networkSummary.totalStudents}
                tone="green"
              />
              <StatCard
                icon={Shield}
                label="Class Hubs"
                value={data.networkSummary.totalClasses}
                tone="rose"
              />
              <StatCard
                icon={Sparkles}
                label="AI Runs"
                value={data.networkSummary.totalAiRuns}
                tone="dark"
              />
            </div>

            <NetworkCommandPanel
              data={data}
              onSelectCampus={openCampus}
              onOpenBilling={openBilling}
            />

            <div id="network-ai-panel" className="mb-8 bg-[#fbf0fe]/30 border border-[#cfc2d6]/10 rounded-[32px] p-6 scroll-mt-6">
              <div className="flex items-center gap-3 mb-5">
                <Sparkles className="w-5 h-5 text-[#8127cf]" />
                <h3 className="text-lg font-black text-[#1f1a23] tracking-normal">AI Network Insights</h3>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5 mb-5">
                <AiActionPanel title="Super Admin AI" options={superAIFeatures} compact onComplete={loadData} />
                <div className="rounded-[24px] bg-white border border-[#cfc2d6]/10 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <Shield className="w-5 h-5 text-[#8127cf]" />
                    <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-normal">AI Review</p>
                  </div>
                  <AIReviewQueue items={data.pendingAIReviewItems} onComplete={loadData} />
                </div>
              </div>
              {data.aiInsights?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.aiInsights.slice(0, 4).map((insight: any) => (
                    <div key={insight.id} className="bg-white rounded-[20px] p-4 border border-[#cfc2d6]/10">
                      <p className="text-[9px] font-black text-[#8127cf] uppercase tracking-normal mb-1">
                        {insight.feature.replaceAll("_", " ")}
                      </p>
                      <p className="text-sm font-bold text-[#1f1a23] leading-snug">{insight.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-[#4d4354]/40 italic">
                  Campus comparisons, fee recovery, and academic trend drafts will appear after the AI engine runs.
                </p>
              )}
            </div>

            {data.campuses.length > 0 ? (
              <CampusComparison campuses={data.campuses} onManage={openCampus} />
            ) : null}

            {data.campuses.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No campuses yet"
                description="Create the first campus in this school group to start assigning admins and principals."
                action={<BrandButton onClick={() => setShowAddCampusModal(true)}>Create Campus</BrandButton>}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {data.campuses.map((campus: any) => (
                  <CampusCard key={campus.id} campus={campus} onManage={() => openCampus(campus)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="p-8 border-b border-[#f3f4f9] flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-5">
                <button
                  onClick={() => setSelectedCampus(null)}
                  className="h-10 w-10 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div>
                  <h2 className="text-2xl font-black text-[#1f1a23] tracking-normal leading-none mb-1">
                    {selectedCampus.name}
                  </h2>
                  <p className="text-[9px] font-black text-[#8127cf] uppercase tracking-normal flex items-center gap-2">
                    <MapPin className="w-3 h-3" />
                    {selectedCampus.city} Campus Identity Hub
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <BrandButton variant="soft" icon={<School className="w-4 h-4" />} onClick={() => setShowClassModal(true)}>
                  Add Class
                </BrandButton>
                <BrandButton variant="soft" icon={<Users className="w-4 h-4" />} onClick={() => setShowBulkImportModal(true)}>
                  Bulk Import
                </BrandButton>
                <BrandButton variant="soft" icon={<ClipboardList className="w-4 h-4" />} onClick={() => setShowActivityLogModal(true)}>
                  Activity Log
                </BrandButton>
                <BrandButton variant="soft" icon={<Download className="w-4 h-4" />} onClick={() => exportStudentsCSV(selectedCampus)}>
                  Export CSV
                </BrandButton>
                <SuperStatusPill status={hasActiveSlot(selectedCampus.admin) && hasActiveSlot(selectedCampus.principal) ? "ACTIVE" : "MISSING"} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/30">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <ManagementCard
                  title="Campus Administrator"
                  icon={Shield}
                  description="Sole authority for campus operations. One active admin is allowed per campus."
                  user={selectedCampus.admin}
                  onAdd={() => {
                    setInviteRole("CAMPUS_ADMIN");
                    setShowInviteModal(true);
                  }}
                  onRemove={(id) => handleRemove(id, "Admin")}
                  onResendInvite={handleResendInvite}
                  onCancelInvite={handleCancelInvite}
                />
                <ManagementCard
                  title="Principal / Academic Head"
                  icon={GraduationCap}
                  description="Academic overseer for teachers, classes, exams, and report card review."
                  user={selectedCampus.principal}
                  onAdd={() => {
                    setInviteRole("PRINCIPAL");
                    setShowInviteModal(true);
                  }}
                  onRemove={(id) => handleRemove(id, "Principal")}
                  onResendInvite={handleResendInvite}
                  onCancelInvite={handleCancelInvite}
                />
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
                <InfoPill label="Students" value={selectedCampus.studentCount} />
                <InfoPill label="Classes" value={selectedCampus.classCount} />
                <InfoPill label="Staff" value={selectedCampus.staffCount} active />
              </div>

              <CampusOwnerSnapshot
                campus={selectedCampus}
                onAddClass={() => setShowClassModal(true)}
                onManageSubjects={(cls) => { setSubjectModalClass(cls); setShowSubjectModal(true); }}
                onBulkImport={() => setShowBulkImportModal(true)}
                onMoveStudent={openMoveStudent}
              />
            </div>
          </div>
        )}
      </section>

      {showInviteModal && (
        <ModalFrame onClose={() => setShowInviteModal(false)} title={`Invite ${inviteRole === "CAMPUS_ADMIN" ? "Admin" : "Principal"}`}>
          <div className="space-y-6 mb-8">
            <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-4">
              <Mail className="w-6 h-6 text-[#8127cf]" />
              <input
                type="email"
                placeholder="Enter official email..."
                className="bg-transparent border-none outline-none font-bold text-sm w-full"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <BrandButton variant="soft" className="flex-1 h-14" onClick={() => setShowInviteModal(false)}>
              Cancel
            </BrandButton>
            <BrandButton variant="dark" className="flex-[2] h-14" onClick={handleInvite} disabled={inviting}>
              {inviting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Invite"}
            </BrandButton>
          </div>
        </ModalFrame>
      )}

      {showAddCampusModal && (
        <ModalFrame onClose={() => setShowAddCampusModal(false)} title="Instantiate Facility" wide>
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <CampusInput
              label="Campus Name"
              icon={Building2}
              value={newCampusData.name}
              placeholder="e.g. South Campus"
              onChange={(value) => setNewCampusData({ ...newCampusData, name: value })}
            />
            <CampusInput
              label="City / Location"
              icon={MapPin}
              value={newCampusData.location}
              placeholder="e.g. Islamabad"
              onChange={(value) => setNewCampusData({ ...newCampusData, location: value })}
            />
            <div className="md:col-span-2 p-6 bg-[#fbf0fe] rounded-[28px] border border-[#cfc2d6]/20">
              <div className="flex items-center justify-between mb-4">
                <label className="text-[9px] font-black text-[#8127cf] uppercase tracking-normal">Campus Key</label>
                <button
                  onClick={() =>
                    setNewCampusData({
                      ...newCampusData,
                      autoId: !newCampusData.autoId,
                      regId: !newCampusData.autoId ? generateRegId() : ""
                    })
                  }
                  className="text-[9px] font-black uppercase tracking-normal px-3 py-1 rounded-lg bg-white text-[#8127cf] border border-[#8127cf]/20"
                >
                  {newCampusData.autoId ? "Auto" : "Manual"}
                </button>
              </div>
              <input
                type="text"
                placeholder={newCampusData.autoId ? "KEY-AUTO" : "BR-XXXX"}
                readOnly={newCampusData.autoId}
                className="w-full h-14 bg-white rounded-xl border-none outline-none font-black text-center tracking-normal shadow-sm"
                value={newCampusData.regId}
                onChange={(event) => setNewCampusData({ ...newCampusData, regId: event.target.value.toUpperCase() })}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <BrandButton variant="soft" className="flex-1 h-14" onClick={() => setShowAddCampusModal(false)}>
              Cancel
            </BrandButton>
            <BrandButton variant="dark" className="flex-[2] h-14" onClick={handleAddCampus} disabled={addingCampus}>
              {addingCampus ? <Loader2 className="w-5 h-5 animate-spin" /> : "Deploy Node"}
            </BrandButton>
          </div>
        </ModalFrame>
      )}
      {showClassModal && selectedCampus ? (
        <ClassModal
          campusName={selectedCampus.name}
          form={classForm}
          teachers={selectedCampus.teachers || []}
          busy={savingClass}
          onChange={setClassForm}
          onClose={() => setShowClassModal(false)}
          onSave={handleCreateClass}
        />
      ) : null}
      {showSubjectModal && selectedCampus && subjectModalClass ? (
        <SubjectManager
          classItem={subjectModalClass}
          campusId={selectedCampus.id}
          teachers={selectedCampus.teachers || []}
          onClose={() => { setShowSubjectModal(false); setSubjectModalClass(null); }}
          onComplete={loadData}
        />
      ) : null}
      {showBulkImportModal && selectedCampus ? (
        <BulkStudentImport
          campusId={selectedCampus.id}
          campusName={selectedCampus.name}
          classes={selectedCampus.classes || []}
          onClose={() => setShowBulkImportModal(false)}
          onComplete={loadData}
        />
      ) : null}
      {showActivityLogModal ? (
        <ActivityLogModal onClose={() => setShowActivityLogModal(false)} />
      ) : null}
      {movingStudent && selectedCampus ? (
        <MoveStudentModal
          student={movingStudent}
          classes={selectedCampus.classes || []}
          classId={moveClassId}
          busy={movingStudentBusy}
          onClassChange={setMoveClassId}
          onClose={() => setMovingStudent(null)}
          onSave={handleMoveStudent}
        />
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

function ClassModal({
  campusName,
  form,
  teachers,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  campusName: string;
  form: ClassFormState;
  teachers: any[];
  busy: boolean;
  onChange: (form: ClassFormState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalFrame title="Add Class / Section" onClose={onClose}>
      <CampusContext name={campusName} />
      <div className="space-y-4">
        <FormInput
          label="Class Name"
          value={form.name}
          placeholder="e.g. Grade 8"
          onChange={(value) => onChange({ ...form, name: value })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput
            label="Section"
            value={form.section}
            placeholder="A"
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
      <ModalActions busy={busy} busyLabel="Creating" actionLabel="Create Class" onClose={onClose} onSave={onSave} />
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
  return (
    <ModalFrame title="Move Student" onClose={onClose}>
      <div className="mb-5 rounded-3xl bg-[#fbf0fe]/65 p-5">
        <p className="text-sm font-black text-[#1f1a23]">{student.fullName}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
          Current: {classLabel(student.class)}
        </p>
      </div>
      <FormSelect label="New Class / Section" value={classId} onChange={onClassChange}>
        <option value="">Select class</option>
        {classes.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {classLabel(cls)} - {cls.academicYear}
          </option>
        ))}
      </FormSelect>
      <ModalActions busy={busy} busyLabel="Moving" actionLabel="Move Student" onClose={onClose} onSave={onSave} />
    </ModalFrame>
  );
}

function CampusContext({ name }: { name: string }) {
  return (
    <div className="mb-5 rounded-3xl bg-[#fbf0fe]/65 p-4">
      <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">Campus</p>
      <p className="mt-1 truncate text-sm font-black text-[#1f1a23]">{name}</p>
    </div>
  );
}

function SuperStatusPill({ status }: { status?: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${statusTone(status)}`}>
      {formatStatus(status)}
    </span>
  );
}

function NetworkCommandPanel({
  data,
  onSelectCampus,
  onOpenBilling,
}: {
  data: any;
  onSelectCampus: (campus: any) => void;
  onOpenBilling: () => void;
}) {
  const leadershipGaps = data.campuses.filter((campus: any) => !hasActiveSlot(campus.admin) || !hasActiveSlot(campus.principal));
  const pendingInviteCampuses = data.campuses.filter((campus: any) => campus.pendingInvitations.length > 0);

  return (
    <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/35 p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-[#8127cf]" />
            <h3 className="text-lg font-black text-[#1f1a23]">Network Command Center</h3>
          </div>
          <SuperStatusPill status={data.billing?.status || "TRIAL"} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <OwnerMetric icon={Users} label="Teachers" value={data.networkSummary.totalTeachers} />
          <OwnerMetric icon={ClipboardList} label="Subjects" value={data.networkSummary.totalSubjects} />
          <OwnerMetric icon={FileText} label="Reports" value={data.networkSummary.totalReportCards} />
          <OwnerMetric icon={MessageSquare} label="Sent Messages" value={data.networkSummary.sentCommunications} />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <SummaryBucket
            icon={AlertCircle}
            label="Leadership Gaps"
            value={data.networkSummary.adminGaps + data.networkSummary.principalGaps}
            tone="rose"
          />
          <SummaryBucket
            icon={Mail}
            label="Pending Invites"
            value={data.networkSummary.pendingInvites}
            tone="purple"
          />
          <SummaryBucket
            icon={CreditCard}
            label="Fee Follow-up"
            value={data.networkSummary.pendingInvoices + data.networkSummary.partialInvoices}
            tone="amber"
          />
        </div>
      </div>

      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-[#8127cf]" />
            <h3 className="text-lg font-black text-[#1f1a23]">Action Queue</h3>
          </div>
          <SuperStatusPill status={leadershipGaps.length ? "MISSING" : "ACTIVE"} />
        </div>
        <div className="space-y-3">
          {leadershipGaps.slice(0, 4).map((campus: any) => (
            <button
              key={campus.id}
              type="button"
              onClick={() => onSelectCampus(campus)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl bg-[#fbf0fe]/60 px-4 py-3 text-left transition-all hover:bg-[#fbf0fe] hover:shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#1f1a23]">{campus.name}</p>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                  {!hasActiveSlot(campus.admin) ? "Admin needed" : ""}{!hasActiveSlot(campus.admin) && !hasActiveSlot(campus.principal) ? " - " : ""}{!hasActiveSlot(campus.principal) ? "Principal needed" : ""}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#8127cf]" />
            </button>
          ))}
          {leadershipGaps.length === 0 ? (
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-sm font-black text-emerald-700">All campuses have leadership assigned.</p>
            </div>
          ) : null}

          {pendingInviteCampuses.length > 0 ? (
            <div className="rounded-2xl bg-[#f3f4f9] px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">Pending Invitations</p>
              <p className="mt-1 text-sm font-black text-[#1f1a23]">
                {pendingInviteCampuses.length} campuses waiting for acceptance
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onOpenBilling}
            className="flex w-full cursor-pointer items-center justify-between rounded-2xl bg-[#1f1a23] px-4 py-3 text-left text-white transition-all hover:bg-black"
          >
            <span className="text-sm font-black">Billing, plan, and AI credit control</span>
            <CreditCard className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CampusComparison({ campuses, onManage }: { campuses: any[]; onManage: (campus: any) => void }) {
  return (
    <div className="mb-8 rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-[#8127cf]" />
          <h3 className="text-lg font-black text-[#1f1a23]">Campus Comparison</h3>
        </div>
        <SuperStatusPill status={`${campuses.length} Campuses`} />
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
              <th className="px-4 py-3">Campus</th>
              <th className="px-4 py-3">Leadership</th>
              <th className="px-4 py-3">Academics</th>
              <th className="px-4 py-3">Reports</th>
              <th className="px-4 py-3">Engagement</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3f4f9]">
            {campuses.map((campus) => (
              <tr key={campus.id} className="text-sm">
                <td className="px-4 py-4">
                  <p className="font-black text-[#1f1a23]">{campus.name}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/40">{campus.city}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <SuperStatusPill status={campus.admin ? campus.admin.status : "MISSING"} />
                    <SuperStatusPill status={campus.principal ? campus.principal.status : "MISSING"} />
                  </div>
                </td>
                <td className="px-4 py-4 font-bold text-[#4d4354]/70">
                  {campus.studentCount} students / {campus.classCount} classes / {campus.teacherCount} teachers
                </td>
                <td className="px-4 py-4 font-bold text-[#4d4354]/70">
                  {campus.reportCardCount} cards / {campus.examCount} exams
                </td>
                <td className="px-4 py-4 font-bold text-[#4d4354]/70">
                  {campus.communicationSummary.SENT || 0} sent / {(campus.communicationSummary.FAILED || 0) + (campus.communicationSummary.BLOCKED || 0)} issues
                </td>
                <td className="px-4 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onManage(campus)}
                    className="cursor-pointer rounded-2xl bg-[#fbf0fe] px-4 py-2 text-[10px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampusOwnerSnapshot({
  campus,
  onAddClass,
  onManageSubjects,
  onBulkImport,
  onMoveStudent,
}: {
  campus: any;
  onAddClass: () => void;
  onManageSubjects: (cls: any) => void;
  onBulkImport: () => void;
  onMoveStudent: (student: any) => void;
}) {
  return (
    <div className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <PanelTitle icon={School} title="Academic Structure" />
            <div className="flex flex-wrap gap-2">
              <BrandButton variant="soft" icon={<School className="h-4 w-4" />} onClick={onAddClass} className="min-h-9 rounded-xl px-3 text-[10px]">
                Add Class
              </BrandButton>
              <SuperStatusPill status={`${campus.classCount} Classes`} />
            </div>
          </div>
          <div className="space-y-3">
              {campus.classes.map((cls: any) => (
              <div key={cls.id} className="rounded-[22px] bg-[#fbf0fe]/60 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#1f1a23]">{classLabel(cls)}</p>
                    <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                      {cls.classTeacher?.fullName || "No class teacher"} - {cls.academicYear}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onManageSubjects(cls)}
                      className="cursor-pointer rounded-full bg-white px-3 py-1 text-[8px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                    >
                      {cls._count?.subjects || 0} Subjects
                    </button>
                    <SuperStatusPill status={`${cls._count?.students || 0} Students`} />
                  </div>
                </div>
              </div>
            ))}
            {campus.classes.length === 0 ? (
              <div className="rounded-2xl bg-[#fbf0fe]/60 p-4">
                <p className="text-sm font-semibold text-[#4d4354]/55">No classes have been created for this campus yet.</p>
                <BrandButton variant="soft" icon={<Plus className="h-4 w-4" />} onClick={onAddClass} className="mt-4 min-h-9 rounded-xl px-3 text-[10px]">
                  Add First Class
                </BrandButton>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
          <div className="mb-5 flex items-center justify-between gap-4">
            <PanelTitle icon={Users} title="Teacher Coverage" />
            <SuperStatusPill status={`${campus.teacherCount} Teachers`} />
          </div>
          <div className="space-y-3">
            {campus.teachers.map((teacher: any) => (
              <div key={teacher.id} className="flex items-center justify-between gap-3 rounded-[22px] bg-[#fbf0fe]/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1f1a23]">{teacher.fullName}</p>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">{teacher.email}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-[#8127cf]">{teacher._count?.taughtSubjects || 0}</p>
                  <p className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">Subjects</p>
                </div>
              </div>
            ))}
            {campus.teachers.length === 0 ? (
              <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">
                No active teachers are assigned to this campus yet.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <SnapshotColumn icon={FileText} title="Reports & Exams">
          {campus.recentExams.map((exam: any) => (
            <div key={exam.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1f1a23]">{exam.title}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    {exam.term} - {classLabel(exam.class)}
                  </p>
                </div>
                <SuperStatusPill status={exam.status} />
              </div>
            </div>
          ))}
          {campus.recentExams.length === 0 ? <EmptySnapshot text="No exams available yet." /> : null}
        </SnapshotColumn>

        <SnapshotColumn icon={MessageSquare} title="Parent Engagement">
          <SignalRow label="Sent" value={campus.communicationSummary.SENT || 0} tone="green" />
          <SignalRow label="Failed" value={campus.communicationSummary.FAILED || 0} tone="rose" />
          <SignalRow label="Blocked" value={campus.communicationSummary.BLOCKED || 0} tone="rose" />
          <SignalRow label="No Recipient" value={campus.communicationSummary.NO_RECIPIENT || 0} tone="amber" />
        </SnapshotColumn>

        <SnapshotColumn icon={CreditCard} title="Fee & AI Signals">
          <SignalRow label="Paid invoices" value={campus.invoiceSummary.PAID?.count || 0} tone="green" />
          <SignalRow label="Pending invoices" value={campus.invoiceSummary.PENDING?.count || 0} tone="amber" />
          <SignalRow label="Partial invoices" value={campus.invoiceSummary.PARTIAL?.count || 0} tone="purple" />
          <SignalRow label="AI runs" value={campus.aiUsage.runs} tone="purple" />
        </SnapshotColumn>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <SnapshotColumn icon={Users} title="Student Profiles">
          {campus.students.map((student: any) => {
            const latestReport = student.reportCards?.[0];
            return (
              <div key={student.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                      {student.rollNo} - {classLabel(student.class)}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-semibold text-[#4d4354]/45">
                      Guardian: {student.guardianName || "Not provided"}
                    </p>
                  </div>
                  <SuperStatusPill status={latestReport ? latestReport.status : "NO_REPORT"} />
                </div>
                <button
                  type="button"
                  onClick={() => onMoveStudent(student)}
                  className="mt-4 flex h-10 w-full cursor-pointer items-center justify-center rounded-xl bg-white text-[10px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                >
                  Move Class / Section
                </button>
              </div>
            );
          })}
          {campus.students.length === 0 ? <EmptySnapshot text="No student profiles are available yet." /> : null}
        </SnapshotColumn>

        <SnapshotColumn icon={FileText} title="Recent Report Cards">
          {campus.recentReportCards.map((report: any) => (
            <div key={report.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1f1a23]">{report.student.fullName}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    {report.exam.title} - {report.exam.term} - {classLabel(report.student.class)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <SuperStatusPill status={report.remarksApproved ? "APPROVED" : "REVIEW"} />
                  <SuperStatusPill status={report.isSent ? "SENT" : report.deliveryStatus} />
                </div>
              </div>
            </div>
          ))}
          {campus.recentReportCards.length === 0 ? <EmptySnapshot text="No report cards have been generated yet." /> : null}
        </SnapshotColumn>
      </div>

      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-between gap-4">
          <PanelTitle icon={Mail} title="Pending Access Invitations" />
          <SuperStatusPill status={`${campus.pendingInvitations.length} Pending`} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {campus.pendingInvitations.map((invite: any) => (
            <div key={invite.inviteId} className="rounded-[22px] bg-[#fbf0fe]/60 px-4 py-3">
              <p className="truncate text-sm font-black text-[#1f1a23]">{invite.email}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <SuperStatusPill status={invite.status} />
                  {invite.role ? <SuperStatusPill status={String(invite.role)} /> : null}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                  {new Date(invite.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
          {campus.pendingInvitations.length === 0 ? (
            <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">
              No pending invitations for this campus.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OwnerMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-[24px] bg-white p-4 shadow-sm">
      <Icon className="mb-3 h-5 w-5 text-[#8127cf]" />
      <p className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#1f1a23]">{value}</p>
    </div>
  );
}

function SummaryBucket({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "green" | "rose" | "purple" | "amber";
}) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    purple: "bg-[#fbf0fe] text-[#8127cf]",
    amber: "bg-amber-50 text-amber-600",
  }[tone];

  return (
    <div className="flex items-center justify-between gap-3 rounded-[24px] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">{label}</p>
      </div>
      <p className="text-xl font-black text-[#1f1a23]">{value}</p>
    </div>
  );
}

function SnapshotColumn({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <CollapsiblePanel icon={Icon} title={title} defaultOpen headerRight={action}>
      <div className="space-y-3">{children}</div>
    </CollapsiblePanel>
  );
}

function SignalRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "rose" | "purple" | "amber";
}) {
  const toneClass = {
    green: "text-emerald-600 bg-emerald-50",
    rose: "text-rose-600 bg-rose-50",
    purple: "text-[#8127cf] bg-[#fbf0fe]",
    amber: "text-amber-600 bg-amber-50",
  }[tone];

  return (
    <div className="flex items-center justify-between rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
      <span className="text-[10px] font-black uppercase tracking-normal text-[#4d4354]/45">{label}</span>
      <span className={`rounded-full px-3 py-1 text-[10px] font-black ${toneClass}`}>{value}</span>
    </div>
  );
}

function EmptySnapshot({ text }: { text: string }) {
  return <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">{text}</p>;
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

function BillingBanner({ billing, onOpen }: { billing: any; onOpen: () => void }) {
  const plan = billing?.plan || "FREE";
  const status = billing?.status || "TRIAL";
  const creditsUsed = Number(billing?.aiCreditsUsed || 0);
  const creditsLimit = Number(billing?.aiCreditsLimit || 100);
  const creditsLabel =
    creditsLimit < 0
      ? `${creditsUsed.toLocaleString()} / Unlimited`
      : `${creditsUsed.toLocaleString()} / ${creditsLimit.toLocaleString()}`;

  return (
    <div className="mb-8 rounded-[32px] border border-[#8127cf]/10 bg-[#1f1a23] p-5 text-white shadow-2xl shadow-indigo-100">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-white/10 text-white">
            <CreditCard className="h-7 w-7" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-normal text-white/50">Plans & Billing</p>
            <h3 className="mt-1 text-2xl font-black tracking-normal">{plan} Plan</h3>
            <p className="mt-1 text-xs font-bold uppercase tracking-normal text-[#cfc2d6]">Status: {status}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-2xl bg-white/10 px-5 py-3">
            <p className="text-[9px] font-black uppercase tracking-normal text-white/45">AI Credits</p>
            <p className="text-lg font-black">{creditsLabel}</p>
          </div>
          <BrandButton variant="soft" icon={<CreditCard className="h-4 w-4" />} onClick={onOpen} className="bg-white text-[#8127cf]">
            Open Billing
          </BrandButton>
        </div>
      </div>
    </div>
  );
}

function CampusCard({ campus, onManage }: { campus: any; onManage: () => void }) {
  const hasLeadership = hasActiveSlot(campus.admin) && hasActiveSlot(campus.principal);

  return (
    <div className="bg-white p-7 rounded-[32px] shadow-lg border border-[#cfc2d6]/10 flex flex-col min-h-[330px] relative overflow-hidden group hover:shadow-2xl transition-all">
      <div className="absolute top-6 right-6">
        <SuperStatusPill status={hasLeadership ? "ACTIVE" : "MISSING"} />
      </div>
      <div className="h-14 w-14 bg-[#fbf0fe] rounded-[20px] flex items-center justify-center text-[#8127cf] mb-6 shadow-inner group-hover:scale-110 transition-transform">
        {hasLeadership ? <CheckCircle2 className="w-7 h-7" /> : <AlertCircle className="w-7 h-7" />}
      </div>
      <h3 className="text-xl font-black text-[#1f1a23] tracking-normal mb-1 pr-16">{campus.name}</h3>
      <div className="flex items-center gap-2 text-[#4d4354]/40 text-[9px] font-bold uppercase tracking-normal mb-8">
        <MapPin className="w-2.5 h-2.5 text-[#8127cf]" />
        {campus.city}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <CampusMiniMetric label="Students" value={campus.studentCount} />
        <CampusMiniMetric label="Classes" value={campus.classCount} />
        <CampusMiniMetric label="Teachers" value={campus.teacherCount} active />
      </div>

      <div className="space-y-2 mb-5">
        <div className="flex items-center justify-between rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
          <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">Admin</span>
          <SuperStatusPill status={campus.admin ? campus.admin.status : "MISSING"} />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
          <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">Principal</span>
          <SuperStatusPill status={campus.principal ? campus.principal.status : "MISSING"} />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between">
        <div className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
          {campus.reportCardCount} reports / {campus.aiUsage.runs} AI runs
        </div>
        <button onClick={onManage} className="flex items-center gap-1.5 text-[#8127cf] font-black italic tracking-normal text-base hover:translate-x-1 transition-transform cursor-pointer">
          Manage <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function CampusMiniMetric({ label, value, active }: { label: string; value: any; active?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/70 px-3 py-3">
      <p className="text-[7px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p>
      <p className={`mt-1 text-base font-black ${active ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{value}</p>
    </div>
  );
}

function InfoPill({ label, value, active }: { label: string; value: any; active?: boolean }) {
  return (
    <div className="p-5 bg-white rounded-[24px] border border-[#cfc2d6]/10 shadow-lg">
      <p className="text-[8px] font-black text-[#4d4354]/40 uppercase tracking-normal mb-1">{label}</p>
      <p className={`text-xl font-black italic tracking-normal ${active ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{value}</p>
    </div>
  );
}

function ModalFrame({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5">
      <div className={`bg-white w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar`}>
        <div className="flex justify-between items-start gap-5 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase text-[#8127cf]">Network action</p>
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
            <Loader2 className="h-5 w-5 animate-spin" />
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

function CampusInput({
  label,
  icon: Icon,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-[9px] font-black text-[#4d4354]/40 uppercase tracking-normal pl-2 mb-2 block">{label}</label>
      <div className="p-4 bg-[#f3f4f9] rounded-2xl border border-transparent focus-within:border-[#8127cf]/30 transition-all flex items-center gap-3">
        <Icon className="w-5 h-5 text-[#4d4354]/40" />
        <input
          type="text"
          placeholder={placeholder}
          className="bg-transparent border-none outline-none font-bold text-sm w-full"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

function SubjectManager({
  classItem,
  campusId,
  teachers,
  onClose,
  onComplete,
}: {
  classItem: any;
  campusId: string;
  teachers: any[];
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMarks, setNewMarks] = useState("100");
  const [newTeacherId, setNewTeacherId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMarks, setEditMarks] = useState("");
  const [editTeacherId, setEditTeacherId] = useState("");

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/subjects?classId=${classItem.id}&campusId=${campusId}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to load");
      setSubjects(result.data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [classItem.id, campusId]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const handleAdd = async () => {
    if (!newName.trim()) return toast.error("Subject name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          totalMarks: Number(newMarks) || 100,
          classId: classItem.id,
          teacherId: newTeacherId || undefined,
          campusId,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create");
      toast.success("Subject added");
      setNewName("");
      setNewMarks("100");
      setNewTeacherId("");
      await loadSubjects();
      await onComplete();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (subjectId: string) => {
    if (!editName.trim()) return toast.error("Subject name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: subjectId,
          name: editName.trim(),
          totalMarks: Number(editMarks) || 100,
          teacherId: editTeacherId || null,
          campusId,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to update");
      toast.success("Subject updated");
      setEditingId(null);
      await loadSubjects();
      await onComplete();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (subjectId: string) => {
    if (!window.confirm("Delete this subject? Students' marks for this subject will be preserved.")) return;
    try {
      const res = await fetch(`/api/subjects?id=${subjectId}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to delete");
      toast.success("Subject deleted");
      await loadSubjects();
      await onComplete();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <ModalFrame title={`Subjects: ${classLabel(classItem)}`} onClose={onClose} wide>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6 max-h-64 overflow-y-auto custom-scrollbar">
            {subjects.length === 0 ? (
              <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-[#4d4354]/55">No subjects assigned yet.</p>
            ) : (
              subjects.map((subject) => (
                <div key={subject.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
                  {editingId === subject.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-[1fr_100px] gap-3">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold outline-none"
                          placeholder="Subject name"
                        />
                        <input
                          type="number"
                          value={editMarks}
                          onChange={(e) => setEditMarks(e.target.value)}
                          className="h-10 rounded-xl border border-[#cfc2d6]/20 bg-white px-3 text-sm font-bold outline-none text-center"
                        />
                      </div>
                      <FormSelect label="Teacher" value={editTeacherId} onChange={setEditTeacherId}>
                        <option value="">Unassigned</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>{t.fullName}</option>
                        ))}
                      </FormSelect>
                      <div className="flex gap-2">
                        <BrandButton variant="soft" className="flex-1 h-9 text-xs" onClick={() => setEditingId(null)}>Cancel</BrandButton>
                        <BrandButton variant="dark" className="flex-1 h-9 text-xs" onClick={() => handleEdit(subject.id)} disabled={saving}>
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </BrandButton>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-[#1f1a23]">{subject.name}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                          {subject.teacher?.fullName || "No teacher"} — {subject.totalMarks} marks
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(subject.id);
                            setEditName(subject.name);
                            setEditMarks(String(subject.totalMarks || 100));
                            setEditTeacherId(subject.teacher?.id || "");
                          }}
                          className="cursor-pointer rounded-full bg-white px-3 py-1 text-[8px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(subject.id)}
                          className="cursor-pointer rounded-full bg-rose-50 px-3 py-1 text-[8px] font-black uppercase tracking-normal text-rose-600 transition-all hover:bg-rose-600 hover:text-white"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="rounded-3xl bg-[#fbf0fe]/40 p-5 border border-[#cfc2d6]/10">
            <p className="mb-3 text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Add Subject</p>
            <div className="grid grid-cols-[1fr_100px] gap-3 mb-3">
              <FormInput label="Subject Name" value={newName} placeholder="e.g. Mathematics" onChange={setNewName} />
              <FormInput label="Total Marks" value={newMarks} placeholder="100" onChange={setNewMarks} />
            </div>
            <FormSelect label="Teacher (optional)" value={newTeacherId} onChange={setNewTeacherId}>
              <option value="">Unassigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName}</option>
              ))}
            </FormSelect>
            <div className="mt-4 flex justify-end">
              <BrandButton variant="dark" icon={<Plus className="w-4 h-4" />} onClick={handleAdd} disabled={saving || !newName.trim()} className="h-11">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Subject"}
              </BrandButton>
            </div>
          </div>
        </>
      )}
    </ModalFrame>
  );
}

function BulkStudentImport({
  campusId,
  campusName,
  classes,
  onClose,
  onComplete,
}: {
  campusId: string;
  campusName: string;
  classes: any[];
  onClose: () => void;
  onComplete: () => Promise<void>;
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
    <ModalFrame title={`Bulk Import Students — ${campusName}`} onClose={onClose} wide>
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
    <ModalFrame title="Activity Log" onClose={onClose} wide>
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
