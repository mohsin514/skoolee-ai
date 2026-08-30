/**
 * The shared field vocabulary.
 *
 * Every form in the product is assembled from perhaps twenty distinct kinds of
 * field — a person's name, a phone number, a fee amount, a class capacity, an
 * academic year. Before this file existed each of the eighty-odd forms invented
 * its own rules for those twenty kinds, which is why the same CNIC was accepted
 * in one dialog and rejected in the next, and why "Enter a valid email" was
 * spelled four different ways.
 *
 * Defining them once has a second benefit that matters more than consistency:
 * these primitives sanitise *as part of parsing*. `requiredText` does not
 * merely check that a name is non-empty — it trims, folds whitespace, and
 * strips invisibles first, so a field containing only a non-breaking space is
 * correctly reported as missing rather than stored as a blank-looking name.
 *
 * The messages are written to be shown to a school clerk, not a developer:
 * they name the field and say what to do about it.
 */

import { z } from "zod";
import {
  sanitizeCode,
  sanitizeDigits,
  sanitizeEmail,
  sanitizeMultiline,
  sanitizeName,
  sanitizePhone,
  sanitizeSlug,
  sanitizeText,
  sanitizeUrl,
} from "./sanitize";

/** Applies a sanitiser to strings and leaves every other type for zod to reject. */
const clean = (fn: (value: unknown) => string) => (value: unknown) =>
  typeof value === "string" ? fn(value) : value;

/** Turns "" (and whitespace-only) into undefined so `.optional()` sees a gap. */
const blankToUndefined = (fn: (value: unknown) => string) => (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value;
  const cleaned = fn(value);
  return cleaned === "" ? undefined : cleaned;
};

// ─── Text ──────────────────────────────────────────────────

/**
 * Single-line text that must be present.
 *
 * `max` is not decoration. Most of these columns are unbounded `text` in
 * Postgres, so the ceiling that actually exists is the report-card column the
 * value is rendered into — which is why an over-long value has to fail here,
 * where it can be pointed at a field, rather than silently ruining a PDF.
 */
export function requiredText(label: string, options: { min?: number; max?: number } = {}) {
  const { min = 1, max = 200 } = options;
  return z.preprocess(
    clean(sanitizeText),
    z
      .string({ error: `${label} is required` })
      .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
      .max(max, `${label} must be ${max} characters or fewer`)
  );
}

/** Single-line text that may be omitted. Blank strings normalise to undefined. */
export function optionalText(label: string, max = 200) {
  return z.preprocess(
    blankToUndefined(sanitizeText),
    z.string().max(max, `${label} must be ${max} characters or fewer`).optional()
  ).optional();
}

/** Free-form paragraphs — remarks, notes, addresses. Preserves line breaks. */
export function multilineText(label: string, max = 2000) {
  return z.preprocess(
    blankToUndefined(sanitizeMultiline),
    z.string().max(max, `${label} must be ${max} characters or fewer`).optional()
  ).optional();
}

/** A required paragraph — a message body, a required justification. */
export function requiredMultiline(label: string, options: { min?: number; max?: number } = {}) {
  const { min = 1, max = 2000 } = options;
  return z.preprocess(
    clean(sanitizeMultiline),
    z
      .string({ error: `${label} is required` })
      .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
      .max(max, `${label} must be ${max} characters or fewer`)
  );
}

/**
 * A person's or institution's name.
 *
 * Runs the Unicode-aware name sanitiser, so Urdu names survive intact while
 * angle brackets and other markup characters do not. The minimum is 2 because
 * a single character is almost always a mis-key, and the check runs *after*
 * sanitising so "<>" is reported as required rather than accepted as length 2.
 */
export function personName(label: string, options: { min?: number; max?: number } = {}) {
  const { min = 2, max = 100 } = options;
  return z.preprocess(
    clean(sanitizeName),
    z
      .string({ error: `${label} is required` })
      .min(min, `${label} must be at least ${min} characters`)
      .max(max, `${label} must be ${max} characters or fewer`)
  );
}

/** An optional name field — a guardian's second contact, an Urdu spelling. */
export function optionalName(label: string, max = 100) {
  return z.preprocess(
    blankToUndefined(sanitizeName),
    z.string().max(max, `${label} must be ${max} characters or fewer`).optional()
  ).optional();
}

// ─── Identity and contact ──────────────────────────────────

