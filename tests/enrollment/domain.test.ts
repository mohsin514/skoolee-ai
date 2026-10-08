import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { applyEnrollment, dateOnly } from "../../src/lib/students/enrollment";
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
if(url.hostname!=="127.0.0.1" || url.port!=="55417" || url.pathname!=="/sko217")throw new Error("Dedicated local SKO-217 database required");
const db=new PrismaClient();
test("permanent identity, historic sources, original currency, boundaries, no-overlap and tenant protection", async()=>{
 try {
 assert.throws(()=>dateOnly("2026-02-30")); assert.throws(()=>dateOnly("01/02/2026"));
 await assert.rejects(()=>db.student.update({where:{id:"pupil-main"},data:{id:"new-id"}}),/immutable/);
 await assert.rejects(()=>db.student.update({where:{id:"pupil-main"},data:{rollNo:"changed"}}),/review/);
 const published = await db.reportVersion.findUniqueOrThrow({where:{id:"identity-version"}});
 const prior=await Promise.all([db.attendance.findUnique({where:{id:"identity-attendance"}}),db.reportCard.findUnique({where:{id:"identity-report"}}),db.invoice.findUnique({where:{id:"identity-invoice"}})]);
 await runWithTenantContext({schoolId:"identity-school",role:"SUPER_ADMIN",userId:"identity-SUPER_ADMIN"},async()=>{
  await assert.rejects(()=>prisma.$transaction(tx=>applyEnrollment(tx,{studentId:"pupil-main",fromId:"initial-pupil-main",targetClassId:"identity-school-b-2027",effectiveDate:dateOnly("2026-08-01"),rollNo:"NEW-001",actorId:"identity-SUPER_ADMIN",reason:"conflicting source"})),/Attendance/);
  const result=await prisma.$transaction(tx=>applyEnrollment(tx,{studentId:"pupil-main",fromId:"initial-pupil-main",targetClassId:"identity-school-b-2027",effectiveDate:dateOnly("2026-09-01"),rollNo:"NEW-001",actorId:"identity-SUPER_ADMIN",reason:"Reviewed promotion and campus transfer"}));
  assert.deepEqual(result.preserved,{attendance:1,reports:1,invoices:1});
  assert.deepEqual(await prisma.studentEnrollment.findMany({where:{studentId:"foreign-pupil"}}),[]);
 });
 const pupil=await db.student.findUniqueOrThrow({where:{id:"pupil-main"}});assert.equal(pupil.id,"pupil-main");assert.equal(pupil.admissionNo,"pupil-main");assert.equal(pupil.campusId,"identity-school-b");const login=await db.user.findUniqueOrThrow({where:{id:"identity-STUDENT"}});assert.equal(login.campusId,"identity-school-b");assert.equal(login.accessVersion,1);
 const after=await Promise.all([db.attendance.findUnique({where:{id:"identity-attendance"}}),db.reportCard.findUnique({where:{id:"identity-report"}}),db.invoice.findUnique({where:{id:"identity-invoice"}})]);assert.deepEqual(after,prior);assert.deepEqual(await db.reportVersion.findUniqueOrThrow({where:{id:"identity-version"}}),published);
 await assert.rejects(()=>db.attendance.create({data:{schoolId:"identity-school",campusId:"identity-school-a",classId:"identity-school-a-2026",studentId:"pupil-main",date:dateOnly("2026-09-01"),status:"PRESENT"}}),/No enrollment/);
 await db.attendance.create({data:{schoolId:"identity-school",campusId:"identity-school-b",classId:"identity-school-b-2027",studentId:"pupil-main",date:dateOnly("2026-09-01"),status:"PRESENT"}});
 const period=await db.studentEnrollment.findFirstOrThrow({where:{studentId:"pupil-main",status:"ACTIVE"}});
 await assert.rejects(()=>db.studentEnrollment.create({data:{...period,id:"overlap",endDate:dateOnly("2026-10-01")}}),/Overlapping/);
 await assert.rejects(()=>db.studentEnrollment.update({where:{id:"initial-pupil-main"},data:{className:"Relabel"}}),/immutable/);
 await assert.rejects(()=>db.invoice.update({where:{id:"identity-invoice"},data:{enrollmentId:period.id}}),/immutable/);
 await assert.rejects(()=>db.attendance.update({where:{id:"identity-attendance"},data:{date:dateOnly("2026-08-02")}}),/immutable/);
 console.log("Verified original KWD amount, published report and attendance unchanged after promotion plus campus transfer");
 } finally {await db.$disconnect();await prisma.$disconnect();}
});
