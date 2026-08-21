"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  BarChart3,
  Building2,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  CreditCard,
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
  Receipt,
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
import { FeeManagementPanel } from "@/components/billing/FeeManagementPanel";
import { PlansPanel } from "@/components/billing/PlansPanel";
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
import { ConfirmAction } from "@/components/ui/confirm-action";
import { CornerSparkles } from "@/components/CornerSparkles";
import { FeesPanel } from "@/components/fees/FeesPanel";
import { getPlanLimits } from "@/config/plans";
import { useSuperAdminData } from "./super-data-context";
import { SkeletonList } from "@/components/ui/skeleton";

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
  return "bg-[#f3f4f9] text-ink";
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

type SuperView = "schools" | "billing" | "fees";
export default function SuperAdminDashboard() {
  const router = useRouter();
  const { data, loading, refetch } = useSuperAdminData();
  const [activeView, setActiveView] = useState<SuperView>("schools");
  const [selectedCampus, setSelectedCampus] = useState<any>(null);
  const [showAddCampusModal, setShowAddCampusModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newCampusData, setNewCampusData] = useState({ name: "", location: "", regId: "", autoId: true });
  const [addingCampus, setAddingCampus] = useState(false);
  const [inviteRole, setInviteRole] = useState<"CAMPUS_ADMIN" | "PRINCIPAL">("CAMPUS_ADMIN");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);
  const [showCampusFees, setShowCampusFees] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setSelectedCampus((current: any) =>
        current ? data.campuses.find((campus: any) => campus.id === current.id) || null : null
      );
    }
  }, [data]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "billing") {
      setActiveView("billing");
      setSelectedCampus(null);
    }
    if (params.get("view") === "fees") {
      setActiveView("fees");
      setSelectedCampus(null);
    }
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const syncSuperUrl = (view: SuperView) => {
    const query = view === "billing" ? "?view=billing" : view === "fees" ? "?view=fees" : "";
    window.history.replaceState(null, "", `/super${query}`);
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
  const openFees = () => {
    setActiveView("fees");
    setSelectedCampus(null);
    syncSuperUrl("fees");
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
      const result = await inviteStaff({ email: inviteEmail, role: inviteRole, campusId: selectedCampus.id });
      toast.success("Invitation dispatched successfully");
      setInviteLink(result.inviteLink || "");
      setInviteEmail("");
      await refetch();
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
      await refetch();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setAddingCampus(false);
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
        await refetch();
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
        await refetch();
      },
    });
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      await resendInvitation(inviteId);
      toast.success("Invitation resent");
      await refetch();
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
    { icon: Receipt, label: "Fees", active: activeView === "fees", onClick: openFees },
    { icon: CreditCard, label: "Plans & Billing", active: activeView === "billing", onClick: openBilling },
    { icon: Sparkles, label: "AI Engine", onClick: openAI },
  ];
