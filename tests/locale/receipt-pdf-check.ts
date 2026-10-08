import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { generatePaymentPdf } from "../../src/lib/pdf";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { defaultLocale } from "../../src/lib/locale/package";
async function main(){
 if(!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201"))throw new Error("Local fixture database required");
 const db=new PrismaClient(),schoolId="locale-receipt-fixture";
 try{
 await db.school.create({data:{id:schoolId,name:"مدرسة الاختبار",slug:schoolId,city:"Local",regId:schoolId,contactEmail:"receipt@example.invalid"}});
 const campus=await db.campus.create({data:{schoolId,name:"الحرم العربي",city:"Local",regId:schoolId}});
 const cls=await db.class.create({data:{schoolId,campusId:campus.id,name:"الصف الخامس",academicYear:2027}});
 const student=await db.student.create({data:{schoolId,campusId:campus.id,classId:cls.id,fullName:"علی احمد",rollNo:"AR-014",gender:"MALE"}});
 const invoice=await db.invoice.create({data:{schoolId,campusId:campus.id,studentId:student.id,currency:"KWD",invoiceNumber:"KW-014",invoiceDate:new Date("2027-04-01Z"),dueDate:new Date("2027-04-10Z"),monthlyFee:1234567,subtotal:1234567,totalAmount:1234567,totalAmountPaid:234567,balanceDue:1000000}});
 const payment=await db.payment.create({data:{schoolId,campusId:campus.id,studentId:student.id,invoiceId:invoice.id,receiptNo:"RCPT-014",amount:234567,paymentDate:new Date("2027-04-02Z"),paymentMethod:"cash",note:"اصل نوٹ برقرار ہے"}});
 for(const language of ["en","ar","ur","en","ar","ur"] as const){
  await db.invoice.update({where:{id:invoice.id},data:{localeSnapshot:{...defaultLocale,language,numberingSystem:language==="ar"?"arab":"latn",currency:"KWD"}}});
  const pdf=await runWithTenantContext({schoolId},()=>generatePaymentPdf(payment.id));await writeFile(`/tmp/sko201-evidence/actual-receipt-${language}.pdf`,pdf);
  const saved=await db.payment.findUniqueOrThrow({where:{id:payment.id}});assert.equal(saved.amount,234567);assert.deepEqual(saved.paymentDate,payment.paymentDate);assert.equal(saved.note,payment.note);
 }
 console.log("Actual KWD receipt rendered twice per language with amounts/date/note preserved");
 }finally{await db.school.deleteMany({where:{id:schoolId}});await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
