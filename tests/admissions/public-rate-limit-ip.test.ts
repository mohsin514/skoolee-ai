import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-2113: public admissions routes key rate limits on clientIp() (SKO-457), never on the raw
// client-controlled x-forwarded-for header.
for (const file of ["src/app/api/public/admissions/route.ts", "src/app/api/public/admissions/documents/route.ts"]) {
  test(`${file} derives the rate-limit address from clientIp`, () => {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /x-forwarded-for/i);
    assert.match(source, /clientIp\(request\.headers\)/);
  });
}
