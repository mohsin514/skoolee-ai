import type { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertPermission, canMarkAttendance } from "@/lib/api/scope";
import { triggerRepeatedAbsenceAlert } from "@/lib/notifications/automation";
import { deliverNotification, notify } from "@/lib/notifications/in-app";
import { writeObservedAttendance } from "@/lib/school-ai/school-operations-register-write";

/**
 * Saving one class register (POST /api/attendance), shared by the quick-mark route and the AI
 * Workflows `attendance.save_register` capability: the class must be the caller's (a teacher's own
 * class or one they teach), the write goes through the reviewed register fences (future day, locked
 * or submitted register, enrollment, permission matrix), repeated-absence alerts fire for recorded
 * absences only, and exactly one ATTENDANCE_SUBMITTED notice is raised per save.
 */
export function dateOnly(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError("Invalid date", 400);
  return date;
}

export async function getClassForAttendance(classId: string, user: AuthUser) {
  const cls = await prisma.class.findFirst({
    where: {
      id: classId,
      campus: { schoolId: user.schoolId },
      ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId || "" }),
      ...(user.role === "TEACHER"
        ? {
            OR: [
              { classTeacherId: user.userId },
              { subjects: { some: { teacherId: user.userId } } },
            ],
          }
        : {}),
    },
    select: { id: true, campusId: true, name: true, section: true },
  });

  if (!cls) throw new ApiError("Class not found or not assigned to you", 404);
  return cls;
}

export interface SaveRegisterInput {
  classId: string;
  date: string;
  entries: Array<{ studentId: string; status: Extract<AttendanceStatus, "PRESENT" | "ABSENT" | "LEAVE"> }>;
}

export interface SaveRegisterOptions {
  /**
   * "background" (the route): the notice is fire-and-forget, as before. "await": the caller waits for
   * the notice rows (a delivery failure is logged, never thrown, since the register is already saved).
   */
  notification?: "background" | "await";
}

export async function saveAttendanceRegister(user: AuthUser, input: SaveRegisterInput, options: SaveRegisterOptions = {}) {
  if (!canMarkAttendance(user)) throw new ApiError("Insufficient permissions", 403);
  await assertPermission(user, "attendance", "add");

  const cls = await getClassForAttendance(input.classId, user);
  const date = dateOnly(input.date);
  const records = await writeObservedAttendance(user, { campusId: cls.campusId, classId: cls.id, date: input.date, entries: input.entries });

  const summary = {
    total: records.length,
    present: records.filter((entry) => entry.status === "PRESENT").length,
    absent: records.filter((entry) => entry.status === "ABSENT").length,
    leave: records.filter((entry) => entry.status === "LEAVE").length,
  };

  const absenceAlerts = [];
  for (const record of records.filter((entry) => entry.status === "ABSENT")) {
    try {
      absenceAlerts.push(
        ...(await triggerRepeatedAbsenceAlert({
          studentId: record.studentId,
          date,
          createdById: user.userId,
        }))
      );
    } catch (error) {
      console.error("[attendance] absence alert failed", error);
    }
  }

  const payload = {
    schoolId: user.schoolId,
    campusId: cls.campusId,
    actorId: user.userId,
    actorName: user.fullName,
    className: [cls.name, cls.section].filter(Boolean).join(" "),
    date: input.date,
    count: records.length,
  };
  if (options.notification === "await") {
    await deliverNotification("ATTENDANCE_SUBMITTED", payload).catch((error) => console.error("[notify] ATTENDANCE_SUBMITTED failed:", error));
  } else {
    notify("ATTENDANCE_SUBMITTED", payload);
  }

  return { cls, records, summary, absenceAlerts };
}
