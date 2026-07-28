"use client";

import { BrainCircuit, Zap } from "lucide-react";
import { AiActionPanel } from "@/components/role-dashboard";
import { AISkeleton, SideMetric, useTeacherData } from "@/components/teacher/teacher-components";

export default function AIPage() {
  const { data, loading, loadData } = useTeacherData();

  const classHubs = data?.classHubs || [];
  const teacherSubjects = data?.subjects || [];
  const aiCampusId = teacherSubjects[0]?.campusId || classHubs[0]?.campusId;
  const attendanceStats = data?.attendanceSummary || { total: 0, present: 0, absent: 0, leave: 0, unmarked: 0 };

  const teacherAIFeatures = [
    { feature: "weak_topics", label: "Weak Topics", placeholder: "Subject or exam context" },
    { feature: "homework_suggestions", label: "Homework", placeholder: "Student group or weak area" },
    { feature: "lesson_plan", label: "Lesson Plan", field: "topic" as const, placeholder: "Topic, class, duration" },
    { feature: "rewrite_remark", label: "Rewrite Remark", placeholder: "Paste remark draft" },
    { feature: "translate_remark", label: "Translate", placeholder: "Paste remark text" },
  ];

  if (loading && !data) return <AISkeleton />;
  if (!data) return null;

  return (
    <section className="bg-white rounded-[40px] shadow-2xl flex-1 relative overflow-hidden flex flex-col">
      <div className="p-7 px-9 border-b border-[#f3f4f9] bg-white z-10 shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf] mb-2">AI-Powered Teaching Assistant</p>
        <h2 className="text-3xl font-bold text-[#1d1b20] tracking-tight">AI Insights & Tools</h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold text-[#4d4354]/60 leading-relaxed">
          Weak topics, homework suggestions, lesson plans, and remark generation — powered by AI.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#fbf0fe]/20 flex flex-col lg:flex-row gap-8">
        {/* Main AI Panel */}
        <div className="flex-1">
          <div className="bg-white p-6 rounded-[32px] border border-[#cfc2d6]/10 shadow-lg">
            <div className="flex items-start gap-4 mb-6">
              <div className="h-12 w-12 bg-gradient-to-br from-[#fbf0fe] to-white rounded-2xl flex items-center justify-center text-[#8127cf] shadow-md">
                <BrainCircuit className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-xl font-bold tracking-tight leading-none mb-1 text-[#1d1b20]">AI Assistant</h4>
                <p className="text-[11px] font-semibold text-[#4d4354]/50 uppercase tracking-wider">Teacher tools</p>
              </div>
            </div>
            <AiActionPanel
              title="Teacher AI"
              options={teacherAIFeatures}
              campusId={aiCampusId}
              onComplete={loadData}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6 w-full lg:w-[360px] shrink-0">
          <div className="bg-gradient-to-br from-[#1f1a23] to-[#2d2433] p-6 rounded-[32px] text-white relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-[#8127cf]/10 to-transparent rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
            <p className="relative text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-2">Academic Capacity</p>
            <h4 className="relative text-4xl font-bold mb-1 tracking-tight">{data.totalStudents}</h4>
            <p className="relative text-[10px] font-semibold text-white/40 uppercase tracking-wider">Students in assigned classes</p>
            <div className="relative mt-5 grid grid-cols-2 gap-2">
              <SideMetric label="Present Today" value={attendanceStats.present} />
              <SideMetric label="Report Cards" value={data.recentReportCards?.length || 0} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-[#cfc2d6]/10 shadow-lg">
            <h4 className="text-sm font-bold text-[#1d1b20] mb-4 tracking-tight">Recent AI Insights</h4>
            {data.aiInsights?.length ? (
              <div className="space-y-3">
                {data.aiInsights.map((insight: any) => (
                  <div key={insight.id} className="group p-4 rounded-2xl bg-[#fbf0fe]/50 border border-[#8127cf]/10 transition-all hover:bg-[#fbf0fe] hover:shadow-md hover:-translate-y-0.5">
                    <p className="text-[10px] font-semibold text-[#8127cf] uppercase tracking-wider mb-1">
                      {insight.feature.replaceAll("_", " ")}
                    </p>
                    <p className="text-[11px] font-semibold leading-relaxed text-[#1d1b20] line-clamp-3">{insight.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[#fbf0fe]/50 border border-dashed border-[#8127cf]/20 text-[11px] font-medium leading-relaxed italic text-[#4d4354]/60">
                AI drafts for remarks, weak topics, homework, and lesson planning will appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
