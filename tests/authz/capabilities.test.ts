/**
 * role-ux §1.2 / §1.4 / §2.5 / G4 — capability keys, campus seats and the seat-dependent predicates.
 *
 * Runs without a database: an in-memory stand-in is injected through `globalThis.prisma` before the modules under
 * test are imported (src/lib/db/prisma.ts uses `globalThis.prisma ?? new PrismaClient()`). Only the query shapes
 * these modules use are answered; anything else returns an empty result, which every duty key treats as "no duty".
 */
import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import type { PermissionFlags } from "../../src/lib/permissions";

type Args = { where?: Record<string, unknown>; [key: string]: unknown } | undefined;
type Handler = (args: Args) => unknown;

const SCHOOL = "school-synthetic";
const CAMPUS = "campus-a";
const OTHER_CAMPUS = "campus-b";

/** Roles held by an active user on each campus (drives getCampusSeats). */
const state = {
  seats: new Map<string, Set<string>>(),
  children: 0,
  pickupChildren: 0,
  canteenEnabled: false,
  otherOperators: 0,
  otherAuthorities: 0,
  school: null as null | { registrationKind: string; institutionSetup: { institutionType: string } | null },
  owner: null as null | { role: string },
  users: [] as Array<{ id: string; fullName: string; role: string; isInstitutionOwner: boolean; canPurchaseSubscription: boolean }>,
  calls: [] as string[],
};

const handlers: Record<string, Record<string, Handler>> = {
  user: {
    groupBy: (args) => {
      const campusId = String(args?.where?.campusId ?? "");
      return [...(state.seats.get(campusId) ?? [])].map((role) => ({ role, _count: { _all: 1 } }));
    },
    count: (args) => {
      const where = args?.where ?? {};
      if (where.campusId) return state.otherOperators;
      return state.otherAuthorities;
    },
    findFirst: () => state.owner,
    findMany: (args) => {
      const role = (args?.where as { role?: string } | undefined)?.role;
      return state.users.filter((user) => !role || user.role === role);
    },
  },
  school: { findUnique: () => state.school },
  student: {
    count: (args) => {
      const and = (args?.where?.AND as Array<{ guardianRelationships?: { some?: { OR?: unknown } } }> | undefined) ?? [];
      const any = and.some((part) => Boolean(part.guardianRelationships?.some?.OR));
      return any ? state.children : state.pickupChildren;
    },
    findMany: () => Array.from({ length: state.children }, (_, index) => ({ id: `child-${index}`, campusId: CAMPUS })),
  },
  campusPackage: { count: () => (state.canteenEnabled ? 1 : 0) },
};

function delegate(name: string) {
  return new Proxy({}, {
    get(_target, operation) {
      if (typeof operation !== "string" || operation === "then") return undefined;
      return async (args: Args) => {
        state.calls.push(`${name}.${operation}`);
        const handler = handlers[name]?.[operation];
        if (handler) return handler(args);
        if (operation === "count") return 0;
        if (operation === "findMany" || operation === "groupBy") return [];
        if (operation === "findFirst" || operation === "findUnique") return null;
        throw new Error(`fake prisma: ${name}.${operation} is not supported`);
      };
    },
  });
}

const fakePrisma = new Proxy({}, {
  get(_target, property) {
    if (typeof property !== "string" || property === "then") return undefined;
    if (property === "$transaction") return async (fn: (tx: unknown) => unknown) => fn(fakePrisma);
    if (property.startsWith("$")) return async () => undefined;
    return delegate(property);
  },
});

let capabilitiesFor: typeof import("../../src/lib/navigation/capabilities").capabilitiesFor;
let CAPABILITY_KEYS: typeof import("../../src/lib/navigation/capability-keys").CAPABILITY_KEYS;
let getCampusSeats: typeof import("../../src/lib/auth/seats").getCampusSeats;
let scope: typeof import("../../src/lib/api/scope");
let server: typeof import("../../src/lib/auth/institution-server");
let permissions: typeof import("../../src/lib/permissions");

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
  (globalThis as { prisma?: unknown }).prisma = fakePrisma;
  // Duty lookups that the stand-in cannot answer fall back to false and log a warning; keep the output readable.
  console.warn = () => undefined;
  ({ capabilitiesFor } = await import("../../src/lib/navigation/capabilities"));
  ({ CAPABILITY_KEYS } = await import("../../src/lib/navigation/capability-keys"));
  ({ getCampusSeats } = await import("../../src/lib/auth/seats"));
  scope = await import("../../src/lib/api/scope");
  server = await import("../../src/lib/auth/institution-server");
  permissions = await import("../../src/lib/permissions");
});

