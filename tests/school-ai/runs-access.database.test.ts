import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { BillingAccessError } from "../../src/lib/billing/entitlements";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { previewSchoolAiExecution, type SchoolAiOperation } from "../../src/lib/school-ai/execution";
import { createSchoolRun, listSchoolRuns, processSchoolRun, updateSchoolRun, sweepSchoolRuns } from "../../src/lib/school-ai/run-service";
import { inspectRiskEvidence } from "../../src/lib/school-ai/school-operations-risk-service";
import { assessmentFixture } from "./assessment-fixture";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated synthetic School AI PostgreSQL only.");
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const schoolId = `run-access-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  const user: AuthUser = { userId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid`, accessVersion: 0 };
  await db.school.create({ data: { id: schoolId, name: "Synthetic run access", slug: schoolId, regId: schoolId, contactEmail: user.email, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, role: user.role, email: user.email, fullName: "Run reviewer" } });
  return { schoolId, campusId, user };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function school(work: (f: Fixture) => Promise<void>) { const f=await fixture(); try { await work(f); } finally { await db.school.delete({ where: { id:f.schoolId } }); } }
async function approved(f:Fixture, proposal:Record<string,unknown>, title="Reviewed restricted work") {
  const record=await createWorkspaceRecord(f.user,{kind:"WORKFLOW",campusId:f.campusId,title,idempotencyKey:randomUUID(),data:{goal:title,steps:[{id:"step",title:"Review exact changes",status:"ready",module:"school"}],sourceIds:[],missingInformation:[],proposal}});
  return updateWorkspaceRecord(f.user,record.id,{version:record.version,action:"approve"});
}
async function queue(f:Fixture, record:{id:string;version:number}, operation:SchoolAiOperation) {
  const preview=await previewSchoolAiExecution(f.user,record.id,operation,record.version), payload={title:"Restricted reviewed run",campusId:f.campusId,steps:[{recordId:record.id,version:record.version,operation,previewHash:preview.previewHash}],scheduledAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),idempotencyKey:randomUUID()};
  return {payload,run:await createSchoolRun(f.user,payload)};
}
const academic = () => ({ operation:"academics.setup_year",academicYear:2026,label:"Academic 2026",startDate:null,endDate:null,classes:[{id:randomUUID(),name:"Grade 8",section:null,teachingMode:"SINGLE"}] });

test("billing 402 durably blocks the oldest twenty runs and later active-school work advances on the next sweep",async()=>{
  const suspended=await fixture(), active=await fixture();
  try {
    const record=await approved(suspended,academic()), prepared=await queue(suspended,record,"academics.setup_year"), ids=[prepared.run.id];
    // A full worker page of authorized, reviewed jobs becomes unavailable together.
    for(let i=1;i<20;i++) ids.push((await createSchoolRun(suspended.user,{...prepared.payload,idempotencyKey:randomUUID()})).id);
    await db.schoolAiRun.updateMany({where:{id:{in:ids}},data:{scheduledAt:new Date(Date.now()-29*86400000)}});
    const activeRecord=await approved(active,academic()), later=await queue(active,activeRecord,"academics.setup_year");
    await db.school.update({where:{id:suspended.schoolId},data:{status:"SUSPENDED"}});
    await sweepSchoolRuns(db,20);
    const blocked=await db.schoolAiRun.findMany({where:{id:{in:ids}}}); assert.equal(blocked.length,20); assert.ok(blocked.every(row=>row.status==="BLOCKED"&&row.errorCode==="BILLING_REVIEW_REQUIRED"&&row.nextStep===0));
    assert.equal(await db.schoolAiExecution.count({where:{schoolId:suspended.schoolId}}),0); assert.equal(await db.class.count({where:{schoolId:suspended.schoolId}}),0); assert.equal((await db.schoolAiRun.findUniqueOrThrow({where:{id:later.run.id}})).status,"QUEUED");
    assert.equal(await db.auditLog.count({where:{schoolId:suspended.schoolId,tableName:"school_ai_runs",newValue:{path:["action"],equals:"BLOCKED"}}}),20);
    await sweepSchoolRuns(db,20); assert.equal((await db.schoolAiRun.findUniqueOrThrow({where:{id:later.run.id}})).status,"COMPLETED"); assert.equal(await db.schoolAiExecution.count({where:{schoolId:active.schoolId}}),1);
    await db.school.update({where:{id:suspended.schoolId},data:{status:"ACTIVE"}}); await assert.rejects(()=>updateSchoolRun(suspended.user,ids[0],{version:blocked[0].version,action:"resume"}),{status:409});
  } finally { await db.school.deleteMany({where:{id:{in:[suspended.schoolId,active.schoolId]}}}); }
});

