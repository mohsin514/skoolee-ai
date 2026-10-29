import { reportMessages } from "@/lib/locale/report-messages";

/**
 * SKAI-1151: UAE report-card template. Every UAE regulator (KHDA, ADEK, SPEA,
 * MOE) expects Arabic Language and Islamic Education on the card and a
 * bilingual (EN+AR) print. A per-school setting turns it on; it is captured
 * in the approved snapshot so a published PDF never changes after the fact.
 */
export const UAE_MANDATORY_SUBJECTS = [
  { key: "arabic", en: "Arabic Language", ar: "اللغة العربية", match: /arabic|عرب/i },
  { key: "islamic", en: "Islamic Education", ar: "التربية الإسلامية", match: /islam|إسلام/i },
] as const;

export type UaeMandatoryKey = (typeof UAE_MANDATORY_SUBJECTS)[number]["key"];

export interface UaeMandatoryRow {
  key: UaeMandatoryKey;
  en: string;
  ar: string;
  subjectName: string | null;
  obtained: number | null;
  total: number | null;
  grade: string | null;
  assessed: boolean;
}

export interface UaeTemplate {
  mandatory: UaeMandatoryRow[];
  /** Keys of mandatory subjects with no assessed mark on this report. */
  missing: UaeMandatoryKey[];
}

type MarkLike = { subject: string; obtained: number; total: number; grade: string; isAbsent?: boolean; isExempt?: boolean };

export function mandatoryKeyFor(subjectName: string): UaeMandatoryKey | null {
  return UAE_MANDATORY_SUBJECTS.find((s) => s.match.test(subjectName))?.key ?? null;
}

export function buildUaeTemplate(marks: MarkLike[]): UaeTemplate {
  const mandatory = UAE_MANDATORY_SUBJECTS.map(({ key, en, ar }) => {
    const mark = marks.find((m) => mandatoryKeyFor(m.subject) === key);
    const assessed = Boolean(mark && !mark.isAbsent && !mark.isExempt);
    return {
      key, en, ar,
      subjectName: mark?.subject ?? null,
      obtained: mark ? mark.obtained : null,
      total: mark ? mark.total : null,
      grade: mark ? mark.grade : null,
      assessed,
    };
  });
  return { mandatory, missing: mandatory.filter((m) => !m.assessed).map((m) => m.key) };
}

/** Mandatory subjects print first (Arabic, then Islamic Education); the rest keep their order. */
export function orderMandatoryFirst<T extends { subjectName?: string }>(subjects: T[]): T[] {
  const rank = (s: T) => {
    const key = mandatoryKeyFor(s.subjectName || "");
    return key ? UAE_MANDATORY_SUBJECTS.findIndex((m) => m.key === key) : UAE_MANDATORY_SUBJECTS.length;
  };
  return subjects.map((s, i) => [s, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([s]) => s);
}

type ReportKey = keyof typeof reportMessages.en;

/** "English · العربية" label for the bilingual print, whatever the report language. */
export function bilingualLabel(key: ReportKey): string {
  const en = reportMessages.en[key], ar = reportMessages.ar[key];
  return en === ar ? en : `${en} · ${ar}`;
}

export const UAE_LABELS = {
  title: "Mandatory subjects · المواد الإلزامية",
  notAssessed: "Not assessed · لم يُقيَّم",
  englishRemarks: "English · الإنجليزية",
  arabicRemarks: "Arabic · العربية",
} as const;