beforeEach(() => {
  state.seats = new Map();
  state.children = 0;
  state.pickupChildren = 0;
  state.canteenEnabled = false;
  state.otherOperators = 0;
  state.otherAuthorities = 0;
  state.school = null;
  state.owner = null;
  state.users = [];
  state.calls = [];
});

function hold(campusId: string, ...roles: string[]) {
  state.seats.set(campusId, new Set(roles));
}

function actor(role: AuthUser["role"], changes: Partial<AuthUser> = {}): AuthUser {
  return { userId: `user-${role.toLowerCase()}`, schoolId: SCHOOL, campusId: CAMPUS, role, email: `${role.toLowerCase()}@example.invalid`, ...changes };
}

function permissionMap(role: string): Map<string, PermissionFlags> {
  return new Map(permissions.PERMISSION_MODULES.map((module) => [module, permissions.defaultFlagsForRole(role, module)]));
}

async function caps(user: AuthUser) {
  return capabilitiesFor(user, permissionMap(user.role));
}

const FIXTURES: Array<[string, AuthUser]> = [
  ["SA", actor("SUPER_ADMIN", { institutionKind: "GROUP", isInstitutionOwner: true, campusId: null, mfaVerified: true })],
  ["SO", actor("ADMIN", { institutionKind: "STANDALONE", isInstitutionOwner: true })],
  ["CA", actor("CAMPUS_ADMIN", { institutionKind: "GROUP", canManageMemberships: true })],
  ["PR", actor("PRINCIPAL", { institutionKind: "GROUP" })],
  ["TE", actor("TEACHER", { institutionKind: "GROUP" })],
  ["AC", actor("ACCOUNTANT", { institutionKind: "GROUP" })],
  ["RE", actor("RECEPTIONIST", { institutionKind: "GROUP" })],
  ["LI", actor("LIBRARIAN", { institutionKind: "GROUP" })],
  ["PA", actor("PARENT", { institutionKind: "GROUP", campusId: null })],
  ["ST", actor("STUDENT", { institutionKind: "GROUP" })],
  ["AO", actor("APP_OWNER", { campusId: null })],
];

test("every fixture gets exactly the capability keys, each a boolean", async () => {
  hold(CAMPUS, "PRINCIPAL", "ACCOUNTANT");
  for (const [label, user] of FIXTURES) {
    for (const children of label === "PA" ? [1, 2] : [0]) {
      state.children = children;
      state.pickupChildren = children;
      const result = await caps(user);
      assert.deepEqual(Object.keys(result).sort(), [...CAPABILITY_KEYS].sort(), `${label}: keys`);
      for (const [key, value] of Object.entries(result)) assert.equal(typeof value, "boolean", `${label}.${key}`);
    }
  }
});

