import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseInventory, INVENTORY_JSON } from "../../scripts/ai-workflows/inventory-to-json";

const sample = `## C7 Campus operations — 2 write capabilities
| key | route | roles | risk | approval | idem. | AI today | reuse | notes |
|---|---|---|---|---|---|---|---|---|
| \`library.issue_copy\` | \`POST /api/library/desk/issue\` | LIBRARIAN, ADMIN | CREATE | none | no | none | direct | a \\| pipe in notes |
| ⚑ \`library.issue_copy\` | \`POST /api/library/desk/issue\` | PRINCIPAL | CREATE | none | no | none | direct | duplicate |

## C9a school-ai exams — 1 write capabilities
| key | route | roles | risk | idem. | AI today | reuse | owner | notes |
|---|---|---|---|---|---|---|---|---|
| ⚑ \`exams.attempt.start\` | \`POST src/app/api/school-ai/exams/[id]/attempt/route.ts:16\` | STUDENT | CREATE | yes | none | wrapper | Exam Studio | candidate only |
`;

test("parses both table layouts, merges duplicate keys and keeps escaped pipes out of columns", () => {
  const rows = parseInventory(sample);
  const issue = rows.find(row => row.key === "library.issue_copy")!;
  assert.deepEqual(issue.roles, ["LIBRARIAN", "ADMIN", "PRINCIPAL"]);
  assert.equal(issue.idempotent, "no");
  assert.equal(issue.reuse, "direct");
  const attempt = rows.find(row => row.key === "exams.attempt.start")!;
  assert.equal(attempt.addedByVerifier, true);
  assert.equal(attempt.aiToday, "none");
  assert.equal(attempt.reuse, "wrapper");
  assert.ok(rows.some(row => row.key === "campus.create" && row.source === "existing-tool"));
});

test("the committed inventory is regenerated from the plan appendix", () => {
  const committed = JSON.parse(readFileSync(INVENTORY_JSON, "utf8"));
  const fresh = parseInventory(readFileSync("docs/product-review-2026-10/ai-automation-plan-2026-10-23/appendix-a-capability-inventory.md", "utf8"));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(fresh)), "Run npx tsx scripts/ai-workflows/inventory-to-json.ts");
  assert.ok(fresh.length > 800);
});
