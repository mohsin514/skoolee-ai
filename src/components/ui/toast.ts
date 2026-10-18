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
const TECHNICAL = /unexpected token|is not valid json|json\.parse|unexpected end of json|\bprisma\b|\bP\d{4}\b|ECONN\w+|ETIMEDOUT|ENOTFOUND|typeerror|referenceerror|syntaxerror|cannot read propert|undefined is not|null is not|is not a function|at \w+ \(|^\s*<!doctype|<html/i;
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
  return text;
}

function error(message: Message | unknown, data?: ExternalToast) {
  const normalized = typeof message === "string" || message instanceof Error || message == null
    ? friendlyErrorMessage(message)
    : (message as Message);
  return sonner.error(normalized, { duration: 7000, ...data });
}

function warning(message: Message, data?: ExternalToast) {
  return sonner.warning(message, { duration: 6000, ...data });
}

function success(message: Message, data?: ExternalToast) {
  return sonner.success(message, { duration: 4000, ...data });
}

const base = (message: Message, data?: ExternalToast) => sonner(message, data);

export const toast: typeof sonner = Object.assign(base, sonner, { error, warning, success }) as typeof sonner;

export type { ExternalToast };
