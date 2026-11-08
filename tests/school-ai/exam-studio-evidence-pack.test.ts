import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildManifest, canonicalJson, packArchive, redactProtectedKeys, verifyManifest } from "../../src/lib/school-ai/evidence-pack";

// SKO-408 R19.2–R19.4, R19.11 (Property 29): a pack verifies with system tools that share no code
// with the producer — `unzip` to extract, `shasum -a 256` to digest.
const files = [
  { path: "assignment.json", content: canonicalJson({ title: "Synthetic midterm", b: 2, a: 1, at: new Date("2026-10-01T08:00:00Z") }) },
  { path: "attempts/one.json", content: canonicalJson({ responses: { q1: "ٹیسٹ جواب" }, score: 3 }) },
];
const manifest = buildManifest({ generatedAt: "2026-10-17T09:00:00.000Z", scope: { kind: "ASSESSMENT", id: "a1", schoolId: "s1", campusId: "c1" }, includedKeys: false, includedCapture: false, files, records: [{ type: "assignment", id: "a1", version: 3 }], gaps: [{ type: "rehearsal", id: "r9", version: null, reason: "record not found" }] });

test("canonical JSON sorts keys, drops undefined and writes dates as ISO", () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: undefined }], at: new Date("2026-01-02T03:04:05Z") }), '{"a":[{"d":1}],"at":"2026-01-02T03:04:05.000Z","b":1}');
});

test("protected key fields are removed at any depth and counted", () => {
  const { value, removed } = redactProtectedKeys({ questions: [{ prompt: "2+2", correctOptionId: "a", rubric: [{ x: 1 }], options: [{ id: "a", modelAnswer: "4" }] }], review: { marks: [] } });
  assert.equal(removed, 4);
  assert.equal(JSON.stringify(value).match(/correctOptionId|rubric|modelAnswer|review/), null);
});

test("the manifest lists each file's digest, records and named gaps, and refuses unsafe paths", () => {
  assert.deepEqual(manifest.files.map(file => file.path), ["assignment.json", "attempts/one.json"]);
  assert.deepEqual(manifest.gaps, [{ type: "rehearsal", id: "r9", version: null, reason: "record not found" }]);
  assert.deepEqual(verifyManifest(manifest, files), []);
  assert.deepEqual(verifyManifest(manifest, [{ ...files[0], content: files[0].content.replace("1", "2") }, files[1]]), ["digest mismatch assignment.json"]);
  assert.throws(() => buildManifest({ ...manifest, files: [{ path: "../etc/passwd.json", content: "{}" }] }), /Unsafe/);
});

test("an independent verifier (unzip + shasum) reproduces every digest in the manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "evidence-")), zip = join(dir, "pack.zip"), out = join(dir, "out");
  try {
    writeFileSync(zip, packArchive(manifest, files));
    execFileSync("unzip", ["-q", zip, "-d", out]);
    const shipped = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    const walk = (base: string, prefix = ""): string[] => readdirSync(base).flatMap(name => statSync(join(base, name)).isDirectory() ? walk(join(base, name), `${prefix}${name}/`) : [`${prefix}${name}`]);
    const listed = walk(out).filter(path => path !== "manifest.json").sort();
    assert.deepEqual(listed, shipped.files.map((file: { path: string }) => file.path), "the archive holds exactly the listed files");
    for (const entry of shipped.files) {
      const digest = execFileSync("shasum", ["-a", "256", join(out, entry.path)], { encoding: "utf8" }).split(" ")[0];
      assert.equal(digest, entry.sha256, entry.path);
    }
    assert.equal(shipped.algorithm, "SHA-256");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
