import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { SchoolAiError } from "./access";
import { assertAnnouncementAccess } from "./announcements-service";

/** Keep the announcement boundary on legacy history and dashboard read paths. */
export async function announcementHistoryRestriction(user: AuthUser): Promise<Prisma.ParentCommunicationWhereInput> {
  try {
    await assertAnnouncementAccess(user);
    return {};
  } catch (error) {
    if (!(error instanceof SchoolAiError) || error.status !== 403) throw error;
    // SQL NOT alone drops null-related legacy messages as well.
    return { OR: [{ relatedType: null }, { relatedType: { not: "SCHOOL_AI_ANNOUNCEMENT" } }] };
  }
}
