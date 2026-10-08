import { chromium } from "playwright";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { enrollmentLabels } from "../../src/lib/students/labels";
const url=new URL(process.env.DATABASE_URL||"postgresql://invalid");if(url.hostname!=="127.0.0.1"||url.port!=="55417"||url.pathname!=="/sko217")throw new Error("Dedicated local SKO-217 database required");
const db=new PrismaClient(),base="http://localhost:3217";
async function token(role:string){return new SignJWT({userId:`identity-${role}`,schoolId:"identity-school",role,accessVersion:0,onboardingComplete:true,schoolStatus:"ACTIVE"}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko217-fixture"));}
async function main(){
 const browser=await chromium.launch({headless:true});const results:string[]=[];await mkdir("/tmp/sko217-evidence",{recursive:true});
 try{
 for(const role of ["APP_OWNER","SUPER_ADMIN","ADMIN","CAMPUS_ADMIN","PRINCIPAL","TEACHER","PARENT","STUDENT","ACCOUNTANT","LIBRARIAN","RECEPTIONIST"]){
  const context=await browser.newContext();await context.addCookies([{name:"skoolee_token",value:await token(role),url:base}]);const page=await context.newPage();
  await page.route("**/*",route=>{const u=new URL(route.request().url());return ["localhost","127.0.0.1"].includes(u.hostname)?route.continue():route.abort();});
  const pupil=role==="STUDENT"?"pupil-main":"pupil-browser";
  const response=await context.request.get(`${base}/api/students/enrollments?studentId=${pupil}`);assert.equal(response.status(),200,`${role}: ${await response.text()}`);
  const body=await response.json();assert(!JSON.stringify(body).includes("CONFIDENTIAL"));
  assert.equal((await context.request.get(`${base}/api/students/enrollments?studentId=foreign-pupil`)).status(),404);
  if(!["SUPER_ADMIN","APP_OWNER"].includes(role))assert.equal((await context.request.get(`${base}/api/students/enrollments?studentId=other-campus-pupil`)).status(),404);
  if(["PARENT","STUDENT"].includes(role))assert.equal((await context.request.get(`${base}/api/students/enrollments?studentId=pupil-same-name`)).status(),404);
  const canManage=["SUPER_ADMIN","ADMIN","CAMPUS_ADMIN","PRINCIPAL"].includes(role);
  if(!canManage)assert.equal((await context.request.post(`${base}/api/students/enrollments`,{data:{action:"propose",studentId:pupil}})).status(),403);
  if(role!=="SUPER_ADMIN")assert.equal((await context.request.post(`${base}/api/students/consolidation`,{data:{action:"preview",sourceId:pupil,targetId:"pupil-survivor"}})).status(),403);
  for(const language of ["en","ar","ur"] as const){
   await db.user.update({where:{id:`identity-${role}`},data:{preferredLanguage:language}});
   await page.goto(`${base}/pupils/${pupil}`,{waitUntil:"networkidle",timeout:120000});
   await page.getByRole("heading",{name:enrollmentLabels[language].history,exact:true}).waitFor();
   assert.equal(await page.locator("main").getAttribute("dir"),language==="en"?"ltr":"rtl");
   assert.equal(await page.getByRole("heading",{name:enrollmentLabels[language].change,exact:true}).count(),canManage?1:0);
   for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${role}/${language}/${width} overflow`);
    if(role==="SUPER_ADMIN" || language==="en"&&width===390)await page.screenshot({path:`/tmp/sko217-evidence/${role}-${language}-${width}.png`,fullPage:true});results.push(`${role}/${language}/${width}: pass`);
   }
  }
  await context.close();
  await writeFile("/tmp/sko217-evidence/browser-results.json",JSON.stringify(results,null,2));
 }
 // Actual keyboard-driven registrar review, retained proposal and confirmation.
 await db.user.update({where:{id:"identity-SUPER_ADMIN"},data:{preferredLanguage:"en"}});
 const context=await browser.newContext();await context.addCookies([{name:"skoolee_token",value:await token("SUPER_ADMIN"),url:base}]);const page=await context.newPage();await page.goto(`${base}/pupils/pupil-browser`,{waitUntil:"networkidle"});
 await page.getByLabel("Target class",{exact:true}).selectOption("identity-school-a-2027");await page.getByLabel("Effective date",{exact:true}).fill("2026-09-01");await page.getByLabel("Roll number",{exact:true}).fill("BROWSER-2027");await page.getByLabel("Reason",{exact:true}).first().fill("Synthetic keyboard review");
 const review=page.getByRole("button",{name:"Review impact",exact:true}).first();await review.focus();await page.keyboard.press("Enter");await page.getByRole("heading",{name:"Historical records preserved"}).waitFor();await page.getByRole("button",{name:"Save proposal",exact:true}).click();await page.getByLabel("I verified the pupil, dates, guardian impact and target capacity").check();await page.getByRole("button",{name:"Confirm transition",exact:true}).click();await page.getByRole("status").filter({hasText:"Transition recorded"}).waitFor();
 assert.equal((await db.student.findUniqueOrThrow({where:{id:"pupil-browser"}})).classId,"identity-school-a-2027");results.push("Keyboard reviewed transition: pass");
 const blocked=await context.request.post(`${base}/api/students/consolidation`,{data:{action:"preview",sourceId:"pupil-same-name",targetId:"pupil-survivor"}});assert.equal(blocked.status(),200);assert((await blocked.json()).blockers.some((x:string)=>x.includes("guardian")));
 const preview=await context.request.post(`${base}/api/students/consolidation`,{data:{action:"preview",sourceId:"pupil-duplicate",targetId:"pupil-survivor"}});assert.equal(preview.status(),200,await preview.text());const report=await preview.json();assert.deepEqual(report.blockers,[]);
 const confirmed=await context.request.post(`${base}/api/students/consolidation`,{data:{action:"confirm",sourceId:"pupil-duplicate",targetId:"pupil-survivor",verifiedSourceId:"pupil-duplicate",verifiedTargetId:"pupil-survivor",token:report.token,reason:"Verified synthetic duplicate"}});assert.equal(confirmed.status(),200,await confirmed.text());assert.equal((await db.student.findUniqueOrThrow({where:{id:"pupil-duplicate"}})).consolidatedIntoId,"pupil-survivor");results.push("Same-name conflict and authorized immutable alias consolidation: pass");
 await context.close();await writeFile("/tmp/sko217-evidence/browser-results.json",JSON.stringify(results,null,2));console.log(results.join("\n"));
 }finally{await browser.close();await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
