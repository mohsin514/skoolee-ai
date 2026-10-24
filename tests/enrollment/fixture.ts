import { PrismaClient } from "@prisma/client";
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
// The dedicated SKO-217 database, or the shared isolated QA database (55438/postgres) on purpose.
const dedicated = url.port === "55417" && url.pathname === "/sko217", isolatedQa = url.port === "55438" && url.pathname === "/postgres";
if (url.hostname !== "127.0.0.1" || !(dedicated || isolatedQa)) throw new Error("Dedicated local SKO-217 database required");
const db = new PrismaClient();
export const roles = ["APP_OWNER","SUPER_ADMIN","ADMIN","CAMPUS_ADMIN","PRINCIPAL","TEACHER","PARENT","STUDENT","ACCOUNTANT","LIBRARIAN","RECEPTIONIST"] as const;
async function main() {
 for (const schoolId of ["identity-school","foreign-school"]) {
  await db.school.create({data:{id:schoolId,name:schoolId,slug:schoolId,regId:schoolId,city:"Synthetic",contactEmail:`${schoolId}@example.invalid`,status:"ACTIVE",plan:"PRO",registrationKind:"GROUP"}});
  for (const suffix of ["a","b"]) {
   const campusId=`${schoolId}-${suffix}`;
   await db.campus.create({data:{id:campusId,schoolId,name:`Campus ${suffix}`,city:"Synthetic",regId:campusId,board:"Test curriculum"}});
   for (const year of [2026,2027]) await db.class.create({data:{id:`${campusId}-${year}`,schoolId,campusId,name:year===2026?"Seven":"Eight",section:"B",academicYear:year}});
  }
 }
 for(const role of roles) await db.user.create({data:{id:`identity-${role}`,schoolId:"identity-school",campusId:["SUPER_ADMIN","APP_OWNER"].includes(role)?null:"identity-school-a",email:`${role.toLowerCase()}@example.invalid`,fullName:`Synthetic ${role}`,role,mfaEnabled:true,isActive:true,onboardingComplete:true}});
 await db.user.create({data:{id:"other-guardian",schoolId:"identity-school",campusId:"identity-school-a",email:"other-guardian@example.invalid",fullName:"Different guardian",role:"PARENT",isActive:true,onboardingComplete:true}});
 for(const id of ["pupil-main","pupil-same-name","pupil-duplicate","pupil-survivor","pupil-browser"]) await db.student.create({data:{id,schoolId:"identity-school",campusId:"identity-school-a",classId:"identity-school-a-2026",fullName:"Alex Same Name علي",rollNo:id,admissionNo:id,gender:"MALE",dateOfBirth:new Date("2014-01-01Z"),enrollmentDate:new Date("2026-01-01Z"),parentUserId:id==="pupil-same-name"?"other-guardian":"identity-PARENT",studentUserId:id==="pupil-main"?"identity-STUDENT":null,medicalNotes:"CONFIDENTIAL MEDICAL TEST"}});
 // SKO-488: a parent reads a pupil only through a verified ACTIVE relationship with a current learningRecords grant.
 // The permitted cases get that explicit grant; separate pupils keep the missing, revoked and expired denials.
 for(const id of ["pupil-ungranted","pupil-revoked","pupil-expired"]) await db.student.create({data:{id,schoolId:"identity-school",campusId:"identity-school-a",classId:"identity-school-a-2026",fullName:"Alex Same Name علي",rollNo:id,admissionNo:id,gender:"MALE",dateOfBirth:new Date("2014-01-01Z"),enrollmentDate:new Date("2026-01-01Z"),parentUserId:"identity-PARENT"}});
 const grant = async (studentId:string, status:string, effectiveUntil:Date|null) => {
  const relationship = await db.guardianRelationship.create({data:{schoolId:"identity-school",campusId:"identity-school-a",studentId,guardianUserId:"identity-PARENT",createdByUserId:"identity-CAMPUS_ADMIN",fullName:"Synthetic PARENT",email:"parent@example.invalid",relationship:"Parent",status,verifiedAt:new Date("2026-01-01Z")}});
  await db.guardianAccessVersion.create({data:{schoolId:"identity-school",relationshipId:relationship.id,createdByUserId:"identity-CAMPUS_ADMIN",reason:"Synthetic enrollment fixture",effectiveFrom:new Date("2026-01-01Z"),effectiveUntil,permissions:{learningRecords:true,attendance:true,finances:false,communication:true,pickup:false}}});
 };
 for(const id of ["pupil-main","pupil-browser"]) await grant(id,"ACTIVE",null);
 await grant("pupil-revoked","REVOKED",null);
 await grant("pupil-expired","ACTIVE",new Date("2026-02-01Z"));
 await db.student.create({data:{id:"foreign-pupil",schoolId:"foreign-school",campusId:"foreign-school-a",classId:"foreign-school-a-2026",fullName:"Foreign",rollNo:"foreign",gender:"MALE",enrollmentDate:new Date("2026-01-01Z")}});
 await db.student.create({data:{id:"other-campus-pupil",schoolId:"identity-school",campusId:"identity-school-b",classId:"identity-school-b-2026",fullName:"Other campus",rollNo:"other",gender:"MALE",enrollmentDate:new Date("2026-01-01Z")}});
 await db.exam.create({data:{id:"identity-exam",schoolId:"identity-school",campusId:"identity-school-a",classId:"identity-school-a-2026",title:"Published previous report",term:"1",academicYear:2026,status:"PUBLISHED"}});
 await db.reportCard.create({data:{id:"identity-report",schoolId:"identity-school",campusId:"identity-school-a",studentId:"pupil-main",examId:"identity-exam",status:"PUBLISHED",generatedAt:new Date("2026-08-01Z")}});
 await db.attendance.create({data:{id:"identity-attendance",schoolId:"identity-school",campusId:"identity-school-a",classId:"identity-school-a-2026",studentId:"pupil-main",date:new Date("2026-08-01Z"),status:"PRESENT"}});
 await db.invoice.create({data:{id:"identity-invoice",schoolId:"identity-school",campusId:"identity-school-a",studentId:"pupil-main",invoiceDate:new Date("2026-08-01Z"),dueDate:new Date("2026-08-30Z"),currency:"KWD",invoiceNumber:"SYNTHETIC-UNPAID",monthlyFee:123456,subtotal:123456,totalAmount:123456,balanceDue:123456}});
 await db.reportVersion.create({ data: { id:"identity-version",schoolId:"identity-school",reportCardId:"identity-report",number:1,contentHash:"synthetic-hash",documentIdentity:"SYNTHETIC-PUBLISHED-001",documentBytes:Buffer.from("synthetic immutable report bytes"),snapshot:{className:"Seven B",rollNo:"pupil-main",studentId:"pupil-main"},blockers:[],changedSections:[],approvedBy:"identity-PRINCIPAL",approvedAt:new Date("2026-08-01Z"),publishedAt:new Date("2026-08-01Z") } });
 console.log("Synthetic identity fixtures ready; no external services configured");
}
main().finally(()=>db.$disconnect());
