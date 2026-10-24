/**
 * Tab-local handoffs between auth screens. Everything lives in
 * sessionStorage (this tab only, never a URL, never a cookie), is read once,
 * and is wrapped so a blocked or throwing storage simply does nothing.
 *
 * - The email address travels login → forgot password, and forgot password
 *   or register → login, so nobody types it twice.
 * - The register draft keeps non-secret sign-up fields across a reload or a
 *   killed WebView. It never holds a password.
 */

const EMAIL_KEY = "skoolee-auth-email";
const DRAFT_KEY = "skoolee-register-draft";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_FIELD = 200;

function storage(): Storage | null {
  try {
    const store = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

function looksLikeEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL.test(value);
}

export function stashAuthEmail(email: string): void {
  const value = typeof email === "string" ? email.trim() : "";
  if (!looksLikeEmail(value)) return;
  try { storage()?.setItem(EMAIL_KEY, value); } catch { /* storage blocked: nothing to hand off */ }
}

export function takeAuthEmail(): string | null {
  try {
    const store = storage();
    if (!store) return null;
    const value = store.getItem(EMAIL_KEY);
    store.removeItem(EMAIL_KEY);
    return looksLikeEmail(value) ? value : null;
  } catch {
    return null;
  }
}

export type RegisterDraft = { type: "school_group" | "single_campus"; name?: string; email?: string; phone?: string; schoolName?: string; country?: string; regIdMode?: "auto" | "manual"; regId?: string /* manual only */ };

const TEXT_KEYS = ["name", "email", "phone", "schoolName", "country"] as const;

/** Keeps only the known, non-secret keys; anything else (passwords included) is dropped. */
function sanitize(input: unknown): RegisterDraft | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  if (source.type !== "school_group" && source.type !== "single_campus") return null;
  const draft: RegisterDraft = { type: source.type };
  for (const key of TEXT_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.length <= MAX_FIELD) draft[key] = value;
  }
  if (source.regIdMode === "auto" || source.regIdMode === "manual") draft.regIdMode = source.regIdMode;
  if (draft.regIdMode === "manual" && typeof source.regId === "string" && source.regId.length <= MAX_FIELD) draft.regId = source.regId;
  return draft;
}

export function saveRegisterDraft(d: RegisterDraft): void {
  const draft = sanitize(d);
  if (!draft) return;
  try { storage()?.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage blocked or full: the draft is a convenience */ }
}

export function takeRegisterDraft(): RegisterDraft | null {
  try {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(DRAFT_KEY);
    store.removeItem(DRAFT_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearRegisterDraft(): void {
  try { storage()?.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
}
