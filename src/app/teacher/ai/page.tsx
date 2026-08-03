"use client";

import { BrainCircuit, BookOpen, Users, GraduationCap, BarChart3, Sparkles, TrendingUp, Zap, Bot, Lightbulb, Stars } from "lucide-react";
import { AiActionPanel } from "@/components/role-dashboard";
import { AISkeleton, TeacherErrorState, useTeacherData } from "@/components/teacher/teacher-components";
import { CornerSparkles } from "@/components/CornerSparkles";

export default function AIPage() {
  const { data, loading, error, loadData } = useTeacherData();

  const classHubs = data?.classHubs || [];
  const teacherSubjects = data?.subjects || [];
  const aiCampusId = teacherSubjects[0]?.campusId || classHubs[0]?.campusId;
  const attendanceStats = data?.attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };
  const activeExamsCount = (data?.activeExams || []).length;
  const totalStudents = data?.totalStudents || 0;
  const totalClasses = classHubs.length;
  const totalSubjects = teacherSubjects.length;

  const teacherAIFeatures = [
    { feature: "weak_topics", label: "Weak Topics", placeholder: "Subject or exam context" },
    { feature: "homework_suggestions", label: "Homework", placeholder: "Student group or weak area" },
    { feature: "lesson_plan", label: "Lesson Plan", field: "topic" as const, placeholder: "Topic, class, duration" },
    { feature: "rewrite_remark", label: "Rewrite Remark", placeholder: "Paste remark draft" },
    { feature: "translate_remark", label: "Translate", placeholder: "Paste remark text" },
  ];

  if (loading && !data) return <AISkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={loadData} />;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] border-b border-[#cfc2d6]/15 shrink-0">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-[#8127cf]/6 to-transparent rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-gradient-to-tr from-[#8127cf]/3 to-transparent rounded-full blur-3xl translate-y-1/3" />
        <div className="relative p-7 px-9">
          <div className="flex items-center gap-2 text-[#8127cf] mb-2">
            <BrainCircuit className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {data.aiInsights?.length ? `${data.aiInsights.length} AI insights available` : "AI-Powered Teaching Assistant"}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">AI Insights & Tools</h2>
          <p className="mt-1 text-sm font-semibold text-[#4d4354]/60">Weak topics, homework suggestions, lesson plans, and remark generation.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-7 px-9 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AIStatCard icon={BookOpen} label="Subjects" value={totalSubjects} sub="Assigned" />
          <AIStatCard icon={GraduationCap} label="Classes" value={totalClasses} sub={totalClasses === 1 ? "1 class hub" : `${totalClasses} class hubs`} tone="emerald" />
          <AIStatCard icon={BarChart3} label="Active Exams" value={activeExamsCount} sub={activeExamsCount === 1 ? "1 in progress" : `${activeExamsCount} in progress`} tone="indigo" />
          <AIStatCard icon={Users} label="Students" value={totalStudents} sub={totalStudents === 1 ? "1 student" : `${totalStudents} enrolled`} tone="rose" />
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0">
            <div className="group relative bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white p-6 rounded-[32px] border border-[#8127cf]/10 shadow-lg transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:border-[#8127cf]/25 overflow-hidden">
              <CornerSparkles />
              <div className="absolute -inset-4 bg-gradient-to-br from-[#8127cf]/8 via-[#b876f0]/5 to-transparent rounded-[40px] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-[80px]" />
              <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-gradient-to-tr from-[#b876f0]/8 to-transparent rounded-full blur-[80px]" />
              <div className="absolute top-1/3 -left-16 w-40 h-40 bg-gradient-to-r from-white/20 via-[#b876f0]/10 to-transparent rounded-full blur-[100px]" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(ellipse_at_center,_#8127cf_0%,_#b876f0_30%,_transparent_70%)] opacity-0 group-hover:opacity-10 transition-opacity duration-700 pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#8127cf]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative flex items-start gap-4 mb-6">
                <div className="relative">
                  <div className="absolute -inset-3 bg-gradient-to-br from-[#8127cf]/15 to-[#b876f0]/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#b876f0] flex items-center justify-center text-white shadow-lg shadow-[#8127cf]/20 transition-all duration-500 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-[#8127cf]/40">
                    <Bot className="w-7 h-7" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xl font-bold tracking-tight leading-none mb-1 text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">AI Assistant</h4>
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#8127cf] to-[#b876f0] px-2.5 py-0.5 text-[8px] font-bold text-white uppercase tracking-wider shadow-sm shadow-[#8127cf]/20">
                      <Sparkles className="w-2.5 h-2.5" />
                      Powered
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold text-[#4d4354]/50 uppercase tracking-wider">Teacher tools</p>
                </div>
              </div>
              <div className="relative">
                <AiActionPanel
                  title="Teacher AI"
                  options={teacherAIFeatures}
                  campusId={aiCampusId}
                  onComplete={loadData}
                />
              </div>
            </div>
          </div>

          <div className="space-y-6 w-full lg:w-[360px] shrink-0">
            <div className="relative group bg-gradient-to-br from-[#1f1a23] via-[#2d2433] to-[#1f1a23] p-6 rounded-[32px] text-white overflow-hidden shadow-xl transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
              <CornerSparkles color="#c084fc" />
              <div className="absolute -inset-4 bg-gradient-to-br from-[#8127cf]/12 via-[#b876f0]/8 to-transparent rounded-[40px] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              <div className="absolute -top-32 -right-32 w-72 h-72 bg-gradient-to-bl from-[#8127cf]/15 to-transparent rounded-full blur-[100px]" />
              <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-to-tr from-[#b876f0]/10 to-transparent rounded-full blur-[100px]" />
              <div className="absolute top-1/4 -left-20 w-48 h-48 bg-gradient-to-r from-white/[0.08] via-[#b876f0]/8 to-transparent rounded-full blur-[120px]" />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#8127cf]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative">
                    <div className="absolute -inset-2 bg-[#b876f0]/15 rounded-lg blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative h-6 w-6 rounded-lg bg-gradient-to-br from-[#8127cf]/20 to-[#b876f0]/20 flex items-center justify-center">
                      <Stars className="w-3.5 h-3.5 text-[#b876f0]" />
                    </div>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Academic Capacity</p>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <h4 className="text-4xl font-bold tracking-tight transition-all duration-300 group-hover:text-[#b876f0] group-hover:drop-shadow-[0_0_20px_rgba(184,118,240,0.6)]">{totalStudents}</h4>
                  <span className="text-sm font-semibold text-white/40">students</span>
                </div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Across {totalClasses} class{totalClasses !== 1 ? "es" : ""} · {totalSubjects} subject{totalSubjects !== 1 ? "s" : ""}</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <AISideMetric label="Present Today" value={attendanceStats.present} />
                  <AISideMetric label="Report Cards" value={data.recentReportCards?.length || 0} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <AISideMetric label="Active Exams" value={activeExamsCount} />
                  <AISideMetric label="AI Insights" value={data.aiInsights?.length || 0} />
                </div>
              </div>
            </div>

            <div className="group relative bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white p-6 rounded-[32px] border border-[#8127cf]/10 shadow-lg transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:border-[#8127cf]/25 overflow-hidden">
              <CornerSparkles />
              <div className="absolute -inset-4 bg-gradient-to-br from-[#8127cf]/6 via-[#b876f0]/4 to-transparent rounded-[40px] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              <div className="absolute -top-20 -right-20 w-56 h-56 bg-gradient-to-bl from-[#8127cf]/8 to-transparent rounded-full blur-[80px]" />
              <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-gradient-to-tr from-[#b876f0]/6 to-transparent rounded-full blur-[80px]" />
              <div className="absolute top-1/3 right-1/4 w-32 h-32 bg-gradient-to-l from-white/20 via-[#b876f0]/8 to-transparent rounded-full blur-[100px]" />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#8127cf]/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="flex items-center gap-2 mb-4 relative">
                <div className="relative">
                  <div className="absolute -inset-2 bg-[#8127cf]/10 rounded-lg blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative h-7 w-7 rounded-lg bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-[#8127cf]" />
                  </div>
                </div>
                <h4 className="text-sm font-bold text-[#1d1b20] tracking-tight transition-colors group-hover:text-[#8127cf]">Recent AI Insights</h4>
                {data.aiInsights?.length > 0 && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-gradient-to-r from-[#8127cf] to-[#b876f0] px-2 py-0.5 text-[8px] font-bold text-white uppercase tracking-wider shadow-sm shadow-[#8127cf]/20">
                    {data.aiInsights.length} new
                  </span>
                )}
              </div>
              <div className="relative">
                {data.aiInsights?.length ? (
                  <div className="space-y-3">
                    {data.aiInsights.map((insight: any, idx: number) => (
                      <div key={insight.id} className="group/insight relative p-4 rounded-2xl bg-gradient-to-br from-[#fbf0fe]/70 via-white to-[#fbf0fe]/40 border border-[#8127cf]/8 transition-all duration-300 hover:bg-[#fbf0fe]/90 hover:shadow-lg hover:-translate-y-0.5 hover:border-[#8127cf]/25 overflow-hidden">
                        <div className="absolute -inset-2 bg-gradient-to-br from-[#8127cf]/6 via-[#b876f0]/3 to-transparent rounded-2xl blur-lg opacity-0 group-hover/insight:opacity-100 transition-opacity duration-500 pointer-events-none" />
                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-[60px]" />
                        <div className="absolute -bottom-8 -left-8 w-20 h-20 bg-gradient-to-tr from-[#b876f0]/8 to-transparent rounded-full blur-[50px]" />
                        <div className="relative flex items-start gap-3">
                          <div className="relative shrink-0 mt-0.5">
                            <div className="absolute -inset-2 bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/8 rounded-xl blur-md opacity-0 group-hover/insight:opacity-100 transition-opacity duration-500" />
                            <div className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 flex items-center justify-center transition-all duration-300 group-hover/insight:from-[#8127cf] group-hover/insight:to-[#b876f0] group-hover/insight:text-white">
                              {idx === 0 ? <Lightbulb className="w-4 h-4 text-[#8127cf] transition-colors group-hover/insight:text-white" /> :
                               idx === 1 ? <TrendingUp className="w-4 h-4 text-[#8127cf] transition-colors group-hover/insight:text-white" /> :
                               <Zap className="w-4 h-4 text-[#8127cf] transition-colors group-hover/insight:text-white" />}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[9px] font-bold text-[#8127cf] bg-white/80 rounded-full px-2 py-0.5 uppercase tracking-wider border border-[#8127cf]/10 transition-all group-hover/insight:bg-[#8127cf] group-hover/insight:text-white group-hover/insight:border-transparent group-hover/insight:shadow-md group-hover/insight:shadow-[#8127cf]/20">
                                {insight.feature.replaceAll("_", " ")}
                              </span>
                              {insight.approvalStatus === "APPROVED" && (
                                <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-wider">Approved</span>
                              )}
                            </div>
                            <p className="text-[11px] font-semibold leading-relaxed text-[#4d4354]/80 line-clamp-3 transition-colors group-hover/insight:text-[#1d1b20]">{insight.summary}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative p-6 rounded-2xl bg-gradient-to-br from-[#fbf0fe]/50 via-white to-[#fbf0fe]/30 border border-dashed border-[#8127cf]/15 text-center transition-all hover:bg-[#fbf0fe]/70 hover:shadow-md overflow-hidden">
                    <div className="absolute -inset-3 bg-gradient-to-br from-[#8127cf]/4 to-transparent rounded-2xl blur-xl opacity-0 hover:opacity-100 transition-opacity duration-500" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#8127cf_0%,_transparent_70%)] opacity-[0.04]" />
                    <div className="relative">
                      <div className="relative inline-flex mb-3">
                        <div className="absolute -inset-3 bg-gradient-to-br from-[#8127cf]/8 to-[#b876f0]/6 rounded-2xl blur-lg" />
                        <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-[#8127cf]/10 to-[#b876f0]/10 flex items-center justify-center">
                          <Zap className="w-6 h-6 text-[#8127cf]/40" />
                        </div>
                      </div>
                      <p className="text-[11px] font-medium leading-relaxed italic text-[#4d4354]/60">
                        AI drafts for remarks, weak topics, homework, and lesson planning will appear here.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AIStatCard({ icon: Icon, label, value, sub, tone = "purple" }: { icon: any; label: string; value: string | number; sub: string; tone?: string }) {
  return (
    <div className="group relative bg-gradient-to-br from-white via-[#fbf0fe]/30 to-white border border-[#8127cf]/8 p-5 shadow-lg transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:border-[#8127cf]/20 overflow-hidden rounded-[28px]">
      <div className="absolute -inset-3 bg-gradient-to-br from-[#8127cf]/6 via-[#b876f0]/4 to-transparent rounded-[32px] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      <div className="absolute -top-16 -right-16 w-40 h-40 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-[70px]" />
      <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-gradient-to-tr from-[#b876f0]/6 to-transparent rounded-full blur-[60px]" />
      <div className="relative flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase tracking-wider transition-colors group-hover:text-[#4d4354]/60">{label}</p>
        <div className="relative">
          <div className="absolute -inset-2 bg-gradient-to-br from-[#8127cf]/8 to-[#b876f0]/6 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className={cn(
            "relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg",
            tone === "emerald" ? "bg-gradient-to-br from-emerald-50 to-white text-emerald-600 group-hover:from-emerald-600 group-hover:to-emerald-500 group-hover:text-white group-hover:shadow-emerald-500/20" :
            tone === "rose" ? "bg-gradient-to-br from-rose-50 to-white text-rose-600 group-hover:from-rose-600 group-hover:to-rose-500 group-hover:text-white group-hover:shadow-rose-500/20" :
            tone === "indigo" ? "bg-gradient-to-br from-[#fbf0fe] to-white text-[#8127cf] group-hover:from-[#8127cf] group-hover:to-[#b876f0] group-hover:text-white group-hover:shadow-[#8127cf]/20" :
            "bg-gradient-to-br from-[#fbf0fe] to-white text-[#8127cf] group-hover:from-[#8127cf] group-hover:to-[#b876f0] group-hover:text-white group-hover:shadow-[#8127cf]/20"
          )}>
            <Icon className="w-[18px] h-[18px]" />
          </div>
        </div>
      </div>
      <p className="relative text-2xl font-bold text-[#1d1b20] leading-none transition-colors group-hover:text-[#8127cf]">{value}</p>
      <p className="relative mt-1 text-[10px] font-semibold text-[#4d4354]/40">{sub}</p>
    </div>
  );
}

function AISideMetric({ label, value }: { label: string; value: any }) {
  return (
    <div className="relative rounded-2xl bg-white/8 border border-white/5 px-3.5 py-3 transition-all duration-300 hover:bg-white/[0.14] hover:border-[#8127cf]/20 hover:shadow-lg hover:-translate-y-0.5 group/metric overflow-hidden">
      <div className="absolute -inset-2 bg-gradient-to-br from-[#b876f0]/6 to-transparent rounded-2xl blur-lg opacity-0 group-hover/metric:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <p className="relative text-[10px] font-semibold uppercase tracking-wider text-white/50 transition-colors group-hover/metric:text-[#b876f0]/80">{label}</p>
      <p className="relative mt-0.5 truncate text-lg font-bold text-white transition-all group-hover/metric:text-[#b876f0] group-hover/metric:drop-shadow-[0_0_12px_rgba(184,118,240,0.5)]">{value}</p>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
