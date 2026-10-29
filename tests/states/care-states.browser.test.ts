import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { ROLE_DASHBOARD_PATHS, USER_ROLES } from "../../src/lib/roles";
import { TOURS } from "../../src/lib/onboarding/tours";
import { totp } from "../../src/lib/auth/mfa-crypto";

// Synthetic local acceptance for SKAI-54. Never run against a shared/production database.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55454" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55454 is allowed");
const base = process.env.STATES_TEST_APP || "http://localhost:3154";
const evidence = process.env.STATES_EVIDENCE_DIR || "/tmp/skai54/evidence";
const db = new PrismaClient(), password = "SyntheticStates308!";
const schoolId = `qa01-skai54-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
const class7 = randomUUID(), classB = randomUUID(), classC = randomUUID(), campusC = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const roleKeys: Record<string,string> = { CAMPUS_ADMIN:"ops", TEACHER:"teacher", PARENT:"parent", STUDENT:"learner", LIBRARIAN:"librarian" };
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, campus: string | null = campusA, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, welcomeCompletedAt: new Date(), tourProgress: Object.fromEntries(Object.entries(TOURS).map(([id, tour]) => [id, {v: tour.version, s: "done", at: new Date().toISOString()}])), joiningDate: new Date("2026-01-01T00:00:00Z"), preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) { const ctx = await browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" }); ctx.setDefaultTimeout(30000); ctx.setDefaultNavigationTimeout(120000); return ctx; }
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const login = await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password, schoolId }, timeout: 120000 });
  assert.equal(login.status(), 200, key + " login");
  const loginBody = await login.json();
  assert.ok(loginBody.success || loginBody.mfaRequired, key + " login outcome");
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  const signedIn = await ctx.request.get(base + "/api/auth/session");
  assert.equal(signedIn.status(), 200, key + " authenticated session");
  sessions.set(key, await ctx.storageState());
  ctx.setDefaultTimeout(30000); ctx.setDefaultNavigationTimeout(120000); return ctx;
}

const otherSchool = `qa01-skai54-${randomUUID()}`;
before(async()=>{
  await mkdir(evidence,{recursive:true});
  for(const id of [schoolId,otherSchool]) await db.school.create({data:{id,name:"QA-01 Request States",slug:id,regId:id,contactEmail:`${id}@example.invalid`,city:"Lahore",status:"ACTIVE",plan:"PRO"}});
  for(const [id,school,name] of [[campusA,schoolId,"North"],[campusB,otherSchool,"South"]]) await db.campus.create({data:{id,schoolId:school,name,regId:id,city:"Lahore"}});
  await db.campus.create({data:{id:campusC,schoolId,name:"Other campus",regId:campusC,city:"Lahore"}});
  await db.academicCycle.create({data:{schoolId,campusId:campusA,label:"2026",academicYear:2026,status:"ACTIVE"}});
  const learner = await user("learner", "STUDENT");
  await user("librarian","LIBRARIAN"); await user("ops","CAMPUS_ADMIN"); await user("parent","PARENT"); await user("ops-ur","CAMPUS_ADMIN",campusA,"ur"); await user("ops-ar","CAMPUS_ADMIN",campusA,"ar"); const teacher=await user("teacher","TEACHER");
  await db.class.create({data:{id:class7,schoolId,campusId:campusA,name:"Grade 7",section:"A",academicYear:2026,classTeacherId:teacher}});
  await db.class.create({data:{id:classB,schoolId:otherSchool,campusId:campusB,name:"Grade 7",section:"B",academicYear:2026}});
  await db.class.create({data:{id:classC,schoolId,campusId:campusC,name:"Other campus class",section:"C",academicYear:2026}});
  for(const [id,school,campus,cls,name] of [[randomUUID(),schoolId,campusA,class7,"Synthetic Ada"],[randomUUID(),otherSchool,campusB,classB,"Synthetic Private"]]) {
    pupils[name]=id; await db.student.create({data:{id,schoolId:school,campusId:campus,classId:cls,studentUserId:school===schoolId?learner:null,fullName:name,rollNo:"307",gender:"FEMALE",enrollmentDate:new Date("2024-02-29T00:00:00Z")}});
  }
  for (const role of USER_ROLES) {
    if (roleKeys[role]) continue;
    roleKeys[role] = role.toLowerCase(); await user(roleKeys[role], role);
  }
  const relationship = await db.guardianRelationship.create({data:{schoolId,campusId:campusA,studentId:pupils["Synthetic Ada"],guardianUserId:users.get("parent")!.id,createdByUserId:users.get("ops")!.id,fullName:"Synthetic guardian",email:users.get("parent")!.email,relationship:"Parent",status:"ACTIVE",verifiedAt:new Date()}});
  await db.guardianAccessVersion.create({data:{schoolId,relationshipId:relationship.id,createdByUserId:users.get("ops")!.id,reason:"Synthetic state verification",effectiveFrom:new Date(Date.now()-60000),permissions:{learningRecords:true,attendance:true,finances:true,communication:true,pickup:false}}});
  await db.admissionQuery.create({data:{schoolId,campusId:campusA,name:"Synthetic Enquiry",phone:"03000000307",source:"WALK_IN",nextFollowUp:new Date("2026-11-01T00:00:00Z")}});
  browser=await (process.env.STATES_BROWSER === "webkit" ? webkit : chromium).launch({headless:true});
});
after(async()=>{await browser?.close(); await db.$disconnect();});
const saveShot=async(page:Page,name:string)=>{await page.locator("[data-boot-splash]").waitFor({state:"hidden"}); await page.screenshot({path:`${evidence}/${name}.png`,fullPage:true});};

test("care entry distinguishes provider failure from denied access", async () => {
  const ctx = await context("ops"), page = await ctx.newPage();
  await page.route("**/api/care?view=me", route => route.fulfill({status:503,body:"private diagnostic",contentType:"text/html"}));
  await page.goto(`${base}/care`);
  await page.locator('[data-care-denied], [data-failure-kind="provider"]').waitFor({timeout:120000});
  await saveShot(page,"SKAI-54_baseline_entry_EN");
  assert.equal(await page.locator('[data-failure-kind="provider"]').count(), 1);
  await saveShot(page,"SKAI-54_01_provider_EN");
  await ctx.close();
});