const bottomItems: RoleNavItem[] = [];
  const superAIFeatures = [
    { feature: "campus_comparison", label: "Campus Comparison", placeholder: "Optional academic year or term" },
    { feature: "weak_campuses", label: "Weak Campuses", placeholder: "Support focus or threshold" },
    { feature: "ai_usage_by_campus", label: "AI Usage", placeholder: "Optional governance focus" },
    { feature: "fee_recovery_insights", label: "Fee Recovery", placeholder: "Optional date or campus focus" },
    { feature: "academic_trend_summary", label: "Academic Trends", placeholder: "Optional exam or term focus" },
  ];

  if (loading && !data) {
    return <SuperAdminSkeleton />;
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
        <div className="flex items-center gap-2">
          <BrandButton
            variant="soft"
            icon={<Receipt className="w-4 h-4" />}
            onClick={openFees}
            className="min-h-10 px-3 sm:px-4 rounded-xl whitespace-nowrap"
            title="Fee Management"
          >
            <span className="hidden lg:inline">Fees</span>
          </BrandButton>
          <BrandButton
            variant="soft"
            icon={<CreditCard className="w-4 h-4" />}
            onClick={openBilling}
            className="min-h-10 px-3 sm:px-4 rounded-xl whitespace-nowrap"
            title="Plans & Billing"
          >
            <span className="hidden lg:inline">Plans & Billing</span>
          </BrandButton>
        </div>
      }
    >
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 overflow-hidden flex flex-col">
        {activeView === "billing" ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-4 border-b border-[#f3f4f9] p-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Owner billing control</p>
                <h2 className="mt-1 text-3xl font-black tracking-normal text-[#1f1a23]">Plans & Billing</h2>
                <p className="mt-2 text-sm font-semibold text-ink-muted">
                  SaaS plan, upgrades, and AI credit control.
                </p>
              </div>
            </div>
            <div className="p-6">
              <PlansPanel />
            </div>
          </div>
        ) : activeView === "fees" ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-4 border-b border-[#f3f4f9] p-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Network fee control</p>
                <h2 className="mt-1 text-3xl font-black tracking-normal text-[#1f1a23]">Fee Management</h2>
                <p className="mt-2 text-sm font-semibold text-ink-muted">
                  Fee structures, invoices, challans, and payment recording across the network.
                </p>
              </div>
            </div>
            <div className="p-6">
              <FeeManagementPanel />
            </div>
          </div>
        ) : !selectedCampus ? (
          <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
            <div className="sk-rise flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
              <div>
                <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal">School Network</h2>
                <p className="text-ink-subtle font-bold mt-1 uppercase text-[10px] tracking-normal italic">
                  {data.schoolName} Group
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <BrandButton variant="soft" icon={<Receipt className="w-5 h-5" />} onClick={openFees}>
                  Fees
                </BrandButton>
                <BrandButton variant="soft" icon={<CreditCard className="w-5 h-5" />} onClick={openBilling}>
                  Plans & Billing
                </BrandButton>
                <BrandButton icon={<Plus className="w-5 h-5" />} onClick={() => setShowAddCampusModal(true)}>
                  Add New School
                </BrandButton>
              </div>
            </div>

            <div className="sk-rise" style={{ animationDelay: "80ms" }}>
              <BillingBanner billing={data.billing} onOpen={openBilling} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
              <StatCard
                icon={CreditCard}
                label="Plan"
                value={getPlanLimits(data.billing?.plan || "FREE").name}
                sub={data.billing?.status || "TRIAL"}
                tone={data.billing?.status === "SUSPENDED" ? "rose" : "purple"}
                entranceDelay={160}
              />
              <StatCard icon={School} label="Campuses" value={data.campuses.length} entranceDelay={240} />
              <StatCard
                icon={GraduationCap}
                label="Students"
                value={data.networkSummary.totalStudents}
                tone="green"
                entranceDelay={320}
              />
              <StatCard
                icon={Shield}
                label="Class Hubs"
                value={data.networkSummary.totalClasses}
                tone="rose"
                entranceDelay={400}
              />
              <StatCard
                icon={Sparkles}
                label="AI Runs"
                value={data.networkSummary.totalAiRuns}
                tone="dark"
                entranceDelay={480}
              />
            </div>

            <div className="sk-rise" style={{ animationDelay: "560ms" }}>
              <NetworkCommandPanel
                data={data}
                onSelectCampus={openCampus}
                onOpenBilling={openBilling}
                onOpenFees={openFees}
              />
            </div>

            <div id="network-ai-panel" className="mb-8 bg-[#fbf0fe]/30 border-[#cfc2d6]/25 rounded-[32px] p-6 scroll-mt-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-black text-[#1f1a23] tracking-normal">AI Network Insights</h3>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5 mb-5">
                <div className="rounded-[24px] bg-white border-[#cfc2d6]/25 p-5 relative overflow-hidden shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]"><CornerSparkles /><AiActionPanel title="Super Admin AI" options={superAIFeatures} compact onComplete={refetch} /></div>
                <div className="rounded-[24px] bg-white border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                  <div className="flex items-center gap-3 mb-4">
                    <Shield className="w-5 h-5 text-[#8127cf]" />
                    <p className="text-[10px] font-black text-ink-subtle uppercase tracking-normal">AI Review</p>
                  </div>
                  <AIReviewQueue items={data.pendingAIReviewItems} onComplete={refetch} />
                </div>
              </div>
              {data.aiInsights?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.aiInsights.slice(0, 4).map((insight: any) => (
                    <div key={insight.id} className="bg-gradient-to-br from-white to-[#fbf0fe]/20 rounded-[20px] p-4 border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]">
                      <p className="text-[9px] font-black text-[#8127cf] uppercase tracking-normal mb-1">
                        {insight.feature.replaceAll("_", " ")}
                      </p>
                      <p className="text-sm font-bold text-[#1f1a23] leading-snug">{insight.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-ink-subtle italic">
                  Campus comparisons, fee recovery, and academic trend drafts will appear after the AI engine runs.
                </p>
              )}
            </div>

            {data.campuses.length > 0 ? (
              <div className="sk-rise" style={{ animationDelay: "640ms" }}>
                <CampusComparison campuses={data.campuses} onManage={openCampus} />
              </div>
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
        ) : showCampusFees ? (
          <div className="flex flex-col h-full">
            <div className="p-8 border-b border-[#f3f4f9] flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-5">
                <button
                  onClick={() => setShowCampusFees(false)}
                  className="h-10 w-10 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-ink hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div>
                  <h2 className="text-2xl font-black text-[#1f1a23] tracking-normal leading-none mb-1">
                    {selectedCampus.name}
                  </h2>
                  <p className="text-[9px] font-black text-[#8127cf] uppercase tracking-normal">Fee Management</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
              <FeesPanel campusId={selectedCampus.id} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="p-8 border-b border-[#f3f4f9] flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-5">
                <button
                  onClick={() => setSelectedCampus(null)}
                  className="h-10 w-10 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-ink hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
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
                <BrandButton variant="soft" icon={<Receipt className="w-4 h-4" />} onClick={() => setShowCampusFees(true)}>
                  Fees
                </BrandButton>
                <BrandButton variant="soft" icon={<ClipboardList className="w-4 h-4" />} onClick={() => setShowActivityLogModal(true)}>
                  Activity Log
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

              <div className="mt-8 rounded-[32px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <PanelTitle icon={Mail} title="Pending Access Invitations" />
                  <SuperStatusPill status={`${selectedCampus.pendingInvitations.length} Pending`} />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedCampus.pendingInvitations.map((invite: any) => (
                    <div key={invite.inviteId} className="rounded-[22px] bg-gradient-to-br from-[#fbf0fe]/60 to-white px-4 py-3 border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]">
                      <p className="truncate text-sm font-black text-[#1f1a23]">{invite.email}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <SuperStatusPill status={invite.status} />
                          {invite.role ? <SuperStatusPill status={String(invite.role)} /> : null}
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-normal text-ink-subtle">
                          {new Date(invite.expiresAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  {selectedCampus.pendingInvitations.length === 0 ? (
                    <p className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/60 to-white border border-[#cfc2d6]/25 p-4 text-sm font-semibold text-ink-muted">
                      No pending invitations for this campus.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {showInviteModal && (
        <ModalFrame onClose={() => { setShowInviteModal(false); setInviteLink(""); }} title={inviteLink ? "Invitation Sent" : `Invite ${inviteRole === "CAMPUS_ADMIN" ? "Admin" : "Principal"}`}>
          {inviteLink ? (
            <div className="space-y-6 mb-8">
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200/50">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">Invitation email sent successfully</p>
                  <p className="text-xs font-semibold text-emerald-700/70 mt-0.5">The invited person will set their own password when they accept.</p>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">Invitation Link</p>
                <p className="text-xs font-semibold text-ink-muted mb-2">Share this link manually if the email doesn&apos;t arrive. It expires in 48 hours.</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 rounded-xl bg-[#fbf0fe] border border-[#cfc2d6]/20 text-xs font-mono text-ink break-all select-all">{inviteLink}</div>
                  <BrandButton variant="soft" className="shrink-0 h-10" onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Link copied to clipboard"); }}>Copy</BrandButton>
                </div>
              </div>
            </div>
          ) : (
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
              <div className="rounded-2xl bg-[#fbf0fe]/50 border border-[#cfc2d6]/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8127cf] mb-1">How it works</p>
                <p className="text-xs font-semibold text-ink-muted">An invitation email will be sent. The invited person will create their own secure password when they accept the invite link.</p>
              </div>
            </div>
          )}
          <div className="flex gap-4">
            <BrandButton variant="soft" className="flex-1 h-14" onClick={() => { setShowInviteModal(false); setInviteLink(""); }}>
              {inviteLink ? "Close" : "Cancel"}
            </BrandButton>
            {!inviteLink && (
              <BrandButton variant="dark" className="flex-[2] h-14" onClick={handleInvite} disabled={inviting}>
                {inviting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Invite"}
              </BrandButton>
            )}
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

function SuperStatusPill({ status }: { status?: string }) {
  const tone = statusTone(status);
  const dotColor = tone.includes("emerald") ? "bg-emerald-500" : tone.includes("rose") ? "bg-rose-500" : tone.includes("amber") ? "bg-amber-500" : tone.includes("8127cf") ? "bg-[#8127cf]" : "bg-[#4d4354]/40";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {formatStatus(status)}
    </span>
  );
}

function NetworkCommandPanel({
  data,
  onSelectCampus,
  onOpenBilling,
  onOpenFees,
}: {
  data: any;
  onSelectCampus: (campus: any) => void;
  onOpenBilling: () => void;
  onOpenFees: () => void;
}) {
  const leadershipGaps = data.campuses.filter((campus: any) => !hasActiveSlot(campus.admin) || !hasActiveSlot(campus.principal));
  const pendingInviteCampuses = data.campuses.filter((campus: any) => campus.pendingInvitations.length > 0);

  return (
    <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="sk-rise relative rounded-[32px] border-[#cfc2d6]/25 bg-gradient-to-br from-[#fbf0fe]/35 to-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
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
            onClick={onOpenFees}
          />
        </div>
      </div>

      <div className="sk-rise relative overflow-hidden rounded-[32px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "120ms" }}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-[#8127cf]" />
            <h3 className="text-lg font-black text-[#1f1a23]">Action Queue</h3>
          </div>
          <SuperStatusPill status={leadershipGaps.length ? "MISSING" : "ACTIVE"} />
        </div>
        <div className="space-y-3">
          {leadershipGaps.slice(0, 4).map((campus: any, index: number) => (
            <button
              key={campus.id}
              type="button"
              onClick={() => onSelectCampus(campus)}
              className="sk-rise flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#fbf0fe]/60 to-white px-4 py-3 text-left transition-all hover:from-[#fbf0fe] hover:shadow-sm border border-transparent hover:border-[#8127cf]/10"
              style={{ animationDelay: `${160 + index * 60}ms` }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#1f1a23]">{campus.name}</p>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-ink-subtle">
                  {!hasActiveSlot(campus.admin) ? "Admin needed" : ""}{!hasActiveSlot(campus.admin) && !hasActiveSlot(campus.principal) ? " - " : ""}{!hasActiveSlot(campus.principal) ? "Principal needed" : ""}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#8127cf]" />
            </button>
          ))}
          {leadershipGaps.length === 0 ? (
            <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-emerald-50/50 border border-emerald-100/50 px-4 py-3">
              <p className="text-sm font-black text-emerald-700">All campuses have leadership assigned.</p>
            </div>
          ) : null}

          {pendingInviteCampuses.length > 0 ? (
            <div className="rounded-2xl bg-gradient-to-r from-[#f3f4f9] to-white border border-[#cfc2d6]/10 px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-normal text-ink-subtle">Pending Invitations</p>
              <p className="mt-1 text-sm font-black text-[#1f1a23]">
                {pendingInviteCampuses.length} campuses waiting for acceptance
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onOpenBilling}
            className="flex w-full cursor-pointer items-center justify-between rounded-2xl bg-gradient-to-r from-[#1f1a23] to-[#2d2633] px-4 py-3 text-left text-white transition-all hover:from-black hover:to-[#1f1a23] shadow-sm"
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
    <div className="mb-8 rounded-[32px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
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
            <tr className="text-[9px] font-black uppercase tracking-normal text-ink-subtle bg-gradient-to-r from-[#fbf0fe]/30 to-transparent">
              <th className="px-4 py-3 rounded-tl-2xl">Campus</th>
              <th className="px-4 py-3">Leadership</th>
              <th className="px-4 py-3">Academics</th>
              <th className="px-4 py-3">Reports</th>
              <th className="px-4 py-3">Engagement</th>
              <th className="px-4 py-3 text-right rounded-tr-2xl">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3f4f9]">
            {campuses.map((campus) => (
              <tr key={campus.id} className="text-sm transition-all duration-200 hover:bg-[#fbf0fe]/30">
                <td className="px-4 py-4">
                  <p className="font-black text-[#1f1a23]">{campus.name}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-ink-subtle">{campus.city}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <SuperStatusPill status={campus.admin ? campus.admin.status : "MISSING"} />
                    <SuperStatusPill status={campus.principal ? campus.principal.status : "MISSING"} />
                  </div>
                </td>
                <td className="px-4 py-4 font-bold text-ink">
                  {campus.studentCount} students / {campus.classCount} classes / {campus.teacherCount} teachers
                </td>
                <td className="px-4 py-4 font-bold text-ink">
                  {campus.reportCardCount} cards / {campus.examCount} exams
                </td>
                <td className="px-4 py-4 font-bold text-ink">
                  {campus.communicationSummary.SENT || 0} sent / {(campus.communicationSummary.FAILED || 0) + (campus.communicationSummary.BLOCKED || 0)} issues
                </td>
                <td className="px-4 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onManage(campus)}
                    className="cursor-pointer rounded-2xl bg-gradient-to-r from-[#fbf0fe] to-[#f3eeff] px-4 py-2 text-[10px] font-black uppercase tracking-normal text-[#8127cf] transition-all hover:from-[#8127cf] hover:to-[#6a1fb0] hover:text-white shadow-sm"
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

function OwnerMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-[24px] bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[8px] font-black uppercase tracking-normal text-ink-subtle">{label}</p>
      <p className="mt-1 text-2xl font-black text-[#1f1a23]">{value}</p>
    </div>
  );
}

function SummaryBucket({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "green" | "rose" | "purple" | "amber";
  onClick?: () => void;
}) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    purple: "bg-[#fbf0fe] text-[#8127cf]",
    amber: "bg-amber-50 text-amber-600",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-center justify-between gap-3 rounded-[24px] bg-white p-4 shadow-sm transition-all duration-300 ${
        onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : "cursor-default"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${toneClass} shadow-sm`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-[9px] font-black uppercase tracking-normal text-ink-subtle">{label}</p>
      </div>
      <p className="text-xl font-black text-[#1f1a23]">{value}</p>
    </button>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-black tracking-normal text-[#1f1a23]">{title}</h3>
    </div>
  );
}

function BillingBanner({ billing, onOpen }: { billing: any; onOpen: () => void }) {
  const plan = getPlanLimits(billing?.plan || "FREE").name;
  const status = billing?.status || "TRIAL";
  const creditsUsed = Number(billing?.aiCreditsUsed || 0);
  const creditsLimit = Number(billing?.aiCreditsLimit || 100);
  const creditsLabel =
    creditsLimit < 0
      ? `${creditsUsed.toLocaleString()} / Unlimited`
      : `${creditsUsed.toLocaleString()} / ${creditsLimit.toLocaleString()}`;

  return (
    <div className="mb-8 rounded-[32px] border border-[#8127cf]/10 bg-gradient-to-br from-[#1f1a23] via-[#1f1a23] to-[#2d2633] p-5 text-white shadow-2xl shadow-indigo-100">
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
          <div className="rounded-2xl bg-white/10 px-5 py-3 border border-white/5">
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
    <div className="bg-white p-7 rounded-[32px] shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] border-[#cfc2d6]/25 flex flex-col min-h-[330px] relative overflow-hidden group hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] hover:border-[#8127cf]/25 transition-all duration-500">
      <div className="absolute top-6 right-6 z-10">
        <SuperStatusPill status={hasLeadership ? "ACTIVE" : "MISSING"} />
      </div>
      <div className="h-14 w-14 bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] rounded-[20px] flex items-center justify-center text-[#8127cf] mb-6 shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all duration-300">
        {hasLeadership ? <CheckCircle2 className="w-7 h-7" /> : <AlertCircle className="w-7 h-7" />}
      </div>
      <h3 className="text-xl font-black text-[#1f1a23] tracking-normal mb-1 pr-16">{campus.name}</h3>
      <div className="flex items-center gap-2 text-ink-subtle text-[9px] font-bold uppercase tracking-normal mb-8">
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
          <span className="text-[9px] font-black uppercase tracking-normal text-ink-subtle">Admin</span>
          <SuperStatusPill status={campus.admin ? campus.admin.status : "MISSING"} />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
          <span className="text-[9px] font-black uppercase tracking-normal text-ink-subtle">Principal</span>
          <SuperStatusPill status={campus.principal ? campus.principal.status : "MISSING"} />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between">
        <div className="text-[9px] font-black uppercase tracking-normal text-ink-subtle">
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
    <div className={`rounded-2xl px-3 py-3 transition-all ${active ? "bg-gradient-to-br from-[#fbf0fe] via-[#fbf0fe]/80 to-white border border-[#8127cf]/10" : "bg-[#fbf0fe]/70"}`}>
      <p className="text-[7px] font-black uppercase tracking-normal text-ink-subtle">{label}</p>
      <p className={`mt-1 text-base font-black ${active ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{value}</p>
    </div>
  );
}

function InfoPill({ label, value, active }: { label: string; value: any; active?: boolean }) {
  return (
    <div className="p-5 bg-white rounded-[24px] border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]">
      <p className="text-[8px] font-black text-ink-subtle uppercase tracking-normal mb-1">{label}</p>
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
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="animate-backdrop-enter fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()} className={`animate-modal-enter bg-white w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar`}>
        <div className="flex justify-between items-start gap-5 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase text-[#8127cf]">Network action</p>
            <h3 className="mt-1 text-2xl font-black text-[#1f1a23] tracking-normal">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-ink-subtle hover:bg-[#fbf0fe] hover:text-rose-500 cursor-pointer transition-all">
            <X className="w-5 h-5" /><span className="sr-only">Close</span>
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
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-ink-subtle">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-ink-subtle focus:border-[#8127cf]/35 focus:bg-white"
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
      <span className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-ink-subtle">{label}</span>
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
      <label className="text-[9px] font-black text-ink-subtle uppercase tracking-normal pl-2 mb-2 block">{label}</label>
      <div className="p-4 bg-[#f3f4f9] rounded-2xl border border-transparent focus-within:border-[#8127cf]/30 transition-all flex items-center gap-3">
        <Icon className="w-5 h-5 text-ink-subtle" />
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

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-[#e8e0ec] rounded-2xl ${className}`} />;
}

function SuperAdminSkeleton() {
  return (
    <div className="min-h-screen bg-[#f3f4f9] flex font-sans">
      <div className="hidden md:flex w-64 shrink-0 flex-col bg-white border-r border-[#cfc2d6]/10 p-5 gap-6">
        <SkeletonBlock className="h-8 w-32 rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
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
        <SkeletonBlock className="h-28 w-full rounded-[32px] mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonBlock key={i} className="h-24 rounded-[20px]" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8 mb-8">
          <SkeletonBlock className="h-64 rounded-[32px]" />
          <SkeletonBlock className="h-64 rounded-[32px]" />
        </div>
        <SkeletonBlock className="h-48 rounded-[32px]" />
      </main>
    </div>
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
        <SkeletonList rows={5} label="Loading activity" />
      ) : logs.length === 0 ? (
        <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-sm font-semibold text-ink-muted">No activity recorded yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-2xl bg-[#fbf0fe]/50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-[#1f1a23]">
                    {log.tableName.replace(/_/g, " ")} — {log.recordId?.slice(0, 8) || "N/A"}
                  </p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-ink-subtle">
                    by {log.userId?.slice(0, 8) || "system"}
                  </p>
                </div>
                <span className="shrink-0 text-[9px] font-bold text-ink-subtle">
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
