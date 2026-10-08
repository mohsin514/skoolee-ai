import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashSessionToken } from '../../src/lib/auth/session-cookie';
import { SignJWT } from 'jose';
import { prisma } from '../../src/lib/db/prisma';
import { runWithTenantContext } from '../../src/lib/db/tenant-context';
import { assertInitialInstitutionSetup, resolveCurrentPrincipal } from '../../src/lib/auth/principal';
import { runAsCurrentActor } from '../../src/lib/auth/job-policy';
import { assertCommunicationTarget, assertPublishedCommunicationReport } from '../../src/lib/auth/communication-policy';
import { getStudentContext } from '../../src/lib/ai/student-context';
import { ACCESS_DENIED, reportScope, studentScope } from '../../src/lib/auth/policy';
import { USER_ROLES, ROLE_DASHBOARD_PATHS } from '../../src/lib/roles';
import type { AuthUser } from '../../src/lib/auth';

// Never load .env. Both the database and app MUST be local and dedicated.
const dbUrl = new URL(process.env.DATABASE_URL || 'http://invalid');
const appUrl = new URL(process.env.AUTHZ_TEST_APP_URL || 'http://127.0.0.1:3207');
if (!['127.0.0.1','localhost'].includes(dbUrl.hostname) || !dbUrl.pathname.endsWith('/sko207') || dbUrl.port !== '55407') throw new Error('Use dedicated local sko207 database on 55407');
if (!['127.0.0.1','localhost'].includes(appUrl.hostname) || appUrl.port !== '3207') throw new Error('Use isolated app on 3207');
const raw = new PrismaClient();
const key = randomUUID();
const schoolA = `authz-a-${key}`, schoolB = `authz-b-${key}`;
const campusA = randomUUID(), campusB = randomUUID(), foreignCampus = randomUUID();
const classA = randomUUID(), classB = randomUUID(), foreignClass = randomUUID();
const own = randomUUID(), namesake = randomUUID(), sibling = randomUUID(), foreign = randomUUID();
const published = randomUUID(), draft = randomUUID(), publishedReport = randomUUID(), draftReport = randomUUID();
const actors = new Map<string, AuthUser>();
const cookies = new Map<string,string>();
const ctx = (user: AuthUser) => ({ schoolId: user.schoolId, campusId: user.campusId, role: user.role, userId: user.userId });
async function request(role: string, path: string, body?: unknown) {
  return fetch(new URL(path, appUrl), { redirect: 'manual', headers: { cookie: cookies.get(role)!, ...(body ? {'content-type':'application/json'} : {}) }, ...(body ? {method:'POST', body:JSON.stringify(body)} : {}) });
}
before(async () => {
  for (const id of [schoolA, schoolB]) await raw.school.create({ data: {id, name:'Synthetic authorization school', slug:id, regId:id, contactEmail:`${id}@example.invalid`, city:'Synthetic', status:'ACTIVE', plan:'PRO'} });
  for (const [id, schoolId] of [[campusA,schoolA],[campusB,schoolA],[foreignCampus,schoolB]]) await raw.campus.create({data:{id,schoolId,name:'Synthetic campus',city:'Synthetic',regId:id}});
  for (const role of USER_ROLES) {
    const userId=randomUUID();
    const user: AuthUser={mfaVerified:true,userId,schoolId:schoolA,campusId:campusA,role,email:`${userId}@example.invalid`,fullName:'Same pupil name',onboardingComplete:true};
    await raw.user.create({data:{mfaEnabled:true,id:userId,schoolId:schoolA,campusId:campusA,role,email:user.email,fullName:user.fullName!,onboardingComplete:true}});
    actors.set(role,user);
    const token=await new SignJWT({...user}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await raw.loginSession.create({data:{schoolId:schoolA,userId,tokenHash:hashSessionToken(token),expiresAt:new Date(Date.now()+3600_000)}});
    cookies.set(role,`skoolee_token=${token}`);
  }
  for(const [id,campusId,schoolId] of [[classA,campusA,schoolA],[classB,campusB,schoolA],[foreignClass,foreignCampus,schoolB]]) await raw.class.create({data:{id,campusId,schoolId,name:'Synthetic class',academicYear:2026}});
  for(const [id,campusId,classId,schoolId,parentUserId,studentUserId] of [
    [own,campusA,classA,schoolA,actors.get('PARENT')!.userId,actors.get('STUDENT')!.userId],
    [namesake,campusA,classA,schoolA,null,null], [sibling,campusB,classB,schoolA,actors.get('PARENT')!.userId,null], [foreign,foreignCampus,foreignClass,schoolB,null,null],
  ]) await raw.student.create({data:{id:id!,campusId:campusId!,classId:classId!,schoolId:schoolId!,fullName:'Same pupil name',rollNo:id!,gender:'MALE',parentUserId,studentUserId,guardianEmail:actors.get('PARENT')!.email}});
  const subject=await raw.subject.create({data:{schoolId:schoolA,campusId:campusA,classId:classA,name:'Synthetic math'}});
  for(const [id,status] of [[published,'PUBLISHED'],[draft,'DRAFT']]) {
    await raw.exam.create({data:{id,schoolId:schoolA,campusId:campusA,classId:classA,title:status,term:'Term 1',academicYear:2026,status}});
    await raw.mark.create({data:{schoolId:schoolA,campusId:campusA,examId:id,studentId:own,subjectId:subject.id,marksObtained:status==='DRAFT'?99:80}});
    await raw.reportCard.create({data:{id:status==='DRAFT'?draftReport:publishedReport,schoolId:schoolA,campusId:campusA,examId:id,studentId:own,status:status==='DRAFT'?'GENERATED':'PUBLISHED'}});
  }
});
after(async()=>{ await rm("public/generated/reports/sko207-synthetic.pdf",{force:true}); await rm("public/sko207-control.txt",{force:true}); await raw.school.deleteMany({where:{id:{in:[schoolA,schoolB]}}}); await raw.$disconnect(); await prisma.$disconnect(); });

for(const role of USER_ROLES) test(`current principal and server session: ${role}`,async()=>{
  const user=actors.get(role)!;
  assert.equal((await resolveCurrentPrincipal(user))?.role,role);
  const response=await request(role,'/api/auth/session'); assert.equal(response.status,200,await response.text());
});
for(const role of ['PARENT','STUDENT']) {
  test(`${role}: explicit pupil relationship and published AI context`,async()=>{
    const user=actors.get(role)!;
    await runWithTenantContext(ctx(user),async()=>{
      const student=await getStudentContext(user,own); assert.equal(student?.id,own);
      assert.deepEqual(student?.marks.map(m=>m.examId),[published]);
      assert.deepEqual(student?.reportCards.map(r=>r.id),[publishedReport]);
      for(const id of [namesake,foreign]) await assert.rejects(getStudentContext(user,id),{message:ACCESS_DENIED});
      assert.equal(await prisma.reportCard.count({where:{id:draftReport,...reportScope(user)}}),0);
    });
  });
  test(`${role}: report and fee HTTP denial is indistinguishable`,async()=>{
    for(const id of [namesake,foreign,randomUUID()]) {
      for(const path of [`/api/fees/student/${id}`,`/api/reports/download?studentId=${id}`]) {
        const response=await request(role,path); assert.equal(response.status,403,await response.clone().text()); assert.deepEqual(await response.json(),{error:ACCESS_DENIED});
      }
    }
    assert.equal((await request(role,`/api/fees/student/${own}`)).status,200);
    assert.equal((await request(role,`/api/reports?examId=${published}`)).status,403);
    assert.equal((await request(role,`/api/reports/download?reportCardId=${draftReport}`)).status,403);
  });
}
test('parent portal permits explicit cross-campus sibling and denies namesake',async()=>{
  for(const id of [own,sibling]) { const response=await request('PARENT',`/api/parent/data?studentId=${id}`); assert.equal(response.status,200,await response.clone().text()); const body=await response.json(); assert.equal(body.data.selectedStudentId,id); if(id===own) {assert.equal(body.data.reportCards.length,1);assert.equal(body.data.marksByExam.length,1);} }
  for(const id of [namesake,foreign,randomUUID()]) { const response=await request('PARENT',`/api/parent/data?studentId=${id}`);assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:ACCESS_DENIED}); }
});
test('campus staff cannot read or write another campus via nested or bulk identifiers',async()=>{
 const user=actors.get('CAMPUS_ADMIN')!;
 await runWithTenantContext(ctx(user),async()=>{
  assert.equal(await prisma.student.count({where:{id:sibling}}),0);
  await assert.rejects(prisma.student.update({where:{id:own},data:{classId:classB}}));
  await assert.rejects(prisma.student.update({where:{id:own},data:{class:{connect:{id:classB}}}}));
  await assert.rejects(prisma.student.update({where:{id:own},data:{campus:{connect:{id:campusB}}}}));
  await assert.rejects(prisma.class.update({where:{id:classA},data:{students:{connect:{id:foreign}}}}));
  await assert.rejects(prisma.student.createMany({data:[{id:randomUUID(),campusId:campusA,classId:classA,fullName:'Bulk safe',rollNo:'bulk-safe',gender:'MALE'},{campusId:campusA,classId:foreignClass,fullName:'Bulk denied',rollNo:'bulk-denied',gender:'MALE'}]}));
 });
 assert.equal(await raw.student.count({where:{schoolId:schoolA,rollNo:'bulk-safe'}}),0);
 assert.equal((await request('CAMPUS_ADMIN',`/api/parent/token`,{studentId:sibling})).status,403);
 assert.equal((await request('CAMPUS_ADMIN',`/api/reports/download?studentId=${sibling}`)).status,403);
});
test('teacher reassignment, disabling and role changes take effect with existing cookie',async()=>{
 const user=actors.get('TEACHER')!;
 await raw.user.update({where:{id:user.userId},data:{campusId:campusB}});
 assert.equal((await resolveCurrentPrincipal(user))?.campusId,campusB);
 assert.equal((await request('TEACHER',`/api/ai/insights?campusId=${campusA}`)).status,403);
 await raw.user.update({where:{id:user.userId},data:{isActive:false}});
 assert.equal(await resolveCurrentPrincipal(user),null); assert.equal((await request('TEACHER','/api/auth/session')).status,401);
 await raw.user.update({where:{id:user.userId},data:{isActive:true,role:'LIBRARIAN'}});
 assert.equal(await resolveCurrentPrincipal(user),null);assert.equal((await request('TEACHER','/api/auth/session')).status,401);
 await raw.user.update({where:{id:user.userId},data:{role:'TEACHER',campusId:campusA}});
});
test('signed parent capability runs every portal query under its school',async()=>{
 const response=await request('CAMPUS_ADMIN','/api/parent/token',{studentId:own}); assert.equal(response.status,200,await response.clone().text());
 const {token}=await response.json();
 const report=await fetch(new URL(`/api/reports/download?token=${token}&reportCardId=${publishedReport}`,appUrl));assert.equal(report.status,200,await report.clone().text());
 const hidden=await fetch(new URL(`/api/reports/download?token=${token}&reportCardId=${draftReport}`,appUrl));assert.equal(hidden.status,403);
 for(const path of ['data','timetable','exam-datesheet']) { const result=await fetch(new URL(`/api/parent/${path}?token=${token}`,appUrl));assert.equal(result.status,200,await result.text()); }
});

