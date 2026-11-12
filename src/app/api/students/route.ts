import { assertListBudget } from "@/lib/lists/access";
import { createStudentRecords } from "@/lib/students/create";
import { rosterSummarySelect, studentPickerSelect } from "@/lib/students/roster-summary";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Prisma, type Student } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { applyEnrollment, applyGraduation, classSeats, dateOnly } from "@/lib/students/enrollment";
import {
  ApiError,
  assertPermission,
  assertModuleRead,
  assertStaffRole,
  canManageCampusOps,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
  readJsonObject,
} from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import { expectedValueConditions, studentProfileUpdateSchema } from "@/lib/students/profile-update";
import { parseEmiratesId, parseNationality, parseRegulatorId, regulatorAuditChange } from "@/lib/identity/regulator-ids";
import { rosterSearchWhere, rosterStatusWhere } from "@/lib/students/roster-status";

function asDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The statuses a student record may hold. Single source of truth for the
 * single-record edit path and the bulk path, which previously each carried
 * their own copy of the list.
 */
const STUDENT_STATUSES = ["active", "archived", "transferred", "graduated"];

/**
 * Roster ordering.
 *
 * Only a fixed set of columns is sortable, and anything unrecognised falls back
 * to the default rather than erroring — a bad `sortBy` in a bookmarked URL
 * should show the roster, not a 400. Class + roll is always the tiebreak so the
 * order is total: without it, paging through equal values can show the same
 * student twice and skip another.
 */
