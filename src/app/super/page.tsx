"use client";

import { useWorkspaceView } from "@/components/nav/useWorkspaceView";
import { AuditHistoryModal } from "@/components/audit/audit-history-modal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { InputGroup } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

import { pageCardSurface } from "@/components/ui/page-card";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertCircle,
  Building2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  Globe,
  GraduationCap,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  MessageCircle,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  Users,
  type LucideIcon,
  Network,
  ShieldCheck,
} from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { InfoTip, Tooltip } from "@/components/ui/tooltip";
import { FeeManagementPanel } from "@/components/billing/FeeManagementPanel";
import { PlansPanel } from "@/components/billing/PlansPanel";
import { SubscriptionLifecyclePanel } from "@/components/billing/SubscriptionLifecyclePanel";
import { addCampus } from "@/app/actions/addCampus";
import { EXAM_BOARDS, DEFAULT_EXAM_BOARD } from "@/config/boards";
import { LocaleSettingsPanel } from "@/components/settings/LocaleSettingsPanel";
import { InstitutionSettingsPanel } from "@/components/settings/InstitutionSettingsPanel";
import { cancelInvitation, inviteStaff, removeStaff, resendInvitation } from "@/app/actions/invite";
import {
  AiActionPanel,
  AIReviewQueue,
  BrandButton,
  EmptyState,
  ManagementCard,
  RoleShell,
  type RoleNavItem,
} from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { CornerSparkles } from "@/components/CornerSparkles";
import { FeesPanel } from "@/components/fees/FeesPanel";
import { AcademicModelPanel } from "@/components/academic/AcademicModelPanel";
import { StaffHierarchyPanel } from "@/components/staff/hierarchy-panel";
import { getPlanLimits } from "@/config/plans";
import { NetworkOverview } from "@/components/insights";
import { CommandCentreSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { useSuperAdminData } from "./super-data-context";
import { SkeletonList } from "@/components/ui/skeleton";
import { Modal, ModalActions as DialogActions } from "@/components/ui/modal";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { useUiText } from "@/components/locale/LocaleProvider";
import { formatSupportInstant } from "@/lib/owner/support-ui";

function formatStatus(status?: string) {
  return (status || "Pending").replaceAll("_", " ");
}

type StatusVariant = NonNullable<BadgeProps["variant"]>;

function statusTone(status?: string): StatusVariant {
  if (["ACTIVE", "Active", "PAID", "SENT", "PUBLISHED", "APPROVED"].includes(status || "")) {
    return "success";
  }
  if (["Onboarding", "Invited", "PENDING", "PARTIAL", "TRIAL", "REVIEW"].includes(status || "")) {
    return "secondary";
  }
  if (["Expired", "FAILED", "BLOCKED", "SUSPENDED", "MISSING", "NO_REPORT"].includes(status || "")) {
    return "danger";
  }
  return "neutral";
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

type SuperView = "schools" | "billing" | "fees" | "settings" | "curriculum-templates" | "support";
const WORKSPACE_VIEWS: readonly SuperView[] = ["schools", "billing", "fees", "settings", "curriculum-templates", "support"];
export default function SuperAdminDashboard() {
  const t = useUiText();
  const { data, loading, error: loadError, refetch } = useSuperAdminData();
  const [activeView, setActiveView] = useWorkspaceView(WORKSPACE_VIEWS, "schools");
  const [selectedCampus, setSelectedCampus] = useState<any>(null);
  const [showAddCampusModal, setShowAddCampusModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newCampusData, setNewCampusData] = useState({
    name: "",
    city: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    principalName: "",
    board: DEFAULT_EXAM_BOARD as string,
    regId: generateRegId(),
    autoId: true,
    adminEmail: "",
  });
  const emptyCampusForm = {
    name: "", city: "", address: "", phone: "", email: "", website: "",
    principalName: "", board: DEFAULT_EXAM_BOARD as string, regId: generateRegId(), autoId: true, adminEmail: "",
  };
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


  // Sign-out lives in RoleHeader, which this console renders via RoleShell.
  // An unreachable handleLogout() used to sit here (RoleShell takes no onLogout
  // prop, so nothing could call it); its router.push("/login") would also have
  // left this console renderable via Back after sign-out.
  const openSchools = () => {
    setActiveView("schools");
    setSelectedCampus(null);
  };
  const openBilling = () => {
    setActiveView("billing");
    setSelectedCampus(null);
  };
  const openFees = () => {
    setActiveView("fees");
    setSelectedCampus(null);
  };
  const openCampus = (campus: any) => {
    setActiveView("schools");
    setSelectedCampus(campus);
  };
  const openAI = () => {
    setActiveView("schools");
    setSelectedCampus(null);
    window.requestAnimationFrame(() => {
      document.getElementById("network-ai-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleInvite = async () => {
    if (!selectedCampus || inviting) return;
    if (!inviteEmail) return toast.error(t("Enter the email address to send the invitation to."));
    if (!isValidEmail(inviteEmail.trim())) return toast.error(t("Enter a valid email address, like name@school.edu."));
    setInviting(true);
    try {
      const result = await inviteStaff({ email: inviteEmail, role: inviteRole, campusId: selectedCampus.id });
      toast.success(t("Invitation sent to {0}.", [inviteEmail.trim()]));
      setInviteLink(result.inviteLink || "");
      setInviteEmail("");
      await refetch();
    } catch (error: any) {
      toast.error(friendlyErrorMessage(error, t("The invitation could not be sent. Please try again.")));
    } finally {
      setInviting(false);
    }
  };

  const handleAddCampus = async () => {
    if (!newCampusData.name.trim() || !newCampusData.city.trim()) {
      return toast.error(t("Enter the campus name and city to create the campus."));
    }

    // Validate email format if provided
    if (newCampusData.email && newCampusData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newCampusData.email.trim())) {
        return toast.error(t("Enter a valid campus email, like office@school.edu."));
      }
    }

    // Validate phone number format if provided
    if (newCampusData.phone && newCampusData.phone.trim()) {
      // Remove all non-digit characters to count actual digits
      const digits = newCampusData.phone.replace(/\D/g, '');
      if (digits.length < 7) {
        return toast.error(t("The phone number is too short. Enter at least 7 digits."));
      }
      if (digits.length > 15) {
        return toast.error(t("The phone number is too long. Enter no more than 15 digits."));
      }
    }

    // Validate admin email format if provided
    if (newCampusData.adminEmail && newCampusData.adminEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newCampusData.adminEmail.trim())) {
        return toast.error(t("Enter a valid email for the campus admin, like name@school.edu."));
      }
    }

    setAddingCampus(true);
    try {
      await addCampus({
        name: newCampusData.name,
        city: newCampusData.city,
        address: newCampusData.address,
        phone: newCampusData.phone,
        email: newCampusData.email,
        website: newCampusData.website,
        principalName: newCampusData.principalName,
        board: newCampusData.board,
        regId: newCampusData.autoId ? newCampusData.regId || undefined : newCampusData.regId,
        adminEmail: newCampusData.adminEmail,
      });
      toast.success(
        newCampusData.adminEmail.trim()
          ? t("{0} created — invitation sent to {1}.", [newCampusData.name.trim(), newCampusData.adminEmail.trim()])
          : t("{0} created.", [newCampusData.name.trim()])
      );
      setShowAddCampusModal(false);
      setNewCampusData({ ...emptyCampusForm, regId: generateRegId() });
      await refetch();
    } catch (error: any) {
      toast.error(friendlyErrorMessage(error, t("The campus could not be created. Please try again.")));
    } finally {
      setAddingCampus(false);
    }
  };

  const handleRemove = async (userId: string, type: "Admin" | "Principal") => {
    setConfirmAction({
      title: type === "Admin" ? t("Revoke admin access?") : t("Revoke principal access?"),
      description: type === "Admin" ? t("This will remove the selected admin from the campus authority slot.") : t("This will remove the selected principal from the campus authority slot."),
      confirmLabel: t("Revoke access"),
      run: async () => {
        await removeStaff(userId);
        toast.success(type === "Admin" ? t("Admin access revoked") : t("Principal access revoked"));
        await refetch();
      },
    });
  };

  const handleCancelInvite = async (inviteId: string) => {
    setConfirmAction({
      title: t("Cancel invitation?"),
      description: t("The invited person will no longer be able to use this invitation link."),
      confirmLabel: t("Cancel invite"),
      run: async () => {
        await cancelInvitation(inviteId);
        toast.success(t("Invitation cancelled"));
        await refetch();
      },
    });
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      await resendInvitation(inviteId);
      toast.success(t("Invitation sent again."));
      await refetch();
    } catch (error: any) {
      toast.error(friendlyErrorMessage(error, t("The invitation could not be resent. Please try again.")));
    }
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      await confirmAction.run();
      setConfirmAction(null);
    } catch (error: any) {
      toast.error(friendlyErrorMessage(error, t("That change could not be saved. Please try again.")));
    } finally {
      setConfirmBusy(false);
    }
  };

  const openSettings = useCallback(() => {
    setSelectedCampus(null);
    setActiveView("settings");
  }, []);

  const openCurriculumTemplates = useCallback(() => {
    setSelectedCampus(null);
    setActiveView("curriculum-templates");
  }, []);

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: t("Schools"), active: activeView === "schools" && !selectedCampus, onClick: openSchools },
    { icon: Receipt, label: t("Fees"), active: activeView === "fees", onClick: openFees },
    { icon: CreditCard, label: t("Billing & plan"), active: activeView === "billing", onClick: openBilling },
    { icon: Settings, label: t("School Settings"), active: activeView === "settings", onClick: openSettings },
    { icon: BookOpen, label: t("Curriculum Templates"), active: activeView === "curriculum-templates", onClick: openCurriculumTemplates },
    { icon: ShieldCheck, label: t("Support Approvals"), active: activeView === "support", onClick: () => setActiveView("support") },
    { icon: Sparkles, label: t("AI Engine"), onClick: openAI },
    { icon: MessageCircle, label: t("Messages"), href: "/messages" },
    { icon: Users, label: t("Guardians and access"), href: "/dashboard/guardians" },
  ];
