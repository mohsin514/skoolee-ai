import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import type { CampusLookup } from "./active-campus";

/** Live campus of exactly this school (archived campuses cannot be chosen). */
export const lookupSchoolCampus: CampusLookup = (schoolId, campusId) =>
  runUnscoped("validate active campus belongs to the signed-in school", () =>
    prisma.campus.findFirst({ where: { id: campusId, schoolId, archivedAt: null }, select: { id: true } }));
