import assert from "node:assert/strict";
import { before,after,test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord,updateWorkspaceRecord,getWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createDocumentJob,updateDocumentJob,processDocumentJob,listDocumentJobs,assertOriginalAvailable,sweepDocumentJobs } from "../../src/lib/school-ai/document-jobs-service";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
import { saveOriginal,readOriginal,removeOriginal } from "../../src/lib/school-ai/source-storage";
import { createCaptureTicket,verifyCaptureTicket } from "../../src/lib/school-ai/capture-handoff";
const url="postgresql://angular_dev_15@127.0.0.1:55438/postgres";if(process.env.DATABASE_URL!==url||process.env.DIRECT_URL!==url)throw new Error("Isolated School AI database only.");
process.env.SCHOOL_AI_STORAGE_DIR="/private/tmp/skoolee-ai-document-job-tests";
const db=new PrismaClient(),schoolId=`ai-docjobs-${randomUUID()}`,campusId=randomUUID(),admin:AuthUser={userId:randomUUID(),schoolId,campusId,role:"CAMPUS_ADMIN",email:`${randomUUID()}@example.invalid`,accessVersion:0},other:AuthUser={...admin,userId:randomUUID(),email:`${randomUUID()}@example.invalid`};
const keys:string[]=[];
before(async()=>{await db.school.create({data:{id:schoolId,slug:schoolId,regId:schoolId,name:"Synthetic document jobs",contactEmail:admin.email,city:"Test",status:"ACTIVE"}});await db.campus.create({data:{id:campusId,schoolId,regId:campusId,name:"Synthetic campus",city:"Test"}});for(const u of[admin,other])await db.user.create({data:{id:u.userId,schoolId,campusId,email:u.email,role:u.role,fullName:"Synthetic manager",onboardingComplete:true}});});
after(async()=>{for(const key of keys)await removeOriginal(key);await db.school.delete({where:{id:schoolId}});await db.$disconnect();await prisma.$disconnect();});
async function source(){const key=await saveOriginal(schoolId,Buffer.from("Original synthetic text."),"text/plain");keys.push(key);return createWorkspaceRecord(admin,{kind:"SOURCE",title:"Synthetic source",campusId,idempotencyKey:randomUUID(),data:{extractedText:"Existing correction.",documentKind:"other",fileName:"synthetic.txt",mimeType:"text/plain",origin:"upload",extractionStatus:"needs_review",uncertainties:[]}},{trustedSourceMetadata:{storageKey:key,sourceLanguage:"en"}});}
test("background extraction is single claimed and never overwrites a concurrently edited source; reviewed apply is CAS",async()=>{
 const record=await source(),job=await createDocumentJob(admin,record.id,{version:record.version,kind:"EXTRACT"});let calls=0;
 const adapters={read:readOriginal,remove:removeOriginal,extract:async()=>{calls++;await updateWorkspaceRecord(admin,record.id,{version:record.version,data:{...record.data,extractedText:"Human correction while processing."}});return{text:"Reviewed extracted text.",pages:[],uncertainties:[],model:"native-utf8",tokensUsed:0};}};
 const results=await Promise.all([processDocumentJob(admin,job.id,adapters),processDocumentJob(admin,job.id,adapters)]);assert.equal(calls,1);const ready=results.find(r=>r?.status==="READY")!;assert.equal((await getWorkspaceRecord(admin,record.id)).data.extractedText,"Human correction while processing.");
 await assert.rejects(()=>updateDocumentJob(admin,record.id,job.id,{version:ready.version,action:"apply",recordVersion:record.version}),{status:409});
 const current=await getWorkspaceRecord(admin,record.id),applied=await updateDocumentJob(admin,record.id,job.id,{version:ready.version,action:"apply",recordVersion:current.version});assert.equal(applied.record?.data.extractedText,"Reviewed extracted text.");assert.equal(applied.record?.status,"DRAFT");assert.equal(applied.record?.data.extractionStatus,"needs_review");assert.equal(await db.schoolAiRevision.count({where:{schoolId,recordId:record.id}}),3);
 await assert.rejects(()=>updateDocumentJob(admin,record.id,job.id,{version:ready.version,action:"apply",recordVersion:current.version}),{status:409});
});
test("cancelled queued work has no provider call; explicit retries are bounded and another actor cannot retry",async()=>{
 const record=await source(),job=await createDocumentJob(admin,record.id,{version:record.version,kind:"EXTRACT"});const cancelled=await updateDocumentJob(admin,record.id,job.id,{version:job.version,action:"cancel"});assert.equal(cancelled.job.status,"CANCELLED");assert.equal(await processDocumentJob(admin,job.id),null);
 const second=await source(),queued=await createDocumentJob(admin,second.id,{version:second.version,kind:"EXTRACT"});const adapters={read:readOriginal,remove:removeOriginal,extract:async()=>{throw new Error("Synthetic provider failure");}};
 for(let n=0;n<3;n++){await assert.rejects(()=>processDocumentJob(admin,queued.id,adapters));const failed=(await listDocumentJobs(admin,second.id))[0];assert.equal(failed.status,"FAILED");await assert.rejects(()=>updateDocumentJob(other,second.id,queued.id,{version:failed.version,action:"retry"}),{status:403});if(n<2)await updateDocumentJob(admin,second.id,queued.id,{version:failed.version,action:"retry"});else await assert.rejects(()=>updateDocumentJob(admin,second.id,queued.id,{version:failed.version,action:"retry"}),{status:409});}
});
test("retention requires archived reviewed version and cannot delete any retained evidence reference",async()=>{
 let record=await source();await assert.rejects(()=>createDocumentJob(admin,record.id,{version:record.version,kind:"DELETE_ORIGINAL"}),{status:409});
 await createWorkspaceRecord(admin,{kind:"WORKFLOW",title:"Referenced source",campusId,idempotencyKey:randomUUID(),data:{goal:"Retain evidence.",steps:[],sourceIds:[record.id],missingInformation:[]}});
 record=await updateWorkspaceRecord(admin,record.id,{version:record.version,action:"archive"});await assert.rejects(()=>createDocumentJob(admin,record.id,{version:record.version,kind:"DELETE_ORIGINAL"}),{status:409,code:"SOURCE_RETAINED"});
});
test("scheduled retention deletes only the original, leaves immutable history, and is idempotent",async()=>{
 let record=await source();record=await updateWorkspaceRecord(admin,record.id,{version:record.version,action:"archive"});const job=await createDocumentJob(admin,record.id,{version:record.version,kind:"DELETE_ORIGINAL",scheduledAt:new Date(Date.now()+2*86400000).toISOString()});assert.equal(await processDocumentJob(admin,job.id),null);await db.schoolAiDocumentJob.update({where:{id:job.id},data:{scheduledAt:new Date(Date.now()-1000)}});assert.equal((await processDocumentJob(admin,job.id))?.status,"COMPLETED");assert.equal(await processDocumentJob(admin,job.id),null);await assert.rejects(()=>readOriginal(record.data.storageKey as string));await assert.rejects(()=>schoolAiTransaction(admin,tx=>assertOriginalAvailable(admin,record.id,tx)),{status:410});assert.equal((await getWorkspaceRecord(admin,record.id)).data.extractedText,"Existing correction.");assert.equal(await db.schoolAiRevision.count({where:{schoolId,recordId:record.id}}),2);
});
test("expired extraction leases require explicit reconciliation/retry; revoked authorization fails without provider IO",async()=>{
 const record=await source(),job=await createDocumentJob(admin,record.id,{version:record.version,kind:"EXTRACT"});await db.schoolAiDocumentJob.update({where:{id:job.id},data:{status:"PROCESSING",leaseUntil:new Date(Date.now()-1000),leaseToken:randomUUID(),attempts:1}});await sweepDocumentJobs(db);let saved=await db.schoolAiDocumentJob.findUniqueOrThrow({where:{id:job.id}});assert.equal(saved.status,"FAILED");assert.equal(saved.errorCode,"OUTCOME_UNCERTAIN");
 await updateDocumentJob(admin,record.id,job.id,{version:saved.version,action:"retry"});await db.user.update({where:{id:admin.userId},data:{accessVersion:1}});try{await sweepDocumentJobs(db);saved=await db.schoolAiDocumentJob.findUniqueOrThrow({where:{id:job.id}});assert.equal(saved.status,"FAILED");assert.equal(saved.attempts,1);}finally{await db.user.update({where:{id:admin.userId},data:{accessVersion:0}});}
});
test("phone capture is account-, campus- and access-version-bound with unforgeable exact scope",async()=>{
 const scope={campusId,language:"ur",documentKind:"syllabus"},ticket=await createCaptureTicket(admin,scope);assert.deepEqual(await verifyCaptureTicket(admin,ticket.ticket),scope);await assert.rejects(()=>verifyCaptureTicket(other,ticket.ticket),{status:403});await assert.rejects(()=>verifyCaptureTicket({...admin,accessVersion:1},ticket.ticket),{status:403});await assert.rejects(()=>createCaptureTicket(admin,{...scope,campusId:randomUUID()}),{status:403});await assert.rejects(()=>verifyCaptureTicket(admin,ticket.ticket.slice(0,-4)+"AAAA"),{status:403});
 await db.rolePermission.create({data:{schoolId,role:admin.role,module:"ai",canView:true,canAdd:false,canEdit:true}});try{await assert.rejects(()=>verifyCaptureTicket(admin,ticket.ticket),{status:403});}finally{await db.rolePermission.deleteMany({where:{schoolId,role:admin.role,module:"ai"}});}
});
