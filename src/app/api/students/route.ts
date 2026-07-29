import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { studentSchema, bulkStudentSchema } from "@/lib/validators/schemas";
import { sendInviteEmail } from "@/lib/email";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { assertPlanCapacity } from "@/lib/billing/entitlements";

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

    const where = {
      ...scopedCampusWhere(user, campusId),
      ...(classId ? { classId } : {}),
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
          _count: { select: { attendance: true, invoices: true } },
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
      select: { id: true, campusId: true, campus: { select: { name: true } } },
    });
    const classesById = new Map(classes.map((cls) => [cls.id, cls]));

    for (const student of students) {
      if (!classesById.has(student.classId)) {
        throw new ApiError(`Class not found for ${student.fullName}`, 404);
      }
    }

    const guardianInvites: GuardianInvite[] = [];
    const studentInvites: StudentInvite[] = [];
    const queuedGuardianEmails = new Set<string>();
    const queuedStudentEmails = new Set<string>();

    const created = await prisma.$transaction(async (tx) => {
      const createdStudents = [];

      for (const student of students) {
        const targetClass = classesById.get(student.classId)!;
        const guardianEmail = student.guardianEmail?.trim().toLowerCase() || null;
        const studentEmail = student.studentEmail?.trim().toLowerCase() || null;
        let parentUserId: string | null = null;
        let studentUserId: string | null = null;

        if (studentEmail && studentEmail === guardianEmail) {
          throw new ApiError("Student login email must be different from guardian email", 400);
        }

        if (guardianEmail) {
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

        const createdStudent = await tx.student.create({
          data: {
            campusId: targetClass.campusId,
            classId: student.classId,
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
          },
        });

        createdStudents.push(createdStudent);
      }

      return createdStudents;
    });

    for (const s of created) {
      await prisma.auditLog.create({
        data: {
          tableName: 'student',
          recordId: s.id,
          newValue: { fullName: s.fullName, rollNo: s.rollNo },
          userId: user.userId,
        }
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
    if (["active", "archived", "transferred"].includes(updates.status)) data.status = updates.status;
    if (updates.dateOfBirth !== undefined) data.dateOfBirth = asDate(updates.dateOfBirth);
    if (updates.classId) {
      const targetClass = await prisma.class.findFirst({
        where: { id: updates.classId, campusId: existing.campusId, campus: { schoolId: user.schoolId } },
        select: { id: true },
      });
      if (!targetClass) throw new ApiError("Class not found", 404);
      data.classId = updates.classId;
    }

    const student = await prisma.student.update({
      where: { id },
      data,
      include: { class: { select: { id: true, name: true, section: true } } },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'student',
        recordId: id,
        oldValue: { classId: existing.classId },
        newValue: { classId: updates.classId || existing.classId },
        userId: user.userId,
      }
    });

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

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("Student id is required", 400);

    const existing = await prisma.student.findFirst({
      where: { id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Student not found", 404);

    await prisma.student.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[students] DELETE failed");
  }
}
