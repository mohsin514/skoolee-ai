/**
 * role-ux §7.4 — role defaults V2 and the code-level cut-over (no data migration, K-B4).
 *
 * A stored role_permissions row whose four flags equal the V1 default and that was last written before
 * ROLE_DEFAULTS_V2_EFFECTIVE is a seeded copy of the old default, so moduleFlags answers with the V2 default.
 * Anything saved after the cut-over, and any customised row, is honoured as stored.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  DEFAULT_PERMISSIONS,
  LEGACY_DEFAULT_PERMISSIONS_V1,
  PERMISSION_MODULES,
  ROLE_DEFAULTS_V2_EFFECTIVE,
  isLegacyDefaultRow,
  moduleFlags,
  type PermissionFlags,
  type PermissionModule,
} from "../../src/lib/permissions";
import type { UserRole } from "../../src/lib/roles";

const NONE: PermissionFlags = { canView: false, canAdd: false, canEdit: false, canDelete: false };
const V = { ...NONE, canView: true };
const VA = { ...V, canAdd: true };
const VAE = { ...VA, canEdit: true };
const VAED = { ...VAE, canDelete: true };

const BEFORE = new Date(ROLE_DEFAULTS_V2_EFFECTIVE.getTime() - 86_400_000);
const AFTER = new Date(ROLE_DEFAULTS_V2_EFFECTIVE.getTime() + 86_400_000);
const row = (module: string, flags: PermissionFlags, updatedAt?: Date | null) => ({ module, ...flags, ...(updatedAt === undefined ? {} : { updatedAt }) });

test("V2 defaults match the §7.4 table", () => {
  const expected: Record<string, Record<string, PermissionFlags>> = {
    PRINCIPAL: {
      students: V, fees: NONE, payroll: NONE, leave: VAE, attendance: V, timetable: VAED, exams: VAED, reports: VAED,
      staff: V, admissions: NONE, accounts: NONE, ai: VAE, library: NONE, "front-desk": NONE, transport: NONE, inventory: NONE, dormitory: NONE,
    },
    ACCOUNTANT: { fees: VAE, payroll: VA, leave: VA, accounts: VAE, students: V, staff: V },
    RECEPTIONIST: { fees: NONE, attendance: V, admissions: VAE, leave: VA, "front-desk": VAED, students: V },
    LIBRARIAN: { leave: VA, library: VAED, students: V, fees: NONE },
  };
  for (const [role, modules] of Object.entries(expected)) {
    for (const [mod, flags] of Object.entries(modules)) {
      assert.deepEqual(DEFAULT_PERMISSIONS[role as UserRole][mod as PermissionModule], flags, `${role}.${mod}`);
    }
  }
});

test("campus operators keep the full matrix; the group admin and the platform operator stay fixed; families unchanged", () => {
  for (const role of ["CAMPUS_ADMIN", "ADMIN"] as const) {
    for (const mod of PERMISSION_MODULES) assert.deepEqual(DEFAULT_PERMISSIONS[role][mod], VAED, `${role}.${mod}`);
  }
  for (const role of ["SUPER_ADMIN", "APP_OWNER"] as const) {
    assert.deepEqual(moduleFlags([row("fees", NONE, AFTER)], role, "fees"), VAED, `${role} is fixed`);
  }
  for (const role of ["TEACHER", "PARENT", "STUDENT"] as const) {
    assert.deepEqual(DEFAULT_PERMISSIONS[role], LEGACY_DEFAULT_PERMISSIONS_V1[role], `${role} unchanged`);
  }
  // V1 is kept verbatim: the principal used to hold the full matrix.
  for (const mod of PERMISSION_MODULES) assert.deepEqual(LEGACY_DEFAULT_PERMISSIONS_V1.PRINCIPAL[mod], VAED);
});

test("no rows: the V2 default applies", () => {
  assert.deepEqual(moduleFlags([], "PRINCIPAL", "fees"), NONE);
  assert.deepEqual(moduleFlags(null, "ACCOUNTANT", "payroll"), VA);
  assert.deepEqual(moduleFlags(undefined, "RECEPTIONIST", "admissions"), VAE);
});

test("a row equal to the V1 default and written before the cut-over follows the V2 default", () => {
  assert.deepEqual(moduleFlags([row("fees", VAED, BEFORE)], "PRINCIPAL", "fees"), NONE);
  assert.deepEqual(moduleFlags([row("front-desk", VAED, BEFORE)], "PRINCIPAL", "front-desk"), NONE);
  assert.deepEqual(moduleFlags([row("payroll", V, BEFORE)], "ACCOUNTANT", "payroll"), VA);
  assert.deepEqual(moduleFlags([row("fees", VA, BEFORE)], "RECEPTIONIST", "fees"), NONE);
  assert.deepEqual(moduleFlags([row("admissions", VA, BEFORE)], "RECEPTIONIST", "admissions"), VAE);
  assert.deepEqual(moduleFlags([row("leave", V, BEFORE)], "LIBRARIAN", "leave"), VA);
  assert.equal(isLegacyDefaultRow(row("fees", VAED, BEFORE), "PRINCIPAL", "fees"), true);
});

test("a caller that did not select updatedAt reads the row as a legacy default (same result as before the cut-over)", () => {
  assert.deepEqual(moduleFlags([row("fees", VAED)], "PRINCIPAL", "fees"), NONE);
  assert.deepEqual(moduleFlags([row("fees", VAED, null)], "PRINCIPAL", "fees"), NONE);
});

test("the same row saved after the cut-over is honoured: an authority can grant a module back (D13)", () => {
  assert.deepEqual(moduleFlags([row("fees", VAED, AFTER)], "PRINCIPAL", "fees"), VAED);
  assert.deepEqual(moduleFlags([row("payroll", V, AFTER)], "ACCOUNTANT", "payroll"), V);
  assert.equal(isLegacyDefaultRow(row("fees", VAED, AFTER), "PRINCIPAL", "fees"), false);
});

test("a customised row is honoured whenever it was written", () => {
  assert.deepEqual(moduleFlags([row("fees", V, BEFORE)], "PRINCIPAL", "fees"), V, "the principal was narrowed to fee view before the cut-over");
  assert.deepEqual(moduleFlags([row("exams", V, BEFORE)], "PRINCIPAL", "exams"), V);
  assert.deepEqual(moduleFlags([row("fees", NONE, BEFORE)], "ACCOUNTANT", "fees"), NONE);
  assert.deepEqual(moduleFlags([row("library", VA, BEFORE)], "RECEPTIONIST", "library"), VA);
});

test("unknown roles and modules fail closed", () => {
  assert.deepEqual(moduleFlags([row("fees", VAED, AFTER)], "HR", "fees"), NONE);
  assert.deepEqual(moduleFlags([row("nonsense", VAED, AFTER)], "PRINCIPAL", "nonsense"), NONE);
  assert.equal(isLegacyDefaultRow(row("fees", VAED, BEFORE), "HR", "fees"), false);
});

/**
 * Explicit-column readers in other packages' files that still omit `updatedAt` (§7.4). Each is a recorded
 * cross-package need in scratchpad/role-ux/reports/P1.md ("add `updatedAt: true` to the select"); until it lands that
 * caller reads a grant saved after the cut-over as a seeded V1 default whenever it equals one (D13). Remove an entry
 * once its owner adds the column: the test then guards it like every other caller.
 */
