/**
 * The server-side validation boundary.
 *
 * Client-side validation is a courtesy to the user; this is the copy that
 * actually decides. Anything reachable with `curl` — which is every route here
 * — has to assume the browser never ran, so each handler parses its body
 * through a schema before touching Prisma.
 *
 * These helpers *throw* rather than returning a response, because the routes
 * are uniformly written as `try { … } catch (error) { return errorResponse(error) }`.
 * A throwing helper therefore drops into an existing handler as a single line,
 * and `errorResponse` already knows how to serialise a `ValidationError` into
 * the `{ error: { field: [message] } }` shape the client reads.
 *
 * Every body is run through `sanitizeDeep` on the way in, so control
 * characters, invisible formatting and prototype-pollution keys are gone before
 * any schema — or any handler that forgot to use one — sees the payload.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ValidationError } from "./scope";
import { sanitizeDeep } from "@/lib/validators/sanitize";

/**
 * Bodies above this are refused unread.
 *
 * Bulk student import is the largest legitimate payload and lands well under a
 * megabyte; anything past four is either a mistake or an attempt to make the
 * JSON parser do the damage before validation gets a turn.
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Flattens a ZodError into the field map the client marks its inputs from. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const issue of error.issues) {
    // Nested paths (`entries.3.marksObtained`) are joined so the client can
    // match them, and a whole-object issue lands under `_form`.
    const key = issue.path.length ? issue.path.join(".") : "_form";
    (output[key] ??= []).push(issue.message);
  }
  return output;
}

/** A one-line summary of a field map, for logs and toast fallbacks. */
export function summarizeFieldErrors(fieldErrors: Record<string, string[]>): string {
  const parts = Object.entries(fieldErrors)
    .slice(0, 3)
    .map(([field, messages]) => (field === "_form" ? messages[0] : `${field}: ${messages[0]}`));
  return parts.join(" · ") || "Please check the highlighted fields";
}

/** Reads and sanitises a JSON body without yet validating its shape. */
export async function readJsonBody(req: NextRequest | Request): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    throw new ApiError("That request is too large to process", 413);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    // A malformed body is the client's fault, not a 500. Without this the
    // JSON.parse failure escaped to `errorResponse`'s generic branch and was
    // reported as an internal error.
    throw new ApiError("Request body must be valid JSON", 400);
  }

  return sanitizeDeep(raw);
}

/**
 * The main entry point: read the body, sanitise it, and parse it through
 * `schema`, throwing a `ValidationError` with per-field messages if it fails.
 */
export async function parseBody<S extends z.ZodType>(
  req: NextRequest | Request,
  schema: S
): Promise<z.output<S>> {
  const body = await readJsonBody(req);
  return parseWith(schema, body);
}

/** Parses an already-obtained value through a schema with the same semantics. */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    throw new ValidationError(fieldErrors, summarizeFieldErrors(fieldErrors));
  }
  return parsed.data;
}

/**
 * Validates `?a=1&b=2` against a schema.
 *
 * Repeated keys collapse to an array so a schema can declare `z.array(...)`
 * for multi-select filters; everything else arrives as the string the URL
 * carried, which is why the numeric primitives in `fields.ts` coerce.
 */
export function parseQuery<S extends z.ZodType>(req: NextRequest | Request, schema: S): z.output<S> {
  const url = new URL(req.url);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    raw[key] = values.length > 1 ? values : values[0];
  }
  return parseWith(schema, sanitizeDeep(raw));
}

/** Validates dynamic route params (`/api/fees/structure/[structureId]`). */
export function parseParams<S extends z.ZodType>(params: unknown, schema: S): z.output<S> {
  return parseWith(schema, sanitizeDeep(params));
}

/**
 * Validates a `multipart/form-data` submission.
 *
 * Files are passed through untouched — `sanitizeDeep` would stringify them —
 * while the text fields beside them get the same treatment as a JSON body.
 */
export async function parseFormData<S extends z.ZodType>(
  req: NextRequest | Request,
  schema: S
): Promise<z.output<S>> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError("Request body must be valid form data", 400);
  }

  const raw: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key);
    const mapped = values.map((value) =>
      typeof value === "string" ? sanitizeDeep(value) : value
    );
    raw[key] = mapped.length > 1 ? mapped : mapped[0];
  }
  return parseWith(schema, raw);
}

/**
 * Guards an uploaded file before it reaches storage.
 *
 * Extension and client-declared MIME type are both attacker-controlled, so
 * neither is trusted on its own — the pair must agree with an allow-list, and
 * the size ceiling is enforced regardless.
 */
export function assertUploadAllowed(
  file: File,
  options: { maxBytes?: number; allowedTypes?: readonly string[]; label?: string } = {}
) {
  const {
    maxBytes = 10 * 1024 * 1024,
    allowedTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"],
    label = "File",
  } = options;

  if (!file || typeof file.size !== "number") {
    throw new ApiError(`${label} is required`, 400);
  }
  if (file.size === 0) {
    throw new ApiError(`${label} is empty`, 400);
  }
  if (file.size > maxBytes) {
    throw new ApiError(
      `${label} must be ${Math.floor(maxBytes / (1024 * 1024))}MB or smaller`,
      413
    );
  }
  if (allowedTypes.length && !allowedTypes.includes(file.type)) {
    throw new ApiError(`${label} must be one of: ${allowedTypes.join(", ")}`, 415);
  }
}

/** Pagination shared by every list endpoint, with a hard ceiling on `take`. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  // Capped so a crafted `?pageSize=100000` cannot pull an entire tenant's
  // roster into memory in one request.
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
