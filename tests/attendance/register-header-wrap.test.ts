import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1994: on a phone the Class and Date fields must take a full row (basis-full) instead of shrinking
// side by side, otherwise the date is cut to "12/" and the register can be marked against the wrong day.
const src = readFileSync(new URL("../../src/components/attendance/class-register.tsx", import.meta.url), "utf8");

for (const name of ["register-class", "register-date"]) {
  test(`${name} wraps onto its own row below sm`, () => {
    const line = src.split("\n").find(l => l.includes(`name="${name}"`));
    assert.ok(line, `${name} field exists`);
    assert.match(line, /basis-full/);
    assert.doesNotMatch(line, /min-w-0 flex-1 /);
  });
}
