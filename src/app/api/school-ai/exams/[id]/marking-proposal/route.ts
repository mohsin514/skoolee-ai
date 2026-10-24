import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { proposeWrittenMarks } from "@/lib/school-ai/written-marking-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 try { assertSameOrigin(request); const user = await requireAuthUser(); if (!(await authRateLimit(`school-ai:marking:${user.schoolId}:${user.userId}`, { limit: 12, windowMs: 300000 })).ok) throw new ApiError("Please wait before requesting more marking proposals.", 429); return Response.json({ proposal: await proposeWrittenMarks(user, (await context.params).id, await readBoundedJson(request)) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); }
}
