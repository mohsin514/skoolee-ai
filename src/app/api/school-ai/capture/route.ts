import { authRateLimit } from "@/lib/auth/rate-limit";
import { ApiError } from "@/lib/api/scope";
import { z } from "zod";
import QRCode from "qrcode";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { readBoundedJson,schoolAiError } from "@/lib/school-ai/http";
import { createCaptureTicket,verifyCaptureTicket,captureScopeSchema } from "@/lib/school-ai/capture-handoff";
export const runtime="nodejs";
const input=z.union([z.strictObject({action:z.literal("create"),scope:captureScopeSchema}),z.strictObject({action:z.literal("resolve"),ticket:z.string().min(1).max(4000)})]);
export async function POST(request:Request){try{assertSameOrigin(request);const user=await requireSchoolAiUser("add"),body=input.parse(await readBoundedJson(request,6000));if(!(await authRateLimit(`school-ai:capture:${user.schoolId}:${user.userId}`,{limit:30,windowMs:300000})).ok)throw new ApiError("Please wait before creating another capture link.",429);if(body.action==="resolve")return Response.json({scope:await verifyCaptureTicket(user,body.ticket)},{headers:{"Cache-Control":"private, no-store"}});const result=await createCaptureTicket(user,body.scope),url=`${new URL(request.url).origin}/school-capture#${result.ticket}`;return Response.json({url,expiresAt:result.expiresAt,qr:await QRCode.toDataURL(url,{width:320,margin:2,errorCorrectionLevel:"M"})},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return schoolAiError(error);}}
