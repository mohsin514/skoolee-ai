import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { readBoundedJson,schoolAiError } from "@/lib/school-ai/http";
import { preparePaperFigure } from "@/lib/school-ai/paper-figure-service";
export const runtime="nodejs";
export async function POST(request:Request){try{assertSameOrigin(request);const user=await requireSchoolAiUser("edit");const figure=await preparePaperFigure(user,await readBoundedJson(request,4000));return Response.json({figure},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return schoolAiError(error);}}
