import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type SchoolAiDocumentJob } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { AIProviderQuotaError,ensureAICreditsAvailable,consumeAICreditAndLog,isOpenAIQuotaExhausted } from "@/lib/ai/openai";
import { assertApprovalRole,assertSchoolAiAccess,loadWorkspacePermissionSnapshot,resolveWorkerPrincipal,SchoolAiError } from "./access";
import { getWorkspaceRecordInTransaction,updateWorkspaceRecordInTransaction,assertSourceOriginalAccess } from "./repository";
import { sourceDataSchema } from "./schemas";
import { schoolAiTransaction } from "./transaction";
import { readOriginal,removeOriginal } from "./source-storage";
import { extractDocument,schoolAiProviderCapabilities } from "./providers";
import { documentJobCreateSchema,documentJobUpdateSchema,extractionResultSchema,type DocumentJob } from "./document-jobs";
import type { AiWorkspaceRecord } from "./types";
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const dto=(row:SchoolAiDocumentJob):DocumentJob=>({id:row.id,recordId:row.recordId,recordVersion:row.recordVersion,version:row.version,kind:row.kind as DocumentJob["kind"],status:row.status as DocumentJob["status"],scheduledAt:row.scheduledAt.toISOString(),attempts:row.attempts,errorCode:row.errorCode,result:row.result?extractionResultSchema.parse(row.result):null,completedAt:row.completedAt?.toISOString()??null,appliedVersion:row.appliedVersion});
async function source(user:AuthUser,id:string,db:TxClient,kind?:string,versions?:readonly number[]){
 const actor=await db.user.findFirst({where:{id:user.userId,schoolId:user.schoolId,role:user.role,isActive:true,accessVersion:user.accessVersion??0,...(user.role==="SUPER_ADMIN"?{}:{campusId:user.campusId})},select:{id:true}});
 if(!actor)throw new SchoolAiError("Your source access changed.",403,"ACCESS_CHANGED");
 const permissions=await loadWorkspacePermissionSnapshot(user,db),record=await getWorkspaceRecordInTransaction(user,id,db,permissions);
 if(record.kind!=="SOURCE")throw new SchoolAiError("Source not found.",404);
 if(kind){await assertSchoolAiAccess(user,kind==="DELETE_ORIGINAL"?"delete":"add",permissions);if(kind==="DELETE_ORIGINAL")assertApprovalRole(user);await assertSchoolOperational(user.schoolId,db);}
 const data=sourceDataSchema.parse(record.data);
 if(!data.storageKey?.startsWith(`school-ai/${user.schoolId}/`))throw new SchoolAiError("This source has no private original.",409,"ORIGINAL_UNAVAILABLE");
 await assertSourceOriginalAccess(user,id,db,{versions,permissions});
 return{record,data,permissions};
}
async function audit(user:AuthUser,row:SchoolAiDocumentJob,action:string,db:TxClient){await db.auditLog.create({data:{schoolId:user.schoolId,tableName:"school_ai_document_jobs",recordId:row.id,userId:user.userId,oldValue:Prisma.DbNull,newValue:{action,kind:row.kind,status:row.status,version:row.version,sourceId:row.recordId,sourceVersion:row.recordVersion}}});}
/** Conservatively preserve original evidence referenced by any retained snapshot. No key or text enters errors. */
async function retentionCheck(user:AuthUser,recordId:string,db:TxClient){
 const refs=await db.$queryRaw<{id:string}[]>`SELECT id FROM school_ai_revisions WHERE school_id=${user.schoolId} AND record_id<>${recordId} AND position(to_json(${recordId}::text)::text in data::text)>0 LIMIT 1`;
 const scripts=await db.$queryRaw<{id:string}[]>`SELECT id FROM school_ai_exam_attempts WHERE school_id=${user.schoolId} AND position(to_json(${recordId}::text)::text in COALESCE(review::text,''))>0 LIMIT 1`;
 if(refs.length||scripts.length)throw new SchoolAiError("Retained curriculum, paper or marking evidence still depends on this source. Keep its original.",409,"SOURCE_RETAINED");
}
export async function assertOriginalAvailable(user:AuthUser,recordId:string,db:TxClient){if(await db.schoolAiDocumentJob.count({where:{schoolId:user.schoolId,recordId,kind:"DELETE_ORIGINAL",status:{in:["PROCESSING","COMPLETED"]}}}))throw new SchoolAiError("The original has entered its reviewed deletion process.",410,"ORIGINAL_REMOVED");}
export async function listDocumentJobs(user:AuthUser,id:string){return schoolAiTransaction(user,async db=>{const rows=await db.schoolAiDocumentJob.findMany({where:{schoolId:user.schoolId,recordId:id},orderBy:{createdAt:"desc"},take:30});await source(user,id,db,undefined,rows.map(row=>row.recordVersion));return rows.map(dto);});}
export async function queueDocumentJobInTransaction(user:AuthUser,record:AiWorkspaceRecord,db:TxClient){
 const previous=await db.schoolAiDocumentJob.findUnique({where:{recordId_recordVersion_kind:{recordId:record.id,recordVersion:record.version,kind:"EXTRACT"}}});if(previous)return dto(previous);
 const row=await db.schoolAiDocumentJob.create({data:{schoolId:user.schoolId,campusId:record.campusId,recordId:record.id,recordVersion:record.version,kind:"EXTRACT",actorId:user.userId,actorRole:user.role,accessVersion:user.accessVersion??0}});await audit(user,row,"QUEUED",db);return dto(row);
}
export async function createDocumentJob(user:AuthUser,id:string,raw:unknown){const input=documentJobCreateSchema.parse(raw);return schoolAiTransaction(user,async db=>{
 await db.$queryRaw`SELECT id FROM school_ai_records WHERE id=${id} AND school_id=${user.schoolId} FOR UPDATE`;
 const{record,data}=await source(user,id,db,input.kind,[input.version]);if(record.version!==input.version)throw new SchoolAiError("The source changed. Review its saved version.",409,"STALE_WORKSPACE_VERSION");
 const prior=await db.schoolAiDocumentJob.findUnique({where:{recordId_recordVersion_kind:{recordId:id,recordVersion:input.version,kind:input.kind}}});if(prior)return dto(prior);
 await assertOriginalAvailable(user,id,db);
 if(await db.schoolAiDocumentJob.count({where:{schoolId:user.schoolId,recordId:id,status:{in:["QUEUED","PROCESSING","READY"]}}}))throw new SchoolAiError("Finish or cancel this source's current job first.",409,"DOCUMENT_JOB_ACTIVE");
 if(input.kind==="EXTRACT"){
  if(record.status==="ARCHIVED")throw new SchoolAiError("Archived sources cannot be processed.",409);
  if(!["text/plain","text/csv"].includes(data.mimeType)&&!schoolAiProviderCapabilities().documentExtraction)throw new SchoolAiError("Document processing is not configured.",503,"PROVIDER_UNAVAILABLE");
  return queueDocumentJobInTransaction(user,record,db);
 }
 if(record.status!=="ARCHIVED")throw new SchoolAiError("Archive this source before scheduling deletion of its original.",409,"ARCHIVE_FIRST");
 await retentionCheck(user,id,db);
 const scheduledAt=new Date(input.scheduledAt??Date.now()+30*86400000);if(scheduledAt.getTime()<Date.now()+86400000||scheduledAt.getTime()>Date.now()+3660*86400000)throw new SchoolAiError("Choose a retention date from tomorrow to ten years ahead.",422);
 const row=await db.schoolAiDocumentJob.create({data:{schoolId:user.schoolId,campusId:record.campusId,recordId:id,recordVersion:record.version,kind:input.kind,scheduledAt,actorId:user.userId,actorRole:user.role,accessVersion:user.accessVersion??0}});await audit(user,row,"RETENTION_SCHEDULED",db);return dto(row);
 });}
