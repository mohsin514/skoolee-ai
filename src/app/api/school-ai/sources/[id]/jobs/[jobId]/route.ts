import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { readBoundedJson,schoolAiError } from "@/lib/school-ai/http";
import { updateDocumentJob } from "@/lib/school-ai/document-jobs-service";
export async function PATCH(request:Request,context:{params:Promise<{id:string;jobId:string}>}){try{assertSameOrigin(request);const{id,jobId}=await context.params;return Response.json(await updateDocumentJob(await requireSchoolAiUser("view"),id,jobId,await readBoundedJson(request,4000)),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return schoolAiError(error);}}
