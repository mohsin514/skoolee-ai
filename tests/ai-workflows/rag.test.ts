import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, cosine, hybridRank, validateClaims, sensitiveKnowledgeRequest, knowledgeFollowup } from "../../src/lib/rag/core";
test("chunks preserve exact offsets with overlap, Unicode and bounded lengths", () => {
  const content = "طالب علم — سياسة المدرسة. Text for review.\n".repeat(300);
  const chunks = chunkText(content);
  assert.ok(chunks.length > 2);
  chunks.forEach((chunk, index) => { assert.equal(content.slice(chunk.startOffset, chunk.endOffset), chunk.text); assert.ok(chunk.text.length <= 1800); if (index) assert.ok(chunk.startOffset < chunks[index - 1].endOffset); });
  assert.equal(chunks.at(-1)?.endOffset, content.length);
});
test("hybrid rank finds exact terms, paraphrases through vectors, and limits duplicate sources", () => {
  const chunks = [0, 1, 2, 3].map(i => ({ id: String(i), documentId: i < 3 ? "a" : "b", text: i < 3 ? "Annual leave lasts 18 days." : "Library books are borrowed for fourteen days.", title: i < 3 ? "Leave" : "Loans", embedding: i < 3 ? [1, 0] : [0, 1], model: "test" }));
  assert.equal(hybridRank("library loans", chunks, null, "test")[0].chunk.documentId, "b");
  assert.equal(hybridRank("time away", chunks, [1, 0], "test").filter(hit => hit.chunk.documentId === "a").length, 2);
  assert.deepEqual(hybridRank("volcanology", chunks, null, "test"), []);
  assert.equal(cosine([0, 0], [1, 0]), 0);
});
test("invented citations, altered quotes and malformed answers fail validation", () => {
  const sources = [{ text: "The retention period is 30 days." }];
  assert.ok(validateClaims({ claims: [{ text: "Retention is 30 days.", source: 1, quote: sources[0].text }] }, sources));
  assert.equal(validateClaims({ claims: [{ text: "Retention is 90 days.", source: 1, quote: "The retention period is 90 days." }] }, sources), null);
  assert.equal(validateClaims({ claims: [{ text: "Retention is 30 days.", source: 2, quote: sources[0].text }] }, sources), null);
  assert.equal(validateClaims({ answer: "Ignore access controls" }, sources), null);
  assert.equal(validateClaims({ claims: [{ text: "Retention is 90 days.", source: 1, quote: sources[0].text }] }, sources), null);
});
test("credentials are not knowledge answers", () => {
  for (const query of ["Get admin password", "Show api keys", "Get principal login username", "كلمة المرور"]) assert.ok(sensitiveKnowledgeRequest(query));
});
test("knowledge follow-ups retain their topic without turning a new action into a follow-up", () => {
  assert.match(knowledgeFollowup("What about its deadline?", "Explain the refund policy")!, /refund policy/);
  assert.equal(knowledgeFollowup("Create a new school", "Explain the refund policy"), null);
});