function rosterOrderBy(sortBy: string | null, sortDir: string | null): Prisma.StudentOrderByWithRelationInput[] {
  const dir = sortDir === "desc" ? ("desc" as const) : ("asc" as const);
  const tiebreak = [{ rollNo: "asc" as const }, { id: "asc" as const }];

  // The roster panel's own keys (students-panel SORTS) are accepted alongside the column names.
  switch (sortBy) {
    case "name":
      return [{ fullName: dir }, ...tiebreak];
    case "rollNo":
    case "roll":
      return [{ rollNo: dir }, { id: "asc" as const }];
    case "newest":
      // "Recently added": ascending means newest first, as in the panel.
      return [{ enrollmentDate: dir === "asc" ? "desc" : "asc" }, { id: "asc" as const }];
    case "classOrder":
      return [{ class: { name: dir } }, { class: { section: dir } }, ...tiebreak];
    case "status":
      return [{ status: dir }, ...tiebreak];
    case "guardian":
      return [{ guardianName: dir }, ...tiebreak];
    case "class":
      return [{ class: { name: dir } }, ...tiebreak];
    default:
      return [{ class: { name: "asc" as const } }, { rollNo: "asc" as const }, { fullName: "asc" as const }, { id: "asc" as const }];
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertListBudget(user, "students");
    // The roster carries every child's guardian contacts, address, and medical
    // notes. Families read their own record through /api/parent/data and the
    // student dashboard action — never through here.
    // assertModuleRead keeps the staff-only gate AND enforces students.view,
    // which the list handler previously ignored — revoking the bit in the
    // permission matrix left the roster readable (§10.2).
    await assertModuleRead(user, "students");
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    // `section` is the roster panel's name for one class section (a class id); `classId` stays for older callers.
    const classId = searchParams.get("section") || searchParams.get("classId");
    const search = searchParams.get("search")?.trim();
    // Roster filters (P5-08 server paging): `classGroup` = "<academicYear>::<name>" (every section of one class,
    // the panel's classGroupKey); `categoryId`/`groupId` = an id or "none" (untagged); `missingGuardian=1` = no
    // guardian phone and no guardian email; `noLogin=1` = no student portal account.
    const classGroup = searchParams.get("classGroup");
    const [classGroupYear, ...classGroupNameParts] = classGroup ? classGroup.split("::") : [];
    const classGroupName = classGroupNameParts.join("::");
    const classGroupAcademicYear = Number.parseInt(classGroupYear ?? "", 10);
    const categoryId = searchParams.get("categoryId");
    const groupId = searchParams.get("groupId");
    const flag = (key: string) => ["1", "true"].includes(searchParams.get(key) ?? "");
    const missingGuardian = flag("missingGuardian");
    const noLogin = flag("noLogin");
    const parsePageParam = (name: string, fallback: number, max: number) => {
      const raw = searchParams.get(name);
      if (raw === null || raw === "") return fallback;
      if (!/^\d+$/.test(raw)) throw new ApiError(`${name} must be a positive integer`, 400);
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 1) throw new ApiError(`${name} must be a positive integer`, 400);
      return Math.min(value, max);
    };
    // SKAI-1828: `fields=picker` is the fee pickers' type-ahead: same scope and filters, id/name/roll/class only
    // (no documents, no per-student counts), at most 20 rows.
    const picker = searchParams.get("fields") === "picker";
    const page = parsePageParam("page", 1, 100_000);
    const limit = picker ? parsePageParam("limit", 20, 20) : parsePageParam("limit", 50, 200);
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    // "archived" lists inactive/graduated/transferred students; anything else
    // keeps the roster (active students only).
    const archivedOnly = searchParams.get("status") === "archived";

    // Teachers see only the roster of classes they teach or lead. Campus scope
    // alone hands every teacher the whole campus roster, medical notes and
    // guardian contacts included.
    const rosterFilters: Prisma.StudentWhereInput[] = [
      ...(categoryId ? [{ categoryId: categoryId === "none" ? null : categoryId }] : []),
      ...(groupId ? [{ groupId: groupId === "none" ? null : groupId }] : []),
      ...(missingGuardian ? [
        { OR: [{ guardianPhone: null }, { guardianPhone: "" }] },
        { OR: [{ guardianEmail: null }, { guardianEmail: "" }] },
      ] : []),
      ...(noLogin ? [{ OR: [{ studentUserId: null }, { studentUser: { is: { email: "" } } }] }] : []),
    ];
    const where: Prisma.StudentWhereInput = {
      ...scopedCampusWhere(user, campusId),
      ...(rosterFilters.length ? { AND: rosterFilters } : {}),
      class: {
        is: {
          ...(archivedOnly ? {} : { archivedAt: null }),
          ...(classGroupName ? { name: classGroupName, ...(Number.isFinite(classGroupAcademicYear) ? { academicYear: classGroupAcademicYear } : {}) } : {}),
          ...(user.role === "TEACHER" ? { OR: [
            { classTeacherId: user.userId },
            { subjects: { some: { teacherId: user.userId } } },
          ] } : {}),
        },
      },
      ...(classId ? { classId } : {}),
      ...rosterStatusWhere(archivedOnly),
      ...(search
        ? {
            ...rosterSearchWhere(search),
          }
        : {}),
    };

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        // The summary only (SKAI-163): medical, identity and address fields come from /api/students/<id>.
        // SKAI-1875: no list reads documents or per-pupil attendance/invoice/timeline counts, which cost
        // a correlated COUNT over years of attendance per row; the profile loads them on open.
        select: picker ? studentPickerSelect : { ...rosterSummarySelect },
        orderBy: rosterOrderBy(searchParams.get("sortBy"), searchParams.get("sortDir")),
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.student.count({ where }),
    ]);

    return Response.json({
      success: true,
      data: students,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return errorResponse(error, "[students] GET failed");
  }
}

