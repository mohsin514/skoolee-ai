import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { resolveCurrentPrincipal } from "../../src/lib/auth/principal";
import { readJob, operateJob, listJobs } from "../../src/lib/jobs/service";
import { startPdfJob, startImportJob, processingWorkflow } from "../../src/lib/jobs/processing";
import { consume } from "../../src/lib/queue/outbox";
import { reportDeliveryWorkflow } from "../../src/lib/queue/report-delivery";
import { recordMetaReceipts } from "../../src/lib/jobs/receipts";
import { createCurrentFixture, type CurrentFixture } from "./current-fixture";
import { jobsDestination } from "./local-destination.mjs";

jobsDestination();
process.env.DISABLE_OUTBOUND_MESSAGES = "true";
const db = new PrismaClient();
let f: CurrentFixture;
before(async () => { f = await createCurrentFixture(db); });
after(async () => { if (f) { await db.activityItem.deleteMany({ where: { schoolId: f.schoolId } }); await db.guardianRelationship.deleteMany({ where: { schoolId: f.schoolId } }); await db.school.delete({ where: { id: f.schoolId } }); } await db.$disconnect(); await prisma.$disconnect(); });
const retry = (jobId: string, ids: string[]) => f.scoped(() => operateJob(f.actor, jobId, "retry", ids, "CONFIGURATION_CORRECTED"));
const cancel = (jobId: string) => f.scoped(() => operateJob(f.actor, jobId, "cancel", [], "NO_LONGER_REQUIRED"));
const detail = (jobId: string) => f.scoped(() => readJob(f.actor, jobId));

test("100 real workflow items reconcile 97 accepted + 3 failures; explicit retry keeps version and excludes successes", async () => {
  const deliveries: Awaited<ReturnType<CurrentFixture["delivery"]>>[] = [];
  for (let index = 0; index < 100; index++) deliveries.push(await f.delivery(index, index === 97 ? { status: "NO_RECIPIENT", workflow: false } : {}));
  await db.guardianRelationship.update({ where: { id: f.pupilRows[97].relationshipId }, data: { phone: null } });
  const jobId = await f.track(deliveries.map(row => row.communication));
  assert.equal(await f.track(deliveries.map(row => row.communication)), jobId);
  let sends = 0;
  for (let index = 0; index < 97; index++) await consume(db, { schoolId: f.schoolId, eventId: deliveries[index].eventId! }, ctx => reportDeliveryWorkflow(ctx, async communication => {
    assert.equal(communication.body, `Frozen approved content ${f.pupilRows[index].versionId}`); sends++;
    return { success: true, messageId: `synthetic386-${deliveries[index].communication.id}` };
  }));
  await db.user.update({ where: { id: f.actor.userId }, data: { isActive: false } });
  await consume(db, { schoolId: f.schoolId, eventId: deliveries[98].eventId! }, reportDeliveryWorkflow);
  await db.user.update({ where: { id: f.actor.userId }, data: { isActive: true } });
  await consume(db, { schoolId: f.schoolId, eventId: deliveries[99].eventId! }, reportDeliveryWorkflow);
  let job = await detail(jobId);
  assert.deepEqual(job.counts, { total: 100, queued: 0, running: 0, completed: 97, failed: 3, cancelled: 0 });
  assert.equal(job.attentionCount, 3); assert.equal(job.items.filter(item => item.accepted_at).length, 97);
  assert.equal(job.items.filter(item => item.delivered_at || item.read_at).length, 0);
  assert.equal(job.items.filter(item => item.canRetry).length, 2);
  const missing = job.items.find(item => item.communication_id === deliveries[97].communication.id)!;
  assert.equal(missing.retryBlockedReason, "RECIPIENT_AUTHORIZATION_REQUIRED");
  await assert.rejects(retry(jobId, [job.items[0].id]), /NOT_FAILED/);
  await assert.rejects(retry(jobId, [missing.id]), /RECIPIENT_AUTHORIZATION_REQUIRED/);
  await db.guardianRelationship.update({ where: { id: f.pupilRows[97].relationshipId }, data: { phone: f.pupilRows[97].phone } });
  const failed = job.items.filter(item => item.state === "failed");
  const result = await retry(jobId, failed.map(item => item.id));
  assert.deepEqual(result.counts, { total: 100, queued: 3, running: 0, completed: 97, failed: 0, cancelled: 0 });
  job = await detail(jobId);
  for (const item of job.items.filter(row => row.state === "queued")) await consume(db, { schoolId: f.schoolId, eventId: item.workflow_id! }, ctx => reportDeliveryWorkflow(ctx, async communication => {
    assert.equal(communication.body, `Frozen approved content ${item.version_id}`); sends++;
    return { success: true, messageId: `synthetic386-${item.communication_id}` };
  }));
  assert.equal(sends, 100); assert.equal((await detail(jobId)).counts.completed, 100);
  const audit = await db.auditLog.findFirstOrThrow({ where: { schoolId: f.schoolId, tableName: "activity_jobs", recordId: jobId } });
  assert.equal(audit.campusId, f.campusId); assert.equal((audit.newValue as {reason:string}).reason, "CONFIGURATION_CORRECTED");
  await cancel(jobId);
  process.env.WHATSAPP_PHONE_NUMBER_ID = "synthetic386-phone";
  const receipt = { entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "synthetic386-phone" }, statuses: ["read", "delivered", "failed"].map(status => ({ id: `synthetic386-${deliveries[0].communication.id}`, status, timestamp: String(Math.floor(Date.now()/1000)) })) } }] }] };
  await recordMetaReceipts(receipt); await recordMetaReceipts(receipt);
  job = await detail(jobId);
  assert.equal(job.counts.completed, 100); assert.equal(job.attentionCount, 1);
  const received = job.items.find(item => item.communication_id === deliveries[0].communication.id)!;
  assert.ok(received.delivered_at && received.read_at && received.delivery_failed_at); assert.equal(received.canRetry, false);
  assert.equal(await db.deliveryReceipt.count({ where: { communicationId: received.communication_id! } }), 3);
  assert.equal((await f.scoped(() => listJobs(f.actor))).find(row => row.id === jobId)!.attentionCount, 1);
});

