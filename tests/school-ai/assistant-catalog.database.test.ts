import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { Pseudonymizer } from "../../src/lib/ai/pseudonymize";
import { getAssistantCatalog, resolveAssistantCatalog, selectedCatalogEntities, assertProposalCatalog, assertCatalogFocus, maskAssistantCatalog } from "../../src/lib/school-ai/assistant-catalog-service";
import type { AssistantCatalogSelection, AssistantCatalog } from "../../src/lib/school-ai/assistant-catalog";
import { createPrivateConversation, getPrivateConversation, listPrivateConversations } from "../../src/lib/school-ai/conversation-service";
import { beginSchoolAiRequest, completeSchoolAiRequest, failSchoolAiRequest } from "../../src/lib/school-ai/requests";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only isolated PostgreSQL port 55438.");
const db = new PrismaClient(), schoolId = `catalog-${randomUUID()}`, campusId = randomUUID(), otherCampus = randomUUID(), classId = randomUUID(), otherClass = randomUUID(), teacherId = randomUUID(), subjectId = randomUUID();
const admin: AuthUser = { userId: randomUUID(), schoolId, campusId, role: "CAMPUS_ADMIN", email: `${randomUUID()}@example.invalid`, accessVersion: 0 };
before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic catalog academy", slug: schoolId, regId: schoolId, city: "Test", contactEmail: admin.email, status: "ACTIVE" } });
  for (const id of [campusId, otherCampus]) await db.campus.create({ data: { id, schoolId, name: id === campusId ? "Visible campus" : "Other campus", regId: id, city: "Test" } });
  await db.user.create({ data: { id: admin.userId, schoolId, campusId, email: admin.email, role: admin.role, fullName: "Catalog admin" } });
  await db.user.create({ data: { id: teacherId, schoolId, campusId, email: `${teacherId}@example.invalid`, role: "TEACHER", fullName: "Private Teacher Name", staffProfile: { create: { schoolId, employeeCode: "EMP-CATALOG" } } } });
  await db.class.createMany({ data: [{ id: classId, schoolId, campusId, name: "Visible class", academicYear: 2026 }, { id: otherClass, schoolId, campusId: otherCampus, name: "Secret other class", academicYear: 2026 }] });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, teacherId, name: "Math" } });
});
after(async () => { await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); await prisma.$disconnect(); });
const timetable = () => getAssistantCatalog(admin, campusId, { operation: "timetable.create_draft", classId });
async function chosen(): Promise<AssistantCatalogSelection> { const catalog = await timetable(); return { query: catalog.query, snapshot: catalog.snapshot, selected: [{ kind: "teacher", id: teacherId }, { kind: "subject", id: subjectId }] }; }
test("catalogs enforce focus, campus, role and fresh domain grants before exposing options", async () => {
  assert.throws(() => assertCatalogFocus(undefined, { operation: "finance.apply_operation" }), { status: 403 }); assert.throws(() => assertCatalogFocus("work", { operation: "finance.apply_operation" }), { status: 403 });
  const catalog = await timetable(); assert(catalog.entities.some(row => row.id === classId)); assert(!JSON.stringify(catalog).includes("Secret other class"));
  await assert.rejects(() => getAssistantCatalog(admin, otherCampus, { operation: "timetable.create_draft" }), { status: 403 });
  await assert.rejects(() => getAssistantCatalog({ ...admin, role: "TEACHER", userId: teacherId }, campusId, { operation: "timetable.create_draft" }), { status: 403 });
  await db.rolePermission.create({ data: { schoolId, role: admin.role, module: "timetable", canView: false } });
  try { await assert.rejects(timetable, { status: 403 }); } finally { await db.rolePermission.deleteMany({ where: { schoolId, module: "timetable" } }); }
});
test("only chosen identities reach masked provider context and exact proposals cannot invent references", async () => {
  const selection = await chosen(), { catalog, entities } = await resolveAssistantCatalog(admin, campusId, selection), masker = new Pseudonymizer();
  const outbound = maskAssistantCatalog(catalog, entities, masker), text = JSON.stringify(outbound); assert(!text.includes("Private Teacher Name")); assert(!text.includes("Visible class")); assert(text.includes(teacherId)); assert.equal(outbound.entities.length, 3);
  assert.equal(masker.unmask(outbound.entities.find(row => row.id === teacherId)!.label), "Private Teacher Name · EMP-CATALOG");
  assertProposalCatalog({ operation: "timetable.create_draft", classId, slots: [{ id: "new-row", teacherId, subjectId }] }, selection, entities, catalog);
  assert.throws(() => assertProposalCatalog({ operation: "timetable.create_draft", classId: otherClass }, selection, entities, catalog), { status: 422 });
  assert.throws(() => assertProposalCatalog({ operation: "finance.apply_operation" }, selection, entities, catalog), { status: 422 });
  assert.throws(() => assertProposalCatalog({ operation: "academics.setup_year" }, undefined, [], undefined), { status: 422 });
  await assert.rejects(() => resolveAssistantCatalog(admin, campusId, { ...selection, selected: [{ kind: "class", id: otherClass }] }), { status: 409 });
});
test("same-name teachers require a distinguishing label; catalogs detect renamed data", async () => {
  const selection = await chosen(), duplicate = randomUUID();
  await db.user.create({ data: { id: duplicate, schoolId, campusId, email: `${duplicate}@example.invalid`, role: "TEACHER", fullName: "Private Teacher Name", staffProfile: { create: { schoolId, employeeCode: "EMP-CATALOG" } } } });
  try { const catalog = await timetable(); assert.throws(() => selectedCatalogEntities(catalog, { ...selection, snapshot: catalog.snapshot }), { status: 422 }); await assert.rejects(() => resolveAssistantCatalog(admin, campusId, selection), { status: 409 }); } finally { await db.user.delete({ where: { id: duplicate } }); }
  await db.class.update({ where: { id: classId }, data: { name: "Renamed class" } });
  try { await assert.rejects(() => resolveAssistantCatalog(admin, campusId, selection), { status: 409 }); } finally { await db.class.update({ where: { id: classId }, data: { name: "Visible class" } }); }
});
test("durable recovery binds selection; saved answer-only history and exact replays retain original domain permissions", async () => {
  const catalogContext = await chosen(), conversation = await createPrivateConversation(admin, { campusId, title: "Grounded private question", idempotencyKey: randomUUID() });
  const input = { key: randomUUID(), fingerprint: "grounded", campusId, conversationId: conversation.id, expectedConversationVersion: 0, userMessage: "Explain this teacher allocation", requestLanguage: "en" as const, catalogContext };
  const start = await beginSchoolAiRequest(admin, input); assert.equal(start.state, "CLAIMED"); if (start.state !== "CLAIMED") return;
  assert.deepEqual((await getPrivateConversation(admin, conversation.id)).recovery?.catalog, catalogContext);
  await schoolAiTransaction(admin, tx => completeSchoolAiRequest(admin, start.claim, { reply: "Private Teacher Name teaches Math." }, tx));
  assert.equal((await beginSchoolAiRequest(admin, input)).state, "COMPLETED");
  await assert.rejects(() => beginSchoolAiRequest(admin, { ...input, catalogContext: { ...catalogContext, selected: [] } }), { status: 409 });
  const next = await beginSchoolAiRequest(admin, { ...input, key: randomUUID(), fingerprint: "general", expectedConversationVersion: 1, catalogContext: undefined, userMessage: "A general question" }); assert.equal(next.state, "CLAIMED"); if (next.state === "CLAIMED") { assert.deepEqual(next.claim.history, []); await failSchoolAiRequest(admin, next.claim); }
  await db.rolePermission.create({ data: { schoolId, role: admin.role, module: "timetable", canView: false } });
  try { const page = await getPrivateConversation(admin, conversation.id); assert(page.exchanges[0].hidden); assert.equal(page.exchanges[0].turns, undefined); await assert.rejects(() => beginSchoolAiRequest(admin, input), { status: 403 }); } finally { await db.rolePermission.deleteMany({ where: { schoolId, module: "timetable" } }); }
});
test("data changing during generation prevents the answer and receipt from completing", async () => {
  const catalogContext = await chosen(), start = await beginSchoolAiRequest(admin, { key: randomUUID(), fingerprint: "stale-catalog", campusId, catalogContext }); if (start.state !== "CLAIMED") throw new Error("Expected claim");
  await db.subject.update({ where: { id: subjectId }, data: { name: "Changed Math" } });
  try { await assert.rejects(() => schoolAiTransaction(admin, tx => completeSchoolAiRequest(admin, start.claim, { reply: "A stale answer" }, tx)), { status: 409 }); const row = await db.schoolAiRequest.findUniqueOrThrow({ where: { id: start.claim.id } }); assert.equal(row.status, "PENDING"); assert.equal(row.reply, null); } finally { await db.subject.update({ where: { id: subjectId }, data: { name: "Math" } }); await failSchoolAiRequest(admin, start.claim); }
});
test("financial catalogs expose only current scoped labels and currencies, never bank numbers, with fresh account permissions", async () => {
  const id = randomUUID(), hidden = randomUUID();
  await db.bankAccount.createMany({ data: [{ id, schoolId, campusId, name: "School operating account", currency: "PKR", accountNumber: "PRIVATE-BANK-NUMBER-1234" }, { id: hidden, schoolId, campusId: otherCampus, name: "Other campus bank", currency: "PKR", accountNumber: "HIDDEN-ACCOUNT" }] });
  const catalog = await getAssistantCatalog(admin, campusId, { operation: "finance.apply_operation" }); assert(catalog.entities.some(row => row.id === id)); assert(!catalog.entities.some(row => row.id === hidden)); assert(!JSON.stringify(catalog).includes("PRIVATE-BANK-NUMBER")); assert(!JSON.stringify(catalog).includes("HIDDEN-ACCOUNT"));
  const chosen = { query: catalog.query, snapshot: catalog.snapshot, selected: [{ kind: "bank" as const, id }] }, selected = selectedCatalogEntities(catalog, chosen), outbound = JSON.stringify(maskAssistantCatalog(catalog, selected, new Pseudonymizer())); assert(!outbound.includes("School operating account")); assert(outbound.includes("PKR"));
  await db.rolePermission.create({ data: { schoolId, role: admin.role, module: "accounts", canView: false, canAdd: true } });
  try { await assert.rejects(() => getAssistantCatalog(admin, campusId, { operation: "finance.apply_operation" }), { status: 403 }); } finally { await db.rolePermission.deleteMany({ where: { schoolId, module: "accounts" } }); }
});
test("selected facts drop unchosen linked identities and preserve only explicit lookup dependencies", () => {
  const catalog: AssistantCatalog = { query: { operation: "timetable.assign_substitutes" as const }, snapshot: "a".repeat(64), truncated: false, facts: {}, entities: [{ kind: "lesson" as const, id: "lesson", label: "Lesson with private teacher", facts: { teacherId: "not-selected", availableTeacherIds: ["selected", "not-selected"] } }, { kind: "teacher" as const, id: "selected", label: "Chosen teacher", facts: {} }] };
  const output = maskAssistantCatalog(catalog, catalog.entities, new Pseudonymizer()); assert.deepEqual(output.entities[0].facts, { availableTeacherIds: ["selected"] });
});
test("general and focused conversation lists retain separate topics so pending catalogs recover in their own workflow", async () => {
  const focused = await createPrivateConversation(admin, { campusId, title: "Focused pending reply", topicKey: "domain:timetableSetup:general:v0", idempotencyKey: randomUUID() });
  const general = await listPrivateConversations(admin, { campusId }); assert(!general.conversations.some(row => row.id === focused.id));
  const scoped = await listPrivateConversations(admin, { campusId, topicKey: focused.topicKey! }); assert(scoped.conversations.some(row => row.id === focused.id)); assert(scoped.conversations.every(row => row.topicKey === focused.topicKey));
});