test("institution keys follow the authority helper (SA, SO, CA, PR)", async () => {
  hold(CAMPUS, "CAMPUS_ADMIN", "PRINCIPAL");
  const sa = await caps(FIXTURES[0][1]);
  assert.equal(sa.institutionAuthority, true);
  assert.equal(sa.billing, true);
  assert.equal(sa.groupConsole, true);
  assert.equal(sa.standaloneOwner, false);
  assert.equal(sa.campusOps, false, "the group admin never holds campus operations in the UI");
  assert.equal(sa.inviteLeaders, true);
  assert.equal(sa.mfaVerified, true);
  assert.equal(sa.recordSearch, false);
  assert.equal(sa.academicLead || sa.financeDesk || sa.frontDesk || sa.libraryDesk, false, "no desk for the group admin");

  const so = await caps(FIXTURES[1][1]);
  assert.equal(so.institutionAuthority, true);
  assert.equal(so.billing, true);
  assert.equal(so.standaloneOwner, true);
  assert.equal(so.groupConsole, false);
  assert.equal(so.campusOps, true, "one person, two hats");
  assert.equal(so.groupCampus, false);
  assert.equal(so.standaloneDeputy, false);

  const ca = await caps(FIXTURES[2][1]);
  assert.equal(ca.institutionAuthority, false);
  assert.equal(ca.billing, false);
  assert.equal(ca.campusOps, true);
  assert.equal(ca.groupCampus, true);
  assert.equal(ca.memberships, true, "delegated membership management");
  assert.equal(ca.inviteLeaders, false);
  assert.equal(ca.recordSearch, true);

  const deputy = await caps(actor("CAMPUS_ADMIN", { institutionKind: "STANDALONE" }));
  assert.equal(deputy.standaloneDeputy, true);
  assert.equal(deputy.groupCampus, false);
  assert.equal(deputy.memberships, false);

  const pr = await caps(FIXTURES[3][1]);
  assert.equal(pr.campusOps, false);
  assert.equal(pr.academicLead, true);
  assert.equal(pr.improvementLead, true);
  assert.equal(pr.recordSearch, true);
  assert.equal(pr.billing, false);
});

test("a stale purchase flag or the owner flag on a non-authority never shows Billing & plan", async () => {
  for (const user of [
    actor("CAMPUS_ADMIN", { institutionKind: "GROUP", canPurchaseSubscription: true }),
    actor("PRINCIPAL", { institutionKind: "GROUP", canPurchaseSubscription: true }),
    actor("ADMIN", { institutionKind: "GROUP", isInstitutionOwner: true }),
    actor("SUPER_ADMIN", { institutionKind: "GROUP", campusId: null }),
  ]) {
    assert.equal((await caps(user)).billing, false, `${user.role} ${JSON.stringify(user)}`);
  }
});