test("current account, role grant, class and tenant deny retained job references", async () => {
  const row = await f.delivery(1); const jobId = await f.track([row.communication]);
  const teacher = (await resolveCurrentPrincipal({ schoolId:f.schoolId,userId:f.users.TEACHER }))!;
  assert.equal((await f.scoped(() => readJob(teacher, jobId))).canEdit, false);
  await assert.rejects(f.scoped(() => operateJob(teacher, jobId, "cancel", [], "NO_LONGER_REQUIRED")), /permissions/);
  await db.class.update({ where: { id:f.classId }, data:{ classTeacherId:null } });
  await assert.rejects(f.scoped(() => readJob(teacher, jobId)), /not found/);
  await db.class.update({ where: { id:f.classId }, data:{ classTeacherId:f.users.TEACHER } });
  const otherCampus = (await resolveCurrentPrincipal({ schoolId:f.schoolId,userId:f.users.CAMPUS_ADMIN }))!;
  await assert.rejects(f.scoped(() => readJob(otherCampus, jobId)), /not found/);
  await assert.rejects(f.scoped(() => readJob({ ...f.actor, schoolId:"foreign-school" }, jobId)), /not found/);
  await db.user.update({ where:{ id:f.actor.userId }, data:{ isActive:false } });
  await assert.rejects(detail(jobId), /Current job access/); await assert.rejects(cancel(jobId), /Current job access/);
  await db.user.update({ where:{ id:f.actor.userId }, data:{ isActive:true } });
  assert.equal((await db.activityJob.findUniqueOrThrow({where:{id:jobId}})).cancelRequestedAt, null);
});

