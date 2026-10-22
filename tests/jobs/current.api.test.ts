import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { startImportJob } from "../../src/lib/jobs/processing";
import { prisma } from "../../src/lib/db/prisma";
import { createCurrentFixture, type CurrentFixture } from "./current-fixture";
import { jobsDestination } from "./local-destination.mjs";

jobsDestination();
const origin=new URL(process.env.JOBS_TEST_ORIGIN||"http://localhost:3220");
if(!["localhost","127.0.0.1"].includes(origin.hostname)||!["3220","3108"].includes(origin.port)||!process.env.AUTH_SECRET)throw new Error("Dedicated local jobs app and synthetic secret required");
const db=new PrismaClient();let f:CurrentFixture, jobId:string,itemId:string,eventId:string;
async function request(role:string,method="GET",body?:unknown,otherOrigin?:string){return fetch(new URL(`/api/jobs/${jobId}`,origin),{method,headers:{cookie:f.cookies[role],origin:otherOrigin||origin.origin,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});}
before(async()=>{f=await createCurrentFixture(db,3);const delivery=await f.delivery(0);jobId=await f.track([delivery.communication]);eventId=delivery.eventId!;await db.workflowJob.update({where:{id:eventId},data:{state:"failed",reason:"PROVIDER_UNAVAILABLE",attempts:5}});itemId=(await db.activityItem.findFirstOrThrow({where:{jobId}})).id;});
after(async()=>{if(f){await db.activityItem.deleteMany({where:{schoolId:f.schoolId}});await db.guardianRelationship.deleteMany({where:{schoolId:f.schoolId}});await db.school.delete({where:{id:f.schoolId}});}await db.$disconnect();await prisma.$disconnect();});
test("authenticated detail and list are private, scoped and current on the same session",async()=>{
 const response=await request("PRINCIPAL");assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get("cache-control"),"private, no-store");const data=await response.json();assert.equal(data.items[0].canRetry,true);assert.equal(data.items[0].attempts,5);assert.equal(data.sourceHref,`/principal?view=report-cards&exam=${encodeURIComponent(f.examId)}`);
 const list=await fetch(new URL("/api/jobs",origin),{headers:{cookie:f.cookies.PRINCIPAL}});assert.equal(list.status,200);assert.equal(list.headers.get("cache-control"),"private, no-store");assert.ok((await list.json()).jobs.some((row:{id:string})=>row.id===jobId));
 for(const role of ["PARENT","STUDENT","CAMPUS_ADMIN"]){const denied=await request(role);assert.equal(denied.status,404);assert.equal(denied.headers.get("cache-control"),"private, no-store");}
 await db.rolePermission.create({data:{schoolId:f.schoolId,role:"PRINCIPAL",module:"reports",canView:false,canEdit:false}});
 const revoked=await request("PRINCIPAL");assert.equal(revoked.status,403);assert.equal(revoked.headers.get("cache-control"),"private, no-store");
 await db.rolePermission.deleteMany({where:{schoolId:f.schoolId,role:"PRINCIPAL",module:"reports"}});
 const teacher=await request("TEACHER");assert.equal((await teacher.json()).canEdit,false);
 await db.class.update({where:{id:f.classId},data:{classTeacherId:null}});assert.equal((await request("TEACHER")).status,404);
 await db.class.update({where:{id:f.classId},data:{classTeacherId:f.users.TEACHER}});
});
test("reason, origin, current grant and recipient are enforced by actual mutation route",async()=>{
 for(const body of [{action:"retry",items:[itemId]},{action:"retry",items:[itemId],reason:"NO_LONGER_REQUIRED"},{action:"retry",items:[itemId,itemId],reason:"AUTHORIZATION_RESTORED"},{action:"cancel",items:[],reason:"NO_LONGER_REQUIRED",schoolId:"forged"}])assert.equal((await request("PRINCIPAL","POST",body)).status,400);
 const cross=await request("PRINCIPAL","POST",{action:"retry",items:[itemId],reason:"AUTHORIZATION_RESTORED"},"https://different.example.invalid");assert.equal(cross.status,403);assert.equal(cross.headers.get("cache-control"),"private, no-store");
 assert.equal((await request("TEACHER","POST",{action:"retry",items:[itemId],reason:"AUTHORIZATION_RESTORED"})).status,403);
 await db.guardianRelationship.update({where:{id:f.pupilRows[0].relationshipId},data:{status:"REVOKED"}});assert.equal((await request("PRINCIPAL","POST",{action:"retry",items:[itemId],reason:"AUTHORIZATION_RESTORED"})).status,409);
 await db.guardianRelationship.update({where:{id:f.pupilRows[0].relationshipId},data:{status:"ACTIVE"}});
 assert.equal(await db.auditLog.count({where:{schoolId:f.schoolId,recordId:jobId}}),0);
 const accepted=await request("PRINCIPAL","POST",{action:"retry",items:[itemId],reason:"CONFIGURATION_CORRECTED"});assert.equal(accepted.status,200,await accepted.clone().text());assert.equal(accepted.headers.get("cache-control"),"private, no-store");const result=await accepted.json();assert.equal(result.jobId,jobId);assert.equal(result.action,"retry");assert.equal(result.reason,"CONFIGURATION_CORRECTED");assert.equal(result.counts.queued,1);
 assert.equal((await request("PRINCIPAL","POST",{action:"retry",items:[itemId],reason:"CONFIGURATION_CORRECTED"})).status,409);
 assert.equal((await db.activityItem.findUniqueOrThrow({where:{id:itemId}})).workflowId,eventId);
 await db.rolePermission.create({data:{schoolId:f.schoolId,role:"PRINCIPAL",module:"reports",canView:true,canEdit:false}});
 assert.equal((await request("PRINCIPAL","POST",{action:"cancel",items:[],reason:"NO_LONGER_REQUIRED"})).status,403);
 await db.rolePermission.deleteMany({where:{schoolId:f.schoolId,role:"PRINCIPAL",module:"reports"}});
 const cancelled=await request("PRINCIPAL","POST",{action:"cancel",items:[],reason:"NO_LONGER_REQUIRED"});assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).counts.cancelled,1);
 const audit=await db.auditLog.findMany({where:{schoolId:f.schoolId,recordId:jobId}});assert.equal(audit.length,2);assert.ok(audit.every(row=>row.campusId===f.campusId));
});

