import { test } from "node:test";
import assert from "node:assert/strict";
import { QUESTION_TAG_LIMIT, questionBankMetadataSchema } from "@/lib/school-ai/assessment";

const tags = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

test("SKAI-1758 schema refuses one tag past the shared limit with a clear message", () => {
  const parsed = questionBankMetadataSchema.safeParse({ tags: tags(QUESTION_TAG_LIMIT + 1), difficulty: "UNSPECIFIED" });
  assert.equal(parsed.success, false);
  assert.deepEqual(parsed.error!.issues[0].path, ["tags"]);
  assert.match(parsed.error!.issues[0].message, new RegExp(`at most ${QUESTION_TAG_LIMIT} tags`));
});

test("SKAI-1758 schema accepts exactly the shared limit", () => {
  assert.equal(QUESTION_TAG_LIMIT, 12);
  assert.equal(questionBankMetadataSchema.safeParse({ tags: tags(QUESTION_TAG_LIMIT), difficulty: "EASY" }).success, true);
});

test("SKAI-1758 editor reads the limit from the schema module, not a literal", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../src/components/school-ai/question-bank.tsx", import.meta.url), "utf8");
  assert.match(source, /QUESTION_TAG_LIMIT[^\n]*from "@\/lib\/school-ai\/assessment"/);
  assert.match(source, /tags\.length > QUESTION_TAG_LIMIT\) return;/);
  assert.doesNotMatch(source, /maxLength=\{970\}/);
});
