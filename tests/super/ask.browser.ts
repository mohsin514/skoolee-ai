/** Full Ask UI with an injected local planner. No live provider or real tenant data. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';

async function main(){
 assert.equal(process.env.DATABASE_URL,'postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024');
 assert.equal(process.env.AUTH_SECRET,'synthetic-owner-audit-only-20261024');
 assert.equal(process.env.SUPER_QA_MOCK_AI,'1');
 const db=new PrismaClient({datasourceUrl:process.env.DATABASE_URL+'?connection_limit=2'}), base='http://127.0.0.1:3094', output='test-results/super-ai';await mkdir(output,{recursive:true});
 const school=await db.school.create({data:{name:'Synthetic AI Group',slug:randomUUID(),regId:randomUUID(),city:'Lahore',contactEmail:`${randomUUID()}@example.invalid`,registrationKind:'GROUP',plan:'ENTERPRISE',status:'ACTIVE',aiWorkflowsLiveAt:new Date(),aiCreditsLimit:10000}});
 const north=await db.campus.create({data:{schoolId:school.id,name:'North Campus',city:'Lahore',regId:randomUUID()}});
 const south=await db.campus.create({data:{schoolId:school.id,name:'South Campus',city:'Karachi',regId:randomUUID()}});
 const user=await db.user.create({data:{schoolId:school.id,campusId:null,role:'SUPER_ADMIN',fullName:'Synthetic AI Group Admin',email:`${randomUUID()}@example.invalid`,onboardingComplete:true,welcomeCompletedAt:new Date(),isInstitutionOwner:true,canPurchaseSubscription:true,canManageMemberships:true,mfaEnabled:true}});
 const token=await new SignJWT({userId:user.id,role:user.role,schoolId:school.id,campusId:null,accessVersion:0,email:user.email,fullName:user.fullName,onboardingComplete:true,mfaVerified:true}).setProtectedHeader({alg:'HS256'}).setJti(randomUUID()).setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
 await db.loginSession.create({data:{schoolId:school.id,userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+7200000)}});
 let mode='create',calls=0;const campusName=`AI East ${randomUUID().slice(0,6)}`;
 const provider=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;calls++;
  const body=JSON.parse(raw);const content=body.messages.find((m:{role:string})=>m.role==='user').content;
  let payload:any;try{payload=JSON.parse(content);}catch{payload={};}
  const text=(payload.userText??[]).map((x:{text:string})=>x.text).join(' ');
  let answer:unknown;
  if(mode==='outage'){res.writeHead(503);res.end('Synthetic provider outage');return;}
  if(mode==='create')answer={kind:'plan',steps:[{key:'s1',capability:'campus.create',input:{name:campusName,...(text.includes('Lahore')?{city:'Lahore'}:{})},evidence:[{pointer:'/name',quote:campusName},...(text.includes('Lahore')?[{pointer:'/city',quote:'Lahore'}]:[])]}]};
  else if(mode==='readiness')answer={kind:'plan',steps:[{key:'s1',capability:'readiness.view',input:{},evidence:[]}]};
  else if(mode==='forbidden')answer={kind:'plan',steps:[{key:'s1',capability:'platform.inspect',input:{operation:'schools'},evidence:[]}]};
  else if(mode==='wrong-campus')answer={kind:'plan',steps:[{key:'s1',capability:'campus.update_details',input:{campus:'South Campus',changes:{city:'Multan'}},evidence:[{pointer:'/campus',quote:'South Campus'},{pointer:'/changes',quote:'Multan'}]}]};
  else if(mode==='insights')answer='Synthetic network comparison: review campus readiness with local leaders before changing policies.';
  else answer={text:'I can help you compare campus readiness and prepare changes for your review.'};
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({message:{content:typeof answer==='string'?answer:JSON.stringify(answer)},prompt_eval_count:40,eval_count:30}));
 });
 await new Promise<void>(resolve=>provider.listen(11499,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true}), context=await browser.newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'skoolee_token',value:token,url:base}]);const page=await context.newPage();page.setDefaultTimeout(30000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const results:{name:string;passed:boolean}[]=[];
 const post=async(path:string,data:unknown)=>{const r=await context.request.post(base+path,{data,headers:{origin:base}});return {status:r.status(),body:await r.json()};};
 const start=async(message:string,campusId?:string)=>post('/api/ai-workflows',{message,language:'en',idempotencyKey:randomUUID(),...(campusId?{campusId}:{})});
 const done=(name:string)=>{results.push({name,passed:true});console.log('PASS '+name);};
 try{
  await page.goto(base+'/ai',{waitUntil:'domcontentloaded',timeout:90000});await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden=true]').waitFor({state:'hidden'});
  await page.locator('[data-ai-request]').fill(`Create a campus named ${campusName}`);await page.locator('[data-ai-start]').click();await page.locator('[data-ai-status="NEEDS_INPUT"]').waitFor({timeout:60000});
  await page.locator('[data-ai-answer]').fill('Lahore');await page.route('**/api/ai-workflows/*/commands',r=>r.fulfill({status:503,json:{code:'PROVIDER_UNAVAILABLE'}}),{times:1});await page.locator('[data-ai-answer-submit]').click();await expect(page.locator('[data-ai-answer]')).toHaveValue('Lahore');await page.locator('[data-ai-error="PROVIDER_UNAVAILABLE"]').waitFor();await page.locator('[data-ai-answer-submit]').click();
  await page.locator('[data-ai-confirm]').waitFor({timeout:60000});assert.equal(await db.campus.count({where:{schoolId:school.id,name:campusName}}),0);await page.screenshot({path:`${output}/confirmation-390.png`});
  const confirmRequest=page.waitForRequest(r=>r.url().includes('/commands')&&r.postDataJSON()?.type==='confirm');await page.locator('[data-ai-confirm]').click();const command=await confirmRequest;await page.locator('[data-ai-status="COMPLETED"]').waitFor({timeout:60000});assert.equal(await db.campus.count({where:{schoolId:school.id,name:campusName}}),1);
  const replay=await post(new URL(command.url()).pathname,command.postDataJSON());assert.equal(replay.status,200);assert.equal(await db.campus.count({where:{schoolId:school.id,name:campusName}}),1);await page.reload();await page.locator('[data-ai-status="COMPLETED"]').waitFor();done('Ask: missing city, retained name, failed-answer retry, confirmation, creation, replay and reload');
  mode='readiness';const read=await start('Compare readiness across all my campuses');assert.equal(read.status,201);assert.equal(read.body.run.status,'COMPLETED');assert.equal(await db.campus.count({where:{schoolId:school.id}}),3);done('AI readiness read across multiple campuses');
  mode='forbidden';const refused=await start('Show all schools on the platform');assert.equal(refused.status,201);assert.equal(refused.body.run.outcome,'NOT_SUPPORTED');assert.equal(await db.aiWorkflowStep.count({where:{jobId:refused.body.run.id,status:'SUCCEEDED'}}),0);done('AI refuses platform-owner capability for group admin');
  mode='wrong-campus';const wrong=await start('Change South Campus city to Multan',north.id);assert.equal(wrong.status,201);assert.equal(await db.aiWorkflowStep.count({where:{jobId:wrong.body.run.id,status:'SUCCEEDED'}}),0);assert.equal((await db.campus.findUniqueOrThrow({where:{id:south.id}})).city,'Karachi');done('Pinned campus cannot mutate another campus');
  mode='outage';const outage=await start('Compare campus readiness for this group');assert.equal(outage.status,201);assert.notEqual(outage.body.run.status,'COMPLETED');mode='readiness';const retry=await post(`/api/ai-workflows/${outage.body.run.id}/commands`,{type:'resume',jobVersion:outage.body.run.version});assert.equal(retry.status,200);assert.equal(retry.body.run.status,'COMPLETED');done('Provider outage is recoverable without duplicate writes');
  for(const url of ['/ai','/ai/catalogue','/ai/waiting','/ai/setup','/setup/readiness']){await page.goto(base+url,{waitUntil:'domcontentloaded'});assert.ok(!page.url().includes('/login'));assert.ok(!page.url().includes('/forbidden'));await page.screenshot({path:`${output}/${url.replaceAll('/','-')}-390.png`});}done('AI workspace, catalogue, waiting, setup and group readiness navigation');
  mode='insights';
  for(const feature of ['campus_comparison','weak_campuses','ai_usage_by_campus','fee_recovery_insights','academic_trend_summary']){
    const result=await post('/api/ai/insights',{feature});assert.equal(result.status,200,`${feature}: ${JSON.stringify(result.body)}`);assert.ok(result.body.data.output.includes('Synthetic network comparison'));
  }
  await page.goto(base+'/super?view=overview',{waitUntil:'domcontentloaded'});const panel=page.locator('#network-insights');await panel.locator('select').selectOption('campus_comparison');await panel.locator('textarea').fill('Compare the current campuses');const generated=page.waitForResponse(r=>r.url().endsWith('/api/ai/insights')&&r.request().method()==='POST');await panel.locator('textarea').press('Control+Enter');assert.equal((await generated).status(),200);await expect(panel.getByText('Synthetic network comparison: review campus readiness with local leaders before changing policies.',{exact:true}).first()).toBeVisible();assert.equal(await db.aIInsight.count({where:{schoolId:school.id}}),6);await page.screenshot({path:`${output}/network-insights-390.png`});done('All five network insight actions persist drafts; overview generation displays the result');
  assert.deepEqual(errors,[]);
 }catch(error){await page.screenshot({path:`${output}/failure.png`});console.error((await page.locator('body').innerText()).slice(-2200));throw error;}
 finally{await writeFile(`${output}/results.json`,JSON.stringify({results,calls},null,2));await browser.close();await db.$disconnect();await new Promise<void>(resolve=>provider.close(()=>resolve()));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