test('legitimate nested updates and references to earlier transaction writes succeed', async()=>{
 const user=actors.get('CAMPUS_ADMIN')!;
 await runWithTenantContext(ctx(user), async()=>{
   await prisma.student.update({where:{id:own},data:{class:{update:{name:'Synthetic nested class'}}}});
   await prisma.class.update({where:{id:classA},data:{students:{update:{where:{id:own},data:{guardianName:'Synthetic guardian'}}}}});
   await prisma.$transaction(async(tx)=>{
     const created=await tx.class.create({data:{campusId:campusA,name:'Transaction class',academicYear:2026}});
     await tx.student.create({data:{campusId:campusA,classId:created.id,fullName:'Transaction child',rollNo:randomUUID(),gender:'MALE'}});
   });
 });
});
test('exports, search scope, attachment signing and job status enforce current permissions',async()=>{
 assert.equal((await request('PARENT','/api/students/export')).status,403);
 assert.equal((await request('STUDENT','/api/fees/generation-job/invoice-gen-2026-10')).status,403);
 assert.equal((await request('CAMPUS_ADMIN',`/api/students/export?campusId=${campusB}`)).status,403);
 const csv=await request('CAMPUS_ADMIN',`/api/students/export?search=Same`);assert.equal(csv.status,200);const text=await csv.text();assert.ok(text.includes(own));assert.ok(!text.includes(sibling));assert.ok(!text.includes(foreign));
 const attachment=await request('CAMPUS_ADMIN','/api/chat/attachments',{conversationId:randomUUID(),fileName:'synthetic.pdf',contentType:'application/pdf',sizeBytes:128});assert.ok([403,404].includes(attachment.status));
});

