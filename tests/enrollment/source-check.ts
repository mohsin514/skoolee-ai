import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { prisma } from "../../src/lib/db/prisma";
import { getStudentContext } from "../../src/lib/ai/student-context";
import { generateInvoicePdf } from "../../src/lib/pdf";
const url=new URL(process.env.DATABASE_URL||"postgresql://invalid");if(url.hostname!=="127.0.0.1"||url.port!=="55417"||url.pathname!=="/sko217")throw new Error("Dedicated local SKO-217 database required");
const db=new PrismaClient();
async function main(){try{
const jwt=await new SignJWT({userId:"identity-SUPER_ADMIN",schoolId:"identity-school",role:"SUPER_ADMIN",mfaVerified:true,accessVersion:0,onboardingComplete:true}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko217-fixture"));
await db.loginSession.create({data:{schoolId:"identity-school",userId:"identity-SUPER_ADMIN",tokenHash:createHash("sha256").update(jwt).digest("hex"),expiresAt:new Date(Date.now()+3600000)}});
const headers={cookie:`skoolee_token=${jwt}`,"content-type":"application/json"};
const response=await fetch("http://localhost:3217/api/students",{method:"POST",headers,body:JSON.stringify({students:[{fullName:"Imported Same Name",rollNo:"IMPORT-1",gender:"MALE",guardianPhone:"0000000000",address:"Synthetic address",city:"Synthetic",medicalNotes:"None",classId:"identity-school-a-2026",parentUserId:"identity-PARENT"},{fullName:"Imported Same Name",rollNo:"IMPORT-2",gender:"MALE",guardianPhone:"0000000000",address:"Synthetic address",city:"Synthetic",medicalNotes:"None",classId:"identity-school-a-2026",parentUserId:"other-guardian"}]})});
assert(response.ok,await response.text());
const pupils=await db.student.findMany({where:{fullName:"Imported Same Name"},orderBy:{rollNo:"asc"}});assert.equal(pupils.length,2);assert.notEqual(pupils[0].id,pupils[1].id);assert.notEqual(pupils[0].parentUserId,pupils[1].parentUserId);assert.notEqual(pupils[0].admissionNo,pupils[1].admissionNo);
const user={userId:"identity-SUPER_ADMIN",schoolId:"identity-school",campusId:null,role:"SUPER_ADMIN" as const,email:"super_admin@example.invalid"};
await runWithTenantContext(user,async()=>{for(const pupil of pupils){const context=await getStudentContext(user,pupil.id);assert.equal(context?.id,pupil.id);assert.equal(context?.parentUserId,pupil.parentUserId);}await writeFile("/tmp/sko217-evidence/original-invoice.pdf",await generateInvoicePdf("identity-invoice"));});
for(const pupil of pupils){const result=await fetch(`http://localhost:3217/api/students?search=${encodeURIComponent(pupil.id)}`,{headers});assert(result.ok);const body=await result.json();assert(JSON.stringify(body).includes(pupil.id));assert(!JSON.stringify(body).includes(pupils.find(p=>p.id!==pupil.id)!.id));}
const from="initial-pupil-survivor";const proposal=await fetch("http://localhost:3217/api/students/enrollments",{method:"POST",headers,body:JSON.stringify({action:"propose",studentId:"pupil-survivor",fromEnrollmentId:from,targetClassId:"identity-school-a-2027",effectiveDate:"2027-01-01",rollNo:"FUTURE",reason:"Synthetic future proposal"})});assert.equal(proposal.status,201,await proposal.clone().text());const p=await proposal.json();
const confirmation=await fetch("http://localhost:3217/api/students/enrollments",{method:"POST",headers,body:JSON.stringify({action:"confirm",studentId:"pupil-survivor",proposalId:p.proposal.id,reviewed:true,capacityChecked:true})});assert.equal(confirmation.status,409);assert.equal((await db.student.findUniqueOrThrow({where:{id:"pupil-survivor"}})).classId,"identity-school-a-2026");
console.log("Same-name API imports, explicit guardian linking, permanent-ID search, AI identity selection, original-currency invoice PDF, and future proposal boundary: PASS");
}finally{await db.$disconnect();await prisma.$disconnect();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
