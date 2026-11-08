import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-97 (PM-02.18): every password-change path must refuse the last five
// passwords, record the replaced hash, and never log or audit password material.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const PATHS = {
  reset: "src/app/actions/auth/reset.ts",
  change: "src/app/api/auth/change-password/route.ts",
  firstLogin: "src/app/api/auth/first-password/route.ts",
  owner: "src/app/api/owner/users/[id]/password/route.ts",
  super: "src/app/api/super/users/[id]/password/route.ts",
} as const;

for (const [name, path] of Object.entries(PATHS)) {
  const source = read(path);

  test(`${name}: checks the last five history verifiers before hashing`, () => {
    assert.match(source, /passwordHistory\.findMany\(\{[\s\S]*?orderBy: \{ createdAt: "desc" \}[\s\S]*?take: 5/);
    const lookup = source.indexOf("passwordHistory.findMany");
    const compare = source.indexOf("bcrypt.compare(newPassword", lookup);
    const hash = source.indexOf("bcrypt.hash(newPassword");
    assert.ok(lookup > 0 && compare > lookup && hash > compare, "history check must run before the new hash is written");
  });

  test(`${name}: records the replaced hash in history`, () => {
    assert.match(source, /passwordHistory\.create\(\{[\s\S]*?oldPasswordHash:/);
  });

  test(`${name}: never logs password or hash values`, () => {
    for (const line of source.split("\n").filter((l) => /console\.|logger\./.test(l))) {
      assert.doesNotMatch(line, /newPassword|oldPasswordHash|temporaryHash|\.password\b|hashed/, line.trim());
    }
  });
}

test("history rows stay out of the generic audit trail", () => {
  assert.match(read("src/lib/db/audit-trail.ts"), /SKIPPED_MODELS = new Set\(\[[\s\S]*"passwordHistory"/);
});

test("history rows are tenant scoped", () => {
  assert.match(read("src/lib/db/tenant-models.ts"), /"passwordHistory"/);
});
