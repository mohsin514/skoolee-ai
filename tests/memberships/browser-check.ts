import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { USER_ROLES } from '../../src/lib/roles';
async function main() {
const dbUrl=new URL(process.env.DATABASE_URL||'http://invalid');
if(dbUrl.hostname!=='127.0.0.1'||dbUrl.port!=='55419'||dbUrl.pathname!=='/sko219')throw new Error('Dedicated local database required');
const db=new PrismaClient();const school=randomUUID(),campus=randomUUID();
const browser=await chromium.launch({headless:true});
await mkdir('docs/verification/sko-219',{recursive:true});
try {
 await db.school.create({data:{id:school,name:'Synthetic one-campus group',slug:school,regId:school,contactEmail:`${school}@example.invalid`,city:'Synthetic',status:'ACTIVE',plan:'PRO',registrationKind:'GROUP'}});
 await db.campus.create({data:{id:campus,schoolId:school,name:'North campus',city:'Synthetic',regId:campus}});
 for(const role of USER_ROLES) {
  const id=randomUUID();const owner=role==='SUPER_ADMIN';
  await db.user.create({data:{id,schoolId:school,campusId:campus,email:`${id}@example.invalid`,fullName:`Synthetic ${role}`,role,onboardingComplete:true,isInstitutionOwner:owner,canManageMemberships:owner}});
  const token=await new SignJWT({userId:id,schoolId:school,campusId:campus,role,onboardingComplete:true,accessVersion:0}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'skoolee_token',value:token,url:'http://localhost:3219'}]);
  const page=await context.newPage();page.on("pageerror", error => console.error("BROWSER", error));await page.goto('http://localhost:3219/memberships');await page.getByRole('heading',{name:'Memberships in this scope'}).waitFor();await page.getByRole('status').filter({hasText:'Synthetic one-campus group'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Invite to institution'}).count(),owner?1:0);
  if(owner) {
   for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]] as const) {
    await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await page.screenshot({path:`docs/verification/sko-219/${name}.png`,fullPage:true});
   }
   await page.getByRole('button',{name:'العربية',exact:true}).click();assert.equal(await page.locator('main').getAttribute('dir'),'rtl');await page.screenshot({path:'docs/verification/sko-219/rtl.png',fullPage:true});
   await page.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');await page.getByLabel('Work role').selectOption('TEACHER');await page.getByRole('button',{name:'Review invitation'}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Send reviewed invitation'}).waitFor();
  }
  console.log(`PASS ${role}: scoped membership view; invitation controls ${owner?'visible':'absent'}`);await context.close();
 }
 const token=randomUUID();await db.staffInvitation.create({data:{schoolId:school,campusId:campus,email:`${token}@example.invalid`,role:'TEACHER',token,expiresAt:new Date(Date.now()+3600000),invitedBy:'Synthetic owner'}});
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();page.on("pageerror", error => console.error("BROWSER", error));await page.goto(`http://localhost:3219/accept-invite?token=${token}`);await page.getByRole('heading',{name:'Synthetic one-campus group'}).waitFor();await page.screenshot({path:'docs/verification/sko-219/accept-phone.png',fullPage:true});
 await page.getByLabel('Your full name').fill('Synthetic Teacher');await page.getByLabel('Password',{exact:true}).fill('Synthetic219Password');await page.getByLabel('Confirm Password').fill('Synthetic219Password');await page.getByRole('button',{name:'Activate Account'}).click();await page.waitForURL('**/login?invite=accepted');assert.equal((await db.user.findFirstOrThrow({where:{email:`${token}@example.invalid`}})).onboardingComplete,true);console.log('PASS mobile invitation acceptance, named scope and keyboard review');await context.close();
} finally {await browser.close();await db.school.deleteMany({where:{id:school}});await db.$disconnect();}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
