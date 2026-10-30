import type { Prisma } from "@prisma/client";

/**
 * SKAI-163 — the one shape of a student in a directory list.
 *
 * Both rosters (the campus console's dashboard load and `GET /api/students`) carried every column of every
 * student: date of birth, address, medical notes, allergies, medications, special needs, Emirates ID and
 * regulator id, for the whole campus, on every load. The profile already fetches those from
 * `GET /api/students/<id>` when it is opened, so a list only needs what the directory, its filters, the CSV
 * export and the restore dialog show.
 *
 * Add a field here only if a list renders it. Sensitive fields belong to `/api/students/<id>`
 * (tests/students/roster-summary.test.ts holds that line).
 */
export const rosterSummarySelect = {
  id: true,
  schoolId: true,
  campusId: true,
  classId: true,
  admissionNo: true,
  fullName: true,
  nameUr: true,
  rollNo: true,
  gender: true,
  profileImageUrl: true,
  guardianName: true,
  guardianNameUr: true,
  guardianPhone: true,
  guardianWhatsapp: true,
  guardianEmail: true,
  enrollmentDate: true,
  status: true,
  archivedAt: true,
  archiveReason: true,
  categoryId: true,
  groupId: true,
  studentUserId: true,
  parentUserId: true,
  class: { select: { id: true, name: true, section: true, academicYear: true } },
  studentUser: { select: { id: true, email: true, isActive: true } },
  campus: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
} satisfies Prisma.StudentSelect;

/** Fields that only the single-record read (`/api/students/<id>`) may return. */
export const PROFILE_ONLY_STUDENT_FIELDS = [
  "dateOfBirth",
  "bloodType",
  "nationality",
  "emiratesId",
  "regulatorId",
  "phone",
  "address",
  "city",
  "province",
  "postalCode",
  "medicalNotes",
  "specialNeeds",
  "allergies",
  "medications",
  "previousSchool",
  "guardianRelationship",
  "guardianOccupation",
] as const;
