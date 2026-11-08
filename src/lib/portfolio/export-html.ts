import type { Language } from "@/lib/locale/package";

// SKO-427: an accessible, text-only evidence collection. SKAI-1754: rendered in
// the account display language and direction, matching the on-screen portfolio.
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type ExportSource = { title: string; version: number; assignmentVersion: number; rubricVersion: number; receiptCode: string; submittedAt: string | Date; text: string; file: { name: string } | null; feedback: { comment: string; returnedAt: string | Date | null; criteria: { title: string; points: number | null; maxPoints: number; comment: string }[] } | null } | null | undefined;
export type ExportEntry = { title: string; goal: { code?: string; title?: string } | null; status: string; reflection: string | null; teacherComment: string | null; earlier: ExportSource; later: ExportSource; comparison: { comparable: boolean } | null };

type Copy = {
  portfolio: string; generated: (d: string) => string; reviewedOnly: string; goal: string; noGoal: string; earlier: string; later: string;
  unavailable: string; version: (v: number, a: number, r: number) => string; receipt: string; submitted: string; file: (n: string) => string;
  feedback: string; of: string; note: string; rubricChanged: string; reflection: string; teacherComment: string;
};

const COPY: Record<Language, Copy> = {
  en: {
    portfolio: "Learning portfolio", generated: d => `generated ${d}`, reviewedOnly: "Only reviewed entries are included.", goal: "Learning goal", noGoal: "not linked to an objective",
    earlier: "Earlier work", later: "Later work", unavailable: "this work is no longer available.",
    version: (v, a, r) => `Version ${v} (assignment version ${a}, rubric version ${r})`, receipt: "receipt", submitted: "submitted", file: n => `Attached file: ${n} (kept in the school's records)`,
    feedback: "Returned feedback", of: "of", note: "Note", rubricChanged: "the rubric changed between these pieces of work, so their criteria are not compared directly.",
    reflection: "Reflection", teacherComment: "Teacher comment",
  },
  ar: {
    portfolio: "ملف التعلم", generated: d => `أُنشئ في ${d}`, reviewedOnly: "يتضمن هذا الملف المدخلات المراجَعة فقط.", goal: "هدف التعلم", noGoal: "غير مرتبط بهدف",
    earlier: "عمل سابق", later: "عمل لاحق", unavailable: "هذا العمل لم يعد متاحًا.",
    version: (v, a, r) => `الإصدار ${v} (إصدار الواجب ${a}، إصدار معايير التقييم ${r})`, receipt: "الإيصال", submitted: "سُلِّم في", file: n => `ملف مرفق: ${n} (محفوظ في سجلات المدرسة)`,
    feedback: "الملاحظات المُعادة", of: "من", note: "ملاحظة", rubricChanged: "تغيّرت معايير التقييم بين هذين العملين، لذا لا تُقارَن المعايير مباشرة.",
    reflection: "التأمل", teacherComment: "تعليق المعلم",
  },
  ur: {
    portfolio: "تعلیمی پورٹ فولیو", generated: d => `${d} کو تیار کیا گیا`, reviewedOnly: "صرف جائزہ شدہ اندراجات شامل ہیں۔", goal: "تعلیمی ہدف", noGoal: "کسی مقصد سے منسلک نہیں",
    earlier: "پہلے کا کام", later: "بعد کا کام", unavailable: "یہ کام اب دستیاب نہیں ہے۔",
    version: (v, a, r) => `ورژن ${v} (اسائنمنٹ ورژن ${a}، روبرک ورژن ${r})`, receipt: "رسید", submitted: "جمع کرایا گیا", file: n => `منسلک فائل: ${n} (اسکول کے ریکارڈ میں محفوظ)`,
    feedback: "واپس کی گئی رائے", of: "میں سے", note: "نوٹ", rubricChanged: "ان کاموں کے درمیان روبرک بدل گیا، اس لیے ان کے معیارات کا براہِ راست موازنہ نہیں کیا جاتا۔",
    reflection: "غور و فکر", teacherComment: "استاد کا تبصرہ",
  },
};

export function renderPortfolioExport(data: { title: string | null; learner: string; entries: ExportEntry[] }, language: Language, now = new Date()): string {
  const c = COPY[language] ?? COPY.en;
  const dir = language === "en" ? "ltr" : "rtl";
  const fmt = new Intl.DateTimeFormat(language, { dateStyle: "medium" });
  const day = (d: string | Date | null | undefined) => (d ? esc(fmt.format(new Date(d))) : "");
  const source = (label: string, s: ExportSource) => !s
    ? `<p><strong>${esc(label)}:</strong> ${esc(c.unavailable)}</p>`
    : `<section><h3>${esc(label)}: ${esc(s.title)}</h3><p>${esc(c.version(s.version, s.assignmentVersion, s.rubricVersion))} · ${esc(c.receipt)} ${esc(s.receiptCode)} · ${esc(c.submitted)} ${day(s.submittedAt)}</p>${s.text ? `<blockquote>${esc(s.text)}</blockquote>` : ""}${s.file ? `<p>${esc(c.file(s.file.name))}</p>` : ""}${s.feedback ? `<h4>${esc(c.feedback)} (${day(s.feedback.returnedAt)})</h4><p>${esc(s.feedback.comment)}</p><ul>${s.feedback.criteria.map(k => `<li>${esc(k.title)}: ${k.points ?? "—"} ${esc(c.of)} ${k.maxPoints}${k.comment ? ` — ${esc(k.comment)}` : ""}</li>`).join("")}</ul>` : ""}</section>`;
  const title = data.title ?? c.portfolio;
  return `<!doctype html><html lang="${language}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)} — ${esc(data.learner)}</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}blockquote{border-inline-start:3px solid #ccc;margin:0;padding-inline-start:1rem;white-space:pre-wrap}</style></head><body><h1>${esc(title)}</h1><p>${esc(data.learner)} · ${esc(c.generated(fmt.format(now)))} ${esc(c.reviewedOnly)}</p>${data.entries.map(e => `<article><h2>${esc(e.title)}</h2><p>${esc(c.goal)}: ${e.goal?.title ? `${esc(e.goal.code)} ${esc(e.goal.title)}` : esc(c.noGoal)}</p>${source(c.earlier, e.earlier)}${e.later !== undefined ? source(c.later, e.later) : ""}${e.comparison && !e.comparison.comparable ? `<p><strong>${esc(c.note)}:</strong> ${esc(c.rubricChanged)}</p>` : ""}<h3>${esc(c.reflection)}</h3><p>${esc(e.reflection ?? "")}</p>${e.teacherComment ? `<h3>${esc(c.teacherComment)}</h3><p>${esc(e.teacherComment)}</p>` : ""}</article>`).join("")}</body></html>`;
}
