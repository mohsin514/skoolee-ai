import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAssignmentCopy } from "@/components/assignments/assignment-copy";

const source = readFileSync("src/components/assignments/LearnerAssignments.tsx", "utf8");

test("SKAI-1501: a failed first load shows a localized error with Retry that reloads", () => {
  assert.match(source, /const firstLoad = useCallback\(\(\) => \{ setLoadFailed\(false\); load\(\)\.catch\(\(\) => setLoadFailed\(true\)\); \}, \[load\]\);/);
  assert.match(source, /if \(!items && loadFailed\) return .*<ErrorState title=\{t\.errorTitle\} description=\{t\.failed\} retryLabel=\{t\.retry\} onRetry=\{firstLoad\} \/>/);
  const firstLoadBlock = source.slice(source.indexOf("const load = useCallback"), source.indexOf("if (!items) return"));
  assert.doesNotMatch(firstLoadBlock, /error\.message/, "no raw server text on first load");
});

test("SKAI-1501: the recovery copy exists in EN, AR and UR", () => {
  for (const language of ["en", "ar", "ur"]) {
    const t = getAssignmentCopy(language);
    assert.ok(t.errorTitle && t.failed && t.retry, language);
  }
});
