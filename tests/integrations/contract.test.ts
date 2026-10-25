import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCompatibility, conforms, V1, type Contract } from "../../src/lib/integrations/contract";
import { isPrivateAddress, validateShape } from "../../src/lib/integrations/destination";

// SKO-445: the contract gate that runs before a version is published, and destination address rules.
const clone = (c: Contract) => JSON.parse(JSON.stringify(c)) as Contract;

test("v1 is compatible with itself; additive optional fields are allowed", () => {
  assert.deepEqual(checkCompatibility(V1, V1), { compatible: true, breaking: [] });
  const next = clone(V1); next.resources.student.nickname = "string?"; next.topics["student.updated"].note = "string?";
  assert.equal(checkCompatibility(V1, next).compatible, true);
});

test("removed fields, changed types, new required request fields and removed errors are breaking", () => {
  const next = clone(V1);
  delete (next.resources.student as Record<string, string>).className;
  next.resources.student.enrolledAt = "string";
  next.requests.linkExternalId.reason = "string";
  next.errors = next.errors.filter(e => e !== "RATE_LIMITED");
  delete (next.topics as Record<string, unknown>)["connection.test"];
  const r = checkCompatibility(V1, next);
  assert.equal(r.compatible, false);
  for (const expected of ["resources.student.className was removed", "resources.student.enrolledAt changed from datetime to string", "requests.linkExternalId.reason is a new required field", "error RATE_LIMITED was removed", "topics.connection.test was removed"]) assert.ok(r.breaking.includes(expected), expected);
});

test("serialized values must match the frozen shape exactly", () => {
  const ok = { id: "s1", admissionNo: null, fullName: "Synthetic", campusId: "c", classId: "k", className: "Grade 1 A", status: "active", enrolledAt: new Date().toISOString() };
  assert.deepEqual(conforms(V1.resources.student, ok), []);
  assert.deepEqual(conforms(V1.resources.student, { ...ok, secretField: "x" }), ["secretField is not in the contract"]);
  assert.deepEqual(conforms(V1.resources.student, { ...ok, enrolledAt: "yesterday" }), ["enrolledAt is not a datetime"]);
});

test("destinations: internal, loopback, link-local, metadata and private ranges are refused; HTTPS required", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:169.254.169.254", "::ffff:192.168.1.10"]) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip);
  assert.equal(validateShape("http://example.org/hook").ok, false);
  assert.equal(validateShape("https://user:pass@example.org/hook").ok, false);
  assert.equal(validateShape("https://example.org/hook").ok, true);
});
