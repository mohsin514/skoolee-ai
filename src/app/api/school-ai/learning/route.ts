import { z } from "zod";
import { ApiError,requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { generateGroundedLesson,reviewPaperSemantics,learningEvidence,latestSemanticReview } from "@/lib/school-ai/learning-service";
import { readBoundedJson,schoolAiError } from "@/lib/school-ai/http";
export const runtime="nodejs";
export const maxDuration=180;
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){try{const params=new URL(request.url).searchParams;const input=z.object({recordId:z.string().min(1).max(120),action:z.enum(["evidence","semantic"])}).parse({recordId:params.get("recordId"),action:params.get("action")});const user=await requireAuthUser();return Response.json({result:input.action==="evidence"?await learningEvidence(user,input.recordId):await latestSemanticReview(user,input.recordId)},{headers});}catch(error){return schoolAiError(error);}}
export async function POST(request:Request){try{assertSameOrigin(request);const user=await requireAuthUser();if(!(await authRateLimit(`school-ai:learning:${user.schoolId}:${user.userId}`,{limit:8,windowMs:300000})).ok)throw new ApiError("Please wait before requesting more learning proposals.",429);const input=z.object({action:z.enum(["lesson","semantic"]),data:z.unknown()}).strict().parse(await readBoundedJson(request));return Response.json({result:input.action==="lesson"?await generateGroundedLesson(user,input.data):await reviewPaperSemantics(user,input.data)},{headers});}catch(error){return schoolAiError(error);}}
