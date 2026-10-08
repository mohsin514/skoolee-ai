import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { recordPayment } from "../../src/lib/fees/payment";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || !((url.port === "55401" && /^\/sko201(?:_replay)?$/.test(url.pathname)) || (url.port === "55410" && url.pathname === "/sko210"))) throw new Error("Isolated localhost fixture required");
test("real payment ledger preserves KWD minor units and immutable original invoice identity", async () => {
 const db = new PrismaClient(); const schoolId = "locale-money-test";
 try {
 await db.school.create({data:{id:schoolId,name:"Local",slug:schoolId,city:"Test",regId:schoolId,contactEmail:"money@example.invalid"}});
 const campus=await db.campus.create({data:{schoolId,name:"Local",city:"Test",regId:schoolId}});
 const bank=await db.bankAccount.create({data:{schoolId,campusId:campus.id,name:"KWD fixture",currency:"KWD",openingBalance:1234567}});
 await assert.rejects(db.bankAccount.update({where:{id:bank.id},data:{currency:"PKR"}}), /currency cannot be changed/);
 assert.equal((await db.bankAccount.findUniqueOrThrow({where:{id:bank.id}})).openingBalance,1234567);
 const cls=await db.class.create({data:{schoolId,campusId:campus.id,name:"Class",academicYear:2027}});
 const student=await db.student.create({data:{schoolId,campusId:campus.id,classId:cls.id,fullName:"Original identity",rollNo:"KW-001",gender:"MALE"}});
 const invoice=await db.invoice.create({data:{schoolId,campusId:campus.id,studentId:student.id,currency:"KWD",invoiceDate:new Date("2027-04-01Z"),dueDate:new Date("2027-04-10Z"),monthlyFee:1234567,subtotal:1234567,totalAmount:1234567,balanceDue:1234567}});
 await assert.rejects(db.invoice.update({where:{id:invoice.id},data:{currency:"USD"}}), /currency cannot be changed/);
 await runWithTenantContext({schoolId}, async()=>prisma.$transaction(tx=>recordPayment(tx,{campusId:campus.id,invoiceId:invoice.id,studentId:student.id,amount:1234567,paymentDate:new Date("2027-04-02Z"),paymentMethod:"cash"})));
 const saved=await db.invoice.findUniqueOrThrow({where:{id:invoice.id}});assert.equal(saved.totalAmountPaid,1234567);assert.equal(saved.currency,"KWD");assert.equal(saved.balanceDue,0);
 const ledger=await db.ledgerEntry.findFirstOrThrow({where:{schoolId}});assert.equal(ledger.currency,"KWD");assert.equal(ledger.amount,1234567);
 const same=await db.student.findUniqueOrThrow({where:{id:student.id}});assert.equal(same.fullName,"Original identity");
 } finally {await db.school.deleteMany({where:{id:schoolId}});await db.$disconnect();await prisma.$disconnect();}
});