export function email(label = "Email") {
  return z.preprocess(
    clean(sanitizeEmail),
    z.string({ error: `${label} is required` }).min(1, `${label} is required`).pipe(
      z.email(`Enter a valid ${label.toLowerCase()} address`)
    )
  );
}

export function optionalEmail(label = "Email") {
  return z.preprocess(
    blankToUndefined(sanitizeEmail),
    z.email(`Enter a valid ${label.toLowerCase()} address`).optional()
  ).optional();
}

/**
 * A phone number.
 *
 * Length rather than shape: this is deliberately permissive about country
 * formats (the same school may hold a local 11-digit mobile, a landline with an
 * area code, and an overseas guardian's number) but strict about the thing that
 * actually breaks downstream — a value with too few digits to dial or too many
 * to be real. The SMS/WhatsApp senders take digits, so digits are what we count.
 */
export function phone(label = "Phone", options: { min?: number; max?: number } = {}) {
  const { min = 7, max = 15 } = options;
  return z.preprocess(
    clean(sanitizePhone),
    z
      .string({ error: `${label} is required` })
      .min(1, `${label} is required`)
      .refine((v) => sanitizeDigits(v).length >= min, `${label} is too short to be a valid number`)
      .refine((v) => sanitizeDigits(v).length <= max, `${label} is too long to be a valid number`)
  );
}

export function optionalPhone(label = "Phone", options: { min?: number; max?: number } = {}) {
  const { min = 7, max = 15 } = options;
  return z.preprocess(
    blankToUndefined(sanitizePhone),
    z
      .string()
      .refine((v) => sanitizeDigits(v).length >= min, `${label} is too short to be a valid number`)
      .refine((v) => sanitizeDigits(v).length <= max, `${label} is too long to be a valid number`)
      .optional()
  ).optional();
}

/**
 * A Pakistani CNIC / B-Form number.
 *
 * Stored in the canonical 00000-0000000-0 form regardless of how it was typed,
 * so the same identity card cannot be entered twice in two different formats
 * and defeat a duplicate check.
 */
export function cnic(label = "CNIC", options: { required?: boolean } = {}) {
  const digitsOnly = (value: unknown) =>
    typeof value === "string" ? sanitizeDigits(value) : value;

  const base = z
    .string()
    .length(13, `${label} must be 13 digits`)
    .transform((digits) => `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`);

  if (!options.required) {
    return z.preprocess(
      (value) => {
        const cleaned = digitsOnly(value);
        return cleaned === "" || cleaned === undefined || cleaned === null ? undefined : cleaned;
      },
      base.optional()
    ).optional();
  }

  return z.preprocess(
    digitsOnly,
    z.string({ error: `${label} is required` }).min(1, `${label} is required`).pipe(base)
  );
}

/**
 * A password being *set* (not one being supplied to log in).
 *
 * Length carries most of the strength, so the bar is 8 characters plus a mix of
 * letters and digits — enough to stop "password" and "12345678" without pushing
 * staff towards writing a symbol-laden string on a sticky note. Deliberately
 * not sanitised: every character the user typed is significant.
 */
export function newPassword(label = "Password", min = 8) {
  return z
    .string({ error: `${label} is required` })
    .min(min, `${label} must be at least ${min} characters`)
    .max(128, `${label} must be 128 characters or fewer`)
    .refine((v) => /\p{L}/u.test(v), `${label} must contain at least one letter`)
    .refine((v) => /\d/.test(v), `${label} must contain at least one number`);
}

/** A password being supplied to authenticate — presence only, never shape. */
export function currentPassword(label = "Password") {
  return z.string({ error: `${label} is required` }).min(1, `${label} is required`);
}

