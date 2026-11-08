/** Synthetic multi-campus acceptance. Evidence stays in ignored test-results. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { chromium, type Page } from 'playwright';
import { expect } from '@playwright/test';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024');
  assert.equal(process.env.AUTH_SECRET, 'synthetic-owner-audit-only-20261024');
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL + '?connection_limit=2' });
  const base = 'http://127.0.0.1:3094', output = 'test-results/super-audit', run = randomUUID().slice(0,8);
  await mkdir(output,{recursive:true});
  const school = await db.school.create({data:{name:`Synthetic Group ${run}`,slug:randomUUID(),regId:randomUUID(),city:'Lahore',contactEmail:`${run}@example.invalid`,status:'ACTIVE',plan:'ENTERPRISE',registrationKind:'GROUP',aiWorkflowsLiveAt:new Date(),aiCreditsLimit:10000}});
  const foreign = await db.school.create({data:{name:`Foreign Group ${run}`,slug:randomUUID(),regId:randomUUID(),city:'Karachi',contactEmail:`foreign-${run}@example.invalid`,status:'ACTIVE',plan:'PRO',registrationKind:'GROUP'}});
  const campus = async (name:string,schoolId=school.id) => db.campus.create({data:{schoolId,name,regId:randomUUID(),city:name.includes('South')?'Karachi':'Lahore'}});
  const north = await campus('North Campus'), south = await campus('South Campus'), outside = await campus('Foreign Campus',foreign.id);
  await db.academicCycle.create({data:{schoolId:school.id,campusId:north.id,academicYear:2026,label:'2026–27',status:'ACTIVE'}});
  const actor = async (role:'SUPER_ADMIN'|'CAMPUS_ADMIN'|'PRINCIPAL'|'TEACHER',schoolId=school.id,campusId:string|null=null) => {
    const user=await db.user.create({data:{schoolId,campusId,role,fullName:`Synthetic ${role}`,email:`${randomUUID()}@example.invalid`,password:await bcrypt.hash('OldSynthetic987!',4),isActive:true,isInstitutionOwner:role==='SUPER_ADMIN',canPurchaseSubscription:role==='SUPER_ADMIN',canManageMemberships:role==='SUPER_ADMIN',onboardingComplete:true,welcomeCompletedAt:new Date(),mfaEnabled:true,tourProgress:{super:{v:1,s:'done',at:new Date().toISOString()}}}});
    const token=await new SignJWT({userId:user.id,role,schoolId,campusId,accessVersion:user.accessVersion,email:user.email,fullName:user.fullName,onboardingComplete:true,schoolStatus:'ACTIVE',mfaVerified:true}).setProtectedHeader({alg:'HS256'}).setJti(randomUUID()).setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await db.loginSession.create({data:{schoolId,userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+7200000)}});
    return {user,token};
  };
  const admin=await actor('SUPER_ADMIN'), leader=await actor('CAMPUS_ADMIN',school.id,north.id), principal=await actor('PRINCIPAL',school.id,south.id), teacher=await actor('TEACHER',school.id,north.id), other=await actor('SUPER_ADMIN',foreign.id);
  const klass=await db.class.create({data:{schoolId:school.id,campusId:north.id,name:'Grade 7',academicYear:2026}});
  const pupil=await db.student.create({data:{schoolId:school.id,campusId:north.id,classId:klass.id,fullName:'Private Synthetic Learner',rollNo:'SYN-1',gender:'FEMALE',guardianName:'Private Synthetic Guardian',guardianPhone:'03009998888'}});
  await db.invoice.create({data:{schoolId:school.id,campusId:north.id,studentId:pupil.id,invoiceNumber:randomUUID(),invoiceDate:new Date(),dueDate:new Date(),monthlyFee:100000,totalAmount:100000,totalAmountPaid:25000,balanceDue:75000,subtotal:100000,status:'PARTIAL',currency:'USD'}});
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'});
  await context.addCookies([{name:'skoolee_token',value:admin.token,url:base}]);
  const request=async (path:string,method='GET',data?:unknown,token=admin.token) => { const r=await context.request.fetch(base+path,{method,data,headers:{cookie:`skoolee_token=${token}`,origin:base}}); return {status:r.status(),body:await r.json()}; };
  const results:{name:string;passed:boolean;error?:string}[]=[];
  const shot=async (page:Page,name:string) => page.screenshot({path:`${output}/${name}.png`,mask:[page.locator('input[type="password"]'),page.getByLabel('Invitation link')]});
  const go=async(page:Page,view:string,tab?:string) => {await page.goto(`${base}/super?view=${view}${tab?`&tab=${tab}`:''}`,{waitUntil:'domcontentloaded',timeout:90000});await page.locator(`[data-super-view="${view}"]`).waitFor();await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden=true]').waitFor({state:'hidden'});};
  const check=async(name:string,fn:(page:Page)=>Promise<void>) => {
    if(process.env.SUPER_QA_FILTER&&!name.includes(process.env.SUPER_QA_FILTER)) return;
    if(process.env.SUPER_QA_SKIP_LAYOUT&&name.includes('group pages'))return;
    const page=await context.newPage();page.setDefaultTimeout(20000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    try{await fn(page);assert.deepEqual(errors,[]);results.push({name,passed:true});console.log(`PASS ${name}`);}catch(error){results.push({name,passed:false,error:String(error)});console.log(`FAIL ${name}: ${error}`);await shot(page,`failure-${results.length}`).catch(()=>{});}finally{await page.close();}
  };
  try {
    await writeFile(`${output}/fixture.json`,JSON.stringify({schoolId:school.id,northId:north.id,southId:south.id,adminId:admin.user.id,token:admin.token}));
    await check('group API isolation, invalid pagination and role validation',async()=>{
      for(const path of ['stats','users?page=bad&limit=Infinity','sessions?limit=NaN','audit-logs?days=bad&page=bad&limit=bad']) {
        assert.equal((await request('/api/super/'+path)).status,200,path);
        assert.equal((await request('/api/super/'+path,'GET',undefined,teacher.token)).status,403,path);
      }
      const users=(await request('/api/super/users')).body.data;assert.ok(users.some((u:{id:string})=>u.id===teacher.user.id));assert.ok(!users.some((u:{id:string})=>u.id===other.user.id));
      assert.equal((await request('/api/super/users?role=INVALID')).status,400);
      assert.equal((await request(`/api/super/users?campusId=${outside.id}`)).body.data.length,0);
    });
    await check('password reset rejects reuse, revokes sessions and requires replacement',async()=>{
      const endpoint=`/api/super/users/${teacher.user.id}/password`;
      assert.equal((await request(endpoint,'PUT',{newPassword:'OldSynthetic987!'})).status,400);
      assert.equal((await request(endpoint,'PUT',{newPassword:'NewSynthetic987!'})).status,200);
      const updated=await db.user.findUniqueOrThrow({where:{id:teacher.user.id}});assert.equal(updated.mustChangePassword,true);
      assert.equal(await db.loginSession.count({where:{userId:teacher.user.id,isActive:true}}),0);
      assert.equal((await request(`/api/super/users/${other.user.id}/password`,'PUT',{newPassword:'NewSynthetic987!'})).status,404);
      assert.equal((await request(`/api/super/users/${admin.user.id}/password`,'PUT',{newPassword:'NewSynthetic987!'})).status,403);
    });
    await check('active sessions exclude expiry and termination is school scoped',async()=>{
      const expired=await db.loginSession.create({data:{schoolId:school.id,userId:leader.user.id,tokenHash:randomUUID(),expiresAt:new Date(0)}});
      const list=(await request('/api/super/sessions?active=true')).body.data;
      assert.ok(!list.some((s:{id:string})=>s.id===expired.id));
      const foreignSession=await db.loginSession.findFirstOrThrow({where:{userId:other.user.id}});
      assert.equal((await request('/api/super/sessions','DELETE',{sessionId:foreignSession.id})).status,404);
      assert.equal((await request('/api/super/sessions','DELETE',{sessionId:expired.id})).status,200);
    });
    await check('overview actual collections and private roster minimization',async page=>{
      const responses:string[]=[];page.on('response',r=>{if(r.request().method()==='POST')void r.text().then(t=>responses.push(t)).catch(()=>{});});
      await go(page,'overview');await page.locator('[data-network-overview]').waitFor();
      await expect(page.getByText('25%',{exact:true}).first()).toBeVisible();
      assert.ok(responses.length>0);assert.ok(!responses.some(t=>t.includes('Private Synthetic Learner')||t.includes('Private Synthetic Guardian')));
      await shot(page,'overview-collections-390');
    });
    await check('overview failed approval counts are not shown as no pending decisions',async page=>{
      await page.route('**/api/navigation/counts',r=>r.fulfill({status:503,json:{error:'Synthetic outage'}}));
      await go(page,'overview');await expect(page.getByText('Approval counts could not be loaded. Refresh to check pending decisions.')).toBeVisible();
      await page.unroute('**/api/navigation/counts');await page.getByRole('button',{name:'Refresh',exact:true}).click();
      await expect(page.getByText('Approval counts could not be loaded. Refresh to check pending decisions.')).toHaveCount(0);
    });
    await check('campus search, leadership filters, empty state and detail navigation',async page=>{
      await go(page,'campuses');await page.locator('[data-campus-card]').first().waitFor();
      await page.getByLabel('Search campuses',{exact:true}).fill('Karachi');await expect(page.locator('[data-campus-card]')).toHaveCount(1);
      await page.getByLabel('Search campuses',{exact:true}).fill('');await page.getByLabel('Leadership coverage',{exact:true}).selectOption('admin');await expect(page.locator('[data-campus-card]')).toHaveCount(1);
      await page.getByLabel('Search campuses',{exact:true}).fill('no such branch');await expect(page.getByText('No matching campuses',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear filters'}).click();
      await page.getByRole('button',{name:'Open North Campus',exact:true}).click();await expect(page).toHaveURL(new RegExp(north.id));await expect(page.getByRole('heading',{name:'North Campus',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Back to all campuses'}).click();await expect(page.locator('[data-campus-card]')).toHaveCount(2);
    });
    await check('campus creation validation, failed save retry, invitation link and calendar',async page=>{
      await go(page,'campuses');await page.getByRole('button',{name:'Add campus',exact:true}).click();const dialog=page.locator('[role=dialog], [role=alertdialog]').last();
      await dialog.getByRole('button',{name:'Add campus',exact:true}).click();await expect(page.getByText('Enter the campus name.',{exact:true})).toBeVisible();
      await page.locator('#field-campus-name').fill(`West ${run}`);await page.locator('#field-campus-city').fill('Islamabad');await page.locator('#field-campus-adminEmail').fill(`west-${run}@example.invalid`);
      let failed=false;await page.route('**/super?view=campuses',r=>{if(!failed&&r.request().method()==='POST'&&r.request().postData()?.includes(`West ${run}`)){failed=true;return r.fulfill({status:503,body:'Synthetic outage'});}return r.continue();});
      await dialog.getByRole('button',{name:'Add campus',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible({timeout:30000});await expect(page.locator('#field-campus-name')).toHaveValue(`West ${run}`);
      await shot(page,'campus-failed-save-390');await dialog.getByRole('button',{name:'Add campus',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Campus created',exact:true})).toBeVisible();await expect(page.getByLabel('Invitation link',{exact:true})).toBeVisible();
      const added=await db.campus.findFirstOrThrow({where:{schoolId:school.id,name:`West ${run}`}});assert.equal(await db.academicCycle.count({where:{campusId:added.id,status:'ACTIVE'}}),1);assert.equal(await db.staffInvitation.count({where:{campusId:added.id,role:'CAMPUS_ADMIN'}}),1);
      await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}));await dialog.getByRole('button',{name:'Copy',exact:true}).click();await expect(dialog.getByText('The link could not be copied. Select it and copy it manually.')).toBeVisible();await shot(page,'campus-created-390');await dialog.getByRole('button',{name:'Done'}).click();
    });
    await check('leader invitation validates, reports email failure and supports cancellation',async page=>{
      await go(page,'campuses');await page.locator(`[data-campus-card="${south.id}"]`).getByRole('button',{name:'Appoint campus admin'}).click();const dialog=page.locator('[role=dialog], [role=alertdialog]').last();
      await page.locator('#field-appoint-email').fill('invalid');await dialog.getByRole('button',{name:'Send invitation'}).click();await expect(page.getByText('Enter a valid email address, like name@school.edu.')).toBeVisible();
      await page.locator('#field-appoint-email').fill(`south-${run}@example.invalid`);await dialog.getByRole('button',{name:'Send invitation'}).click();await expect(page.getByRole('heading',{name:'Invitation saved'})).toBeVisible();await dialog.getByRole('button',{name:'Close',exact:true}).click();
      const invite=await db.staffInvitation.findFirstOrThrow({where:{campusId:south.id,email:`south-${run}@example.invalid`}});assert.equal(invite.status,'pending');
      await page.getByRole('button',{name:'Open South Campus'}).click();await page.getByRole('button',{name:'Cancel invitation',exact:true}).click();await page.locator('[role=dialog], [role=alertdialog]').last().getByRole('button',{name:'Cancel invitation',exact:true}).click();
      await expect.poll(async()=> (await db.staffInvitation.findUniqueOrThrow({where:{id:invite.id}})).status).toBe('cancelled');
    });
    await check('campus editing only changes reviewed fields',async page=>{
      await go(page,'campuses');await page.getByRole('button',{name:'Open South Campus'}).click();await page.getByRole('button',{name:'Edit campus',exact:true}).click();
      await page.locator('#c-city').fill('Multan');await page.locator('[role=dialog], [role=alertdialog]').last().getByRole('button',{name:'Review changes'}).click();await expect(page.locator('[data-change-summary]')).toBeVisible();await page.locator('[role=dialog], [role=alertdialog]').last().getByRole('button',{name:'Save changes'}).click();await expect.poll(async()=> (await db.campus.findUniqueOrThrow({where:{id:south.id}})).city).toBe('Multan');
    });
    await check('campus created despite invitation failure is reported without duplicate retry',async page=>{
      await go(page,'campuses');await page.getByRole('button',{name:'Add campus',exact:true}).click();
      await page.locator('#field-campus-name').fill(`Annex ${run}`);await page.locator('#field-campus-city').fill('Lahore');await page.locator('#field-campus-adminEmail').fill(admin.user.email);
      await page.locator('[role=dialog], [role=alertdialog]').last().getByRole('button',{name:'Add campus',exact:true}).click();await expect(page.getByRole('heading',{name:'Campus created'})).toBeVisible();
      await expect(page.getByText('The campus was created, but its admin invitation needs attention. Open the campus to appoint the admin or resend the saved invitation.')).toBeVisible();
      assert.equal(await db.campus.count({where:{schoolId:school.id,name:`Annex ${run}`}}),1);await expect(page.locator('[role=dialog], [role=alertdialog]').last().getByRole('button',{name:'Add campus',exact:true})).toHaveCount(0);
    });
    await check('archive blockers, archive and restore preserve campus history',async page=>{
      await go(page,'campuses');await page.getByRole('button',{name:'Open North Campus'}).click();await page.getByRole('button',{name:'Archive campus',exact:true}).click();await expect(page.locator('[data-campus-archive-blockers]')).toBeVisible();assert.equal((await db.campus.findUniqueOrThrow({where:{id:north.id}})).archivedAt,null);await page.locator('[role=dialog], [role=alertdialog]').last().getByRole('button',{name:'Close',exact:true}).click();
      await go(page,'campuses');await page.getByRole('button',{name:'Open South Campus'}).click();await page.getByRole('button',{name:'Archive campus',exact:true}).click();await page.locator('#field-campus-archive-reason').fill('Synthetic audit archive and restore');await page.locator('[role=dialog], [role=alertdialog]').last().getByRole('button',{name:'Archive campus',exact:true}).click();await expect.poll(async()=>Boolean((await db.campus.findUniqueOrThrow({where:{id:south.id}})).archivedAt)).toBe(true);
      await go(page,'campuses');await page.locator(`[data-archived-campus="${south.id}"]`).getByRole('button',{name:'Restore',exact:true}).click();await page.locator('[role=dialog], [role=alertdialog]').last().getByRole('button',{name:'Restore campus',exact:true}).click();await expect.poll(async()=>(await db.campus.findUniqueOrThrow({where:{id:south.id}})).archivedAt).toBe(null);
    });
    await check('membership and activity exports download actual files',async page=>{
      for(const [view,tab,label] of [['access','members','Export members'],['settings','activity','Export CSV']]){
        await go(page,view,tab);const button=page.getByRole('button',{name:label,exact:true});
        await expect(button).toBeEnabled();const download=page.waitForEvent('download');await button.click();const file=await download;await file.saveAs(`${output}/${view}.csv`);assert.ok(file.suggestedFilename().endsWith('.csv'));
      }
    });
    await check('membership reassignment and revocation enforce review version and school scope',async()=>{
      const member=await actor('TEACHER',school.id,north.id);
      const body={userId:member.user.id,role:'TEACHER',campusId:south.id,canPurchaseSubscription:false,canManageMemberships:false,isActive:true,expectedVersion:member.user.accessVersion,reviewed:true,reason:'Synthetic reviewed campus reassignment'};
      const changed=await request('/api/memberships','PUT',body);assert.equal(changed.status,200,JSON.stringify(changed.body));assert.equal((await db.user.findUniqueOrThrow({where:{id:member.user.id}})).campusId,south.id);
      assert.equal((await request('/api/auth/session','GET',undefined,member.token)).status,401);
      assert.equal((await request('/api/memberships','PUT',body)).status,409);
      const current=await db.user.findUniqueOrThrow({where:{id:member.user.id}});const refused=await request('/api/memberships','PUT',{...body,campusId:outside.id,expectedVersion:current.accessVersion});assert.ok([403,404].includes(refused.status),JSON.stringify(refused));
      assert.equal((await request('/api/memberships','PUT',{...body,isActive:false,expectedVersion:current.accessVersion,reason:'Synthetic reviewed access revocation'})).status,200);
      assert.equal((await db.user.findUniqueOrThrow({where:{id:member.user.id}})).isActive,false);
      assert.ok(await db.auditLog.count({where:{schoolId:school.id,recordId:member.user.id}})>=2);
    });
    await check('group pages and tabs desktop mobile Arabic Urdu with no overflow',async page=>{
      const views:[string,string?][]=[['overview'],['campuses'],['access'],['access','members'],['access','permissions'],['approvals'],['approvals','tax'],['approvals','policy'],['standards'],['standards','policies'],['billing'],['settings','profile'],['settings','locale'],['settings','identity'],['settings','integrations'],['settings','data'],['settings','activity'],['settings','setup']];
      for(const [lang,width] of [['en',1440],['en',768],['en',390],['ar',390],['ur',390]] as const){
        await db.user.update({where:{id:admin.user.id},data:{preferredLanguage:lang}});await page.setViewportSize({width,height:1000});
        for(const [view,tab] of views){await go(page,view,tab);await page.locator(`[data-super-view="${view}"] h1`).first().waitFor();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);await shot(page,`${view}-${tab??'main'}-${lang}-${width}`);console.log(`SNAPSHOT ${view} ${tab??''} ${lang} ${width}`);}
      }
      await db.user.update({where:{id:admin.user.id},data:{preferredLanguage:'en'}});
    });
  } finally {
    await writeFile(`${output}/results${process.env.SUPER_QA_FILTER?'-focused':''}.json`,JSON.stringify(results,null,2));await context.close();await browser.close();await db.$disconnect();
  }
  console.log(`${results.filter(r=>r.passed).length}/${results.length} groups passed`);if(results.some(r=>!r.passed))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
