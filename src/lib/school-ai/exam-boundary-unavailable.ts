// ─────────────────────────────────────────────────────────────────
// SKAI-1962: the answer the proxy gives when a student's exam state cannot be read.
//
// Still fail-closed (503, never the requested page) and the cookie stays. API and
// non-GET callers keep the JSON body they already parse (EXAM_SESSION_UNAVAILABLE);
// a browser navigation gets a small page with a Retry link instead of raw JSON.
// Both carry Retry-After so clients wait rather than hammer a struggling database.
//
// Dependency-free on purpose: the proxy bundle cannot load the UI catalogs, so the
// three strings live here in EN, AR and UR.
// ─────────────────────────────────────────────────────────────────
import { isDatabaseUnavailable, unavailableReason } from "@/lib/db/availability";
import { directionFor, parseLanguage } from "@/lib/locale/language-cookie";

export const EXAM_UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

const COPY = {
  en: { title: "Exam status unavailable", body: "We could not check your exam session. Wait a few seconds, then try again.", retry: "Try again" },
  ar: { title: "حالة الامتحان غير متاحة", body: "تعذّر التحقق من جلسة امتحانك. انتظر بضع ثوانٍ ثم حاول مرة أخرى.", retry: "حاول مرة أخرى" },
  ur: { title: "امتحان کی صورتحال دستیاب نہیں", body: "آپ کے امتحانی سیشن کی جانچ نہیں ہو سکی۔ چند سیکنڈ انتظار کریں، پھر دوبارہ کوشش کریں۔", retry: "دوبارہ کوشش کریں" },
} as const;

export function examUnavailableHeaders(error: unknown): Record<string, string> {
  return {
    "Cache-Control": "private, no-store",
    "Retry-After": String(EXAM_UNAVAILABLE_RETRY_AFTER_SECONDS),
    "x-db-unavailable": isDatabaseUnavailable(error) ? unavailableReason(error) : "other",
  };
}

/** Whether the request is a document navigation (gets HTML) rather than an API or form call (keeps JSON). */
export function wantsExamUnavailablePage(path: string, method: string): boolean {
  return !path.startsWith("/api/") && (method === "GET" || method === "HEAD");
}

/** Static page: no script, no inline style (the CSP has no 'unsafe-inline'), no meta refresh, no request data echoed back. The Retry link reloads the same URL. */
export function examUnavailablePage(languageCookie: string | undefined): string {
  const lang = parseLanguage(languageCookie) ?? "en";
  const copy = COPY[lang];
  return `<!doctype html><html lang="${lang}" dir="${directionFor(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${copy.title}</title></head>`
    + `<body><main><h1>${copy.title}</h1><p>${copy.body}</p><p><a href="">${copy.retry}</a></p></main></body></html>`;
}
