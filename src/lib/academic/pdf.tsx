import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getReportCardPdfPayload } from "@/lib/academic/report-cards";

type ReportPayload = Awaited<ReturnType<typeof getReportCardPdfPayload>>;

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    color: "#172033",
    fontFamily: "Helvetica",
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#d7dde8",
    paddingBottom: 14,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 6,
  },
  headerText: {
    flex: 1,
  },
  schoolName: {
    fontSize: 20,
    fontWeight: 700,
  },
  muted: {
    color: "#667085",
  },
  title: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: 700,
  },
  grid: {
    flexDirection: "row",
    marginBottom: 14,
  },
  panel: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d7dde8",
    borderRadius: 6,
    padding: 10,
    marginRight: 12,
  },
  label: {
    color: "#667085",
    fontSize: 8,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  value: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: "#d7dde8",
    borderRadius: 6,
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e8ecf3",
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  th: {
    backgroundColor: "#f3f6fb",
    fontWeight: 700,
  },
  cell: {
    padding: 8,
  },
  subjectCell: {
    flex: 2,
  },
  numberCell: {
    flex: 1,
    textAlign: "right",
  },
  remarks: {
    borderWidth: 1,
    borderColor: "#d7dde8",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  remarkText: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  footer: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#667085",
    fontSize: 8,
  },
});

function classLabel(payload: ReportPayload) {
  const cls = payload.reportCard.student.class;
  return [cls.name, cls.section].filter(Boolean).join(" - ");
}

function ReportCardDocument({ payload }: { payload: ReportPayload }) {
  const { reportCard, marks } = payload;
  const attendance = reportCard.attendanceTotal
    ? `${reportCard.attendancePresent}/${reportCard.attendanceTotal}`
    : "Not recorded";
  const logoUrl = reportCard.campus.logoUrl;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
            <View style={styles.headerText}>
              <Text style={styles.schoolName}>{reportCard.campus.name}</Text>
              <Text style={styles.muted}>
                {[reportCard.campus.board, reportCard.campus.city, reportCard.campus.phone].filter(Boolean).join(" | ")}
              </Text>
            </View>
          </View>
          <Text style={styles.title}>
            Report Card - {reportCard.exam.title} ({reportCard.exam.term} {reportCard.exam.academicYear})
          </Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.panel}>
            <Text style={styles.label}>Student</Text>
            <Text style={styles.value}>{reportCard.student.fullName}</Text>
            <Text style={styles.label}>Roll No</Text>
            <Text style={styles.value}>{reportCard.student.rollNo}</Text>
            <Text style={styles.label}>Class</Text>
            <Text style={styles.value}>{classLabel(payload)}</Text>
          </View>
          <View style={styles.panel}>
            <Text style={styles.label}>Total</Text>
            <Text style={styles.value}>
              {reportCard.obtainedMarks}/{reportCard.totalMarks}
            </Text>
            <Text style={styles.label}>Percentage</Text>
            <Text style={styles.value}>{reportCard.percentage.toFixed(1)}%</Text>
            <Text style={styles.label}>Grade / Rank / Attendance</Text>
            <Text style={styles.value}>
              {reportCard.grade || "-"} / {reportCard.rank || "-"} / {attendance}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.th]}>
            <Text style={[styles.cell, styles.subjectCell]}>Subject</Text>
            <Text style={[styles.cell, styles.numberCell]}>Marks</Text>
            <Text style={[styles.cell, styles.numberCell]}>Grade</Text>
          </View>
          {marks.map((mark, index) => {
            const rowStyle = index === marks.length - 1 ? [styles.row, styles.lastRow] : styles.row;
            return (
              <View key={mark.subject} style={rowStyle}>
                <Text style={[styles.cell, styles.subjectCell]}>{mark.subject}</Text>
                <Text style={[styles.cell, styles.numberCell]}>
                  {mark.obtained}/{mark.total}
                </Text>
                <Text style={[styles.cell, styles.numberCell]}>{mark.grade}</Text>
              </View>
            );
          })}
        </View>

        {reportCard.remarksEn ? (
          <View style={styles.remarks}>
            <Text style={styles.label}>Principal Approved Remarks</Text>
            <Text style={styles.remarkText}>{reportCard.remarksEn}</Text>
          </View>
        ) : null}

        {reportCard.remarksUr ? (
          <View style={styles.remarks}>
            <Text style={styles.label}>Urdu Remarks</Text>
            <Text style={styles.remarkText}>{reportCard.remarksUr}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text>Generated by SkooleeAI</Text>
          <Text>Principal signature: ____________________</Text>
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
