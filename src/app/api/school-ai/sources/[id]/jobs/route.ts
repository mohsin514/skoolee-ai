import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { readBoundedJson,schoolAiError } from "@/lib/school-ai/http";
import { createDocumentJob,listDocumentJobs } from "@/lib/school-ai/document-jobs-service";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{return Response.json({jobs:await listDocumentJobs(await requireSchoolAiUser("view"),(await context.params).id)},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return schoolAiError(error);}}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{assertSameOrigin(request);return Response.json({job:await createDocumentJob(await requireSchoolAiUser("view"),(await context.params).id,await readBoundedJson(request,4000))},{status:201,headers:{"Cache-Control":"private, no-store"}});}catch(error){return schoolAiError(error);}}
