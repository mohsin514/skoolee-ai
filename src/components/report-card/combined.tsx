import { FileText, TrendingUp, TrendingDown, Award, BarChart3 } from "lucide-react";

interface SubjectResult {
  subjectId: string;
  subjectName: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
}

interface ExamBreakdown {
  examId: string;
  examTitle: string;
  examType: string;
  weight: number;
  percentage: number;
  grade: string;
  obtainedMarks: number;
  totalMarks: number;
  contribution: number;
}

interface CombinedReportCardProps {
  studentName: string;
  rollNo: string;
  className: string;
  academicYear: number;
  overallPercentage: number;
  overallGrade: string;
  passed: boolean;
  rank?: number;
  attendancePresent?: number;
  attendanceTotal?: number;
  subjectResults: SubjectResult[];
  examBreakdown: ExamBreakdown[];
  remarksEn?: string;
  remarksUr?: string;
  logo?: string;
  schoolName?: string;
  campusName?: string;
}

function gradeColor(grade: string) {
  if (grade === "A+" || grade === "A") return "text-emerald-600";
  if (grade === "B") return "text-blue-600";
  if (grade === "C") return "text-amber-600";
  if (grade === "D") return "text-orange-600";
  return "text-rose-600";
}

function gradeBg(grade: string) {
  if (grade === "A+" || grade === "A") return "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (grade === "B") return "bg-blue-50 border-blue-200 text-blue-700";
  if (grade === "C") return "bg-amber-50 border-amber-200 text-amber-700";
  if (grade === "D") return "bg-orange-50 border-orange-200 text-orange-700";
  return "bg-rose-50 border-rose-200 text-rose-700";
}

export function CombinedReportCard({
  studentName,
  rollNo,
  className,
  academicYear,
  overallPercentage,
  overallGrade,
  passed,
  rank,
  attendancePresent,
  attendanceTotal,
  subjectResults,
  examBreakdown,
  remarksEn,
  remarksUr,
  logo,
  schoolName,
  campusName,
}: CombinedReportCardProps) {
  const attPct = attendanceTotal ? Math.round(((attendancePresent || 0) / attendanceTotal) * 100) : null;
  const totalObtained = subjectResults.reduce((s, r) => s + r.obtainedMarks, 0);
  const totalPossible = subjectResults.reduce((s, r) => s + r.totalMarks, 0);
  const subjectCount = subjectResults.length;
  const passedSubjects = subjectResults.filter((r) => r.percentage >= 50).length;
  const failedSubjects = subjectCount - passedSubjects;

  return (
    <div className="rounded-[32px] border border-[#cfc2d6]/10 bg-white shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-[#8127cf] to-[#6a1fad] px-6 py-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            {schoolName ? <p className="text-[9px] font-bold uppercase tracking-normal text-white/60">{schoolName}</p> : null}
            {campusName ? <p className="text-[8px] font-bold text-white/40 uppercase tracking-normal">{campusName}</p> : null}
            <h2 className="mt-1 text-xl font-black tracking-normal">Combined Report Card</h2>
            <p className="mt-0.5 text-[10px] font-bold text-white/50 uppercase tracking-normal">
              Academic Year {academicYear}
            </p>
          </div>
          {logo ? (
            <img src={logo} alt="" className="h-12 w-12 rounded-xl bg-white/20 object-contain" />
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
          <MiniBox label="Subjects" value={`${subjectCount}`} />
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-[#fbf0fe] to-white border border-[#8127cf]/10 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Total</p>
              <p className="mt-1 text-2xl font-black text-[#1f1a23]">{totalObtained}</p>
              <p className="text-[10px] font-bold text-[#4d4354]/45">out of {totalPossible}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Overall</p>
              <p className="mt-1 text-2xl font-black text-[#8127cf]">{overallPercentage}%</p>
              <p className="text-[10px] font-bold text-[#4d4354]/45">Percentage</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Grade</p>
              <p className={`mt-1 text-3xl font-black ${gradeColor(overallGrade)}`}>{overallGrade}</p>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[9px] font-black uppercase tracking-normal mt-1 ${passed ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                {passed ? "PASS" : "FAIL"}
              </span>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Summary</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[8px] font-black text-emerald-600">{passedSubjects} Pass</span>
                {failedSubjects > 0 ? (
                  <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[8px] font-black text-rose-600">{failedSubjects} Fail</span>
                ) : null}
              </div>
              {rank ? (
                <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-black text-amber-600">
                  <Award className="h-3.5 w-3.5" />
                  Rank #{rank}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {attPct !== null ? (
          <div className="flex items-center gap-2 rounded-2xl bg-[#fbf0fe]/60 px-5 py-3">
            <BarChart3 className="h-4 w-4 text-[#8127cf]" />
            <span className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Attendance:</span>
            <span className="text-sm font-black text-[#1f1a23]">{attPct}%</span>
            <span className="text-[9px] font-bold text-[#4d4354]/45">({attendancePresent}/{attendanceTotal} days)</span>
          </div>
        ) : null}

        <div>
          <p className="mb-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Subject Performance</p>
          <div className="overflow-hidden rounded-[26px] border border-[#cfc2d6]/10">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#f3f4f9]/60 text-[8px] font-black uppercase tracking-normal text-[#4d4354]/40">
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-4 py-3 text-center">Obtained</th>
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3 text-center">%</th>
                  <th className="px-4 py-3 text-center">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f9]">
                {subjectResults.map((subject) => (
                  <tr key={subject.subjectId} className="hover:bg-[#fbf0fe]/30">
                    <td className="px-5 py-3 font-bold text-sm text-[#1f1a23]">{subject.subjectName}</td>
                    <td className="px-4 py-3 text-center font-black text-[#1f1a23]">{subject.obtainedMarks}</td>
                    <td className="px-4 py-3 text-center text-sm text-[#4d4354]/60">{subject.totalMarks}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-black text-sm ${subject.percentage >= 50 ? "text-emerald-600" : "text-rose-600"}`}>
                        {subject.percentage}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-normal ${gradeBg(subject.grade)} ${gradeColor(subject.grade)}`}>
                        {subject.grade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {examBreakdown.length > 0 ? (
          <div>
            <p className="mb-3 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Exam Weight Breakdown</p>
            <div className="space-y-2">
              {examBreakdown.map((exam) => (
                <div key={exam.examId} className="flex items-center justify-between gap-4 rounded-2xl bg-[#fbf0fe]/50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[#1f1a23]">{exam.examTitle}</p>
                    <p className="text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{exam.examType.replace("_", " ")}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] font-bold text-[#4d4354]/45">{exam.obtainedMarks}/{exam.totalMarks}</span>
                    <span className="text-sm font-black text-[#1f1a23]">{exam.percentage}%</span>
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-[9px] font-black text-[#8127cf]">{exam.weight}%</span>
                    <span className="text-[10px] font-bold text-[#4d4354]/45">→ {exam.contribution}%</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase tracking-normal ${gradeBg(exam.grade)}`}>
                      {exam.grade}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {remarksEn ? (
          <div className="rounded-2xl bg-[#fbf0fe]/60 px-5 py-4">
            <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Remarks (English)</p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-[#1f1a23] italic">{remarksEn}</p>
          </div>
        ) : null}

        {remarksUr ? (
          <div className="rounded-2xl bg-[#fbf0fe]/60 px-5 py-4" dir="rtl">
            <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]">Remarks (Urdu)</p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-[#1f1a23] italic">{remarksUr}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MiniBox({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/70 px-4 py-3">
      <p className="text-[7px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p>
      <p className={`mt-1 truncate text-sm font-black ${active ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{value}</p>
    </div>
  );
}