test('all temporary roles render desktop and mobile dashboard layouts', {timeout: 180000}, async()=>{
 const { chromium } = await import('playwright');
 const browser=await chromium.launch({headless:true});
 try {
  for(const role of USER_ROLES) {
   const context=await browser.newContext({viewport:{width:1440,height:960}});
   await context.addCookies([{name:'skoolee_token',value:cookies.get(role)!.split('=')[1],url:appUrl.origin}]);
   const page=await context.newPage();
   const response=await page.goto(new URL(ROLE_DASHBOARD_PATHS[role],appUrl).href,{waitUntil:'domcontentloaded'});
   assert.ok(response && response.status()<400,`${role} desktop status ${response?.status()}`);
   await page.waitForFunction(() => document.body.innerText.trim().length > 200, null, {timeout:20000});
   const rendered=await page.locator('body').innerText();
   assert.ok(!rendered.includes('Application error'),`${role} server render`);
   if(role==='STUDENT' || role==='PARENT') await page.getByText('Same pupil name',{exact:false}).first().waitFor({state:'visible',timeout:20000});
   await page.waitForTimeout(400); // Let the existing dashboard entrance animation settle.
   await page.screenshot({path:`/tmp/sko207-${role.toLowerCase()}-desktop.png`,fullPage:true});
   await page.setViewportSize({width:768,height:1024});
   await page.screenshot({path:`/tmp/sko207-${role.toLowerCase()}-tablet.png`,fullPage:true});
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:`/tmp/sko207-${role.toLowerCase()}-mobile.png`,fullPage:true});
   await context.close();
  }
 } finally {await browser.close();}
});

