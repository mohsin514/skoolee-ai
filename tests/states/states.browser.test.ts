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

// Synthetic local acceptance for SCRUM-308. Never run against a shared/production database.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.STATES_TEST_APP || "http://localhost:3109";
const evidence = process.env.STATES_EVIDENCE_DIR || "/tmp/scrum308/evidence";
const db = new PrismaClient(), password = "SyntheticStates308!";
const schoolId = `states308-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
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
  const login = await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password, schoolId } });
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

const otherSchool = `states308-${randomUUID()}`;
before(async()=>{
  await mkdir(evidence,{recursive:true});
  for(const id of [schoolId,otherSchool]) await db.school.create({data:{id,name:"Synthetic States School",slug:id,regId:id,contactEmail:`${id}@example.invalid`,city:"Lahore",status:"ACTIVE",plan:"PRO"}});
  for(const [id,school,name] of [[campusA,schoolId,"North"],[campusB,otherSchool,"South"]]) await db.campus.create({data:{id,schoolId:school,name,regId:id,city:"Lahore"}});
  await db.campus.create({data:{id:campusC,schoolId,name:"Other campus",regId:campusC,city:"Lahore"}});
  await db.academicCycle.create({data:{schoolId,campusId:campusA,label:"2026",academicYear:2026,status:"ACTIVE"}});
  const learner = await user("learner", "STUDENT");
  await user("librarian","LIBRARIAN"); await user("ops","CAMPUS_ADMIN"); await user("parent","PARENT"); await user("ops-ur","CAMPUS_ADMIN",campusA,"ur"); const teacher=await user("teacher","TEACHER");
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

test("search keeps query while showing exclusive server, timeout, denial and recovered success states",async()=>{
  const ctx=await context("ops"), page=await ctx.newPage();
  let status=503;
  await page.route("**/api/search?**",async route=>{
    if(new URL(route.request().url()).searchParams.has("options")) return route.continue();
    if(status===200) return route.continue();
    await route.fulfill({status,body:"<html>private diagnostic</html>",contentType:"text/html"});
  });
  await page.goto(`${base}/search?q=Synthetic`);
  await page.locator('[data-failure-kind="provider"]').waitFor();
  assert.equal(await page.getByRole("searchbox").inputValue(),"Synthetic");
  assert.equal(await page.locator("[data-search-empty], [data-search-result]").count(),0);
  assert.equal(await page.getByText("private diagnostic").count(),0);
  await saveShot(page,"search-provider-en");
  status=504; await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.locator('[data-failure-kind="timeout"]').waitFor();
  status=200; await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.locator("[data-search-result]").first().waitFor();
  await saveShot(page,"search-success-en");
  status=403; await page.getByRole("searchbox").fill("Synthetic denied");
  await page.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await page.locator("[data-search-result], [data-search-empty]").count(),0);
  assert.equal(await page.getByRole("searchbox").inputValue(),"Synthetic denied");
  await saveShot(page,"search-denied-en");
  await ctx.close();
});
test("search has a no-match result and preserves Urdu mobile query after refresh",async()=>{
  const ctx=await context("ops-ur",{width:390,height:844}),page=await ctx.newPage();
  await page.goto(`${base}/search?q=NothingMatches308`);
  await page.locator("[data-search-empty]").waitFor();
  await page.reload(); await page.locator("[data-search-empty]").waitFor();
  assert.equal(await page.getByRole("searchbox").inputValue(),"NothingMatches308");
  assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await saveShot(page,"search-no-match-ur-mobile"); await ctx.close();
});
test("library permission denial never renders an empty catalogue and keeps the open draft",async()=>{
  const ctx=await context("librarian"),page=await ctx.newPage();
  await page.goto(`${base}/librarian?view=catalogue&section=books`);
  await page.getByRole("button",{name:/Add book|Add title/i}).first().click();
  const title=page.getByLabel("Title",{exact:true}); await title.fill("Unsaved draft 308");
  await page.route("**/api/library/books?**",route=>route.fulfill({status:403,json:{success:false,error:"denied"}}));
  await page.getByPlaceholder(/Search/i).first().fill("denied");
  await page.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await title.inputValue(),"Unsaved draft 308");
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
  await saveShot(page,"library-denied-draft-en");
  await page.unroute("**/api/library/books?**");
  await page.getByPlaceholder(/Search/i).first().fill("recovered");
  await page.locator('section[data-resource-state="denied"]').waitFor({state:"hidden"});
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent === "Save" && !button.disabled));
  assert.equal(await title.inputValue(),"Unsaved draft 308");
  await ctx.close();
});
test("direct APIs deny families and cross-tenant/campus scope without leaking records",async()=>{
  const ops=await context("ops"),parent=await context("parent"),librarian=await context("librarian");
  assert.equal((await parent.request.get(`${base}/api/search?q=Synthetic`)).status(),403);
  for(const path of ["/api/library/books","/api/inventory/items"]){
    for(const campusId of [campusB,campusC]) assert.ok([403,404].includes((await librarian.request.get(`${base}${path}?campusId=${campusId}`)).status()));
  }
  for (const classId of [classB, classC]) {
    const denied = await ops.request.get(`${base}/api/timetable/class?classId=${classId}`);
    assert.equal(denied.status(), 404);
    assert.ok(!(await denied.text()).includes("Other campus class"));
  }
  assert.equal((await ops.request.get(`${base}/api/timetable/class?classId=${class7}`)).status(), 200);
  const response=await ops.request.get(`${base}/api/search?q=Synthetic`);assert.equal(response.status(),200);assert.ok(!(await response.text()).includes("Synthetic Private"));
});

test("library validates locally, suppresses duplicate submissions and preserves a rejected draft",async()=>{
  const ctx=await context("librarian"),page=await ctx.newPage();
  let posts=0;
  await page.route("**/api/library/books",async route=>{
    if(route.request().method()!=="POST") return route.continue();
    posts++; await new Promise(resolve=>setTimeout(resolve,250));
    await route.fulfill({status:409,json:{success:false,error:"This record has changed"}});
  });
  await page.goto(`${base}/librarian?view=catalogue&section=books`);
  await page.getByRole("button",{name:"Add book",exact:true}).click();
  await page.getByRole("button",{name:"Save",exact:true}).click();
  assert.equal(posts,0,"invalid title does not submit");
  await page.getByLabel("Title",{exact:true}).fill("Draft after conflict");
  await page.getByRole("button",{name:"Save",exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
  await page.getByText("This record has changed",{exact:true}).waitFor();
  assert.equal(posts,1,"same-tick duplicate blocked before React renders");
  assert.equal(await page.getByLabel("Title",{exact:true}).inputValue(),"Draft after conflict");
  await saveShot(page,"library-validation-conflict-en"); await ctx.close();
});

test("offline search retains input and keyboard retry recovers in place",async()=>{
  const ctx=await context("ops"),page=await ctx.newPage();
  await page.goto(`${base}/search?q=Synthetic`); await page.locator("[data-search-result]").first().waitFor();
  await ctx.setOffline(true); await page.getByRole("searchbox").fill("Offline308");
  await page.locator('[data-failure-kind="offline"]').waitFor();
  assert.equal(await page.locator('[data-search-result], [data-search-empty]').count(),0);
  assert.equal(await page.getByRole("searchbox").inputValue(),"Offline308");
  await saveShot(page,"search-offline-en"); await ctx.setOffline(false);
  const retry=page.getByRole("button",{name:"Try again",exact:true}); await retry.focus(); await retry.press("Enter");
  await page.locator('[data-search-empty]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get("q"),"Offline308"); await ctx.close();
});
test("library shows loading then no-data and a distinct no-match with useful next steps",async()=>{
  const ctx=await context("librarian"),page=await ctx.newPage();
  let release:()=>void=()=>{}; const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/library/books?**",async route=>{await pending;await route.continue();});
  await page.goto(`${base}/librarian?view=catalogue&section=books`,{waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"Add book",exact:true}).waitFor();
  await page.locator('[aria-busy="true"]').first().waitFor();
  await saveShot(page,"library-loading-en"); release();
  await page.locator('[data-resource-state="no-data"]').waitFor();
  await saveShot(page,"library-no-data-en");
  await page.getByPlaceholder(/Search/i).first().fill("NoMatch308");
  await page.locator('[data-resource-state="no-match"]').waitFor();
  await saveShot(page,"library-no-match-en");await ctx.close();
});

test("staff leave and academic room loaders distinguish denied responses from empty results",async()=>{
  const teacher=await context("teacher"),leave=await teacher.newPage();
  await leave.route("**/api/leave?mode=my",route=>route.fulfill({status:403,json:{error:"denied"}}));
  await leave.goto(`${base}/teacher/leave`); await leave.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await leave.getByRole("button",{name:"Apply for leave",exact:true}).isEnabled(),false);
  await saveShot(leave,"teacher-leave-denied-en"); await teacher.close();
  const ops=await context("ops"),rooms=await ops.newPage();
  await rooms.route("**/api/academic/rooms**",route=>route.fulfill({status:403,json:{error:"denied"}}));
  await rooms.goto(`${base}/admin?view=settings&tab=rooms`); await rooms.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await rooms.getByText("No rooms yet",{exact:true}).count(),0);
  await saveShot(rooms,"academic-rooms-denied-en");await ops.close();
});


test("learner timetable distinguishes dependency failure, denied access and unpublished data", async () => {
  const ctx = await context("learner"), page = await ctx.newPage();
  let status = 503;
  await page.route("**/api/timetable/class", route => route.fulfill({status: status === 403 ? 403 : 200, json: status === 403 ? {success:false} : {success:true,data:null}}));
  await page.route("**/api/academic/calendar", route => status === 503 ? route.fulfill({status:503,body:"Unavailable"}) : route.continue());
  await page.goto(`${base}/student/timetable`);
  await page.locator('[data-failure-kind="provider"]').waitFor();
  assert.equal(await page.getByText("No timetable published", {exact:true}).count(), 0);
  status = 403;
  await page.getByRole("button", {name:"Try again",exact:true}).click();
  await page.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await page.getByText("No timetable published", {exact:true}).count(), 0);
  await saveShot(page, "learner-timetable-denied-en");
  status = 200;
  await page.reload();
  await page.getByText("No timetable published", {exact:true}).waitFor();
  await page.route("**/api/student/exam-timeline", route => route.fulfill({status:503,body:"Unavailable"}));
  await page.reload();
  const timeline = page.locator("[data-my-next-paper]");
  await timeline.locator('[data-failure-kind="provider"]').waitFor();
  await saveShot(page, "learner-exam-timeline-provider-en");
  await page.unroute("**/api/student/exam-timeline");
  await timeline.getByRole("button", {name:"Try again",exact:true}).click();
  await timeline.getByText("No exams on your date sheet yet.", {exact:true}).waitFor();
  await ctx.close();
});


test("every application role loads its allowed dashboard without runtime failure", async () => {
  for (const role of USER_ROLES) {
    const key = roleKeys[role], ctx = await context(key), page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const failures: string[] = [];
    page.on("pageerror", error => failures.push(error.message));
    const response = await page.goto(base + ROLE_DASHBOARD_PATHS[role]);
    assert.ok(response && response.status() < 400, role + " document response");
    await page.locator("[data-boot-splash]").waitFor({state:"hidden"});
    await page.locator("[data-role-shell]").waitFor();
    await page.locator("main").waitFor();
    assert.ok(new URL(page.url()).pathname.startsWith(ROLE_DASHBOARD_PATHS[role]), role + " allowed route");
    assert.equal(await page.getByText(/Application error:|Couldn.t load your portal/).count(), 0, role);
    assert.deepEqual(failures, [], role + " runtime errors");
    await saveShot(page, `dashboard-${role.toLowerCase()}-en`);
    await ctx.close();
  }
});

test("family fee failures clear header claims and teacher calendar failure is explicit", async () => {
  for (const key of ["parent", "learner"]) {
    const ctx = await context(key), page = await ctx.newPage();
    await page.route("**/api/fees/family-statement**", route => route.fulfill({status:403,json:{success:false}}));
    await page.goto(`${base}/${key === "learner" ? "student" : "parent"}/fees`);
    await page.locator('section[data-resource-state="denied"]').waitFor().catch(async error => { await page.screenshot({path:`${evidence}/${key}-fees-failed.png`,fullPage:true}); console.log(key, page.url(), await page.locator('main').innerText()); throw error; });
    assert.equal(await page.getByText("All fees cleared", {exact:true}).count(), 0);
    assert.equal(await page.locator("[data-family-statement]").count(), 0);
    await saveShot(page, `${key}-fees-denied-en`);
    await ctx.close();
  }
  const ctx = await context("teacher"), page = await ctx.newPage();
  await page.route("**/api/academic/calendar", route => route.fulfill({status:503,body:"Unavailable"}));
  await page.goto(`${base}/teacher/timetable`);
  await page.locator('[data-failure-kind="provider"]').first().waitFor();
  assert.equal(await page.getByText("No published timetable yet", {exact:true}).count(), 0);
  await page.unroute("**/api/academic/calendar");
  await page.getByRole("button",{name:"Try again",exact:true}).first().click();
  await page.getByText("No published timetable yet", {exact:true}).waitFor();
  await ctx.close();
});

test("front desk queue rejects a failed dependency instead of reporting an empty queue", async () => {
  const ctx = await context("receptionist"), page = await ctx.newPage();
  await page.route("**/api/front-desk/phone-calls?**", route => route.fulfill({status:503,body:"Unavailable"}));
  await page.goto(`${base}/receptionist`);
  const queue = page.locator("[data-front-desk-queue]");
  await queue.locator('[data-failure-kind="provider"]').waitFor();
  assert.equal(await queue.getByText("Nothing is waiting on you.", {exact:true}).count(),0);
  await page.unroute("**/api/front-desk/phone-calls?**");
  await queue.getByRole("button",{name:"Try again",exact:true}).click();
  await queue.getByText("Nothing is waiting on you.", {exact:true}).waitFor();
  await ctx.close();
});

test("notification failures never announce an unsaved seen action", async () => {
  const ctx = await context("teacher"), page = await ctx.newPage();
  const item = {id:"synthetic-notification-308",title:"Synthetic action",message:"Review synthetic work",link:"/teacher",isRead:false,createdAt:new Date().toISOString(),actorName:null,category:"ACTION",state:"open",overdue:false,dueAt:null,resolution:null,reminderCount:0};
  let status = 503, patches = 0;
  await page.route("**/api/notifications?**", route => route.fulfill({json:{success:true,notifications:[item],unreadCount:1,counts:{unread:1,mentionsUnread:0,openActions:1,overdueActions:0}}}));
  await page.route("**/api/notifications", async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    patches++; await new Promise(resolve => setTimeout(resolve,200));
    await route.fulfill({status,json:{success:status === 200,readCount:status === 200 ? 1 : 0}});
  });
  await page.goto(`${base}/teacher`);
  await page.locator('[data-tour="shell.header.notifications"]').click();
  const center = page.locator("[data-notification-center]"), row = center.locator('[data-notification="synthetic-notification-308"]');
  const seen = center.getByRole("button",{name:"Mark Synthetic action as seen",exact:true});
  await seen.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await row.getByText("A service is unavailable",{exact:true}).waitFor();
  assert.equal(patches,1);
  assert.equal(await row.getAttribute("data-read"),"false");
  assert.equal(await row.getByText("Marked seen. The task is still waiting for you.",{exact:true}).count(),0);
  await saveShot(page,"notification-save-failure-en");
  status=200; await seen.click();
  await row.getByText("Marked seen. The task is still waiting for you.",{exact:true}).waitFor();
  assert.equal(await row.getAttribute("data-read"),"true");
  assert.equal(patches,2);
  await ctx.close();
});

test("calendar dependency errors recover and denied owner reports disable export", async () => {
  const ctx = await context("teacher"), page = await ctx.newPage();
  await page.route("**/api/academic/calendar/unified?**", route => route.fulfill({status:503,body:"Unavailable"}));
  await page.goto(`${base}/teacher/calendar`);
  await page.locator('[data-failure-kind="provider"]').waitFor();
  await saveShot(page,"calendar-provider-en");
  await page.unroute("**/api/academic/calendar/unified?**");
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.locator('[data-failure-kind="provider"]').waitFor({state:"hidden"});
  await ctx.close();
  const owner = await context("app_owner"), report = await owner.newPage();
  await report.route("**/api/owner/capacity",route => route.fulfill({status:403,json:{success:false}}));
  await report.goto(`${base}/owner?view=capacity`);
  await report.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await report.getByRole("button",{name:"Export",exact:true}).isDisabled(),true);
  await saveShot(report,"owner-report-denied-en");
  await owner.close();
});

test("family result-note reads show failure and retry instead of silently disappearing", async () => {
  const ctx = await context("parent"), page = await ctx.newPage();
  await page.route("**/api/parent/result-notes**", route => route.fulfill({status:503,body:"Unavailable"}));
  await page.goto(`${base}/parent/results`);
  await page.locator('[data-failure-kind="provider"]').waitFor();
  await saveShot(page,"family-notes-provider-en");
  await page.unroute("**/api/parent/result-notes**");
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.locator('[data-failure-kind="provider"]').waitFor({state:"hidden"});
  assert.equal(await page.locator("[data-family-notes]").count(),0);
  await ctx.close();
});

test("staff trip queue rejects permission failures and recovers to a true empty list", async () => {
  const ctx = await context("ops"), page = await ctx.newPage();
  await page.route("**/api/trips", route => route.fulfill({status:403,json:{success:false}}));
  await page.goto(`${base}/admin?view=attendance&tab=trips`);
  await page.locator('section[data-resource-state="denied"]').waitFor();
  assert.equal(await page.getByText("No trips yet.",{exact:true}).count(),0);
  await saveShot(page,"staff-trips-denied-en");
  await page.unroute("**/api/trips"); await page.reload();
  await page.getByText("No trips yet.",{exact:true}).waitFor();
  await ctx.close();
});

test("integration delivery failures preserve filters and never report no deliveries", async () => {
  const ctx = await context("super_admin"), page = await ctx.newPage();
  let failed = true;
  await page.route("**/api/integrations?**", route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("view") === "connections") return route.fulfill({json:{success:true,data:{campuses:[],scopes:[],topics:[],contract:{version:"1",status:"CURRENT"},connections:[{id:"synthetic308",name:"Synthetic connection",campusIds:[],scopes:[],topics:[],contractVersion:"1",status:"ACTIVE",webhookHost:"example.invalid",rateLimitPerMinute:1,dailyQuota:1,signingRotating:false,keys:[],deliveries:{}}]}}});
    return failed ? route.fulfill({status:503,body:"Unavailable"}) : route.fulfill({json:{success:true,data:[]}});
  });
  await page.goto(`${base}/super?view=settings&tab=integrations`);
  await page.getByRole("button",{name:"Deliveries",exact:true}).click();
  const deliveries = page.locator("[data-deliveries]");
  await deliveries.locator('[data-failure-kind="provider"]').waitFor();
  assert.equal(await deliveries.getByText("No deliveries yet.",{exact:true}).count(),0);
  await deliveries.locator("select").selectOption("FAILED");
  await deliveries.locator('[data-failure-kind="provider"]').waitFor();
  assert.equal(await deliveries.locator("select").inputValue(),"FAILED");
  await saveShot(page,"integration-delivery-provider-en");
  failed=false; await deliveries.getByRole("button",{name:"Try again",exact:true}).click();
  await deliveries.locator('[data-resource-state="no-match"]').waitFor();
  assert.equal(await deliveries.locator("select").inputValue(),"FAILED");
  await deliveries.getByRole("button",{name:"Clear filters",exact:true}).click();
  await deliveries.locator('[data-resource-state="no-data"]').waitFor();
  await ctx.close();
});