test("fenced external effect rechecks actor and guardian after handler preflight", async () => {
  for (const revoke of ["actor", "guardian", "teacher-class", "publication"] as const) {
    const row = await f.delivery(2); await f.track([row.communication]); let sends = 0;
    if (revoke === "teacher-class") {
      await db.rolePermission.update({ where:{ schoolId_role_module:{ schoolId:f.schoolId, role:"TEACHER", module:"reports" } }, data:{ canEdit:true } });
      await db.workflowEvent.update({ where:{id:row.eventId!}, data:{actorId:f.users.TEACHER} });
    }
    await consume(db, { schoolId:f.schoolId,eventId:row.eventId! }, ctx => reportDeliveryWorkflow({ ...ctx, external: async (identity, authorize, send) => {
      if (revoke === "actor") await db.user.update({where:{id:f.actor.userId},data:{isActive:false}});
      if (revoke === "guardian") await db.guardianAccessVersion.update({where:{id:f.pupilRows[2].grantId},data:{permissions:{communication:true,learningRecords:false}}});
      if (revoke === "teacher-class") await db.class.update({where:{id:f.classId},data:{classTeacherId:null}});
      if (revoke === "publication") await db.exam.update({where:{id:f.examId},data:{status:"LOCKED"}});
      return ctx.external(identity, authorize, send);
    } }, async () => { sends++; return {success:true,messageId:randomUUID()}; }));
    assert.equal(sends, 0); assert.equal(await db.workflowEffect.count({where:{jobId:row.eventId!}}), 0);
    assert.equal((await db.workflowJob.findUniqueOrThrow({where:{id:row.eventId!}})).reason,"AUTHORIZATION_OR_PUBLICATION_REVOKED");
    await db.exam.update({where:{id:f.examId},data:{status:"PUBLISHED"}});
    await db.user.update({where:{id:f.actor.userId},data:{isActive:true}});
    await db.guardianAccessVersion.update({where:{id:f.pupilRows[2].grantId},data:{permissions:{communication:true,learningRecords:true}}});
    await db.class.update({where:{id:f.classId},data:{classTeacherId:f.users.TEACHER}});
    await db.rolePermission.update({where:{schoolId_role_module:{schoolId:f.schoolId,role:"TEACHER",module:"reports"}},data:{canEdit:false}});
  }
});

test("concurrent retry preserves workflow identity; invalid contact and superseded version cannot be substituted", async () => {
  const row = await f.delivery(3); const jobId = await f.track([row.communication]);
  await consume(db,{schoolId:f.schoolId,eventId:row.eventId!},reportDeliveryWorkflow);
  const item = (await detail(jobId)).items[0];
  const results = await Promise.allSettled([retry(jobId,[item.id]),retry(jobId,[item.id])]);
  assert.equal(results.filter(value=>value.status==="fulfilled").length,1);
  assert.equal(await db.workflowEvent.count({where:{referenceId:row.communication.id}}),1);
  await consume(db,{schoolId:f.schoolId,eventId:row.eventId!},reportDeliveryWorkflow);
  await db.guardianRelationship.update({where:{id:f.pupilRows[3].relationshipId},data:{status:"REVOKED"}});
  assert.equal((await detail(jobId)).items[0].canRetry,false); await assert.rejects(retry(jobId,[item.id]),/RECIPIENT_AUTHORIZATION_REQUIRED/);
  await db.guardianRelationship.update({where:{id:f.pupilRows[3].relationshipId},data:{status:"ACTIVE"}});
  const original = await db.reportVersion.findUniqueOrThrow({where:{id:f.pupilRows[3].versionId}});
  const newer = await db.reportVersion.create({data:{schoolId:f.schoolId,reportCardId:original.reportCardId,number:2,contentHash:"new-synthetic-version",documentIdentity:randomUUID(),documentBytes:original.documentBytes,snapshot:original.snapshot!,blockers:[],changedSections:[],approvedBy:f.actor.userId,approvedAt:new Date(),publishedAt:new Date()}});
  await db.reportCard.update({where:{id:original.reportCardId},data:{publishedVersionId:newer.id}});
  assert.equal((await detail(jobId)).items[0].retryBlockedReason,"ORIGINAL_VERSION_UNAVAILABLE");
  await assert.rejects(retry(jobId,[item.id]),/ORIGINAL_VERSION_UNAVAILABLE/);
  const unchanged = await db.parentCommunication.findUniqueOrThrow({where:{id:row.communication.id}});
  assert.equal(unchanged.body,row.communication.body); assert.deepEqual(unchanged.metadata,row.communication.metadata);
  const unbound = await f.delivery(4,{guardian:false,status:"NO_RECIPIENT",workflow:false}); const unboundId = await f.track([unbound.communication]);
  assert.equal((await detail(unboundId)).items[0].retryBlockedReason,"RECIPIENT_AUTHORIZATION_REQUIRED");
});