/** URL-safe identifier for schools and campuses. */
export function slug(label = "Slug", options: { min?: number; max?: number } = {}) {
  const { min = 3, max = 40 } = options;
  return z.preprocess(
    clean(sanitizeSlug),
    z
      .string({ error: `${label} is required` })
      .min(min, `${label} must be at least ${min} characters`)
      .max(max, `${label} must be ${max} characters or fewer`)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label} may use lowercase letters, numbers and hyphens only`)
  );
}

/** Short uppercase reference — subject code, account code, section letter. */
export function code(label: string, options: { max?: number; required?: boolean } = {}) {
  const { max = 20, required = false } = options;
  if (required) {
    return z.preprocess(
      clean(sanitizeCode),
      z
        .string({ error: `${label} is required` })
        .min(1, `${label} is required`)
        .max(max, `${label} must be ${max} characters or fewer`)
    );
  }
  return z.preprocess(
    blankToUndefined(sanitizeCode),
    z.string().max(max, `${label} must be ${max} characters or fewer`).optional()
  ).optional();
}

export function optionalUrl(label = "Link") {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value ?? undefined;
      const cleaned = sanitizeUrl(value);
      // An unparseable or non-http value sanitises to "". Passing the original
      // through lets the refine below report it rather than silently dropping
      // a link the user believes they saved.
      return value.trim() === "" ? undefined : cleaned || value.trim();
    },
    z
      .string()
      .refine((v) => sanitizeUrl(v) !== "", `${label} must be a valid http(s) address`)
      .optional()
  ).optional();
}

/** A database identifier arriving from a select or a route parameter. */
export function id(label: string) {
  return z.preprocess(
    clean(sanitizeText),
    z.string({ error: `${label} is required` }).min(1, `${label} is required`).max(64, `${label} is not valid`)
  );
}

export function optionalId(label: string) {
  return z.preprocess(
    blankToUndefined(sanitizeText),
    z.string().max(64, `${label} is not valid`).optional()
  ).optional();
}

// ─── Numbers ───────────────────────────────────────────────

/**
 * Coerces the string a text input always produces, while rejecting the values
 * `Number()` is too generous about.
 *
 * `z.coerce.number()` alone turns "" into 0 and " " into 0, which is how a fee
 * amount left blank became a legitimate zero-rupee invoice. Empty input has to
 * reach the schema as undefined so a required-field message can be produced.
 */
const toNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

/** A whole number within a stated range. */
export function integer(label: string, options: { min?: number; max?: number } = {}) {
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = options;
  return z.preprocess(
    toNumber,
    z
      .number({ error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be no more than ${max}`)
  );
}

