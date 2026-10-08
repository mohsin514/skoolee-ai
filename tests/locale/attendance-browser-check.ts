import {PrismaClient} from "@prisma/client";
import {chromium} from "playwright";
import {SignJWT} from "jose";
import assert from "node:assert/strict";
import {defaultLocale,localeTag} from "../../src/lib/locale/package";
import {translateUi} from "../../src/lib/locale/ui-messages";
async function main(){
 if(!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201"))throw new Error("Local database required");const db=new PrismaClient(),browser=await chromium.launch();
 try{
 await db.attendance.create({data:{id:"locale-date-boundary",schoolId:"locale-fixture",campusId:"locale-campus-a",classId:"locale-portal-class",studentId:"locale-portal-student",date:new Date("2026-10-01Z"),status:"PRESENT",markedBy:"locale-TEACHER"}});
 for(const role of ["STUDENT","PARENT"])for(const language of ["en","ar","ur"] as const)for(const timezoneId of ["Pacific/Honolulu","Pacific/Kiritimati"]){
  await db.user.update({where:{id:`locale-${role}`},data:{preferredLanguage:language}});
  const token=await new SignJWT({userId:`locale-${role}`,schoolId:"locale-fixture",campusId:"locale-campus-a",role,accessVersion:0,schoolStatus:"ACTIVE",onboardingComplete:true}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
  const context=await browser.newContext({timezoneId,viewport:{width:390,height:1000}});await context.addCookies([{name:"skoolee_token",value:token,url:"http://localhost:3201"}]);const page=await context.newPage();await page.goto(`http://localhost:3201/${role.toLowerCase()}/attendance`,{waitUntil:"networkidle",timeout:120000});await page.waitForFunction(lang=>document.documentElement.lang===lang,language);
  const tag=localeTag({...defaultLocale,language});const expected=role==="PARENT"?new Intl.DateTimeFormat(tag,{timeZone:"UTC",weekday:"short",month:"short",day:"numeric"}).format(new Date("2026-10-01Z")):new Intl.DateTimeFormat(tag,{timeZone:"UTC",month:"long",year:"numeric"}).format(new Date("2026-10-01Z"))+" 1";
  await page.getByRole("img",{name:`${expected} — ${translateUi(role==="PARENT"?"PRESENT":"Present",language)}`,exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);console.log(`${role}/${language}/${timezoneId}: Oct1 remains Oct1`);await context.close();
 }
 }finally{await db.attendance.deleteMany({where:{id:"locale-date-boundary"}});await browser.close();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
