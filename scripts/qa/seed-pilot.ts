/**
 * SKAI-999 / QA-01 — synthetic pilot test data + QA accounts.
 *
 * Creates THREE synthetic schools (tenants) on a LOCAL/DEV database: two GROUP
 * schools (qa-alpha, qa-beta) with two campuses each, and one STANDALONE school
 * (qa-solo, SKAI-1066) with one campus whose ADMIN is the institution owner.
 * Each gets one QA account per role, plus a no-access account for denied-role
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
 *       pnpm run qa:seed -- --reset (drop the QA schools first, then seed)
 *       pnpm run qa:seed -- --platform-owner-only
 *         (SKAI-1788: upsert only the APP_OWNER account and merge it into an existing
 *          $QA_CREDENTIALS_FILE; every other account and password is left alone)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PLATFORM_OWNER, SCHOOLS, mergeCredentials, platformOwnerBlockedBy, rolesFor, type SeedCredential } from "./pilot-seed-plan";

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

// ─── synthetic tenants: see ./pilot-seed-plan (GROUP x2 + STANDALONE x1) ─────
const PHONE_BASE = 92300_0000000; // synthetic +92-300 test range

// QA accounts skip the inbox and the factor: email already verified, no password change forced, and no
// factor enrolled, so privileged roles sign in through the existing "Do it later" MFA deferral.
const READY_FLAGS = { emailVerifiedAt: new Date(), mustChangePassword: false, onboardingComplete: true, mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaPendingTicket: null, mfaPendingExpiresAt: null, mfaPendingVerified: false, mfaEnrolledAt: null };

/**
 * SKAI-1788: idempotent synthetic APP_OWNER in the host QA school (created by the main seed).
 * Returns null (and changes nothing) when another platform owner exists, because the dev DB
 * allows only one APP_OWNER (trigger users_single_app_owner) and would raise P2002.
 */
async function seedPlatformOwner(): Promise<SeedCredential | null> {
  const owners = await prisma.user.findMany({ where: { role: PLATFORM_OWNER.role }, select: { email: true } });
  const blocker = platformOwnerBlockedBy(owners.map((o) => o.email));
  if (blocker) {
    console.warn(`  ⚠ skipped platform owner: this DB already has a different APP_OWNER and allows only one; use that account for /owner QA`);
    return null;
  }
  const host = await prisma.school.findUnique({ where: { slug: PLATFORM_OWNER.hostSchool } });
  if (!host) throw new Error(`[qa-seed] ${PLATFORM_OWNER.hostSchool} is missing; run the full QA seed first`);
  const password = strongPassword();
  const hash = await bcrypt.hash(password, 10);
  const flags = { role: PLATFORM_OWNER.role, isActive: true, isInstitutionOwner: false, canPurchaseSubscription: false, canManageMemberships: false, campusId: null, ...READY_FLAGS };
  await prisma.user.upsert({
    where: { schoolId_email: { schoolId: host.id, email: PLATFORM_OWNER.email } },
    update: { password: hash, ...flags },
    create: { email: PLATFORM_OWNER.email, fullName: PLATFORM_OWNER.fullName, password: hash, schoolId: host.id, ...flags },
  });
  return { school: PLATFORM_OWNER.school, role: PLATFORM_OWNER.key, email: PLATFORM_OWNER.email, password };
}

function writeCredentials(out: string, accounts: SeedCredential[]) {
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), note: "SKAI-999 synthetic QA accounts — move to the team password manager, then delete this file. Do NOT commit.", accounts }, null, 2), { mode: 0o600 });
}

async function main() {
  const decision = assertSeedAllowed();
  const reset = process.argv.includes("--reset");
  const out = process.env.QA_CREDENTIALS_FILE || "qa-credentials.json";
  if (process.argv.includes("--platform-owner-only")) {
    console.log(`🧪 QA pilot seed (${decision.name} @ ${decision.host}) [--platform-owner-only]`);
    const existing: SeedCredential[] = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")).accounts ?? [] : [];
    const owner = await seedPlatformOwner();
    if (!owner) { process.exitCode = 2; return; }
    writeCredentials(out, mergeCredentials(existing, [owner]));
    console.log(`✅ Platform owner ${PLATFORM_OWNER.email} upserted; credentials merged into ${out} (passwords not printed).`);
    return;
  }
  console.log(`🧪 QA pilot seed (${decision.name} @ ${decision.host})${reset ? " [--reset]" : ""}`);

  const credentials: SeedCredential[] = [];
  let phone = PHONE_BASE;

  for (const s of SCHOOLS) {
    if (reset) {
      const existing = await prisma.school.findUnique({ where: { slug: s.slug } });
      if (existing) { await prisma.school.delete({ where: { id: existing.id } }); console.log(`  ↺ dropped ${s.slug}`); }
    }
    const school = await prisma.school.upsert({
      where: { slug: s.slug },
      update: { name: s.name, city: s.city, status: "ACTIVE", registrationKind: s.kind },
      create: { name: s.name, slug: s.slug, city: s.city, regId: `SCH-${s.slug.toUpperCase()}`, registrationKind: s.kind,
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

    for (const def of rolesFor(s.kind)) {
      const email = `${def.key}@${s.slug}.qa.local`;
      const password = strongPassword();
      const hash = await bcrypt.hash(password, 10);
      // STANDALONE admin = registering owner (register.ts): owner + purchase + membership flags.
      const ownerFlags = { isInstitutionOwner: def.owner === true, canPurchaseSubscription: def.owner === true, canManageMemberships: def.owner === true };
      const readyFlags = READY_FLAGS;
      await prisma.user.upsert({
        where: { schoolId_email: { schoolId: school.id, email } },
        update: { password: hash, role: def.role, isActive: true, ...ownerFlags, ...readyFlags },
        create: {
          email, fullName: def.fullName, role: def.role, password: hash,
          schoolId: school.id, campusId: def.scoped ? campuses[0].id : undefined, ...ownerFlags, ...readyFlags,
          isActive: true,
          phone: `+${String(++phone)}`,
        },
      });
      credentials.push({ school: s.slug, role: def.key, email, password });
    }
  }

  // Write school credentials BEFORE the platform-owner step: their passwords are already changed in the DB,
  // so a failure there must never lose them (SKAI-1788 regression on dev).
  writeCredentials(out, credentials);
  try {
    const owner = await seedPlatformOwner();
    if (owner) { credentials.push(owner); writeCredentials(out, credentials); }
  } catch (e) {
    console.error(`  ⚠ platform owner step failed; school credentials are already saved to ${out}:`, e);
    process.exitCode = 1;
  }
  console.log(`\n✅ Seeded ${credentials.length} QA accounts across ${SCHOOLS.length} schools.`);
  console.log(`   Credentials written to ${out} (git-ignored, mode 600) — transfer to the password manager, then delete.`);
  console.log(`   Passwords are NOT printed here (NFR-SEC-09).`);
}

main().catch((e) => { console.error("❌ QA seed failed:", e); process.exit(1); }).finally(() => prisma.$disconnect());
