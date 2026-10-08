import { reportMessages } from "@/lib/locale/report-messages";
const localeTag = (locale: { language: string; calendar: string; numberingSystem: string }) => `${locale.language}-u-ca-${locale.calendar}-nu-${locale.numberingSystem}`;
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import path from "path";
import { getReportCardPdfPayload } from "@/lib/academic/report-cards";

type ReportPayload = Awaited<ReturnType<typeof getReportCardPdfPayload>>;

for (const family of ["NotoNaskhArabic", "Report-en", "Report-ar", "Report-ur"]) Font.register({
  family,
  fonts: [
    { src: path.join(process.cwd(), "public", "fonts", "NotoNaskhArabic-Regular.ttf"), fontWeight: 400 },
    { src: path.join(process.cwd(), "public", "fonts", "NotoNaskhArabic-Bold.ttf"), fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 10,
    color: "#172033",
    fontFamily: "Helvetica",
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fbf0fe",
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
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
    fontSize: 18,
    fontWeight: 700,
    color: "#1d1b20",
  },
  subline: {
    fontSize: 8,
    color: "#4d4354",
    marginTop: 2,
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
    fontSize: 20,
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
    padding: 8,
    marginBottom: 6,
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
    marginTop: 12,
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


function StatBox({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[last ? styles.statBoxLast : styles.statBox, { marginRight: 0 }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MarksDistribution({ payload }: { payload: ReportPayload }) {
  const { subjectDistribution, weightConfig, overall, locale } = payload;
  const t = reportMessages[locale.language];
  const f = (n: number) => new Intl.NumberFormat(localeTag(locale)).format(n);
  const subjects = subjectDistribution.filter((s: any) => s.exams?.length);

  if (subjects.length === 0 && !overall) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t.distribution}</Text>
      {weightConfig ? (
        <View style={{ marginBottom: 10 }}>
          <Text style={styles.weightsLine}>{t.weights}</Text>
          <View style={{ flexDirection: locale.language !== "en" ? "row-reverse" : "row", gap: 12 }}>
            {[[t.quiz, weightConfig.quizWeight], [t.classTest, weightConfig.classTestWeight], [t.midTerm, weightConfig.midTermWeight], [t.final, weightConfig.finalWeight]].map(([label, weight]) => <View key={String(label)} style={{ flex: 1 }}><Text style={styles.weightsLine}>{label}</Text><Text>{f(Number(weight))}%</Text></View>)}
          </View>
        </View>
      ) : null}

      {subjects.map((subject: any, i: number) => (
        <View key={subject.subjectId}>
          <Text style={[styles.subjectHeader, i === 0 ? { marginTop: 0 } : {}]}>{subject.subjectName}</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.th, { flexDirection: locale.language !== "en" ? "row-reverse" : "row" }]}>
              <Text style={[styles.thText, styles.flexExam]}>{t.exam}</Text>
              <Text style={[styles.thText, styles.flexCell]}>{t.weight}</Text>
              <Text style={[styles.thText, styles.flexCell]}>{t.marks}</Text>
              <Text style={[styles.thText, styles.flexCell]}>%</Text>
              <Text style={[styles.thText, styles.flexCell]}>{t.contribution}</Text>
            </View>
            {subject.exams.map((exam: any, j: number) => (
              <View key={exam.examId} style={[j === subject.exams.length - 1 ? styles.trLast : styles.tr, { flexDirection: locale.language !== "en" ? "row-reverse" : "row" }]}>
                <Text style={[styles.tdText, styles.flexExam]}>{exam.examTitle}</Text>
                <Text style={[styles.tdText, styles.flexCell]}>{f(exam.weight)}%</Text>
                <Text style={[styles.tdText, styles.flexCell]}>{f(exam.obtainedMarks)}/{f(exam.totalMarks)}</Text>
                <Text style={[styles.tdText, styles.flexCell]}>{f(exam.percentage)}%</Text>
                <Text style={[styles.tdText, styles.flexCell]}>{f(Math.round((exam.contribution || 0) * 10) / 10)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {overall ? (
        <View style={styles.overallRow}>
          <Text style={styles.overallLabel}>{t.overall}</Text>
          <View style={styles.pillRow}>
            <Text style={[styles.pill, styles.pillPlain]}>{f(overall.overallPercentage)}%</Text>
            <Text style={[styles.pill, styles.pillPlain]}>{overall.overallGrade}</Text>
            <Text style={[styles.pill, overall.passed ? styles.pillPass : styles.pillFail]}>
              {overall.passed ? t.pass : t.fail}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function ReportCardDocument({ payload }: { payload: ReportPayload }) {
  const { reportCard, subjectDistribution, overall, locale } = payload;
  const t = reportMessages[locale.language];
  const f = (n: number) => new Intl.NumberFormat(localeTag(locale)).format(n);
  const state = (value: string) => value === "APPROVED" ? (locale.language === "ar" ? "معتمد" : locale.language === "ur" ? "منظور شدہ" : "Approved") : t[value as keyof typeof t] || value;
  const student = reportCard.student;
  const exam = reportCard.exam;
  const campus = reportCard.campus as any;
  const school = campus?.school;
  const logo = campus?.logoUrl || school?.logoUrl || null;
  const avatarUrl = student.profileImageUrl?.startsWith("http") ? student.profileImageUrl : null;
  const displayPercentage = reportCard.percentage || 0;
  const displayGrade = reportCard.grade || "—";

  const remarkSections: { label: string; value: string; urdu?: boolean }[] = [];
  if (locale.language === "en" && reportCard.remarksEn) remarkSections.push({ label: t.english, value: reportCard.remarksEn });
  if (locale.language === "ur" && reportCard.remarksUr) remarkSections.push({ label: t.urdu, value: reportCard.remarksUr, urdu: true });

  if (locale.language === "ar" && reportCard.remarksAr) remarkSections.push({ label: "العربية", value: reportCard.remarksAr, urdu: true });

  return (
    <Document language={locale.language}>
      <Page size="A4" style={[styles.page, { fontFamily: `Report-${locale.language}`, direction: locale.language !== "en" ? "rtl" : "ltr", textAlign: locale.language !== "en" ? "right" : "left" }]}>
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

        <View style={[styles.headerCard, { flexDirection: locale.language !== "en" ? "row-reverse" : "row" }]}>
          {avatarUrl ? <Image src={avatarUrl} style={styles.avatar} /> : null}
          <View style={styles.headerInfo}>
            <Text style={styles.eyebrow}>{exam.title}{exam.term ? ` · ${exam.term}` : ""}</Text>
            <Text style={styles.studentName}>{student.fullName}</Text>
            <Text style={styles.subline}>
              {student.rollNo ? `${t.roll}: ${student.rollNo} · ` : ""}{classLabel(payload)}
            </Text>
            <Text style={styles.subline}>{locale.language === "ar" ? "النسخة" : locale.language === "ur" ? "نسخہ" : "Version"} {payload.versionInfo.number}</Text>
            <Text style={[styles.subline, { direction: "ltr" }]}>{payload.versionInfo.documentIdentity}</Text>
            {payload.versionInfo.correctionReason && <Text style={styles.subline}>{locale.language === "ar" ? "تصحيح:" : locale.language === "ur" ? "تصحیح:" : "Correction:"} {payload.versionInfo.correctionReason}</Text>}
            <Text style={styles.subline}>{t.generated}</Text>
            <Text style={[styles.subline, { direction: "ltr" }]}>{new Intl.DateTimeFormat(localeTag(locale), { timeZone: locale.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(reportCard.generatedAt))}</Text>
            <Text style={styles.subline}>{new Intl.DateTimeFormat(localeTag(locale), { timeZone: locale.timezone, dateStyle: "long" }).format(new Date(reportCard.generatedAt))}</Text>
          </View>
          <View style={styles.headerStats}>
            <View style={styles.bigStat}>
              <Text style={styles.bigValue}>{f(displayPercentage)}%</Text>
              <Text style={styles.bigLabel}>{t.percentage}</Text>
            </View>
            <View style={styles.bigStat}>
              <Text style={styles.bigValue}>{displayGrade}</Text>
              <Text style={styles.bigLabel}>{t.grade}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.statRow, { gap: 8, flexDirection: locale.language !== "en" ? "row-reverse" : "row" }]}>
          <StatBox label={t.roll} value={student.rollNo || t.unavailable} />
          <StatBox label={t.class} value={classLabel(payload)} />
          <StatBox label={t.status} value={state(reportCard.status || "—")} />
          <StatBox label={t.delivery} value={state(reportCard.deliveryStatus || "PENDING")} last />
        </View>

        <View style={[styles.statRow, { gap: 8, flexDirection: locale.language !== "en" ? "row-reverse" : "row" }]}>
          <StatBox label={t.total} value={f(reportCard.totalMarks)} />
          <StatBox label={t.obtained} value={f(reportCard.obtainedMarks)} />
          <StatBox label={t.percentage} value={`${f(displayPercentage)}%`} />
          <StatBox label={t.grade} value={displayGrade} last />
        </View>

        {subjectDistribution?.length || overall ? <MarksDistribution payload={payload} /> : null}

        {remarkSections.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.remarks}</Text>
            {remarkSections.map((r) => (
              <View key={r.label} style={styles.remarksBox}>
                <Text style={styles.remarkLabel}>{r.label}</Text>
                <Text style={r.urdu ? styles.urduText : [styles.remarkText, { direction: "ltr", textAlign: "left", fontFamily: "Helvetica" }]}>{r.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text>{t.signature}: ____________________</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Capture bytes once, as part of approval. No family download reads mutable live data. */
export async function renderApprovedSnapshot(payload: ReportPayload) {
  return renderToBuffer(<ReportCardDocument payload={payload} />);
}

export async function renderReportCardPdfBuffer(reportCardId: string, versionId?: string): Promise<{ buffer: Buffer; filename: string }> {
  const { getArtifactVersion } = await import("./report-versions");
  const version = await getArtifactVersion(reportCardId, versionId);
  if (!version.documentBytes) throw new Error("The approved PDF artifact is unavailable");
  return { buffer: Buffer.from(version.documentBytes), filename: `${version.documentIdentity}-v${version.number}.pdf` };
}

export async function generateReportCardPdf(reportCardId: string): Promise<string | null> {
  const { getArtifactVersion } = await import("./report-versions");
  const v = await getArtifactVersion(reportCardId);
  return `/api/reports/download?reportCardId=${reportCardId}&versionId=${v.id}&redirect=1`;
}
