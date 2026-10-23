import type { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { studentSchema, bulkStudentSchema } from "@/lib/validators/schemas";
import { sendInviteEmail } from "@/lib/email";
import { ApiError, assertPermission, canManageCampusOps, errorResponse, resolveCampusId } from "@/lib/api/scope";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import { notify } from "@/lib/notifications/in-app";
import { importReviewToken } from "@/lib/imports/review-token";
import { assertRosterPermission } from "@/lib/imports/roster-access";
type StudentInput = {
  fullName: string;
  nameUr: string | null;
  rollNo: string;
  dateOfBirth: string | null;
  gender: "MALE" | "FEMALE" | "OTHER";
  bloodType: string | null;
  nationality: string | null;
  phone: string | null;
  guardianName: string | null;
  guardianNameUr: string | null;
  guardianPhone: string | null;
  guardianWhatsapp: string | null;
  guardianEmail: string | null;
  guardianRelationship: string | null;
  guardianOccupation: string | null;
  studentEmail: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  medicalNotes: string | null;
  specialNeeds: string | null;
  allergies: string | null;
  medications: string | null;
  previousSchool: string | null;
  classId: string;
  categoryId?: string | null;
  groupId?: string | null;
  siblingGroupId?: string | null;   // link into an existing sibling group
  siblingStudentId?: string | null; // adopt the sibling group of this student
  parentUserId?: string | null;     // reuse an existing guardian (auto-links siblings)
};

type GuardianInvite = {
  email: string;
  campusName: string;
  token: string;
};

type StudentInvite = GuardianInvite;

function asDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanBaseUrl(value?: string | null) {
  return value?.replace(/\/$/, "");
}

function originFromReferer(value?: string | null) {
  if (!value) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function originFromHost(host?: string | null, proto?: string | null) {
  if (!host) return undefined;

  const firstHost = host.split(",")[0]?.trim();
  if (!firstHost) return undefined;

  const hostname = firstHost.startsWith("[::1]") ? "[::1]" : firstHost.split(":")[0] || firstHost;
  const protocol = proto?.split(",")[0]?.trim() || (hostname === "localhost" || hostname.startsWith("127.") ? "http" : "https");

  return `${protocol}://${firstHost}`;
}

function requestBaseUrl(req: NextRequest) {
  const origin = cleanBaseUrl(req.headers.get("origin"));
  const refererOrigin = cleanBaseUrl(originFromReferer(req.headers.get("referer")));
  const forwardedOrigin = cleanBaseUrl(originFromHost(req.headers.get("x-forwarded-host"), req.headers.get("x-forwarded-proto")));
  const hostOrigin = cleanBaseUrl(originFromHost(req.headers.get("host"), req.headers.get("x-forwarded-proto")));

  return origin || refererOrigin || forwardedOrigin || hostOrigin || undefined;
}

function validationErrorResponse(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const fieldErrors = error.flatten().fieldErrors;
  const message = Object.entries(fieldErrors)
    .flatMap(([field, messages]) => (messages || []).map((item) => `${field}: ${item}`))
    .join(", ");

  return Response.json(
    {
      error: message || "Please check the student details",
      details: fieldErrors,
    },
    { status: 400 }
  );
}

export async function createStudentRecords(user: AuthUser, req: NextRequest, options: { inviteAccounts?: boolean } = {}) {
  try {
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    const body = await req.json();
    if (typeof body?._importBatchId === "string") await assertRosterPermission(user, "add");
    else await assertPermission(user, "students", "add");
    let students: StudentInput[];
    let importBatch: Awaited<ReturnType<typeof prisma.importBatch.findFirst>> = null;
    let importRows: Array<{ rowNumber: number; state: string; selected: boolean; proposal?: unknown; errors?: string[]; matchKey?: string | null; matchLabel?: string | null }> = [];
    if (typeof body?._importBatchId === "string") {
      const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
      importBatch = await prisma.importBatch.findFirst({ where: { id: body._importBatchId, schoolId: user.schoolId, campusId } });
      if (!importBatch || importBatch.kind !== "STUDENT_ROSTER") throw new ApiError("Student import batch not found", 404);
      if (importBatch.state === "COMMITTED" || importBatch.state === "PARTIAL" || importBatch.state === "REVERSED") {
        const receipt = importBatch.receipt as Prisma.JsonObject | null;
        return Response.json({ success: true, data: [], message: `Batch ${importBatch.id} was already committed`, importBatchId: importBatch.id, importBatchState: importBatch.state, receipt, idempotent: true });
      }
      if (importBatch.state !== "STAGED" || importBatch.expiresAt <= new Date()) throw new ApiError("This staging batch is no longer available", 409);
      if (body._reviewToken !== importReviewToken(importBatch)) throw new ApiError("The roster changed after your review. Refresh the preview before creating students.", 409);
      const batchData = importBatch.data as Prisma.JsonObject;
      importRows = Array.isArray(batchData.rows) ? batchData.rows as unknown as typeof importRows : [];
      const selected = importRows.filter((row) => row.state === "ACCEPTED" && row.selected);
      if (!selected.length) throw new ApiError("Select at least one validated row before committing", 400);
      const parsed = bulkStudentSchema.safeParse({ students: selected.map((row) => row.proposal) });
      if (!parsed.success) return validationErrorResponse(parsed.error);
      students = parsed.data.students as StudentInput[];
      importRows = importRows.map((row) => ({ ...row, _committing: row.state === "ACCEPTED" && row.selected } as typeof row));
    } else if (body.students) {
      const parsed = bulkStudentSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse(parsed.error);
      }
      students = parsed.data.students;
    } else {
      const parsed = studentSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse(parsed.error);
      }
      students = [parsed.data];
    }
    const classIds = [...new Set(students.map((student) => student.classId))];
    await assertPlanCapacity({ schoolId: user.schoolId, metric: "students", increment: students.length });

    const classes = await prisma.class.findMany({
      where: {
        id: { in: classIds },
        campus: { schoolId: user.schoolId },
        ...(importBatch ? { status: "ACTIVE", archivedAt: null } : {}),
        ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId || "" }),
      },
      select: { id: true, campusId: true, name: true, section: true, campus: { select: { name: true } } },
    });
    const classesById = new Map(classes.map((cls) => [cls.id, cls]));

    for (const student of students) {
      if (!classesById.has(student.classId)) {
        throw new ApiError(`Class not found for ${student.fullName}`, 404);
      }
    }

    // Category/group tags must belong to the student's class campus.
    const tagIds = [...new Set(
      students.flatMap((s) => [s.categoryId, s.groupId]).filter(Boolean) as string[]
    )];
    const [validCategories, validGroups] = await Promise.all([
      tagIds.length
        ? prisma.studentCategory.findMany({
            where: { id: { in: tagIds }, campus: { schoolId: user.schoolId } },
            select: { id: true, campusId: true },
          })
        : [],
      tagIds.length
        ? prisma.studentGroup.findMany({
            where: { id: { in: tagIds }, campus: { schoolId: user.schoolId } },
            select: { id: true, campusId: true },
          })
        : [],
    ]);
    const categoriesById = new Map(validCategories.map((c) => [c.id, c]));
    const groupsById = new Map(validGroups.map((g) => [g.id, g]));

    for (const student of students) {
      const targetClass = classesById.get(student.classId)!;
      if (student.categoryId) {
        const category = categoriesById.get(student.categoryId);
        if (!category || category.campusId !== targetClass.campusId) {
          throw new ApiError(`Category not found for ${student.fullName} in the selected class campus`, 404);
        }
      }
      if (student.groupId) {
        const group = groupsById.get(student.groupId);
        if (!group || group.campusId !== targetClass.campusId) {
          throw new ApiError(`Group not found for ${student.fullName} in the selected class campus`, 404);
        }
      }
    }

    const guardianInvites: GuardianInvite[] = [];
    const studentInvites: StudentInvite[] = [];
    const queuedGuardianEmails = new Set<string>();
    const queuedStudentEmails = new Set<string>();

    const created = await prisma.$transaction(
      async (tx) => {
      await tx.$queryRaw`SELECT id FROM schools WHERE id=${user.schoolId} FOR UPDATE`;
      await assertPlanCapacity({ schoolId: user.schoolId, metric: "students", increment: students.length, client: tx });
      const createdStudents: Awaited<ReturnType<typeof tx.student.create>>[] = [];
      // Serialize admissions per campus, including ordinary admission requests, so
      // a case-variant roll created after staging cannot slip past the import check.
      const creationCampuses = [...new Set(classes.map(item => item.campusId))].sort();
      if (creationCampuses.length) await tx.$queryRaw`SELECT id FROM campuses WHERE school_id=${user.schoolId} AND id IN (${Prisma.join(creationCampuses)}) ORDER BY id FOR UPDATE`;
      for (const targetCampusId of creationCampuses) {
        const rolls = students.filter(student => classesById.get(student.classId)?.campusId === targetCampusId).map(student => student.rollNo.trim().toLocaleLowerCase("en"));
        if (new Set(rolls).size !== rolls.length) throw new ApiError("This request repeats a roll number in the campus. Correct its identity before creating students.", 409);
        const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM students WHERE school_id=${user.schoolId} AND campus_id=${targetCampusId} AND archived_at IS NULL AND lower(btrim(roll_no)) IN (${Prisma.join(rolls)}) LIMIT 1`;
        if (existing.length) throw new ApiError(importBatch ? "A pupil with this roll number was created after preview. Refresh and reconcile the roster before creating students." : "This roll number already belongs to a pupil in the campus.", 409);
      }
      if (importBatch) {
        await assertRosterPermission(user, "add", tx as TxClient);
        await tx.$queryRaw`SELECT id FROM classes WHERE school_id=${user.schoolId} AND id IN (${Prisma.join(classIds)}) ORDER BY id FOR UPDATE`;
        const liveClasses = await tx.class.count({ where: { id: { in: classIds }, schoolId: user.schoolId, campusId: importBatch.campusId, status: "ACTIVE", archivedAt: null } });
        if (liveClasses !== classIds.length) throw new ApiError("A destination class changed or was archived. Refresh and correct this roster before creating students.", 409);
        const claimed = await tx.importBatch.updateMany({ where: { id: importBatch.id, schoolId: user.schoolId, campusId: importBatch.campusId, state: "STAGED", expiresAt: { gt: new Date() }, data: { equals: importBatch.data as Prisma.InputJsonValue } }, data: { state: "COMMITTING" } });
        if (claimed.count !== 1) throw new ApiError("Another request already committed or expired this batch", 409);
      }

      for (const student of students) {
        const targetClass = classesById.get(student.classId)!;
        const guardianEmail = options.inviteAccounts === false ? null : student.guardianEmail?.trim().toLowerCase() || null;
        const studentEmail = options.inviteAccounts === false ? null : student.studentEmail?.trim().toLowerCase() || null;
        let parentUserId: string | null = null;
        let studentUserId: string | null = null;

        // Explicit parent pick wins; otherwise derive from guardian email.
        if (student.parentUserId) {
          const picked = await tx.user.findFirst({
            where: { id: student.parentUserId, schoolId: user.schoolId, role: "PARENT" },
            select: { id: true },
          });
          if (!picked) throw new ApiError("Selected guardian not found in this account", 404);
          parentUserId = picked.id;
        }

        if (studentEmail && studentEmail === guardianEmail) {
          throw new ApiError("Student login email must be different from guardian email", 400);
        }

        if (guardianEmail && !parentUserId) {
          // FINDING-D: tenant-scoped identity — look within this school only.
          const existingParent = await tx.user.findFirst({
            where: { email: guardianEmail, schoolId: user.schoolId },
            select: { id: true, role: true, schoolId: true, campusId: true, isActive: true },
          });

          if (
            existingParent &&
            (existingParent.schoolId !== user.schoolId || existingParent.campusId !== targetClass.campusId || existingParent.role !== "PARENT")
          ) {
            throw new ApiError("Guardian email already belongs to another account context", 409);
          }

          const parent =
            existingParent ||
            (await tx.user.create({
              data: {
                email: guardianEmail,
                fullName: student.guardianName || `${student.fullName} Guardian`,
                role: "PARENT",
                schoolId: user.schoolId,
                campusId: targetClass.campusId,
                isActive: false,
                onboardingComplete: false,
              },
              select: { id: true, isActive: true },
            }));

          parentUserId = parent.id;

          if (!parent.isActive && !queuedGuardianEmails.has(guardianEmail)) {
            const token = randomUUID();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 48);

            const pendingInvite = await tx.staffInvitation.findFirst({
              where: { email: guardianEmail, campusId: targetClass.campusId, role: "PARENT", status: "pending" },
              select: { id: true },
            });

            if (pendingInvite) {
              await tx.staffInvitation.update({
                where: { id: pendingInvite.id },
                data: { token, expiresAt },
              });
            } else {
              await tx.staffInvitation.create({
                data: {
                  email: guardianEmail,
                  role: "PARENT",
                  campusId: targetClass.campusId,
                  token,
                  expiresAt,
                },
              });
            }

            queuedGuardianEmails.add(guardianEmail);
            guardianInvites.push({
              email: guardianEmail,
              campusName: targetClass.campus.name || "Your Campus",
              token,
            });
          }
        }

        if (studentEmail) {
          // FINDING-D: tenant-scoped identity — look within this school only.
          const existingStudentUser = await tx.user.findFirst({
            where: { email: studentEmail, schoolId: user.schoolId },
            select: { id: true, role: true, schoolId: true, campusId: true, isActive: true },
          });

          if (
            existingStudentUser &&
            (existingStudentUser.schoolId !== user.schoolId ||
              existingStudentUser.campusId !== targetClass.campusId ||
              existingStudentUser.role !== "STUDENT")
          ) {
            throw new ApiError("Student login email already belongs to another account context", 409);
          }

          if (existingStudentUser) {
            const linkedStudent = await tx.student.findFirst({
              where: { studentUserId: existingStudentUser.id },
              select: { id: true, fullName: true },
            });
            if (linkedStudent) {
              throw new ApiError(`Student login email is already linked to ${linkedStudent.fullName}`, 409);
            }
          }

          const studentUser =
            existingStudentUser ||
            (await tx.user.create({
              data: {
                email: studentEmail,
                fullName: student.fullName,
                role: "STUDENT",
                schoolId: user.schoolId,
                campusId: targetClass.campusId,
                isActive: false,
                onboardingComplete: false,
              },
              select: { id: true, isActive: true },
            }));

          studentUserId = studentUser.id;

          if (!studentUser.isActive && !queuedStudentEmails.has(studentEmail)) {
            const token = randomUUID();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 48);

            const pendingInvite = await tx.staffInvitation.findFirst({
              where: { email: studentEmail, campusId: targetClass.campusId, role: "STUDENT", status: "pending" },
              select: { id: true },
            });

            if (pendingInvite) {
              await tx.staffInvitation.update({
                where: { id: pendingInvite.id },
                data: { token, expiresAt },
              });
            } else {
              await tx.staffInvitation.create({
                data: {
                  email: studentEmail,
                  role: "STUDENT",
                  campusId: targetClass.campusId,
                  token,
                  expiresAt,
                },
              });
            }

            queuedStudentEmails.add(studentEmail);
            studentInvites.push({
              email: studentEmail,
              campusName: targetClass.campus.name || "Your Campus",
              token,
            });
          }
        }

        const admissionYear = new Date().getFullYear();
        // Campus-scoped registrars cannot count a whole institution, and a
        // count is unsafe under concurrent imports. Allocate a non-sequential
        // institution identifier without reading or matching another pupil.
        const admissionNo = `ADM-${admissionYear}-${randomUUID().replaceAll("-", "").toUpperCase()}`;

        // Sibling-group resolution:
        // 1. explicit siblingGroupId wins;
        // 2. else if parentUserId was picked/reused and that parent already has
        //    children here, join their group (or open one if none exists yet);
        // 3. else adopt the group of siblingStudentId if given.
        let siblingGroupId: string | null = student.siblingGroupId ?? null;
        if (!siblingGroupId && parentUserId) {
          const existingChildren = await tx.student.findMany({
            where: { parentUserId, campusId: targetClass.campusId, consolidatedIntoId: null },
            select: { id: true, siblingGroupId: true },
            orderBy: { enrollmentDate: "asc" },
          });
          const linkedGroup = existingChildren.find((c) => c.siblingGroupId)?.siblingGroupId ?? null;
          if (linkedGroup) {
            siblingGroupId = linkedGroup;
          } else if (existingChildren.length) {
            siblingGroupId = randomUUID();
            await tx.student.updateMany({
              where: { id: { in: existingChildren.map((c) => c.id) } },
              data: { siblingGroupId },
            });
          }
        }
        if (!siblingGroupId && student.siblingStudentId) {
          const siblingRef = await tx.student.findFirst({
            where: {
              id: student.siblingStudentId,
              consolidatedIntoId: null,
              campusId: targetClass.campusId,
              campus: { schoolId: user.schoolId },
            },
            select: { siblingGroupId: true },
          });
          if (siblingRef?.siblingGroupId) {
            siblingGroupId = siblingRef.siblingGroupId;
          } else if (siblingRef) {
            siblingGroupId = randomUUID();
            await tx.student.update({
              where: { id: student.siblingStudentId },
              data: { siblingGroupId },
            });
          }
        }

        const createdStudent = await tx.student.create({
          data: {
            campusId: targetClass.campusId,
            classId: student.classId,
            admissionNo,
            studentUserId,
            parentUserId,
            fullName: student.fullName,
            nameUr: student.nameUr,
            rollNo: student.rollNo,
            gender: student.gender,
            dateOfBirth: asDate(student.dateOfBirth),
            bloodType: student.bloodType,
            nationality: student.nationality,
            phone: student.phone,
            guardianName: student.guardianName,
            guardianNameUr: student.guardianNameUr,
            guardianPhone: student.guardianPhone,
            guardianWhatsapp: student.guardianWhatsapp,
            guardianEmail: student.guardianEmail?.trim().toLowerCase() || null,
            guardianRelationship: student.guardianRelationship,
            guardianOccupation: student.guardianOccupation,
            address: student.address,
            city: student.city,
            province: student.province,
            postalCode: student.postalCode,
            medicalNotes: student.medicalNotes,
            specialNeeds: student.specialNeeds,
            allergies: student.allergies,
            medications: student.medications,
            previousSchool: student.previousSchool,
            categoryId: student.categoryId || null,
            groupId: student.groupId || null,
            siblingGroupId,
          },
        });

        // Creating or selecting an account is not consent to connect every
        // child. Keep the legacy primary-parent column for compatibility, but
        // create one pending child-specific invitation with no rights until
        // staff reviews the grants and the signed-in account accepts it.
        if (parentUserId) {
          const account = await tx.user.findFirst({
            where: { id: parentUserId, schoolId: user.schoolId, role: "PARENT" },
            select: { id: true, email: true, fullName: true, phone: true },
          });
          if (account) {
            const relationId = randomUUID();
            const relationship = ["mother", "father", "step-parent", "grandparent", "legal guardian", "aunt", "uncle", "sibling", "other"].includes(student.guardianRelationship || "")
              ? student.guardianRelationship!
              : "other";
            const invitedAt = new Date();
            await tx.guardianRelationship.create({ data: {
              id: relationId, schoolId: user.schoolId, campusId: targetClass.campusId,
              studentId: createdStudent.id, createdByUserId: user.userId,
              fullName: student.guardianName || account.fullName,
              email: account.email.trim().toLocaleLowerCase("en-US"),
              phone: student.guardianPhone || student.guardianWhatsapp || account.phone,
              relationship, status: "INVITED", validFrom: invitedAt,
              invitationExpiresAt: new Date(invitedAt.getTime() + 14 * 24 * 60 * 60 * 1000),
              accessVersions: { create: { id: randomUUID(), school: { connect: { id: user.schoolId } }, permissions: {
                learningRecords: false, attendance: false, finances: false, communication: false, pickup: false,
                consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false },
              }, effectiveFrom: invitedAt, reason: "Awaiting explicit school review of guardian permissions.", createdByUserId: user.userId } },
              accessEvents: { create: { id: randomUUID(), school: { connect: { id: user.schoolId } }, actor: { connect: { id: user.userId } },
                action: "INVITED", reason: "Admission created a pending child-specific guardian link; no access is granted before review and acceptance.",
                afterState: { status: "INVITED", permissions: "pending staff review" }, effectiveAt: invitedAt } },
            } });
          }
        }

        await tx.studentTimelineEvent.create({
          data: {
            studentId: createdStudent.id,
            kind: "ADMITTED",
            title: "Student admitted",
            detail: `Class ${targetClass.name}${targetClass.section ? ` - ${targetClass.section}` : ""} · Roll ${student.rollNo}`,
            actorId: user.userId,
          },
        });

        createdStudents.push(createdStudent);
      }

      if (importBatch) {
        let committedIndex = 0;
        const receiptRows = importRows.map((row) => {
          const isCommitted = row.state === "ACCEPTED" && row.selected;
          const student = isCommitted ? createdStudents[committedIndex++] : null;
          return {
            rowNumber: row.rowNumber,
            state: isCommitted ? "COMMITTED" : row.state === "ACCEPTED" ? "SKIPPED" : row.state,
            selected: Boolean(isCommitted),
            matchKey: row.matchKey || null,
            matchLabel: row.matchLabel || null,
            errors: row.errors || [],
            result: student ? { studentId: student.id, fullName: student.fullName, rollNo: student.rollNo, classId: student.classId } : undefined,
          };
        });
        const committedCount = createdStudents.length;
        const skippedCount = receiptRows.filter((row) => row.state === "SKIPPED").length;
        const rejectedCount = receiptRows.filter((row) => row.state === "REJECTED").length;
        const unresolvedCount = receiptRows.filter((row) => row.state === "UNRESOLVED").length;
        const partial = skippedCount + rejectedCount + unresolvedCount > 0;
        const receipt = {
          batchId: importBatch.id,
          kind: importBatch.kind,
          committedAt: new Date().toISOString(),
          summary: { total: receiptRows.length, committed: committedCount, created: committedCount, updated: 0, skipped: skippedCount, rejected: rejectedCount, unresolved: unresolvedCount },
          rows: receiptRows,
          reversal: { state: "CHECK_REQUIRED", message: "Check later pupil, grade, enrollment and invoice dependencies before reversing this batch." },
          externalEffects: { invitations: "PENDING", note: "Invitation messages run after the roster transaction; inspect delivery in the staff invitation list." },
        };
        await tx.importBatch.update({ where: { id: importBatch.id }, data: {
          state: partial ? "PARTIAL" : "COMMITTED",
          committedAt: new Date(),
          data: { rows: [], metadata: {}, summary: { total: receiptRows.length, accepted: committedCount, rejected: rejectedCount, skipped: skippedCount, unresolved: unresolvedCount } },
          receipt: receipt as Prisma.InputJsonValue,
        } });
        await tx.auditLog.create({ data: {
          schoolId: user.schoolId,
          tableName: "import_batch",
          recordId: importBatch.id,
          newValue: { action: "COMMITTED", kind: importBatch.kind, summary: receipt.summary } as Prisma.InputJsonValue,
          userId: user.userId,
        } });
      }

      return createdStudents;
    },
      { timeout: 20000 }
    );

    if (created.length > 0) {
      await prisma.auditLog.createMany({
        data: created.map((s) => ({
          tableName: 'student',
          recordId: s.id,
          newValue: { fullName: s.fullName, rollNo: s.rollNo },
          userId: user.userId,
        })),
      });

      for (const s of created) {
        const cls = classesById.get(s.classId);
        notify("STUDENT_ADMITTED", {
          schoolId: user.schoolId,
          campusId: cls?.campusId ?? user.campusId,
          actorId: user.userId,
          actorName: user.fullName,
          studentName: s.fullName,
          classId: s.classId,
        });
      }
    }

    const guardianInviteFailures: string[] = [];
    const studentInviteFailures: string[] = [];
    const baseUrl = requestBaseUrl(req);
    await Promise.all([
      ...guardianInvites.map(async (invite) => {
        try {
          await sendInviteEmail(invite.email, "PARENT", invite.campusName, invite.token, baseUrl);
        } catch {
          guardianInviteFailures.push(invite.email);
        }
      }),
      ...studentInvites.map(async (invite) => {
        try {
          await sendInviteEmail(invite.email, "STUDENT", invite.campusName, invite.token, baseUrl);
        } catch {
          studentInviteFailures.push(invite.email);
        }
      }),
    ]);

    const inviteCount = guardianInvites.length + studentInvites.length;
    const inviteFailures = guardianInviteFailures.length + studentInviteFailures.length;
    const committedBatch = importBatch ? await prisma.importBatch.findFirst({ where: { id: importBatch.id, schoolId: user.schoolId, campusId: importBatch.campusId }, select: { receipt: true, state: true } }) : null;
    if (importBatch && committedBatch?.receipt && typeof committedBatch.receipt === "object" && !Array.isArray(committedBatch.receipt)) {
      const receipt = committedBatch.receipt as Prisma.JsonObject;
      const previousEffects = receipt.externalEffects && typeof receipt.externalEffects === "object" && !Array.isArray(receipt.externalEffects) ? receipt.externalEffects as Prisma.JsonObject : {};
      const delivery = { invitations: "ATTEMPTED", guardianSent: guardianInvites.length - guardianInviteFailures.length, guardianFailures: guardianInviteFailures.length, studentSent: studentInvites.length - studentInviteFailures.length, studentFailures: studentInviteFailures.length };
      const updatedReceipt = { ...receipt, externalEffects: { ...previousEffects, ...delivery } };
      await prisma.$transaction(async (tx) => {
        await tx.importBatch.update({ where: { id: importBatch.id }, data: { receipt: updatedReceipt as Prisma.InputJsonValue, ...(inviteFailures > 0 ? { state: "PARTIAL" } : {}) } });
        await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "import_batch", recordId: importBatch.id, newValue: { action: "INVITATIONS_ATTEMPTED", ...delivery } as Prisma.InputJsonValue, userId: user.userId } });
      });
    }
    const finalBatchReceipt = importBatch ? await prisma.importBatch.findFirst({ where: { id: importBatch.id, schoolId: user.schoolId, campusId: importBatch.campusId }, select: { receipt: true } }) : null;

    return Response.json(
      {
        success: true,
        data: body.students || importBatch ? created : created[0],
        importBatchId: importBatch?.id,
        importBatchState: importBatch ? inviteFailures > 0 || committedBatch?.state === "PARTIAL" ? "PARTIAL" : "COMMITTED" : undefined,
        receipt: finalBatchReceipt?.receipt || committedBatch?.receipt,
        guardianInvitesSent: guardianInvites.length - guardianInviteFailures.length,
        guardianInviteFailures,
        studentInvitesSent: studentInvites.length - studentInviteFailures.length,
        studentInviteFailures,
        message: body.students || importBatch
          ? `${created.length} students created${inviteCount ? `, ${inviteCount - inviteFailures} account invites sent` : ""}`
          : inviteCount
            ? inviteFailures
              ? "Student created, but one or more account invite emails failed"
              : "Student created and account invite sent"
            : "Student created",
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.code === "P2002") {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
      if (fields.some((f: string) => f.includes("student_user_id"))) {
        return Response.json({ error: "Student login email is already linked to another student" }, { status: 409 });
      }
      if (fields.some((f: string) => f.toLowerCase().includes("admission"))) {
        return Response.json({ error: "Admission number already exists — please try again to generate a new one." }, { status: 409 });
      }
      if (fields.some((f: string) => f.toLowerCase().includes("roll"))) {
        return Response.json({ error: "Roll number already exists in this campus" }, { status: 409 });
      }
      return Response.json({ error: "A value conflicts with an existing record. Please try again." }, { status: 409 });
    }
    return errorResponse(error, "[students] POST failed");
  }
}
