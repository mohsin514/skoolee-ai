import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-849 (AI-13): interface copy never claims calibration, "first", cheat-proofing or learning gains
// without evidence. A negated, labelled estimate ("not a calibrated difficulty") stays allowed.
const CLAIMS: Array<[string, RegExp]> = [
  ["calibrated", /\bcalibrated\b/i],
  ["first", /\b(?:world'?s|industry'?s?)[\s-]+first\b|\b(?:the|our)\s+first\s+(?:ai|platform|school\s+(?:os|platform))\b|\bfirst[\s-]+(?:of its kind|ever)\b/i],
  ["cheat-proof", /\bcheat[\s_­‐-―-]*proof\b/i],
  ["learning gains", /\blearning[\s-]+gains?\b/i],
];
const NEGATED = /\b(?:not|never|no|un|without|isn't|is not|n't)\b[^.;:]{0,40}$/i;

const copyFiles = execFileSync("git", ["ls-files", "src/app", "src/components", "src/lib/locale"], { encoding: "utf8" })
  .split("\n").filter(file => /\.(tsx?|json)$/.test(file) && !/\.test\./.test(file));

test("SKAI-849: interface copy makes no unsupported AI claims", () => {
  const findings: string[] = [];
  for (const file of copyFiles) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const [label, pattern] of CLAIMS) {
        const match = pattern.exec(line);
        if (!match) continue;
        // Only quoted copy counts; identifiers and comments do not reach users.
        const before = line.slice(0, match.index);
        if (!/["'`][^"'`]*$/.test(before) || /^\s*(?:\/\/|\/?\*)/.test(line)) continue;
        if (NEGATED.test(before)) continue;
        findings.push(`${file}:${index + 1} (${label}): ${line.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(findings, []);
});

test("SKAI-849: the guard catches a planted claim and allows a negated estimate", () => {
  const hit = (text: string) => CLAIMS.some(([, pattern]) => { const m = pattern.exec(text); return !!m && !NEGATED.test(text.slice(0, m.index)); });
  assert.equal(hit("\"Our calibrated difficulty scores\""), true);
  assert.equal(hit("\"The world's first AI school\""), true);
  assert.equal(hit("\"Proven learning gains\""), true);
  assert.equal(hit("\"Cheat-proof exams\""), true);
  assert.equal(hit("\"not a calibrated difficulty.\""), false);
});
