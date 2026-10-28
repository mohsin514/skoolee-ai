import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, assertStaffRole, canManageCampusOps, canManageFinance, canManageLibrary, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { authorizeAssignment } from "@/lib/api/teacher-assignments";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { studentScope, campusScope } from "@/lib/auth/policy";
import { matchesDocumentKey } from "@/lib/storage/document-key-scope";
import { deleteFile } from "@/lib/storage/s3";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { deletionVersion } from "./version";

export const operationDeleteModules = {
  "fees/types": "fees",
  "fees/groups": "fees",
  "fees/master-lines": "fees",
  "fees/assignments": "fees",
  "fees/discounts": "fees",
  "fees/discount-assignments": "fees",
  "fees/carry-forwards": "fees",
  "fees/fine-rules": "fees",

  "accounts/chart": "accounts",
  "accounts/bank-accounts": "accounts",
  "accounts/payment-methods": "accounts",
  "student-categories": "students",
  "student-groups": "students",
  "leave/types": "leave",
  "leave/allocations": "leave",
  "academic/calendar": "timetable",
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

// Preserve audit-history table filters for the routes using canonical names.
export const operationDeleteAuditTables: Partial<Record<OperationDeleteKind, string>> = {"fees/types": "fee_types", "fees/groups": "fee_groups", "fees/master-lines": "fees_master_lines", "fees/assignments": "fee_group_assignments", "fees/discounts": "fee_discounts", "fees/discount-assignments": "fee_discount_assignments", "fees/carry-forwards": "fee_carry_forwards", "fees/fine-rules": "fee_fine_rules", "accounts/chart": "chart_of_accounts", "accounts/bank-accounts": "bank_accounts", "accounts/payment-methods": "payment_method_refs", "students/documents": "student_documents", "staff/documents": "staff_documents"};

// Read the entire record, including the dependent counts reviewed by the user.
// Models without updatedAt still have a deterministic optimistic version.
async function target(tx: TxClient, kind: OperationDeleteKind, id: string, campusId: string, schoolId: string, user: AuthUser) {
  const where = { id, campusId, schoolId };
  switch (kind) {
    case "fees/types": {
      const record = await tx.feeType.findFirst({ where, include: { _count: { select: { masters: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.masters, remove: async () => { await tx.feeType.delete({ where: { id } }); } };
    }
    case "fees/groups": {
      const record = await tx.feeGroup.findFirst({ where, include: { _count: { select: { lines: true, assignments: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.lines + record._count.assignments, remove: async () => { await tx.feeGroup.delete({ where: { id } }); } };
    }
    case "fees/discounts": {
      const record = await tx.feeDiscount.findFirst({ where, include: { _count: { select: { assignments: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.assignments, remove: async () => { await tx.feeDiscount.delete({ where: { id } }); } };
    }
    case "fees/fine-rules": {
      const record = await tx.feeFineRule.findFirst({ where });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: 0, remove: async () => { await tx.feeFineRule.delete({ where: { id } }); } };
    }
    case "fees/master-lines": {
      const record = await tx.feesMasterLine.findFirst({ where, include: { feeType: true, feeGroup: true } });
      if (!record || record.feeType.campusId !== campusId || record.feeGroup.campusId !== campusId || record.feeType.schoolId !== schoolId || record.feeGroup.schoolId !== schoolId) throw new ApiError("Record not found", 404);
      return { record, label: `${record.feeGroup.name} / ${record.feeType.name}`, blocked: 0, remove: async () => { await tx.feesMasterLine.delete({ where: { id } }); } };
    }
    case "fees/assignments": {
      const record = await tx.feeGroupAssignment.findFirst({ where, include: { class: true, feeGroup: true } });
      if (!record || record.class.campusId !== campusId || record.feeGroup.campusId !== campusId || record.class.schoolId !== schoolId || record.feeGroup.schoolId !== schoolId) throw new ApiError("Record not found", 404);
      return { record, label: `${record.feeGroup.name} / ${record.class.name}`, blocked: 0, remove: async () => { await tx.feeGroupAssignment.delete({ where: { id } }); } };
    }
    case "fees/discount-assignments": {
      const record = await tx.feeDiscountAssignment.findFirst({ where: { id, schoolId, student: { schoolId, campusId }, discount: { schoolId, campusId } }, include: { student: { select: { fullName: true } }, discount: true } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: `${record.discount.name} / ${record.student.fullName}`, blocked: 0, remove: async () => { await tx.feeDiscountAssignment.delete({ where: { id } }); } };
    }
    case "fees/carry-forwards": {
      const row = await tx.feeCarryForward.findFirst({ where: { ...where, student: { schoolId, campusId } }, include: { student: { select: { fullName: true } } } });
      if (!row) throw new ApiError("Record not found", 404);
      const applied = await tx.invoice.count({ where: { schoolId, campusId, studentId: row.studentId, carryForwardAmount: { not: 0 } } });
      const record = { ...row, applied };
      return { record, label: row.student.fullName, blocked: applied + Number(row.balance < 0), remove: async () => { await tx.feeCarryForward.delete({ where: { id } }); } };
    }
    case "accounts/payment-methods": {
      const record = await tx.paymentMethodRef.findFirst({ where, include: { _count: { select: { payrollLines: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.payrollLines, remove: async () => { await tx.paymentMethodRef.delete({ where: { id } }); } };
    }

    case "accounts/bank-accounts": {
      const record = await tx.bankAccount.findFirst({ where, include: { _count: { select: { entries: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.entries, remove: async () => { await tx.bankAccount.delete({ where: { id } }); } };
    }

    case "accounts/chart": {
      const record = await tx.chartOfAccount.findFirst({ where, include: { _count: { select: { entries: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.entries, remove: async () => { await tx.chartOfAccount.delete({ where: { id } }); } };
    }

    case "student-categories": {
      const record = await tx.studentCategory.findFirst({ where, include: { _count: { select: { students: true, feeDiscounts: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.students + record._count.feeDiscounts, remove: async () => { await tx.studentCategory.delete({ where: { id } }); } };
    }
    case "student-groups": {
      const record = await tx.studentGroup.findFirst({ where, include: { _count: { select: { students: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.students, remove: async () => { await tx.studentGroup.delete({ where: { id } }); } };
    }
    case "leave/types": {
      const record = await tx.leaveType.findFirst({ where, include: { _count: { select: { requests: true, allocations: true } } } });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: record._count.requests + record._count.allocations, remove: async () => { await tx.leaveType.delete({ where: { id } }); } };
    }
    case "leave/allocations": {
      const record = await tx.leaveAllocation.findFirst({ where, include: { leaveType: { select: { name: true, campusId: true, schoolId: true } } } });
      if (!record || record.leaveType.campusId !== campusId || record.leaveType.schoolId !== schoolId) throw new ApiError("Record not found", 404);
      return { record, label: record.leaveType.name, blocked: 0, remove: async () => { await tx.leaveAllocation.delete({ where: { id } }); } };
    }
    case "academic/calendar": {
      const record = await tx.holiday.findFirst({ where });
      if (!record) throw new ApiError("Record not found", 404);
      return { record, label: record.name, blocked: 0, remove: async () => { await tx.holiday.delete({ where: { id } }); } };
    }
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
  else if (!(permissionModule === "library" ? canManageLibrary(user) : permissionModule === "accounts" || permissionModule === "fees" ? canManageFinance(user) : canManageCampusOps(user))) throw new ApiError("Insufficient permissions", 403);
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
    if ((kind === "academic/rooms" || kind === "academic/calendar") && !input.preview) await lockTimetableCampus(tx, user.schoolId, campus.id, true);
    const selected = await target(tx, kind, input.id, campus.id, user.schoolId, user);
    const version = deletionVersion(selected.record);
    if (input.preview) return { success: true, preview: { id: input.id, label: selected.label, count: 1, version, blocked: selected.blocked > 0 } };
    if (input.version !== version) throw new ApiError("This record changed. Review it again before deleting.", 409);
    if (selected.blocked) throw new ApiError("Related records or history prevent deletion. Keep this record and review its dependencies.", 409);
    await selected.remove();
    if ("cleanupKey" in selected) cleanupKey = selected.cleanupKey;
    // Same transaction: no deletion without a retry receipt, no receipt for a
    // rolled-back deletion. Metadata only; no names, contact details or drafts.
    await tx.auditLog.create({ data: { id: receiptId, schoolId: user.schoolId, campusId: campus.id, userId: user.userId, tableName: operationDeleteAuditTables[kind] ?? kind, recordId: input.id, oldValue: { action: "DELETE", version, ...Object.fromEntries(Object.entries(selected.record).filter(([key, value]) => ["currency", "amount", "balance", "openingBalance", "isActive", "type", "value", "fromAcademicYear", "toAcademicYear", "academicYear", "feeGroupId", "feeTypeId", "studentId", "classId", "discountId"].includes(key) && (value === null || ["string", "number", "boolean"].includes(typeof value)))) } } });
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