test("fallback desks follow the mocked campus seats", async () => {
  const ca = FIXTURES[2][1];
  hold(CAMPUS, "CAMPUS_ADMIN", "PRINCIPAL", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN");
  let result = await caps(ca);
  assert.deepEqual([result.academicLead, result.financeDesk, result.frontDesk, result.libraryDesk], [false, false, false, false], "every seat held");
  assert.deepEqual([result.hasCampusAdmin, result.hasPrincipal, result.hasAccountant, result.hasReceptionist, result.hasLibrarian], [true, true, true, true, true]);

  hold(CAMPUS, "CAMPUS_ADMIN", "PRINCIPAL");
  result = await caps(ca);
  assert.deepEqual([result.academicLead, result.financeDesk, result.frontDesk, result.libraryDesk], [false, true, true, true], "only the principal seat is held");

  hold(CAMPUS, "CAMPUS_ADMIN");
  result = await caps(ca);
  assert.deepEqual([result.academicLead, result.financeDesk, result.frontDesk, result.libraryDesk], [true, true, true, true], "the operator holds every vacant desk");

  // Specialists hold their own desk whatever the seats say; they never hold another one.
  for (const [role, key] of [["PRINCIPAL", "academicLead"], ["ACCOUNTANT", "financeDesk"], ["RECEPTIONIST", "frontDesk"], ["LIBRARIAN", "libraryDesk"]] as const) {
    const own = await caps(actor(role, { institutionKind: "GROUP" }));
    for (const desk of ["academicLead", "financeDesk", "frontDesk", "libraryDesk"] as const) assert.equal(own[desk], desk === key, `${role}.${desk}`);
  }

  // A principal on a campus with no campus admin sees the vacancy (copy only, §2.6).
  hold(CAMPUS, "PRINCIPAL");
  assert.equal((await caps(FIXTURES[3][1])).hasCampusAdmin, false);
});

test("an operator with no campus holds no fallback desk, matching canLeadAcademics (same predicate as the API)", async () => {
  hold(CAMPUS, "CAMPUS_ADMIN");
  for (const user of [actor("CAMPUS_ADMIN", { institutionKind: "GROUP", campusId: null }), actor("ADMIN", { institutionKind: "STANDALONE", campusId: null })]) {
    const result = await caps(user);
    assert.deepEqual([result.academicLead, result.financeDesk, result.frontDesk, result.libraryDesk], [false, false, false, false], `${user.role} without a campus`);
    assert.equal(result.academicLead, await scope.canLeadAcademics(user), `${user.role}: nav key and server predicate agree`);
    // Naming a principal-less campus does not lend an unpinned operator its desk or its SD3 checker seat (§7).
    assert.equal(await scope.canLeadAcademics(user, CAMPUS), false, `${user.role}: no academic lead on a campus it is not pinned to`);
    assert.equal(await scope.soleChecker("finance", user, CAMPUS), false, `${user.role}: never the sole finance checker of a campus`);
    assert.equal(await scope.soleChecker("purchase", user, CAMPUS), false, `${user.role}: never the sole purchase checker of a campus`);
    assert.equal(result.campusOps, true, "still a campus operator by role");
  }
  // A pinned operator answers for its own principal-less campus only.
  const pinned = actor("CAMPUS_ADMIN", { institutionKind: "GROUP", campusId: CAMPUS });
  assert.equal(await scope.canLeadAcademics(pinned, CAMPUS), true, "own campus without a principal");
  assert.equal(await scope.canLeadAcademics(pinned, "campus-elsewhere"), false, "never another campus");
  assert.equal(await scope.soleChecker("finance", pinned, "campus-elsewhere"), false, "never another campus's checker");
  // Specialists keep their own desk by role even before a campus is set.
  assert.equal((await caps(actor("PRINCIPAL", { institutionKind: "GROUP", campusId: null }))).academicLead, true);
  assert.equal((await caps(actor("ACCOUNTANT", { institutionKind: "GROUP", campusId: null }))).financeDesk, true);
});

test("roles short-circuit before any query: the group admin, families and the platform operator read no seats", async () => {
  for (const label of ["SA", "AO"]) {
    state.calls = [];
    await caps(FIXTURES.find(([name]) => name === label)![1]);
    assert.equal(state.calls.filter((call) => call === "user.groupBy").length, 0, `${label} reads no seats`);
    assert.equal(state.calls.length, 0, `${label} runs no query at all`);
  }
  state.calls = [];
  await caps(FIXTURES[2][1]);
  assert.equal(state.calls.filter((call) => call === "user.groupBy").length, 1, "one seat lookup for a campus operator");
});

test("family keys: pickup, child switcher and canteen", async () => {
  const parent = FIXTURES[8][1];
  state.children = 1; state.pickupChildren = 1; state.canteenEnabled = true;
  let result = await caps(parent);
  assert.equal(result.multiChild, false);
  assert.equal(result.pickupGuardian, true);
  assert.equal(result.pkgCanteen, true);
  assert.equal(result.recordSearch, false);
  assert.equal(result.corrections, true);

  state.children = 2; state.pickupChildren = 0; state.canteenEnabled = false;
  result = await caps(parent);
  assert.equal(result.multiChild, true);
  assert.equal(result.pickupGuardian, false);
  assert.equal(result.pkgCanteen, false);

  const student = await caps(FIXTURES[9][1]);
  assert.equal(student.schoolAiExams, true);
  assert.equal(student.schoolAi, true);

  const owner = await caps(FIXTURES[10][1]);
  assert.equal(owner.schoolAi, true, "the platform operator has its own AI workspace");
  assert.equal(Object.entries(owner).some(([key, value]) => key !== "schoolAi" && value), false, "the platform operator has no school capability");
});

test("getCampusSeats: one groupBy; an empty or unknown campus holds nothing", async () => {
  hold(CAMPUS, "ADMIN", "LIBRARIAN");
  assert.deepEqual(await getCampusSeats(SCHOOL, CAMPUS), { campusAdmin: true, principal: false, accountant: false, receptionist: false, librarian: true });
  assert.deepEqual(await getCampusSeats(SCHOOL, null), { campusAdmin: false, principal: false, accountant: false, receptionist: false, librarian: false });
  assert.deepEqual(await getCampusSeats(SCHOOL, "campus-unknown"), { campusAdmin: false, principal: false, accountant: false, receptionist: false, librarian: false });
});

test("canLeadAcademics: principal always; a campus operator only on its own campus while no principal is active", async () => {
  hold(CAMPUS, "CAMPUS_ADMIN", "PRINCIPAL");
  assert.equal(await scope.canLeadAcademics(actor("PRINCIPAL")), true);
  assert.equal(await scope.canLeadAcademics(actor("CAMPUS_ADMIN")), false);
  hold(CAMPUS, "CAMPUS_ADMIN");
  assert.equal(await scope.canLeadAcademics(actor("CAMPUS_ADMIN")), true);
  assert.equal(await scope.canLeadAcademics(actor("ADMIN", { institutionKind: "STANDALONE" })), true);
  assert.equal(await scope.canLeadAcademics(actor("CAMPUS_ADMIN"), OTHER_CAMPUS), false, "never answers for another campus");
  assert.equal(await scope.canLeadAcademics(actor("SUPER_ADMIN", { campusId: null, institutionKind: "GROUP" }), CAMPUS), false, "the group admin is never the academic lead");
  assert.equal(await scope.canLeadAcademics(actor("TEACHER")), false);
});

test("purpose predicates (§1.3): no campus operations for the principal; the accountant gains finance", () => {
  const table: Array<[AuthUser["role"], boolean, boolean, boolean, boolean]> = [
    // role, academics, campusOps, finance, approveFinance
    ["SUPER_ADMIN", true, true, true, true],
    ["CAMPUS_ADMIN", true, true, true, true],
    ["ADMIN", true, true, true, true],
    ["PRINCIPAL", true, false, false, false],
    ["ACCOUNTANT", false, false, true, false],
    ["TEACHER", false, false, false, false],
    ["RECEPTIONIST", false, false, false, false],
    ["PARENT", false, false, false, false],
  ];
  for (const [role, academics, campusOps, finance, approve] of table) {
    const user = actor(role);
    assert.equal(scope.canManageAcademics(user), academics, `${role} academics`);
    assert.equal(scope.canManageOperations(user), academics, `${role} operations (deprecated alias)`);
    assert.equal(scope.canManageCampusOps(user), campusOps, `${role} campus ops`);
    assert.equal(scope.canManageFinance(user), finance, `${role} finance`);
    assert.equal(scope.canApproveFinance(user), approve, `${role} approve finance`);
    assert.equal(scope.canManageTuition(user), finance, `${role} tuition`);
  }
});

test("soleChecker (SD3): only when no other active holder of the checker seat exists", async () => {
  const operator = actor("CAMPUS_ADMIN", { institutionKind: "GROUP" });
  state.otherOperators = 0;
  assert.equal(await scope.soleChecker("finance", operator, CAMPUS), true);
  assert.equal(await scope.soleChecker("purchase", operator, CAMPUS), true);
  state.otherOperators = 1;
  assert.equal(await scope.soleChecker("finance", operator, CAMPUS), false);
  state.otherOperators = 0;
  assert.equal(await scope.soleChecker("finance", operator, OTHER_CAMPUS), false, "never for another campus");
  assert.equal(await scope.soleChecker("finance", actor("ACCOUNTANT"), CAMPUS), false, "the accountant is the maker seat");
  assert.equal(await scope.soleChecker("finance", actor("SUPER_ADMIN", { campusId: null, institutionKind: "GROUP" }), CAMPUS), false, "break-glass is not a checker seat");

  const groupAdmin = actor("SUPER_ADMIN", { campusId: null, institutionKind: "GROUP", isInstitutionOwner: true });
  state.otherAuthorities = 0;
  assert.equal(await scope.soleChecker("policy", groupAdmin, null), true);
  assert.equal(await scope.soleChecker("tax", groupAdmin, null), true);
  state.otherAuthorities = 1;
  assert.equal(await scope.soleChecker("policy", groupAdmin, null), false);
  assert.equal(await scope.soleChecker("tax", actor("CAMPUS_ADMIN", { institutionKind: "GROUP" }), null), false, "tax sign-off is the authority's");
  assert.equal(await scope.soleChecker("tax", actor("ADMIN"), null), false, "unknown kind fails closed");
});

test("kind resolution: stored signals first; the owner-role lookup runs only when both are unresolved", async () => {
  state.school = { registrationKind: "STANDALONE", institutionSetup: null };
  state.owner = { role: "SUPER_ADMIN" };
  state.calls = [];
  assert.equal(await server.getInstitutionKind(SCHOOL), "STANDALONE");
  assert.equal(state.calls.includes("user.findFirst"), false, "no owner lookup when registrationKind is settled");

  state.school = { registrationKind: "UNVERIFIED", institutionSetup: { institutionType: "GROUP" } };
  assert.equal(await server.getInstitutionKind(SCHOOL), "GROUP");

  state.school = { registrationKind: "UNVERIFIED", institutionSetup: null };
  state.owner = { role: "ADMIN" };
  state.calls = [];
  assert.equal(await server.getInstitutionKind(SCHOOL), "STANDALONE");
  assert.equal(state.calls.includes("user.findFirst"), true);

  state.owner = null;
  assert.equal(await server.getInstitutionKind(SCHOOL), "GROUP", "fails toward GROUP");
});

test("subscription owners: authority role with the owner flag or a purchase delegation; nobody else", async () => {
  state.school = { registrationKind: "GROUP", institutionSetup: null };
  state.users = [
    { id: "u1", fullName: "Owner", role: "SUPER_ADMIN", isInstitutionOwner: true, canPurchaseSubscription: false },
    { id: "u2", fullName: "Delegate", role: "SUPER_ADMIN", isInstitutionOwner: false, canPurchaseSubscription: true },
  ];
  assert.deepEqual(await server.getSubscriptionOwners(SCHOOL), [{ id: "u1", fullName: "Owner" }, { id: "u2", fullName: "Delegate" }]);
  state.users = [{ id: "u3", fullName: "Campus", role: "CAMPUS_ADMIN", isInstitutionOwner: false, canPurchaseSubscription: true }];
  assert.deepEqual(await server.getSubscriptionOwners(SCHOOL), [], "a stale flag outside the authority role pays for nothing");
});

test("who leads and who pays in one read: a known kind skips the school lookup (session route, §1.5)", async () => {
  state.school = { registrationKind: "GROUP", institutionSetup: null };
  state.users = [
    { id: "u1", fullName: "Owner", role: "SUPER_ADMIN", isInstitutionOwner: true, canPurchaseSubscription: false },
    { id: "u2", fullName: "Second group admin", role: "SUPER_ADMIN", isInstitutionOwner: false, canPurchaseSubscription: false },
    { id: "u3", fullName: "Delegate", role: "SUPER_ADMIN", isInstitutionOwner: false, canPurchaseSubscription: true },
  ];
  state.calls = [];
  const contacts = await server.getInstitutionContacts(SCHOOL, { kind: "GROUP" });
  assert.deepEqual(contacts.authorities.map((row) => row.id), ["u1", "u2", "u3"]);
  assert.deepEqual(contacts.subscriptionOwners, [{ id: "u1", fullName: "Owner" }, { id: "u3", fullName: "Delegate" }]);
  assert.deepEqual(state.calls, ["user.findMany"], "one user read, no school read");
  // The single-purpose helpers take the known kind too; without it they resolve it once.
  state.calls = [];
  await server.getSubscriptionOwners(SCHOOL, undefined, "GROUP");
  await server.getInstitutionAuthorities(SCHOOL, undefined, "GROUP");
  assert.equal(state.calls.includes("school.findUnique"), false);
  state.calls = [];
  await server.getInstitutionContacts(SCHOOL);
  assert.deepEqual(state.calls, ["school.findUnique", "user.findMany"]);
});

test("the session route reads institution contacts once, with the session's kind", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../../src/app/api/auth/session/route.ts", import.meta.url), "utf8");
  assert.match(route, /getInstitutionContacts\(user\.schoolId, \{ kind: kindFor\(user\) \?\? undefined \}\)/);
  assert.doesNotMatch(route, /getInstitutionAuthorities\(|getSubscriptionOwners\(/, "no second scan");
});

test("server-only helpers fail a client build instead of bundling Prisma (§1.1a)", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["src/lib/auth/institution-server.ts", "src/lib/auth/seats.ts", "src/lib/navigation/capabilities.ts"]) {
    assert.match(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"), /^(\/\/.*\n)*import "server-only";/m, file);
  }
});

test("serviceAgent: an open request keeps the agent queue; one the person owned and closed does not", async () => {
  const requests: Array<{ ownerId: string; status: string }> = [{ ownerId: "user-teacher", status: "CLOSED" }, { ownerId: "user-teacher", status: "RESOLVED" }];
  handlers.serviceRequest = {
    count: (args) => {
      const where = (args?.where ?? {}) as { ownerId?: string; status?: { in?: string[] } };
      return requests.filter((row) => row.ownerId === where.ownerId && (!where.status?.in || where.status.in.includes(row.status))).length;
    },
  };
  try {
    const teacher = { ...actor("TEACHER", { institutionKind: "GROUP" }), userId: "user-teacher" };
    assert.equal((await caps(teacher)).serviceAgent, false, "closed and resolved requests only");
    requests.push({ ownerId: "user-teacher", status: "IN_PROGRESS" });
    assert.equal((await caps(teacher)).serviceAgent, true, "an open request");
  } finally {
    delete handlers.serviceRequest;
  }
});

test("flagships: role-scoped AI Workflows and academic-seat Exam Studio", async () => {
  hold(CAMPUS, "CAMPUS_ADMIN", "PRINCIPAL");
  const sa = FIXTURES[0][1], so = FIXTURES[1][1], ca = FIXTURES[2][1], pr = FIXTURES[3][1], te = FIXTURES[4][1];
  // AI Workflows (`schoolAi`): each supported role gets its own permission-gated workspace.
  for (const user of [sa, so, ca, pr]) assert.equal((await caps(user)).schoolAi, true, `${user.role}: AI Workflows`);
  for (const label of ["AC", "RE", "LI", "PA", "ST", "AO"]) {
    assert.equal((await caps(FIXTURES.find(([name]) => name === label)![1])).schoolAi, true, `${label}: role-scoped AI Workflows`);
  }
  // Exam Studio (`schoolAiExams`): principal and teacher; never the group admin or the office roles.
  for (const user of [pr, te]) assert.equal((await caps(user)).schoolAiExams, true, `${user.role}: Exam Studio`);
  for (const label of ["SA", "AC", "RE", "LI", "PA", "AO"]) {
    assert.equal((await caps(FIXTURES.find(([name]) => name === label)![1])).schoolAiExams, false, `${label}: no Exam Studio`);
  }
  // A campus operator only while it is the academic lead (no principal on its campus).
  assert.equal((await caps(ca)).schoolAiExams, false, "CA beside a principal");
  hold(CAMPUS, "CAMPUS_ADMIN");
  assert.equal((await caps(ca)).schoolAiExams, true, "CA on a campus with no principal");
  hold(CAMPUS, "ADMIN");
  assert.equal((await caps(so)).schoolAiExams, true, "standalone owner with no principal");
  // Same gate as /ai/studio: without exams view (or School AI view) the entry is hidden.
  const noExams = permissionMap("TEACHER");
  noExams.set("exams", { canView: false, canAdd: false, canEdit: false, canDelete: false });
  assert.equal((await capabilitiesFor(te, noExams)).schoolAiExams, false, "teacher without exams view");
  const noAi = permissionMap("PRINCIPAL");
  noAi.set("ai", { canView: false, canAdd: false, canEdit: false, canDelete: false });
  const principal = await capabilitiesFor(pr, noAi);
  assert.deepEqual([principal.schoolAi, principal.schoolAiExams], [false, false], "principal without School AI view");
  // A student keeps secure exam delivery ("My online exams").
  assert.equal((await caps(FIXTURES[9][1])).schoolAiExams, true);
});
