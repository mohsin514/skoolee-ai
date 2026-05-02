"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  BookOpen,
  Calendar,
  CreditCard,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  Loader2,
  LogOut,
  Printer,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getStudentDashboardData } from "@/app/actions/dashboard";
import {
  AiActionPanel,
  BrandButton,
  EmptyState,
  RoleShell,
  StatCard,
  type RoleNavItem,
} from "@/components/role-dashboard";

type StudentView = "overview" | "coursework" | "schedule" | "reports" | "fees";

export default function StudentDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<StudentView>("overview");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getStudentDashboardData());
    } catch (error: any) {
      toast.error(`Access denied: ${error.message}`);
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

  const focusView = (view: StudentView) => {
    setActiveView(view);
    window.requestAnimationFrame(() => {
      document.getElementById(`student-${view}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "My Overview", active: activeView === "overview", onClick: () => focusView("overview") },
    { icon: BookOpen, label: "Coursework", active: activeView === "coursework", onClick: () => focusView("coursework") },
    { icon: Calendar, label: "Schedule", active: activeView === "schedule", onClick: () => focusView("schedule") },
    { icon: FileText, label: "Report Card", active: activeView === "reports", onClick: () => focusView("reports") },
    { icon: CreditCard, label: "Fee Tokens", active: activeView === "fees", onClick: () => focusView("fees") },
  ];
  const bottomItems: RoleNavItem[] = [
    { icon: HelpCircle, label: "Help Center", onClick: () => toast.info("Student help is available from this role workspace.") },
    { icon: LogOut, label: "Logout", onClick: handleLogout },
  ];

  if (loading && !data) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f3f4f9] gap-4 text-center px-6">
        <Loader2 className="h-12 w-12 text-[#8127cf] animate-spin" />
        <p className="text-sm font-black text-[#1f1a23] uppercase tracking-normal leading-relaxed">
          Accessing Academic Record...
        </p>
      </div>
    );
  }

  if (!data) return null;

  const user = data.user;
  const average = user.marks.length
    ? Math.round(
        user.marks.reduce((sum: number, mark: any) => sum + (mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100, 0) /
          user.marks.length
      )
    : 0;
  const studentAIFeatures = [
    { feature: "explain_report_card", label: "Explain Report", placeholder: "Optional question about the latest report" },
    { feature: "study_plan", label: "Study Plan", placeholder: "Goal, exam, or available study time" },
    { feature: "school_faq", label: "School FAQ", field: "question" as const, placeholder: "Ask an approved school question" },
  ];
  const profileImage = user.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName)}`;

  return (
    <RoleShell
      navItems={navItems}
      bottomItems={bottomItems}
      eyebrow="Official Academic Transcript"
      userName={user.fullName}
      userRole={user.className}
      avatarSeed={user.fullName}
      dashboardHref="/student"
    >
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div id="student-overview" className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10 scroll-mt-6">
          <div className="flex gap-6 items-start">
            <div className="h-24 w-24 rounded-[32px] bg-slate-100 border-4 border-[#cfc2d6]/20 shadow-xl overflow-hidden shrink-0">
              <img src={profileImage} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="pt-2">
              <h2 className="text-4xl font-black tracking-normal text-[#1f1a23] leading-none mb-2">{user.fullName}</h2>
              <p className="text-sm font-semibold text-[#4d4354]/60 uppercase tracking-normal">
                {user.rollNo || "No roll number"} - {user.className}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/40">
                {user.campusName}{user.campusCity ? ` - ${user.campusCity}` : ""}
              </p>
              <div className="flex gap-3 mt-4">
                <span className="text-[10px] font-black text-[#8127cf] bg-[#fbf0fe] px-3 py-1 rounded-lg uppercase tracking-normal">
                  Enrolled
                </span>
                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg uppercase tracking-normal">
                  Verified
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <BrandButton variant="soft" icon={<Share2 className="w-4 h-4" />}>Share</BrandButton>
            <BrandButton variant="dark" icon={<Printer className="w-4 h-4" />}>Download PDF</BrandButton>
          </div>
        </div>

        {data.profileMissing ? (
          <EmptyState
            icon={GraduationCap}
            title="Academic profile not linked yet"
            description="The account is active, but no central student record is linked to it yet."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-10">
              <StatCard icon={Award} label="Average" value={`${average}%`} />
              <StatCard icon={Calendar} label="Attendance" value={user.attendanceRate === null ? "N/A" : `${user.attendanceRate}%`} tone="green" />
              <StatCard icon={BookOpen} label="Subjects" value={user.subjects.length} tone="purple" />
              <StatCard icon={CreditCard} label="Balance Due" value={`Rs ${user.balanceDue.toLocaleString()}`} tone="rose" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-10 mb-10">
              <div id="student-coursework" className="xl:col-span-2 space-y-6 scroll-mt-6">
                <div>
                  <h3 className="text-lg font-black text-[#1f1a23] tracking-normal">Subjects & Teachers</h3>
                  <div className="mt-4 space-y-3">
                    {user.subjects.length ? (
                      user.subjects.map((subject: any) => (
                        <div key={subject.id} className="flex items-center justify-between gap-4 rounded-2xl bg-[#fbf0fe]/55 p-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[#1f1a23]">{subject.name}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                              {subject.teacher?.fullName || user.classTeacher?.fullName || "Teacher pending"}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[9px] font-black uppercase tracking-normal text-[#8127cf]">
                            {subject.totalMarks || 100} marks
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs font-bold text-[#4d4354]/40 italic">Subjects will appear after admin adds them to this section.</p>
                    )}
                  </div>
                </div>

                <h3 className="text-lg font-black text-[#1f1a23] tracking-normal">Academic Performance</h3>
                {user.marks.length > 0 ? (
                  <div className="space-y-5">
                    {user.marks.slice(0, 5).map((mark: any, index: number) => (
                      <PerfBar
                        key={mark.id}
                        label={mark.subject?.name || "Subject"}
                        score={Math.round((mark.marksObtained / (mark.subject?.totalMarks || 100)) * 100)}
                        color={index % 3 === 0 ? "indigo" : index % 3 === 1 ? "rose" : "amber"}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-[#4d4354]/40 italic">No marks recorded in current cycle.</p>
                )}
              </div>

              <div className="xl:col-span-3">
                <div className="bg-white border border-[#f3f4f9] rounded-[32px] overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#f3f4f9]/30 text-[9px] font-black text-[#4d4354]/40 uppercase tracking-normal border-b border-[#cfc2d6]/10">
                        <th className="px-8 py-4">Subject</th>
                        <th className="px-4 py-4 text-center">Marks</th>
                        <th className="px-8 py-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f3f4f9] text-[11px] font-bold text-[#1f1a23]">
                      {user.marks.map((mark: any) => (
                        <tr key={mark.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-4">
                            <p>{mark.subject?.name}</p>
                            <p className="mt-1 text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/40">
                              {mark.exam?.title || "Exam"} - {mark.subject?.teacher?.fullName || mark.enterer?.fullName || "Teacher"}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {mark.marksObtained} / {mark.subject?.totalMarks || 100}
                          </td>
                          <td className="px-8 py-4 text-right">
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-normal">
                              {mark.exam?.status || "Entered"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-10">
              <section id="student-schedule" className="rounded-[32px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/35 p-6 scroll-mt-6">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-[#1f1a23]">Schedule & Attendance</h3>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                      Current class assignment and attendance health
                    </p>
                  </div>
                  <Calendar className="h-5 w-5 text-[#8127cf]" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Class</p>
                    <p className="mt-1 text-sm font-black text-[#1f1a23]">{user.className}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Class Teacher</p>
                    <p className="mt-1 text-sm font-black text-[#1f1a23]">{user.classTeacher?.fullName || "Not assigned"}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Attendance</p>
                    <p className="mt-1 text-sm font-black text-[#1f1a23]">
                      {user.attendanceRate === null ? "Not recorded" : `${user.attendanceRate}%`}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {user.attendance.slice(0, 5).map((entry: any) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-xs font-black text-[#1f1a23]">{formatDate(entry.date)}</span>
                      <span className="rounded-full bg-[#fbf0fe] px-3 py-1 text-[9px] font-black uppercase tracking-normal text-[#8127cf]">
                        {entry.status}
                      </span>
                    </div>
                  ))}
                  {!user.attendance.length ? <p className="text-xs font-bold text-[#4d4354]/40 italic">Attendance will appear after a teacher marks it.</p> : null}
                </div>
              </section>

              <section id="student-reports" className="rounded-[32px] border border-[#cfc2d6]/10 bg-white p-6 shadow-sm scroll-mt-6">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-[#1f1a23]">Report Cards</h3>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                      Latest published academic records
                    </p>
                  </div>
                  <FileText className="h-5 w-5 text-[#8127cf]" />
                </div>
                {user.reportCards.length ? (
                  <div className="space-y-3">
                    {user.reportCards.map((report: any) => (
                      <div key={report.id} className="flex items-center justify-between gap-4 rounded-2xl bg-[#fbf0fe]/45 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#1f1a23]">{report.exam?.title || "Report card"}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                            {report.grade || "Grade pending"} - {report.status || "Draft"}
                          </p>
                          {report.remarksEn ? (
                            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-[#4d4354]/60">{report.remarksEn}</p>
                          ) : null}
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-[#8127cf]">
                          {Math.round(report.percentage || 0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[#4d4354]/55">Report cards will appear after publication.</p>
                )}
              </section>
            </div>

            <section id="student-fees" className="mb-10 rounded-[32px] border border-[#cfc2d6]/10 bg-[#fbf0fe]/35 p-6 scroll-mt-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-[#1f1a23]">Fee Tokens</h3>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                    Recent invoices and payment progress
                  </p>
                </div>
                <CreditCard className="h-5 w-5 text-[#8127cf]" />
              </div>
              {user.invoices.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {user.invoices.map((invoice: any) => {
                    const paid = invoice.payments?.reduce((sum: number, payment: any) => sum + payment.amountPaid, 0) || 0;
                    const balance = Math.max((invoice.totalAmount || 0) - paid, 0);
                    return (
                      <div key={invoice.id} className="rounded-2xl bg-white p-4 shadow-sm">
                        <p className="text-sm font-black text-[#1f1a23]">{invoice.term || "Fee invoice"}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-normal text-[#4d4354]/45">
                          {invoice.status || (balance > 0 ? "Pending" : "Paid")}
                        </p>
                        <p className="mt-3 text-lg font-black text-[#8127cf]">Rs {balance.toLocaleString()}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm font-semibold text-[#4d4354]/55">No fee invoices are assigned to this profile yet.</p>
              )}
            </section>

            <div className="bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-[40px] p-10 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row gap-8">
              <div className="flex-1 text-white space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-white/20 rounded-2xl flex items-center justify-center">
                    {user.aiInsights?.length ? <Sparkles className="w-6 h-6 text-white" /> : <TrendingUp className="w-6 h-6 text-white" />}
                  </div>
                  <h4 className="text-xl font-black italic tracking-normal leading-none">Academic Insight</h4>
                </div>
                <p className="text-sm font-medium leading-relaxed italic max-w-2xl">
                  {user.aiInsights?.[0]?.summary ||
                    user.reportCards?.[0]?.remarksEn ||
                    "Academic performance will be summarized here after marks and report card remarks are generated."}
                </p>
                {user.aiInsights?.length > 1 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {user.aiInsights.slice(1, 3).map((insight: any) => (
                      <div key={insight.id} className="rounded-2xl bg-white/10 border border-white/15 p-4">
                        <p className="text-[9px] font-black uppercase tracking-normal text-white/60 mb-1">
                          {insight.feature.replaceAll("_", " ")}
                        </p>
                        <p className="text-xs font-semibold leading-relaxed text-white/90">{insight.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="lg:w-[360px] rounded-[28px] bg-white/95 p-5 text-[#1f1a23]">
                <AiActionPanel
                  title="Student AI"
                  options={studentAIFeatures}
                  studentId={user.id}
                  compact
                  onComplete={loadData}
                />
              </div>
            </div>
          </>
        )}
      </section>
    </RoleShell>
  );
}

function formatDate(value?: string | Date | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PerfBar({ label, score, color }: { label: string; score: number; color: "indigo" | "rose" | "amber" }) {
  const colorMap = { indigo: "bg-indigo-500", rose: "bg-rose-500", amber: "bg-amber-500" };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-black text-[#1f1a23]">{label}</span>
        <span className="text-[10px] font-black text-[#4d4354]/40">{score}%</span>
      </div>
      <div className="h-3 w-full bg-[#f3f4f9] rounded-full overflow-hidden p-0.5 border border-[#cfc2d6]/10">
        <div className={`h-full ${colorMap[color]} rounded-full`} style={{ width: `${Math.max(0, Math.min(score, 100))}%` }} />
      </div>
    </div>
  );
}
