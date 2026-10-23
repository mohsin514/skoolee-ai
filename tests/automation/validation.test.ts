import { test } from "node:test";
import assert from "node:assert/strict";
import { automaticOutputSchema } from "../../src/lib/automation/output-schema";
import { automaticActionSchema, profileActionSchema, type AutomaticJob } from "../../src/lib/automation/schema";
import { validateCompletion, validateSelectedAction } from "../../src/lib/automation/validation";
import { SCHOOL_AI_OPERATION_NAMES } from "../../src/lib/school-ai/operations";
const step = (tool: string): AutomaticJob["steps"][number] => ({ key: tool, tool, title: tool, receipt: { saved: true } });
test("a read, private plan or draft cannot prove an operational change", () => {
 for (const tool of ["school.inspect", "platform.inspect", "personal.save_plan", "work.save"]) assert.throws(() => validateCompletion([step(tool)], "executed"));
 assert.throws(() => validateCompletion([], "executed"));
 validateCompletion([step("students.create")], "executed");
 validateCompletion([step("personal.save_plan")], "plan_saved");
 validateCompletion([step("school.inspect")], "answered");
 assert.throws(() => validateCompletion([step("students.create")], "answered"));
});
test("empty profile updates are rejected", () => {
 assert.equal(profileActionSchema.safeParse({}).success, false);
 assert.equal(profileActionSchema.safeParse({ preferredLanguage: "ur" }).success, true);
});
test("selection and generated parameters must identify the same tool and operation", () => {
 assert.throws(() => validateSelectedAction({ type: "select", tool: "campus.create" }, { tool: "profile.update", title: "Name", data: { fullName: "Test" } }));
 assert.throws(() => validateSelectedAction({ type: "select", tool: "school.inspect", operation: "academics.setup_year" }, { tool: "school.inspect", title: "Read", data: { operation: "fees.generate_invoices" } }));
});
test("each tool schema excludes all other action tools", () => {
 const tools = automaticActionSchema.options.map(option => option.shape.tool.value);
 for (const tool of tools) {
  const schema = JSON.stringify(automaticOutputSchema([tool], [...SCHOOL_AI_OPERATION_NAMES]));
  assert.ok(schema.includes(`"const":"${tool}"`), tool);
  for (const other of tools.filter(value => value !== tool)) assert.ok(!schema.includes(`"const":"${other}"`), `${tool} must exclude ${other}`);
 }
});
test("each executable operation schema excludes all other operations", () => {
 for (const operation of SCHOOL_AI_OPERATION_NAMES.filter(value => value !== "curriculum.import_topics")) {
  const schema = JSON.stringify(automaticOutputSchema(["school.execute"], [operation]));
  assert.ok(schema.includes(`"const":"${operation}"`), operation);
  // A school timetable batch contains individual timetable drafts as its payload.
  for (const other of SCHOOL_AI_OPERATION_NAMES.filter(value => value !== operation && !(operation === "timetable.create_school_drafts" && value === "timetable.create_draft"))) assert.ok(!schema.includes(`"const":"${other}"`), `${operation} must exclude ${other}`);
 }
});
