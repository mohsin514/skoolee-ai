import Image from "next/image";
import { FileText, TrendingUp, TrendingDown } from "lucide-react";

interface MarkEntry {
  subject: string;
  obtained: number;
  total: number;
  grade: string;
}

interface SingleSubjectCardProps {
  studentName: string;
  rollNo: string;
  className: string;
  academicYear: number;
  term: string;
  subjectName: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  remarks?: string;
  attendancePresent?: number;
  attendanceTotal?: number;
  rank?: number;
  classAverage?: number;
  previousMarks?: MarkEntry[];
  examTitle?: string;
  logo?: string;
  schoolName?: string;
  campusName?: string;
  campusCity?: string;
  campusPhone?: string;
  campusEmail?: string;
  campusWebsite?: string;
  schoolWebsite?: string;
  schoolTagline?: string;
  schoolContactEmail?: string;
}

function gradeColor(grade: string) {
  if (grade === "A+" || grade === "A") return "text-emerald-600";
  if (grade === "B") return "text-blue-600";
  if (grade === "C") return "text-amber-600";
  if (grade === "D") return "text-orange-600";
  return "text-rose-600";
}

function gradeBg(grade: string) {
  if (grade === "A+" || grade === "A") return "bg-emerald-50 border-emerald-200";
  if (grade === "B") return "bg-blue-50 border-blue-200";
  if (grade === "C") return "bg-amber-50 border-amber-200";
  if (grade === "D") return "bg-orange-50 border-orange-200";
  return "bg-rose-50 border-rose-200";
}

export function SingleSubjectReportCard({
  studentName,
  rollNo,
  className,
  academicYear,
  term,
  subjectName,
  totalMarks,
  obtainedMarks,
  percentage,
  grade,
  remarks,
  attendancePresent,
  attendanceTotal,
  rank,
  classAverage,
  previousMarks,
  examTitle,
  logo,
  schoolName,
  campusName,
  campusCity,
  campusPhone,
  campusEmail,
  campusWebsite,
  schoolWebsite,
  schoolTagline,
  schoolContactEmail,
}: SingleSubjectCardProps) {
  const status = percentage >= 50 ? "PASS" : "FAIL";
  const attPct = attendanceTotal ? Math.round(((attendancePresent || 0) / attendanceTotal) * 100) : null;
  const aboveAverage = classAverage !== undefined && percentage >= classAverage;

  return (
    <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-[#8127cf] to-[#6a1fad] px-6 py-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            {schoolName ? <p className="text-[9px] font-bold uppercase tracking-normal text-white/60">{schoolName}</p> : null}
            {schoolTagline ? <p className="text-[8px] font-bold italic text-white/40">{schoolTagline}</p> : null}
            <h2 className="mt-1 text-xl font-black tracking-normal">Subject Report Card</h2>
            <p className="mt-0.5 text-[10px] font-bold text-white/50 uppercase tracking-normal">
              {examTitle || term} - Academic Year {academicYear}
            </p>
            {(campusPhone || campusEmail || campusWebsite || schoolContactEmail) && (
              <p className="mt-0.5 text-[8px] font-bold text-white/35">
                {[campusPhone, campusEmail || schoolContactEmail, campusWebsite || schoolWebsite].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          {logo ? (
            <Image src={logo} alt="School logo" width={48} height={48} className="rounded-xl bg-white/20 object-contain" unoptimized />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <FileText className="h-6 w-6 text-white" />
            </div>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniBox label="Student" value={studentName} />
          <MiniBox label="Roll No" value={rollNo || "—"} />
          <MiniBox label="Class" value={className} />
          <MiniBox label="Subject" value={subjectName} />
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe] to-white border border-[#8127cf]/10 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-normal text-ink-subtle">Obtained</p>
              <p className="mt-1 text-3xl font-black text-[#1f1a23]">{obtainedMarks}</p>
              <p className="text-[10px] font-bold text-ink-subtle">out of {totalMarks}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-normal text-ink-subtle">Percentage</p>
              <p className="mt-1 text-3xl font-black text-[#8127cf]">{percentage}%</p>
              {classAverage !== undefined ? (
                <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-bold">
                  {aboveAverage ? (
                    <><TrendingUp className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Above avg</span></>
                  ) : (
                    <><TrendingDown className="h-3 w-3 text-rose-500" /><span className="text-rose-600">Below avg</span></>
                  )}
                  <span className="text-ink-subtle">({classAverage}%)</span>
                </p>
              ) : null}
            </div>
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-normal text-ink-subtle">Grade</p>
              <p className={`mt-1 text-4xl font-black ${gradeColor(grade)}`}>{grade}</p>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[9px] font-black uppercase tracking-normal mt-1 ${status === "PASS" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                {status}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {rank ? <MiniBox label="Rank" value={`#${rank}`} active /> : null}
          {attPct !== null ? <MiniBox label="Attendance" value={`${attPct}%`} /> : null}
          {attendanceTotal ? <MiniBox label="Present" value={`${attendancePresent || 0}/${attendanceTotal}`} /> : null}
        </div>

        {remarks ? (
          <div className="rounded-2xl bg-[#fbf0fe]/60 px-5 py-4">
            <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Teacher&apos;s Remarks</p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-[#1f1a23] italic">{remarks}</p>
          </div>
        ) : null}

        {previousMarks && previousMarks.length > 0 ? (
          <div>
            <p className="mb-3 text-[9px] font-black uppercase tracking-normal text-ink-subtle">Previous Assessments</p>
            <div className="space-y-2">
              {previousMarks.map((mark, i) => (
                <div key={i} className="flex items-center justify-between gap-4 rounded-2xl bg-[#fbf0fe]/50 px-4 py-3">
                  <span className="text-sm font-bold text-[#1f1a23]">{mark.subject}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-ink">{mark.obtained}/{mark.total}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-normal ${gradeBg(mark.grade)} ${gradeColor(mark.grade)}`}>
                      {mark.grade}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MiniBox({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/70 px-4 py-3">
      <p className="text-[7px] font-black uppercase tracking-normal text-ink-subtle">{label}</p>
      <p className={`mt-1 truncate text-sm font-black ${active ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{value}</p>
    </div>
  );
}
