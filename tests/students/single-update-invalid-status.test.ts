import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1576: the single-record update rejects an unknown status before any lookup or write.
test("single student update returns 400 for an unknown status before saving", () => {
  const src = readFileSync("src/app/api/students/route.ts", "utf8");
  const parse = src.indexOf("studentProfileUpdateSchema.parse(body)");
  const guard = src.indexOf("if (updates.status && !STUDENT_STATUSES.includes(updates.status))", parse);
  const lookup = src.indexOf("prisma.student.findFirst", parse);
  assert.ok(parse > 0 && guard > parse && guard < lookup, "guard sits between parse and the first read");
  assert.match(src.slice(guard, guard + 220), /throw new ApiError\(`status must be one of: \$\{STUDENT_STATUSES\.join\(", "\)\}`, 400\)/);
});
