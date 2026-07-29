"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Award, BookOpen, Calendar, CalendarCheck,
  ChevronDown, ChevronUp, Download, FileText,
  GraduationCap, Loader2, School, User,
} from "lucide-react";
import { toast } from "sonner";

interface ReportCard {
  id: string;
  examTitle: string;
  term: string;
  academicYear: number;
  percentage: number;
  grade: string | null;
  rank: number | null;
  obtainedMarks: number;
  totalMarks: number;
  remarksEn: string | null;
  remarksUr: string | null;
  pdfUrl: string | null;
  status: string;
}

interface MarkEntry {
  subject: string;
  obtained: number;
  total: number;
  grade: string | null;
}

interface ExamMarks {
  examId: string;
  examTitle: string;
  term: string;
  marks: MarkEntry[];
}

interface AttendanceData {
  rate: number | null;
  total: number;
  present: number;
  recent: { date: string; status: string }[];
}

interface FeeItem {
  id: string;
  invoiceNumber: string | null;
  totalAmount: number;
  paid: number;
  balance: number;
  status: string;
  dueDate: string;
}

interface ParentData {
  student: {
    fullName: string;
    rollNo: string;
    gender: string;
    profileImageUrl: string | null;
    className: string;
    academicYear: number;
  };
  campus: {
    name: string;
    city: string | null;
    phone: string | null;
    logoUrl: string | null;
  };
  reportCards: ReportCard[];
  marksByExam: ExamMarks[];
  attendance: AttendanceData;
  fees: FeeItem[];
}

type Tab = "results" | "attendance" | "fees";

