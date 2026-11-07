import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1665: charges handed to the fees office reach a campus-scoped finance queue and stay visible on the desk.
const desk = readFileSync("src/lib/library/desk.ts", "utf8");
const route = readFileSync("src/app/api/fees/library-charges/route.ts", "utf8");

test("fees queue is staff-only, needs fees view and is school + campus scoped", () => {
  const fn = desk.slice(desk.indexOf("export async function handedLibraryCharges"));
  assert.match(fn, /assertStaffRole\(user\);\s+await assertPermission\(user, "fees", "view"\);\s+const campusId = campusOf\(user\);/);
  assert.match(fn, /where: \{ schoolId: user\.schoolId, campusId, status: "HANDED_TO_FEES" \}/);
  assert.match(fn, /libraryMember\.findMany\(\{ where: \{ schoolId: user\.schoolId, campusId,/);
  assert.match(route, /handedLibraryCharges\(user\)/);
});

test("the lending desk overview still lists handed charges", () => {
  assert.match(desk, /const handed = await prisma\.libraryCharge\.findMany\(\{ where: \{ schoolId: user\.schoolId, campusId, OR: \[\{ status: \{ in: \["HANDED_TO_FEES", "POSTED"\] \} \}, \{ invoiceId: \{ not: null \} \}\] \}/, "SKAI-1669/1793: posted, paid and waived invoiced charges stay listed");
  assert.match(desk, /charges, handed \};/);
});
