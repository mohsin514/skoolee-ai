import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync("src/lib/ai-workflows/questionnaire/service.ts", "utf8");
const board = src.slice(src.indexOf("async function launchBoard"), src.indexOf("/** Only answered, confirmed questions"));

test("SKAI-1728: the launch board loads every campus of the school, not the first 50", () => {
  const campuses = board.match(/prisma\.campus\.findMany\(\{[^\n]*\}\),/)?.[0] ?? "";
  assert.ok(campuses, "campus query present");
  assert.doesNotMatch(campuses, /take:/, "no cap on campuses");
  assert.match(campuses, /where: \{ schoolId: user\.schoolId \}/, "still school-scoped");
  assert.match(campuses, /orderBy: \[\{ createdAt: "asc" \}, \{ id: "asc" \}\]/, "stable order");
  // admins, invitations and setup responses were already uncapped; one tile per campus follows from campuses.map
  assert.doesNotMatch(board, /take: 50/);
  assert.match(board, /return campuses\.map\(campus =>/);
});
