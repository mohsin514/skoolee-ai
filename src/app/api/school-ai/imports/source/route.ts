import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { assertRosterPermission } from "@/lib/imports/roster-access";
import { requireSchoolAiUser, resolveWorkspaceCampus, SchoolAiError } from "@/lib/school-ai/access";
import { getWorkspaceRecord } from "@/lib/school-ai/repository";
import { sourceDataSchema } from "@/lib/school-ai/schemas";
import { rosterFromReviewedSource } from "@/lib/school-ai/roster-source";
import { RosterMappingError } from "@/lib/school-ai/roster-import";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    await assertRosterPermission(user, "add");
    const input = z.strictObject({ recordId: z.string().min(1).max(200), expectedVersion: z.number().int().positive(), campusId: z.string().min(1).max(200) }).parse(await readBoundedJson(request, 4096));
    const campusId = await resolveWorkspaceCampus(user, input.campusId);
    const record = await getWorkspaceRecord(user, input.recordId);
    if (record.kind !== "SOURCE" || record.campusId !== campusId) throw new SchoolAiError("Choose a student register from this campus.", 403);
    if (record.status !== "APPROVED" || record.version !== input.expectedVersion) throw new SchoolAiError("Review and approve the current document extraction before importing.", 409);
    const source = rosterFromReviewedSource(sourceDataSchema.parse(record.data));
    return Response.json({ source, fileName: record.title }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return schoolAiError(error instanceof RosterMappingError ? new SchoolAiError("Use a reviewed CSV or tables with matching header rows. Correct incomplete or inconsistent tables before importing.", 422) : error);
  }
}
