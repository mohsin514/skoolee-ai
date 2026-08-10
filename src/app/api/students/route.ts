import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { studentSchema, bulkStudentSchema } from "@/lib/validators/schemas";
import { sendInviteEmail } from "@/lib/email";
import {
  ApiError,
  assertPermission,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import { notify } from "@/lib/notifications/in-app";

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

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const classId = searchParams.get("classId");
    const search = searchParams.get("search")?.trim();
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    // "archived" lists inactive/graduated/transferred students; anything else
    // keeps the roster (active students only).
    const archivedOnly = searchParams.get("status") === "archived";

    const where = {
      ...scopedCampusWhere(user, campusId),
      ...(classId ? { classId } : {}),
      ...(archivedOnly
        ? { status: { in: ["inactive", "archived", "transferred", "graduated"] } }
        : { status: { notIn: ["inactive", "archived", "transferred", "graduated"] } }),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" as const } },
              { rollNo: { contains: search, mode: "insensitive" as const } },
              { guardianName: { contains: search, mode: "insensitive" as const } },
              { guardianPhone: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: {
          class: { select: { id: true, name: true, section: true, academicYear: true } },
          studentUser: { select: { id: true, email: true, isActive: true } },
          campus: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          group: { select: { id: true, name: true } },
          documents: { select: { id: true, kind: true, fileName: true } },
          _count: { select: { attendance: true, invoices: true, timelineEvents: true } },
        },
        orderBy: [{ class: { name: "asc" } }, { rollNo: "asc" }, { fullName: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.student.count({ where }),
    ]);

    return Response.json({ success: true, data: students, pagination: { page, limit, total } });
  } catch (error) {
    return errorResponse(error, "[students] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "add");

    const body = await req.json();
    let students: StudentInput[];
    if (body.students) {
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
      const createdStudents = [];

      for (const student of students) {
        const targetClass = classesById.get(student.classId)!;
        const guardianEmail = student.guardianEmail?.trim().toLowerCase() || null;
        const studentEmail = student.studentEmail?.trim().toLowerCase() || null;
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
          const existingParent = await tx.user.findUnique({
            where: { email: guardianEmail },
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
          const existingStudentUser = await tx.user.findUnique({
            where: { email: studentEmail },
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
        const admissionCount = await tx.student.count({ where: { campusId: targetClass.campusId } });
        const admissionNo = `ADM-${admissionYear}-${String(admissionCount + 1).padStart(4, "0")}`;

        // Sibling-group resolution:
        // 1. explicit siblingGroupId wins;
        // 2. else if parentUserId was picked/reused and that parent already has
        //    children here, join their group (or open one if none exists yet);
        // 3. else adopt the group of siblingStudentId if given.
        let siblingGroupId: string | null = student.siblingGroupId ?? null;
        if (!siblingGroupId && parentUserId) {
          const existingChildren = await tx.student.findMany({
            where: { parentUserId, campusId: targetClass.campusId },
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
            guardianEmail,
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

      return createdStudents;
    },
      { timeout: 20000 }
    );

    for (const s of created) {
      await prisma.auditLog.create({
        data: {
          tableName: 'student',
          recordId: s.id,
          newValue: { fullName: s.fullName, rollNo: s.rollNo },
          userId: user.userId,
        }
      });

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

    return Response.json(
      {
        success: true,
        data: body.students ? created : created[0],
        guardianInvitesSent: guardianInvites.length - guardianInviteFailures.length,
        guardianInviteFailures,
        studentInvitesSent: studentInvites.length - studentInviteFailures.length,
        studentInviteFailures,
        message: body.students
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
      if (Array.isArray(error.meta?.target) && error.meta.target.includes("student_user_id")) {
        return Response.json({ error: "Student login email is already linked to another student" }, { status: 409 });
      }
      return Response.json({ error: "Roll number already exists in this campus" }, { status: 409 });
    }
    return errorResponse(error, "[students] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "edit");

    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) throw new ApiError("Student id is required", 400);

    const existing = await prisma.student.findFirst({
      where: {
        id,
        ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? updates.campusId : user.campusId),
      },
      select: { id: true, campusId: true, classId: true },
    });
    if (!existing) throw new ApiError("Student not found", 404);

    const data: any = {};
    for (const key of [
      "fullName",
      "nameUr",
      "rollNo",
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
      "nationality",
    ]) {
      if (updates[key] !== undefined) data[key] = updates[key] || null;
    }
    if (["MALE", "FEMALE", "OTHER"].includes(updates.gender)) data.gender = updates.gender;
    if (["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].includes(updates.bloodType)) data.bloodType = updates.bloodType;
    if (["active", "archived", "transferred", "graduated"].includes(updates.status)) data.status = updates.status;
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
          select: { id: true },
        });
        if (!category) throw new ApiError("Category not found in this campus", 404);
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
        where: { id: updates.siblingStudentId, campusId: existing.campusId },
        select: { id: true, siblingGroupId: true },
      });
      if (!ref) throw new ApiError("Sibling student not found", 404);
      if (!ref.siblingGroupId) {
        const opened = await prisma.student.update({
          where: { id: ref.id },
          data: { siblingGroupId: randomUUID() },
          select: { siblingGroupId: true },
        });
        data.siblingGroupId = opened.siblingGroupId;
      } else {
        data.siblingGroupId = ref.siblingGroupId;
      }
    } else if (updates.siblingGroupId !== undefined) {
      data.siblingGroupId = updates.siblingGroupId || null;
    }

    const student = await prisma.student.update({
      where: { id },
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
        oldValue: { classId: existing.classId, previousClassName: previousClassName || undefined },
        newValue: { classId: data.classId || existing.classId, rollNo: data.rollNo },
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

    if (data.status && data.status !== (existing as any).status && data.status !== "active") {
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
    if (error?.code === "P2002") {
      return Response.json({ error: "Roll number already exists in this campus" }, { status: 409 });
    }
    return errorResponse(error, "[students] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "delete");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("Student id is required", 400);

    const existing = await prisma.student.findFirst({
      where: { id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) },
      select: { id: true, campusId: true, fullName: true, classId: true, class: { select: { name: true, section: true } } },
    });
    if (!existing) throw new ApiError("Student not found", 404);

    await prisma.student.delete({ where: { id } });
    notify("STUDENT_DELETED", {
      schoolId: user.schoolId,
      campusId: existing.campusId,
      actorId: user.userId,
      actorName: user.fullName,
      studentName: existing.fullName,
      className: [existing.class?.name, existing.class?.section].filter(Boolean).join(" "),
      classId: existing.classId,
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[students] DELETE failed");
  }
}