export async function updateDocumentJob(user:AuthUser,id:string,jobId:string,raw:unknown){const input=documentJobUpdateSchema.parse(raw);return schoolAiTransaction(user,async db=>{
 await db.$queryRaw`SELECT id FROM school_ai_records WHERE id=${id} AND school_id=${user.schoolId} FOR UPDATE`;
 const row=await db.schoolAiDocumentJob.findFirst({where:{id:jobId,schoolId:user.schoolId,recordId:id}});if(!row)throw new SchoolAiError("Document job not found.",404);
 const{record,permissions}=await source(user,id,db,row.kind,[row.recordVersion]);if(row.version!==input.version)throw new SchoolAiError("Document progress changed. Refresh it.",409,"STALE_DOCUMENT_JOB");
 if(input.action==="apply"){
  if(row.kind!=="EXTRACT"||row.status!=="READY"||!row.result)throw new SchoolAiError("No reviewed extraction is ready.",409);
  if(record.version!==input.recordVersion||record.status==="ARCHIVED")throw new SchoolAiError("Review the current source before replacing its text.",409,"STALE_WORKSPACE_VERSION");
  await assertSourceOriginalAccess(user,id,db,{version:row.recordVersion,permissions,preserveClassification:true});
  const result=extractionResultSchema.parse(row.result);
  const updated=await updateWorkspaceRecordInTransaction(user,id,{version:record.version,data:{...record.data,extractedText:result.text,sourcePages:result.pages,uncertainties:result.uncertainties,extractionStatus:"needs_review",...(result.expectedPageCount!==undefined?{expectedPageCount:result.expectedPageCount}:{}),...(result.missingPages!==undefined?{missingPages:result.missingPages}:{}),...(result.structureReviewed!==undefined?{structureReviewed:result.structureReviewed}:{})}},db,permissions);
  const saved=await db.schoolAiDocumentJob.update({where:{id:jobId},data:{status:"APPLIED",version:{increment:1},appliedVersion:updated.version}});await audit(user,saved,"EXTRACTION_APPLIED",db);return{job:dto(saved),record:updated};
 }
 if(input.action==="cancel"){
  if(!["QUEUED","FAILED","READY"].includes(row.status))throw new SchoolAiError("Processing has started or this job has ended. Refresh its progress.",409,"DOCUMENT_BUSY");
  const saved=await db.schoolAiDocumentJob.update({where:{id:jobId},data:{status:"CANCELLED",result:Prisma.DbNull,completedAt:new Date(),version:{increment:1}}});await audit(user,saved,"CANCELLED",db);return{job:dto(saved)};
 }
 if(row.actorId!==user.userId||row.actorRole!==user.role||row.accessVersion!==(user.accessVersion??0))throw new SchoolAiError("The original authorized uploader must retry.",403);
 if(row.status!=="FAILED"||row.attempts>=3)throw new SchoolAiError("This job cannot be retried. Review the original manually.",409);
 if(row.kind==="DELETE_ORIGINAL"){if(record.status!=="ARCHIVED"||record.version!==row.recordVersion)throw new SchoolAiError("Retention approval changed.",409);await retentionCheck(user,id,db);}
 else{await assertOriginalAvailable(user,id,db);if(record.status==="ARCHIVED")throw new SchoolAiError("Archived sources cannot be processed.",409);}
 const saved=await db.schoolAiDocumentJob.update({where:{id:jobId},data:{status:"QUEUED",leaseToken:null,leaseUntil:null,errorCode:null,completedAt:null,version:{increment:1}}});await audit(user,saved,"RETRIED",db);return{job:dto(saved)};
 });}
