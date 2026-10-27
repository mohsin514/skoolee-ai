import { PLATFORM_DEFAULT_DELIVERY_POLICY } from '../../src/lib/school-ai/delivery-policy';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { chromium, expect, test } from '@playwright/test';
import { resetDemoTenant, DEMO_SCHOOL_ID } from '../../scripts/demo/reset-demo-tenant';
import { captureEvidence } from './screenshot-evidence';
const db=new PrismaClient(), origin=process.env.SCHOOL_AI_TEST_ORIGIN || 'http://localhost:3106', password=process.env.DEMO_PASSWORD!;
assert.match(process.env.DATABASE_URL ?? '', /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/, 'Use only a disposable loopback database');
assert(password, 'DEMO_PASSWORD is required');
const headers={Origin:origin}, root=process.env.SKO_HOD_SHOTS || 'test-results/hod-review', checks:any[]=[], images:string[]=[];
let browser:any, activePage:any;
const pass=(name:string,detail:any={})=>{checks.push({name,passed:true,...detail});console.log('PASS',name)};
async function call(ctx:any,method:string,path:string,data?:any,status?:number){const r=await ctx.request.fetch(path,{method,headers,...(data===undefined?{}:{data})});const b=await r.json();assert(status?r.status()===status:r.ok(),`${method} ${path} ${r.status()} ${JSON.stringify(b)}`);return b;}
async function login(email:string){const ctx=await browser.newContext({baseURL:origin,viewport:{width:1440,height:1000},reducedMotion:'reduce'});const b=await call(ctx,'POST','/api/auth/login',{email,password});if(b.mfaRequired)await call(ctx,'POST','/api/auth/mfa',{action:'defer'});await call(ctx,'POST','/api/auth/welcome',{});await call(ctx,'POST','/api/auth/tour',{tourId:'teacher',version:1,status:'dismissed'});await ctx.addCookies([{name:'skoolee-lang',value:'en',url:origin}]);return ctx;}
async function shot(target:any,name:string){const pg='page' in target?target.page():target;await pg.locator('[data-boot-splash]').waitFor({state:'hidden'});if(await pg.locator('[data-guide-scroll]').count())await pg.keyboard.press('Escape');await captureEvidence(target,{path:`${root}/screenshots/${name}.png`});images.push(name);}
async function home(ctx:any){const p=await ctx.newPage();p.setDefaultTimeout(15000);activePage=p;await p.goto('/teacher');await p.locator('[data-boot-splash]').waitFor({state:'hidden'});await p.keyboard.press('Escape');return p;}
async function denied(ctx:any,path:string,data:any,name:string){const r=await ctx.request.post(path,{headers,data});assert([403,404].includes(r.status()),`${name}: ${r.status()} ${await r.text()}`);pass(name,{status:r.status()});}

