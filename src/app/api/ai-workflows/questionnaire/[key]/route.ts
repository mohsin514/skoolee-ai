import { z } from "zod";
import { requireAutomaticUser } from "@/lib/ai-workflows/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { workflowErrorResponse, workflowJson } from "@/lib/ai-workflows/http";
import { buildSetup, deferSheet, getSheet, saveAnswers } from "@/lib/ai-workflows/questionnaire/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The signed-in user's own role questionnaire. The definition is resolved from the live role on the
 * server; a key for another role is NOT_FOUND (RT14). GET reads the sheet, PUT saves answers, POST
 * builds (`{action:"build"}`) or defers (`{action:"defer"}`).
 */
const language = z.enum(["en", "ar", "ur"]).catch("en");
type Params = { params: Promise<{ key: string }> };

export async function GET(request: Request, context: Params) {
  try {
    const user = await requireAutomaticUser();
    const { key } = await context.params;
    return workflowJson({ sheet: await getSheet(user, key, language.parse(new URL(request.url).searchParams.get("lang"))) });
  } catch (error) { return workflowErrorResponse(error); }
}

export async function PUT(request: Request, context: Params) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    const { key } = await context.params;
    return workflowJson(await saveAnswers(user, key, await readBoundedJson(request, 32_000)));
  } catch (error) { return workflowErrorResponse(error); }
}

const actionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("build"), version: z.number().int().positive(), language: z.enum(["en", "ar", "ur"]) }),
  z.strictObject({ action: z.literal("defer") }),
]);

export async function POST(request: Request, context: Params) {
  try {
    assertSameOrigin(request);
    const user = await requireAutomaticUser();
    const { key } = await context.params;
    const body = actionSchema.parse(await readBoundedJson(request, 4_000));
    if (body.action === "defer") { await deferSheet(user, key); return workflowJson({ deferred: true }); }
    return workflowJson({ run: await buildSetup(user, key, { version: body.version, language: body.language }) });
  } catch (error) { return workflowErrorResponse(error); }
}
