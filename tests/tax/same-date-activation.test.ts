import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/lib/tax/service.ts", "utf8");
const activate = source.slice(source.indexOf("export async function activateDue"), source.indexOf("export async function activationFor"));
const resolve = source.slice(source.indexOf("export async function activationFor"), source.indexOf("export async function taxFor"));

test("SKAI-1474: due activations run oldest first, so the newest same-date one activates last", () => {
  assert.match(activate, /orderBy: \[\{ effectiveFrom: "asc" \}, \{ createdAt: "asc" \}, \{ id: "asc" \}\]/);
});

test("SKAI-1474: activating supersedes an older activation with the same effective date", () => {
  assert.match(activate, /OR: \[\{ effectiveFrom: \{ lt: a\.effectiveFrom! \} \}, \{ effectiveFrom: a\.effectiveFrom!, createdAt: \{ lte: a\.createdAt \} \}\]/);
});

test("SKAI-1474: invoice resolution breaks an effective-date tie deterministically", () => {
  assert.match(resolve, /orderBy: \[\{ effectiveFrom: "desc" \}, \{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
});
