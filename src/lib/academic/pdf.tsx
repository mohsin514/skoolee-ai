import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getReportCardPdfPayload } from "@/lib/academic/report-cards";

type ReportPayload = Awaited<ReturnType<typeof getReportCardPdfPayload>>;

Font.register({
  family: "NotoNaskhArabic",
  fonts: [
    { src: path.join(process.cwd(), "public", "fonts", "NotoNaskhArabic-Regular.ttf"), fontWeight: 400 },
    { src: path.join(process.cwd(), "public", "fonts", "NotoNaskhArabic-Bold.ttf"), fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    color: "#172033",
    fontFamily: "Helvetica",
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fbf0fe",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  headerInfo: {
    flex: 1,
    paddingLeft: 14,
  },
  eyebrow: {
    fontSize: 8,
    color: "#8127cf",
    fontWeight: 700,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  studentName: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1d1b20",
  },
  subline: {
    fontSize: 8,
    color: "#4d4354",
    marginTop: 4,
  },
  headerStats: {
    flexDirection: "row",
    alignItems: "center",
  },
  bigStat: {
    textAlign: "center",
    paddingLeft: 14,
  },
  bigValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#8127cf",
  },
  bigLabel: {
    fontSize: 7,
    color: "#4d4354",
    textTransform: "uppercase",
    fontWeight: 700,
    marginTop: 2,
  },
  statRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e8e0ec",
    borderRadius: 10,
    paddingVertical: 8,
    textAlign: "center",
    marginRight: 8,
  },
  statBoxLast: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e8e0ec",
    borderRadius: 10,
    paddingVertical: 8,
    textAlign: "center",
  },
  statValue: {
    fontSize: 11,
    fontWeight: 700,
    color: "#1d1b20",
  },
  statLabel: {
    fontSize: 7,
    color: "#4d4354",
    textTransform: "uppercase",
    fontWeight: 700,
    marginTop: 2,
  },
  section: {
    backgroundColor: "#fbf0fe",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#1d1b20",
    marginBottom: 8,
  },
  weightsLine: {
    fontSize: 8,
    color: "#4d4354",
    fontWeight: 600,
    marginBottom: 8,
  },
  subjectHeader: {
    fontSize: 10,
    fontWeight: 700,
    color: "#1d1b20",
    marginTop: 10,
    marginBottom: 6,
  },
  table: {
    borderWidth: 1,
    borderColor: "#e8e0ec",
    borderRadius: 8,
    marginBottom: 4,
    overflow: "hidden",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f9",
  },
  trLast: {
    flexDirection: "row",
  },
  th: {
    backgroundColor: "#f5eefb",
  },
  thText: {
    fontSize: 7,
    color: "#4d4354",
    textTransform: "uppercase",
    fontWeight: 700,
    padding: 6,
  },
  tdText: {
    fontSize: 8,
    paddingVertical: 6,
  },
  flexExam: {
    flex: 2.4,
    paddingLeft: 6,
  },
  flexCell: {
    flex: 1,
    textAlign: "center",
  },
  overallRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e8e0ec",
    borderRadius: 10,
    padding: 8,
    marginTop: 8,
  },
  overallLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#1d1b20",
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 8,
    fontWeight: 700,
    marginLeft: 6,
  },
  pillPass: {
    backgroundColor: "#e7f6ee",
    color: "#047857",
  },
  pillFail: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
  },
  pillPlain: {
    backgroundColor: "#fbf0fe",
    color: "#8127cf",
  },
  remarksBox: {
    borderWidth: 1,
    borderColor: "#e8e0ec",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  remarkLabel: {
    fontSize: 7,
    color: "#4d4354",
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 4,
  },
  remarkText: {
    fontSize: 9,
    lineHeight: 1.5,
    color: "#1d1b20",
  },
  urduText: {
    fontSize: 12,
    lineHeight: 1.7,
    fontFamily: "NotoNaskhArabic",
    color: "#1d1b20",
    direction: "rtl",
  },
  footer: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "flex-end",
    color: "#667085",
    fontSize: 9,
  },
});

