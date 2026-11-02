import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WHATSAPP_UTILITY_TEMPLATES, templatePayload, utilityTemplateFor } from "../../src/lib/whatsapp/utility-templates";

// SKAI-986 (INT-WA-02): absence, fee and exam-change notices use versioned, Meta-approved utility templates.
const on = { WHATSAPP_UTILITY_TEMPLATES: "on" };
const context = { studentName: "Student A", date: "2 November 2026", campusName: "QA-01 Main", balanceDue: "PKR 5,000", dueDate: "10 November 2026" };

test("SKAI-986: the catalogue covers absence, fee due, fee overdue and exam change in EN, UR and AR", () => {
  for (const key of ["ATTENDANCE_ALERT", "FEE_DUE_REMINDER", "FEE_OVERDUE_REMINDER", "EXAM_SCHEDULE"] as const) {
    const template = WHATSAPP_UTILITY_TEMPLATES[key]!;
    assert.match(template.name, new RegExp(`_v${template.version}$`), `${key} name carries its version`);
    assert.deepEqual(Object.keys(template.languages).sort(), ["ar", "en", "ur"]);
  }
});

test("SKAI-986: templates stay off until enabled; then parameters follow the approved order", () => {
  assert.equal(utilityTemplateFor("ATTENDANCE_ALERT", "en", context, {}), null);
  assert.deepEqual(utilityTemplateFor("ATTENDANCE_ALERT", "ur", context, on), { name: "skoolee_absence_v1", language: "ur", params: ["Student A", "2 November 2026", "QA-01 Main"] });
  assert.equal(utilityTemplateFor("GENERAL_ANNOUNCEMENT", "en", context, on), null, "non-utility messages keep the text path");
});

test("SKAI-986: a missing value is a dash (Meta rejects empty parameters) and an unknown language falls back to English", () => {
  assert.deepEqual(utilityTemplateFor("FEE_DUE_REMINDER", "fr", { studentName: "Student A" }, on)?.params, ["Student A", "-", "-"]);
  assert.equal(utilityTemplateFor("FEE_DUE_REMINDER", "fr", context, on)?.language, "en");
});

test("SKAI-986: the Cloud API body is a template message with body parameters", () => {
  assert.deepEqual(templatePayload("+920000000000", { name: "skoolee_fee_due_v1", language: "en", params: ["A", "B"] }), {
    to: "+920000000000", type: "template", template: { name: "skoolee_fee_due_v1", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: "A" }, { type: "text", text: "B" }] }] },
  });
});

test("SKAI-986: notification sends pass the template through the WhatsApp client", () => {
  assert.match(readFileSync("src/lib/notifications/service.ts", "utf8"), /template: utilityTemplateFor\(input\.key, locale\.language, context\) \?\? undefined,/);
  assert.match(readFileSync("src/lib/whatsapp/client.ts", "utf8"), /message\.template \? templatePayload\(message\.to, message\.template\)/);
});
