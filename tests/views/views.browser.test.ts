import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// Synthetic local acceptance for SCRUM-307. Never run against a shared/production database.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || !["55438", "55553"].includes(url.port) || url.pathname !== "/postgres") throw Error("Only isolated local DB ports 55438/55553 are allowed");
const base = process.env.VIEWS_TEST_APP || "http://localhost:3108";
const evidence = process.env.VIEWS_EVIDENCE_DIR || "/tmp/scrum307/evidence";
const db = new PrismaClient(), password = "SyntheticViews307!";
const schoolId = `views307-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
const class7 = randomUUID(), classB = randomUUID(), campusC = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, campus: string | null = campusA, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, joiningDate: new Date("2026-01-01T00:00:00Z"), preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) { const ctx = await browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" }); ctx.setDefaultNavigationTimeout(120000); return ctx; }
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const login = await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } });
  assert.equal(login.status(), 200);
  if ((await login.json()).mfaRequired) {
    const setup = await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } });
    assert.equal(setup.status(), 200);
    const { secret } = await setup.json();
    assert.equal((await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } })).status(), 200);
    assert.equal((await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } })).status(), 200);
  }
  sessions.set(key, await ctx.storageState());
  ctx.setDefaultNavigationTimeout(120000); return ctx;
}

const otherSchool = `views307-${randomUUID()}`;
before(async()=>{
  await mkdir(evidence,{recursive:true});
  for(const id of [schoolId,otherSchool]) await db.school.create({data:{id,name:"Synthetic Views School",slug:id,regId:id,contactEmail:`${id}@example.invalid`,city:"Lahore",status:"ACTIVE",plan:"PRO"}});
  for(const [id,school,name] of [[campusA,schoolId,"North"],[campusB,otherSchool,"South"]]) await db.campus.create({data:{id,schoolId:school,name,regId:id,city:"Lahore"}});
  await db.campus.create({data:{id:campusC,schoolId,name:"Other campus",regId:campusC,city:"Lahore"}});
  await db.academicCycle.create({data:{schoolId,campusId:campusA,label:"2026",academicYear:2026,status:"ACTIVE"}});
  await user("ops","CAMPUS_ADMIN"); await user("parent","PARENT"); await user("ops-ur","CAMPUS_ADMIN",campusA,"ur"); await user("ops-ar","CAMPUS_ADMIN",campusA,"ar"); const teacher=await user("teacher","TEACHER");
  await db.class.create({data:{id:class7,schoolId,campusId:campusA,name:"Grade 7",section:"A",academicYear:2026,classTeacherId:teacher}});
  await db.class.create({data:{id:classB,schoolId:otherSchool,campusId:campusB,name:"Grade 7",section:"B",academicYear:2026}});
  for(const [id,school,campus,cls,name] of [[randomUUID(),schoolId,campusA,class7,"Synthetic Ada"],[randomUUID(),otherSchool,campusB,classB,"Synthetic Private"]]) {
    pupils[name]=id; await db.student.create({data:{id,schoolId:school,campusId:campus,classId:cls,fullName:name,rollNo:"307",gender:"FEMALE",enrollmentDate:new Date("2024-02-29T00:00:00Z")}});
  }
  await db.admissionQuery.create({data:{schoolId,campusId:campusA,name:"Synthetic Enquiry",phone:"03000000307",source:"WALK_IN",nextFollowUp:new Date("2026-11-01T00:00:00Z")}});
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close(); await db.$disconnect();});
const saveShot=async(page:Page,name:string)=>{await page.locator("[data-boot-splash]").waitFor({state:"hidden"});if(await page.locator("[data-record-id]").count()) await page.locator("[data-record-id]").first().scrollIntoViewIfNeeded(); await page.screenshot({path:`${evidence}/${name}.png`,fullPage:true});};
test("API denies families and foreign campus; view parameter cannot widen access",async()=>{
  const ops=await context("ops"), parent=await context("parent");
  for(const view of ["table","cards","grid","calendar"]){
    for(const path of ["/api/students","/api/admission-queries"]){
      assert.equal((await parent.request.get(`${base}${path}?view=${view}`)).status(),403);
      for(const campusId of [campusB,campusC]) assert.ok([403,404].includes((await ops.request.get(`${base}${path}?campusId=${campusId}&view=${view}`)).status()));
      const response=await ops.request.get(`${base}${path}?view=${view}`); assert.equal(response.status(),200);
      assert.ok(!(await response.text()).includes("Synthetic Private"));
    }
  }
  const deny=await db.rolePermission.create({data:{schoolId,role:"CAMPUS_ADMIN",module:"students",canView:false,canAdd:false,canEdit:false,canDelete:false}});
  try {assert.equal((await ops.request.get(`${base}/api/students?view=calendar`)).status(),403);} finally {await db.rolePermission.delete({where:{id:deny.id}});}
});
test("admin roster preserves filters, selection, record actions, URL and refresh across views",async()=>{
  const page=await (await context("ops")).newPage();
  await page.addInitScript(() => localStorage.setItem("skoolee.workspace.students", "null"));
  await page.goto(`${base}/admin?view=students&sq=Synthetic%20Ada`);
  await page.locator("[data-boot-splash]").waitFor({ state: "hidden", timeout: 60_000 });
  await page.getByRole("button",{name:"List",exact:true}).waitFor({ timeout: 60_000 });
  await page.getByRole("button",{name:"List",exact:true}).click();
  await page.getByRole("checkbox",{name:/Select Synthetic Ada/}).check();
  for(const view of ["Grid","Calendar"]){
    await page.getByRole("button",{name:view,exact:true}).click();
    await page.getByRole("checkbox",{name:/Deselect Synthetic Ada/}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("sq"),"Synthetic Ada");
    assert.equal(new URL(page.url()).searchParams.get("view.students"),view.toLowerCase());
    assert.equal(await page.getByText("Synthetic Private",{exact:true}).count(),0);
    await saveShot(page,`roster-${view.toLowerCase()}-en`);
  }
  await page.getByRole("button",{name:"Cards",exact:true}).click();
  assert.equal(await page.getByRole("checkbox",{name:"Select Synthetic Ada",exact:true}).isChecked(),true);
  await page.goBack();
  await page.goBack(); await page.getByRole("button",{name:"Grid",exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Grid",exact:true}).getAttribute("aria-pressed"),"true");
  await page.reload(); await page.getByRole("button",{name:"Grid",exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Grid",exact:true}).getAttribute("aria-pressed"),"true");
  await page.getByRole("button",{name:/Synthetic Ada/}).last().click();
  await page.getByRole("dialog").waitFor(); await saveShot(page,"roster-open-record-en");
});
test("faculty and enquiries use calendar and grid without losing their records",async()=>{
  const ctx=await context("ops"); const page=await ctx.newPage();
  for(const [route,scope,name] of [["teachers","faculty","Synthetic teacher"],["admission-queries","enquiries","Synthetic Enquiry"]]){
    await page.goto(`${base}/admin?view=${route}`);
    await page.getByRole("button",{name:"Calendar",exact:true}).click();
    await page.getByRole("button",{name:new RegExp(`Open ${name}`)}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get(`view.${scope}`),"calendar", `${scope}: ${page.url()}`);
    await saveShot(page,`${scope}-calendar-en`);
    await page.reload();
    await page.getByRole("button",{name:new RegExp(`Open ${name}`)}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Calendar",exact:true}).getAttribute("aria-pressed"),"true");
    await page.getByRole("button",{name:"Grid",exact:true}).click();
    await page.getByRole("button",{name:new RegExp(`Open ${name}`)}).click();
    await page.getByRole("dialog").waitFor();
    if(scope === "enquiries") {
      const draft=page.getByRole("textbox",{name:"Log a follow-up",exact:true});
      await draft.fill("Synthetic unsaved follow-up");
      await page.goBack();
      assert.equal(new URL(page.url()).searchParams.get("view.enquiries"),"calendar");
      assert.equal(await draft.inputValue(),"Synthetic unsaved follow-up");
      assert.equal(await db.admissionQueryFollowUp.count({where:{query:{schoolId}}}),0);
    }
  }
});
test("Urdu mobile calendar fits and preserves roster selection",async()=>{
  const page=await (await context("ops-ur",{width:390,height:844})).newPage();
  await page.goto(`${base}/admin?view=students&view.students=calendar&sq=Synthetic%20Ada`);
  await page.locator('[data-record-id]').waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'),"rtl");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await saveShot(page,"roster-calendar-ur-390");
});
test("teacher directory keeps search and class context across layouts",async()=>{
  const page=await (await context("teacher")).newPage();
  await page.goto(`${base}/teacher/students?classId=${class7}&q=Synthetic`);
  await page.getByRole("button",{name:"Grid",exact:true}).click();
  await page.getByRole("button",{name:/Open Synthetic Ada/}).waitFor();
  await page.getByRole("button",{name:"Calendar",exact:true}).focus();
  await page.keyboard.press("Enter");
  assert.equal(new URL(page.url()).searchParams.get("classId"),class7);
  assert.equal(new URL(page.url()).searchParams.get("q"),"Synthetic");
  await saveShot(page,"teacher-calendar-en");
  await page.context().setOffline(true);
  await page.getByRole("button",{name:"Grid",exact:true}).click();
  await page.getByRole("button",{name:/Open Synthetic Ada/}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("q"),"Synthetic");
  await page.context().setOffline(false);
});

test("Arabic mobile calendar retains record identity and fits RTL",async()=>{
  const ctx=await context("ops-ar",{width:390,height:844});
  // Signed-in display language is resolved from the user's preferredLanguage (getDisplayLocale), not the cookie.
  await ctx.addCookies([{ name: "skoolee-lang", value: "ar", domain: "localhost", path: "/" }]);
  const page=await ctx.newPage();
  await page.goto(`${base}/admin?view=students&view.students=calendar&sq=Synthetic%20Ada`);
  // Arabic is the final browser case after several full admin navigations; the
  // dev server may recycle its worker under the CI memory ceiling. Allow that
  // restart to settle before asserting the rendered record.
  await page.locator('[data-record-id]').waitFor({ timeout: 120_000 });
  assert.equal(await page.locator('html').getAttribute('dir'),"rtl");
  assert.equal(await page.locator('[data-record-id]').first().getAttribute('data-record-id'),pupils["Synthetic Ada"]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await saveShot(page,"SKAI-53_03_rtl_AR");
});
