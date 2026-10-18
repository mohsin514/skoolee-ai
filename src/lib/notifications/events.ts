import { prisma } from "@/lib/db/prisma";

export interface NotificationEventPayload {
  schoolId: string;
  campusId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  [key: string]: unknown;
}

interface NotificationEventDef {
  title: (ctx: Record<string, unknown>) => string;
  message: (ctx: Record<string, unknown>) => string;
  icon: string;
  link?: string;
  recipients: (ctx: NotificationEventPayload) => Promise<string[]>;
  /** SKO-416: ACTION items need work in the source workflow; MENTION items are addressed to the reader. */
  category?: "UPDATE" | "MENTION" | "ACTION";
  /** The record the notification is about, so access is rechecked on open and the source can resolve it. */
  source?: (ctx: Record<string, unknown>) => { type: string; id: string } | null;
  dueAt?: (ctx: Record<string, unknown>) => Date | null;
}

// ─── Recipient Resolvers ─────────────────────────────────

async function getCampusManagers(schoolId: string, campusId?: string | null): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      schoolId,
      isActive: true,
      OR: [
        ...(campusId ? [{ campusId, role: { in: ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"] as any } }] : []),
        { role: "SUPER_ADMIN" as any },
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function getAdminsAndPrincipal(schoolId: string, campusId?: string | null): Promise<string[]> {
  return getCampusManagers(schoolId, campusId);
}

async function getClassTeacherIds(classId: string): Promise<string[]> {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { classTeacherId: true },
  });
  return cls?.classTeacherId ? [cls.classTeacherId] : [];
}

async function getTeachersOfClass(classId: string): Promise<string[]> {
  const subjects = await prisma.subject.findMany({
    where: { classId, teacherId: { not: null } },
    select: { teacherId: true },
  });
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { classTeacherId: true },
  });
  const ids = new Set<string>();
  for (const s of subjects) if (s.teacherId) ids.add(s.teacherId);
  if (cls?.classTeacherId) ids.add(cls.classTeacherId);
  return Array.from(ids);
}

async function getAllCampusStaff(schoolId: string, campusId?: string | null): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      schoolId,
      isActive: true,
      role: { in: ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"] as any },
      ...(campusId ? { OR: [{ campusId }, { campusId: null, role: "SUPER_ADMIN" as any }] } : {}),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

function s(val: unknown) {
  return String(val ?? "");
}

// ─── Event Registry ──────────────────────────────────────

export const NOTIFICATION_EVENTS: Record<string, NotificationEventDef> = {
  // ── Class Management ───────────────────────────────────
  CLASS_CREATED: {
    title: (c) => "New class created",
    message: (c) => `${s(c.actorName)} created class ${s(c.className)}${c.section ? ` - ${s(c.section)}` : ""}`,
    icon: "BookOpen",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  CLASS_UPDATED: {
    title: (c) => "Class updated",
    message: (c) => `${s(c.actorName)} updated class ${s(c.className)}`,
    icon: "BookOpen",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const classTeacher = c.classId ? await getClassTeacherIds(c.classId as string) : [];
      return [...new Set([...managers, ...classTeacher])];
    },
  },
  CLASS_DELETED: {
    title: (c) => "Class archived",
    message: (c) => `${s(c.actorName)} archived class ${s(c.className)}; its history is preserved`,
    icon: "BookOpen",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },

  // ── Student Management ─────────────────────────────────
  STUDENT_ADMITTED: {
    title: (c) => "New student enrolled",
    message: (c) => `${s(c.actorName)} enrolled ${s(c.studentName)} in ${s(c.className)}`,
    icon: "GraduationCap",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const classTeacher = c.classId ? await getClassTeacherIds(c.classId as string) : [];
      return [...new Set([...managers, ...classTeacher])];
    },
  },
  STUDENT_TRANSFERRED: {
    title: (c) => "Student transferred",
    message: (c) => `${s(c.studentName)} transferred to ${s(c.newClassName)}`,
    icon: "GraduationCap",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const oldTeacher = c.oldClassId ? await getClassTeacherIds(c.oldClassId as string) : [];
      const newTeacher = c.newClassId ? await getClassTeacherIds(c.newClassId as string) : [];
      return [...new Set([...managers, ...oldTeacher, ...newTeacher])];
    },
  },
  STUDENT_DELETED: {
    title: (c) => "Student archived",
    message: (c) => `${s(c.actorName)} archived student ${s(c.studentName)}; their history is preserved`,
    icon: "GraduationCap",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const classTeacher = c.classId ? await getClassTeacherIds(c.classId as string) : [];
      return [...new Set([...managers, ...classTeacher])];
    },
  },

  // ── Teacher & Staff ────────────────────────────────────
  TEACHER_ADDED: {
    title: (c) => "New teacher added",
    message: (c) => `${s(c.actorName)} added teacher ${s(c.teacherName)}`,
    icon: "UserCheck",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  STAFF_ADDED: {
    title: (c) => "New staff added",
    message: (c) => `${s(c.actorName)} added ${s(c.roleName)} ${s(c.staffName)}`,
    icon: "UserCheck",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  STAFF_INVITED: {
    title: (c) => "Staff invitation sent",
    message: (c) => `${s(c.actorName)} invited ${s(c.email)} as ${s(c.roleName)}`,
    icon: "Mail",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  STAFF_REMOVED: {
    title: (c) => "Staff removed",
    message: (c) => `${s(c.actorName)} removed ${s(c.staffName)}`,
    icon: "UserCheck",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  INVITE_ACCEPTED: {
    title: (c) => "Invitation accepted",
    message: (c) => `${s(c.staffName)} accepted invitation as ${s(c.roleName)}`,
    icon: "UserCheck",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },

  // ── Attendance ─────────────────────────────────────────
  ATTENDANCE_SUBMITTED: {
    title: (c) => "Attendance submitted",
    message: (c) => `${s(c.actorName)} submitted attendance for ${s(c.className)} on ${s(c.date)}`,
    icon: "CalendarCheck",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  // SKO-405: one notice to guardians with attendance access when a recorded absence is corrected.
  ATTENDANCE_CORRECTED: {
    title: () => "Attendance corrected",
    message: (c) => `The school corrected ${s(c.studentName)}'s attendance for ${s(c.date)} to ${({ PRESENT: "present", LATE: "late", PARTIAL: "part day", EXCUSED: "excused absence", LEAVE: "leave", ABSENT: "absent" } as Record<string, string>)[String(c.status)] ?? s(c.status)}`,
    icon: "CalendarCheck",
    link: "/parent",
    recipients: async (c) => (Array.isArray(c.guardianIds) ? c.guardianIds.map(String) : []),
  },
  TEACHER_ATTENDANCE_MARKED: {
    title: (c) => "Teacher attendance marked",
    message: (c) => `Teacher attendance marked for ${s(c.date)}`,
    icon: "CalendarCheck",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },

  // ── Exams & Marks ──────────────────────────────────────
  EXAM_CREATED: {
    title: (c) => "New exam created",
    message: (c) => `${s(c.actorName)} created exam "${s(c.examTitle)}" for ${s(c.className)}`,
    icon: "FileText",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const teachers = c.classId ? await getTeachersOfClass(c.classId as string) : [];
      return [...new Set([...managers, ...teachers])];
    },
  },
  EXAM_STATUS_CHANGED: {
    title: (c) => "Exam status updated",
    message: (c) => `Exam "${s(c.examTitle)}" status changed to ${s(c.status)}`,
    icon: "FileText",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const teachers = c.classId ? await getTeachersOfClass(c.classId as string) : [];
      return [...new Set([...managers, ...teachers])];
    },
  },
  MARKS_ENTERED: {
    title: (c) => "Marks entered",
    message: (c) => `${s(c.actorName)} entered marks for ${s(c.examTitle)} — ${s(c.className)}`,
    icon: "Award",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const classTeacher = c.classId ? await getClassTeacherIds(c.classId as string) : [];
      return [...new Set([...managers, ...classTeacher])];
    },
  },
  EXAM_LOCKED: {
    title: (c) => "Exam locked",
    message: (c) => `${s(c.actorName)} locked exam "${s(c.examTitle)}" and generated report cards`,
    icon: "FileText",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const teachers = c.classId ? await getTeachersOfClass(c.classId as string) : [];
      return [...new Set([...managers, ...teachers])];
    },
  },

  MARKS_REJECTED: {
    title: (c) => "Marks sent back for correction",
    message: (c) =>
      `${s(c.actorName)} returned the marks for "${s(c.examTitle)}" — ${s(c.className)}. Reason: ${s(c.reason)}`,
    icon: "AlertTriangle",
    link: "/teacher/marks",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const teachers = c.classId ? await getTeachersOfClass(c.classId as string) : [];
      return [...new Set([...managers, ...teachers])];
    },
  },

  // ── Report Cards ───────────────────────────────────────
  REPORT_CARDS_GENERATED: {
    title: (c) => "Report cards generated",
    message: (c) => `Report cards generated for "${s(c.examTitle)}"`,
    icon: "FileText",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  REPORT_CARDS_REVIEWED: {
    title: (c) => "Report cards reviewed",
    message: (c) => `Report cards reviewed for "${s(c.examTitle)}"`,
    icon: "FileText",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const classTeacher = c.classId ? await getClassTeacherIds(c.classId as string) : [];
      return [...new Set([...managers, ...classTeacher])];
    },
  },
  REPORT_CARDS_PUBLISHED: {
    title: (c) => "Report cards published",
    message: (c) => `Report cards for "${s(c.examTitle)}" have been published`,
    icon: "Award",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const teachers = c.classId ? await getTeachersOfClass(c.classId as string) : [];
      return [...new Set([...managers, ...teachers])];
    },
  },

  // ── Fees ───────────────────────────────────────────────
  FEE_STRUCTURE_CREATED: {
    title: (c) => "Fee structure created",
    message: (c) => `${s(c.actorName)} created fee structure for ${s(c.className)}`,
    icon: "Receipt",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  FEE_STRUCTURE_UPDATED: {
    title: (c) => "Fee structure updated",
    message: (c) => `${s(c.actorName)} updated fee structure for ${s(c.className)}`,
    icon: "Receipt",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  INVOICES_GENERATED: {
    title: (c) => "Invoices generated",
    message: (c) => `${s(c.count)} invoice${Number(c.count) !== 1 ? "s" : ""} generated for ${s(c.className)}`,
    icon: "Receipt",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  PAYMENT_RECORDED: {
    title: (c) => "Payment recorded",
    message: (c) => `Payment of Rs ${s(c.amount)} recorded for ${s(c.studentName)}`,
    icon: "Receipt",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },

  // ── Timetable ──────────────────────────────────────────
  TIMETABLE_CREATED: {
    title: (c) => "Timetable created",
    message: (c) => `${s(c.actorName)} created timetable for ${s(c.className)}`,
    icon: "LayoutGrid",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  // SKO-423: no evidence in the notice; the update is read after sign-in.
  FAMILY_DIGEST_READY: {
    title: () => "Weekly update ready",
    message: () => "Your child's weekly school update is ready to read.",
    icon: "Mail",
    link: "/parent",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-421: the family hears the outcome only; the reason and any note stay inside the request.
  LEARNER_LEAVE_DECIDED: {
    title: () => "Leave request answered",
    message: (c) => c.status === "APPROVED" ? "The school approved a leave request." : c.status === "DECLINED" ? "The school declined a leave request." : "The school asked for more detail on a leave request.",
    icon: "CalendarCheck",
    link: "/parent/attendance",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-403: sent once per published version, only to affected teachers and the class's families.
  TIMETABLE_CHANGED: {
    title: () => "Timetable updated",
    message: (c) => `The timetable for ${s(c.className)} changes from ${s(c.effectiveFrom)} (version ${s(c.version)}, ${s(c.changeCount)} lesson changes)`,
    icon: "LayoutGrid",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-413: one notice per published datesheet version, to the affected classes' families and invigilators.
  EXAM_DATESHEET_PUBLISHED: {
    title: (c) => (c.first ? "Exam datesheet published" : "Exam datesheet changed"),
    message: (c) => c.first ? `${s(c.sessionTitle)} datesheet is published (version ${s(c.version)}).` : `${s(c.sessionTitle)} datesheet changed in version ${s(c.version)} (${s(c.changeCount)} change(s)).`,
    icon: "CalendarClock",
    source: (c) => ({ type: "datesheet-version", id: s(c.versionId) }),
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  TIMETABLE_PUBLISHED: {
    title: (c) => "Timetable published",
    message: (c) => `Timetable published for ${s(c.className)}`,
    icon: "LayoutGrid",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const teachers = c.classId ? await getTeachersOfClass(c.classId as string) : [];
      return [...new Set([...managers, ...teachers])];
    },
  },
  TIMETABLE_DELETED: {
    title: (c) => "Timetable deleted",
    message: (c) => `${s(c.actorName)} deleted timetable for ${s(c.className)}`,
    icon: "LayoutGrid",
    link: "/admin",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },

  // ── Academic Year ──────────────────────────────────────
  ACADEMIC_YEAR_CLOSED: {
    title: (c) => "Academic year closed",
    message: (c) => `Academic year ${s(c.year)} has been closed`,
    icon: "Calendar",
    link: "/admin",
    recipients: (c) => getAllCampusStaff(c.schoolId, c.campusId),
  },
  STUDENTS_PROMOTED: {
    title: (c) => "Students promoted",
    message: (c) => `${s(c.count)} student${Number(c.count) !== 1 ? "s" : ""} promoted to ${s(c.className)}`,
    icon: "GraduationCap",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const teachers = c.classId ? await getClassTeacherIds(c.classId as string) : [];
      return [...new Set([...managers, ...teachers])];
    },
  },
  ACADEMIC_CYCLE_CHANGED: {
    title: (c) => "Academic cycle updated",
    message: (c) => `Academic cycle "${s(c.label)}" is now ${s(c.status)}`,
    icon: "Calendar",
    link: "/admin",
    recipients: (c) => getAllCampusStaff(c.schoolId, c.campusId),
  },

  // ── Subjects ───────────────────────────────────────────
  SUBJECT_CREATED: {
    title: (c) => "New subject created",
    message: (c) => `${s(c.actorName)} created subject "${s(c.subjectName)}" for ${s(c.className)}`,
    icon: "BookOpen",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const classTeacher = c.classId ? await getClassTeacherIds(c.classId as string) : [];
      const teacherIds: string[] = [];
      if (c.teacherId) teacherIds.push(c.teacherId as string);
      return [...new Set([...managers, ...classTeacher, ...teacherIds])];
    },
  },
  // ── Front desk ─────────────────────────────────────────
  // SKO-465: the callback owner is told once per callback; the note never travels in the notification.
  PHONE_CALLBACK_ASSIGNED: {
    title: () => "Callback assigned to you",
    message: (c) => `Return the call from ${s(c.callerName)} (assigned by ${s(c.actorName)})`,
    icon: "PhoneCall",
    link: "/receptionist?view=phone-calls",
    category: "ACTION",
    source: (c) => (c.callbackId ? { type: "callback", id: s(c.callbackId) } : null),
    dueAt: (c) => (c.dueAt ? new Date(s(c.dueAt)) : null),
    recipients: async (c) => (c.ownerId ? [s(c.ownerId)] : []),
  },
  // SKO-464: the accountable owner of a postal item until it is handed over.
  POSTAL_ASSIGNED: {
    title: () => "Postal item assigned to you",
    message: (c) => `${s(c.actorName)} made you responsible for handing over ${s(c.itemCode)}`,
    icon: "Mail",
    link: "/receptionist?view=postal",
    category: "ACTION",
    source: (c) => (c.postalId ? { type: "postal", id: s(c.postalId) } : null),
    recipients: async (c) => (c.ownerId ? [s(c.ownerId)] : []),
  },
  // SKO-469: a document requested by reception waits for a campus leader's approval.
  CERTIFICATE_APPROVAL_NEEDED: {
    title: () => "Document waiting for approval",
    message: (c) => `${s(c.actorName)} requested ${s(c.title)} (${s(c.serial)})`,
    icon: "FileText",
    link: "/principal?view=certificates",
    category: "ACTION",
    source: (c) => (c.issueId ? { type: "certificate", id: s(c.issueId) } : null),
    recipients: (c) => getCampusManagers(c.schoolId, c.campusId),
  },
  // SKO-398: the admissions owner of an application, until it is enrolled, closed or handed on.
  ADMISSION_APPLICATION_ASSIGNED: {
    title: () => "Application assigned to you",
    message: (c) => `${s(c.actorName)} made you responsible for application ${s(c.reference)}`,
    icon: "ClipboardList",
    link: "/admin?view=applications",
    category: "ACTION",
    source: (c) => (c.applicationId ? { type: "application", id: s(c.applicationId) } : null),
    recipients: async (c) => (c.ownerId ? [s(c.ownerId)] : []),
  },
  // ── Leave Management ───────────────────────────────────
  LEAVE_APPLIED: {
    title: () => "Leave request to review",
    message: (c) => `${s(c.actorName)} applied for ${s(c.leaveTypeName)} leave (${s(c.fromDate)} → ${s(c.toDate)})`,
    icon: "Plane",
    link: "/admin?view=leave",
    category: "ACTION",
    source: (c) => (c.leaveId ? { type: "leave", id: s(c.leaveId) } : null),
    // Due the day before the leave starts, so the reviewer decides before it begins.
    dueAt: (c) => (c.fromDate ? new Date(new Date(`${s(c.fromDate)}T00:00:00.000Z`).getTime() - 86_400_000) : null),
    recipients: (c) => getAdminsAndPrincipal(c.schoolId, c.campusId),
  },
  LEAVE_REVIEWED: {
    title: (c) => `Leave ${s(c.status).toLowerCase()}`,
    message: (c) => `Your ${s(c.leaveTypeName)} leave request (${s(c.fromDate)} → ${s(c.toDate)}) has been ${s(c.status).toLowerCase()} by ${s(c.actorName)}`,
    icon: "Plane",
    link: "/teacher/leave",
    recipients: async (c) => c.recipientId ? [c.recipientId as string] : [],
  },

  SUBJECT_TEACHER_ASSIGNED: {
    title: (c) => "Teacher assigned to subject",
    message: (c) => `${s(c.teacherName)} assigned to "${s(c.subjectName)}" in ${s(c.className)}`,
    icon: "UserCheck",
    link: "/admin",
    recipients: async (c) => {
      const managers = await getAdminsAndPrincipal(c.schoolId, c.campusId);
      const teacherIds: string[] = [];
      if (c.teacherId) teacherIds.push(c.teacherId as string);
      return [...new Set([...managers, ...teacherIds])];
    },
  },

  // ── Licensing / Subscription ───────────────────────────
  SUBSCRIPTION_EXPIRING: {
    title: (c) => "Subscription expiring",
    message: (c) =>
      `${s(c.plan)} plan paid period ended on ${s(c.planEndsAt)}. Renew within the grace period to keep the system running.`,
    icon: "CreditCard",
    link: "/dashboard/billing",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId),
  },
  SUBSCRIPTION_SUSPENDED: {
    title: (c) => "Subscription suspended",
    message: (c) =>
      `Your ${s(c.plan)} subscription was suspended — the paid period ended on ${s(c.planEndsAt)}. Renew in billing to restore access.`,
    icon: "Lock",
    link: "/dashboard/billing",
    recipients: (c) => getAdminsAndPrincipal(c.schoolId),
  },
};
