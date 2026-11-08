// ─────────────────────────────────────────────────────────────────
// role-ux G22a — institution report and PO-approved repairs (SPEC §7.3 G22a, §12 step 0, D15–D17).
//
// An ops script, not a migration. Without flags it is READ-ONLY: every query runs inside one
// `SET TRANSACTION READ ONLY` transaction and it prints a JSON report of data the institution model
// (src/lib/auth/institution.ts) reads differently:
//
//   (a) UNVERIFIED schools with no setup type and no owner (kind falls back to GROUP)
//   (b) schools with no active institution owner, with the proposed owner
//       (= earliest active user holding the authority role for the school's kind)
//   (c) SUPER_ADMINs in GROUP schools pinned to a campus
//   (d) STANDALONE schools with more than one active campus or more than one active ADMIN
//   (e) kind/role anomalies: SUPER_ADMIN in a STANDALONE school; GROUP school whose owner is an ADMIN
//   (f) GROUP campuses with no active CAMPUS_ADMIN/ADMIN, with their principal(s)
//   (g) non-authority users holding can_purchase_subscription (inert, listed for clean-up)
//
// Writes happen ONLY behind an explicit flag, each applied after the product owner approves the printed report:
//
//   --apply-owner-repair             fixes (b) and (c): owner flag on the proposed user; campus_id = NULL for
//                                    group admins; access_version + 1; one audit_logs row per change
//   --promote-sole-principal <id>    re-roles that GROUP campus's only principal to CAMPUS_ADMIN (no other
//                                    active campus operator there); audit row; access_version + 1
//   --convert-to-group <schoolId>    support-run conversion of a single school into a group (D1/D17), in ONE
//                                    transaction: registration_kind = GROUP, the owner ADMIN → SUPER_ADMIN with
//                                    campus_id = NULL, access_version + 1, one audit row
//
// It never touches registration_kind except --convert-to-group, and never touches permissions or purchase flags.
// Connection: DIRECT_URL (session pooler, port 5432), never the transaction pooler.
//
//   node scripts/role-ux/institution-report.mjs                       # read-only report (JSON on stdout)
//   node scripts/role-ux/institution-report.mjs --apply-owner-repair  # after PO approval
// ─────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";

const AUTHORITY_ROLE = { GROUP: "SUPER_ADMIN", STANDALONE: "ADMIN" };

