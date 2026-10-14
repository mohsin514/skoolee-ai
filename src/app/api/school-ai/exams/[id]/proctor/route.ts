import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { changeExamProctor, getExamProctor, startExamProctor } from "@/lib/school-ai/exam-proctor-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, context: Context) { try { return Response.json(await getExamProctor(await requireAuthUser(), (await context.params).id, new URL(request.url).searchParams.get("cursor") ?? undefined), { headers }); } catch (error) { return schoolAiError(error); } }
export async function POST(request: Request, context: Context) { try { assertSameOrigin(request); return Response.json(await startExamProctor(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 4000)), { headers }); } catch (error) { return schoolAiError(error); } }
export async function PATCH(request: Request, context: Context) { try { assertSameOrigin(request); return Response.json(await changeExamProctor(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 12000)), { headers }); } catch (error) { return schoolAiError(error); } }