test("in-flight cancellation retains accepted evidence; uncertain provider outcome cannot replay", async () => {
  const row=await f.delivery(5,{channel:"EMAIL"});const jobId=await f.track([row.communication]);
  let started!:()=>void,finish!:()=>void;const began=new Promise<void>(resolve=>started=resolve),release=new Promise<void>(resolve=>finish=resolve);
  const running=consume(db,{schoolId:f.schoolId,eventId:row.eventId!},ctx=>reportDeliveryWorkflow(ctx,async()=>{started();await release;return{success:true,messageId:randomUUID()};}));
  await began;await cancel(jobId);finish();await running;
  let job=await detail(jobId);assert.equal(job.counts.completed,1);assert.ok(job.items[0].accepted_at);assert.ok(job.cancel_requested_at);assert.equal(job.items[0].delivered_at,null);
  // An invalid persisted WhatsApp-style receipt on EMAIL must never imply email delivery/read support.
  const c=await db.parentCommunication.findUniqueOrThrow({where:{id:row.communication.id}});
  await db.deliveryReceipt.create({data:{id:randomUUID(),schoolId:f.schoolId,communicationId:c.id,providerMessageId:c.providerMessageId!,state:"read",occurredAt:new Date()}});
  assert.equal((await detail(jobId)).items[0].read_at,null);
  const unknown=await f.delivery(6);const unknownId=await f.track([unknown.communication]);
  await consume(db,{schoolId:f.schoolId,eventId:unknown.eventId!},ctx=>reportDeliveryWorkflow(ctx,async()=>({success:false,error:"synthetic unknown response"})));
  job=await detail(unknownId);assert.equal(job.items[0].uncertain,true);assert.equal(job.items[0].canRetry,false);
  await assert.rejects(retry(unknownId,[job.items[0].id]),/OUTCOME_UNCERTAIN/);
});

