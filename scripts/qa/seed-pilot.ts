/**
 * SKAI-999 / QA-01 — synthetic pilot test data + QA accounts.
 *
 * Creates TWO synthetic schools (tenants) on a LOCAL/DEV database, each with two
 * campuses and one QA account per role, plus a no-access account for denied-role
 * tests. Names are in EN / UR / AR (RTL) with long and mixed-script samples.
 *
 * Safety (G-01 / NFR-SEC-09):
 *   - Fails closed on internet-facing environments (production/staging/qa host
 *     or a hosted DB) unless ALLOW_HOSTED_SEED=1 is set for a deliberate dev run.
 *   - Every account gets a UNIQUE strong password. No shared demo password.
 *   - Passwords are written to $QA_CREDENTIALS_FILE (default ./qa-credentials.json,
 *     git-ignored) for transfer to the team password manager — NEVER committed,
 *     never printed in full to the console.
 *
 * Run:  pnpm run qa:seed            (seed/refresh)
 *       pnpm run qa:seed -- --reset (drop the two QA schools first, then seed)
 */
import { PrismaClient, type UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const prisma = new PrismaClient();

// ─── env guard (self-contained; mirrors prisma/seed-guard) ───────────────────
const HOSTED_MARKERS = ["supabase.com", "supabase.co", "rds.amazonaws.com", "neon.tech", "render.com", "railway.app"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];

function dbHost(url?: string): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase(); }
  catch { const m = url.match(/@([^:/?]+)/); return m ? m[1].toLowerCase() : null; }
}

function assertSeedAllowed() {
  const env = process.env;
  const name = (env.APP_ENV || env.VERCEL_ENV || env.ENVIRONMENT || env.NODE_ENV || "development").toLowerCase();
  if (["production", "prod", "staging", "qa", "preview"].includes(name)) {
    throw new Error(`[qa-seed] refusing: environment "${name}" is internet-facing (NFR-SEC-09)`);
  }
  const host = dbHost(env.DIRECT_URL || env.DATABASE_URL);
  const hosted = HOSTED_MARKERS.find((m) => host?.includes(m));
  if (hosted && env.ALLOW_HOSTED_SEED !== "1") {
    throw new Error(`[qa-seed] refusing: DB host "${host}" looks hosted; set ALLOW_HOSTED_SEED=1 for a deliberate dev seed`);
  }
  if (!hosted && host && !LOCAL_HOSTS.includes(host)) {
    throw new Error(`[qa-seed] refusing: DB host "${host}" is not a known local host (NFR-SEC-09)`);
  }
  return { name, host: host ?? "unknown" };
}

