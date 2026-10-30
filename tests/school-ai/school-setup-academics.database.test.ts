import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createCampusSubjects } from "../../src/lib/academic/subject-write";
import { withSchedulingResourceWrite } from "../../src/lib/academic/resource-write";
import { inspectHolidayRange, inspectWeekendChange } from "../../src/lib/academic/calendar-write";
import { updateSubjectWithTeacherAssignment } from "../../src/lib/api/teacher-assignments";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { previewSchoolAiExecution, executeSchoolAiTool, listSchoolAiExecutions } from "../../src/lib/school-ai/execution";
import { getSchoolSetupOptions } from "../../src/lib/school-ai/school-setup-service";
import type { SchoolSetupProposal, SchoolSetupPreview } from "../../src/lib/school-ai/school-setup";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated PG55438 only.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.schoolAiSubstituteDuty.deleteMany({ where: { schoolId: { in: schoolIds } } }); await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const schoolId = `setup-academics-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), userId = randomUUID(), oldTeacherId = randomUUID(), newTeacherId = randomUUID(); schoolIds.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic academic setup", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Academic campus", regId: campusId, city: "Test" } });
  await db.user.createMany({ data: [{ id: userId, schoolId, campusId, fullName: "Reviewer", email: `${userId}@example.invalid`, role: "CAMPUS_ADMIN" }, ...[oldTeacherId,newTeacherId].map((id,index) => ({ id, schoolId, campusId, fullName: index ? "New teacher" : "Existing teacher", email: `${id}@example.invalid`, role: "TEACHER" as const, isActive: true }))] });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", academicYear: 2026, teachingMode: "SINGLE", classTeacherId: oldTeacherId } });
  const cycle = await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "Academic 2026", status: "ACTIVE", startDate: new Date("2026-01-01Z"), endDate: new Date("2026-12-31Z") } });
  const user: AuthUser = { userId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid`, accessVersion: 0 };
  return { schoolId, campusId, classId, cycle, oldTeacherId, newTeacherId, user };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function school(run: (f: Fixture) => Promise<void>) { const f = await fixture(); try { await run(f); } finally { await db.schoolAiSubstituteDuty.deleteMany({ where: { schoolId: f.schoolId } }); await db.school.delete({ where: { id: f.schoolId } }); } }