test('notification service rechecks guardian recipient and publication before any delivery',async()=>{
 await runWithTenantContext(ctx(actors.get('CAMPUS_ADMIN')!),async()=>{
  await assertCommunicationTarget({schoolId:schoolA,studentId:own,parentUserId:actors.get('PARENT')!.userId,recipient:actors.get('PARENT')!.email},'EMAIL');
  await assert.rejects(assertCommunicationTarget({schoolId:schoolA,studentId:own,recipient:'other-family@example.invalid'},'EMAIL'));
  await assert.rejects(assertCommunicationTarget({schoolId:schoolA,studentId:foreign},'EMAIL'));
  await assert.rejects(assertPublishedCommunicationReport(draftReport,own));
 });
});
test('report links remain protected after guardian unlink and legacy public paths are unavailable',async()=>{
 const response=await request('PARENT',`/api/reports/download?reportCardId=${publishedReport}`);assert.equal(response.status,200);
 const {pdfUrl}=await response.json();assert.ok(pdfUrl.startsWith('/api/reports/download?'));
 await raw.student.update({where:{id:own},data:{parentUserId:null}});
 assert.equal((await request('PARENT',pdfUrl)).status,403);
 await raw.student.update({where:{id:own},data:{parentUserId:actors.get('PARENT')!.userId}});
 const control=await request('CAMPUS_ADMIN','/sko207-control.txt');assert.equal(control.status,200,'Run tests/authorization/prepare.mjs before starting the app');assert.equal(await control.text(),'SYNTHETIC STATIC CONTROL');
 for(const prefix of ['/generated/reports/', '/generated/%72eports/', '/generated%2Freports/', '/generated%5Creports%5C', '/generated/%2572eports/', '/generated/other/../reports/']) {
  const result=await fetch(new URL(`${prefix}sko207-synthetic.pdf`,appUrl),{redirect:'manual'});assert.equal(result.status,404,prefix);assert.ok(!(await result.text()).includes('SYNTHETIC LEGACY REPORT'));
 }
});

test('queued actor is reauthorized at execution after reassignment and deactivation',async()=>{
 const user=actors.get('TEACHER')!;
 await raw.user.update({where:{id:user.userId},data:{campusId:campusB}});
 assert.equal(await runAsCurrentActor(schoolA,user.userId,'ai','add',()=>prisma.student.count({where:{id:own}})),0);
 await raw.user.update({where:{id:user.userId},data:{isActive:false}});
 await assert.rejects(runAsCurrentActor(schoolA,user.userId,'ai','add',async()=>true));
 await raw.user.update({where:{id:user.userId},data:{isActive:true,campusId:campusA}});
});

test('institution setup admits only the active unfinished registered owner',async()=>{
 const user=actors.get('ADMIN')!;
 await assert.rejects(assertInitialInstitutionSetup(user));
 await assert.rejects(assertInitialInstitutionSetup({...user,onboardingComplete:false}));
 const previous=(await raw.school.findUniqueOrThrow({where:{id:schoolA}})).contactEmail;
 await raw.school.update({where:{id:schoolA},data:{contactEmail:user.email}});
 await assertInitialInstitutionSetup({...user,onboardingComplete:false});
 await assert.rejects(assertInitialInstitutionSetup({...user,role:'TEACHER',onboardingComplete:false}));
 await raw.school.update({where:{id:schoolA},data:{contactEmail:previous}});
});