test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{await mkdir(root,{recursive:true});});
async function coreScenario(){checks.length=0;images.length=0;
try{
 await resetDemoTenant(db,password);
 const hod=await db.user.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,email:'demo-hod@example.invalid'}});
 await db.user.update({where:{id:hod.id},data:{fullName:'[Synthetic demo] Ayesha Khan · HOD Science',preferredLanguage:'en'}});
 await db.user.updateMany({where:{schoolId:DEMO_SCHOOL_ID},data:{preferredLanguage:'en'}});
 const dept=await db.department.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,headId:hod.id}});
 const teacher=await db.user.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,email:'demo-teacher@example.invalid'}});
 const outsider=await db.user.create({data:{schoolId:DEMO_SCHOOL_ID,campusId:hod.campusId,role:'TEACHER',email:'demo-unrelated-hod-review@example.invalid',password:teacher.password,fullName:'[Synthetic demo] Unrelated teacher',isActive:true,onboardingComplete:true,preferredLanguage:'en'}});
 pass('Fresh HOD account created with TEACHER login role and HEAD membership',{email:hod.email,department:dept.name});
 browser=await chromium.launch({headless:true});
 const h=await login(hod.email),t=await login(teacher.email),p=await login('demo-principal@example.invalid'),u=await login(outsider.email);
 const tp=await home(t);await expect(tp.locator('[data-department-queue]')).toHaveCount(0);await expect(tp.locator('[data-moderation-queue]')).toHaveCount(0);await shot(tp,'01-subject-teacher-home');pass('Subject teacher has no department approval or moderation queue');
 const hp=await home(h);await expect(hp.locator('[data-department-queue]')).toBeVisible();await shot(hp.locator('[data-department-queue]'),'02-new-hod-empty-queue');
 const cur=await db.schoolAiRecord.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,kind:'CURRICULUM',status:'APPROVED'}});const cd=cur.data as any;
 const source=(await call(t,'POST','/api/school-ai/workspace',{kind:'SOURCE',title:'[Synthetic demo] HOD review syllabus source',idempotencyKey:randomUUID(),data:{extractedText:'Unit 1: Plants\n1.1 Explain photosynthesis',documentKind:'syllabus',fileName:'hod-review.txt',mimeType:'text/plain',subjectId:cd.subjectId,classId:cd.classId,origin:'manual',extractionStatus:'manual'}})).record;
 await call(t,'PATCH',`/api/school-ai/workspace/${source.id}`,{version:source.version,action:'review'});
 const curriculum=(await call(t,'POST','/api/school-ai/workspace',{kind:'CURRICULUM',title:'[Synthetic demo] Science syllabus for HOD approval',idempotencyKey:randomUUID(),data:cd})).record;
 await call(t,'PATCH',`/api/school-ai/workspace/${curriculum.id}`,{version:curriculum.version,action:'review'});
 const queue=(await call(h,'GET','/api/school-ai/department-approvals')).queue;assert.equal(queue.approvals.length,2);
 await denied(t,'/api/school-ai/department-approvals',{recordId:curriculum.id,version:2},'Author cannot use HOD approval endpoint on own work');
 await denied(u,'/api/school-ai/department-approvals',{recordId:curriculum.id,version:2},'Unrelated teacher cannot approve departmental work');
 const next=await call(h,'GET','/api/school-ai/studio/next-step');assert.equal(next.step.kind,'APPROVE');assert.equal(next.href,'/teacher#department-queue');pass('HOD next-step prioritises pending departmental approval',{href:next.href});
 await hp.reload();await expect(hp.locator('[data-department-queue] li')).toHaveCount(2);await shot(hp.locator('[data-department-queue]'),'03-hod-source-and-syllabus-pending');
 for(const rec of [source,curriculum]){await hp.locator('[data-department-queue] li').filter({hasText:rec.title}).getByRole('button',{name:'Open',exact:true}).click();await expect(hp.locator('[data-department-preview]')).toBeVisible();await shot(hp.locator('[data-department-preview]'),`03-preview-${rec.kind.toLowerCase()}`);await hp.locator('[data-department-preview]').getByRole('button',{name:'Approve',exact:true}).click();await expect(hp.locator('[data-department-queue] li').filter({hasText:rec.title})).toHaveCount(0);assert.equal((await db.schoolAiRecord.findUniqueOrThrow({where:{id:rec.id}})).status,'APPROVED');pass(`HOD approves ${rec.kind} through UI`);}
 await shot(hp.locator('[data-department-queue]'),'04-approvals-completed');
 const line=(await call(t,'GET',`/api/school-ai/teaching-progress?subjectId=${cd.subjectId}&classId=${cd.classId}`)).line;
 const latest=await db.schoolAiRecord.findUniqueOrThrow({where:{id:curriculum.id}});
 const moved=await call(t,'POST','/api/school-ai/teaching-progress/line',{subjectId:cd.subjectId,classId:cd.classId,curriculumId:latest.id,curriculumVersion:latest.version,upToOutcomeId:'outcome-8',taughtOn:new Date(Date.now()-86400000).toISOString().slice(0,10)});
 assert.equal(moved.line.moved.flagged,true);await hp.reload();await expect(hp.locator('[data-department-queue]')).toContainText('Teaching Line jumps');await shot(hp.locator('[data-department-queue]'),'05-hod-teaching-progress-alert');pass('Real multi-unit teaching-line move appears in HOD alert queue');
 const session=await db.examSession.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID}});await call(p,'POST',`/api/academic/exam-sessions/${session.id}/paper-slots`,{});
 const slot=await db.examPaperSlot.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID}});assert.equal(slot.moderatorUserId,hod.id);await db.examPaperSlot.update({where:{id:slot.id},data:{totalMarks:5,durationMinutes:20}});pass('New paper request automatically assigns department head as moderator');
 const original=await db.schoolAiRecord.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,kind:'PAPER',status:'APPROVED'}});
 const paper=(await call(t,'POST','/api/school-ai/workspace',{kind:'PAPER',title:'[Synthetic demo] Science term paper — HOD review',idempotencyKey:randomUUID(),data:{...(original.data as any),slotId:slot.id,examType:'MID_TERM'}})).record;
 const current=()=>db.schoolAiRecord.findUniqueOrThrow({where:{id:paper.id}});
 for(const q of (paper.data as any).questions)await call(t,'POST',`/api/school-ai/workspace/${paper.id}/item-review`,{version:(await current()).version,questionId:q.id,target:'READY_FOR_REVIEW',itemRevision:1});
 await call(t,'PATCH',`/api/school-ai/workspace/${paper.id}`,{version:(await current()).version,action:'review'});
 await denied(t,`/api/academic/paper-slots/${slot.id}/moderation`,{paperVersion:(await current()).version,decision:'SIGNED'},'Paper author cannot self-moderate');
 assert.equal((await call(h,'GET','/api/school-ai/studio/next-step')).href,'/teacher#moderation-queue');await hp.reload();await expect(hp.locator('[data-moderation-queue]')).toBeVisible();await shot(hp.locator('[data-moderation-queue]'),'06-hod-paper-awaiting-moderation');
 await hp.locator('[data-moderation-queue]').getByRole('button',{name:'Moderate',exact:true}).click();const panel=hp.locator('[data-moderation-panel]');await expect(panel.locator('[data-check]')).toHaveCount(8);await shot(panel.locator('section').first(),'07-hod-conformance-checks');await shot(panel.locator('[data-mod-item]').first(),'08-hod-question-key-and-comment');pass('HOD sees conformance checks, questions, answer keys and comment controls');
 await panel.locator('[data-moderation="return"]').click();await expect(panel).toContainText('comment');await shot(panel.locator('[role="status"]').last(),'09-return-requires-comment');pass('Returning a paper without comments is refused');
 await panel.locator('textarea').first().fill('Clarify the wording of question 1 before approval.');await panel.locator('[data-moderation="return"]').click();await expect(panel).toContainText('Returned');await shot(panel.locator('section').nth(1),'10-hod-returned-with-feedback');pass('HOD returns paper with per-question feedback');
 await tp.reload();await tp.locator('[data-see-comments]').click();const readOnly=tp.locator('[data-moderation-panel]');await expect(readOnly).toContainText('Clarify the wording');await expect(readOnly.locator('[data-moderation="sign"]')).toHaveCount(0);await shot(readOnly.locator('section').nth(1),'11-author-reads-hod-feedback');pass('Author sees feedback without moderator decision controls');
 // Resubmit the reviewed wording using the normal versioned workspace mutation.
 let row=await current();const body=row.data as any;body.questions[0].prompt='Which gas do plants absorb from the air during photosynthesis?';await call(t,'PATCH',`/api/school-ai/workspace/${paper.id}`,{version:row.version,data:body});
 row=await current();for(const q of (row.data as any).questions){if(q.review?.state==='READY_FOR_REVIEW')continue;const r=await t.request.post(`/api/school-ai/workspace/${paper.id}/item-review`,{headers,data:{version:(await current()).version,questionId:q.id,target:'READY_FOR_REVIEW',itemRevision:q.review?.itemRevision??q.itemRevision??1,confirmRechecked:[...new Set((q.review?.invalidated??[]).map((e:any)=>e.artifact))]}});assert(r.ok(),await r.text());}
 await call(t,'PATCH',`/api/school-ai/workspace/${paper.id}`,{version:(await current()).version,action:'review'});
 await hp.reload();await hp.locator('[data-moderation-queue]').getByRole('button',{name:'Moderate',exact:true}).click();await expect(panel.locator('[data-moderation="sign"]')).toBeEnabled();await panel.locator('[data-moderation="sign"]').click();await expect(panel).toContainText('Signed');await shot(panel.locator('section').last(),'12-hod-signed-corrected-paper');assert.equal((await call(h,'GET','/api/school-ai/paper-slots/mine')).slots.find((s:any)=>s.id===slot.id).status,'MODERATED');pass('HOD signs corrected paper; history retains returned decision');
 await denied(h,`/api/academic/paper-slots/${slot.id}/seal`,{paperVersion:(await current()).version},'HOD cannot seal under default principal-only policy');
 await hp.setViewportSize({width:390,height:844});await hp.reload();await expect(hp.locator('[data-department-queue]')).toBeVisible();assert(await hp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(hp,'13-hod-mobile-home');pass('HOD phone dashboard has no document overflow');
 await db.user.update({where:{id:hod.id},data:{preferredLanguage:'ar'}});await h.addCookies([{name:'skoolee-lang',value:'ar',url:origin}]);await hp.reload();await expect(hp.locator('html')).toHaveAttribute('dir','rtl');await shot(hp.locator('[data-department-queue]'),'14-hod-arabic-queue');assert(await hp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));pass('HOD Arabic queue renders RTL without overflow');await db.user.update({where:{id:hod.id},data:{preferredLanguage:'en'}});
 // Revoke both ways the head responsibility is represented and verify access disappears immediately.
 await db.department.update({where:{id:dept.id},data:{headId:null}});await db.departmentMember.updateMany({where:{departmentId:dept.id,userId:hod.id},data:{endedAt:new Date()}});
 assert.equal((await call(h,'GET','/api/school-ai/department-approvals')).queue.heads,false);pass('Removing HOD responsibility removes departmental queue immediately');
 await db.department.update({where:{id:dept.id},data:{headId:hod.id}});await db.departmentMember.updateMany({where:{departmentId:dept.id,userId:hod.id},data:{endedAt:null}});
 await writeFile(`${root}/results.json`,JSON.stringify({checks,images,account:{email:hod.email,department:dept.name},source:'Real local UI/API, synthetic school. No model calls.'},null,2));
 console.log('COMPLETE',checks.length,images.length);
}catch(error){console.error(error);if(activePage)await activePage.screenshot({path:`${root}/failure.png`}).catch(()=>{});await writeFile(`${root}/partial.json`,JSON.stringify({checks,images,error:String(error)},null,2));throw error;}finally{await browser?.close();await db.$disconnect();}

}

