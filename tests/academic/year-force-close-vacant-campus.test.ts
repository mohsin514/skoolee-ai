import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/lib/school-ai/school-operations-cycle-write.ts", "utf8");

test("SKAI-1992: group owner may force-close a year only on a campus with no principal and no campus admin", () => {
  assert.match(source, /import \{ getCampusSeats \} from "@\/lib\/auth\/seats"/);
  assert.match(source, /return !seats\.principal && !seats\.campusAdmin;/);
  assert.match(source, /canLeadAcademics\(user, campusId\) \|\| user\.role === "SUPER_ADMIN" && await campusHasNoAcademicLead\(user\.schoolId, campusId\)/);
  assert.match(source, /Only the principal can close a year with outstanding work/, "the 403 still guards every other caller");
});