const bottomItems: RoleNavItem[] = [];
  const superAIFeatures = [
    { feature: "campus_comparison", label: t("Campus Comparison"), placeholder: t("Optional academic year or term") },
    { feature: "weak_campuses", label: t("Weak Campuses"), placeholder: t("Support focus or threshold") },
    { feature: "ai_usage_by_campus", label: t("AI Usage"), placeholder: t("Optional governance focus") },
    { feature: "fee_recovery_insights", label: t("Fee Recovery"), placeholder: t("Optional date or campus focus") },
    { feature: "academic_trend_summary", label: t("Academic Trends"), placeholder: t("Optional exam or term focus") },
  ];

  if (loading && !data) {
    return (
      <RoleShellSkeleton navRows={7} label={t("Loading the network command centre")}>
        <CommandCentreSkeleton />
      </RoleShellSkeleton>
    );
  }

  // A failed load used to fall through to `data.user` and crash the route.
  if (!data) {
    return (
      <main className="sk-hero-wash flex min-h-screen items-center justify-center px-4 py-12">
        <ErrorState
          variant="page"
          title={t("The command centre could not be loaded")}
          description={loadError ? t("Your schools, billing and campus details did not load. Check your connection and try again.") : undefined}
          onRetry={() => void refetch()}
        />
      </main>
    );
  }

  const campusFormDirty = Boolean(
    newCampusData.name.trim() || newCampusData.city.trim() || newCampusData.address.trim() || newCampusData.phone.trim() ||
    newCampusData.email.trim() || newCampusData.website.trim() || newCampusData.principalName.trim() || newCampusData.adminEmail.trim(),
  );

  return (
    <RoleShell
      navItems={navItems}
      bottomItems={bottomItems}
      searchPlaceholder={t("Search facilities or users...")}
      userName={data.user.fullName}
      userRole={data.user.role}
      avatarSeed={data.user.email || data.user.fullName}
      dashboardHref="/super"
      headerActions={
        <div className="flex items-center gap-2">
          {/* Icon-only below lg: the label stays in the accessible name and
              the tooltip shows it, instead of a native title nobody sees on touch. */}
          <Tooltip content={t("Fee Management")} describe={false}>
            <Button
              variant="secondary"
              onClick={openFees}
              className="min-h-10 px-3 sm:px-4 rounded-xl whitespace-nowrap"
            >
              <Receipt aria-hidden="true" className="w-4 h-4" />
              <span className="sr-only lg:not-sr-only">{t("Fees")}</span>
            </Button>
          </Tooltip>
          <Tooltip content={t("Billing & plan")} describe={false}>
            <Button
              variant="secondary"
              onClick={openBilling}
              className="min-h-10 px-3 sm:px-4 rounded-xl whitespace-nowrap"
            >
              <CreditCard aria-hidden="true" className="w-4 h-4" />
              <span className="sr-only lg:not-sr-only">{t("Billing & plan")}</span>
            </Button>
          </Tooltip>
        </div>
      }
    >
      <section className={cn(pageCardSurface, "p-0 sm:p-0", "flex-1 overflow-hidden flex flex-col")} >
        {activeView === "support" ? (
          <SupportApprovalsPanel />
        ) : activeView === "billing" ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <ViewHeader
              eyebrow={t("Owner billing control")}
              title={t("Billing & plan")}
              description={t("SaaS plan, upgrades, and AI credit control.")}
            />
            <div className="space-y-6 p-4 sm:p-6">
              <SubscriptionLifecyclePanel />
              <PlansPanel />
            </div>
          </div>
        ) : activeView === "curriculum-templates" ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
            <AcademicModelPanel templatesOnly />
          </div>
        ) : activeView === "settings" ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <ViewHeader
              eyebrow={t("Institution record")}
              title={t("School Settings")}
              description={t("Name, branding and contact details for the institution and each of its campuses.")}
            />
            <div className="p-4 sm:p-6">
              <InstitutionSettingsPanel onSaved={refetch} />
              <div className="mt-6"><LocaleSettingsPanel /></div>
            </div>
          </div>
        ) : activeView === "fees" ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <ViewHeader
              eyebrow={t("Network fee control")}
              title={t("Fee Management")}
              description={t("Fee structures, invoices, challans, and payment recording across the network.")}
            />
            <div className="p-4 sm:p-6">
              <FeeManagementPanel />
            </div>
          </div>
        ) : !selectedCampus ? (
          <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto custom-scrollbar flex-1">
            <div className="sk-enter" style={{ "--sk-delay": "80ms" } as CSSProperties}>
              <BillingBanner billing={data.billing} onOpen={openBilling} />
            </div>

            <div className="mb-8">
              <NetworkOverview
                data={data}
                onSelectCampus={openCampus}
                onOpenBilling={openBilling}
                onOpenFees={openFees}
                onOpenAI={() => document.getElementById("network-ai-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                actions={
                  <>
                    <Button variant="outline"
                      type="button"
                      onClick={openFees}
                      className="focus-on-dark justify-start"
                    >
                      <Receipt aria-hidden="true" className="h-4 w-4" /> {t("Fees")}
                    </Button>
                    <Button variant="outline"
                      type="button"
                      onClick={openBilling}
                      className="focus-on-dark justify-start"
                    >
                      <CreditCard aria-hidden="true" className="h-4 w-4" /> {t("Plans & billing")}
                    </Button>
                    <Button variant="outline"
                      type="button"
                      onClick={() => setShowAddCampusModal(true)}
                      className="focus-on-dark justify-start"
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" /> {t("Add campus")}
                    </Button>
                  </>
                }
              />
            </div>

            <div id="network-ai-panel" className="mb-8 scroll-mt-6 rounded-3xl border border-edge/25 bg-brand-50/30 p-4 shadow-md sm:p-6">
              <div className="mb-5">
                <PanelTitle icon={Sparkles} title={t("AI Network Insights")} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5 mb-5">
                <div className="sk-panel p-4 sm:p-5 relative overflow-hidden"><CornerSparkles /><AiActionPanel title={t("Super Admin AI")} options={superAIFeatures} compact onComplete={refetch} /></div>
                <div className="sk-panel p-4 sm:p-5 min-w-0">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield aria-hidden="true" className="w-5 h-5 text-primary" />
                    <p className="sk-eyebrow">{t("AI Review")}</p>
                    <InfoTip content={t("AI drafts waiting for a person to approve or reject them. The five oldest are shown here.")} />
                  </div>
                  <AIReviewQueue items={data.pendingAIReviewItems} onComplete={refetch} />
                </div>
              </div>
              {data.aiInsights?.length ? (
                <div className="sk-stagger grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.aiInsights.slice(0, 4).map((insight: any) => (
                    <div key={insight.id} className="sk-panel min-w-0 bg-gradient-to-br from-white to-brand-50/20 p-4">
                      <p className="sk-eyebrow mb-1 text-primary">
                        {insight.feature.replaceAll("_", " ")}
                      </p>
                      <p className="text-sm font-medium leading-relaxed text-ink-strong">{insight.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sk-panel">
                  <EmptyState
                    size="sm"
                    icon={Sparkles}
                    title={t("No AI insights yet")}
                    description={t("Campus comparisons, fee recovery, and academic trend drafts will appear after the AI engine runs.")}
                  />
                </div>
              )}
            </div>

            {data.campuses.length === 0 ? (
              <EmptyState
                icon={Building2}
                title={t("No campuses yet")}
                description={t("Create the first campus in this school group to start assigning admins and principals.")}
                action={
                  <Button onClick={() => setShowAddCampusModal(true)}>
                    <Plus aria-hidden="true" />
                    {t("Create Campus")}
                  </Button>
                }
              />
            ) : (
              <div className="sk-stagger grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                {data.campuses.map((campus: any) => (
                  <CampusCard key={campus.id} campus={campus} onManage={() => openCampus(campus)} />
                ))}
              </div>
            )}
          </div>
        ) : showCampusFees ? (
          <div className="flex flex-col h-full">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-muted bg-white p-4 shrink-0 sm:p-6 lg:p-8">
              <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                <IconButton label={t("Close campus fees")} onClick={() => setShowCampusFees(false)}>
                  <ChevronLeft aria-hidden="true" className="w-5 h-5 rtl:rotate-180" />
                </IconButton>
                <div className="min-w-0">
                  <p className="sk-eyebrow mb-1 text-primary">{t("Fee Management")}</p>
                  <h2 className="truncate text-xl font-bold tracking-tight text-ink-strong sm:text-2xl">
                    {selectedCampus.name}
                  </h2>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8">
              <FeesPanel campusId={selectedCampus.id} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-muted bg-white p-4 shrink-0 sm:p-6 lg:p-8">
              <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                <IconButton label={t("Close campus details")} onClick={() => setSelectedCampus(null)}>
                  <ChevronLeft aria-hidden="true" className="w-5 h-5 rtl:rotate-180" />
                </IconButton>
                <div className="min-w-0">
                  <p className="sk-eyebrow mb-1 flex items-center gap-1.5 text-primary">
                    <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t("{0} Campus Identity Hub", [selectedCampus.city])}</span>
                  </p>
                  <h2 className="truncate text-xl font-bold tracking-tight text-ink-strong sm:text-2xl">
                    {selectedCampus.name}
                  </h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <BrandButton variant="soft" icon={<Receipt aria-hidden="true" className="w-4 h-4" />} onClick={() => setShowCampusFees(true)}>
                  {t("Fees")}
                </BrandButton>
                <BrandButton variant="soft" icon={<ClipboardList aria-hidden="true" className="w-4 h-4" />} onClick={() => setShowActivityLogModal(true)}>
                  {t("Activity Log")}
                </BrandButton>
                <SuperStatusPill status={hasActiveSlot(selectedCampus.admin) && hasActiveSlot(selectedCampus.principal) ? "ACTIVE" : "MISSING"} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-brand-50/30 p-4 sm:p-6 lg:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                <ManagementCard
                  title={t("Campus Administrator")}
                  icon={Shield}
                  description={t("Sole authority for campus operations. One active admin is allowed per campus.")}
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
                  title={t("Principal / Academic Head")}
                  icon={GraduationCap}
                  description={t("Academic overseer for teachers, classes, exams, and report card review.")}
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

              <div className="sk-stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5 lg:mt-8">
                <InfoPill label={t("Students")} value={selectedCampus.studentCount} />
                <InfoPill label={t("Classes")} value={selectedCampus.classCount} />
                <InfoPill
                  label={t("Staff")}
                  value={selectedCampus.staffCount}
                  active
                  tip={t("Every user account linked to this campus.")}
                />
              </div>

              <div className="sk-panel mt-6 p-4 sm:p-6 lg:mt-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <PanelTitle icon={Mail} title={t("Pending Access Invitations")} />
                  <SuperStatusPill status={`${selectedCampus.pendingInvitations.length} Pending`} />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedCampus.pendingInvitations.map((invite: any) => (
                    <div key={invite.inviteId} className="min-w-0 rounded-2xl border border-edge/25 bg-gradient-to-br from-brand-50/60 to-white px-4 py-3 shadow-sm">
                      <Tooltip content={invite.email}><span tabIndex={0} className="block truncate text-sm font-semibold text-ink-strong">{invite.email}</span></Tooltip>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <SuperStatusPill status={invite.status} />
                          {invite.role ? <SuperStatusPill status={String(invite.role)} /> : null}
                        </div>
                        <span className="text-xs tabular-nums text-ink-subtle">
                          {t("Expires {0}", [new Date(invite.expiresAt).toLocaleDateString()])}
                        </span>
                      </div>
                    </div>
                  ))}
                  {selectedCampus.pendingInvitations.length === 0 ? (
                    <div className="col-span-full rounded-2xl border border-edge/25 bg-gradient-to-br from-brand-50/60 to-white">
                      <EmptyState
                        size="sm"
                        icon={Mail}
                        title={t("No pending invitations")}
                        description={t("Staff invitations sent for this campus appear here while they wait to be accepted.")}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Who reports to whom on this campus. Scoped to the selected
                  campus because a reporting line never crosses one. */}
              <div className="sk-panel mt-6 p-4 sm:p-6 lg:mt-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <PanelTitle icon={Network} title={t("Staff Hierarchy")} />
                  <SuperStatusPill status={`${selectedCampus.staffCount} Staff`} />
                </div>
                <StaffHierarchyPanel campusId={selectedCampus.id} />
              </div>
            </div>
          </div>
        )}
      </section>

      {showInviteModal && (
        <ModalFrame
          onClose={() => { setShowInviteModal(false); setInviteLink(""); }}
          title={inviteLink ? t("Invitation Sent") : inviteRole === "CAMPUS_ADMIN" ? t("Invite Admin") : t("Invite Principal")}
          subtitle={inviteLink ? undefined : selectedCampus?.name ? t("For {0}", [selectedCampus.name]) : t("For this campus")}
          footer={
            inviteLink ? (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => { setShowInviteModal(false); setInviteLink(""); }}>
                  {t("Close")}
                </Button>
              </div>
            ) : (
              <DialogActions
                actionLabel={t("Send invite")}
                busyLabel={t("Sending invite…")}
                busy={inviting}
                onCancel={() => { setShowInviteModal(false); setInviteLink(""); }}
                onAction={() => void handleInvite()}
              />
            )
          }
        >
          {inviteLink ? (
            <div className="space-y-6">
              <Alert tone="success" title={t("Invitation email sent successfully")}>
                {t("The invited person will set their own password when they accept.")}
              </Alert>
              <div>
                <p className="sk-eyebrow mb-1.5">{t("Invitation Link")}</p>
                <p className="mb-3 text-sm leading-relaxed text-ink-muted">{t("Share this link manually if the email doesn't arrive. It expires in 48 hours.")}</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div dir="ltr" className="min-w-0 flex-1 select-all break-all rounded-xl border border-edge/20 bg-brand-50 p-3 font-mono text-xs text-ink">{inviteLink}</div>
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => {
                      void navigator.clipboard.writeText(inviteLink).then(
                        () => toast.success(t("Link copied to clipboard")),
                        () => toast.error(t("The link could not be copied. Select it and copy it manually.")),
                      );
                    }}
                  >
                    <Copy aria-hidden="true" />
                    {t("Copy")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form
              className="space-y-6"
              noValidate
              onSubmit={(event) => { event.preventDefault(); void handleInvite(); }}
            >
              <FormField
                name="invite-email"
                label={t("Official email")}
                required
                hint={t("Use the work address this person signs in with.")}
              >
                <InputGroup surfaceClassName="bg-brand-50">
                  <Mail aria-hidden="true" data-field-affix="start" className="w-5 h-5 text-primary" />
                  <SystemInput
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    placeholder={t("Enter official email...")}
                    className={"w-full"}
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </InputGroup>
              </FormField>
              <Alert tone="info" title={t("How it works")} live="off">
                {t("An invitation email will be sent. The invited person will create their own secure password when they accept the invite link.")}
              </Alert>
            </form>
          )}
        </ModalFrame>
      )}

      {showAddCampusModal && (
        <ModalFrame
          onClose={() => setShowAddCampusModal(false)}
          title={t("Create campus")}
          subtitle={t("Only the campus name and city are required.")}
          wide
          dirty={campusFormDirty && !addingCampus}
          footer={
            <DialogActions
              actionLabel={t("Create campus")}
              busyLabel={t("Creating campus…")}
              busy={addingCampus}
              onCancel={() => setShowAddCampusModal(false)}
              onAction={() => void handleAddCampus()}
            />
          }
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <CampusInput
              name="campus-name"
              label={t("Campus Name")}
              icon={Building2}
              required
              value={newCampusData.name}
              placeholder={t("e.g. South Campus")}
              onChange={(value) => setNewCampusData({ ...newCampusData, name: value })}
            />
            <CampusInput
              name="campus-city"
              label={t("City")}
              icon={MapPin}
              required
              value={newCampusData.city}
              placeholder={t("e.g. Islamabad")}
              onChange={(value) => setNewCampusData({ ...newCampusData, city: value })}
            />
            <div className="md:col-span-2">
              <CampusInput
                name="campus-address"
                label={t("Address")}
                icon={MapPin}
                value={newCampusData.address}
                placeholder={t("Full street address")}
                onChange={(value) => setNewCampusData({ ...newCampusData, address: value })}
              />
            </div>
            <CampusInput
              name="campus-phone"
              label={t("Phone")}
              icon={Phone}
              type="tel"
              value={newCampusData.phone}
              placeholder="+92 300 0000000"
              hint={t("Include the country code. 7 to 15 digits.")}
              onChange={(value) => setNewCampusData({ ...newCampusData, phone: value })}
            />
            <CampusInput
              name="campus-email"
              label={t("Campus Email")}
              icon={Mail}
              type="email"
              value={newCampusData.email}
              placeholder="campus@school.edu.pk"
              onChange={(value) => setNewCampusData({ ...newCampusData, email: value })}
            />
            <CampusInput
              name="campus-website"
              label={t("Website")}
              icon={Globe}
              value={newCampusData.website}
              placeholder={t("Website (optional)")}
              onChange={(value) => setNewCampusData({ ...newCampusData, website: value })}
            />
            <CampusInput
              name="campus-head"
              label={t("Head of Campus")}
              icon={Users}
              value={newCampusData.principalName}
              placeholder={t("Principal / director name")}
              onChange={(value) => setNewCampusData({ ...newCampusData, principalName: value })}
            />
            <FormField name="campus-board" id="campus-board" label={t("Board")}>
              <InputGroup surfaceClassName="bg-muted" className="min-w-0">
                <GraduationCap aria-hidden="true" data-field-affix="start" className="w-5 h-5 text-ink-subtle shrink-0" />
                <SystemSelect
                  id="campus-board"
                  value={newCampusData.board}
                  onChange={(event) => setNewCampusData({ ...newCampusData, board: event.target.value })}
                  className={"w-full"}
                >
                  {EXAM_BOARDS.map((board) => <option key={board} value={board}>{board}</option>)}
                </SystemSelect>
              </InputGroup>
            </FormField>
            <CampusInput
              name="campus-admin-email"
              label={t("Campus Admin Email")}
              icon={Mail}
              type="email"
              value={newCampusData.adminEmail}
              placeholder={t("Invite a campus admin (optional)")}
              hint={t("An invitation is sent; they set their own password.")}
              onChange={(value) => setNewCampusData({ ...newCampusData, adminEmail: value })}
            />
            <div className="md:col-span-2 rounded-3xl border border-edge/20 bg-brand-50 p-4 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <Label htmlFor="campus-key">{t("Campus Key")}</Label>
                  <InfoTip content={t("A short code that identifies this campus. Auto creates one for you; Manual lets you type your own.")} />
                </div>
                <Button aria-pressed={newCampusData.autoId} variant="choice" size="sm"
                  onClick={() =>
                    setNewCampusData({
                      ...newCampusData,
                      autoId: !newCampusData.autoId,
                      regId: !newCampusData.autoId ? "" : generateRegId()
                    })
                  }
                >
                  {newCampusData.autoId ? t("Auto") : t("Manual")}
                </Button>
              </div>
              <SystemInput
                id="campus-key"
                type="text"
                dir="ltr"
                placeholder={newCampusData.autoId ? "KEY-AUTO" : "BR-XXXX"}
                readOnly={newCampusData.autoId}
                aria-describedby="campus-key-note"
                className={"w-full text-center tabular-nums"}
                value={newCampusData.regId}
                onChange={(event) => setNewCampusData({ ...newCampusData, regId: event.target.value.toUpperCase() })}
              />
              <p id="campus-key-note" className="mt-3 text-xs leading-relaxed text-ink-muted">
                {t("The new campus inherits the group's current academic session and working week. Adjust either from Academic → Calendar.")}
              </p>
            </div>
          </div>
        </ModalFrame>
      )}
      {showActivityLogModal ? (
        <AuditHistoryModal initialCampusId={selectedCampus?.id ?? ""} onClose={() => setShowActivityLogModal(false)} />
      ) : null}
      <ConfirmAction
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ""}
        description={confirmAction?.description || ""}
        confirmLabel={confirmAction?.confirmLabel || t("Confirm")}
        tone="danger"
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
    </RoleShell>
  );
}