async function extendedScenario(){checks.length=0;images.length=0;try{
 const prior=JSON.parse(await readFile(`${root}/results.json`,'utf8'));checks.push(...prior.checks);images.push(...prior.images);
 browser=await chromium.launch({headless:true});const h=await login('demo-hod@example.invalid'),t=await login('demo-teacher@example.invalid'),p=await login('demo-principal@example.invalid');
 const paper=await db.schoolAiRecord.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,kind:'PAPER',title:'[Synthetic demo] Science term paper — HOD review'}});const slotId=(paper.data as any).slotId;
 const view=await call(h,'GET',`/api/academic/paper-slots/${slotId}/moderation`);await writeFile(`${root}/moderation-history.json`,JSON.stringify(view,null,2));
 await call(t,'POST',`/api/school-ai/workspace/${paper.id}/rehearsal`,{version:paper.version,findings:[]});
 const policy=(await call(p,'POST','/api/school-ai/workspace',{kind:'DELIVERY_POLICY',title:'[Synthetic demo] HOD delegated sealing test',idempotencyKey:randomUUID(),data:{...PLATFORM_DEFAULT_DELIVERY_POLICY,chain:{sealedBy:'HEAD_OF_DEPARTMENT'}}})).record;
 await call(p,'PATCH',`/api/school-ai/workspace/${policy.id}`,{version:policy.version,action:'review'});await call(p,'PATCH',`/api/school-ai/workspace/${policy.id}`,{version:policy.version+1,action:'approve'});
 const hp=await home(h);await hp.locator('[data-moderation-queue]').getByRole('button',{name:'Open',exact:true}).click();await expect(hp.locator('[data-delegated-seal]')).toBeVisible();await shot(hp.locator('[data-delegated-seal]'),'15-hod-delegated-seal');await hp.getByRole('button',{name:'Seal paper',exact:true}).click();await expect(hp.locator('[data-delegated-seal]')).toHaveCount(0);assert((await db.examPaperSlot.findUniqueOrThrow({where:{id:slotId}})).sealedAt);await hp.locator('[data-moderation-panel] [data-tone="success"]').first().scrollIntoViewIfNeeded();await shot(hp.getByRole('dialog'),'16-hod-sealed-paper');pass('HOD seals through UI only after approved delegation, signature and rehearsal');
 await hp.keyboard.press('Escape');
 const learner=await login('demo-student@example.invalid');const learnerRow=await db.user.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,email:'demo-student@example.invalid'}});const pupil=await db.student.findFirstOrThrow({where:{studentUserId:learnerRow.id}});
 const original=await db.schoolAiRecord.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,kind:'PAPER',status:'APPROVED',id:{not:paper.id}}});
 const exam=(await call(p,'POST','/api/school-ai/exams',{idempotencyKey:randomUUID(),paperId:original.id,title:'[Synthetic demo] HOD result appeal',startsAt:new Date(Date.now()-120000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),studentIds:[pupil.id],mode:'STANDARD'})).exam;
 await db.schoolAiExamAssignment.update({where:{id:exam.id},data:{endsAt:new Date(Date.now()-60000)}});
 const attempt=await db.schoolAiExamAttempt.create({data:{schoolId:DEMO_SCHOOL_ID,campusId:pupil.campusId,assignmentId:exam.id,studentId:pupil.id,userId:learnerRow.id,startedAt:new Date(Date.now()-110000),deadlineAt:new Date(Date.now()-60000),submittedAt:new Date(Date.now()-90000),sequence:2,status:'SUBMITTED',responses:{q1:'o1',q2:'Light and water'}}});
 const review={marks:[{questionId:'q1',marks:2,feedback:'Correct gas.'},{questionId:'q2',marks:2,feedback:'Inputs named.'}],note:'Marked against the rubric.'};
 await call(t,'PATCH',`/api/school-ai/exams/${exam.id}/attempts`,{attemptId:attempt.id,review});await call(p,'POST',`/api/school-ai/exams/${exam.id}/results-release`);
 const appeal=(await call(learner,'POST',`/api/school-ai/exams/${exam.id}/results`,{action:'appeal',data:{version:1,reason:'I named two correct inputs.',disputedQuestionIds:['q2']}})).result;
 assert.equal((await call(t,'GET','/api/school-ai/department-appeals')).appeals.length,0);
 const deniedRead=await t.request.get(`/api/school-ai/exams/${exam.id}/results?attemptId=${attempt.id}&departmentReview=1`);assert([403,404].includes(deniedRead.status()));pass('Ordinary teacher has no HOD appeal queue or department-review read permission');
 await hp.reload();await expect(hp.locator('[data-department-appeals]')).toBeVisible();await shot(hp.locator('[data-department-appeals]'),'17-hod-appeal-queue');await hp.locator('[data-department-appeals]').getByRole('button',{name:'Open',exact:true}).click();await expect(hp.locator('[data-uphold-marks]')).toBeVisible();await shot(hp.getByRole('dialog'),'18-hod-appeal-review');
 await hp.locator('[data-uphold-marks] input').nth(1).fill('3');await hp.getByRole('dialog').locator('textarea').fill('Two correct inputs were named.');await hp.getByRole('dialog').getByRole('button',{name:'Correction required',exact:true}).click();await expect(hp.locator('[data-correction-pending]')).toBeVisible();await shot(hp.locator('[data-correction-pending]'),'19-hod-correction-awaits-independent-approval');
 const correction=await db.schoolAiResultCorrection.findFirstOrThrow({where:{appealId:appeal.id}});assert.equal((await db.schoolAiExamAttempt.findUniqueOrThrow({where:{id:attempt.id}})).reviewVersion,1);
 await denied(h,`/api/school-ai/exams/${exam.id}/moderation`,{action:'decide',data:{correctionId:correction.id,version:1,decision:'APPROVE',note:'Self approval test'}},'HOD cannot approve their own result correction');
 await call(p,'POST',`/api/school-ai/exams/${exam.id}/moderation`,{action:'decide',data:{correctionId:correction.id,version:1,decision:'APPROVE',note:'Rubric criterion met.'}});assert.equal((await db.schoolAiExamAttempt.findUniqueOrThrow({where:{id:attempt.id}})).reviewVersion,2);pass('HOD upholds appeal in UI; principal independently approves corrected result');
 await hp.reload();await expect(hp.locator('[data-department-appeals]')).toHaveCount(0);pass('Resolved appeal leaves the HOD pending queue');

 await writeFile(`${root}/results.json`,JSON.stringify({checks,images,account:{email:'demo-hod@example.invalid',department:'Science'},source:'Real local UI/API; synthetic records; no provider calls.'},null,2));
 await writeFile(`${root}/supplement.json`,JSON.stringify({checks,images,policyId:policy.id,slotId,paperId:paper.id},null,2));
 }catch(e){console.error(e);if(activePage)await activePage.screenshot({path:`${root}/supplement-failure.png`}).catch(()=>{});throw e;}finally{await browser?.close();await db.$disconnect();}}