// ─── strong unique password generator ────────────────────────────────────────
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ", LOWER = "abcdefghijkmnpqrstuvwxyz", DIGIT = "23456789", SYM = "!@#$%^&*?";
function strongPassword(): string {
  const all = UPPER + LOWER + DIGIT + SYM;
  const pick = (set: string) => set[randomBytes(1)[0] % set.length];
  let p = pick(UPPER) + pick(LOWER) + pick(DIGIT) + pick(SYM);
  for (let i = 0; i < 12; i++) p += pick(all);
  // Fisher–Yates shuffle
  const a = p.split("");
  for (let i = a.length - 1; i > 0; i--) { const j = randomBytes(1)[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.join("");
}

// ─── synthetic tenants (EN / UR / AR names, incl. long + mixed script) ───────
type RoleDef = { role: UserRole; key: string; fullName: string };
const ROLES: RoleDef[] = [
  { role: "SUPER_ADMIN", key: "owner", fullName: "QA Owner / مالک الحساب" },
  { role: "CAMPUS_ADMIN", key: "admin", fullName: "QA Admin عبد الرحمٰن الإداري" },
  { role: "PRINCIPAL", key: "principal", fullName: "QA Principal مدیر المدرسة الطويل الاسم" },
  { role: "TEACHER", key: "teacher", fullName: "QA Teacher محمد استاد" },
  { role: "ACCOUNTANT", key: "accountant", fullName: "QA Accountant محاسب" },
  { role: "PARENT", key: "guardian", fullName: "QA Guardian ولی أمر الطفلين" },
  { role: "STUDENT", key: "student", fullName: "QA Student طالب علم" },
];
// A real role that is given NO campus/scope, for denied-role tests.
const NO_ACCESS: RoleDef = { role: "RECEPTIONIST", key: "noaccess", fullName: "QA No-Access بدون صلاحية" };

const SCHOOLS = [
  { slug: "qa-alpha", name: "QA Alpha School / مدرسة ألفا", city: "Lahore",
    campuses: [{ regId: "QA-A-C1", name: "Alpha Main / الحرم الرئيسي", city: "Lahore", board: "Lahore Board" },
               { regId: "QA-A-C2", name: "Alpha North / الحرم الشمالي", city: "Lahore", board: "Lahore Board" }] },
  { slug: "qa-beta", name: "QA Beta School / مدرسة بيتا", city: "Karachi",
    campuses: [{ regId: "QA-B-C1", name: "Beta Main / بيتا الرئيسي", city: "Karachi", board: "Sindh Board" },
               { regId: "QA-B-C2", name: "Beta South / بيتا الجنوبي", city: "Karachi", board: "Sindh Board" }] },
];

const PHONE_BASE = 92300_0000000; // synthetic +92-300 test range

async function main() {
  const decision = assertSeedAllowed();
  const reset = process.argv.includes("--reset");
  console.log(`🧪 QA pilot seed (${decision.name} @ ${decision.host})${reset ? " [--reset]" : ""}`);

  const credentials: Array<{ school: string; role: string; email: string; password: string }> = [];
  let phone = PHONE_BASE;

  for (const s of SCHOOLS) {
    if (reset) {
      const existing = await prisma.school.findUnique({ where: { slug: s.slug } });
      if (existing) { await prisma.school.delete({ where: { id: existing.id } }); console.log(`  ↺ dropped ${s.slug}`); }
    }
    const school = await prisma.school.upsert({
      where: { slug: s.slug },
      update: { name: s.name, city: s.city, status: "ACTIVE" },
      create: { name: s.name, slug: s.slug, city: s.city, regId: `SCH-${s.slug.toUpperCase()}`,
        contactEmail: `admin@${s.slug}.qa.local`, plan: "PRO", status: "ACTIVE", aiCreditsLimit: 1000 },
    });
    const campuses = [];
    for (const c of s.campuses) {
      campuses.push(await prisma.campus.upsert({
        where: { regId: c.regId },
        update: { name: c.name },
        create: { schoolId: school.id, name: c.name, city: c.city, regId: c.regId, board: c.board },
      }));
    }
    console.log(`  ✓ ${school.name} (${campuses.length} campuses)`);

    for (const def of [...ROLES, NO_ACCESS]) {
      const email = `${def.key}@${s.slug}.qa.local`;
      const password = strongPassword();
      const hash = await bcrypt.hash(password, 10);
      const scoped = def.key !== "owner" && def.key !== "noaccess";
      await prisma.user.upsert({
        where: { schoolId_email: { schoolId: school.id, email } },
        update: { password: hash, role: def.role, isActive: true },
        create: {
          email, fullName: def.fullName, role: def.role, password: hash,
          schoolId: school.id, campusId: scoped ? campuses[0].id : undefined,
          isActive: true, onboardingComplete: true,
          phone: `+${String(++phone)}`,
        },
      });
      credentials.push({ school: s.slug, role: def.key, email, password });
    }
  }

  // Write credentials for the password manager — git-ignored, never committed.
  const out = process.env.QA_CREDENTIALS_FILE || "qa-credentials.json";
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), note: "SKAI-999 synthetic QA accounts — move to the team password manager, then delete this file. Do NOT commit.", accounts: credentials }, null, 2), { mode: 0o600 });
  console.log(`\n✅ Seeded ${credentials.length} QA accounts across ${SCHOOLS.length} schools.`);
  console.log(`   Credentials written to ${out} (git-ignored, mode 600) — transfer to the password manager, then delete.`);
  console.log(`   Passwords are NOT printed here (NFR-SEC-09).`);
}

main().catch((e) => { console.error("❌ QA seed failed:", e); process.exit(1); }).finally(() => prisma.$disconnect());
