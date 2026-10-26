import { z } from "zod";
import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { SchoolAiError } from "@/lib/school-ai/access";
import { publishKnowledge, readKnowledge, saveKnowledge, withdrawKnowledge } from "@/lib/rag/service";
import { documentSchema } from "@/lib/rag/core";
import { workflowJson } from "@/lib/ai-workflows/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const command = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("save"), version: z.number().int().positive(), document: documentSchema }),
  z.strictObject({ action: z.enum(["publish", "archive", "delete"]), version: z.number().int().positive() }),
]);
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const version = new URL(request.url).searchParams.get("version");
    return workflowJson({ document: await readKnowledge(await requireAutomaticUser(), (await params).id, version === null ? undefined : z.coerce.number().int().positive().parse(version)) });
  } catch (error) { return schoolAiError(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser(), { id } = await params;
    if (!(await authRateLimit(`rag-write:${user.userId}`, { limit: 30, windowMs: 300000 })).ok) throw new SchoolAiError("Too many document changes. Try again shortly.", 429);
    const input = command.parse(await readBoundedJson(request, 360000));
    const document = input.action === "save" ? await saveKnowledge(user, input.document, { id, version: input.version }) : input.action === "publish" ? await publishKnowledge(user, id, input.version) : await withdrawKnowledge(user, id, input.version, input.action === "delete");
    return workflowJson({ document });
  } catch (error) { return schoolAiError(error); }
}