function SuperStatusPill({ status }: { status?: string }) {
  return (
    <Badge variant={statusTone(status)} size="sm" dot className="shrink-0">
      {formatStatus(status)}
    </Badge>
  );
}

function ViewHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="sk-enter flex flex-col gap-4 border-b border-muted p-4 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <p className="sk-eyebrow text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-bold text-ink-strong">{title}</h3>
    </div>
  );
}

function BillingBanner({ billing, onOpen }: { billing: any; onOpen: () => void }) {
  const t = useUiText();
  const plan = getPlanLimits(billing?.plan || "FREE").name;
  const status = billing?.status || "TRIAL";
  const creditsUsed = Number(billing?.aiCreditsUsed || 0);
  const creditsLimit = Number(billing?.aiCreditsLimit || 100);
  const creditsLabel =
    creditsLimit < 0
      ? `${creditsUsed.toLocaleString()} / ${t("Unlimited")}`
      : `${creditsUsed.toLocaleString()} / ${creditsLimit.toLocaleString()}`;

  return (
    <div className="mb-8 rounded-3xl border border-primary/10 bg-gradient-to-br from-ink-strong via-ink-strong to-brand-950 p-4 text-white shadow-xl sm:p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
            <CreditCard className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="sk-eyebrow text-white/70">{t("Billing & plan")}</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{t("{0} Plan", [plan])}</h3>
            <p className="mt-1.5 flex items-center gap-2 text-xs text-white/70">
              <span>{t("Status:")}</span>
              <Badge variant={statusTone(status)} size="sm" dot>{formatStatus(status)}</Badge>
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 sm:min-w-56">
            <p className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-white/70">
              {t("AI Credits")}
            </p>
            <p className="text-lg font-bold tabular-nums">{creditsLabel}</p>
            {creditsLimit > 0 ? (
              <Progress
                className="mt-2"
                size="sm"
                value={creditsUsed}
                max={creditsLimit}
                tone={creditsUsed >= creditsLimit ? "danger" : "brand"}
                label={t("AI credits used")}
                valueText={creditsLabel}
              />
            ) : null}
          </div>
          <BrandButton variant="soft" icon={<CreditCard aria-hidden="true" className="h-4 w-4" />} onClick={onOpen} className="bg-white text-primary">
            {t("Open Billing")}
          </BrandButton>
        </div>
      </div>
    </div>
  );
}

