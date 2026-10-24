import { NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { errorResponse } from "@/lib/api/scope";
import { requireSchoolAiUser, readSchoolAiJson, SchoolAiError } from "@/lib/school-ai/access";
import { getWorkspaceHistoryAccess, getWorkspaceRecord, listWorkspaceRevisionPage, listWorkspaceRevisions, updateWorkspaceRecord } from "@/lib/school-ai/repository";
import { MAX_WORKSPACE_BODY_BYTES, updateWorkspaceSchema } from "@/lib/school-ai/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await requireSchoolAiUser();
    const { id } = await context.params;
    const record = await getWorkspaceRecord(user, id);
    const requestedVersion = request.nextUrl.searchParams.get("revision");
    if (requestedVersion !== null) {
      const version = Number(requestedVersion);
      if (!/^\d+$/.test(requestedVersion) || !Number.isSafeInteger(version) || version < 1) throw new SchoolAiError("Choose a valid saved revision.");
      const { revisions } = await listWorkspaceRevisionPage(user, id, { version, limit: 1 });
      if (!revisions[0]) throw new SchoolAiError("Revision not found or no longer accessible.", 404);
      return Response.json({ record, revision: revisions[0] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (request.nextUrl.searchParams.get("history") === "summary") {
      const cursor = request.nextUrl.searchParams.get("beforeVersion");
      const beforeVersion = cursor === null ? undefined : Number(cursor);
      if (cursor !== null && (!/^\d+$/.test(cursor) || !Number.isSafeInteger(beforeVersion) || beforeVersion! < 1)) throw new SchoolAiError("Choose a valid revision cursor.");
      const [page, historyAccess] = await Promise.all([listWorkspaceRevisionPage(user, id, { beforeVersion, limit: 20 }), getWorkspaceHistoryAccess(user, id)]);
      const revisions = page.revisions.map(({ data: _data, ...summary }) => summary);
      return Response.json({ record, revisions, nextVersion: page.nextVersion, historyAccess }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const revisions = request.nextUrl.searchParams.get("history") === "1" ? await listWorkspaceRevisions(user, id) : undefined;
    return Response.json({ record, ...(revisions ? { revisions } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Unable to load this school AI item."); }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser();
    const { id } = await context.params;
    const raw = await readSchoolAiJson(request, MAX_WORKSPACE_BODY_BYTES);
    const parsed = updateWorkspaceSchema.safeParse(raw);
    if (!parsed.success) throw new SchoolAiError(parsed.error.issues.map((issue) => issue.message).slice(0, 5).join(" "));
    const record = await updateWorkspaceRecord(user, id, parsed.data);
    return Response.json({ record }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Unable to update this school AI item."); }
}