export function optionalInteger(label: string, options: { min?: number; max?: number } = {}) {
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = options;
  return z.preprocess(
    toNumber,
    z
      .number({ error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be no more than ${max}`)
      .optional()
  ).optional();
}

/**
 * A currency amount.
 *
 * Capped at 1,000,000,000 because the realistic ceiling for a single school
 * transaction is far below it and an unbounded amount is how a mis-keyed extra
 * digit becomes a nine-figure invoice nobody notices until reconciliation.
 */
export function money(label: string, options: { min?: number; max?: number; allowZero?: boolean } = {}) {
  const { min = options.allowZero === false ? 1 : 0, max = 1_000_000_000 } = options;
  return z.preprocess(
    toNumber,
    z
      .number({ error: `${label} must be an amount` })
      .min(min, min > 0 ? `${label} must be greater than zero` : `${label} cannot be negative`)
      .max(max, `${label} is unrealistically large — please check it`)
      .refine((v) => Number.isFinite(v), `${label} must be an amount`)
      // Two decimal places is the most any currency here needs; more is a
      // paste artefact and rounds unpredictably once it reaches the ledger.
      // The epsilon is required because 12500.5 * 100 is not exactly 1250050
      // in binary floating point, and an exact comparison rejects it.
      .refine(
        (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
        `${label} may have at most 2 decimal places`
      )
  );
}

export function optionalMoney(label: string, options: { max?: number } = {}) {
  const { max = 1_000_000_000 } = options;
  return z.preprocess(
    toNumber,
    z
      .number({ error: `${label} must be an amount` })
      .min(0, `${label} cannot be negative`)
      .max(max, `${label} is unrealistically large — please check it`)
      .optional()
  ).optional();
}

/** A 0–100 rate — discounts, late-fee rates, tax, weightings. */
export function percentage(label: string, options: { max?: number } = {}) {
  const { max = 100 } = options;
  return z.preprocess(
    toNumber,
    z
      .number({ error: `${label} must be a number` })
      .min(0, `${label} cannot be negative`)
      .max(max, `${label} cannot exceed ${max}%`)
  );
}

/** The academic year, as a four-digit calendar year. */
export function academicYear(label = "Academic year") {
  const thisYear = new Date().getFullYear();
  return z.preprocess(
    toNumber,
    z
      .number({ error: `${label} is required` })
      .int(`${label} must be a year like ${thisYear}`)
      // A ten-year window either side: wide enough for historical intake and
      // next year's planning, narrow enough to catch a mis-typed 20255.
      .min(thisYear - 10, `${label} looks too far in the past`)
      .max(thisYear + 10, `${label} looks too far in the future`)
  );
}

// ─── Dates ─────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks a YYYY-MM-DD string names a real calendar day.
 *
 * The regex alone accepts 2025-02-31; round-tripping through Date is what
 * rejects it. Parsed as UTC deliberately — constructing a local Date from a
 * date-only string shifts the day backwards west of Greenwich, which is how a
 * date of birth could be stored as the day before the one that was picked.
 */
function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** Today in UTC as YYYY-MM-DD, for comparisons that must not depend on locale. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDate(label: string, options: { past?: boolean; future?: boolean } = {}) {
  let schema = z
    .string({ error: `${label} is required` })
    .min(1, `${label} is required`)
    .refine(isRealDate, `${label} must be a valid date`);

  if (options.past) {
    schema = schema.refine((v) => v <= todayIso(), `${label} cannot be in the future`);
  }
  if (options.future) {
    schema = schema.refine((v) => v >= todayIso(), `${label} cannot be in the past`);
  }
  return z.preprocess(clean(sanitizeText), schema);
}

export function optionalIsoDate(label: string, options: { past?: boolean; future?: boolean } = {}) {
  let schema = z.string().refine(isRealDate, `${label} must be a valid date`);
  if (options.past) {
    schema = schema.refine((v) => v <= todayIso(), `${label} cannot be in the future`);
  }
  if (options.future) {
    schema = schema.refine((v) => v >= todayIso(), `${label} cannot be in the past`);
  }
  return z.preprocess(blankToUndefined(sanitizeText), schema.optional()).optional();
}

/**
 * A date of birth, bounded at both ends.
 *
 * The upper bound is what stops a typo in the year silently creating a pupil
 * born next week; the lower bound catches a century mis-key (1025 for 2025).
 */
export function dateOfBirth(label = "Date of birth", options: { minAge?: number; maxAge?: number } = {}) {
  const { minAge = 2, maxAge = 100 } = options;
  return z.preprocess(
    blankToUndefined(sanitizeText),
    z
      .string()
      .refine(isRealDate, `${label} must be a valid date`)
      .refine((v) => v <= todayIso(), `${label} cannot be in the future`)
      .refine((v) => ageFrom(v) >= minAge, `Age must be at least ${minAge} years`)
      .refine((v) => ageFrom(v) <= maxAge, `${label} looks too far in the past — please check it`)
      .optional()
  ).optional();
}

/** Whole years elapsed since an ISO date, UTC-based to match `isRealDate`. */
export function ageFrom(isoDateString: string): number {
  const [y, m, d] = isoDateString.split("-").map(Number);
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  const monthDiff = now.getUTCMonth() - (m - 1);
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < d)) age -= 1;
  return age;
}

/** A wall-clock time as HH:MM — period boundaries, exam start times. */
export function timeOfDay(label: string) {
  return z.preprocess(
    clean(sanitizeText),
    z
      .string({ error: `${label} is required` })
      .min(1, `${label} is required`)
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be a time like 09:30`)
  );
}

// ─── Booleans and choices ──────────────────────────────────

/** Accepts the "true"/"false" strings that checkboxes and query params send. */
export const boolish = z.preprocess((value) => {
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
}, z.boolean());

/** A required choice from a fixed set, with a message naming the field. */
export function choice<T extends readonly [string, ...string[]]>(label: string, values: T) {
  return z.preprocess(
    blankToUndefined(sanitizeText),
    z.enum(values, { error: `Select a ${label.toLowerCase()}` })
  );
}

export function optionalChoice<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(blankToUndefined(sanitizeText), z.enum(values).optional()).optional();
}

// ─── Cross-field helpers ───────────────────────────────────

/**
 * Asserts `end` is not before `start` on two ISO date fields.
 *
 * Applied with `.superRefine` so the message lands on the end field, which is
 * the one the user should change.
 */
export function assertDateOrder<T extends Record<string, unknown>>(
  ctx: z.RefinementCtx,
  data: T,
  startKey: keyof T & string,
  endKey: keyof T & string,
  message = "End date must be on or after the start date"
) {
  const start = data[startKey];
  const end = data[endKey];
  if (typeof start === "string" && typeof end === "string" && start && end && end < start) {
    ctx.addIssue({ code: "custom", path: [endKey], message });
  }
}
