import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildUaeTemplate, bilingualLabel, mandatoryKeyFor, orderMandatoryFirst } from "@/lib/academic/uae-report-template";
import { ReportCardDocument } from "@/lib/academic/pdf";

test("mandatory subjects are recognised in English and Arabic names", () => {
  assert.equal(mandatoryKeyFor("Arabic Language"), "arabic");
  assert.equal(mandatoryKeyFor("اللغة العربية"), "arabic");
  assert.equal(mandatoryKeyFor("Islamic Studies"), "islamic");
  assert.equal(mandatoryKeyFor("التربية الإسلامية"), "islamic");
  assert.equal(mandatoryKeyFor("Mathematics"), null);
});

test("a missing, absent or exempt mandatory subject is flagged not assessed", () => {
  const t = buildUaeTemplate([
    { subject: "Arabic", obtained: 0, total: 100, grade: "ABS", isAbsent: true },
    { subject: "Maths", obtained: 90, total: 100, grade: "A+" },
  ]);
  assert.deepEqual(t.missing, ["arabic", "islamic"]);
  const ok = buildUaeTemplate([
    { subject: "Arabic", obtained: 81, total: 100, grade: "A" },
    { subject: "Islamic Education", obtained: 77, total: 100, grade: "B+" },
  ]);
  assert.deepEqual(ok.missing, []);
  assert.equal(ok.mandatory[1].grade, "B+");
});

test("mandatory subjects print first and others keep their order", () => {
  const order = orderMandatoryFirst([{ subjectName: "English" }, { subjectName: "Islamic Education" }, { subjectName: "Maths" }, { subjectName: "Arabic" }]);
  assert.deepEqual(order.map((s) => s.subjectName), ["Arabic", "Islamic Education", "English", "Maths"]);
});

test("bilingual labels pair English with Arabic", () => {
  assert.equal(bilingualLabel("grade"), "Grade · التقدير");
});

function payload(uae: boolean, language: "en" | "ar" = "en") {
  const marks = [
    { subject: "Arabic Language", obtained: 84, total: 100, grade: "A" },
    { subject: "Islamic Education", obtained: 79, total: 100, grade: "B+" },
    { subject: "Mathematics", obtained: 91, total: 100, grade: "A+" },
  ];
  return {
    locale: { language, timezone: "Asia/Dubai", calendar: "gregory", numberingSystem: "latn" },
    reportCard: {
      percentage: 84.7, grade: "A", totalMarks: 300, obtainedMarks: 254, status: "PUBLISHED", deliveryStatus: "NOT_SENT",
      remarksEn: "Steady progress across all subjects.", remarksAr: "تقدّم ثابت في جميع المواد.", remarksUr: null,
      generatedAt: new Date("2026-10-29T08:00:00Z"),
      student: { fullName: "QA Student", rollNo: "QA-01", profileImageUrl: null, class: { name: "Grade 5", section: "A" } },
      exam: { title: "Term 1", term: "T1" },
      campus: { name: "QA Campus", school: { name: "QA School" } },
    },
    weightConfig: null, overall: null,
    subjectDistribution: [],
    marks,
    uaeTemplate: uae ? buildUaeTemplate(marks) : null,
    versionInfo: { number: 1, documentIdentity: "RC-QA-01", correctionReason: null, predecessorId: null },
  } as any;
}

test("the bilingual PDF renders with the template on and off", async () => {
  for (const [uae, lang] of [[true, "en"], [true, "ar"], [false, "en"]] as const) {
    const buf = await renderToBuffer(createElement(ReportCardDocument, { payload: payload(uae, lang) }) as any);
    assert.ok(buf.length > 1000);
    assert.equal(buf.subarray(0, 4).toString(), "%PDF");
    if (process.env.UAE_PDF_OUT) (await import("node:fs")).writeFileSync(`${process.env.UAE_PDF_OUT}/report-${uae ? "uae" : "plain"}-${lang}.pdf`, buf);
  }
});