function CampusCard({ campus, onManage }: { campus: any; onManage: () => void }) {
  const t = useUiText();
  const hasLeadership = hasActiveSlot(campus.admin) && hasActiveSlot(campus.principal);

  return (
    <div className="sk-panel group relative flex min-h-[330px] min-w-0 flex-col overflow-hidden p-5 sm:p-6">
      <div aria-hidden="true" className="sk-icon-tile mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary shadow-sm">
        {hasLeadership ? <CheckCircle2 className="w-7 h-7" /> : <AlertCircle className="w-7 h-7" />}
      </div>
      <div className="mb-1 flex min-w-0 items-start justify-between gap-3">
        <Tooltip content={campus.name}>
          <h3 tabIndex={0} className="min-w-0 truncate text-lg font-bold text-ink-strong">{campus.name}</h3>
        </Tooltip>
        <SuperStatusPill status={hasLeadership ? "ACTIVE" : "MISSING"} />
      </div>
      <div className="mb-6 flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink-subtle">
        <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate">{campus.city}</span>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-2">
        <CampusMiniMetric label={t("Students")} value={campus.studentCount} />
        <CampusMiniMetric label={t("Classes")} value={campus.classCount} />
        <CampusMiniMetric label={t("Teachers")} value={campus.teacherCount} active />
      </div>

      <div className="mb-5 space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50/60 px-4 py-3">
          <span className="text-xs font-semibold text-ink-muted">{t("Admin")}</span>
          <SuperStatusPill status={campus.admin ? campus.admin.status : "MISSING"} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50/60 px-4 py-3">
          <span className="text-xs font-semibold text-ink-muted">{t("Principal")}</span>
          <SuperStatusPill status={campus.principal ? campus.principal.status : "MISSING"} />
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs tabular-nums text-ink-subtle">
          {t("{0} reports / {1} AI runs", [campus.reportCardCount, campus.aiUsage.runs])}
        </div>
        <Button variant="link" onClick={onManage} className="sk-nudge-trigger items-center gap-1.5 justify-start px-2">
          {t("Manage")} <ChevronRight aria-hidden="true" className="sk-nudge w-4 h-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}

function CampusMiniMetric({ label, value, active }: { label: string; value: any; active?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl px-3 py-3 ${active ? "border border-primary/10 bg-gradient-to-br from-brand-50 via-brand-50/80 to-white" : "bg-brand-50/70"}`}>
      <p className="truncate text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${active ? "text-primary" : "text-ink-strong"}`}>{value}</p>
    </div>
  );
}

function InfoPill({ label, value, active, tip }: { label: string; value: any; active?: boolean; tip?: string }) {
  return (
    <div className="sk-panel p-4 sm:p-5">
      <div className="mb-1 flex items-center gap-1">
        <p className="sk-eyebrow">{label}</p>
        {tip ? <InfoTip content={tip} className="-my-1" /> : null}
      </div>
      <p className={`text-2xl font-bold tracking-tight tabular-nums ${active ? "text-primary" : "text-ink-strong"}`}>{value}</p>
    </div>
  );
}

function ModalFrame({
  title,
  subtitle,
  children,
  footer,
  onClose,
  wide,
  dirty,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  dirty?: boolean;
}) {
  const t = useUiText();
  return (
    <Modal
      title={title}
      eyebrow={t("Network action")}
      subtitle={subtitle}
      footer={footer}
      dirty={dirty}
      size={wide ? "md" : "xs"}
      onClose={onClose}
    >
      {children}
    </Modal>
  );
}

function CampusInput({
  name,
  label,
  icon: Icon,
  value,
  placeholder,
  onChange,
  required,
  hint,
  type = "text",
}: {
  name: string;
  label: string;
  icon: LucideIcon;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  type?: "text" | "email" | "tel";
}) {
  return (
    <FormField name={name} label={label} required={required} hint={hint} className="min-w-0">
      <InputGroup surfaceClassName="bg-muted">
        <Icon aria-hidden="true" data-field-affix="start" className="w-5 h-5 text-ink-subtle shrink-0" />
        <SystemInput
          type={type}
          dir={type === "text" ? undefined : "ltr"}
          aria-label={label}
          required={required}
          placeholder={placeholder}
          className={"w-full"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </InputGroup>
    </FormField>
  );
}

function SupportApprovalsPanel() {
  const t = useUiText();
  const [items, setItems] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; decision: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try { const response = await fetch("/api/super/support-grants", { cache: "no-store" }); const json = await response.json(); if (!response.ok) throw new Error(json.error); setItems(json.data || []); }
    catch (error) { setLoadError(friendlyErrorMessage(error, t("Support requests could not be loaded right now. Please try again."))); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void refresh(); }, [refresh]);
  const decide = async (item: any, decision: string) => {
    if (pending) return;
    setPending({ id: item.id, decision });
    try {
      const response = await fetch("/api/super/support-grants", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId: item.id, decision, evidence: evidence[item.id] }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { toast.error(json.error || t("Could not update support grant")); return; }
      toast.success(decision === "approve" ? t("Support access approved") : decision === "reject" ? t("Support request rejected") : decision === "revoke" ? t("Support access revoked") : t("Emergency review recorded"));
      await refresh();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("Could not update support grant")));
    } finally {
      setPending(null);
    }
  };
  const busy = (item: any, decision: string) => pending?.id === item.id && pending?.decision === decision;
  const statusVariant = (status: string): StatusVariant => status === "active" ? "success" : status === "pending" ? "warning" : "neutral";
  const domainLabels: Record<string, string> = { school_profile: "School profile", operations: "Operations", users: "Staff directory", finance: "Finance", learning: "Learning records" };
  return <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" dir="auto">
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="sk-enter flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{t("Support access approvals")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{t("Review vendor requests for this school only. Approve the named purpose, domains, actions, and expiry together.")}</p>
        </div>
        <Button variant="outline" size="sm" type="button" loading={loading} onClick={() => void refresh()}>
          {loading ? null : <RefreshCw aria-hidden="true" />}
          {t("Refresh")}
        </Button>
      </header>
      {loading && items.length === 0 ? (
        <SkeletonList rows={3} label={t("Loading…")} />
      ) : loadError ? (
        <div className="sk-panel">
          <ErrorState title={t("Could not load support approvals")} description={loadError} onRetry={() => void refresh()} />
        </div>
      ) : items.length === 0 ? (
        <div className="sk-panel">
          <EmptyState
            icon={ShieldCheck}
            title={t("No support requests need review")}
            description={t("When Skoolee support asks to access this school, the request appears here for your decision.")}
          />
        </div>
      ) : (
        <div className="sk-stagger space-y-4">
          {items.map((item) => <article key={item.id} className="sk-panel space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink-strong"><bdi dir="ltr">{item.incident.reference}</bdi></p>
                  <Badge variant={statusVariant(item.status)} size="sm" dot>{t(item.status)}</Badge>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">{item.purpose}</p>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
                  <dt className="font-semibold text-ink-muted">{t("Impact")}</dt>
                  <dd className="min-w-0 text-ink">{item.incident.impact}</dd>
                  <dt className="font-semibold text-ink-muted">{t("Domains")}</dt>
                  <dd className="min-w-0 text-ink">{item.scope.map((domain: string) => t(domainLabels[domain] || domain)).join(", ")}</dd>
                  <dt className="font-semibold text-ink-muted">{t("Actions")}</dt>
                  <dd className="min-w-0 text-ink">{item.actions.map((action: string) => t(action[0].toUpperCase() + action.slice(1))).join(", ")}</dd>
                  <dt className="font-semibold text-ink-muted">{t("Expires")}</dt>
                  <dd className="min-w-0 tabular-nums text-ink"><bdi dir="ltr">{formatSupportInstant(item.expiresAt)}</bdi></dd>
                </dl>
              </div>
              {item.emergencyReason && <Badge variant="warning" size="sm" dot>{t("Emergency access")}</Badge>}
            </div>
            {item.emergencyReason && (
              <Alert tone="warning" title={t("Emergency justification")} live="off">
                <p>{item.emergencyReason}</p>
                {item.reviewDueAt && !item.reviewedAt && <p className="mt-2 font-semibold">{t("Review due")}: <bdi dir="ltr">{formatSupportInstant(item.reviewDueAt)}</bdi></p>}
              </Alert>
            )}
            {item.status === "pending" && <div className="flex flex-wrap gap-2">
              <Button variant="default" type="button" loading={busy(item, "approve")} disabled={Boolean(pending)} onClick={() => void decide(item, "approve")} >{t("Approve request")}</Button>
              <Button variant="outline" type="button" loading={busy(item, "reject")} disabled={Boolean(pending)} onClick={() => void decide(item, "reject")} >{t("Reject request")}</Button>
            </div>}
            {item.status === "active" && !item.reviewedAt && item.emergencyReason && <div className="space-y-3">
              <FormField
                name={`review-evidence-${item.id}`}
                label={t("Review evidence")}
                hint={t("At least 12 characters: what you checked and what you found.")}
              >
                <Textarea className={"min-h-20 w-full"} value={evidence[item.id] || ""} onChange={(event) => setEvidence((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={t("Review evidence")} />
              </FormField>
              <Button variant="outline" type="button" loading={busy(item, "review")} disabled={Boolean(pending) || (evidence[item.id] || "").trim().length < 12} onClick={() => void decide(item, "review")} >{t("Record emergency review")}</Button>
            </div>}
            {item.status === "active" && <div className="border-t border-border-subtle pt-4">
              <Button variant="outline" type="button" loading={busy(item, "revoke")} disabled={Boolean(pending)} onClick={() => setRevokeTarget(item)} >{t("Revoke access now")}</Button>
            </div>}
          </article>)}
        </div>
      )}
    </div>
    <ConfirmAction
      open={Boolean(revokeTarget)}
      title={t("Revoke support access?")}
      description={t("Support loses access to this school straight away, and any support actions still queued are cancelled.")}
      confirmLabel={t("Revoke access now")}
      tone="danger"
      busy={Boolean(revokeTarget) && busy(revokeTarget, "revoke")}
      onCancel={() => setRevokeTarget(null)}
      onConfirm={() => { const target = revokeTarget; void decide(target, "revoke").finally(() => setRevokeTarget(null)); }}
    />
  </div>;
}
