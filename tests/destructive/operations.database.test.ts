import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { operationDelete, type OperationDeleteKind } from "../../src/lib/destructive/operations";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const db = new PrismaClient(), schoolId = `delete309-${randomUUID()}`, otherSchool = `delete309-${randomUUID()}`, campusId = randomUUID(), campusB = randomUUID(), campusC = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, institutionKind: "GROUP" });
const lead = actor("CAMPUS_ADMIN"), librarian = actor("LIBRARIAN"), denied = actor("TEACHER");
const scope = { schoolId, campusId };
before(async () => {
  for (const id of [schoolId, otherSchool]) await db.school.create({ data: { id, name: "Synthetic Confirmation School", slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [id, sid] of [[campusId, schoolId], [campusB, schoolId], [campusC, otherSchool]]) await db.campus.create({ data: { id, schoolId: sid, name: id, regId: id, city: "Lahore" } });
  for (const u of [lead, librarian, denied]) await db.user.create({ data: { id: u.userId, schoolId, campusId, role: u.role, email: u.email, fullName: "Synthetic confirmer", isActive: true } });
});
after(async () => { await db.$disconnect(); await prisma.$disconnect(); });
async function preview(user: AuthUser, kind: OperationDeleteKind, id: string) {
  const result = await operationDelete(user, kind, { id, campusId, preview: true, version: null });
  assert.ok("preview" in result && result.preview); return result.preview;
}
const remove = (user: AuthUser, kind: OperationDeleteKind, id: string, version: string | null) => operationDelete(user, kind, { id, campusId, preview: false, version });

test("all twelve shared operations delete only the reviewed record and replay once", async () => {
  const type = await db.dormRoomType.create({ data: { ...scope, name: "Room fixture" } });
  const records: [OperationDeleteKind, string][] = [
    ["academic/rooms", (await db.classRoom.create({ data: { ...scope, roomNumber: randomUUID(), capacity: 30 } })).id],
    ["transport/routes", (await db.transportRoute.create({ data: { ...scope, title: "Synthetic route", fare: 0 } })).id],
    ["transport/vehicles", (await db.vehicle.create({ data: { ...scope, number: randomUUID(), capacity: 1 } })).id],
    ["dormitory/rooms", (await db.dormRoom.create({ data: { ...scope, number: randomUUID(), roomTypeId: type.id, capacity: 1 } })).id],
    ["dormitory/room-types", type.id],
    ["library/categories", (await db.bookCategory.create({ data: { ...scope, name: randomUUID() } })).id],
    ["library/books", (await db.book.create({ data: { ...scope, title: "Synthetic book", copiesTotal: 0, copiesAvailable: 0 } })).id],
    ["library/members", (await db.libraryMember.create({ data: { ...scope, memberNo: randomUUID(), userId: librarian.userId } })).id],
    ["inventory/categories", (await db.itemCategory.create({ data: { ...scope, name: randomUUID() } })).id],
    ["inventory/stores", (await db.itemStore.create({ data: { ...scope, name: randomUUID() } })).id],
    ["inventory/suppliers", (await db.supplier.create({ data: { ...scope, name: randomUUID() } })).id],
    ["inventory/items", (await db.item.create({ data: { ...scope, name: randomUUID() } })).id],
  ];
  for (const [kind, id] of records) {
    const user = kind.startsWith("library/") ? librarian : lead;
    const p = await preview(user, kind, id); assert.equal(p.blocked, false, kind); assert.equal(p.count, 1);
    const responses = await Promise.all([1, 2, 3].map(() => remove(user, kind, id, p.version)));
    assert.equal(responses.filter(r => "replayed" in r && !r.replayed).length, 1, kind);
    assert.equal(await db.auditLog.count({ where: { schoolId, recordId: id, tableName: kind } }), 1);
  }
});
test("changed version, missing review, denied roles, tenant/campus boundaries and revoked permission fail closed", async () => {
  const row = await db.bookCategory.create({ data: { ...scope, name: randomUUID() } });
  const p = await preview(librarian, "library/categories", row.id);
  await assert.rejects(() => remove(librarian, "library/categories", row.id, null), { status: 428 });
  await assert.rejects(() => preview(denied, "library/categories", row.id), { status: 403 });
  await db.bookCategory.update({ where: { id: row.id }, data: { name: "Changed after review" } });
  await assert.rejects(() => remove(librarian, "library/categories", row.id, p.version), { status: 409 });
  for (const [campus, school] of [[campusB, schoolId], [campusC, otherSchool]]) {
    const hidden = await db.bookCategory.create({ data: { campusId: campus, schoolId: school, name: randomUUID() } });
    await assert.rejects(() => preview(librarian, "library/categories", hidden.id), { status: 404 });
    await assert.rejects(() => operationDelete(librarian, "library/categories", { id: hidden.id, campusId: campus, preview: true, version: null }), { status: 403 });
  }
  const fresh = await preview(librarian, "library/categories", row.id);
  await db.rolePermission.create({ data: { schoolId, role: "LIBRARIAN", module: "library", canView: true, canAdd: true, canEdit: true, canDelete: false } });
  await assert.rejects(() => remove(librarian, "library/categories", row.id, fresh.version), { status: 403 });
  await db.rolePermission.deleteMany({ where: { schoolId, role: "LIBRARIAN" } });
  await db.user.update({ where: { id: librarian.userId }, data: { isActive: false } });
  await assert.rejects(() => remove(librarian, "library/categories", row.id, fresh.version), { status: 403 });
  await db.user.update({ where: { id: librarian.userId }, data: { isActive: true } });
  assert.ok(await db.bookCategory.findUnique({ where: { id: row.id } }));
  assert.equal(await db.auditLog.count({ where: { schoolId, recordId: row.id } }), 0);
});
test("new dependencies invalidate review and retained library/stock history blocks deletion", async () => {
  const category = await db.bookCategory.create({ data: { ...scope, name: randomUUID() } });
  const p = await preview(librarian, "library/categories", category.id);
  const book = await db.book.create({ data: { ...scope, categoryId: category.id, title: "History fixture" } });
  await assert.rejects(() => remove(librarian, "library/categories", category.id, p.version), { status: 409 });
  const blocked = await preview(librarian, "library/categories", category.id); assert.equal(blocked.blocked, true);
  await assert.rejects(() => remove(librarian, "library/categories", category.id, blocked.version), { status: 409 });
  await db.bookCopy.create({ data: { ...scope, bookId: book.id, barcode: randomUUID() } });
  const bp = await preview(librarian, "library/books", book.id); assert.equal(bp.blocked, true);
  await assert.rejects(() => remove(librarian, "library/books", book.id, bp.version), { status: 409 });
  assert.ok(await db.book.findUnique({ where: { id: book.id } }));
});

test("student and staff documents recheck review, related-record scope, and commit one removal receipt", async () => {
  const cls = await db.class.create({ data: { ...scope, name: "Synthetic document class", section: "A", academicYear: 2026 } });
  const pupil = await db.student.create({ data: { ...scope, classId: cls.id, fullName: "Synthetic Document Student", rollNo: randomUUID(), gender: "FEMALE" } });
  const studentDoc = await db.studentDocument.create({ data: { schoolId, studentId: pupil.id, kind: "OTHER", fileName: "Synthetic document.pdf", fileKey: `student-docs/${campusId}/${pupil.id}/synthetic.pdf` } });
  const staffDoc = await db.staffDocument.create({ data: { schoolId, userId: lead.userId, kind: "OTHER", fileName: "Synthetic staff.pdf", fileKey: `staff-docs/${campusId}/${lead.userId}/synthetic.pdf` } });
  for (const [kind, row] of [["students/documents", studentDoc], ["staff/documents", staffDoc]] as const) {
    const p = await preview(lead, kind, row.id);
    assert.equal(p.label, row.fileName);
    await assert.rejects(() => preview(librarian, kind, row.id), { status: 403 });
    await Promise.all([remove(lead, kind, row.id, p.version), remove(lead, kind, row.id, p.version)]);
    assert.equal(await db.auditLog.count({ where: { schoolId, recordId: row.id } }), 1);
  }
  assert.equal(await db.studentTimelineEvent.count({ where: { schoolId, studentId: pupil.id, title: "Document removed" } }), 1);
  const invalid = await db.studentDocument.create({ data: { schoolId, studentId: pupil.id, kind: "OTHER", fileName: "Invalid scoped key.pdf", fileKey: `student-docs/${campusB}/${pupil.id}/synthetic.pdf` } });
  await assert.rejects(() => preview(lead, "students/documents", invalid.id), { status: 404 });
  assert.ok(await db.studentDocument.findUnique({ where: { id: invalid.id } }));
});
test("a failed audit write rolls back deletion without partial business effects", async () => {
  const row = await db.bookCategory.create({ data: { ...scope, name: randomUUID() } });
  const p = await preview(librarian, "library/categories", row.id);
  const id = createHash("sha256").update(JSON.stringify(["confirmed-delete-v1", schoolId, campusId, librarian.userId, "library/categories", row.id, p.version])).digest("hex");
  // A deliberately incompatible receipt simulates an unavailable/conflicting audit dependency.
  await db.auditLog.create({ data: { id, schoolId, campusId, userId: denied.userId, tableName: "synthetic-collision", recordId: row.id } });
  await assert.rejects(() => remove(librarian, "library/categories", row.id, p.version));
  assert.ok(await db.bookCategory.findUnique({ where: { id: row.id } }));
  await db.auditLog.delete({ where: { id } });
  await remove(librarian, "library/categories", row.id, p.version);
  assert.equal(await db.bookCategory.findUnique({ where: { id: row.id } }), null);
});


test("academic room capacity edits invalidate review and denied/cross-campus records stay intact", async () => {
  const room = await db.classRoom.create({ data: { ...scope, roomNumber: randomUUID(), capacity: 30 } });
  const p = await preview(lead, "academic/rooms", room.id);
  await db.classRoom.update({ where: { id: room.id }, data: { capacity: 31 } });
  await assert.rejects(() => remove(lead, "academic/rooms", room.id, p.version), { status: 409 });
  await assert.rejects(() => preview(denied, "academic/rooms", room.id), { status: 403 });
  const hidden = await db.classRoom.create({ data: { schoolId, campusId: campusB, roomNumber: randomUUID(), capacity: 30 } });
  await assert.rejects(() => preview(lead, "academic/rooms", hidden.id), { status: 404 });
  assert.equal((await db.classRoom.findUniqueOrThrow({ where: { id: room.id } })).capacity, 31);
  assert.equal(await db.auditLog.count({ where: { schoolId, recordId: room.id } }), 0);
});
