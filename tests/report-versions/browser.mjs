import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const fixture = JSON.parse(await readFile('/private/tmp/sko210-browser-fixture.json','utf8'));
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3210';
const output = process.env.AUDIT_EVIDENCE_DIR || 'docs/qa/evidence/sko-210';
await mkdir(output,{recursive:true});
const pending = await fetch(`${base}/api/reports/${fixture.reportId}`, {method:'PATCH',headers:{cookie:fixture.cookies.PRINCIPAL,'content-type':'application/json'},body:JSON.stringify({remarksEn:'Pending browser correction',reviewerNote:'Private synthetic correction note'})});
if(!pending.ok) throw new Error(await pending.text());
const db = new PrismaClient();
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if(url.hostname!=='127.0.0.1' || url.port!=='55410' || url.pathname!=='/sko210') throw new Error('Local synthetic database required');
const principal = await db.user.findFirstOrThrow({where:{schoolId:fixture.schoolId,role:'PRINCIPAL'}});
const browser=await chromium.launch({headless:true});
const evidence=[];
for(const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]) {
 for(const language of ['en','ar','ur']) {
  await db.user.update({where:{id:principal.id},data:{preferredLanguage:language}});
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.context().addCookies([{name:'skoolee_token',value:fixture.cookies.PRINCIPAL.split('=')[1],url:base}]);
  await page.goto(`${base}/principal`);
  await page.waitForFunction(lang=>document.documentElement.lang===lang,language);
  await page.getByRole('button',{name:/^(Open Review|فتح المراجعة|جائزہ کھولیں)$/,exact:true}).click();
  const panel=page.locator('section[aria-label]').filter({has:page.locator('h3',{hasText:'Synthetic exam'})}).first();
  await panel.locator('li').first().waitFor();
  const review=panel.getByRole('button',{name:/Review version|مراجعة النسخة|نسخہ دیکھیں/});await review.click();
  await panel.locator('textarea').first().waitFor();
  const sectionOverflow=await panel.evaluate(e=>e.scrollWidth>e.clientWidth+2);
  if(sectionOverflow) throw new Error(`${name}/${language} panel overflow`);
  await panel.getByRole('checkbox').focus();await page.keyboard.press('Space');
  if(!await panel.getByRole('checkbox').isChecked()) throw new Error('Keyboard selection failed');
  await page.screenshot({path:`${output}/review-${name}-${language}.png`,fullPage:true});
  evidence.push({surface:'principal review',viewport:name,language,keyboardSelection:true,panelOverflow:false,errors});
  await page.close();
 }
}
await db.user.update({where:{id:principal.id},data:{preferredLanguage:'en'}});
await db.$disconnect();
const paths={APP_OWNER:'/owner',SUPER_ADMIN:'/super',ADMIN:'/admin',CAMPUS_ADMIN:'/admin',PRINCIPAL:'/principal',TEACHER:'/teacher/reports',PARENT:'/parent/results',STUDENT:'/student/reports',ACCOUNTANT:'/accountant',LIBRARIAN:'/librarian',RECEPTIONIST:'/receptionist'};
for(const [role,path] of Object.entries(paths)) {
 for(const [viewport,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]) {
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.context().addCookies([{name:'skoolee_token',value:fixture.cookies[role].split('=')[1],url:base}]);
  const response=await page.goto(`${base}${path}`);await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
  const text=await page.locator('body').innerText();
  if(text.includes('Application error:') || response.status()>=500) throw new Error(`${role}/${viewport} application failure`);
  if(role==='PARENT' || role==='STUDENT') {
   if(text.includes('Teacher corrected draft') || text.includes('PRIVATE REVIEWER NOTE')) throw new Error('Unpublished or private content leaked');
   if(viewport==='mobile') await page.screenshot({path:`${output}/${role.toLowerCase()}-mobile.png`,fullPage:true});
  }
  evidence.push({surface:role,viewport,status:response.status(),errors});await page.close();
 }
}
await browser.close();await writeFile(`${output}/browser.json`,JSON.stringify(evidence,null,2));console.log(`Verified ${evidence.length} browser combinations`);
