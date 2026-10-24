import type { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { UserRole } from "@/lib/roles";
import type { TxClient } from "@/lib/db/prisma";
import type { WorkspacePermissionSnapshot } from "@/lib/school-ai/access";
import type { CampusSeats } from "@/lib/auth/seats";

/**
 * The Capability Registry is the single list of things the AI may do for a role. Each entry wraps one
 * existing service function (never a route handler, never model-chosen HTTP or SQL) and declares its
 * gate, its static confirmation class, how it replays safely and what proves it ran.
 *   A  runs on its own (reads, own preferences, append-only creates with domain duplicate checks)
 *   B  waits for the user to confirm the exact preview (bound by hash)
 *   C  is prepared and handed to the person and screen that already decide it; it has no `execute`
 * The class is static. The engine may only escalate it (A→B→C), never the model.
 */
export type ConfirmationClass = "A" | "B" | "C";
export type Risk = "READ" | "CREATE" | "UPDATE" | "DESTRUCTIVE" | "APPROVAL_DECISION" | "FINANCIAL" | "ACCESS_GRANT" | "COMMUNICATION" | "PUBLISH";
export type Cluster = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9" | "PERSONAL";
export type Locale = "en" | "ar" | "ur";
export type L10n = Record<Locale, string>;
export type L10nList = Record<Locale, string[]>;

export type EntityKind = "student" | "class" | "subject" | "staff" | "teacher" | "guardianChild" | "campus" | "room" | "period"
  | "cycle" | "libraryMember" | "libraryCopy" | "bookTitle" | "invoice" | "visitor" | "enquiry" | "leaveRequest" | "assignment" | "exam" | "school";
/** The model never emits ids: it names the thing and a scope-filtered resolver binds it. */
export type EntityRef<K extends EntityKind = EntityKind> = { $ref: K; text: string; hint: string | null };

export interface CapabilityContext {
  user: AuthUser; campusId: string | null; permissions: WorkspacePermissionSnapshot;
  seats(): Promise<CampusSeats>; locale: Locale; now: Date;
}

export type GateFailure = "ROLE" | "MODULE" | "SEAT" | "SCOPE" | "GUARDIAN" | "CAPABILITY_KEY" | "SUSPENDED" | "BILLING";
export type GateResult = { ok: true } | { ok: false; code: GateFailure; whoCan?: readonly UserRole[] };
export interface Gate {
  id: string;
  /** Names of the guard helpers this gate mirrors; the lint checks they cover the source route's guards. */
  provenance: readonly string[];
  check(ctx: CapabilityContext): Promise<GateResult>;
}

export type ScopeRule =
  | { kind: "self" } | { kind: "own-campus" } | { kind: "any-campus-of-school" } | { kind: "assigned-class" }
  | { kind: "own-child"; permission: "attendance" | "fees" | "communication" | "pickup" | "results" }
  | { kind: "platform"; unscopedReason: string };

export interface PreviewModel {
  title: string;
  /** Rows the user will see as "what will change", already localised. */
  lines: Array<{ label: string; value: string }>;
  counts: Record<string, number>;
  /** The save button's words when they say more than the title ("Save register · 31 present, 2 absent"). */
  confirmLabel?: string;
  /**
   * Changes only a person may make to the bound input (control P3), e.g. "Mark the other 31 present".
   * `expect` is the count the person saw; the server re-checks it before applying the patch.
   */
  actions?: Array<{ id: string; label: string; patch: Record<string, unknown>; expect: number }>;
  /** Inputs to the preview hash beyond the bound input (e.g. updatedAt of affected rows). */
  basis: unknown;
}

export interface Receipt {
  kind: "write" | "handoff" | "read" | "draft";
  capability: string;
  entities: Array<{ model: string; id: string }>;
  counts: Record<string, number>;
  link: string | null;
  replayed: boolean;
  /** Raw domain receipt kept for audit and for the legacy job view. */
  detail?: Record<string, unknown>;
}

export interface EntryCopy {
  title: L10n; whenToUse: L10n; examples: L10nList;
  /** Per-field question templates keyed by JSON pointer into modelInput ("/books/0/title"). */
  questions?: Record<string, L10n>;
}

export type SourceReuse = "direct" | "wrapper" | "extracted" | "handoff-only" | "typed-operation" | "automation-tool";
export interface EntrySource { route?: string; serverAction?: string; service: string; reuse: SourceReuse }

interface BaseEntry<I> {
  key: string;
  version: number;
  cluster: Cluster;
  /** Appendix A keys this entry covers (an entry may cover several handler rows). */
  inventoryKeys: readonly string[];
  risk: Risk;
  roles: readonly UserRole[];
  copy: EntryCopy;
  /** What the model fills. Strict; ids appear only as EntityRef. */
  input: z.ZodType<I>;
  /** JSON pointers whose values must be quoted from the user's own words (status, amounts, dates, reasons). */
  evidence: readonly string[];
  gates: readonly Gate[];
  scope: ScopeRule;
  limits?: { maxItems?: number; autoRunMax?: number };
  source: EntrySource;
  /**
   * Binds names the model wrote (pupils, assignments, leave types) to records in this actor's scope and
   * re-checks that scope. Throws InputRequired for anything ambiguous; returns the input that will be
   * previewed, confirmed and executed.
   */
  resolve?(ctx: CapabilityContext, input: I): Promise<I>;
  /** Top-level input keys only a person may set (through a preview action); the planner drops them. */
  humanFields?: readonly string[];
}

export type IdempotencyMode =
  | { mode: "native" }        // the service takes our key (or derives a unique row from it)
  | { mode: "tx-receipt" }    // the write and our receipt commit in one transaction
  | { mode: "natural" }       // no key; replay is detected by reconciling the domain (UNCERTAIN on doubt)
  | { mode: "convergent" };   // absolute set; repeating it is harmless

export interface ExecEntry<I = unknown> extends BaseEntry<I> {
  class: "A" | "B";
  /** Why a write below its risk floor runs at A (must also be listed in floors.ts CLASS_A_ALLOWLIST). */
  classOverride?: string;
  escalatesUnder?: ReadonlyArray<"separationOfDuties" | "correctionSeparateApprover" | "batchOverAutoRun">;
  idempotency: IdempotencyMode;
  preview?(ctx: CapabilityContext, input: I): Promise<PreviewModel>;
  execute(ctx: CapabilityContext, input: I, opts: { idempotencyKey: string }): Promise<Receipt>;
}

export type HandoffKind = "RECORD_APPROVAL" | "DOMAIN_REQUEST" | "DOMAIN_SCREEN" | "ROLE_TASK" | "DEEP_LINK";
export interface HandoffPrepared { kind: HandoffKind; targetRoles: readonly UserRole[]; link: string; prefill: Record<string, unknown>; detail?: Record<string, unknown> }
/** Class C has no `execute`: the type, the registry assertion and the lint all refuse one. */
export interface HandoffEntry<I = unknown> extends BaseEntry<I> {
  class: "C";
  handoff: {
    kind: HandoffKind;
    prepare(ctx: CapabilityContext, input: I, opts: { idempotencyKey: string }): Promise<HandoffPrepared>;
  };
  execute?: never;
}

export type CapabilityEntry = ExecEntry<any> | HandoffEntry<any>;

export type ExclusionCategory = "auth" | "webhook" | "cron" | "candidate-only" | "exam-studio" | "file-upload" | "platform-console" | "internal" | "triage";
export interface Exclusion { key: string; category: ExclusionCategory; reason: string; link?: string }