test("PDF crash resumes one original artifact and import is committed once; invalid imports cannot retry", async () => {
  const pdfId=await f.scoped(()=>startPdfJob(f.actor,f.exam));let pdf=await detail(pdfId);const item=pdf.items[0];
  const child=fork("tests/jobs/crash-current-child.ts",[JSON.stringify({schoolId:f.schoolId,eventId:item.workflow_id})],{execArgv:["--import","tsx"],stdio:["ignore","ignore","inherit","ipc"]});
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("Synthetic checkpoint timeout"));},15000);child.once("message",()=>{clearTimeout(timeout);resolve();});child.once("error",reject);});
  child.kill("SIGKILL");await new Promise(resolve=>child.once("exit",resolve));
  await db.workflowJob.update({where:{id:item.workflow_id!},data:{leaseUntil:new Date(Date.now()-1000)}});
  await consume(db,{schoolId:f.schoolId,eventId:item.workflow_id!},processingWorkflow);await consume(db,{schoolId:f.schoolId,eventId:item.workflow_id!},processingWorkflow);
  pdf=await detail(pdfId);assert.equal(pdf.counts.completed,1);assert.equal(await db.workflowEffect.count({where:{jobId:item.workflow_id!}}),1);
  const done=pdf.items.find(row=>row.id===item.id)!;assert.equal(done.version_id,item.version_id);assert.ok((done.result as {url:string}).url.includes(item.version_id!));
  await cancel(pdfId);assert.equal((await detail(pdfId)).counts.cancelled,99);
  const payload={csv:"transaction_date,amount,description\n2026-10-08,1500,Synthetic payment",fileName:"synthetic386.csv",accountName:"Synthetic account",statementFrom:"2026-10-01",statementTo:"2026-10-08",currency:"PKR",campusId:f.campusId};
  const importId=await f.scoped(()=>startImportJob(f.actor,f.campusId,payload));const imported=await detail(importId);
  await consume(db,{schoolId:f.schoolId,eventId:imported.items[0].workflow_id!},processingWorkflow);await consume(db,{schoolId:f.schoolId,eventId:imported.items[0].workflow_id!},processingWorkflow);
  assert.equal((await detail(importId)).counts.completed,1);assert.equal(await db.bankReconciliation.count({where:{schoolId:f.schoolId}}),1);
  assert.deepEqual((await detail(importId)).items[0].result,{totalTransactions:1,matched:0,unmatched:1});
  const invalidId=await f.scoped(()=>startImportJob(f.actor,f.campusId,{...payload,csv:"wrong,headers\na,b"}));const invalid=await detail(invalidId);
  await consume(db,{schoolId:f.schoolId,eventId:invalid.items[0].workflow_id!},processingWorkflow);
  const invalidItem=(await detail(invalidId)).items[0];assert.equal(invalidItem.category,"invalid_file");assert.equal(invalidItem.canRetry,false);
  await assert.rejects(retry(invalidId,[invalidItem.id]),/SOURCE_CORRECTION_REQUIRED/);
});


test("processing effect rejects access revoked after rendering and import preparation", async () => {
  const pdfId = await f.scoped(() => startPdfJob(f.actor, f.exam));
  // The existing PDF batch is cancelled; use a new exam so the independent boundary is executable.
  const examId = randomUUID(), row = f.pupilRows[7], reportId = randomUUID(), versionId = randomUUID();
  await db.exam.create({data:{id:examId,schoolId:f.schoolId,campusId:f.campusId,classId:f.classId,title:"Synthetic effect boundary",term:"Term 2",academicYear:2026,status:"PUBLISHED",isLocked:true}});
  await db.reportCard.create({data:{id:reportId,schoolId:f.schoolId,campusId:f.campusId,studentId:row.studentId,examId,status:"PUBLISHED"}});
  await db.reportVersion.create({data:{id:versionId,schoolId:f.schoolId,reportCardId:reportId,number:1,contentHash:"boundary",documentIdentity:randomUUID(),documentBytes:Buffer.from("synthetic approved bytes"),snapshot:{fixture:true},blockers:[],changedSections:[],approvedBy:f.actor.userId,approvedAt:new Date(),publishedAt:new Date()}});
  await db.reportCard.update({where:{id:reportId},data:{publishedVersionId:versionId}});
  const freshPdfId=await f.scoped(()=>startPdfJob(f.actor,{...f.exam,id:examId,title:"Synthetic effect boundary"}));
  assert.notEqual(pdfId,freshPdfId);
  const freshPdf=await detail(freshPdfId), item=freshPdf.items[0];
  await consume(db,{schoolId:f.schoolId,eventId:item.workflow_id!},ctx=>processingWorkflow({...ctx,effect:async(identity,apply)=>{
    await db.user.update({where:{id:f.actor.userId},data:{isActive:false}});
    return ctx.effect(identity,apply);
  }}));
  await db.user.update({where:{id:f.actor.userId},data:{isActive:true}});
  assert.equal(await db.workflowEffect.count({where:{jobId:item.workflow_id!}}),0);
  assert.equal((await detail(freshPdfId)).counts.completed,0);
  const importId=await f.scoped(()=>startImportJob(f.actor,f.campusId,{csv:"transaction_date,amount,description\n2026-10-08,1500,Synthetic boundary",fileName:"boundary.csv",accountName:"Synthetic boundary",statementFrom:"2026-10-01",statementTo:"2026-10-08",currency:"PKR",campusId:f.campusId}));
  const importItem=(await detail(importId)).items[0];
  const prior=await db.bankReconciliation.count({where:{schoolId:f.schoolId}});
  await consume(db,{schoolId:f.schoolId,eventId:importItem.workflow_id!},ctx=>processingWorkflow({...ctx,effect:async(identity,apply)=>{
    await db.rolePermission.create({data:{schoolId:f.schoolId,role:"PRINCIPAL",module:"fees",canView:true,canEdit:true,canAdd:false}});
    return ctx.effect(identity,apply);
  }}));
  await db.rolePermission.deleteMany({where:{schoolId:f.schoolId,role:"PRINCIPAL",module:"fees"}});
  assert.equal(await db.bankReconciliation.count({where:{schoolId:f.schoolId}}),prior);
  assert.equal(await db.workflowEffect.count({where:{jobId:importItem.workflow_id!}}),0);
});


