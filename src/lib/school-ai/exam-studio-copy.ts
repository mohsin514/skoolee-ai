import type { Language } from "@/lib/locale/package";
import { STUDIO_SHELL_COPY } from "./exam-studio-copy-shell";
import { STUDIO_SPACES_COPY } from "./exam-studio-copy-spaces";
import { STUDIO_EVIDENCE_COPY } from "./exam-studio-copy-evidence";

/**
 * Exam Studio interface copy — shared index (R22.1, R22.8, R22.9).
 *
 * **Placement.** This module sits under `src/lib/school-ai/` rather than beside the older
 * `src/components/school-ai/assessment-copy.ts` and `exam-copy.ts`, following the design's module
 * table. Exam Studio copy is read from paths that cannot import a `"use client"` module — the
 * server-rendered print output and the candidate receipt of R22.6 and R22.10 — and from the pure
 * domain tests run by `npm run test:school-ai`. `src/lib/school-ai/copy.ts` and `revision-copy.ts`
 * already live here for the same reason. Only resolved strings cross into components.
 *
 * **Per-area convention.** Each later UI task owns its own file, so no two tasks edit one copy table:
 *
 * ```ts
 * // src/lib/school-ai/exam-studio-copy-brief.ts
 * const en = { heading: "Assessment brief", remaining: "{0} of {1} decisions left" };
 * type Copy = typeof en;                        // a missing locale key is a TypeScript error
 * const ar: Copy = { heading: "…", remaining: "{0} من {1} قرارات متبقية" };
 * const ur: Copy = { heading: "…", remaining: "{1} میں سے {0} فیصلے باقی" };
 * export const BRIEF_COPY: StudioCopyArea<Copy> = { area: "brief", en, ar, ur };
 * export const briefCopy = (language: Language) => pickStudioCopy(BRIEF_COPY, language);
 * ```
 *
 * The task then adds one line here: re-export the module and append its area to
 * `EXAM_STUDIO_COPY_AREAS`. `tests/school-ai/exam-studio-copy.test.ts` and Property 37 enumerate
 * every key through that registry, so neither test is edited when an area is added.
 *
 * **Rendering.** A component resolves its table once from `useLocale().language`
 * (`src/components/locale/LocaleProvider.tsx`) and composes a message with `useUiText()` or
 * `<UiText>`, which fills `{0}`, `{1}` … in place. Placeholders are numbered and never concatenated,
 * so Arabic and Urdu may reorder the parts (R22.9). `fillStudioCopy` performs the same substitution
 * on the server-rendered paths, where no hook is available.
 */

/** One area's table: plain string values keyed by message name. */
export type StudioCopyTable = Record<string, string>;

/** An area contributes all three languages together, so a missing translation cannot ship (R22.8). */
export type StudioCopyArea<T extends StudioCopyTable = StudioCopyTable> = { readonly area: string; readonly en: T; readonly ar: T; readonly ur: T };

export function pickStudioCopy<T extends StudioCopyTable>(copy: StudioCopyArea<T>, language: Language): T {
  return language === "ar" ? copy.ar : language === "ur" ? copy.ur : copy.en;
}

/** Numbered-placeholder substitution identical to `useUiText`, for server-rendered copy with no hook available. */
export function fillStudioCopy(template: string, values: readonly unknown[] = []): string {
  return template.replace(/\{(\d+)\}/g, (match, index) => Number(index) in values ? String(values[Number(index)]) : match);
}

/**
 * The single status vocabulary (R21.1). Ordered and frozen: `studio-status.tsx` renders each token as
 * a word and an icon as well as a colour, so no state is conveyed by colour alone (R23.9).
 */
export const STUDIO_STATUS_TOKENS = ["DRAFT", "NEEDS_SOURCE", "NEEDS_CORRECTION", "READY_FOR_REVIEW", "APPROVED", "CHANGED_AFTER_APPROVAL", "STALE", "BLOCKING", "ADVISORY", "SEALED", "SAVED", "SAVING", "UNSAVED", "SAVE_FAILED", "GATE_OPEN", "NOT_MEASURED"] as const;
export type StudioStatusToken = typeof STUDIO_STATUS_TOKENS[number];

/** `NOT_MEASURED` is the exact text R1.5 requires in place of an unmeasured figure. */
const en: Record<StudioStatusToken, string> = {
  DRAFT: "Draft", NEEDS_SOURCE: "Needs a source", NEEDS_CORRECTION: "Needs correction", READY_FOR_REVIEW: "Ready for review", APPROVED: "Approved", CHANGED_AFTER_APPROVAL: "Changed after approval", STALE: "Out of date", BLOCKING: "Blocking", ADVISORY: "Advisory", SEALED: "Sealed", SAVED: "Saved", SAVING: "Saving…", UNSAVED: "Unsaved changes", SAVE_FAILED: "Save failed", GATE_OPEN: "Release gate open", NOT_MEASURED: "not measured",
};
type StatusCopy = typeof en;
const ar: StatusCopy = {
  DRAFT: "مسودة", NEEDS_SOURCE: "يحتاج مصدرًا", NEEDS_CORRECTION: "يحتاج تصحيحًا", READY_FOR_REVIEW: "جاهز للمراجعة", APPROVED: "معتمد", CHANGED_AFTER_APPROVAL: "تغيّر بعد الاعتماد", STALE: "غير محدَّث", BLOCKING: "مانع", ADVISORY: "إرشادي", SEALED: "مختوم", SAVED: "محفوظ", SAVING: "جارٍ الحفظ…", UNSAVED: "تغييرات غير محفوظة", SAVE_FAILED: "تعذّر الحفظ", GATE_OPEN: "شرط الإصدار معلّق", NOT_MEASURED: "لم يُقَس",
};
const ur: StatusCopy = {
  DRAFT: "مسودہ", NEEDS_SOURCE: "ماخذ درکار ہے", NEEDS_CORRECTION: "درستی درکار ہے", READY_FOR_REVIEW: "جائزے کے لیے تیار", APPROVED: "منظور شدہ", CHANGED_AFTER_APPROVAL: "منظوری کے بعد تبدیل ہوا", STALE: "پرانا ہو چکا", BLOCKING: "رکاوٹ", ADVISORY: "مشورہ", SEALED: "مہر شدہ", SAVED: "محفوظ ہو گیا", SAVING: "محفوظ ہو رہا ہے…", UNSAVED: "غیر محفوظ تبدیلیاں", SAVE_FAILED: "محفوظ نہیں ہو سکا", GATE_OPEN: "اجازت کا مرحلہ باقی", NOT_MEASURED: "پیمائش نہیں ہوئی",
};

export const STUDIO_STATUS_COPY: StudioCopyArea<StatusCopy> = { area: "status", en, ar, ur };
export const studioStatusCopy = (language: Language) => pickStudioCopy(STUDIO_STATUS_COPY, language);
export const studioStatusLabel = (token: StudioStatusToken, language: Language) => studioStatusCopy(language)[token];

export { STUDIO_SHELL_COPY, studioShellSpaceCopy, type StudioShellCopy } from "./exam-studio-copy-shell";

/** Every registered area, in registration order. Each later UI task appends exactly one entry. */
export const EXAM_STUDIO_COPY_AREAS: readonly StudioCopyArea[] = [STUDIO_STATUS_COPY, STUDIO_SHELL_COPY, STUDIO_SPACES_COPY, STUDIO_EVIDENCE_COPY];
