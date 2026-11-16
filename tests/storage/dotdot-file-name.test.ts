import assert from "node:assert/strict";
import test from "node:test";
import { documentKey, profileImageKey } from "../../src/lib/storage/s3";

// SKAI-2195: a file name with ".." becomes a safe key instead of tripping the key guard (500).
test("upload keys never contain '..'", () => {
  for (const name of ["a..b.png", "../x.png", "my...logo.png", "..png"]) {
    const key = profileImageKey("school-1", "user-1", name);
    assert.ok(!key.includes(".."), key);
    assert.ok(key.startsWith("profile-images/school-1/user-1/"), key);
  }
  assert.match(profileImageKey("s", "u", "a..b.png"), /-a\.b\.png$/);
  assert.ok(!documentKey("campus-1", "student-1", "report..final.pdf").includes(".."));
});
