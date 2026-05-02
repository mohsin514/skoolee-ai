"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  Loader2,
  LogOut,
  MessageSquare,
  Pencil,
  School,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getPrincipalDashboardData } from "@/app/actions/dashboard";
import {
  AiActionPanel,
  AIReviewQueue,
  BrandButton,
  EmptyState,
  RoleShell,
  StatCard,
  type RoleNavItem,
} from "@/components/role-dashboard";

type PrincipalView = "overview" | "academics" | "faculty" | "reports" | "engagement";
type ReportAction = "generate" | "pdf" | "review" | "publish" | "send";

const viewCopy: Record<PrincipalView, { title: string; description: string }> = {
  overview: {
    title: "Academic Review",
    description: "Live review of students, teachers, exams, report cards, engagement, and AI drafts.",
  },
  academics: {
    title: "Academic Plan",
    description: "Review class structure, class teachers, subjects, enrollment, and locked assessment flow.",
  },
  faculty: {
    title: "Faculty Review",
    description: "Inspect active teachers, subject ownership, and class leadership for this campus.",
  },
  reports: {
    title: "Reports Hub",
    description: "Approve remarks, mark exams reviewed, publish report cards, and send parent delivery.",
  },
  engagement: {
    title: "Parent Engagement",
    description: "Track parent communication delivery, blocked messages, no-contact records, and automation runs.",
  },
};

const principalAIFeatures = [
  { feature: "at_risk_students", label: "At-risk Students", placeholder: "Optional exam, class, or attendance focus" },
  { feature: "class_performance_summary", label: "Class Summary", placeholder: "Class or exam focus" },
  { feature: "teacher_class_comparison", label: "Class Comparison", placeholder: "Classes, teachers, or term to compare" },
  { feature: "intervention_suggestions", label: "Intervention Plan", placeholder: "Student or class concern" },
  { feature: "pending_review_queue", label: "Review Queue", placeholder: "Optional priority note" },
];

function statusTone(status?: string) {
  if (status === "PUBLISHED" || status === "SENT" || status === "APPROVED" || status === "CONNECTED" || status === "ACTIVE") return "bg-emerald-50 text-emerald-600";
  if (status === "PRINCIPAL_REVIEWED" || status === "REVIEWED" || status === "ONBOARDING") return "bg-[#fbf0fe] text-[#8127cf]";
  if (status === "FAILED" || status === "BLOCKED") return "bg-rose-50 text-rose-600";
  if (status === "NO_RECIPIENT" || status === "LOCKED" || status === "NO_REPORT") return "bg-amber-50 text-amber-600";
  return "bg-[#f3f4f9] text-[#4d4354]/70";
}

function formatStatus(status?: string) {
  return (status || "Pending").replaceAll("_", " ");
}

function formatDate(value?: string | Date | null) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function classLabel(item: any) {
  if (!item) return "Unassigned";
  return [item.name, item.section].filter(Boolean).join(" ");
}