const asUser = <T>(f: Fixture, fn: () => Promise<T>) => runWithTenantContext({ schoolId: f.schoolId, campusId: f.campusId, userId: f.user.userId, role: f.user.role }, fn);
const base = { operation: "setup.apply_changes" as const, sourceReference: "Verified academic register" };
const subjects = (f: Fixture): SchoolSetupProposal => ({ ...base, action: "SUBJECTS", rows: [{ classId: f.classId, subjectName: "Mathematics", totalMarks: 100 }] });
const allocation = (f: Fixture, subjectId?: string): SchoolSetupProposal => ({ ...base, action: "TEACHER_ALLOCATIONS", rows: [subjectId ? { allocationType: "SUBJECT", subjectId, expectedTeacherId: f.oldTeacherId, teacherId: f.newTeacherId } : { allocationType: "CLASS", classId: f.classId, expectedTeacherId: f.oldTeacherId, teacherId: f.newTeacherId }] });
const holiday = (): SchoolSetupProposal => ({ ...base, action: "HOLIDAYS", rows: [{ calendarAction: "CREATE", academicYear: 2026, holidayName: "Winter break", fromDate: "2026-12-20", toDate: "2026-12-25" }] });
const weekend = (mondayClosed=false): SchoolSetupProposal => ({ ...base, action: "WEEKENDS", rows: [{ mondayClosed, tuesdayClosed: false, wednesdayClosed: false, thursdayClosed: false, fridayClosed: true, saturdayClosed: false, sundayClosed: false }] });
async function approved(f: Fixture, proposal: SchoolSetupProposal) { const record = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", campusId: f.campusId, title: proposal.action, idempotencyKey: randomUUID(), data: { goal: "Reviewed setup", steps: [{ id: "setup", title: "Review exact changes", status: "ready", module: ["SUBJECTS","TEACHER_ALLOCATIONS"].includes(proposal.action) ? "exams" : "timetable" }], sourceIds: [], missingInformation: [], proposal } }); return updateWorkspaceRecord(f.user, record.id, { action: "approve", version: record.version }); }
const input = (p: SchoolSetupPreview) => ({ operation: "setup.apply_changes" as const, version: p.version, previewHash: p.previewHash, idempotencyKey: randomUUID() });
async function plan(f: Fixture, proposal: SchoolSetupProposal) { const record = await approved(f, proposal), preview = await previewSchoolAiExecution(f.user, record.id, "setup.apply_changes", record.version); return { record, preview, request: input(preview) }; }
async function execute(f: Fixture, proposal: SchoolSetupProposal) { const p = await plan(f,proposal); return { ...p, receipt: await executeSchoolAiTool(f.user,p.record.id,p.request) }; }
async function board(f: Fixture) { const subject = await db.subject.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, name: "Mathematics", teacherId: f.oldTeacherId } }); const timetable = await db.timetable.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, academicYear: 2026, status: "PUBLISHED", term: "TERM_1", slots: { create: { schoolId: f.schoolId, subjectId: subject.id, teacherId: f.oldTeacherId, dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", slotType: "CLASS" } } }, include: { slots: true } }); return { subject, timetable }; }
test("subject creation inherits SINGLE teacher, replay is exact, and conflicting marks never overwrite", () => school(async f => {
  const result = await execute(f,subjects(f)); assert.equal(result.receipt.createdCount,1); assert.equal(result.preview.rows[0].changes?.[0].after,"Existing teacher"); assert.deepEqual(await executeSchoolAiTool(f.user,result.record.id,result.request),result.receipt);
  const subject = await db.subject.findFirstOrThrow({ where: { schoolId: f.schoolId } }); assert.equal(subject.teacherId,f.oldTeacherId); assert.equal((await execute(f,subjects(f))).receipt.keptCount,1);
  await db.subject.update({ where: { id: subject.id }, data: { totalMarks: 50 } }); await assert.rejects(() => plan(f,subjects(f)), { code: "SETUP_SUBJECT_CONFLICT" });
  const options = await getSchoolSetupOptions(f.user,f.campusId); assert.ok(options.subjects[0].label.includes("Mathematics")); assert.deepEqual(options.teachers.map(row => row.label).sort(),["Existing teacher","New teacher"]); assert.ok(options.academicYears[0].label.includes("2026"));
}));
test("manual subject creation and reviewed creation cannot duplicate one normalized identity", () => school(async f => {
  const p = await plan(f,subjects(f)); const results = await Promise.allSettled([executeSchoolAiTool(f.user,p.record.id,p.request),asUser(f,() => createCampusSubjects(f.user,{ classId: f.classId, name: "mathematics", totalMarks:100 }))]); assert.equal(results.filter(row => row.status === "fulfilled").length,1); assert.equal(await db.subject.count({ where: { schoolId:f.schoolId }}),1);
}));
test("academic setup rejects inactive scope, foreign teachers and missing cycle bounds", () => school(async f => {
  await db.academicCycle.update({ where: {id:f.cycle.id}, data:{status:"CLOSED"} }); await assert.rejects(() => plan(f,subjects(f)),{code:"SETUP_ACADEMIC_SCOPE"}); await db.academicCycle.update({where:{id:f.cycle.id},data:{status:"ACTIVE",startDate:null}}); await assert.rejects(() => plan(f,holiday()),{code:"SETUP_ACADEMIC_SCOPE"});
  const b=await board(f); await db.user.update({where:{id:f.newTeacherId},data:{isActive:false}}); await assert.rejects(() => plan(f,allocation(f,b.subject.id)),{code:"SETUP_TEACHER_UNAVAILABLE"});
  const campusId=randomUUID(); await db.campus.create({data:{id:campusId,schoolId:f.schoolId,name:"Other",regId:campusId,city:"Test"}}); await db.user.update({where:{id:f.newTeacherId},data:{isActive:true,campusId}}); await assert.rejects(() => plan(f,allocation(f,b.subject.id)),{code:"SETUP_TEACHER_UNAVAILABLE"});
}));
test("reviewed SINGLE allocation shows every subject then atomically synchronizes published lessons", () => school(async f => {
  const b=await board(f); await db.subject.create({data:{schoolId:f.schoolId,campusId:f.campusId,classId:f.classId,name:"Science",teacherId:f.oldTeacherId}});
  const result=await execute(f,allocation(f)); assert.equal(result.preview.rows[0].disposition,"UPDATE"); assert.equal(result.preview.rows[0].changes?.length,3); assert.equal(result.preview.rows[0].synchronizedSlots,1); assert.equal((await db.class.findUniqueOrThrow({where:{id:f.classId}})).classTeacherId,f.newTeacherId); assert.ok((await db.subject.findMany({where:{classId:f.classId}})).every(row=>row.teacherId===f.newTeacherId)); assert.equal((await db.timetableSlot.findUniqueOrThrow({where:{id:b.timetable.slots[0].id}})).teacherId,f.newTeacherId);
}));
test("teacher expected identity and live snapshot prevent silent overwrite of manual assignment", () => school(async f => {
  const b=await board(f), p=await plan(f,allocation(f,b.subject.id)); await asUser(f,()=>updateSubjectWithTeacherAssignment(f.user,{id:b.subject.id,teacherId:f.newTeacherId})); await assert.rejects(()=>executeSchoolAiTool(f.user,p.record.id,p.request),{code:"SETUP_TEACHER_CHANGED"}); assert.equal(await db.schoolAiExecution.count({where:{recordId:p.record.id}}),0);
}));
test("teacher collisions block preview and preserve all assignments", () => school(async f => {
  const b=await board(f), cls=await db.class.create({data:{schoolId:f.schoolId,campusId:f.campusId,name:"Competing class",academicYear:2026}}), subject=await db.subject.create({data:{schoolId:f.schoolId,campusId:f.campusId,classId:cls.id,name:"Science",teacherId:f.newTeacherId}});
  await db.timetable.create({data:{schoolId:f.schoolId,campusId:f.campusId,classId:cls.id,academicYear:2026,status:"PUBLISHED",term:"TERM_1",slots:{create:{schoolId:f.schoolId,subjectId:subject.id,teacherId:f.newTeacherId,dayOfWeek:1,periodNumber:5,startTime:"08:20",endTime:"09:00",slotType:"CLASS"}}}}); await assert.rejects(()=>plan(f,allocation(f,b.subject.id)),{code:"SETUP_SCHEDULE_CONFLICT"}); assert.equal((await db.subject.findUniqueOrThrow({where:{id:b.subject.id}})).teacherId,f.oldTeacherId);
}));
test("holiday create, explicit update and deletion retain exact reviewed before and after values", () => school(async f => {
  const created=await execute(f,holiday()), id=created.receipt.rows[0].id; assert.equal((await execute(f,holiday())).receipt.keptCount,1);
  const update:SchoolSetupProposal={...base,action:"HOLIDAYS",rows:[{calendarAction:"UPDATE",academicYear:2026,holidayId:id,holidayName:"Winter break extended",fromDate:"2026-12-20",toDate:"2026-12-27"}]}; const changed=await execute(f,update); assert.equal(changed.preview.rows[0].changes?.[2].before,"2026-12-25"); assert.equal(changed.receipt.rows[0].changes?.[2].after,"2026-12-27"); assert.equal((await db.holiday.findUniqueOrThrow({where:{id}})).name,"Winter break extended");
  const deleted=await execute(f,{...base,action:"HOLIDAYS",rows:[{calendarAction:"DELETE",academicYear:2026,holidayId:id}]}); assert.equal(deleted.receipt.rows[0].disposition,"DELETE"); assert.equal(await db.holiday.findUnique({where:{id}}),null);
}));
test("holiday calendar bounds, booked exams and stale manual writes prevent application", () => school(async f => {
  const p=await plan(f,holiday()); await withSchedulingResourceWrite(f.user,f.campusId,"timetable","add",async tx=>{await inspectHolidayRange(tx,{schoolId:f.schoolId,campusId:f.campusId},new Date("2026-12-28Z"),new Date("2026-12-28Z")); return tx.holiday.create({data:{schoolId:f.schoolId,campusId:f.campusId,name:"Manual closure",fromDate:new Date("2026-12-28Z"),toDate:new Date("2026-12-28Z")}});}); await assert.rejects(()=>executeSchoolAiTool(f.user,p.record.id,p.request),{code:"STALE_EXECUTION_PREVIEW"});
  const b=await board(f),exam=await db.exam.create({data:{schoolId:f.schoolId,campusId:f.campusId,classId:f.classId,title:"Winter exam",academicYear:2026,term:"TERM_1"}}); await db.examSchedule.create({data:{schoolId:f.schoolId,campusId:f.campusId,examId:exam.id,subjectId:b.subject.id,date:new Date("2026-12-22Z")}}); await assert.rejects(()=>plan(f,holiday()),{code:"SETUP_CALENDAR_CONFLICT"});
  await assert.rejects(()=>plan(f,{...base,action:"HOLIDAYS",rows:[{calendarAction:"CREATE",academicYear:2026,holidayName:"Out of scope",fromDate:"2027-01-01",toDate:"2027-01-02"}]}),{code:"SETUP_ACADEMIC_SCOPE"});
}));
test("reviewed weekends protect lessons and policy overrides and write one usable closed-day set", () => school(async f => {
  await board(f); await assert.rejects(()=>plan(f,weekend(true)),{code:"SETUP_CALENDAR_CONFLICT"}); const changed=await execute(f,weekend()); assert.equal(changed.preview.rows[0].changes?.length,7); assert.deepEqual((await db.weekend.findMany({where:{schoolId:f.schoolId}})).map(row=>row.dayOfWeek),[5]); assert.equal((await execute(f,weekend())).receipt.keptCount,1);
  await db.localePolicy.create({data:{schoolId:f.schoolId,campusId:f.campusId,scopeKey:f.campusId,status:"ACTIVE",effectiveAt:new Date("2026-01-01Z"),createdBy:f.user.userId,settings:{weekend:[5]}}}); await assert.rejects(()=>plan(f,weekend()),{code:"SETUP_CALENDAR_CONFLICT"}); await assert.rejects(()=>withSchedulingResourceWrite(f.user,f.campusId,"timetable","edit",tx=>inspectWeekendChange(tx,{schoolId:f.schoolId,campusId:f.campusId},[7])),{status:409});
}));
test("revoked academic grants hide options and deny history even after the record changes to rooms", () => school(async f => {
  const result=await execute(f,subjects(f)); const current=await updateWorkspaceRecord(f.user,result.record.id,{action:"save",version:result.record.version,data:{...result.record.data,steps:[{id:"setup",title:"Rooms",status:"ready",module:"timetable"}],proposal:{...base,action:"ROOMS",rows:[{roomNumber:"Room A",roomType:"CLASSROOM",rows:4,benchesPerRow:5,seatsPerBench:2,examSeatsPerBench:1,building:""}]}}}); assert.ok(current.version>result.record.version);
  await db.rolePermission.create({data:{schoolId:f.schoolId,role:f.user.role,module:"exams",canView:false,canAdd:false,canEdit:false}}); assert.deepEqual((await getSchoolSetupOptions(f.user,f.campusId)).subjects,[]); assert.deepEqual(await listSchoolAiExecutions(f.user,result.record.id),[]); await assert.rejects(()=>executeSchoolAiTool(f.user,result.record.id,result.request),{status:403});
}));
test("dated substitute cover blocks both changed lesson teachers and holiday or weekend closures", () => school(async f => {
  const b = await board(f), date = new Date(Date.now() + 7 * 86400000); while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1); const dateText = date.toISOString().slice(0,10);
  await db.schoolAiSubstituteDuty.create({ data: { schoolId:f.schoolId, campusId:f.campusId, timetableSlotId:b.timetable.slots[0].id, date:new Date(dateText), originalTeacherId:f.oldTeacherId, teacherId:f.newTeacherId, reason:"Approved absence cover", assignedById:f.user.userId } });
  await assert.rejects(() => plan(f,allocation(f,b.subject.id)),{code:"SETUP_SCHEDULE_CONFLICT"});
  await assert.rejects(() => withSchedulingResourceWrite(f.user,f.campusId,"timetable","add",tx=>inspectHolidayRange(tx,{schoolId:f.schoolId,campusId:f.campusId},new Date(dateText),new Date(dateText))),{status:409});
  await db.timetable.update({ where:{id:b.timetable.id}, data:{status:"DRAFT"} }); await assert.rejects(() => plan(f,weekend(true)),{code:"SETUP_CALENDAR_CONFLICT"});
  assert.equal((await db.subject.findUniqueOrThrow({where:{id:b.subject.id}})).teacherId,f.oldTeacherId); assert.equal(await db.holiday.count({where:{schoolId:f.schoolId}}),0);
}));
test("holiday batches cannot create duplicate names with different dates or evade delete permission", () => school(async f => {
  await assert.rejects(() => plan(f,{...base,action:"HOLIDAYS",rows:[{calendarAction:"CREATE",academicYear:2026,holidayName:"Winter break",fromDate:"2026-12-20",toDate:"2026-12-25"},{calendarAction:"CREATE",academicYear:2026,holidayName:"WINTER BREAK",fromDate:"2026-12-26",toDate:"2026-12-27"}]}),{code:"SETUP_CALENDAR_IDENTITY"});
  const result=await execute(f,holiday()), id=result.receipt.rows[0].id, deletion=await plan(f,{...base,action:"HOLIDAYS",rows:[{calendarAction:"DELETE",academicYear:2026,holidayId:id}]});
  await db.rolePermission.create({data:{schoolId:f.schoolId,role:f.user.role,module:"timetable",canView:true,canAdd:true,canEdit:true,canDelete:false}}); await assert.rejects(()=>executeSchoolAiTool(f.user,deletion.record.id,deletion.request),{status:403}); assert.ok(await db.holiday.findUnique({where:{id}}));
}));