const PENDING_CROSS_PACKAGE = new Set([
  "src/lib/school-ai/access.ts", // P6
  "src/lib/api/teacher-assignments.ts", // unowned
  "src/lib/timetable/manual.ts", // unowned
  "src/lib/timetable/draft-slot.ts", // unowned
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" || entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(entry.name) ? [path] : [];
  });
}

/** The argument text of every `rolePermission.find*(...)` call, balanced on parentheses (multi-line calls included). */
function rolePermissionReads(source: string): string[] {
  const reads: string[] = [];
  const pattern = /rolePermission\s*\.\s*find(?:Many|First|FirstOrThrow|Unique|UniqueOrThrow)\s*\(/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let depth = 1, index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === "(") depth += 1;
      else if (source[index] === ")") depth -= 1;
      index += 1;
    }
    reads.push(source.slice(match.index, index));
  }
  return reads;
}

test("every explicit-column rolePermission read in src selects updatedAt, so the cut-over can tell a decision from a seeded default", (t) => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const offenders: string[] = [];
  let scanned = 0;
  for (const file of sourceFiles(join(root, "src"))) {
    const relativePath = relative(root, file).split(sep).join("/");
    for (const read of rolePermissionReads(readFileSync(file, "utf8"))) {
      scanned += 1;
      // A read without `select` returns whole rows (updatedAt included); only an explicit column list can drop it.
      if (!/\bselect\s*:/.test(read) || /updatedAt\s*:\s*true/.test(read)) continue;
      offenders.push(`${relativePath}: ${read.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }
  assert.ok(scanned >= 10, `found ${scanned} rolePermission reads; the scan must cover every caller in src`);
  const unexpected = offenders.filter((line) => !PENDING_CROSS_PACKAGE.has(line.slice(0, line.indexOf(":"))));
  assert.deepEqual(unexpected, [], "explicit-column rolePermission reads must select updatedAt: true (§7.4)");
  for (const file of PENDING_CROSS_PACKAGE) {
    if (!offenders.some((line) => line.startsWith(`${file}:`))) t.diagnostic(`${file} now selects updatedAt: remove it from PENDING_CROSS_PACKAGE`);
  }
});
