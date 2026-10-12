import { candidatePaper, paperDataSchema, type AssessmentLocale, type PaperData } from "./assessment";

const copy: Record<AssessmentLocale, { paper: string; name: string; roll: string; duration: string; marks: string; version: string; answer: string; of: string; page: string; end: string }> = {
  en: { paper: "Candidate paper", name: "Name", roll: "Roll number", duration: "Minutes", marks: "Marks", version: "Approved version", answer: "Answer", of: "of", page: "Page", end: "End of paper" },
  ar: { paper: "ورقة الطالب", name: "الاسم", roll: "رقم الطالب", duration: "دقيقة", marks: "الدرجات", version: "الإصدار المعتمد", answer: "أجب عن", of: "من", page: "صفحة", end: "نهاية الورقة" },
  ur: { paper: "طالب علم کا پرچہ", name: "نام", roll: "رول نمبر", duration: "منٹ", marks: "نمبر", version: "منظور شدہ نسخہ", answer: "حل کریں", of: "میں سے", page: "صفحہ", end: "پرچہ ختم ہوا" },
};
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** One key-free projection feeds both online and print. Never serialize the authoring object into HTML. */
export function buildCandidatePaperHtml(raw: PaperData, version: number): string {
  const paper = paperDataSchema.parse(raw);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("INVALID_APPROVED_PAPER_VERSION");
  const projection = candidatePaper(paper), c = copy[paper.language];
  const num = (value: number) => new Intl.NumberFormat(paper.language, { maximumFractionDigits: 2 }).format(value);
  let questionNumber = 0;
  const sections = projection.sections.map(section => {
    const questions = projection.questions.filter(question => question.sectionId === section.id);
    return `<section class="section"><header class="section-heading"><h2 dir="auto">${escape(section.title)}</h2><p>${escape(c.answer)} <b>${num(section.answerCount)}</b> ${escape(c.of)} ${num(section.questionCount)} · ${num(section.marksPerQuestion)} ${escape(c.marks)}</p></header>${questions.map(question => {
      questionNumber++;
      // Very long prompts must be allowed to flow to the next page. Small
      // questions stay together; answer lines remain individually breakable.
      const short = question.prompt.length + question.options.reduce((sum, option) => sum + option.text.length, 0) < 1200;
      return `<article class="question${short ? " short-question" : ""}" data-question-number="${questionNumber}"><div class="question-heading"><b class="question-number">${num(questionNumber)}.</b><p class="prompt" dir="auto">${escape(question.prompt)}</p><span class="question-marks">[${num(question.marks)}]</span></div>${question.options.length ? `<ol class="options">${question.options.map(option => `<li dir="auto">${escape(option.text)}</li>`).join("")}</ol>` : `<div class="answer-space" aria-hidden="true">${Array.from({ length: question.type === "EXTENDED_TEXT" ? 8 : 3 }, () => '<div class="answer-line"></div>').join("")}</div>`}${questionNumber === projection.questions.length ? `<footer class="ending">${c.end}</footer>` : ""}</article>`;
    }).join("")}</section>`;
  }).join("");
  return `<!doctype html><html lang="${paper.language}" dir="${paper.language === "en" ? "ltr" : "rtl"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(projection.title)}</title><style>
@page { size: A4; margin: 17mm 16mm 19mm; @bottom-center { content: "${c.page} " counter(page) " / " counter(pages); font: 9pt sans-serif; color: #555; } }
* { box-sizing: border-box; }
html { color-scheme: light; }
body { margin: 0 auto; padding: 32px; max-width: 850px; color: #151b25; background: #fff; font: 11pt/1.65 system-ui, "Noto Naskh Arabic", "Geeza Pro", serif; overflow-wrap: anywhere; }
html[lang="ur"] body { line-height: 1.95; }
h1,h2,p { margin: 0; }
.masthead { border-bottom: 2px solid #182b42; padding-bottom: 16px; margin-bottom: 20px; }
.eyebrow { font-size: 9pt; letter-spacing: .04em; color: #4d5967; }
h1 { font-size: 22pt; line-height: 1.3; margin: 8px 0 12px; }
.metadata { display: flex; gap: 20px; flex-wrap: wrap; font-size: 10pt; }
.identity { display: flex; flex-wrap: wrap; gap: 24px; margin: 20px 0; }
.identity span { flex: 1; min-width: 180px; border-bottom: 1px solid #89909a; padding-bottom: 8px; }
.instructions { white-space: pre-wrap; margin-bottom: 20px; orphans: 3; widows: 3; }
.section-heading { border-block: 1px solid #87919d; padding: 8px 0; margin: 22px 0 15px; break-after: avoid; }
h2 { font-size: 14pt; }
html[dir="rtl"] h2 { text-align: right; }
.section:last-of-type { break-after: avoid; }
.section-heading p { font-size: 10pt; }
.question { margin-bottom: 18px; }
.short-question { break-inside: avoid; }
.question-heading { display: block; position: relative; padding-inline-start: 28px; padding-inline-end: 40px; }
.question-number { position: absolute; inset-inline-start: 0; top: 0; }
.question-marks { position: absolute; inset-inline-end: 0; top: 0; white-space: nowrap; font-size: 10pt; }
.prompt { white-space: pre-wrap; orphans: 3; widows: 3; }
.options { margin: 8px 0 0; padding-inline-start: 52px; list-style-type: upper-alpha; }
.options li { padding-inline-start: 3px; white-space: pre-wrap; break-inside: avoid; }
.answer-space { margin-inline-start: 28px; }
.answer-line { height: 24px; border-bottom: .5px solid #afb6bf; break-inside: avoid; }
.ending { text-align: center; border-top: 1px solid #87919d; padding-top: 12px; margin-top: 24px; font-size: 9pt; break-inside: avoid; break-before: avoid; }
@media print { body { padding: 0; max-width: none; } }
@media screen and (max-width: 500px) { body { padding: 16px; } h1 { font-size: 18pt; } .metadata { gap: 10px; } }
</style></head><body><header class="masthead"><p class="eyebrow">${c.paper}</p><h1 dir="auto">${escape(projection.title)}</h1><div class="metadata"><span>${num(projection.durationMinutes)} ${c.duration}</span><span>${c.marks}: ${num(projection.totalMarks)}</span><span>${c.version}: ${num(version)}</span></div></header><div class="identity"><span>${c.name}:</span><span>${c.roll}:</span></div>${projection.instructions ? `<p class="instructions" dir="auto">${escape(projection.instructions)}</p>` : ""}${sections}</body></html>`;
}