test("current import add permission is checked before retry is advertised or queued",async()=>{
 jobId=await f.scoped(()=>startImportJob(f.actor,f.campusId,{csv:"transaction_date,amount,description\n2026-10-08,1500,Synthetic API grant",fileName:"api-grant.csv",accountName:"Synthetic API grant",statementFrom:"2026-10-01",statementTo:"2026-10-08",currency:"PKR",campusId:f.campusId}));
 const item=await db.activityItem.findFirstOrThrow({where:{jobId}});
 await db.workflowJob.update({where:{id:item.workflowId!},data:{state:"failed",reason:"WORKER_FAILURE"}});
 await db.rolePermission.create({data:{schoolId:f.schoolId,role:"PRINCIPAL",module:"fees",canView:true,canEdit:true,canAdd:false}});
 const current=await request("PRINCIPAL");assert.equal(current.status,200);const snapshot=await current.json();assert.equal(snapshot.canEdit,true);assert.equal(snapshot.items[0].canRetry,false);assert.equal(snapshot.items[0].retryBlockedReason,"AUTHORIZATION_REQUIRED");
 assert.equal((await request("PRINCIPAL","POST",{action:"retry",items:[item.id],reason:"AUTHORIZATION_RESTORED"})).status,409);
 assert.equal((await db.workflowJob.findUniqueOrThrow({where:{id:item.workflowId!}})).state,"failed");
 assert.equal(await db.auditLog.count({where:{schoolId:f.schoolId,recordId:jobId}}),0);
});
