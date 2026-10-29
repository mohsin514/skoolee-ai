import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import {
  closeAssignment, confirmDraftFile, getAssignment, grantExtension, prepareDraftFile, previewRelease, recordPaperSubmission, releaseAssignment,
  reopenSubmission, returnFeedback, saveDraft, saveFeedback, submitWork, updateAssignment,
} from "@/lib/assignments/service";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const invalid = (error: ZodError) => Response.json({ error: "Please check the highlighted information.", details: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400, headers: noStore });

// Drafts, other classes and other pupils' work all answer with the same 404.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    return Response.json({ success: true, ...(await getAssignment(user, id)) }, { headers: noStore });
  } catch (error) {
    const response = error instanceof ZodError ? invalid(error) : errorResponse(error, "[assignments] GET one failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const { op, ...input } = await parseBody(req, jsonObjectBody);
    const result = op === "update" ? await updateAssignment(user, id, input)
      : op === "preview" ? await previewRelease(user, id)
      : op === "release" ? await releaseAssignment(user, id, input)
      : op === "close" ? await closeAssignment(user, id)
      : op === "extension" ? await grantExtension(user, id, input)
      : op === "paper" ? await recordPaperSubmission(user, id, input)
      : op === "feedback" ? await saveFeedback(user, id, input)
      : op === "return" ? await returnFeedback(user, id, input)
      : op === "reopen" ? await reopenSubmission(user, id, input)
      : op === "draft" ? await saveDraft(user, id, input)
      : op === "file" ? await prepareDraftFile(user, id, input)
      : op === "confirm" ? await confirmDraftFile(user, id)
      : op === "submit" ? await submitWork(user, id, input)
      : (() => { throw new ApiError("Unknown assignment action.", 400); })();
    return Response.json({ success: true, result }, { headers: noStore });
  } catch (error) {
    const response = error instanceof ZodError ? invalid(error) : errorResponse(error, "[assignments] action failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