test("direct billing failure preserves a review-required reason without masking the original error",()=>school(async f=>{
  const record=await approved(f,academic()), prepared=await queue(f,record,"academics.setup_year"); await db.school.update({where:{id:f.schoolId},data:{status:"SUSPENDED"}});
  await assert.rejects(()=>processSchoolRun(f.user,prepared.run.id),error=>error instanceof BillingAccessError&&error.status===402); const saved=await db.schoolAiRun.findUniqueOrThrow({where:{id:prepared.run.id}}); assert.equal(saved.status,"BLOCKED"); assert.equal(saved.errorCode,"BILLING_REVIEW_REQUIRED"); assert.deepEqual(saved.receipts,[]);
}));

test("risk run titles, pinned steps and receipts stay hidden when the original indicator grants are revoked after an edit",()=>school(async f=>{
  const cls=await db.class.create({data:{schoolId:f.schoolId,campusId:f.campusId,name:"Restricted attendance class",academicYear:2026}}), cycle=await db.academicCycle.create({data:{schoolId:f.schoolId,campusId:f.campusId,academicYear:2026,label:"Current result year",status:"ACTIVE"}});
  const evidence=await inspectRiskEvidence(f.user,{campusId:f.campusId,indicator:"ATTENDANCE_GAPS",scopeId:cls.id,date:"2026-10-05"}), proposal={operation:"operations.record_risk_decision",indicator:"ATTENDANCE_GAPS",scopeId:cls.id,date:"2026-10-05",evidenceHash:evidence.evidenceHash,ownerId:f.user.userId,dueDate:"2099-10-05",decision:"ACTION",note:"Review this class's observed attendance gaps."}, record=await approved(f,proposal), prepared=await queue(f,record,"operations.record_risk_decision");
  const completed=await processSchoolRun(f.user,prepared.run.id); assert.equal(completed?.status,"COMPLETED"); assert.equal(completed?.receipts.length,1);
  await updateWorkspaceRecord(f.user,record.id,{version:record.version,action:"save",data:{...record.data,proposal:{...proposal,indicator:"UNRELEASED_RESULTS",scopeId:cycle.id}}}); assert.equal((await createSchoolRun(f.user,prepared.payload)).id,prepared.run.id);
  const grant=await db.rolePermission.create({data:{schoolId:f.schoolId,role:f.user.role,module:"attendance",canView:false,canAdd:false,canEdit:false}});
  assert.deepEqual(await listSchoolRuns(f.user,f.campusId),[]); await assert.rejects(()=>createSchoolRun(f.user,prepared.payload),{status:403}); await assert.rejects(()=>updateSchoolRun(f.user,prepared.run.id,{version:completed!.version,action:"cancel"}),{status:403});
  await db.rolePermission.delete({where:{id:grant.id}}); assert.equal((await createSchoolRun(f.user,prepared.payload)).id,prepared.run.id); assert.equal((await listSchoolRuns(f.user,f.campusId))[0].receipts.length,1); assert.equal(await db.schoolAiExecution.count({where:{recordId:record.id}}),1);
}));

