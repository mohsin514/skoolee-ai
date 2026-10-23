import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireSchoolAiUser, resolveWorkspaceCampus, SchoolAiError } from "@/lib/school-ai/access";
import { canConfigureCampus } from "@/lib/school-ai/setup-role";
import { getWorkspaceRecord } from "@/lib/school-ai/repository";
import { sourceDataSchema } from "@/lib/school-ai/schemas";
import { tableFromReviewedSource } from "@/lib/school-ai/roster-source";
import { RosterMappingError } from "@/lib/school-ai/roster-import";
import { readSetupCsv } from "@/lib/school-ai/school-setup-input";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    if (!canConfigureCampus(user.role)) throw new SchoolAiError("Campus administrator access is required.", 403);
    const input = z.strictObject({ recordId: z.string().min(1).max(128), campusId: z.string().min(1).max(128) }).parse(await readBoundedJson(request, 2048));
    const campusId = await resolveWorkspaceCampus(user, input.campusId);
    const record = await getWorkspaceRecord(user, input.recordId);
    if (record.kind !== "SOURCE" || record.campusId !== campusId || record.status !== "APPROVED") throw new SchoolAiError("Choose an approved source from this campus.", 409);
    const data = sourceDataSchema.parse(record.data);
    if (!["staff_list", "timetable", "other"].includes(data.documentKind)) throw new SchoolAiError("Choose a staff, timetable or setup table. Student records use the student importer.", 422);
    const source = tableFromReviewedSource(data);
    const text = [source.headers, ...source.rows].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    let table;
    try { table = readSetupCsv(text); } catch { throw new SchoolAiError("Review at most 30 setup rows per batch. No rows have been imported.", 422); }
    return Response.json({ table, source: { id: record.id, version: record.version, title: record.title } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error instanceof RosterMappingError ? new SchoolAiError("Review the document tables and matching headers first.", 422) : error); }
}
