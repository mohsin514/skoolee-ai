import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1668: a retried enquiry create with the same request key replays the original instead of duplicating it.
const lib = readFileSync("src/lib/admissions/enquiries.ts", "utf8");
const ui = readFileSync("src/components/shared-admin/index.tsx", "utf8");
const create = lib.slice(lib.indexOf("export async function createEnquiry"), lib.indexOf("export async function updateEnquiry"));

test("same-key creates are serialised and replay the recorded enquiry", () => {
  const lock = create.indexOf("pg_advisory_xact_lock(hashtext(${`admission-enquiry:${user.schoolId}:${requestKey}`}))");
  const lookup = create.indexOf('newValue: { path: ["requestKey"], equals: requestKey }');
  const insert = create.indexOf("tx.admissionQuery.create(");
  assert.ok(lock > 0 && lookup > lock && insert > lookup);
  assert.match(create, /admissionQuery\.findFirst\(\{ where: \{ id: prior\.recordId, campusId \} \}\)/);
  assert.match(create, /if \(replay\) return replay;/);
});

test("the key is recorded on the CREATE audit and sent once per opened form", () => {
  assert.match(create, /after: \{ source, status, \.\.\.\(requestKey \? \{ requestKey \} : \{\}\) \}/);
  assert.match(ui, /const \[requestKey\] = useState\(\(\) => crypto\.randomUUID\(\)\);/);
  assert.match(ui, /classInterestedId: form\.classInterestedId \|\| null, requestKey \}/);
});