export default function ParentPortal() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<ParentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("results");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      const res = await fetch(`/api/parent/data?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Access denied");
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#8127cf]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="h-16 w-16 rounded-[28px] bg-rose-50 flex items-center justify-center mx-auto mb-5">
            <School className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="text-2xl font-bold text-[#1d1b20] mb-2">Access Denied</h1>
          <p className="text-sm text-[#4d4354]/60">
            {error || "This link may have expired. Please contact the school for a new access link."}
          </p>
        </div>
      </div>
    );
  }

  const { student, campus } = data;
  const profileImage = student.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(student.fullName)}`;

  const TABS: { key: Tab; label: string; icon: typeof FileText }[] = [
    { key: "results", label: "Results", icon: FileText },
    { key: "attendance", label: "Attendance", icon: CalendarCheck },
    { key: "fees", label: "Fee Status", icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff]">
      <header className="bg-white/80 backdrop-blur-xl border-b border-[#cfc2d6]/10 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          {campus.logoUrl ? (
            <img src={campus.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-[#8127cf] flex items-center justify-center">
              <School className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-sm font-bold text-[#1d1b20]">{campus.name}</h1>
            <p className="text-[10px] font-semibold text-[#4d4354]/40 uppercase tracking-wider">Parent Portal</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-[28px] border border-[#cfc2d6]/10 p-6 shadow-lg">
          <div className="flex items-center gap-5">
            <img src={profileImage} alt="" className="h-16 w-16 rounded-[20px] border-2 border-[#cfc2d6]/15 object-cover" />
            <div>
              <h2 className="text-xl font-bold text-[#1d1b20]">{student.fullName}</h2>
              <p className="text-xs font-semibold text-[#4d4354]/50">
                {student.rollNo} &middot; {student.className} &middot; {student.academicYear}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-5">
            <MiniStat icon={Award} label="Report Cards" value={data.reportCards.length} />
            <MiniStat icon={Calendar} label="Attendance" value={data.attendance.rate !== null ? `${data.attendance.rate}%` : "N/A"} />
            <MiniStat icon={GraduationCap} label="Exams" value={data.marksByExam.length} />
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-2xl bg-[#f3f4f9] p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-normal transition-all cursor-pointer ${
                  tab === t.key
                    ? "bg-white text-[#8127cf] shadow-sm"
                    : "text-[#4d4354]/50 hover:text-[#8127cf]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "results" && <ResultsTab reportCards={data.reportCards} marksByExam={data.marksByExam} />}
        {tab === "attendance" && <AttendanceTab attendance={data.attendance} />}
        {tab === "fees" && <FeesTab fees={data.fees} />}
      </main>

      <footer className="text-center py-8 text-[10px] font-semibold text-[#4d4354]/30 uppercase tracking-wider">
        Powered by SkooleeAI
      </footer>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-[#fbf0fe]/40 p-3 text-center">
      <Icon className="w-4 h-4 text-[#8127cf] mx-auto mb-1" />
      <p className="text-lg font-bold text-[#1d1b20]">{value}</p>
      <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase">{label}</p>
    </div>
  );
}

function ResultsTab({ reportCards, marksByExam }: { reportCards: ReportCard[]; marksByExam: ExamMarks[] }) {
  const [expandedExam, setExpandedExam] = useState<string | null>(null);

  if (reportCards.length === 0 && marksByExam.length === 0) {
    return (
      <EmptySection icon={FileText} title="No results yet" description="Results will appear here after exams are published." />
    );
  }

  return (
    <div className="space-y-4">
      {reportCards.map((rc) => {
        const pct = Math.round(rc.percentage);
        const scoreColor = pct >= 80 ? "text-emerald-600 bg-emerald-50" : pct >= 60 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50";

        return (
          <div key={rc.id} className="bg-white rounded-[24px] border border-[#cfc2d6]/10 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase">{rc.term} {rc.academicYear}</p>
                <h3 className="text-base font-bold text-[#1d1b20] mt-0.5">{rc.examTitle}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${scoreColor}`}>{pct}%</span>
                  <span className="text-[10px] font-bold text-[#4d4354]/40">Grade: {rc.grade || "N/A"}</span>
                  {rc.rank && <span className="text-[10px] font-bold text-[#4d4354]/40">Rank: #{rc.rank}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-[#8127cf]">{rc.obtainedMarks}<span className="text-sm font-bold text-[#4d4354]/30">/{rc.totalMarks}</span></p>
              </div>
            </div>

            {rc.remarksEn && (
              <div className="mt-3 p-3 rounded-xl bg-[#fbf0fe]/30 border border-[#cfc2d6]/5">
                <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase mb-1">Teacher Remarks</p>
                <p className="text-xs text-[#4d4354]/70 leading-relaxed">{rc.remarksEn}</p>
              </div>
            )}

            {rc.pdfUrl && (
              <a
                href={rc.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-[#8127cf] hover:text-[#6a1fb0] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </a>
            )}
          </div>
        );
      })}

      {marksByExam.map((exam) => {
        const isExpanded = expandedExam === exam.examId;
        return (
          <div key={exam.examId} className="bg-white rounded-[24px] border border-[#cfc2d6]/10 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedExam(isExpanded ? null : exam.examId)}
              className="w-full flex items-center justify-between p-5 hover:bg-[#fbf0fe]/20 transition-colors cursor-pointer"
            >
              <div className="text-left">
                <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase">{exam.term}</p>
                <h3 className="text-sm font-bold text-[#1d1b20]">{exam.examTitle}</h3>
                <p className="text-[10px] font-semibold text-[#4d4354]/40 mt-0.5">{exam.marks.length} subjects</p>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-[#4d4354]/40" /> : <ChevronDown className="w-4 h-4 text-[#4d4354]/40" />}
            </button>
            {isExpanded && (
              <div className="border-t border-[#f3f4f9] px-5 pb-4">
                <div className="grid grid-cols-[1fr_80px_60px] gap-2 py-2 text-[9px] font-black uppercase text-[#4d4354]/40">
                  <span>Subject</span>
                  <span className="text-right">Marks</span>
                  <span className="text-right">Grade</span>
                </div>
                {exam.marks.map((m) => (
                  <div key={m.subject} className="grid grid-cols-[1fr_80px_60px] gap-2 py-2 border-t border-[#f3f4f9]/50">
                    <span className="text-xs font-semibold text-[#1d1b20]">{m.subject}</span>
                    <span className="text-xs font-bold text-[#4d4354]/60 text-right">{m.obtained}/{m.total}</span>
                    <span className="text-xs font-black text-[#8127cf] text-right">{m.grade || "-"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AttendanceTab({ attendance }: { attendance: AttendanceData }) {
  if (attendance.total === 0) {
    return <EmptySection icon={CalendarCheck} title="No attendance data" description="Attendance records will appear here once marked." />;
  }

  const statusColors: Record<string, string> = {
    PRESENT: "bg-emerald-500",
    ABSENT: "bg-rose-500",
    LATE: "bg-amber-500",
    LEAVE: "bg-blue-500",
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[24px] border border-[#cfc2d6]/10 p-6 shadow-sm">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-3xl font-black text-[#8127cf]">{attendance.rate !== null ? `${attendance.rate}%` : "N/A"}</p>
            <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase mt-1">Attendance Rate</p>
          </div>
          <div>
            <p className="text-3xl font-black text-emerald-600">{attendance.present}</p>
            <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase mt-1">Present</p>
          </div>
          <div>
            <p className="text-3xl font-black text-rose-600">{attendance.total - attendance.present}</p>
            <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase mt-1">Absent / Leave</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-[#cfc2d6]/10 p-5 shadow-sm">
        <p className="text-xs font-black text-[#1d1b20] mb-3">Recent Attendance</p>
        <div className="grid grid-cols-7 gap-1.5">
          {attendance.recent.map((a, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={`w-6 h-6 rounded-lg ${statusColors[a.status] || "bg-gray-300"}`} title={`${a.date}: ${a.status}`} />
              <span className="text-[7px] font-semibold text-[#4d4354]/30">{new Date(a.date).getDate()}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4">
          {Object.entries(statusColors).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${color}`} />
              <span className="text-[9px] font-semibold text-[#4d4354]/40 capitalize">{status.toLowerCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeesTab({ fees }: { fees: FeeItem[] }) {
  if (fees.length === 0) {
    return <EmptySection icon={BookOpen} title="No fee records" description="Fee invoices will appear here when generated." />;
  }

  const statusColors: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-600",
    PENDING: "bg-amber-50 text-amber-600",
    OVERDUE: "bg-rose-50 text-rose-600",
    PARTIAL: "bg-blue-50 text-blue-600",
    CANCELLED: "bg-gray-50 text-gray-500",
  };

  return (
    <div className="space-y-3">
      {fees.map((fee) => (
        <div key={fee.id} className="bg-white rounded-[24px] border border-[#cfc2d6]/10 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[#1d1b20]">{fee.invoiceNumber || "Invoice"}</p>
              <p className="text-[10px] font-semibold text-[#4d4354]/40 mt-0.5">Due: {fee.dueDate}</p>
            </div>
            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${statusColors[fee.status] || "bg-gray-50 text-gray-500"}`}>
              {fee.status}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase">Total</p>
              <p className="text-sm font-black text-[#1d1b20]">Rs {(fee.totalAmount / 100).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase">Paid</p>
              <p className="text-sm font-black text-emerald-600">Rs {(fee.paid / 100).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-[#4d4354]/40 uppercase">Balance</p>
              <p className="text-sm font-black text-rose-600">Rs {(fee.balance / 100).toLocaleString()}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptySection({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-[24px] bg-[#fbf0fe] flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#8127cf]/40" />
      </div>
      <h3 className="text-base font-bold text-[#1d1b20]">{title}</h3>
      <p className="mt-1 text-xs text-[#4d4354]/50 max-w-xs">{description}</p>
    </div>
  );
}
