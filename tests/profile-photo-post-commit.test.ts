import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1655: the old profile photo is deleted only after prisma.user.update succeeds.
const source = readFileSync("src/app/api/profile/route.ts", "utf8");

test("old photo cleanup runs after the user update commits", () => {
  const update = source.indexOf("await prisma.user.update({");
  const cleanup = source.indexOf("if (replacedImage) void deleteFile(replacedImage)");
  assert.ok(update > 0 && cleanup > update);
  assert.equal(source.match(/deleteFile\(/g)?.length, 1);
});
