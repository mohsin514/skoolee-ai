import { z } from "zod";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { approveGroup, decideItem, itemEvidence, itemResponsesFor, reviewDecision } from "@/lib/school-ai/item-evidence-service";

// SKO-422: question-level evidence and the teacher's interpretation of it.
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input = z.object({ recordId: z.string().min(1).max(120), item: z.string().min(3).max(400).nullable() }).parse({ recordId: params.get("recordId"), item: params.get("item") });
    const user = await requireAuthUser();
    return Response.json({ result: input.item ? await itemResponsesFor(user, input.recordId, input.item) : await itemEvidence(user, input.recordId) }, { headers });
  } catch (error) { return schoolAiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const input = z.object({ action: z.enum(["decide", "review", "group"]), recordId: z.string().min(1).max(120).optional(), decisionId: z.string().min(1).max(120).optional(), data: z.unknown() }).strict().parse(await readBoundedJson(request));
    if (input.action === "decide") {
      if (!input.recordId) throw new ApiError("Choose a curriculum.", 400);
      return Response.json({ result: await decideItem(user, input.recordId, input.data) }, { headers, status: 201 });
    }
    if (!input.decisionId) throw new ApiError("Choose a decision.", 400);
    const result = input.action === "review" ? await reviewDecision(user, input.decisionId, input.data) : await approveGroup(user, input.decisionId, input.data);
    return Response.json({ result }, { headers });
  } catch (error) { return schoolAiError(error); }
}
