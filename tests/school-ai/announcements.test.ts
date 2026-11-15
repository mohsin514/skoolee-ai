import assert from "node:assert/strict";
import { test } from "node:test";
import { announcementProposalSchema } from "../../src/lib/school-ai/announcements";
const proposal = { operation: "communications.queue_announcement", classIds: ["class"], channel: "EMAIL", messages: { en: { subject: "School update", body: "Exact reviewed text\nSecond line" } }, fallbackLanguage: "en" };
test("announcements require exact supported text, explicit fallback and a bounded unique class scope", () => {
  assert(announcementProposalSchema.safeParse(proposal).success);
  for (const patch of [{ classIds: [] }, { classIds: ["class", "class"] }, { classIds: Array.from({ length: 11 }, (_, index) => String(index)) }, { channel: "WHATSAPP" }, { messages: {} }, { fallbackLanguage: "ar" }, { attachmentUrl: "https://example.invalid" }]) assert(!announcementProposalSchema.safeParse({ ...proposal, ...patch }).success);
  assert(announcementProposalSchema.safeParse({ ...proposal, fallbackLanguage: null }).success);
});
test("announcement subject cannot inject mail headers and delivery does not need HTML/template variables", () => {
  assert(!announcementProposalSchema.safeParse({ ...proposal, messages: { en: { subject: "Update\r\nBcc: stranger@example.invalid", body: "Text" } } }).success);
  const literal = { ...proposal, messages: { en: { subject: "Exact text", body: "<strong>Literal markup</strong> {{not-a-template}}" } } };
  assert.deepEqual(announcementProposalSchema.parse(literal), literal);
});

// SKAI-2186: class ids with an inner space ("<campus>-Grade 1-A-2026") are valid targets; edge or double spaces are not.
test("announcement class ids allow single inner spaces only", async () => {
  const { announcementProposalSchema } = await import("@/lib/school-ai/announcements");
  const classIds = announcementProposalSchema.shape.classIds;
  assert.equal(classIds.safeParse(["campus-Grade 1-A-2026"]).success, true);
  for (const bad of [" lead", "trail ", "two  spaces", "semi;colon"]) assert.equal(classIds.safeParse([bad]).success, false, bad);
});
