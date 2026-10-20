import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { aiOutputSchema } from "../../src/lib/ai/output-schema";
import { assertNoPII, scanForPII } from "../../src/lib/ai/pseudonymize";
import { paperDataSchema } from "../../src/lib/school-ai/assessment";
import { lessonPlanSchema, semanticReviewSchema } from "../../src/lib/school-ai/learning";
import { scriptResponseProposalSchema } from "../../src/lib/school-ai/script-response";
import { writtenMarkProposalSchema } from "../../src/lib/school-ai/written-marking";

test("assessment output schemas do not mistake generated integer limits for personal identifiers", () => {
  assert.ok(scanForPII(JSON.stringify(z.toJSONSchema(paperDataSchema))).includes(String(Number.MAX_SAFE_INTEGER)));
  for (const schema of [paperDataSchema, lessonPlanSchema, semanticReviewSchema, scriptResponseProposalSchema, writtenMarkProposalSchema]) {
    assert.doesNotThrow(() => assertNoPII(JSON.stringify(aiOutputSchema(schema))));
  }
});

test("schema conversion preserves business bounds and never suppresses actual sensitive values", () => {
  const schema = z.object({ version: z.number().int().positive(), minutes: z.number().int().min(1).max(480), index: z.number().int() });
  const json = aiOutputSchema(schema);
  assert.deepEqual(json.properties?.version, { type: "integer", exclusiveMinimum: 0 });
  assert.deepEqual(json.properties?.minutes, { type: "integer", minimum: 1, maximum: 480 });
  assert.deepEqual(json.properties?.index, { type: "integer" });
  assert.equal(schema.safeParse({ version: Number.MAX_SAFE_INTEGER + 1, minutes: 10, index: 0 }).success, false);
  assert.throws(() => assertNoPII(JSON.stringify({ outputSchema: json, source: "Contact synthetic@example.invalid" })), /personal identifier/);
  const unsafeSchema = aiOutputSchema(z.string().describe("Contact synthetic@example.invalid"));
  assert.throws(() => assertNoPII(JSON.stringify(unsafeSchema)), /personal identifier/);
});
