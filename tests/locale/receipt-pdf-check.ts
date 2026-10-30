import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { generatePaymentPdf } from "../../src/lib/pdf";
import { prisma } from "../../src/lib/db/prisma";
import { recordPayment } from "../../src/lib/fees/payment";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { defaultLocale } from "../../src/lib/locale/package";
import { translateUi } from "../../src/lib/locale/ui-messages";

// SKO-498: KWD receipts in EN/AR/UR through the real collection path. Each payment is recorded with
// recordPayment (currency from the invoice, receipt captured at collection), each receipt is read back
// as text and must carry its own language's labels, and changing the invoice afterwards never changes
// the issued receipt's bytes.
async function main(){
 const url=process.env.DATABASE_URL||"";
 if(!url.includes("127.0.0.1:55401/sko201")&&!url.includes("127.0.0.1:55438/postgres"))throw new Error("Local fixture database required");
 const evidence=process.env.LOCALE_EVIDENCE_DIR||"/tmp/sko201-evidence";
 const db=new PrismaClient(),schoolId="locale-receipt-fixture";
 try{
 await db.school.deleteMany({where:{id:schoolId}});
 await db.school.create({data:{id:schoolId,name:"مدرسة الاختبار",slug:schoolId,city:"Local",regId:schoolId,contactEmail:"receipt@example.invalid"}});
 const campus=await db.campus.create({data:{schoolId,name:"الحرم العربي",city:"Local",regId:schoolId}});
 const cls=await db.class.create({data:{schoolId,campusId:campus.id,name:"الصف الخامس",academicYear:2027}});
 // Enrolled before the invoice date, as the source-enrollment guard requires.
 const student=await db.student.create({data:{schoolId,campusId:campus.id,classId:cls.id,fullName:"علی احمد",rollNo:"AR-014",gender:"MALE",enrollmentDate:new Date("2027-01-01Z")}});
 const labels:Record<string,string>={};
 for(const language of ["en","ar","ur"] as const){
  labels[language]=translateUi("Payment Receipt",language);
  const invoice=await db.invoice.create({data:{schoolId,campusId:campus.id,studentId:student.id,currency:"KWD",invoiceNumber:`KW-014-${language}`,invoiceDate:new Date("2027-04-01Z"),dueDate:new Date("2027-04-10Z"),monthlyFee:1234567,subtotal:1234567,totalAmount:1234567,balanceDue:1234567,localeSnapshot:{...defaultLocale,language,numberingSystem:"latn",currency:"KWD"}}});
  const payment=await runWithTenantContext({schoolId},()=>prisma.$transaction(tx=>recordPayment(tx,{campusId:campus.id,invoiceId:invoice.id,studentId:student.id,amount:234567,paymentDate:new Date("2027-04-02Z"),paymentMethod:"cash",note:"اصل نوٹ برقرار ہے"})));
  const paymentId=payment.payment.id;
  const saved=await db.payment.findUniqueOrThrow({where:{id:paymentId}});
  assert.equal(saved.currency,"KWD",`${language}: the payment takes the invoice currency`);
  const receipt=await db.paymentReceipt.findUniqueOrThrow({where:{paymentId}});
  const snapshot=receipt.snapshot as {invoice:{currency:string;localeSnapshot:{language:string}}};
  assert.equal(snapshot.invoice.currency,"KWD");assert.equal(snapshot.invoice.localeSnapshot.language,language,`${language}: captured at collection`);
  const first=await runWithTenantContext({schoolId},()=>generatePaymentPdf(paymentId));
  const file=`${evidence}/actual-receipt-${language}.pdf`;await writeFile(file,first);
  // pdftotext wraps right-to-left runs in bidi controls; drop them before reading labels and amounts.
  const text=execFileSync("pdftotext",["-enc","UTF-8",file,"-"]).toString().replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu,"");
  assert.ok(text.replace(/\s+/gu," ").includes(labels[language].replace(/\s+/gu," ")),`${language}: heading "${labels[language]}" is rendered`);
  assert.ok(/KWD|د\.ك|KD/u.test(text),`${language}: the amount is shown in KWD`);
  assert.ok(text.includes("234.567")||text.includes("234٫567")||text.includes("٢٣٤٫٥٦٧"),`${language}: three-decimal KWD amount`);
  // The issued receipt is immutable: a later invoice locale change does not alter its bytes.
  await db.invoice.update({where:{id:invoice.id},data:{localeSnapshot:{...defaultLocale,language:language==="en"?"ar":"en",numberingSystem:"latn",currency:"PKR"}}});
  const again=await runWithTenantContext({schoolId},()=>generatePaymentPdf(paymentId));
  assert.equal(createHash("sha256").update(again).digest("hex"),createHash("sha256").update(first).digest("hex"),`${language}: exact-byte replay`);
  const after=await db.payment.findUniqueOrThrow({where:{id:paymentId}});assert.equal(after.amount,234567);assert.equal(after.currency,"KWD");assert.equal(after.note,"اصل نوٹ برقرار ہے");
  console.log(`${language}: KWD receipt "${labels[language]}" rendered and replayed byte-for-byte`);
 }
 assert.equal(new Set(Object.values(labels)).size,3,"each language has its own receipt heading");
 console.log("KWD receipts in EN/AR/UR recorded through recordPayment; distinct language labels; immutable after invoice changes");
 }finally{await db.school.deleteMany({where:{id:schoolId}});await db.$disconnect();await prisma.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
