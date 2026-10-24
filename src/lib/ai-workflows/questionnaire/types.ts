import type { z } from "zod";
import type { UserRole } from "@/lib/roles";
import type { CapabilityContext, ConfirmationClass, L10n, Locale } from "../registry/types";

/**
 * A role's first-login questionnaire (design-slices §4). Each question is typed, prefilled from records
 * the school already has, and shown only when it applies. Confirmed answers compile to registry steps
 * deterministically, with no model call; the build is one job bound to the response version, so
 * class-A steps run, class-B steps wait for their own previews, and class-C steps go to their owners.
 */
export interface Option { value: string; label: string; detail?: string }

/** What the client renders, already localised. The server never trusts the client's copy of it. */
export type QuestionView =
  | { kind: "choice"; options: Option[] }
  | { kind: "multi"; options: Option[]; min?: number }
  | { kind: "tags"; max: number; placeholder: string; suggestions?: string[]; url?: boolean }
  | { kind: "stepper"; min: number; max: number; step: number; unit?: string }
  | { kind: "text"; placeholder: string; time?: boolean }
  | { kind: "per-row-choice"; rows: Array<{ id: string; label: string; options: Option[] }> }
  | { kind: "schedule"; days: Array<{ day: number; label: string; slots: Array<{ id: string; label: string; free: boolean }> }>; weeks: { min: number; max: number } }
  | { kind: "test-rows"; rows: Array<{ id: string; label: string; defaultTotal: number }>; minDate: string }
  | { kind: "group"; fields: Array<{ key: string; label: string; view: QuestionView; optional?: boolean }> }
  /** A number per row (sections per grade, leave days per type): value Record<rowId, number>. */
  | { kind: "row-steppers"; rows: Array<{ id: string; label: string }>; min: number; max: number; step: number; unit?: string }
  /** Tags per row (subjects per grade band): value Record<rowId, string[]>. */
  | { kind: "row-tags"; rows: Array<{ id: string; label: string; suggestions: string[] }>; max: number; placeholder: string }
  /** Structured rows typed by the person (never model-read): value Array<Record<columnKey, string>>. */
  | { kind: "table"; columns: Array<{ key: string; label: string; type: "text" | "email" | "tel" | "choice"; options?: Option[] }>; maxRows: number };

export interface Question<P> {
  key: string;
  sheet: number;
  prompt: L10n;
  hint?: L10n;
  required: boolean;
  /** Capability keys this answer drives and the strictest class among them (shown as a chip). */
  drives: readonly string[];
  cls: ConfirmationClass;
  appliesWhen?(prefill: P, answers: Record<string, unknown>): boolean;
  view(prefill: P, locale: Locale): QuestionView;
  /** Validates one answer against the prefill (rows and slots must be ones the server offered). */
  answer(prefill: P): z.ZodType<unknown>;
  /** The default shown before the person answers (never auto-confirmed). */
  initial?(prefill: P): unknown;
}

export interface CompiledStep { stepKey: string; capabilityKey: string; input: unknown; fromKey: string; dependsOn?: string[] }
export interface RemainingTask { title: L10n; who: L10n; link?: string }
export interface KnownFact { label: L10n; value: string; editLink?: string }

export interface QuestionnaireDefinition<P = unknown> {
  key: string;
  roles: readonly UserRole[];
  /** Bump when questions or compile rules change; a response on an older version is re-confirmed. */
  version: number;
  sheets: readonly L10n[];
  title: L10n;
  prefill(ctx: CapabilityContext): Promise<P>;
  known(prefill: P, locale: Locale): KnownFact[];
  questions: ReadonlyArray<Question<P>>;
  compile(answers: Record<string, unknown>, prefill: P, ctx: CapabilityContext): CompiledStep[];
  remains(answers: Record<string, unknown>, prefill: P): RemainingTask[];
}