export async function POST(req: NextRequest) {
 try { return await createStudentRecords(await requireAuthUser(), req); }
 catch (error) { return errorResponse(error, "[students] POST failed"); }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "edit");

    const body = await readJsonObject(req);

    if (body?.action === "restore") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) throw new ApiError("Student id is required", 400);
      // SKO-389: a conflicting identifier is resolved by giving the restored pupil a new current roll or
      // admission number; historical documents keep the values they were issued with.
      const nextRoll = typeof body.rollNo === "string" && body.rollNo.trim() ? body.rollNo.trim().slice(0, 32) : null;
      const nextAdmission = typeof body.admissionNo === "string" && body.admissionNo.trim() ? body.admissionNo.trim().slice(0, 64) : null;
      const student = await prisma.student.findFirst({
        where: { id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) },
        select: { id: true, status: true, archivedAt: true, campusId: true, classId: true, rollNo: true, admissionNo: true },
      });
      if (!student) throw new ApiError("Archived student not found", 404);
      if (!student.archivedAt) return Response.json({ success: true, restored: false, alreadyActive: true });
      // SKAI-1387: a withdrawn pupil is re-admitted through enrolment, which reinstates placement and login.
      if ((await withdrawnPupilIds([id])).size) throw new ApiError(WITHDRAWN_RESTORE_MESSAGE, 409);
      const rollNo = nextRoll ?? student.rollNo, admissionNo = nextAdmission ?? student.admissionNo;
      const [campus, cls, rollConflict, admissionConflict] = await Promise.all([
        prisma.campus.findFirst({ where: { id: student.campusId, archivedAt: null, ...(user.schoolId ? { schoolId: user.schoolId } : {}) }, select: { id: true } }),
        prisma.class.findFirst({ where: { id: student.classId, campusId: student.campusId, archivedAt: null }, select: { id: true, capacity: true } }),
        prisma.student.findFirst({ where: { id: { not: id }, campusId: student.campusId, rollNo, archivedAt: null }, select: { id: true, fullName: true } }),
        admissionNo ? prisma.student.findFirst({ where: { id: { not: id }, schoolId: user.schoolId, admissionNo, archivedAt: null }, select: { id: true, fullName: true } }) : Promise.resolve(null),
      ]);
      if (!campus || !cls) throw new ApiError("Restore requires an active campus and class", 409);
      // SKAI-175: a restored pupil takes a seat again, so the class must have one free.
      const seats = await classSeats(prisma, cls);
      if (seats.capacity != null && seats.occupied + 1 > seats.capacity) throw new ApiError(`The pupil's class is full (${seats.occupied} of ${seats.capacity} seats). Raise its capacity or move the pupil before restoring.`, 409);
      if (rollConflict || admissionConflict) {
        return Response.json({ error: "Restore conflict: the roll number or admission number is now in use. Assign a new current identifier before restoring; historical documents keep their original values.", conflict: { rollNo: Boolean(rollConflict), admissionNo: Boolean(admissionConflict) } }, { status: 409 });
      }
      const restored = await prisma.$transaction(async (tx) => {
        // The row lock and re-check make a repeated or concurrent restore change nothing twice.
        await tx.$queryRaw`SELECT id FROM students WHERE id = ${id} FOR UPDATE`;
        const current = await tx.student.findUnique({ where: { id }, select: { archivedAt: true } });
        if (!current?.archivedAt) return false;
        if (rollNo !== student.rollNo) {
          // A new current roll number is a reviewed enrollment change: the open enrollment ends today and
          // a new one starts with the new roll, so earlier attendance, reports and invoices keep theirs.
          const open = await tx.studentEnrollment.findFirst({ where: { studentId: id, endDate: null, status: "ACTIVE" }, select: { id: true } });
          if (!open) throw new ApiError("This pupil's current placement needs reconciliation before a new roll number can be given.", 409);
          await applyEnrollment(tx, { studentId: id, fromId: open.id, targetClassId: student.classId, effectiveDate: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`), rollNo, actorId: user.userId, reason: "Restored from archive with a new current roll number" });
        }
        // Un-archived only after the new roll is in place, so the active-roll uniqueness is never violated.
        await tx.student.update({ where: { id }, data: { archivedAt: null, archiveReason: null, status: "active", admissionNo } });
        await tx.auditLog.create({ data: { tableName: "student", recordId: id, oldValue: { archived: true, rollNo: student.rollNo, admissionNo: student.admissionNo }, newValue: { archived: false, rollNo, admissionNo }, userId: user.userId } });
        return true;
      });
      if (!restored) return Response.json({ success: true, restored: false, alreadyActive: true });
      return Response.json({ success: true, restored: true, rollNo, admissionNo });
    }

    // Bulk status change from the roster's multi-select (§22). Deliberately
    // narrow: status only. A bulk editor that could rewrite names, guardians or
    // medical notes across a selection is a much bigger blast radius than the
    // roster screen warrants, and archive/restore is the action that actually
    // gets done in bulk.
    if (Array.isArray(body.ids)) {
      const ids: string[] = [...new Set<string>(body.ids.map((v: unknown) => String(v)))];
      const status = String(body.status ?? "");
      if (ids.length === 0) throw new ApiError("Select at least one student", 400);
      if (!STUDENT_STATUSES.includes(status)) {
        throw new ApiError(`status must be one of: ${STUDENT_STATUSES.join(", ")}`, 400);
      }
      if (status === "archived") await assertPermission(user, "students", "delete");

      // Scope first, then update only what came back — an id from another
      // campus is silently absent rather than quietly updated.
      const owned = await prisma.student.findMany({
        where: { id: { in: ids }, ...scopedCampusWhere(user, user.campusId) },
        select: { id: true, schoolId: true, campusId: true, classId: true, rollNo: true, admissionNo: true, archivedAt: true, status: true },
      });
      if (owned.length !== ids.length) {
        throw new ApiError("One or more students are not in this campus", 404);
      }

      if (status === "active") {
        const restoring = owned.filter((student) => student.archivedAt || student.status === "archived");
        if ((await withdrawnPupilIds(restoring.map((student) => student.id))).size) throw new ApiError(WITHDRAWN_RESTORE_MESSAGE, 409);
        const rollKeys = new Set<string>();
        const admissionKeys = new Set<string>();
        const incoming = new Map<string, { capacity: number | null; count: number }>();
        for (const student of restoring) {
          const rollKey = `${student.campusId}:${student.rollNo}`;
          if (rollKeys.has(rollKey)) throw new ApiError("Restore conflict: selected students share a roll number. Assign distinct current identifiers and retry.", 409);
          rollKeys.add(rollKey);
          if (student.admissionNo) {
            const admissionKey = `${student.schoolId}:${student.admissionNo}`;
            if (admissionKeys.has(admissionKey)) throw new ApiError("Restore conflict: selected students share an admission number. Assign distinct current identifiers and retry.", 409);
            admissionKeys.add(admissionKey);
          }
          const [cls, rollConflict, admissionConflict] = await Promise.all([
            prisma.class.findFirst({ where: { id: student.classId, campusId: student.campusId, archivedAt: null }, select: { id: true, capacity: true } }),
            prisma.student.findFirst({ where: { id: { notIn: ids }, campusId: student.campusId, rollNo: student.rollNo, archivedAt: null }, select: { id: true } }),
            student.admissionNo ? prisma.student.findFirst({ where: { id: { notIn: ids }, schoolId: student.schoolId, admissionNo: student.admissionNo, archivedAt: null }, select: { id: true } }) : Promise.resolve(null),
          ]);
          if (!cls) throw new ApiError("Restore requires an active class. Resolve the class assignment and retry.", 409);
          incoming.set(cls.id, { capacity: cls.capacity, count: (incoming.get(cls.id)?.count ?? 0) + 1 });
          if (rollConflict || admissionConflict) throw new ApiError("Restore conflict: a roll number or admission number is in use. Assign new current identifiers and retry; historical documents keep their original values.", 409);
        }
        // SKAI-175: every restored pupil takes a seat; the whole selection must fit each class.
        for (const [classId, want] of incoming) {
          const seats = await classSeats(prisma, { id: classId, capacity: want.capacity });
          if (seats.capacity != null && seats.occupied + want.count > seats.capacity) throw new ApiError(`A class has ${seats.free} free seat(s) for ${want.count} restored pupil(s). Raise its capacity or restore fewer; nobody was restored.`, 409);
        }
      }

      // SKAI-1470: graduation is a lifecycle boundary, not a status flag. Every selected pupil goes through the
      // reviewed graduation step in one transaction; an already-graduated pupil is reported unchanged.
      if (status === "graduated") {
        const effectiveDate = body.effectiveDate === undefined ? dateOnly(new Date().toISOString().slice(0, 10)) : dateOnly(body.effectiveDate);
        const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : "Graduated";
        const outcomes = await prisma.$transaction(async (tx) => {
          const rows: { id: string; outcome: "changed" | "unchanged" }[] = [];
          for (const student of owned) rows.push({ id: student.id, outcome: await applyGraduation(tx, { studentId: student.id, effectiveDate, actorId: user.userId, reason }) });
          return rows;
        });
        const updated = outcomes.filter((o) => o.outcome === "changed").length;
        return Response.json({ success: true, updated, unchanged: outcomes.length - updated, outcomes, status });
      }

      const archiveReason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : "Administrative archive";
      const now = new Date();
      const updateData = status === "archived"
        ? { status, archivedAt: now, archiveReason }
        : status === "active"
          ? { status, archivedAt: null, archiveReason: null }
          : { status };
      // SKAI-1334: only pupils whose state actually flips inside this transaction are changed and audited,
      // so a retried or double-clicked request is a no-op rather than a second archive with false history.
      const flipWhere = status === "archived" ? { archivedAt: null } : status === "active" ? { archivedAt: { not: null } } : {};
      const result = await prisma.$transaction(async (tx) => {
        const candidates = await tx.student.findMany({ where: { id: { in: owned.map((s) => s.id) }, ...flipWhere }, select: { id: true } });
        const changingIds = candidates.map((s) => s.id);
        const changed = changingIds.length ? await tx.student.updateMany({ where: { id: { in: changingIds }, ...flipWhere }, data: updateData }) : { count: 0 };
        if (changingIds.length && (status === "archived" || status === "active")) {
          await tx.auditLog.createMany({ data: changingIds.map((id) => ({
            tableName: "student", recordId: id,
            oldValue: { archived: status === "active" },
            newValue: status === "archived" ? { archived: true, reason: archiveReason } : { archived: false },
            userId: user.userId,
          })) });
          // SKAI-1528: an administrative archive is a lifecycle milestone; written with the state change, once per flip.
          if (status === "archived") await tx.studentTimelineEvent.createMany({ data: changingIds.map((studentId) => ({ schoolId: user.schoolId, studentId, kind: "ARCHIVED", title: "Archived", detail: JSON.stringify({ reason: archiveReason }), actorId: user.userId })) });
        }
        return { count: changed.count, changingIds };
      });
      // SKO-389: each selected pupil's outcome, so a partly no-op bulk action is explained rather than counted.
      const changedIds = new Set(result.changingIds);
      const outcomes = owned.map((student) => ({ id: student.id, outcome: changedIds.has(student.id) ? "changed" as const : "unchanged" as const }));
      return Response.json({ success: true, updated: result.count, unchanged: outcomes.filter((o) => o.outcome === "unchanged").length, outcomes, status });
    }

    const { id, ...updates } = studentProfileUpdateSchema.parse(body);
    // SKAI-1576: an unknown status is a 400 before anything is saved, matching the bulk path.
    if (updates.status && !STUDENT_STATUSES.includes(updates.status)) {
      throw new ApiError(`status must be one of: ${STUDENT_STATUSES.join(", ")}`, 400);
    }

    const existing = await prisma.student.findFirst({
      where: {
        id,
        ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? updates.campusId : user.campusId),
      },
      select: { id: true, campusId: true, classId: true, status: true, archivedAt: true, emiratesId: true, nationality: true, regulatorId: true, categoryId: true },
    });
    if (!existing) throw new ApiError("Student not found", 404);

    if ((updates.classId && updates.classId !== existing.classId) || updates.rollNo !== undefined) {
      const current = await prisma.student.findFirst({ where: { id }, select: { rollNo: true } });
      if (updates.classId !== undefined && updates.classId !== existing.classId || updates.rollNo !== undefined && updates.rollNo !== current?.rollNo) {
        throw new ApiError("Placement and roll changes require review in the pupil enrollment history", 409);
      }
    }
    const data: Partial<Student> = {};
    if (updates.fullName !== undefined) data.fullName = updates.fullName;
    if (updates.rollNo !== undefined) data.rollNo = updates.rollNo;
    for (const key of [
      "nameUr",
      "phone",
      "guardianName",
      "guardianNameUr",
      "guardianPhone",
      "guardianWhatsapp",
      "guardianEmail",
      "guardianRelationship",
      "guardianOccupation",
      "profileImageUrl",
      "address",
      "city",
      "province",
      "postalCode",
      "medicalNotes",
      "specialNeeds",
      "allergies",
      "medications",
      "previousSchool",
    ] as const) {
      if (updates[key] !== undefined) data[key] = updates[key] || null;
    }
    // SKAI-1149: regulator fields are validated and normalised; a malformed value is refused, never dropped.
    for (const [key, parse] of [["emiratesId", parseEmiratesId], ["nationality", parseNationality], ["regulatorId", parseRegulatorId]] as const) {
      if (updates[key] === undefined) continue;
      try { data[key] = parse(updates[key]); } catch (error) { throw new ApiError((error as Error).message, 400); }
    }
    // SKAI-1342: one active pupil per regulator ID and Emirates ID within the school. Archived pupils do not hold it.
    const identifierClash = [["regulatorId", data.regulatorId], ["emiratesId", data.emiratesId]] as const;
    for (const [key, value] of identifierClash) {
      if (typeof value !== "string" || !value) continue;
      const clash = await prisma.student.findFirst({ where: { schoolId: user.schoolId, id: { not: id }, archivedAt: null, [key]: value }, select: { id: true } });
      if (clash) throw new ApiError(key === "regulatorId" ? "This eSIS / MOE ID already belongs to another pupil in this school." : "This Emirates ID already belongs to another pupil in this school.", 409);
    }
    const regulatorChange = regulatorAuditChange(existing, data);
    // Gender is required on a pupil record, so a blank value keeps the stored one.
    if (updates.gender) data.gender = updates.gender;
    // SKAI-164: "Not known" clears the blood type. It used to be ignored, so the profile's
    // save check saw the old value come back and reported an unconfirmed save.
    if (updates.bloodType !== undefined) data.bloodType = updates.bloodType || null;
    if (updates.status && STUDENT_STATUSES.includes(updates.status)) {
      // SKAI-1601: archiving here is the same lifecycle step as the bulk path: archivedAt and a reason are set,
      // so the pupil leaves attendance and marks. Un-archiving must go through restore, which re-checks identifiers.
      if (updates.status === "archived" && !existing.archivedAt) {
        await assertPermission(user, "students", "delete");
        data.archivedAt = new Date();
        data.archiveReason = "Administrative archive";
      } else if (existing.archivedAt && updates.status !== "archived") {
        throw new ApiError("Restore this pupil first; restoring re-checks their roll and admission numbers.", 409);
      }
      data.status = updates.status;
    }
    if (updates.dateOfBirth !== undefined) data.dateOfBirth = asDate(updates.dateOfBirth);
    let previousClassName = "";
    if (updates.classId && updates.classId !== existing.classId) {
      const targetClass = await prisma.class.findFirst({
        where: { id: updates.classId, campusId: existing.campusId, campus: { schoolId: user.schoolId } },
        select: { id: true, name: true, section: true },
      });
      if (!targetClass) throw new ApiError("Class not found", 404);
      data.classId = updates.classId;

      if (existing.classId) {
        const prevClass = await prisma.class.findFirst({
          where: { id: existing.classId },
          select: { name: true, section: true },
        });
        if (prevClass) {
          previousClassName = [prevClass.name, prevClass.section].filter(Boolean).join(" ");
        }
      }

      const abbrev = targetClass.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
      const secChar = (targetClass.section || "A").charAt(0).toUpperCase();
      const prefix = `${abbrev}-${secChar}-`;

      const campusClasses = await prisma.class.findMany({
        where: { campusId: existing.campusId },
        select: { id: true },
      });
      const campusClassIds = campusClasses.map((c) => c.id);

      const existingRolls = await prisma.student.findMany({
        where: { classId: { in: campusClassIds }, rollNo: { startsWith: prefix } },
        select: { rollNo: true },
      });
      let maxNum = 0;
      for (const s of existingRolls) {
        const num = parseInt(s.rollNo.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
      data.rollNo = `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
    } else if (updates.classId) {
      data.classId = updates.classId;
    }

    // Category/group tags: cleared when empty, otherwise must live in the
    // student's campus.
    if (updates.categoryId !== undefined) {
      const categoryId = updates.categoryId || null;
      if (categoryId) {
        const category = await prisma.studentCategory.findFirst({
          where: { id: categoryId, campusId: existing.campusId, campus: { schoolId: user.schoolId } },
          select: { id: true, isActive: true },
        });
        if (!category) throw new ApiError("Category not found in this campus", 404);
        // SKAI-168: keeping an inactive category is fine; moving a student onto one is not.
        if (!category.isActive && categoryId !== existing.categoryId) throw new ApiError("This category is inactive. Choose an active category.", 409);
      }
      data.categoryId = categoryId;
    }
    if (updates.groupId !== undefined) {
      const groupId = updates.groupId || null;
      if (groupId) {
        const group = await prisma.studentGroup.findFirst({
          where: { id: groupId, campusId: existing.campusId, campus: { schoolId: user.schoolId } },
          select: { id: true },
        });
        if (!group) throw new ApiError("Group not found in this campus", 404);
      }
      data.groupId = groupId;
    }

    // Sibling link: adopt an existing student's group when siblingStudentId is
    // given, otherwise set/clear siblingGroupId directly.
    if (updates.siblingStudentId) {
      const ref = await prisma.student.findFirst({
        where: { id: updates.siblingStudentId, campusId: existing.campusId, consolidatedIntoId: null },
        select: { id: true, siblingGroupId: true },
      });
      if (!ref) throw new ApiError("Sibling student not found", 404);
      // Open the reference's group only while it is still unset, so two concurrent links cannot
      // each write their own group. A loser re-reads the group the winner committed.
      let groupId = ref.siblingGroupId;
      if (!groupId) {
        const opened = randomUUID();
        const claimed = await prisma.student.updateMany({
          where: { id: ref.id, siblingGroupId: null },
          data: { siblingGroupId: opened },
        });
        if (claimed.count) {
          groupId = opened;
        } else {
          const winner = await prisma.student.findFirst({ where: { id: ref.id }, select: { siblingGroupId: true } });
          groupId = winner?.siblingGroupId ?? null;
        }
      }
      data.siblingGroupId = groupId;
    } else if (updates.siblingGroupId !== undefined) {
      data.siblingGroupId = updates.siblingGroupId || null;
    }

    // Conditional update protects each value this form originally read. The
    // predicate is evaluated atomically with the write, including concurrent edits.
    const expected = updates.expectedValues;
    const conditions = expectedValueConditions(data, expected, asDate);
    const student = await prisma.student.update({
      where: { id, ...(conditions.length ? { AND: conditions } : {}) },
      data,
      include: {
        class: { select: { id: true, name: true, section: true } },
        category: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'student',
        recordId: id,
        oldValue: { classId: existing.classId, previousClassName: previousClassName || undefined, ...(regulatorChange.fields.length ? { regulator: regulatorChange.from } : {}) },
        newValue: { classId: data.classId || existing.classId, rollNo: data.rollNo, ...(regulatorChange.fields.length ? { regulator: regulatorChange.to } : {}) },
        userId: user.userId,
      }
    });

    if (data.classId && data.classId !== existing.classId) {
      await prisma.studentTimelineEvent.create({
        data: {
          studentId: id,
          kind: "PROMOTED",
          title: "Class transferred",
          detail: previousClassName
            ? `${previousClassName} → ${[student.class?.name, student.class?.section].filter(Boolean).join(" ")}`
            : `Moved to ${[student.class?.name, student.class?.section].filter(Boolean).join(" ")}`,
          actorId: user.userId,
        },
      });

      notify("STUDENT_TRANSFERRED", {
        schoolId: user.schoolId,
        campusId: existing.campusId,
        actorId: user.userId,
        actorName: user.fullName,
        studentName: student.fullName,
        newClassName: [student.class?.name, student.class?.section].filter(Boolean).join(" "),
        oldClassId: existing.classId,
        newClassId: data.classId,
      });
    }

    if (data.status && data.status !== existing.status && data.status !== "active") {
      await prisma.studentTimelineEvent.create({
        data: {
          studentId: id,
          kind: "NOTE",
          title: data.status === "graduated" ? "Graduated" : "Archived / deactivated",
          detail: `Status changed to ${data.status}`,
          actorId: user.userId,
        },
      });
    }

    return Response.json({ success: true, data: student });
  } catch (error: any) {
    if (error?.code === "P2025") return Response.json({ error: "This pupil record changed. Review your draft against the current record." }, { status: 409 });
    if (error?.code === "P2002") {
      return Response.json({ error: "Roll number already exists in this campus" }, { status: 409 });
    }
    return errorResponse(error, "[students] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "delete");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("Student id is required", 400);

    const existing = await prisma.student.findFirst({
      where: { id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) },
      select: { id: true, campusId: true, fullName: true, classId: true, archivedAt: true, _count: { select: { marks: true, attendance: true, reportCards: true, invoices: true, payments: true, documents: true } }, class: { select: { name: true, section: true } } },
    });
    if (!existing) throw new ApiError("Student not found", 404);
    const impact = { marks: existing._count.marks, attendance: existing._count.attendance, reports: existing._count.reportCards, invoices: existing._count.invoices, payments: existing._count.payments, documents: existing._count.documents };
    if (new URL(req.url).searchParams.get("preview") === "true") {
      return Response.json({ success: true, action: "archive", record: existing.fullName, dependencies: impact, permanentDeletion: "blocked" });
    }
    if (existing.archivedAt) return Response.json({ success: true, archived: true, alreadyArchived: true, dependencies: impact });
    const { reason } = await req.json().catch(() => ({}));
    const archiveReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : "Administrative archive";
    // SKAI-1528: archive, audit and the ARCHIVED timeline milestone commit together, and only for the request that flips the pupil.
    const flipped = await prisma.$transaction(async (tx) => {
      const claimed = await tx.student.updateMany({ where: { id, archivedAt: null }, data: { status: "archived", archivedAt: new Date(), archiveReason } });
      if (claimed.count !== 1) return false;
      await tx.auditLog.create({ data: { tableName: "student", recordId: id, oldValue: { archived: false }, newValue: { archived: true, reason: archiveReason, dependencies: impact }, userId: user.userId } });
      await tx.studentTimelineEvent.create({ data: { schoolId: user.schoolId, studentId: id, kind: "ARCHIVED", title: "Archived", detail: JSON.stringify({ reason: archiveReason }), actorId: user.userId } });
      return true;
    });
    if (!flipped) return Response.json({ success: true, archived: true, alreadyArchived: true, dependencies: impact });
    notify("STUDENT_DELETED", {
      schoolId: user.schoolId,
      campusId: existing.campusId,
      actorId: user.userId,
      actorName: user.fullName,
      studentName: existing.fullName,
      className: [existing.class?.name, existing.class?.section].filter(Boolean).join(" "),
      classId: existing.classId,
    });
    return Response.json({ success: true, archived: true, dependencies: impact, message: "Student archived. Academic, financial and document history is preserved." });
  } catch (error) {
    return errorResponse(error, "[students] DELETE failed");
  }
}

const WITHDRAWN_RESTORE_MESSAGE = "This pupil was withdrawn. Re-admit them through enrolment so their placement and login are reinstated.";

/** SKAI-1387: pupils whose enrolment ended and has no open ACTIVE enrolment again. Generic restore must not reopen them. */
async function withdrawnPupilIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const [ended, open] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { studentId: { in: ids }, endDate: { not: null } }, select: { studentId: true } }),
    prisma.studentEnrollment.findMany({ where: { studentId: { in: ids }, endDate: null, status: "ACTIVE" }, select: { studentId: true } }),
  ]);
  const reopened = new Set(open.map((row) => row.studentId));
  return new Set(ended.map((row) => row.studentId).filter((studentId) => !reopened.has(studentId)));
}
