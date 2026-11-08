import { beforeEach, mock } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Role-console test harness (SKAI-1022/1032, SKAI-1031, SKAI-1024).
 *
 * Root cause reproduced against dev with the serverless pool budget (connection_limit=1, pool_timeout=15): the
 * consoles fired 20+ reads at once, the ones still queued in Prisma's pool after 15 s failed with P2024, and that one
 * failure rejected the whole server action ("The … console could not be loaded"; Retry replayed the pile-up).
 *
 * The database, session and side services are replaced with in-memory fakes (module mocks; run with
 * --experimental-test-module-mocks), so these tests need no database: the fake `prisma` records how many reads are in
 * flight and can fail chosen `model.method` reads with P2024. Import this module before the code under test.
 */

const root = join(__dirname, "..", "..");
const src = (path: string) => pathToFileURL(join(root, "src", path)).href;

export const h = {
  session: null as Record<string, unknown> | null,
  failing: new Set<string>(),
  inFlight: 0,
  maxInFlight: 0,
  campuses: new Map<string, { id: string }[]>(),
  errors: [] as unknown[][],
};

function poolTimeout(read: string) {
  return Object.assign(new Error(`Invalid \`prisma.${read}\` invocation: Timed out fetching a new connection from the connection pool.`), { code: "P2024" });
}

function answer(model: string, method: string, args: any): unknown {
  if (method === "count") return 0;
  if (method === "aggregate") return { _sum: { totalAmount: null, totalAmountPaid: null }, _avg: { marksObtained: null }, _count: 0 };
  if (method === "findFirst" || method === "findUnique") return model === "campus" ? { id: args?.where?.id, name: "Main", city: "", regId: "", logoUrl: null, school: { name: "School", logoUrl: null } } : null;
  if (method === "findMany" && model === "campus") return h.campuses.get(args?.where?.schoolId) ?? [];
  return [];
}

const fakePrisma = new Proxy({}, {
  get: (_target, model: string) => new Proxy({}, {
    get: (_inner, method: string) => async (args: unknown) => {
      h.inFlight += 1;
      h.maxInFlight = Math.max(h.maxInFlight, h.inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (h.failing.has(`${model}.${method}`)) throw poolTimeout(`${model}.${method}`);
        return answer(model, method, args);
      } finally {
        h.inFlight -= 1;
      }
    },
  }),
});

mock.module(src("lib/auth.ts"), { namedExports: { getAuthUser: async () => h.session } });
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: fakePrisma, RLS_ENABLED: false } });
mock.module(src("lib/billing/entitlements.ts"), { namedExports: { assertSchoolOperational: async () => undefined } });
mock.module(src("lib/locale/store.ts"), { namedExports: { getLocalePackage: async () => ({ currency: "PKR" }) } });
mock.module(src("lib/academic/report-review-count.ts"), { namedExports: { pendingReportReviewCount: async () => 0 } });
mock.module(src("lib/academic/cycle.ts"), { namedExports: { getActiveAcademicYear: async () => 2026 } });
mock.module(src("lib/school-ai/announcement-history.ts"), { namedExports: { announcementHistoryRestriction: async () => ({}) } });

process.env.DATABASE_URL = "postgresql://u:p@db.example.invalid:6543/postgres?connection_limit=1";

export const SCHOOL = "school-standalone";
export const GROUP_SCHOOL = "school-group";
export const user = (role: string, extra: Record<string, unknown> = {}) => ({
  userId: `${role.toLowerCase()}-1`, schoolId: SCHOOL, campusId: "campus-1", role, email: `${role.toLowerCase()}@example.invalid`, fullName: role,
  institutionKind: "STANDALONE", isInstitutionOwner: false, ...extra,
});
export const groupUser = (role: string, extra: Record<string, unknown> = {}) => user(role, { schoolId: GROUP_SCHOOL, campusId: "campus-g1", institutionKind: "GROUP", ...extra });

/** True when a console.error line starting with `prefix` was logged (optionally with this Prisma code). */
export const logged = (prefix: string, code?: string) =>
  h.errors.some((args) => String(args[0]).includes(prefix) && (!code || (args[1] as { code?: string } | undefined)?.code === code));

const originalError = console.error;
beforeEach(() => {
  h.session = null; h.failing = new Set(); h.inFlight = 0; h.maxInFlight = 0; h.errors.length = 0;
  h.campuses.set(SCHOOL, [{ id: "campus-1" }]);
  console.error = (...args: unknown[]) => { h.errors.push(args); };
});
process.on("exit", () => { console.error = originalError; });

export const loadDashboard = () => import("../../src/app/actions/dashboard");
