/** Boolean keys served by GET /api/navigation/access in addition to the 17 permission modules.
 *  Each is computed by the same predicate that gates the matching API. Presentation only. */
export const CAPABILITY_KEYS = [
  "institutionAuthority", "billing", "groupConsole", "standaloneOwner", "campusOps", "groupCampus",
  "memberships", "inviteLeaders", "mfaVerified",
  "hasCampusAdmin", "hasPrincipal", "hasAccountant", "hasReceptionist", "hasLibrarian", "standaloneDeputy",
  "academicLead", "financeDesk", "frontDesk", "libraryDesk",
  "careMember", "serviceAgent", "tripToday", "activityStaff", "improvementLead",
  "accessPlans", "pkgCanteen", "pickupGuardian", "multiChild", "recordSearch",
  "schoolAi", "schoolAiExams", "corrections",
  // The school's plan (src/config/plans.ts) — presentation only; each feature's server entry point enforces it.
  "planTimetable", "planExamPlanning", "planGroupConsole", "planApiAccess", "planMarkScan", "planAiRemarks", "planExamStudio",
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