function parseArgs(argv) {
  const args = { applyOwnerRepair: false, promoteSolePrincipal: null, convertToGroup: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply-owner-repair") args.applyOwnerRepair = true;
    else if (arg === "--promote-sole-principal") args.promoteSolePrincipal = requireValue(argv[++i], arg);
    else if (arg === "--convert-to-group") args.convertToGroup = requireValue(argv[++i], arg);
    else if (arg === "--help" || arg === "-h") { args.help = true; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const writes = [args.applyOwnerRepair, args.promoteSolePrincipal, args.convertToGroup].filter(Boolean).length;
  if (writes > 1) throw new Error("Apply one repair at a time, each after the product owner approves the report.");
  return args;
}
function requireValue(value, flag) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs an id`);
  return value;
}

/** Mirrors institutionKindOf (src/lib/auth/institution.ts): registrationKind → setup type → owner role; fails toward GROUP. */
function kindOf(school) {
  if (school.registration_kind === "GROUP" || school.registration_kind === "STANDALONE") return school.registration_kind;
  if (school.setup_type === "GROUP" || school.setup_type === "STANDALONE") return school.setup_type;
  return school.owner_role === "ADMIN" ? "STANDALONE" : "GROUP";
}

async function load(db) {
  const schools = await db.$queryRaw`
    SELECT s.id, s.name, s.registration_kind, s.status, st.institution_type AS setup_type,
      (SELECT u.role::text FROM users u WHERE u.school_id = s.id AND u.is_institution_owner = true ORDER BY u.created_at ASC LIMIT 1) AS owner_role
    FROM schools s LEFT JOIN institution_setups st ON st.school_id = s.id
    WHERE s.status <> 'DELETED'
    ORDER BY s.created_at ASC`;
  const users = await db.$queryRaw`
    SELECT u.id, u.school_id, u.campus_id, u.role::text AS role, u.full_name, u.is_active, u.is_institution_owner,
      u.can_purchase_subscription, u.access_version, u.created_at
    FROM users u JOIN schools s ON s.id = u.school_id
    WHERE s.status <> 'DELETED'
      AND (u.role IN ('SUPER_ADMIN', 'ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL') OR u.is_institution_owner = true OR u.can_purchase_subscription = true)
    ORDER BY u.created_at ASC`;
  const campuses = await db.$queryRaw`
    SELECT c.id, c.school_id, c.name FROM campuses c JOIN schools s ON s.id = c.school_id
    WHERE s.status <> 'DELETED' AND c.archived_at IS NULL
    ORDER BY c.created_at ASC`;
  return { schools, users, campuses };
}

function buildReport({ schools, users, campuses }) {
  const person = (u) => ({ id: u.id, name: u.full_name, role: u.role, campusId: u.campus_id });
  const bySchool = new Map(schools.map((s) => [s.id, { ...s, kind: kindOf(s) }]));
  const usersOf = (schoolId) => users.filter((u) => u.school_id === schoolId);
  const sections = { a: [], b: [], c: [], d: [], e: [], f: [], g: [] };

  for (const school of bySchool.values()) {
    const members = usersOf(school.id);
    const active = members.filter((u) => u.is_active);
    const authorityRole = AUTHORITY_ROLE[school.kind];
    const ref = { schoolId: school.id, schoolName: school.name, kind: school.kind, registrationKind: school.registration_kind };

    // (a) the kind is a pure fallback: nothing stored decides it.
    if (!["GROUP", "STANDALONE"].includes(school.registration_kind) && !["GROUP", "STANDALONE"].includes(school.setup_type) && !school.owner_role) {
      sections.a.push(ref);
    }
    // (b) no active owner → nobody can pay; propose the earliest active authority-role user.
    if (!active.some((u) => u.is_institution_owner)) {
      const proposed = active.find((u) => u.role === authorityRole) ?? null;
      sections.b.push({ ...ref, proposedOwner: proposed ? person(proposed) : null });
    }
    if (school.kind === "GROUP") {
      // (c) a group admin pinned to one campus is campus-scoped by the tenant guard.
      for (const u of active.filter((m) => m.role === "SUPER_ADMIN" && m.campus_id)) sections.c.push({ ...ref, user: person(u) });
      // (e) a group whose owner is an ADMIN: under the model that owner is a campus operator, not the authority.
      const owner = members.find((m) => m.is_institution_owner);
      if (owner && owner.role === "ADMIN") sections.e.push({ ...ref, issue: "GROUP_OWNED_BY_ADMIN", user: person(owner) });
      // (f) campuses with no campus operator: a vacancy the authority must fill before release (§2.6, D16).
      for (const campus of campuses.filter((c) => c.school_id === school.id)) {
        const onCampus = active.filter((u) => u.campus_id === campus.id);
        if (!onCampus.some((u) => u.role === "CAMPUS_ADMIN" || u.role === "ADMIN")) {
          sections.f.push({ ...ref, campusId: campus.id, campusName: campus.name, principals: onCampus.filter((u) => u.role === "PRINCIPAL").map(person) });
        }
      }
    } else {
      // (d) a single school is one campus run by one school admin (D17).
      const activeCampuses = campuses.filter((c) => c.school_id === school.id);
      const admins = active.filter((u) => u.role === "ADMIN");
      if (activeCampuses.length > 1 || admins.length > 1) sections.d.push({ ...ref, activeCampuses: activeCampuses.length, activeAdmins: admins.map(person) });
      // (e) a SUPER_ADMIN in a single school is never the authority.
      for (const u of active.filter((m) => m.role === "SUPER_ADMIN")) sections.e.push({ ...ref, issue: "SUPER_ADMIN_IN_STANDALONE", user: person(u) });
    }
    // (g) purchase flags outside the authority role are inert (canOwnSubscription requires authority).
    for (const u of members.filter((m) => m.can_purchase_subscription && m.role !== authorityRole)) sections.g.push({ ...ref, user: person(u) });
  }
  const counts = Object.fromEntries(Object.entries(sections).map(([key, rows]) => [key, rows.length]));
  return { schools: bySchool.size, counts, sections };
}

async function audit(tx, { schoolId, campusId, recordId, userId, oldValue, newValue, tableName = "users" }) {
  await tx.$executeRaw`
    INSERT INTO audit_logs (id, school_id, campus_id, table_name, record_id, user_id, old_value, new_value)
    VALUES (gen_random_uuid()::text, ${schoolId}, ${campusId}, ${tableName}, ${recordId}, ${userId}, ${JSON.stringify(oldValue)}::jsonb, ${JSON.stringify(newValue)}::jsonb)`;
}

async function applyOwnerRepair(tx, report) {
  const applied = [];
  for (const row of report.sections.b) {
    if (!row.proposedOwner) { applied.push({ section: "b", schoolId: row.schoolId, skipped: "NO_AUTHORITY_ROLE_USER" }); continue; }
    const changed = await tx.$executeRaw`
      UPDATE users SET is_institution_owner = true, access_version = access_version + 1
      WHERE id = ${row.proposedOwner.id} AND school_id = ${row.schoolId} AND is_active = true AND is_institution_owner = false`;
    if (changed !== 1) { applied.push({ section: "b", schoolId: row.schoolId, skipped: "CHANGED_SINCE_REPORT" }); continue; }
    await audit(tx, { schoolId: row.schoolId, campusId: row.proposedOwner.campusId, recordId: row.proposedOwner.id, userId: row.proposedOwner.id,
      oldValue: { isInstitutionOwner: false }, newValue: { action: "role-ux.owner-repair", isInstitutionOwner: true, reason: "School had no active institution owner (G22a b)" } });
    applied.push({ section: "b", schoolId: row.schoolId, userId: row.proposedOwner.id });
  }
  for (const row of report.sections.c) {
    const changed = await tx.$executeRaw`
      UPDATE users SET campus_id = NULL, access_version = access_version + 1
      WHERE id = ${row.user.id} AND school_id = ${row.schoolId} AND role = 'SUPER_ADMIN' AND campus_id IS NOT NULL`;
    if (changed !== 1) { applied.push({ section: "c", schoolId: row.schoolId, skipped: "CHANGED_SINCE_REPORT" }); continue; }
    await audit(tx, { schoolId: row.schoolId, campusId: row.user.campusId, recordId: row.user.id, userId: row.user.id,
      oldValue: { campusId: row.user.campusId }, newValue: { action: "role-ux.owner-repair", campusId: null, reason: "Group admin was pinned to one campus (G22a c)" } });
    applied.push({ section: "c", schoolId: row.schoolId, userId: row.user.id });
  }
  return applied;
}

async function promoteSolePrincipal(tx, report, campusId) {
  const row = report.sections.f.find((f) => f.campusId === campusId);
  if (!row) throw new Error(`Campus ${campusId} is not a GROUP campus without a campus admin (section f).`);
  if (row.principals.length !== 1) throw new Error(`Campus ${campusId} has ${row.principals.length} active principals; promote by hand.`);
  const principal = row.principals[0];
  const changed = await tx.$executeRaw`
    UPDATE users SET role = 'CAMPUS_ADMIN'::"UserRole", access_version = access_version + 1
    WHERE id = ${principal.id} AND school_id = ${row.schoolId} AND campus_id = ${campusId} AND role = 'PRINCIPAL' AND is_active = true`;
  if (changed !== 1) throw new Error("The principal changed since the report. Re-run the report.");
  await audit(tx, { schoolId: row.schoolId, campusId, recordId: principal.id, userId: principal.id,
    oldValue: { role: "PRINCIPAL" }, newValue: { action: "role-ux.promote-sole-principal", role: "CAMPUS_ADMIN", reason: "Campus had no campus admin (G22a f, D16)" } });
  return [{ campusId, schoolId: row.schoolId, userId: principal.id, role: "CAMPUS_ADMIN" }];
}

async function convertToGroup(tx, schoolId) {
  const [school] = await tx.$queryRaw`
    SELECT s.id, s.registration_kind, st.institution_type AS setup_type,
      (SELECT u.role::text FROM users u WHERE u.school_id = s.id AND u.is_institution_owner = true ORDER BY u.created_at ASC LIMIT 1) AS owner_role
    FROM schools s LEFT JOIN institution_setups st ON st.school_id = s.id WHERE s.id = ${schoolId} AND s.status <> 'DELETED' FOR UPDATE OF s`;
  if (!school) throw new Error(`School ${schoolId} not found.`);
  if (kindOf(school) !== "STANDALONE") throw new Error(`School ${schoolId} is already a school group.`);
  const owners = await tx.$queryRaw`
    SELECT id, campus_id FROM users WHERE school_id = ${schoolId} AND is_institution_owner = true AND is_active = true AND role = 'ADMIN' ORDER BY created_at ASC`;
  if (owners.length !== 1) throw new Error(`School ${schoolId} needs exactly one active ADMIN owner to convert (found ${owners.length}).`);
  const owner = owners[0];
  await tx.$executeRaw`UPDATE schools SET registration_kind = 'GROUP' WHERE id = ${schoolId}`;
  const changed = await tx.$executeRaw`
    UPDATE users SET role = 'SUPER_ADMIN'::"UserRole", campus_id = NULL, access_version = access_version + 1
    WHERE id = ${owner.id} AND school_id = ${schoolId} AND role = 'ADMIN'`;
  if (changed !== 1) throw new Error("The owner changed during conversion; nothing was applied.");
  await audit(tx, { schoolId, campusId: owner.campus_id, tableName: "schools", recordId: schoolId, userId: owner.id,
    oldValue: { registrationKind: school.registration_kind, ownerRole: "ADMIN", ownerCampusId: owner.campus_id },
    newValue: { action: "role-ux.convert-to-group", registrationKind: "GROUP", ownerRole: "SUPER_ADMIN", ownerCampusId: null, ownerId: owner.id } });
  return [{ schoolId, ownerId: owner.id, registrationKind: "GROUP", ownerRole: "SUPER_ADMIN" }];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write("Usage: node scripts/role-ux/institution-report.mjs [--apply-owner-repair | --promote-sole-principal <campusId> | --convert-to-group <schoolId>]\n"); return; }
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("Set DIRECT_URL (the session connection on port 5432) to run the institution report.");
  const db = new PrismaClient({ datasourceUrl: url });
  const mode = args.applyOwnerRepair ? "apply-owner-repair" : args.promoteSolePrincipal ? "promote-sole-principal" : args.convertToGroup ? "convert-to-group" : "read-only";
  try {
    const output = await db.$transaction(async (tx) => {
      if (mode === "read-only") await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const report = buildReport(await load(tx));
      let applied = [];
      if (mode === "apply-owner-repair") applied = await applyOwnerRepair(tx, report);
      if (mode === "promote-sole-principal") applied = await promoteSolePrincipal(tx, report, args.promoteSolePrincipal);
      if (mode === "convert-to-group") applied = await convertToGroup(tx, args.convertToGroup);
      return { report, applied };
    }, { timeout: 120_000, maxWait: 10_000 });
    process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), mode, database: new URL(url).host, ...output.report, applied: output.applied }, null, 2)}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
