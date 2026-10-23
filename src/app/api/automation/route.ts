import { requireAutomaticUser as requireAuthUser } from "@/lib/automation/auth";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { SchoolAiError } from "@/lib/school-ai/access";
import { listAutomaticJobs, startAutomaticJob } from "@/lib/automation/service";
export async function GET() { try { return Response.json({ jobs: await listAutomaticJobs(await requireAuthUser()) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return schoolAiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const user = await requireAuthUser(); if (!(await authRateLimit(`automatic:${user.userId}`, { limit: 10, windowMs: 300000 })).ok) throw new SchoolAiError("Please wait before starting more workflows.", 429); return Response.json({ job: await startAutomaticJob(user, await readBoundedJson(request, 32000)) }); } catch (error) { return schoolAiError(error); } }
