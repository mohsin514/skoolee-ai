import { NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { errorResponse } from "@/lib/api/scope";
import { getWorkspaceCapabilities, requireSchoolAiUser, readSchoolAiJson, SchoolAiError } from "@/lib/school-ai/access";
import { createWorkspaceRecord, listWorkspaceRecords } from "@/lib/school-ai/repository";
import { createWorkspaceSchema, MAX_WORKSPACE_BODY_BYTES, workspaceKindSchema, workspaceStatusSchema } from "@/lib/school-ai/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSchoolAiUser();
    const kindInput = request.nextUrl.searchParams.get("kind");
    const statusInput = request.nextUrl.searchParams.get("status");
    const kind = kindInput ? workspaceKindSchema.safeParse(kindInput) : null;
    const status = statusInput ? workspaceStatusSchema.safeParse(statusInput) : null;
    if (kind && !kind.success || status && !status.success) throw new SchoolAiError("Invalid workspace filter.");
    const limit = request.nextUrl.searchParams.get("limit");
    if (limit !== null && (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) throw new SchoolAiError("Choose a page size between 1 and 100.");
    const [page, capabilities] = await Promise.all([
      listWorkspaceRecords(user, { kind: kind?.success ? kind.data : undefined, status: status?.success ? status.data : undefined, limit: limit ? Number(limit) : undefined, cursor: request.nextUrl.searchParams.get("cursor") ?? undefined }),
      getWorkspaceCapabilities(user),
    ]);
    return Response.json({ ...page, capabilities }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Unable to load the school AI workspace."); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    const raw = await readSchoolAiJson(request, MAX_WORKSPACE_BODY_BYTES);
    const parsed = createWorkspaceSchema.safeParse(raw);
    if (!parsed.success) throw new SchoolAiError(parsed.error.issues.map((issue) => issue.message).slice(0, 5).join(" "));
    const record = await createWorkspaceRecord(user, parsed.data);
    return Response.json({ record }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Unable to save the school AI draft."); }
}