test("unsupported report channels stop before provider effects and cannot advertise retry", async () => {
  const row = await f.delivery(8,{channel:"SMS"}), jobId=await f.track([row.communication]);let sends=0;
  await consume(db,{schoolId:f.schoolId,eventId:row.eventId!},ctx=>reportDeliveryWorkflow(ctx,async()=>{sends++;return{success:true,messageId:"must-not-send"};}));
  assert.equal(sends,0);assert.equal(await db.workflowEffect.count({where:{jobId:row.eventId!}}),0);
  const job=await detail(jobId);assert.equal(job.items[0].canRetry,false);assert.equal(job.items[0].reason,"UNKNOWN_EVENT_KIND");
});


test("import retry checks the current add grant before queuing while cancellation remains available", async () => {
  const payload={csv:"transaction_date,amount,description\n2026-10-08,1500,Synthetic retry grant",fileName:"retry-grant.csv",accountName:"Synthetic retry grant",statementFrom:"2026-10-01",statementTo:"2026-10-08",currency:"PKR",campusId:f.campusId};
  const jobId=await f.scoped(()=>startImportJob(f.actor,f.campusId,payload));
  const item=(await detail(jobId)).items[0];
  await db.workflowJob.update({where:{id:item.workflow_id!},data:{state:"failed",reason:"WORKER_FAILURE"}});
  await db.rolePermission.create({data:{schoolId:f.schoolId,role:"PRINCIPAL",module:"fees",canView:true,canEdit:true,canAdd:false}});
  let job=await detail(jobId);assert.equal(job.canEdit,true);assert.equal(job.items[0].canRetry,false);assert.equal(job.items[0].retryBlockedReason,"AUTHORIZATION_REQUIRED");
  await assert.rejects(retry(jobId,[item.id]),/AUTHORIZATION_REQUIRED/);
  assert.equal((await db.workflowJob.findUniqueOrThrow({where:{id:item.workflow_id!}})).state,"failed");
  assert.equal(await db.auditLog.count({where:{schoolId:f.schoolId,recordId:jobId}}),0);
  await db.rolePermission.update({where:{schoolId_role_module:{schoolId:f.schoolId,role:"PRINCIPAL",module:"fees"}},data:{canAdd:true}});
  job=await detail(jobId);assert.equal(job.items[0].canRetry,true);await retry(jobId,[item.id]);assert.equal((await detail(jobId)).counts.queued,1);
  await db.rolePermission.update({where:{schoolId_role_module:{schoolId:f.schoolId,role:"PRINCIPAL",module:"fees"}},data:{canAdd:false}});
  await cancel(jobId);assert.equal((await detail(jobId)).counts.cancelled,1);
  await db.rolePermission.deleteMany({where:{schoolId:f.schoolId,role:"PRINCIPAL",module:"fees"}});
});
