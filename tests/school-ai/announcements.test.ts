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