test('HOD approvals, resubmission, history and permission boundaries',async()=>{test.setTimeout(180000);await coreScenario();});
test('Delegated seal and independently approved HOD appeal correction',async()=>{test.setTimeout(180000);await extendedScenario();});

test('HOD previews enforce ownership, version and revocation; welcome closes cleanly',async()=>{
 test.setTimeout(120000);
 browser=await chromium.launch({headless:true});
 const hod=await db.user.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,email:'demo-hod@example.invalid'}});
 const dept=await db.department.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,headId:hod.id}});
 try{
  const h=await login(hod.email),t=await login('demo-teacher@example.invalid'),u=await login('demo-unrelated-hod-review@example.invalid');
  const cur=await db.schoolAiRecord.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,kind:'CURRICULUM',status:'APPROVED'}});const cd=cur.data as {subjectId:string;classId:string};
  const source=(await call(t,'POST','/api/school-ai/workspace',{kind:'SOURCE',title:'[Synthetic demo] Ready for your HOD review',idempotencyKey:randomUUID(),data:{extractedText:'Unit 1: Plants\nExplain photosynthesis and identify the inputs plants need.',documentKind:'syllabus',fileName:'hod-demo.txt',mimeType:'text/plain',subjectId:cd.subjectId,classId:cd.classId,origin:'manual',extractionStatus:'manual'}})).record;
  await call(t,'PATCH',`/api/school-ai/workspace/${source.id}`,{version:source.version,action:'review'});
  const previewPath=`/api/school-ai/department-approvals?recordId=${source.id}`;
  assert((await call(h,'GET',previewPath)).preview.text.includes('photosynthesis'));
  for(const actor of [t,u]){const response=await actor.request.get(previewPath);assert([403,404].includes(response.status()));}
  await call(h,'POST','/api/school-ai/department-approvals',{recordId:source.id,version:1},409);pass('Department previews exclude ordinary teachers; stale approval versions are rejected');
  const next=await call(h,'GET','/api/school-ai/studio/next-step');assert.equal(next.step.recordKind,'SOURCE');assert.equal(next.href,'/teacher#department-queue');pass('A source-only approval queue opens the correct HOD destination');
  await db.department.update({where:{id:dept.id},data:{headId:null}});await db.departmentMember.updateMany({where:{departmentId:dept.id,userId:hod.id},data:{endedAt:new Date()}});
  await call(h,'GET',previewPath,undefined,404);
  const exam=await db.schoolAiExamAssignment.findFirstOrThrow({where:{schoolId:DEMO_SCHOOL_ID,title:'[Synthetic demo] HOD result appeal'}});const attempt=await db.schoolAiExamAttempt.findFirstOrThrow({where:{assignmentId:exam.id}});
  const lost=await h.request.get(`/api/school-ai/exams/${exam.id}/results?attemptId=${attempt.id}&departmentReview=1`);assert([403,404].includes(lost.status()));pass('Removing HOD responsibility revokes preview and appealed-result access immediately');
  await db.department.update({where:{id:dept.id},data:{headId:hod.id}});await db.departmentMember.updateMany({where:{departmentId:dept.id,userId:hod.id},data:{endedAt:null}});
  const learner=await login('demo-student@example.invalid');
  const second=(await call(learner,'POST',`/api/school-ai/exams/${exam.id}/results`,{action:'appeal',data:{version:2,reason:'Please confirm the final total.'}})).result;
  const reviewPage=await home(h);await reviewPage.setViewportSize({width:390,height:844});await db.user.update({where:{id:hod.id},data:{preferredLanguage:'ar'}});await h.addCookies([{name:'skoolee-lang',value:'ar',url:origin}]);await reviewPage.reload();await expect(reviewPage.locator('html')).toHaveAttribute('dir','rtl');await reviewPage.locator('[data-department-appeals] button').click();await expect(reviewPage.locator('[data-uphold-marks]')).toBeVisible();assert(await reviewPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(reviewPage.getByRole('dialog'),'21-hod-arabic-mobile-appeal');pass('HOD appeal controls work on an Arabic phone screen without overflow');
  await db.user.update({where:{id:hod.id},data:{preferredLanguage:'en'}});await h.addCookies([{name:'skoolee-lang',value:'en',url:origin}]);await reviewPage.setViewportSize({width:1440,height:1000});await reviewPage.reload();await reviewPage.locator('[data-department-appeals] button').click();await reviewPage.getByRole('dialog').locator('textarea').fill('The final total is correct against the rubric.');await reviewPage.getByRole('dialog').getByRole('button',{name:'Result confirmed',exact:true}).click();await expect.poll(async()=>(await db.schoolAiExamAppeal.findUniqueOrThrow({where:{id:second.id}})).status).toBe('DISMISSED');await shot(reviewPage.getByRole('dialog'),'22-hod-confirms-result');pass('HOD dismisses a review request with a reason without changing marks');await reviewPage.close();
  await db.user.update({where:{id:hod.id},data:{welcomeCompletedAt:null}});
  const hp=await h.newPage();activePage=hp;hp.setDefaultTimeout(15000);await hp.goto('/teacher');await expect(hp.locator('[data-showcase]')).toBeVisible();await hp.keyboard.press('Escape');await expect(hp.locator('[data-launch-guide]')).toBeVisible();await hp.keyboard.press('Escape');await expect(hp.locator('[data-launch-guide]')).toHaveCount(0);
  await hp.locator('[data-department-queue] li').filter({hasText:source.title}).getByRole('button',{name:'Open',exact:true}).click();await expect(hp.locator('[data-department-preview]')).toBeVisible();await shot(hp.getByRole('dialog'),'20-hod-review-start-here');pass('Welcome showcase and guide both dismiss; HOD can immediately open a review');
  await call(h,'POST','/api/auth/welcome',{});
  await writeFile(`${root}/results.json`,JSON.stringify({checks,images,account:{email:hod.email,department:dept.name},source:'Real local UI/API; synthetic records; no provider calls.'},null,2));
 }finally{
  await db.department.update({where:{id:dept.id},data:{headId:hod.id}});await db.departmentMember.updateMany({where:{departmentId:dept.id,userId:hod.id},data:{endedAt:null}});
  await db.user.update({where:{id:hod.id},data:{welcomeCompletedAt:new Date()}});await browser?.close();await db.$disconnect();
 }
});
