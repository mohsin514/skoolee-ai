import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import assert from "node:assert/strict";
async function main(){
 if(!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201"))throw new Error("Local database required");
 const db=new PrismaClient();
 try{
 const token=await new SignJWT({userId:"locale-ACCOUNTANT",schoolId:"locale-fixture",campusId:"locale-campus-a",role:"ACCOUNTANT",accessVersion:0,schoolStatus:"ACTIVE",onboardingComplete:true}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
 const before=await db.payment.count({where:{schoolId:"locale-fixture"}});
 for(const [currency,decimal,minor] of [["PKR","1234.56",123456],["KWD","1234.567",1234567],["AED","345.67",34567]] as const){
  const form=new FormData();form.append("currency",currency);form.append("accountName","LOCAL-LOCALE-BANK");form.append("statementFrom","2026-10-01");form.append("statementTo","2026-10-30");form.append("file",new Blob([`transaction_date,amount,description\n2026-10-02,${decimal},علی احمد · طالب الاختبار`],{type:"text/csv"}),"local.csv");
  const response=await fetch("http://localhost:3201/api/fees/bank-import",{method:"POST",headers:{Cookie:`skoolee_token=${token}`},body:form});const json=await response.json();assert.equal(response.status,200,JSON.stringify(json));const row=json.data.preview[0];assert.equal(row.currency,currency);assert.equal(row.amount,minor);assert.equal(row.matchedInvoiceId,`locale-portal-${currency}`);
 }
 assert.equal(await db.payment.count({where:{schoolId:"locale-fixture"}}),before);
 console.log("Bank reconciliation compares exact same-currency minor units for PKR/KWD/AED; no payment side effects");
 }finally{await db.bankReconciliation.deleteMany({where:{schoolId:"locale-fixture",bankAccount:"LOCAL-LOCALE-BANK"}});await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