/** Provider calls are outside database retries. An abandoned extraction is never silently resubmitted. */
export async function processDocumentJob(user:AuthUser,id:string,adapters={extract:extractDocument,read:readOriginal,remove:removeOriginal}){
 const token=randomUUID();
 const claimed=await schoolAiTransaction(user,async db=>{
  const job=await db.schoolAiDocumentJob.findFirst({where:{id,schoolId:user.schoolId,status:"QUEUED",scheduledAt:{lte:new Date()},actorId:user.userId,attempts:{lt:3}}});if(!job)return null;
  await db.$queryRaw`SELECT id FROM school_ai_records WHERE id=${job.recordId} AND school_id=${user.schoolId} FOR UPDATE`;
  const{record,data}=await source(user,job.recordId,db,job.kind,[job.recordVersion]);
  if(job.actorRole!==user.role||job.accessVersion!==(user.accessVersion??0))throw new SchoolAiError("Source permissions changed.",403,"ACCESS_CHANGED");
  if(job.kind==="DELETE_ORIGINAL"){if(record.version!==job.recordVersion||record.status!=="ARCHIVED")throw new SchoolAiError("Retention approval changed.",409,"STALE_WORKSPACE_VERSION");await retentionCheck(user,job.recordId,db);}
  else{await assertOriginalAvailable(user,job.recordId,db);if(record.status==="ARCHIVED")throw new SchoolAiError("Source archived.",409,"SOURCE_ARCHIVED");}
  const changed=await db.schoolAiDocumentJob.updateMany({where:{id,version:job.version,status:"QUEUED"},data:{status:"PROCESSING",attempts:{increment:1},version:{increment:1},leaseToken:token,leaseUntil:new Date(Date.now()+180000)}});if(!changed.count)return null;
  return{job,data};
 });
 if(!claimed)return null;
 try{
  const{job,data}=claimed;
  if(job.kind==="DELETE_ORIGINAL")await adapters.remove(data.storageKey!);
  const native=["text/plain","text/csv"].includes(data.mimeType);
  if(job.kind==="EXTRACT"&&!native)await ensureAICreditsAvailable(user.schoolId);
  const result=job.kind==="EXTRACT"?extractionResultSchema.parse(await adapters.extract(await adapters.read(data.storageKey!),data.fileName,data.mimeType,data.sourceLanguage??"en")):null;
  return await schoolAiTransaction(user,async db=>{
   await db.$queryRaw`SELECT id FROM school_ai_document_jobs WHERE id=${id} AND school_id=${user.schoolId} FOR UPDATE`;
   const current=await db.schoolAiDocumentJob.findFirst({where:{id,schoolId:user.schoolId,status:"PROCESSING",leaseToken:token,leaseUntil:{gt:new Date()}}});if(!current)throw new SchoolAiError("Processing lease expired.",409,"DOCUMENT_LEASE_LOST");
   if(result){await source(user,job.recordId,db,"EXTRACT",[job.recordVersion]);if(!native)await consumeAICreditAndLog({schoolId:user.schoolId,campusId:job.campusId,userId:user.userId,feature:"SCHOOL_AI_DOCUMENT",action:"EXTRACT",model:result.model,tokensUsed:result.tokensUsed,metadata:{sourceId:job.recordId,jobId:id}},undefined,db);}
   const saved=await db.schoolAiDocumentJob.update({where:{id},data:{status:result?"READY":"COMPLETED",result:result?json(result):Prisma.DbNull,completedAt:new Date(),leaseToken:null,leaseUntil:null,version:{increment:1}}});await audit(user,saved,result?"EXTRACTION_READY":"ORIGINAL_DELETED",db);return dto(saved);
  });
 }catch(error){await schoolAiTransaction(user,async db=>{const row=await db.schoolAiDocumentJob.findFirst({where:{id,schoolId:user.schoolId,status:"PROCESSING",leaseToken:token}});if(row){const failed=await db.schoolAiDocumentJob.update({where:{id},data:{status:"FAILED",leaseToken:null,leaseUntil:null,version:{increment:1},errorCode:error instanceof AIProviderQuotaError||isOpenAIQuotaExhausted(error)?"AI_QUOTA_EXHAUSTED":error instanceof SchoolAiError?error.code??"PROCESSING_FAILED":"PROCESSING_FAILED"}});await audit(user,failed,"FAILED",db);}});throw error;}
}
export async function sweepDocumentJobs(db:PrismaClient,limit=4){
 await db.schoolAiDocumentJob.updateMany({where:{status:"PROCESSING",leaseUntil:{lt:new Date()},kind:"EXTRACT"},data:{status:"FAILED",errorCode:"OUTCOME_UNCERTAIN",leaseToken:null,leaseUntil:null,version:{increment:1}}});
 await db.schoolAiDocumentJob.updateMany({where:{status:"PROCESSING",leaseUntil:{lt:new Date()},kind:"DELETE_ORIGINAL"},data:{status:"FAILED",errorCode:"DELETE_RETRY_REQUIRED",leaseToken:null,leaseUntil:null,version:{increment:1}}});
 const refs=await db.schoolAiDocumentJob.findMany({where:{status:"QUEUED",scheduledAt:{lte:new Date()},attempts:{lt:3}},select:{id:true,schoolId:true,campusId:true,actorId:true,actorRole:true,accessVersion:true,version:true},orderBy:[{scheduledAt:"asc"},{id:"asc"}],take:Math.min(10,Math.max(1,limit))});
 // G42 [K-B2]: the stored actor is re-resolved (kind included, C32); a changed role or access version fails
 // the job with ACCESS_CHANGED instead of processing it under stale authority.
 for(const ref of refs){const actor=await resolveWorkerPrincipal({userId:ref.actorId,schoolId:ref.schoolId,role:ref.actorRole,accessVersion:ref.accessVersion}).catch(()=>null);try{if(!actor)throw new SchoolAiError("Access changed.",403,"ACCESS_CHANGED");await processDocumentJob(actor,ref.id);}catch(error){await db.schoolAiDocumentJob.updateMany({where:{id:ref.id,schoolId:ref.schoolId,status:"QUEUED",version:ref.version},data:{status:"FAILED",errorCode:error instanceof SchoolAiError&&error.code==="ACCESS_CHANGED"?"ACCESS_CHANGED":"REVIEW_REQUIRED",version:{increment:1}}});}}
 return{processed:refs.length};
}
