import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1663: retrying a staff document save with the same upload key replays the original record.
const source = readFileSync("src/app/api/staff/documents/route.ts", "utf8");
const post = source.slice(source.indexOf("export async function POST"));

test("same-key saves are serialised and replay the committed document", () => {
  const lock = post.indexOf("pg_advisory_xact_lock(hashtext(${`staff-document:${user.schoolId}:${userId}:${fileKey}`}))");
  const lookup = post.indexOf("tx.staffDocument.findFirst({ where: { userId, fileKey } })");
  const create = post.indexOf("tx.staffDocument.create(");
  assert.ok(lock > 0 && lookup > lock && create > lookup);
  assert.match(post, /if \(existing\) return \{ doc: existing, replay: true \};/);
});

test("a replay returns 200 without new timeline or audit writes", () => {
  assert.match(post, /status: result\.replay \? 200 : 201/);
  const replay = post.indexOf("if (existing) return");
  assert.ok(replay < post.indexOf("staffTimelineEvent.create") && replay < post.indexOf("writeAuditEvent("));
});