function percentLabel(value?: number | null) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export default function PrincipalDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [activeView, setActiveView] = useState<PrincipalView>("overview");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editedRemarks, setEditedRemarks] = useState({ en: "", ur: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getPrincipalDashboardData());
    } catch (error: any) {
      toast.error(`Dashboard failed: ${error.message}`);
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

  const runReportAction = async (examId: string, action: ReportAction, successMessage: string) => {
    setBusyAction(`${action}-${examId}`);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, action }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Report action failed");
      toast.success(successMessage);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report action failed");
    } finally {
      setBusyAction(null);
    }
  };

  const runRemarkDrafts = async (examId: string) => {
    setBusyAction(`ai-remarks-${examId}`);
    try {
      const res = await fetch("/api/ai/generate-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: true, examId, language: "both", tone: "encouraging" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Remark generation failed");
      toast.success(`Generated ${result.succeeded || 0} remark drafts`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Remark generation failed");
    } finally {
      setBusyAction(null);
    }
  };

  const saveRemark = async (report: any, approve = false) => {
    setBusyAction(`remark-${report.id}`);
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarksEn: editedRemarks.en, remarksUr: editedRemarks.ur, approve }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not save remarks");
      toast.success(approve ? "Remarks approved" : "Remarks saved");
      setEditingReportId(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save remarks");
    } finally {
      setBusyAction(null);
    }
  };

  const runAutomation = async () => {
    setBusyAction("communications");
    try {
      const res = await fetch("/api/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-automation" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Automation failed");
      toast.success(`Processed ${result.processed} communication actions`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Automation failed");
    } finally {
      setBusyAction(null);
    }
  };

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Overview", active: activeView === "overview", onClick: () => setActiveView("overview") },
    { icon: School, label: "Academic Plan", active: activeView === "academics", onClick: () => setActiveView("academics") },
    { icon: Users, label: "Faculty", active: activeView === "faculty", onClick: () => setActiveView("faculty") },
    { icon: FileText, label: "Reports Hub", active: activeView === "reports", onClick: () => setActiveView("reports") },
    { icon: MessageSquare, label: "Engagement", active: activeView === "engagement", onClick: () => setActiveView("engagement") },
  ];
  const bottomItems: RoleNavItem[] = [
    { icon: HelpCircle, label: "Support", onClick: () => toast.info("Academic support is available from this role workspace.") },
    { icon: LogOut, label: "Logout", onClick: handleLogout },
  ];

  const communicationTotals = useMemo(() => {
    const summary = data?.communicationSummary || {};
    return {
      sent: summary.SENT || 0,
      failed: summary.FAILED || 0,
      blocked: summary.BLOCKED || 0,
      noContact: summary.NO_RECIPIENT || 0,
    };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4 text-center px-6">
        <Loader2 className="h-12 w-12 text-[#8127cf] animate-spin" />
        <p className="text-sm font-black text-[#1f1a23] uppercase tracking-normal leading-relaxed">
          Accessing Academic Hub...
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <RoleShell
      navItems={navItems}
      bottomItems={bottomItems}
      eyebrow="Campus Academic Control"
      userName={data.principalName}
      userRole="Principal Authority"
      avatarSeed={data.principalName}
      dashboardHref="/principal"
    >
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-[10px] font-black text-[#8127cf] uppercase tracking-normal mb-3">
              {data.schoolName} - {data.campusName}
            </p>
            <h2 className="text-4xl font-black tracking-normal text-[#1f1a23]">{viewCopy[activeView].title}</h2>
            <p className="text-sm font-semibold text-[#4d4354]/60 mt-3 max-w-2xl leading-relaxed">
              {viewCopy[activeView].description}
            </p>
          </div>
          <BrandButton
            icon={<Sparkles className="w-4 h-4" />}
            onClick={() => setActiveView("reports")}
          >
            Review Reports
          </BrandButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
          <StatCard icon={GraduationCap} label="Students" value={data.totalStudents} />
          <StatCard icon={Users} label="Teachers" value={data.totalTeachers} tone="green" />
          <StatCard icon={School} label="Classes" value={data.totalClasses} tone="rose" />
          <StatCard icon={FileText} label="Pending Reviews" value={data.pendingRemarkReviews} tone="dark" />
          <StatCard icon={Sparkles} label="AI Review Queue" value={data.pendingAIReviews || 0} tone="green" />
        </div>

        {activeView === "overview" ? (
          <OverviewPanel
            data={data}
            communicationTotals={communicationTotals}
            onViewReports={() => setActiveView("reports")}
            onViewEngagement={() => setActiveView("engagement")}
            onComplete={loadData}
          />
        ) : null}

        {activeView === "academics" ? <AcademicsPanel data={data} /> : null}

        {activeView === "faculty" ? <FacultyPanel data={data} /> : null}

        {activeView === "reports" ? (
          <ReportsPanel
            data={data}
            busyAction={busyAction}
            editingReportId={editingReportId}
            editedRemarks={editedRemarks}
            onRunAction={runReportAction}
            onGenerateRemarks={runRemarkDrafts}
            onEdit={(report) => {
              setEditingReportId(report.id);
              setEditedRemarks({ en: report.remarksEn || "", ur: report.remarksUr || "" });
            }}
            onCancelEdit={() => setEditingReportId(null)}
            onRemarkChange={setEditedRemarks}
            onSaveRemark={saveRemark}
          />
        ) : null}

        {activeView === "engagement" ? (
          <EngagementPanel
            data={data}
            totals={communicationTotals}
            busy={busyAction === "communications"}
            onRunAutomation={runAutomation}
          />
        ) : null}
      </section>
    </RoleShell>
  );
}

function OverviewPanel({
  data,
  communicationTotals,
  onViewReports,
  onViewEngagement,
  onComplete,
}: {
  data: any;
  communicationTotals: { sent: number; failed: number; blocked: number; noContact: number };
  onViewReports: () => void;
  onViewEngagement: () => void;
  onComplete: () => void | Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <div className="xl:col-span-2 bg-[#fbf0fe]/30 border border-[#cfc2d6]/10 rounded-[32px] p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-2xl font-black tracking-normal text-[#1f1a23]">Report Card Queue</h3>
            <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-normal mt-1">
              Recent generated academic records
            </p>
          </div>
          <BrandButton variant="soft" onClick={onViewReports} icon={<FileText className="w-4 h-4" />}>
            Open Review
          </BrandButton>
        </div>

        {data.recentReportCards.length > 0 ? (
          <div className="space-y-3">
            {data.recentReportCards.slice(0, 6).map((card: any) => (
              <ReportRow key={card.id} report={card} compact />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No report cards yet"
            description="Locked exams and generated marks will appear here for academic review."
          />
        )}
      </div>

      <div className="space-y-6">
        <div className="bg-white p-6 rounded-[28px] border border-[#cfc2d6]/10 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-[#8127cf]" />
              <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-normal">Parent Engagement</p>
            </div>
            <button
              type="button"
              onClick={onViewEngagement}
              className="cursor-pointer text-[10px] font-black uppercase tracking-normal text-[#8127cf] hover:text-[#9c48ea]"
            >
              View
            </button>
          </div>
          <div className="space-y-3">
            <EngagementMetric icon={CheckCircle2} label="Sent" value={communicationTotals.sent} />
            <EngagementMetric icon={AlertCircle} label="Needs Attention" value={communicationTotals.failed + communicationTotals.blocked + communicationTotals.noContact} />
            <EngagementMetric icon={Sparkles} label="AI Review" value={data.pendingAIReviews || 0} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-[28px] border border-[#cfc2d6]/10 shadow-lg">
          <AiActionPanel title="Principal AI" options={principalAIFeatures} compact onComplete={onComplete} />
        </div>

        <div className="bg-[#fbf0fe]/40 p-6 rounded-[28px] border border-[#8127cf]/10 shadow-lg">
          <div className="flex items-center gap-3 mb-5">
            <Sparkles className="w-5 h-5 text-[#8127cf]" />
            <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-normal">AI Review</p>
          </div>
          <AIReviewQueue items={data.pendingAIReviewItems} onComplete={onComplete} />
        </div>

        <div className="bg-[#1f1a23] p-8 rounded-[32px] text-white shadow-2xl">
          <p className="text-[10px] font-black uppercase tracking-normal text-white/50 mb-5">Campus Yield</p>
          <div className="flex items-end gap-3 mb-4">
            <span className="text-5xl font-black tracking-normal">{data.averageMarks}%</span>
            <TrendingUp className="w-8 h-8 text-emerald-400 mb-1" />
          </div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-normal">
            Average marks across submitted assessments
          </p>
        </div>
      </div>
    </div>
  );
}

function AcademicsPanel({ data }: { data: any }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.55fr] gap-8">
      <div className="space-y-5">
        {data.classes.map((cls: any) => (
          <div key={cls.id} className="rounded-[32px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/30 p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">
                  Academic year {cls.academicYear}
                </p>
                <h3 className="mt-1 text-xl font-black text-[#1f1a23]">{classLabel(cls)}</h3>
                <p className="mt-2 max-w-xl text-xs font-semibold leading-relaxed text-[#4d4354]/55">
                  {cls.classTeacher?.fullName || "No class teacher assigned"} owns this class record. Students, subjects,
                  report cards, and review states below are scoped to this campus.
                </p>
              </div>
              <div className="grid w-full grid-cols-3 gap-2 lg:w-auto lg:min-w-72">
                <MiniMetricCompact label="Students" value={cls._count?.students || 0} />
                <MiniMetricCompact label="Subjects" value={cls._count?.subjects || 0} />
                <MiniMetricCompact label="Exams" value={cls.exams?.length || 0} />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-4">
                <div className="rounded-[24px] bg-white p-5">
                  <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Class Teacher</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#fbf0fe] shadow-inner">
                      <img
                        src={cls.classTeacher?.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cls.classTeacher?.fullName || classLabel(cls))}`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#1f1a23]">{cls.classTeacher?.fullName || "Unassigned"}</p>
                      <p className="truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                        {cls.classTeacher?.email || "No teacher email"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] bg-white p-5">
                  <p className="mb-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Subjects & Teachers</p>
                  <div className="space-y-2">
                    {cls.subjects.map((subject: any) => (
                      <SubjectTeacherRow key={subject.id} subject={subject} />
                    ))}
                    {cls.subjects.length === 0 ? (
                      <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-xs font-semibold text-[#4d4354]/55">
                        No subjects are attached to this class yet.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[24px] bg-white p-5">
                  <p className="mb-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Exam Review Trail</p>
                  <div className="space-y-2">
                    {cls.exams.map((exam: any) => (
                      <ClassExamRow key={exam.id} exam={exam} />
                    ))}
                    {cls.exams.length === 0 ? (
                      <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-xs font-semibold text-[#4d4354]/55">
                        No exams are available for this class yet.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Student Profiles & Reports</p>
                  <StatusPill status={`${cls.students.length} Students`} />
                </div>
                <div className="space-y-3">
                  {cls.students.map((student: any) => (
                    <StudentProfileRow key={student.id} student={student} />
                  ))}
                  {cls.students.length === 0 ? (
                    <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-xs font-semibold text-[#4d4354]/55">
                      No students have been enrolled in this class yet.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ))}
        {data.classes.length === 0 ? (
          <EmptyState icon={School} title="No classes yet" description="Class structure will appear here once campus setup is complete." />
        ) : null}
      </div>

      <div className="space-y-5">
        <PanelTitle icon={ShieldCheck} title="Locked Assessments" />
        {data.reviewExams.map((exam: any) => (
          <div key={exam.id} className="rounded-[24px] border border-[#cfc2d6]/10 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-[#1f1a23]">{exam.title}</h4>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                  {exam.term} - {classLabel(exam.class)}
                </p>
              </div>
              <StatusPill status={exam.status} />
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
              <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">Report Cards</span>
              <span className="text-base font-black text-[#8127cf]">{exam._count?.reportCards || 0}</span>
            </div>
          </div>
        ))}
        {data.reviewExams.length === 0 ? (
          <p className="rounded-[24px] bg-[#fbf0fe]/50 p-5 text-sm font-semibold text-[#4d4354]/55">
            No locked exams are waiting for review yet.
          </p>
        ) : null}

        <PanelTitle icon={Users} title="Student Roster" />
        <div className="space-y-3">
          {data.students.map((student: any) => (
            <div key={student.id} className="rounded-[22px] border border-[#cfc2d6]/10 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    {student.rollNo} - {classLabel(student.class)}
                  </p>
                </div>
                <StatusPill status={student.guardianWhatsapp || student.guardianEmail ? "CONNECTED" : "NO_RECIPIENT"} />
              </div>
              <p className="mt-3 truncate text-[10px] font-semibold text-[#4d4354]/45">
                Guardian: {student.guardianName || "Not provided"}
              </p>
              {student.reportCards?.[0] ? (
                <div className="mt-3 rounded-2xl bg-[#fbf0fe]/70 px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Latest Report</p>
                  <p className="mt-1 text-xs font-black text-[#1f1a23]">
                    {student.reportCards[0].exam.title} - {percentLabel(student.reportCards[0].percentage)}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
          {data.students.length === 0 ? (
            <p className="rounded-[24px] bg-white p-5 text-sm font-semibold text-[#4d4354]/55">
              No student roster records are available yet.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SubjectTeacherRow({ subject }: { subject: any }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-xs font-black text-[#1f1a23]">{subject.name}</p>
        <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
          {subject.teacher?.fullName || "Teacher not assigned"}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[8px] font-black uppercase tracking-normal text-[#8127cf]">
        {subject.totalMarks} marks
      </span>
    </div>
  );
}

function ClassExamRow({ exam }: { exam: any }) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-[#1f1a23]">{exam.title}</p>
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
            {exam.term} - {exam._count?.reportCards || 0} report cards
          </p>
        </div>
        <StatusPill status={exam.status} />
      </div>
    </div>
  );
}

function StudentProfileRow({ student }: { student: any }) {
  const latestReport = student.reportCards?.[0];

  return (
    <div className="rounded-[22px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/45 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[#1f1a23]">{student.fullName}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
            Roll {student.rollNo} - {student.gender || "Profile"}
          </p>
          <p className="mt-2 truncate text-[10px] font-semibold text-[#4d4354]/55">
            Guardian: {student.guardianName || student.parent?.fullName || "Not provided"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <StatusPill status={student.guardianWhatsapp || student.guardianEmail || student.parent?.email ? "CONNECTED" : "NO_RECIPIENT"} />
          <StatusPill status={latestReport ? latestReport.status : "NO_REPORT"} />
        </div>
      </div>

      {latestReport ? (
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <MiniMetricCompact label="Latest %" value={Math.round(Number(latestReport.percentage || 0))} />
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">Grade</p>
            <p className="mt-1 text-xl font-black text-[#1f1a23]">{latestReport.grade || "-"}</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 md:col-span-2">
            <p className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">Report Card</p>
            <p className="mt-1 truncate text-xs font-black text-[#1f1a23]">
              {latestReport.exam.title} - {latestReport.exam.term}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill status={latestReport.remarksApproved ? "APPROVED" : "REVIEW"} />
              <StatusPill status={latestReport.isSent ? "SENT" : latestReport.deliveryStatus} />
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-[#4d4354]/55">
          No report card has been generated for this student yet.
        </p>
      )}
    </div>
  );
}

function FacultyPanel({ data }: { data: any }) {
  return (
    <div className="space-y-8">
      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/30 p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <PanelTitle icon={ShieldCheck} title="Campus Admin Profiles" />
          <StatusPill status={`${data.campusAdmins.length} Admins`} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.campusAdmins.map((admin: any) => (
            <div key={admin.id} className="rounded-[26px] bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#fbf0fe] shadow-inner">
                  <img src={admin.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(admin.fullName)}`} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-[#1f1a23]">{admin.fullName}</h3>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">{admin.email}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-[#fbf0fe]/70 px-4 py-3">
                <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/45">{formatStatus(admin.role)}</span>
                <StatusPill status={admin.onboardingComplete ? "ACTIVE" : "ONBOARDING"} />
              </div>
            </div>
          ))}
          {data.campusAdmins.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState icon={ShieldCheck} title="No active admins" description="Campus admin profiles will appear here when assigned." />
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-5 flex items-center justify-between gap-4">
          <PanelTitle icon={Users} title="Teacher Profiles" />
          <StatusPill status={`${data.teachers.length} Teachers`} />
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.teachers.map((teacher: any) => (
            <div key={teacher.id} className="rounded-[30px] border border-[#cfc2d6]/10 bg-white p-6 shadow-lg">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#fbf0fe] shadow-inner">
                  <img src={teacher.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teacher.fullName)}`} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-[#1f1a23]">{teacher.fullName}</h3>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">{teacher.email}</p>
                  <p className="mt-1 truncate text-[10px] font-semibold text-[#4d4354]/40">{teacher.phone || "No phone on profile"}</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <MiniMetricCompact label="Subjects" value={teacher._count?.taughtSubjects || 0} />
                <MiniMetricCompact label="Classes" value={teacher._count?.ledClasses || 0} />
              </div>
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
                <span className="text-[9px] font-black uppercase tracking-normal text-emerald-700">Access</span>
                <StatusPill status={teacher.onboardingComplete ? "ACTIVE" : "ONBOARDING"} />
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="mb-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Teaching Subjects</p>
                  <div className="space-y-2">
                    {teacher.taughtSubjects.map((subject: any) => (
                      <div key={subject.id} className="rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
                        <p className="truncate text-xs font-black text-[#1f1a23]">{subject.name}</p>
                        <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                          {classLabel(subject.class)}
                        </p>
                      </div>
                    ))}
                    {teacher.taughtSubjects.length === 0 ? (
                      <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-xs font-semibold text-[#4d4354]/55">
                        No subjects assigned yet.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Led Classes</p>
                  <div className="space-y-2">
                    {teacher.ledClasses.map((cls: any) => (
                      <div key={cls.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbf0fe]/60 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-[#1f1a23]">{classLabel(cls)}</p>
                          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{cls.academicYear}</p>
                        </div>
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-normal text-[#8127cf]">
                          {cls._count?.students || 0} students
                        </span>
                      </div>
                    ))}
                    {teacher.ledClasses.length === 0 ? (
                      <p className="rounded-2xl bg-[#fbf0fe]/60 p-4 text-xs font-semibold text-[#4d4354]/55">
                        No class leadership assigned yet.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {data.teachers.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState icon={Users} title="No active teachers" description="Assigned teachers will appear here for principal oversight." />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReportsPanel({
  data,
  busyAction,
  editingReportId,
  editedRemarks,
  onRunAction,
  onGenerateRemarks,
  onEdit,
  onCancelEdit,
  onRemarkChange,
  onSaveRemark,
}: {
  data: any;
  busyAction: string | null;
  editingReportId: string | null;
  editedRemarks: { en: string; ur: string };
  onRunAction: (examId: string, action: ReportAction, successMessage: string) => void;
  onGenerateRemarks: (examId: string) => void;
  onEdit: (report: any) => void;
  onCancelEdit: () => void;
  onRemarkChange: (value: { en: string; ur: string }) => void;
  onSaveRemark: (report: any, approve?: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-8">
      <div className="space-y-4">
        <PanelTitle icon={ShieldCheck} title="Exam Review Actions" />
        {data.reviewExams.map((exam: any) => (
          <div key={exam.id} className="rounded-[28px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/35 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-[#1f1a23]">{exam.title}</h3>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                  {exam.term} - {classLabel(exam.class)}
                </p>
              </div>
              <StatusPill status={exam.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <ActionButton
                label="Generate"
                icon={FileText}
                busy={busyAction === `generate-${exam.id}`}
                onClick={() => onRunAction(exam.id, "generate", "Report cards generated")}
              />
              <ActionButton
                label="PDFs"
                icon={FileText}
                busy={busyAction === `pdf-${exam.id}`}
                onClick={() => onRunAction(exam.id, "pdf", "PDFs generated")}
              />
              <ActionButton
                label="AI Remarks"
                icon={Sparkles}
                busy={busyAction === `ai-remarks-${exam.id}`}
                onClick={() => onGenerateRemarks(exam.id)}
              />
              <ActionButton
                label="Review"
                icon={ShieldCheck}
                busy={busyAction === `review-${exam.id}`}
                onClick={() => onRunAction(exam.id, "review", "Exam marked as principal reviewed")}
              />
              <ActionButton
                label="Publish"
                icon={Upload}
                busy={busyAction === `publish-${exam.id}`}
                onClick={() => onRunAction(exam.id, "publish", "Reports published")}
              />
              <div className="col-span-2">
                <ActionButton
                  label="Send To Parents"
                  icon={Send}
                  busy={busyAction === `send-${exam.id}`}
                  onClick={() => onRunAction(exam.id, "send", "Delivery attempted")}
                />
              </div>
            </div>
          </div>
        ))}
        {data.reviewExams.length === 0 ? (
          <p className="rounded-[24px] bg-[#fbf0fe]/50 p-5 text-sm font-semibold text-[#4d4354]/55">
            No locked exams are ready for principal review.
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <PanelTitle icon={FileText} title="Report Card Remarks" />
        {data.recentReportCards.map((report: any) => (
          <ReportReviewCard
            key={report.id}
            report={report}
            busy={busyAction === `remark-${report.id}`}
            editing={editingReportId === report.id}
            editedRemarks={editedRemarks}
            onEdit={() => onEdit(report)}
            onCancel={onCancelEdit}
            onChange={onRemarkChange}
            onSave={() => onSaveRemark(report)}
            onApprove={() => onSaveRemark(report, true)}
          />
        ))}
        {data.recentReportCards.length === 0 ? (
          <EmptyState icon={FileText} title="No report cards" description="Generated report cards will appear here for remark approval." />
        ) : null}
      </div>
    </div>
  );
}

function EngagementPanel({
  data,
  totals,
  busy,
  onRunAutomation,
}: {
  data: any;
  totals: { sent: number; failed: number; blocked: number; noContact: number };
  busy: boolean;
  onRunAutomation: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <EngagementStat icon={CheckCircle2} label="Sent" value={totals.sent} tone="green" />
        <EngagementStat icon={AlertCircle} label="Failed" value={totals.failed} tone="rose" />
        <EngagementStat icon={ShieldCheck} label="Blocked" value={totals.blocked} tone="purple" />
        <EngagementStat icon={MessageSquare} label="No Contact" value={totals.noContact} tone="amber" />
      </div>

      <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/30 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <PanelTitle icon={MessageSquare} title="Recent Parent Communication" />
          <BrandButton
            variant="soft"
            onClick={onRunAutomation}
            disabled={busy}
            icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
          >
            Run Automation
          </BrandButton>
        </div>

        <div className="space-y-3">
          {data.recentCommunications.map((item: any) => (
            <div key={item.id} className="rounded-[24px] border border-[#cfc2d6]/10 bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#1f1a23]">{formatStatus(item.templateKey)}</p>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    {item.student?.fullName || item.recipientName || "Parent"} - {item.channel}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-[#4d4354]/60">
                    {item.body}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <StatusPill status={item.status} />
                  <span className="text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/35">
                    {formatDate(item.sentAt || item.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {data.recentCommunications.length === 0 ? (
            <p className="rounded-[24px] bg-white p-6 text-sm font-semibold text-[#4d4354]/55">
              No parent communication has been generated yet.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReportReviewCard({
  report,
  busy,
  editing,
  editedRemarks,
  onEdit,
  onCancel,
  onChange,
  onSave,
  onApprove,
}: {
  report: any;
  busy: boolean;
  editing: boolean;
  editedRemarks: { en: string; ur: string };
  onEdit: () => void;
  onCancel: () => void;
  onChange: (value: { en: string; ur: string }) => void;
  onSave: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-[#cfc2d6]/10 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-[#1f1a23]">{report.student.fullName}</h3>
            <StatusPill status={report.remarksApproved ? "APPROVED" : "REVIEW"} />
            <StatusPill status={report.deliveryStatus} />
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
            {report.student.rollNo} - {report.exam.title} {report.exam.term}
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] transition-all hover:bg-[#8127cf] hover:text-white"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-5 space-y-3">
          <textarea
            value={editedRemarks.en}
            onChange={(event) => onChange({ ...editedRemarks, en: event.target.value })}
            placeholder="English remarks"
            rows={3}
            className="w-full resize-none rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/60 p-4 text-sm font-semibold outline-none transition-all focus:border-[#8127cf]/30 focus:bg-white"
          />
          <textarea
            value={editedRemarks.ur}
            onChange={(event) => onChange({ ...editedRemarks, ur: event.target.value })}
            placeholder="Urdu remarks"
            rows={3}
            dir="rtl"
            className="w-full resize-none rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/60 p-4 text-sm font-semibold outline-none transition-all focus:border-[#8127cf]/30 focus:bg-white"
          />
          <div className="flex flex-wrap gap-2">
            <BrandButton variant="soft" onClick={onSave} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </BrandButton>
            <BrandButton onClick={onApprove} disabled={busy} icon={<ShieldCheck className="h-4 w-4" />}>
              Approve
            </BrandButton>
            <BrandButton variant="danger" onClick={onCancel}>
              Cancel
            </BrandButton>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <RemarkBlock label="English" value={report.remarksEn} />
          <RemarkBlock label="Urdu" value={report.remarksUr} rtl />
          <div className="grid grid-cols-2 gap-3 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45 md:grid-cols-4">
            <span>Total {report.obtainedMarks}/{report.totalMarks}</span>
            <span>{Number(report.percentage || 0).toFixed(1)}%</span>
            <span>{report.student.guardianWhatsapp ? "WhatsApp ready" : "No WhatsApp"}</span>
            <span>{report.student.guardianEmail ? "Email ready" : "No Email"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportRow({ report, compact }: { report: any; compact?: boolean }) {
  return (
    <div className="bg-white p-5 rounded-[24px] border border-[#cfc2d6]/10 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-black text-[#1f1a23] truncate">{report.student.fullName}</p>
        <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-normal truncate">
          {report.student.rollNo} - {report.exam.title} {report.exam.term}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!compact ? <StatusPill status={report.deliveryStatus} /> : null}
        <StatusPill status={report.isSent ? "SENT" : report.remarksApproved ? "APPROVED" : "REVIEW"} />
      </div>
    </div>
  );
}

function RemarkBlock({ label, value, rtl }: { label: string; value?: string | null; rtl?: boolean }) {
  if (!value) {
    return (
      <div className="rounded-2xl border border-[#cfc2d6]/10 bg-[#fbf0fe]/45 px-4 py-3 text-xs font-semibold italic text-[#4d4354]/45">
        No {label.toLowerCase()} remarks yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#cfc2d6]/10 bg-[#fbf0fe]/45 px-4 py-3">
      <p className="mb-1 text-[9px] font-black uppercase tracking-normal text-[#8127cf]">{label}</p>
      <p className="text-sm font-semibold leading-relaxed text-[#1f1a23]" dir={rtl ? "rtl" : undefined}>
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  busy,
  onClick,
}: {
  label: string;
  icon: any;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-3 text-[10px] font-black uppercase tracking-normal text-[#8127cf] shadow-sm transition-all hover:bg-[#8127cf] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-black tracking-normal text-[#1f1a23]">{title}</h3>
    </div>
  );
}

function StatusPill({ status }: { status?: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${statusTone(status)}`}>
      {formatStatus(status)}
    </span>
  );
}

function MiniMetricCompact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <p className="text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p>
      <p className="mt-1 text-xl font-black text-[#1f1a23]">{value}</p>
    </div>
  );
}

function EngagementMetric({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-[20px] bg-[#fbf0fe]/60 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#8127cf] shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/50">{label}</p>
      </div>
      <p className="text-lg font-black text-[#1f1a23]">{value}</p>
    </div>
  );
}

function EngagementStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
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
    <div className="rounded-[28px] border border-[#cfc2d6]/10 bg-white p-5 shadow-lg">
      <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p>
      <p className="mt-1 text-3xl font-black text-[#1f1a23]">{value}</p>
    </div>
  );
}