function classLabel(payload: ReportPayload) {
  const cls = payload.reportCard.student.class;
  return [cls.name, cls.section].filter(Boolean).join(" - ");
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatBox({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? styles.statBoxLast : styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MarksDistribution({ payload }: { payload: ReportPayload }) {
  const { subjectDistribution, weightConfig, overall } = payload;
  const subjects = subjectDistribution.filter((s: any) => s.exams?.length);

  if (subjects.length === 0 && !overall) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Marks Distribution</Text>
      {weightConfig ? (
        <Text style={styles.weightsLine}>
          Weights — Quiz {weightConfig.quizWeight}% · Class Test {weightConfig.classTestWeight}% · Mid Term {weightConfig.midTermWeight}% · Final {weightConfig.finalWeight}%
        </Text>
      ) : null}

      {subjects.map((subject: any, i: number) => (
        <View key={subject.subjectId}>
          <Text style={[styles.subjectHeader, i === 0 ? { marginTop: 0 } : {}]}>{subject.subjectName}</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.thText, styles.flexExam]}>Exam</Text>
              <Text style={[styles.thText, styles.flexCell]}>Weight</Text>
              <Text style={[styles.thText, styles.flexCell]}>Marks</Text>
              <Text style={[styles.thText, styles.flexCell]}>%</Text>
              <Text style={[styles.thText, styles.flexCell]}>Contribution</Text>
            </View>
            {subject.exams.map((exam: any, j: number) => (
              <View key={exam.examId} style={j === subject.exams.length - 1 ? styles.trLast : styles.tr}>
                <Text style={[styles.tdText, styles.flexExam]}>{exam.examTitle}</Text>
                <Text style={[styles.tdText, styles.flexCell]}>{exam.weight}%</Text>
                <Text style={[styles.tdText, styles.flexCell]}>{exam.obtainedMarks}/{exam.totalMarks}</Text>
                <Text style={[styles.tdText, styles.flexCell]}>{exam.percentage}%</Text>
                <Text style={[styles.tdText, styles.flexCell]}>{Math.round((exam.contribution || 0) * 10) / 10}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {overall ? (
        <View style={styles.overallRow}>
          <Text style={styles.overallLabel}>Overall Weighted Result</Text>
          <View style={styles.pillRow}>
            <Text style={[styles.pill, styles.pillPlain]}>{overall.overallPercentage}%</Text>
            <Text style={[styles.pill, styles.pillPlain]}>{overall.overallGrade}</Text>
            <Text style={[styles.pill, overall.passed ? styles.pillPass : styles.pillFail]}>
              {overall.passed ? "PASS" : "FAIL"}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ReportCardDocument({ payload }: { payload: ReportPayload }) {
  const { reportCard, subjectDistribution, overall } = payload;
  const student = reportCard.student;
  const exam = reportCard.exam;
  const campus = reportCard.campus as any;
  const school = campus?.school;
  const logo = campus?.logoUrl || school?.logoUrl || null;
  const avatarUrl = student.profileImageUrl?.startsWith("http") ? student.profileImageUrl : null;
  const displayPercentage = overall ? overall.overallPercentage : Math.round(reportCard.percentage || 0);
  const displayGrade = overall ? overall.overallGrade : reportCard.grade || "—";

  const remarkSections: { label: string; value: string; urdu?: boolean }[] = [];
  if (reportCard.remarksEn) remarkSections.push({ label: "English", value: reportCard.remarksEn });
  if (reportCard.remarksUr) remarkSections.push({ label: "Urdu", value: reportCard.remarksUr, urdu: true });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* School/Campus branding header */}
        {logo ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 }}>
            <Image src={logo} style={{ width: 36, height: 36, borderRadius: 6 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: 700 }}>{campus?.name || ""}</Text>
              {school?.tagline ? <Text style={{ fontSize: 7, color: "#667085" }}>{school.tagline}</Text> : null}
              <Text style={{ fontSize: 7, color: "#667085" }}>
                {[campus?.city, campus?.address, campus?.phone || school?.phone, campus?.email || school?.contactEmail, campus?.website || school?.website].filter(Boolean).join(" | ")}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.headerCard}>
          {avatarUrl ? <Image src={avatarUrl} style={styles.avatar} /> : null}
          <View style={styles.headerInfo}>
            <Text style={styles.eyebrow}>{exam.title}{exam.term ? ` · ${exam.term}` : ""}</Text>
            <Text style={styles.studentName}>{student.fullName}</Text>
            <Text style={styles.subline}>
              {student.rollNo ? `Roll No: ${student.rollNo} · ` : ""}{classLabel(payload)}
            </Text>
            <Text style={styles.subline}>Generated {formatDate(reportCard.generatedAt)}</Text>
          </View>
          <View style={styles.headerStats}>
            <View style={styles.bigStat}>
              <Text style={styles.bigValue}>{displayPercentage}%</Text>
              <Text style={styles.bigLabel}>Percentage</Text>
            </View>
            <View style={styles.bigStat}>
              <Text style={styles.bigValue}>{displayGrade}</Text>
              <Text style={styles.bigLabel}>Grade</Text>
            </View>
          </View>
        </View>

        <View style={styles.statRow}>
          <StatBox label="Roll No" value={student.rollNo || "N/A"} />
          <StatBox label="Class" value={classLabel(payload)} />
          <StatBox label="Status" value={reportCard.status || "—"} />
          <StatBox label="Delivery" value={reportCard.deliveryStatus || "Pending"} last />
        </View>

        <View style={styles.statRow}>
          <StatBox label="Total Marks" value={String(reportCard.totalMarks ?? "—")} />
          <StatBox label="Obtained" value={String(reportCard.obtainedMarks ?? "—")} />
          <StatBox label="Percentage" value={`${displayPercentage}%`} />
          <StatBox label="Grade" value={displayGrade} last />
        </View>

        {subjectDistribution?.length || overall ? <MarksDistribution payload={payload} /> : null}

        {remarkSections.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Remarks</Text>
            {remarkSections.map((r) => (
              <View key={r.label} style={styles.remarksBox}>
                <Text style={styles.remarkLabel}>{r.label}</Text>
                <Text style={r.urdu ? styles.urduText : styles.remarkText}>{r.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text>Principal Signature: ____________________</Text>
        </View>
      </Page>
    </Document>
  );
}

function isS3Configured(): boolean {
  return !!(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

async function storeToS3(key: string, pdfBuffer: Buffer): Promise<string> {
  const { uploadPdf, getDownloadUrl } = await import("@/lib/storage/s3");
  await uploadPdf(key, pdfBuffer);
  return getDownloadUrl(key, 86400);
}

async function storeToLocalDisk(examId: string, filename: string, pdfBuffer: Buffer): Promise<string> {
  const dir = path.join(process.cwd(), "public", "generated", "reports", examId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), pdfBuffer);
  return `/generated/reports/${examId}/${filename}`;
}

export async function generateReportCardPdf(reportCardId: string) {
  const payload = await getReportCardPdfPayload(reportCardId);
  const pdfBuffer = await renderToBuffer(<ReportCardDocument payload={payload} />);
  const safeRollNo = payload.reportCard.student.rollNo.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const filename = `${safeRollNo || payload.reportCard.studentId}-${payload.reportCard.id}.pdf`;

  if (isS3Configured()) {
    const { reportCardKey } = await import("@/lib/storage/s3");
    const key = reportCardKey(
      payload.reportCard.campusId,
      payload.reportCard.examId,
      payload.reportCard.studentId
    );
    return storeToS3(key, pdfBuffer);
  }

  return storeToLocalDisk(payload.reportCard.examId, filename, pdfBuffer);
}
