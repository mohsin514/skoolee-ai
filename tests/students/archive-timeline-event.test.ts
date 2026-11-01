import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FAMILY_TIMELINE_KINDS } from "@/lib/students/timeline";

const source = readFileSync("src/app/api/students/route.ts", "utf8");

test("SKAI-1528: a single archive writes state, audit and one ARCHIVED milestone in one transaction", () => {
  const block = source.slice(source.indexOf("// SKAI-1528: archive, audit"), source.indexOf("if (!flipped) return"));
  assert.match(block, /tx\.student\.updateMany\(\{ where: \{ id, archivedAt: null \}/);
  assert.match(block, /if \(claimed\.count !== 1\) return false;/);
  assert.ok(block.indexOf("tx.auditLog.create") < block.indexOf('tx.studentTimelineEvent.create({ data: { schoolId: user.schoolId, studentId: id, kind: "ARCHIVED"'));
});

test("SKAI-1528: bulk archive adds one milestone per pupil that actually flips", () => {
  assert.match(source, /if \(status === "archived"\) await tx\.studentTimelineEvent\.createMany\(\{ data: changingIds\.map\(\(studentId\) => \(\{ schoolId: user\.schoolId, studentId, kind: "ARCHIVED"/);
});

test("SKAI-1528: ARCHIVED is a family-visible timeline kind", () => {
  assert.ok((FAMILY_TIMELINE_KINDS as readonly string[]).includes("ARCHIVED"));
});
