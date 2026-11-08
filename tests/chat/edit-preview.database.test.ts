import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { editMessage, listConversations, sendMessage } from "../../src/lib/chat/service";

// SKAI-1291: editing the latest message refreshes the inbox preview; editing an older one does not.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL.");
const raw = new PrismaClient(), schoolId = `chat-${randomUUID()}`, campusId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const teacher = actor("TEACHER"), student = actor("STUDENT");
const as = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, work);
let conversationId = "";

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic chat school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic", regId: campusId, city: "Synthetic" } });
  for (const user of [teacher, student]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  conversationId = (await raw.conversation.create({ data: { schoolId, campusId, kind: "GROUP", title: "Synthetic group", createdById: teacher.userId, members: { create: [teacher, student].map((u) => ({ schoolId, userId: u.userId, memberRole: u === teacher ? "OWNER" as const : "MEMBER" as const })) } } })).id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

const inboxPreview = async (user: AuthUser) => (await as(user, () => listConversations(user))).find((c) => c.id === conversationId)?.lastMessagePreview;

test("editing the latest message updates the preview the recipient sees", async () => {
  const older = await as(teacher, () => sendMessage(teacher, conversationId, { body: "QA deterministic first" }));
  await new Promise((r) => setTimeout(r, 5));
  const latest = await as(teacher, () => sendMessage(teacher, conversationId, { body: "QA deterministic message" }));
  assert.equal(await inboxPreview(student), "QA deterministic message");
  const edited = await as(teacher, () => editMessage(teacher, latest.id, "QA deterministic message edited"));
  assert.equal(edited.isEdited, true);
  assert.equal(await inboxPreview(student), "QA deterministic message edited");
  await as(teacher, () => editMessage(teacher, older.id, "QA older edit"));
  assert.equal(await inboxPreview(student), "QA deterministic message edited", "an older edit leaves the preview alone");
});
