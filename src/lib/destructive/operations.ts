import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, assertStaffRole, canManageCampusOps, canManageLibrary, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { authorizeAssignment } from "@/lib/api/teacher-assignments";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { studentScope, campusScope } from "@/lib/auth/policy";
import { matchesDocumentKey } from "@/lib/storage/document-key-scope";
import { deleteFile } from "@/lib/storage/s3";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { deletionVersion } from "./version";

export const operationDeleteModules = {
  "academic/rooms": "timetable",
  "students/documents": "students",
  "staff/documents": "staff",
  "transport/routes": "transport",
  "transport/vehicles": "transport",
  "dormitory/room-types": "dormitory",
  "dormitory/rooms": "dormitory",
  "library/categories": "library",
  "library/books": "library",
  "library/members": "library",
  "inventory/categories": "inventory",
  "inventory/stores": "inventory",
  "inventory/suppliers": "inventory",
  "inventory/items": "inventory",
} as const;
export type OperationDeleteKind = keyof typeof operationDeleteModules;

// Read the entire record, including the dependent counts reviewed by the user.
// Models without updatedAt still have a deterministic optimistic version.
async function target(tx: TxClient, kind: OperationDeleteKind, id: string, campusId: string, schoolId: string, user: AuthUser) {
  const where = { id, campusId, schoolId };
  switch (kind) {
    case "academic/rooms": {
      const record = await tx.classRoom.findFirst({ where, include: { _count: { select: { slots: true, examSchedules: true, examRooms: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.roomNumber, blocked: record._count.slots + record._count.examSchedules + record._count.examRooms, remove: async () => { await tx.classRoom.delete({ where: { id } }); } };
    }
    case "students/documents": {
      const record = await tx.studentDocument.findFirst({ where: { id, student: { ...studentScope(user), campusId } }, include: { student: { select: { campusId: true } } } });
      if (!record || !matchesDocumentKey(record.fileKey, "student-docs", campusId, record.studentId)) throw new ApiError("Record not found", 404);
      return { record, label: record.fileName, blocked: 0, cleanupKey: record.fileKey, remove: async () => {
        await tx.studentDocument.delete({ where: { id } });
        await tx.studentTimelineEvent.create({ data: { studentId: record.studentId, kind: "NOTE", title: "Document removed", actorId: user.userId } });
      } };
    }
    case "staff/documents": {
      const record = await tx.staffDocument.findFirst({ where: { id, user: { ...campusScope(user), campusId } } });
      if (!record || !matchesDocumentKey(record.fileKey, "staff-docs", campusId, record.userId)) throw new ApiError("Record not found", 404);
      return { record, label: record.fileName, blocked: 0, cleanupKey: record.fileKey, remove: async () => {
        await tx.staffDocument.delete({ where: { id } });
      } };
    }
    case "transport/routes": {
      const record = await tx.transportRoute.findFirst({ where, include: { _count: { select: { students: true, vehicles: true, stops: true, trips: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.title, blocked: record._count.students + record._count.trips + record._count.vehicles + record._count.stops, remove: async () => {
        await tx.routeVehicle.deleteMany({ where: { routeId: id } });
        await tx.transportRoute.delete({ where: { id } });
      } };
    }
    case "transport/vehicles": {
      const record = await tx.vehicle.findFirst({ where, include: { _count: { select: { routes: true, trips: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.number, blocked: record._count.routes + record._count.trips, remove: async () => {
        await tx.vehicle.delete({ where: { id } });
      } };
    }
    case "dormitory/room-types": {
      const record = await tx.dormRoomType.findFirst({ where, include: { _count: { select: { rooms: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.rooms, remove: async () => {
        await tx.dormRoomType.delete({ where: { id } });
      } };
    }
    case "dormitory/rooms": {
      const record = await tx.dormRoom.findFirst({ where, include: { _count: { select: { allocations: true, students: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.number, blocked: record._count.allocations + record._count.students, remove: async () => {
        await tx.dormRoom.delete({ where: { id } });
      } };
    }
    case "library/categories": {
      const record = await tx.bookCategory.findFirst({ where, include: { _count: { select: { books: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.books, remove: async () => {
        await tx.bookCategory.delete({ where: { id } });
      } };
    }
    case "library/books": {
      const record = await tx.book.findFirst({ where, include: { _count: { select: { issues: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      const dependencies = { copies: await tx.bookCopy.count({ where: { bookId: id, schoolId } }), reservations: await tx.bookReservation.count({ where: { bookId: id, schoolId } }) };
      return { record: { ...record, dependencies }, label: record.title, blocked: record._count.issues + dependencies.copies + dependencies.reservations, remove: async () => {
        await tx.book.delete({ where: { id } });
      } };
    }
    case "library/members": {
      const record = await tx.libraryMember.findFirst({ where, include: { _count: { select: { issues: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      const dependencies = { charges: await tx.libraryCharge.count({ where: { memberId: id, schoolId } }), reservations: await tx.bookReservation.count({ where: { memberId: id, schoolId } }) };
      return { record: { ...record, dependencies }, label: record.memberNo, blocked: record._count.issues + dependencies.charges + dependencies.reservations, remove: async () => {
        await tx.libraryMember.delete({ where: { id } });
      } };
    }
    case "inventory/categories": {
      const record = await tx.itemCategory.findFirst({ where, include: { _count: { select: { items: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.items, remove: async () => {
        await tx.itemCategory.delete({ where: { id } });
      } };
    }
    case "inventory/stores": {
      const record = await tx.itemStore.findFirst({ where, include: { _count: { select: { stock: true, transactions: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.stock + record._count.transactions, remove: async () => {
        await tx.itemStore.delete({ where: { id } });
      } };
    }
    case "inventory/suppliers": {
      const record = await tx.supplier.findFirst({ where, include: { _count: { select: { transactions: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.transactions, remove: async () => {
        await tx.supplier.delete({ where: { id } });
      } };
    }
    case "inventory/items": {
      const record = await tx.item.findFirst({ where, include: { _count: { select: { stock: true, transactions: true } }, stock: true } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.transactions + record.stock.filter(s => s.quantity > 0).length, remove: async () => {
        await tx.item.delete({ where: { id } });
      } };
    }
  }
}

export async function operationDelete(user: AuthUser, kind: OperationDeleteKind, input: { id: string; campusId: string; preview: boolean; version: string | null }) {
  if (!input.id || input.id.length > 128) throw new ApiError("A valid record id is required", 400);
  const permissionModule = operationDeleteModules[kind];
  if (kind === "students/documents") assertStaffRole(user);
  else if (!(permissionModule === "library" ? canManageLibrary(user) : canManageCampusOps(user))) throw new ApiError("Insufficient permissions", 403);
  if (!input.preview && !/^[a-f0-9]{64}$/.test(input.version ?? "")) throw new ApiError("Review the record before confirming deletion.", 428);
  let cleanupKey: string | undefined;
  const result = await schoolAiTransaction(user, async tx => {
    // Permissions, account state and campus are re-read inside the same
    // serializable transaction as the version and dependency checks.
    await authorizeAssignment(tx, user, permissionModule, "delete");
    const campus = await tx.campus.findFirst({ where: { id: input.campusId, schoolId: user.schoolId } });
    if (!campus || user.role !== "SUPER_ADMIN" && user.campusId !== campus.id) throw new ApiError("Insufficient permissions", 403);
    const receiptId = createHash("sha256").update(JSON.stringify(["confirmed-delete-v1", user.schoolId, campus.id, user.userId, kind, input.id, input.version])).digest("hex");
    if (!input.preview && await tx.auditLog.findFirst({ where: { id: receiptId, schoolId: user.schoolId, campusId: campus.id, userId: user.userId } })) {
      return { success: true, data: { id: input.id }, replayed: true };
    }
    if (kind === "academic/rooms" && !input.preview) await lockTimetableCampus(tx, user.schoolId, campus.id, true);
    const selected = await target(tx, kind, input.id, campus.id, user.schoolId, user);
    const version = deletionVersion(selected.record);
    if (input.preview) return { success: true, preview: { id: input.id, label: selected.label, count: 1, version, blocked: selected.blocked > 0 } };
    if (input.version !== version) throw new ApiError("This record changed. Review it again before deleting.", 409);
    if (selected.blocked) throw new ApiError("Related records or history prevent deletion. Keep this record and review its dependencies.", 409);
    await selected.remove();
    if ("cleanupKey" in selected) cleanupKey = selected.cleanupKey;
    // Same transaction: no deletion without a retry receipt, no receipt for a
    // rolled-back deletion. Metadata only; no names, contact details or drafts.
    await tx.auditLog.create({ data: { id: receiptId, schoolId: user.schoolId, campusId: campus.id, userId: user.userId, tableName: kind === "students/documents" ? "student_documents" : kind === "staff/documents" ? "staff_documents" : kind, recordId: input.id, newValue: { action: "DELETE", version } } });
    return { success: true, data: { id: input.id }, replayed: false };
  });
  // Preserve the private-document storage boundary: only remove the object
  // after metadata/timeline/receipt commit. Failed cleanup cannot restore access.
  if (cleanupKey) await deleteFile(cleanupKey).catch(() => undefined);
  return result;
}

export async function operationDeleteResponse(request: NextRequest, kind: OperationDeleteKind) {
  try {
    const user = await requireAuthUser();
    const params = request.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));
    return Response.json(await operationDelete(user, kind, { id: params.get("id") ?? "", campusId, preview: params.get("preview") === "true", version: request.headers.get("If-Match") }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "[confirmed-delete] failed");
  }
}
