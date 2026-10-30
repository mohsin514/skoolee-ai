import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pseudonymizer, classifyKey, CLEAR_KEYS, CLEAR_NAME_MODELS, PERSON_NAME_MODELS } from "../../src/lib/ai/pseudonymize";

test("class, subject and campus labels stay clear while people are tokenised", () => {
  const masker = new Pseudonymizer();
  const context = masker.maskObject({
    classes: [{ id: "c1", name: "7B", section: "A" }],
    subjects: [{ id: "s1", name: "Mathematics" }],
    campus: { name: "Model Town" },
    teachers: [{ id: "t1", fullName: "Sana Malik" }],
    students: [{ name: "Ayesha Khan", nameUr: "عائشہ خان", guardianNameUr: "عمران خان", rollNo: "R-12" }],
  });
  assert.deepEqual(context.classes[0], { id: "c1", name: "7B", section: "A" });
  assert.equal(context.subjects[0].name, "Mathematics");
  assert.equal(context.campus.name, "Model Town");
  assert.match(context.teachers[0].fullName, /^\[PERSON_\d+\]$/);
  assert.match(context.students[0].name, /^\[PERSON_\d+\]$/);
  assert.match(context.students[0].nameUr, /^\[PERSON_\d+\]$/, "Urdu names were unmasked before this fix");
  assert.match(context.students[0].guardianNameUr, /^\[PERSON_\d+\]$/);
  assert.equal(context.students[0].rollNo, "R-12");
});

test("an unknown container keeps bare name a person (fail closed)", () => {
  assert.equal(classifyKey("name"), "PERSON");
  assert.equal(classifyKey("name", "visitors"), "PERSON");
  assert.equal(classifyKey("name", "phoneCallLogs"), "PERSON");
  assert.equal(classifyKey("name", "classes"), null);
  assert.equal(classifyKey("className"), null);
  assert.equal(classifyKey("fileName"), "PERSON", "file names often carry a learner's name");
});

test("masking respects word boundaries in every script", () => {
  const masker = new Pseudonymizer();
  masker.token("Ali", "PERSON");
  masker.token("سارہ", "PERSON");
  const masked = masker.mask("Ali scored 12 in Alignment; Ali's sister سارہ نے سارہکی not");
  assert.equal(masked, "[PERSON_1] scored 12 in Alignment; [PERSON_1]'s sister [PERSON_2] نے سارہکی not");
  assert.equal(masker.unmask(masked), "Ali scored 12 in Alignment; Ali's sister سارہ نے سارہکی not");
});

test("regex metacharacters in registered values are literal", () => {
  const masker = new Pseudonymizer();
  masker.token("M. (Ahmed)", "PERSON");
  assert.equal(masker.mask('{"teacher":"M. (Ahmed)","x":"MX (Ahmed)"}'), '{"teacher":"[PERSON_1]","x":"MX (Ahmed)"}');
});

test("every Prisma *name* field is either a person or a reviewed label", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const unclassified: string[] = [], bareNames: string[] = [];
  for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const line of body.split("\n")) {
      const field = line.trim().split(/\s+/)[0];
      if (!field || field.startsWith("@") || field.startsWith("//") || !/name/i.test(field)) continue;
      if (field === "name") { bareNames.push(model); continue; }
      if (!CLEAR_KEYS.has(field) && classifyKey(field) === null) unclassified.push(`${model}.${field}`);
    }
  }
  assert.deepEqual(unclassified, [], "Classify these fields in src/lib/ai/pseudonymize.ts");
  const unreviewed = bareNames.filter(model => CLEAR_NAME_MODELS.has(model) === PERSON_NAME_MODELS.has(model));
  assert.deepEqual(unreviewed, [], "Add each model with a bare `name` to exactly one of CLEAR_NAME_MODELS or PERSON_NAME_MODELS");
});
