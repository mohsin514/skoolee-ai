/**
 * Client-side validation helpers.
 *
 * Kept apart from `lib/api/validate.ts` on purpose: that module imports
 * `next/server` and belongs to the request path, so pulling it into a
 * `"use client"` component would drag server-only code into the browser
 * bundle. Everything here is isomorphic.
 */

import type { z } from "zod";

/**
 * Collapses a ZodError into one message per field.
 *
 * One message rather than all of them because a field renders a single line of
 * red text; showing "must be at least 2 characters · may only contain letters"
 * under one input is noise when fixing the first usually fixes the second.
 * Issues are visited in order, so the earliest (most fundamental) wins.
 */
export function fieldErrorsOfZod(error: z.ZodError): Record<string, string> {
  const output: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    if (!output[key]) output[key] = issue.message;
  }
  return output;
}

/** Every message, for the rare summary panel that lists them all. */
export function allFieldErrorsOfZod(error: z.ZodError): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    (output[key] ??= []).push(issue.message);
  }
  return output;
}

/**
 * Validates a value outside a form — a single inline edit, a table cell.
 *
 * Returns the parsed value or the first message, so a call site can do the
 * whole thing in one branch without a try/catch.
 */
export function validateValue<S extends z.ZodType>(
  schema: S,
  value: unknown
): { ok: true; data: z.output<S> } | { ok: false; error: string } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "That value is not valid" };
}

/**
 * Pulls per-field messages out of a rejected API response.
 *
 * The routes return the field map in `error` (and, since the shared boundary
 * landed, `details` too), while older handlers return a plain sentence there.
 * This tells the two apart so a caller can mark inputs when it can and fall
 * back to a toast when it cannot.
 */
export function serverFieldErrors(payload: unknown): Record<string, string> | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { error?: unknown; details?: unknown };
  const candidate = body.details ?? body.error;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;

  const output: Record<string, string> = {};
  for (const [field, messages] of Object.entries(candidate as Record<string, unknown>)) {
    const message = Array.isArray(messages) ? messages[0] : messages;
    if (typeof message === "string" && message) output[field] = message;
  }
  return Object.keys(output).length ? output : null;
}
