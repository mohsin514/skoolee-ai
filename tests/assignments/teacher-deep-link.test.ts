import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/assignments/AssignmentWorkspace.tsx", "utf8");

test("SKAI-1481: the workspace opens the assignment named in ?assignment=", () => {
  assert.match(source, /const requested = useSearchParams\(\)\.get\("assignment"\);/);
  assert.match(source, /if \(requested && \/\^\[\\w-\]\{1,64\}\$\/\.test\(requested\)\) setSelected\(requested\);/);
});

test("SKAI-1481: the workspace switches to the class that owns the linked assignment", () => {
  assert.match(source, /detail\.assignment\.classId !== view\.classId\) setClassId\(detail\.assignment\.classId\)/);
});

test("SKAI-1481: a missing or out-of-scope id keeps the existing not-available message", () => {
  assert.match(source, /error\.status === 404 \? t\.notAvailable/);
  const pages = readFileSync("src/components/assignments/AssignmentPages.tsx", "utf8");
  assert.match(pages, /<Suspense fallback=\{null\}><AssignmentWorkspace createRequest=\{createRequest\} hideCreateButton \/><\/Suspense>/);
});
