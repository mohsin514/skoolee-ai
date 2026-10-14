import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashSessionToken } from '../../src/lib/auth/session-cookie';
import { SignJWT } from 'jose';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { USER_ROLES } from '../../src/lib/roles';
async function main() {
const dbUrl=new URL(process.env.DATABASE_URL||'http://invalid');
if(dbUrl.hostname!=='127.0.0.1'||!['55409','55419'].includes(dbUrl.port)||!['/sko219','/postgres'].includes(dbUrl.pathname))throw new Error('Dedicated local database required');
const db=new PrismaClient();const school=randomUUID(),campus=randomUUID();
const browser=await chromium.launch({headless:true});
const evidenceDir=process.env.AUDIT_EVIDENCE_DIR||'test-results/sko-219';const screenEvidence:{route:string;role?:string;viewport:string;language:string;overflow?:boolean;keyboard?:boolean}[]=[];
await mkdir(evidenceDir,{recursive:true});
try {
 await db.school.create({data:{id:school,name:'Synthetic one-campus group',slug:school,regId:school,contactEmail:`${school}@example.invalid`,city:'Synthetic',status:'ACTIVE',plan:'PRO',registrationKind:'GROUP'}});
 await db.campus.create({data:{id:campus,schoolId:school,name:'North campus',city:'Synthetic',regId:campus}});
 for(const role of USER_ROLES) {
  const id=randomUUID();const owner=role==='SUPER_ADMIN';
  await db.user.create({data:{mfaEnabled:true,id,schoolId:school,campusId:campus,email:`${id}@example.invalid`,fullName:`Synthetic ${role}`,role,onboardingComplete:true,isInstitutionOwner:owner,canManageMemberships:owner}});
  const token=await new SignJWT({mfaVerified:true,userId:id,schoolId:school,campusId:campus,role,onboardingComplete:true,accessVersion:0}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  await db.loginSession.create({data:{schoolId:school,userId:id,tokenHash:hashSessionToken(token),expiresAt:new Date(Date.now()+3600_000)}});
  const base=process.env.AUDIT_BASE_URL||'http://localhost:3219', evidence=process.env.AUDIT_EVIDENCE_DIR||'test-results/sko-219';
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'skoolee_token',value:token,url:base}]);
  const page=await context.newPage();page.on("pageerror", error => console.error("BROWSER", error));await page.goto(`${base}/memberships`);await page.getByRole('heading',{name:'Current memberships'}).waitFor();await page.getByRole('status').filter({hasText:'Synthetic one-campus group'}).waitFor();
  screenEvidence.push({route:'/memberships',role,viewport:'desktop',language:'en'});
  assert.equal(await page.getByRole('heading',{name:'Invite to institution'}).count(),owner?1:0);
  if(owner) {
   for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]] as const) {
    await page.setViewportSize({width,height});
    for(const language of ['en','ar','ur'] as const) {
     await page.locator('select[aria-label]').first().selectOption(language);await page.waitForFunction(lang=>document.querySelector('main')?.getAttribute('lang')===lang,language);
     assert.equal(await page.locator('main').getAttribute('dir'),language==='en'?'ltr':'rtl');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name}/${language} membership overflow`);
     await page.screenshot({path:`${evidence}/memberships-${name}-${language}.png`,fullPage:true});
     screenEvidence.push({route:'/memberships',role,viewport:name,language,overflow:false,keyboard:true});
    }
   }
   await page.locator('select[aria-label]').first().selectOption('en');
   await page.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');await page.getByLabel('Work role').selectOption('TEACHER');await page.getByRole('button',{name:'Review invitation'}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Send reviewed invitation'}).waitFor();
  }
  console.log(`PASS ${role}: scoped membership view; invitation controls ${owner?'visible':'absent'}`);await context.close();
 }
 const token=randomUUID();await db.staffInvitation.create({data:{schoolId:school,campusId:campus,email:`${token}@example.invalid`,role:'TEACHER',token,expiresAt:new Date(Date.now()+3600000),invitedBy:'Synthetic owner',canPurchaseSubscription:true,canManageMemberships:true}});
 const base=process.env.AUDIT_BASE_URL||'http://localhost:3219', evidence=process.env.AUDIT_EVIDENCE_DIR||'test-results/sko-219';
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();page.on("pageerror", error => console.error("BROWSER", error));await page.goto(`${base}/accept-invite?token=${token}`);await page.getByRole('heading',{name:'Synthetic one-campus group'}).waitFor();
 for(const language of ['en','ar','ur'] as const){
  await page.locator('select[aria-label]').selectOption(language);await page.waitForFunction(lang=>document.querySelector('main')?.getAttribute('lang')===lang,language);
  assert.equal(await page.locator('main').getAttribute('dir'),language==='en'?'ltr':'rtl');
  const body=await page.locator('body').innerText();
  assert.match(body,language==='en'?/Subscription purchasing is explicitly delegated\./:language==='ar'?/تم تفويض شراء الاشتراك صراحةً\./:/سبسکرپشن خریدنے کی اجازت واضح طور پر دی گئی ہے۔/);
  assert.match(body,language==='en'?/Membership management is explicitly delegated within this scope\./:language==='ar'?/تم تفويض إدارة العضويات ضمن هذا النطاق\./:/اس دائرہ کار میں رکنیت کے انتظام کی اجازت واضح طور پر دی گئی ہے۔/);
  assert.equal(await page.getByRole('button',{name:language==='en'?'Password: show':language==='ar'?'كلمة المرور: إظهار':'پاس ورڈ: دکھائیں'}).count(),1);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${language} invitation overflow at ${width}px`);}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${evidence}/accept-invite-${language}.png`,fullPage:true});
  screenEvidence.push({route:'/accept-invite',viewport:'phone',language,overflow:false,keyboard:true});
 }
 await page.locator('select[aria-label]').selectOption('en');
 await page.getByLabel('Your full name').fill('Synthetic Teacher');await page.getByLabel('Password',{exact:true}).fill('Synthetic219Password');await page.getByLabel('Confirm Password').fill('Synthetic219Password');await page.getByRole('button',{name:'Activate account'}).click();await page.waitForURL('**/login?invite=accepted');assert.equal((await db.user.findFirstOrThrow({where:{email:`${token}@example.invalid`}})).onboardingComplete,true);console.log('PASS mobile invitation acceptance; en/ar/ur direction, delegated scope, four widths and no overflow');await context.close();
 await writeFile(`${evidenceDir}/memberships-browser.json`,JSON.stringify(screenEvidence,null,2));
} finally {await browser.close();await db.school.deleteMany({where:{id:school}});await db.$disconnect();}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
