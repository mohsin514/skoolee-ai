import { ApiError } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";
import { generatePaperWithReceipt, recoverPaperGeneration } from "@/lib/school-ai/paper-generation-service";

export const runtime = "nodejs";
export const maxDuration = 90;
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSchoolAiUser("add");
    if (!(await authRateLimit(`school-ai:paper:${user.schoolId}:${user.userId}`, { limit: 8, windowMs: 300000 })).ok) throw new ApiError("Please wait before generating another paper.", 429);
    const result = await generatePaperWithReceipt(user, await readBoundedJson(request));
    return Response.json(result.body, { status: result.status, headers: noStore });
  } catch (error) {
    const response = schoolAiError(error);
    response.headers.set("Cache-Control", noStore["Cache-Control"]);
    return response;
  }
}

/** A lost HTTP response can be recovered without another provider dispatch. */
export async function GET(request: Request) {
  try {
    const user = await requireSchoolAiUser("add");
    const result = await recoverPaperGeneration(user, new URL(request.url).searchParams.get("key") ?? "");
    return Response.json(result.body, { status: result.status, headers: noStore });
  } catch (error) {
    const response = schoolAiError(error);
    response.headers.set("Cache-Control", noStore["Cache-Control"]);
    return response;
  }
}
