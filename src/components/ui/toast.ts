/**
 * The application's toast API: Sonner's, with one change. Error toasts never
 * show a raw technical message ("Failed to fetch", "Unexpected token < in
 * JSON", a Prisma code, a bare status line) to a parent or teacher; those are
 * replaced with plain words in the reader's language, and errors stay on
 * screen longer than successes because they usually need reading.
 *
 * Import from here, never from "sonner" directly (enforced by check:ui).
 */

import { toast as sonner, type ExternalToast } from "sonner";
import { translateUi } from "@/lib/locale/ui-messages";

type Message = Parameters<typeof sonner.error>[0];

const NETWORK = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|net::/i;
const TECHNICAL = /tenant context|tenant registry|tenantcontexterror|runwithtenantcontext|rununscoped|^\s*\[[\w.-]+\]|unexpected token|is not valid json|json\.parse|unexpected end of json|\bprisma\b|\bP\d{4}\b|ECONN\w+|ETIMEDOUT|ENOTFOUND|typeerror|referenceerror|syntaxerror|cannot read propert|undefined is not|null is not|is not a function|at \w+ \(|^\s*<!doctype|<html/i;
const STATUS_LINE = /^(?:\d{3}\b.*|internal server error|bad gateway|service unavailable|gateway timeout|bad request|not found|forbidden|unauthorized|request failed(?: with status code \d+)?|error)$/i;

function language(): "en" | "ar" | "ur" {
  if (typeof document === "undefined") return "en";
  const base = document.documentElement.lang.toLowerCase().split("-")[0];
  return base === "ar" || base === "ur" ? base : "en";
}

const say = (source: string) => translateUi(source, language());

/** Turns anything thrown or returned into a sentence fit for the reader. */
export function friendlyErrorMessage(error: unknown, fallback?: string): string {
  const generic = fallback ?? say("Something went wrong. Please try again.");
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const text = raw.trim();
  if (!text) return generic;
  if (NETWORK.test(text)) return say("We couldn't reach Skoolee. Check your connection and try again.");
  if (TECHNICAL.test(text) || STATUS_LINE.test(text) || text.length > 400) return generic;
  // Server copy that has a catalog entry (plan limits, paused plan, ownership) reads in the reader's language.
  return say(text);
}

/** Translates a plain-string message (or description); React nodes pass through untouched. */
function translated<T>(message: T): T {
  return (typeof message === "string" ? say(message) : message) as T;
}

function withDescription(data?: ExternalToast): ExternalToast | undefined {
  if (!data || typeof data.description !== "string") return data;
  return { ...data, description: say(data.description) };
}

/** First-strong isolate, so a name or number keeps its own direction inside an RTL sentence. */
const isolate = (value: string) => `\u2068${value}\u2069`;

function fill(template: string, ...values: string[]) {
  return say(template).replace(/\{(\d+)\}/g, (match, index) => (index in values ? values[Number(index)] : match));
}

function error(message: unknown, data?: ExternalToast) {
  const normalized = typeof message === "string" || message instanceof Error || message == null
    ? friendlyErrorMessage(message)
    : (message as Message);
  return sonner.error(normalized, { duration: 7000, ...withDescription(data) });
}

function warning(message: Message, data?: ExternalToast) {
  return sonner.warning(translated(message), { duration: 6000, ...withDescription(data) });
}

function success(message: Message, data?: ExternalToast) {
  return sonner.success(translated(message), { duration: 4000, ...withDescription(data) });
}

function info(message: Message, data?: ExternalToast) {
  return sonner.info(translated(message), { duration: 5000, ...withDescription(data) });
}

/* ── One-line helpers (§10.9): the same words for the same outcome everywhere ── */

/** Already-translated success line (no second translation pass). */
const done = (text: string) => sonner.success(text, { duration: 4000 });

/** "Saved" or "{what} saved". */
function saved(what?: string) {
  return done(what ? fill("{0} saved", say(what)) : say("Saved"));
}

/** "Deleted" or "{what} deleted". */
function deleted(what?: string) {
  return done(what ? fill("{0} deleted", say(what)) : say("Deleted"));
}

/** "Sent", "{what} sent" or "{what} sent to {to}" (the recipient is isolated for RTL). */
function sent(what?: string, to?: string) {
  if (what && to) return done(fill("{0} sent to {1}", say(what), isolate(to)));
  return done(what ? fill("{0} sent", say(what)) : say("Sent"));
}

function copied() {
  return done(say("Copied to clipboard"));
}

/**
 * A failed action (not a failed load — loads render an inline ErrorState).
 * Title names the action; a specific, human-readable server message becomes
 * the description, a technical one is dropped.
 */
function actionFailed(action: string, cause: unknown) {
  const detail = friendlyErrorMessage(cause, "");
  return sonner.error(fill("Could not {0}. Try again.", say(action)), {
    duration: 7000,
    ...(detail ? { description: detail } : {}),
  });
}

const base = (message: Message, data?: ExternalToast) => sonner(translated(message), withDescription(data));

type Helpers = {
  error: typeof error;
  saved: typeof saved;
  deleted: typeof deleted;
  sent: typeof sent;
  copied: typeof copied;
  actionFailed: typeof actionFailed;
};

/** Sonner's toast, except `error` also accepts anything thrown (Error, unknown), string messages are translated, and the helpers above. */
export type Toast = ((...args: Parameters<typeof sonner>) => ReturnType<typeof sonner>) & Omit<typeof sonner, "error"> & Helpers;

export const toast: Toast = Object.assign(base, sonner, { error, warning, success, info, saved, deleted, sent, copied, actionFailed }) as Toast;

export type { ExternalToast };
