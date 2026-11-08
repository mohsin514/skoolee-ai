import type { UserRole } from "@/lib/roles";
import type { PermissionAction, PermissionModule } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth";
import type { CapabilityContext, CapabilityEntry, Gate, GateResult } from "./types";

/**
 * Gates mirror the guards the source route already runs; they never invent new authority. Each gate
 * names the helper(s) it mirrors in `provenance`, which the coverage lint compares with the route.
 */
const OK: GateResult = { ok: true };
const FLAG = { view: "canView", add: "canAdd", edit: "canEdit", delete: "canDelete" } as const;

export function roles(allowed: readonly UserRole[]): Gate {
  return { id: `roles:${allowed.join("|")}`, provenance: ["role"], async check(ctx) { return allowed.includes(ctx.user.role) ? OK : { ok: false, code: "ROLE", whoCan: allowed }; } };
}

/** The live permission matrix (school overrides over role defaults). SUPER_ADMIN is fixed full access. */
export function permission(module: PermissionModule, action: PermissionAction): Gate {
  return {
    id: `permission:${module}.${action}`, provenance: ["assertPermission", "assertWorkspacePermission"],
    async check(ctx) {
      if (ctx.user.role === "SUPER_ADMIN") return OK;
      return ctx.permissions.get(module)?.[FLAG[action]] ? OK : { ok: false, code: "MODULE" };
    },
  };
}

/** An existing synchronous predicate from src/lib/api/scope.ts or src/lib/auth/institution.ts. */
export function predicate(name: string, test: (user: AuthUser) => boolean, whoCan?: readonly UserRole[]): Gate {
  return { id: `predicate:${name}`, provenance: [name], async check(ctx) { return test(ctx.user) ? OK : { ok: false, code: "ROLE", ...(whoCan ? { whoCan } : {}) }; } };
}

/** The job runs on the actor's own campus (SUPER_ADMIN may name a campus of its school). */
export function ownCampus(): Gate {
  return {
    id: "scope:own-campus", provenance: ["resolveCampusId"],
    async check(ctx) {
      if (!ctx.campusId) return { ok: false, code: "SCOPE" };
      return ctx.user.role === "SUPER_ADMIN" || ctx.campusId === ctx.user.campusId ? OK : { ok: false, code: "SCOPE" };
    },
  };
}

/** Operators hold a desk only while its seat holder is absent (src/lib/auth/seats.ts). */
export function seatVacantForOperator(seat: "principal" | "accountant" | "librarian" | "receptionist", holder: UserRole): Gate {
  return {
    id: `seat:${seat}`, provenance: ["getCampusSeats"],
    async check(ctx: CapabilityContext) {
      if (ctx.user.role === holder) return OK;
      if (ctx.user.role !== "ADMIN" && ctx.user.role !== "CAMPUS_ADMIN") return OK;
      return (await ctx.seats())[seat] ? { ok: false, code: "SEAT", whoCan: [holder] } : OK;
    },
  };
}

export async function runGates(ctx: CapabilityContext, gates: readonly Gate[]): Promise<GateResult> {
  for (const gate of gates) {
    const result = await gate.check(ctx);
    if (!result.ok) return result;
  }
  return OK;
}

/** Mandatory registry boundary, including entries whose custom gates accidentally omit a role gate. */
export async function checkCapabilityAccess(ctx: CapabilityContext, entry: CapabilityEntry): Promise<GateResult> {
  // Legacy prose receipts remain readable, but cannot be newly executed or replayed as verified reads.
  if (entry.key === "assistant.answer") return { ok: false, code: "CAPABILITY_KEY" };
  if (!entry.roles.includes(ctx.user.role)) return { ok: false, code: "ROLE", whoCan: entry.roles };
  if (entry.scope.kind === "platform" && ctx.user.role !== "APP_OWNER") return { ok: false, code: "SCOPE" };
  if (entry.scope.kind === "own-campus" || entry.scope.kind === "assigned-class") {
    const campus = await ownCampus().check(ctx);
    if (!campus.ok) return campus;
  }
  return runGates(ctx, entry.gates);
}
