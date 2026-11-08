import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { approvalIssues, profileInput, sebConfig, sebHash, verifySeb } from "../../src/lib/school-ai/secure-browser";

// SKO-449 pure rules: SEB request-hash verification, approval evidence and the starting configuration.
const CONFIG_KEY = "a".repeat(64), EXAM_KEY = "b".repeat(64), url = "https://school.example.invalid/api/school-ai/exams/e1/attempt";
const profile = { configKeys: [CONFIG_KEY], browserExamKeys: [EXAM_KEY] };
const valid = { url, requestHash: sebHash(url, EXAM_KEY), configKeyHash: sebHash(url, CONFIG_KEY) };

test("the hash is SHA-256 of the URL (without fragment) followed by the key, as SEB computes it", () => {
  assert.equal(sebHash(`${url}#section`, CONFIG_KEY), createHash("sha256").update(url + CONFIG_KEY).digest("hex"));
});

test("only a request carrying the approved configuration and client hashes for this exact URL is admitted", () => {
  assert.deepEqual(verifySeb(valid, profile), { admitted: true });
  assert.deepEqual(verifySeb({ ...valid, configKeyHash: valid.configKeyHash.toUpperCase(), requestHash: valid.requestHash.toUpperCase() }, profile), { admitted: true }, "hex case does not matter");
  assert.deepEqual(verifySeb({ url, requestHash: null, configKeyHash: null }, profile), { admitted: false, reason: "MISSING_HEADERS" }, "an ordinary or user-agent-spoofed browser sends no hashes");
  assert.deepEqual(verifySeb({ ...valid, configKeyHash: sebHash(url, "c".repeat(64)) }, profile), { admitted: false, reason: "CONFIG_MISMATCH" }, "a modified configuration is rejected");
  assert.deepEqual(verifySeb({ ...valid, requestHash: sebHash(url, "d".repeat(64)) }, profile), { admitted: false, reason: "CLIENT_MISMATCH" }, "an unapproved client build is rejected");
  assert.deepEqual(verifySeb({ ...valid, url: `${url}?other=1` }, profile), { admitted: false, reason: "CONFIG_MISMATCH" }, "a hash replayed from another URL fails");
  assert.deepEqual(verifySeb({ ...valid, configKeyHash: "not-hex" }, profile), { admitted: false, reason: "CONFIG_MISMATCH" });
  assert.deepEqual(verifySeb(null, profile), { admitted: false, reason: "NO_EVIDENCE" });
  assert.deepEqual(verifySeb(valid, { configKeys: [], browserExamKeys: [] }), { admitted: false, reason: "CONFIG_MISMATCH" }, "a profile without keys admits nobody");
  assert.deepEqual(verifySeb({ url, requestHash: null, configKeyHash: valid.configKeyHash }, { configKeys: [CONFIG_KEY], browserExamKeys: [] }), { admitted: true }, "a config-key-only profile checks just that key");
});

test("approval needs a key and a passing real-device test within 180 days; inputs are validated", () => {
  const now = new Date("2026-10-17T00:00:00Z");
  const device = (testedOn: string, result: "PASS" | "FAIL") => ({ platform: "WINDOWS", clientVersion: "3.8.0", testedOn, result, assistiveTools: ["NVDA"], notes: "" });
  assert.deepEqual(approvalIssues({ ...profile, testedDevices: [device("2026-10-01", "PASS")] }, now), []);
  assert.equal(approvalIssues({ configKeys: [], browserExamKeys: [], testedDevices: [device("2026-10-01", "PASS")] }, now).length, 1);
  assert.match(approvalIssues({ ...profile, testedDevices: [device("2026-01-01", "PASS"), device("2026-10-01", "FAIL")] }, now).join(" "), /passing test/);
  assert.equal(profileInput.safeParse({ name: "Term 1 SEB", minClientVersion: "3.8", configKeys: ["xyz"], browserExamKeys: [], allowedResources: [], testedDevices: [], expectedVersion: 0 }).success, false, "keys must be 64-character hex");
  assert.equal(profileInput.safeParse({ name: "Term 1 SEB", minClientVersion: "3.8", configKeys: [CONFIG_KEY], browserExamKeys: [], allowedResources: ["http://calc.example.invalid"], testedDevices: [], expectedVersion: 0 }).success, false, "resources must be https");
});

test("the starting configuration names the exam, a quit URL and only approved resources", () => {
  const config = sebConfig({ startUrl: "https://school.example.invalid/ai/exams/e1", quitUrl: "https://school.example.invalid/ai/exams/e1?seb=quit", allowedResources: ["https://calc.example.invalid/basic"] });
  assert.match(config, /<key>startURL<\/key><string>https:\/\/school.example.invalid\/ai\/exams\/e1<\/string>/);
  assert.match(config, /<key>sendBrowserExamKey<\/key><true\/>/);
  assert.match(config, /https:\/\/calc.example.invalid\/basic\*/);
  assert.equal((config.match(/<key>expression<\/key>/g) ?? []).length, 2, "the exam origin plus one approved resource");
  assert.doesNotMatch(sebConfig({ startUrl: "https://x.invalid/a?b=<c>", quitUrl: "https://x.invalid/q", allowedResources: [] }), /<c>/, "values are XML-escaped");
});