test("migration runs retain original financial authorization after their current setup action becomes rooms",()=>school(async f=>{
  const source=await createWorkspaceRecord(f.user,{kind:"SOURCE",campusId:f.campusId,title:"Signed migration manifest",idempotencyKey:randomUUID(),data:{origin:"manual",documentKind:"other",fileName:"totals.txt",mimeType:"text/plain",extractedText:"Reviewed source totals: one active staff member, zero students, invitations, guardians, rooms and periods."}}); await updateWorkspaceRecord(f.user,source.id,{version:source.version,action:"approve"});
  const proposal={operation:"setup.apply_changes",action:"MIGRATION_CUTOVER",sourceReference:"Signed source totals",sourceIds:[source.id],rows:[{dataset:"STUDENTS",expectedCount:0},{dataset:"STAFF_ACTIVE",expectedCount:1},...["STAFF_PENDING","GUARDIANS","ROOMS","PERIODS"].map(dataset=>({dataset,expectedCount:0}))]},record=await approved(f,proposal),prepared=await queue(f,record,"setup.apply_changes");
  const completed=await processSchoolRun(f.user,prepared.run.id); assert.equal(completed?.status,"COMPLETED");
  await updateWorkspaceRecord(f.user,record.id,{version:record.version,action:"save",data:{...record.data,proposal:{operation:"setup.apply_changes",action:"ROOMS",sourceReference:"Reviewed room plan",rows:[{roomNumber:"Room A",roomType:"CLASSROOM",rows:4,benchesPerRow:5,seatsPerBench:2,examSeatsPerBench:1,building:""}]}}});
  assert.equal((await createSchoolRun(f.user,prepared.payload)).id,prepared.run.id);
  const grant=await db.rolePermission.create({data:{schoolId:f.schoolId,role:f.user.role,module:"accounts",canView:false,canAdd:true,canEdit:true}}); assert.deepEqual(await listSchoolRuns(f.user,f.campusId),[]); await assert.rejects(()=>createSchoolRun(f.user,prepared.payload),{status:403}); await assert.rejects(()=>updateSchoolRun(f.user,prepared.run.id,{version:completed!.version,action:"pause"}),{status:403});
  await db.rolePermission.delete({where:{id:grant.id}}); assert.equal((await createSchoolRun(f.user,prepared.payload)).id,prepared.run.id); assert.equal((await listSchoolRuns(f.user,f.campusId))[0].receipts.length,1);
}));

test("a replaced curriculum scope does not expose a pinned run after the original subject leaves the campus",()=>school(async f=>{
  const classes=await Promise.all(["Original class","Current class"].map(name=>db.class.create({data:{schoolId:f.schoolId,campusId:f.campusId,name,academicYear:2026}}))),subjects=await Promise.all(classes.map(cls=>db.subject.create({data:{schoolId:f.schoolId,campusId:f.campusId,classId:cls.id,name:"Mathematics"}})));
  const data=assessmentFixture(subjects[0].id,classes[0].id).curriculum, draft=await createWorkspaceRecord(f.user,{kind:"CURRICULUM",title:"Restricted original curriculum",campusId:f.campusId,data,idempotencyKey:randomUUID()}),record=await updateWorkspaceRecord(f.user,draft.id,{version:draft.version,action:"approve"}),prepared=await queue(f,record,"curriculum.import_topics"); assert.equal((await processSchoolRun(f.user,prepared.run.id))?.status,"COMPLETED");
  await updateWorkspaceRecord(f.user,record.id,{version:record.version,action:"save",data:{...data,subjectId:subjects[1].id,classId:classes[1].id}}); assert.equal((await createSchoolRun(f.user,prepared.payload)).id,prepared.run.id);
  const otherCampus=await db.campus.create({data:{schoolId:f.schoolId,name:"Other campus",city:"Test",regId:randomUUID()}}); await db.class.update({where:{id:classes[0].id},data:{campusId:otherCampus.id}}); await db.subject.update({where:{id:subjects[0].id},data:{campusId:otherCampus.id}});
  assert.deepEqual(await listSchoolRuns(f.user,f.campusId),[]); await assert.rejects(()=>createSchoolRun(f.user,prepared.payload),{status:403}); assert.equal(await db.schoolAiExecution.count({where:{recordId:record.id}}),1);
}));
