/** Explicit loopback-only real form audit. Creates and removes its own synthetic school. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { chromium, expect } = require('@playwright/test');
const origin=process.env.TEST_BASE_URL, databaseUrl=process.env.TEST_DATABASE_URL;
assert(origin && databaseUrl && [origin,databaseUrl].every(x=>['localhost','127.0.0.1'].includes(new URL(x).hostname)) && new URL(databaseUrl).pathname==='/sko208_196');
const db=new PrismaClient({datasourceUrl:databaseUrl});
const run=randomUUID(),password=`QA-${randomUUID()}!`,output='test-results/draft-recovery';
mkdirSync(output,{recursive:true});
let school,browser;const results=[];
async function login(context,user){assert.equal((await context.request.post(origin+'/api/auth/login',{data:{email:user.email,password}})).status(),200);}
async function visit(page,path){await page.goto(origin+path);await page.waitForLoadState('networkidle');}
async function tabTo(page, locator){for(let i=0;i<120;i++){if(await locator.evaluate(el=>el===document.activeElement)) return;await page.keyboard.press('Tab');}throw new Error('Keyboard could not reach '+await locator.textContent());}
async function admission(page){await page.getByRole('button',{name:'Add Student',exact:true}).click();await expect(page.getByRole('dialog').first()).toBeVisible();}
async function fits(page){
 const dialog=page.getByRole('dialog').last();
 if(await dialog.count()){
  const bounds=await dialog.boundingBox();const width=page.viewportSize().width;
  assert(bounds && bounds.x>=-1 && bounds.x+bounds.width<=width+1,'active dialog exceeds viewport');
  assert(await dialog.evaluate(el=>el.contains(document.elementFromPoint(innerWidth/2,innerHeight/2))),'active dialog does not occupy visible viewport center');
  await page.screenshot({path:`${output}/latest.png`}); const overflow=await dialog.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,children:[...el.querySelectorAll('*')].filter(x=>x.scrollWidth>x.clientWidth+2 && x.clientWidth>0).slice(0,15).map(x=>({tag:x.tagName,cls:x.className,width:x.clientWidth,scroll:x.scrollWidth}))})); assert(overflow.scroll<=overflow.width,JSON.stringify(overflow));
 }else assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
 await page.screenshot({path:`${output}/latest.png`});
}

(async()=>{
 school=await db.school.create({data:{name:'Synthetic Draft QA',slug:`sko196-${run}`,status:'ACTIVE',plan:'PRO',city:'Baseline City',regId:run,contactEmail:`${run}@example.invalid`}});
 const campus=await db.campus.create({data:{schoolId:school.id,name:'QA Campus',city:'Baseline City',regId:`${run}-campus`}});
 await db.academicCycle.create({data:{schoolId:school.id,campusId:campus.id,label:'QA 2026',academicYear:2026,status:'ACTIVE'}});
 const users={};for(const role of ['ADMIN','TEACHER'])users[role]=await db.user.create({data:{schoolId:school.id,campusId:campus.id,email:`${run}-${role}@example.invalid`,fullName:`QA ${role}`,role,password:await bcrypt.hash(password,10),onboardingComplete:true}});
 const onboardingUser=await db.user.create({data:{schoolId:school.id,campusId:campus.id,email:`${run}-onboarding@example.invalid`,fullName:'QA Onboarding',role:'ADMIN',password:await bcrypt.hash(password,10),onboardingComplete:false}});
 const teacherOnboardingUser=await db.user.create({data:{schoolId:school.id,campusId:campus.id,email:`${run}-teacher-onboarding@example.invalid`,fullName:'QA Teacher Onboarding',role:'TEACHER',password:await bcrypt.hash(password,10),onboardingComplete:false}});
 const classroom=await db.class.create({data:{schoolId:school.id,campusId:campus.id,name:'QA Class',academicYear:2026,classTeacherId:users.TEACHER.id}});
 const student=await db.student.create({data:{schoolId:school.id,campusId:campus.id,classId:classroom.id,fullName:'Synthetic Learner',rollNo:'QA01',gender:'MALE'}});
 const subject=await db.subject.create({data:{schoolId:school.id,campusId:campus.id,classId:classroom.id,name:'Mathematics',teacherId:users.TEACHER.id,totalMarks:100}});
 const exam=await db.exam.create({data:{schoolId:school.id,campusId:campus.id,classId:classroom.id,title:'Draft QA Exam',term:'First',academicYear:2026,status:'ACTIVE'}});
 const mark=await db.mark.create({data:{schoolId:school.id,campusId:campus.id,examId:exam.id,studentId:student.id,subjectId:subject.id,marksObtained:10,enteredBy:users.TEACHER.id}});
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});const page=await context.newPage();
 page.on('dialog',d=>d.accept());
 await login(context,users.ADMIN);await visit(page,'/dashboard/students');await admission(page);
 const name=page.getByLabel('Full Name (English) *',{exact:true});
 await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
 await context.setOffline(true);await name.fill('Recoverable Pupil');
 await expect(page.getByText(/Draft saved in this tab at/)).toBeVisible();
 await context.setOffline(false);
 await page.reload();await page.waitForLoadState('networkidle');await admission(page);
 await expect(name).toHaveValue('');
 await expect(page.getByRole('button',{name:'Review recovered draft'})).toBeVisible();
 await context.setOffline(true);await page.getByRole('button',{name:'Review recovered draft'}).click();
 await expect(page.getByRole('alert').filter({hasText:/fetch|network|connection/i})).toBeVisible();
 assert(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('skoolee:draft:'))));
 await context.setOffline(false);await page.getByRole('button',{name:'Review recovered draft'}).click();
 await expect(page.getByRole('dialog',{name:'Recover your work'})).toBeVisible();
 await page.getByRole('button',{name:'Apply selected draft'}).click();await expect(name).toHaveValue('Recoverable Pupil');
 await page.getByRole('dialog').getByRole('button',{name:'Next',exact:true}).click();
 // Keyboard and mobile/RTL with the real recovered admission dialog.
 for(const width of [1280,768,360]){await page.setViewportSize({width,height:900});await fits(page);}
 await page.evaluate(()=>{document.documentElement.dir='rtl';document.documentElement.style.fontSize='200%';});await fits(page);
 const guardianPhone=page.getByLabel('Guardian Phone (WhatsApp) *',{exact:true});await guardianPhone.focus();
 await expect.poll(()=>guardianPhone.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;})).toBe(true);
 await page.screenshot({path:`${output}/admission-recovered-rtl-zoom.png`});
 results.push('admission: real offline edit, refresh, explicit recovery, desktop/tablet/phone, RTL + 200% text');
 await page.getByLabel('Guardian Phone (WhatsApp) *',{exact:true}).fill('03001234567');
 await page.getByRole('dialog').getByRole('button',{name:'Next',exact:true}).click();
 await page.getByLabel('Medical Notes *',{exact:true}).fill('PRIVATE_HEALTH_SENTINEL');
 assert(!await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('skoolee:draft:')&&sessionStorage.getItem(k).includes('PRIVATE_HEALTH_SENTINEL'))));
 // Existing pupil draft versus a genuine concurrent staff update.
 await page.setViewportSize({width:1280,height:900});await visit(page,'/admin?view=students');
 await page.getByText('Synthetic Learner',{exact:true}).first().click();
 await page.getByRole('button',{name:'Edit Details',exact:true}).click();
 await page.getByLabel('Full Name (English)',{exact:true}).fill('Draft Learner');
 await expect(page.getByText(/Draft saved in this tab at/)).toBeVisible();
 await db.student.update({where:{id:student.id},data:{fullName:'Server Learner'}});
 await page.reload();await page.waitForLoadState('networkidle');await page.getByText('Server Learner',{exact:true}).first().click();
 await page.getByRole('button',{name:'Review recovered draft'}).click();
 await expect(page.getByRole('button',{name:'Apply selected draft'})).toBeDisabled();
 await page.getByLabel('Use draft value',{exact:true}).check();await page.getByRole('button',{name:'Apply selected draft'}).click();
 await expect(page.getByLabel('Full Name (English)',{exact:true})).toHaveValue('Draft Learner');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await expect.poll(async()=> (await db.student.findUnique({where:{id:student.id}})).fullName).toBe('Draft Learner');
 await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('student%3A')).length)).toBe(0);
 results.push('pupil record: real edit, refresh, concurrent staff update, explicit resolution and confirmed save');
 await db.student.update({where:{id:student.id},data:{fullName:'Synthetic Learner'}});
 // Settings recovery compares current values and confirms the server write.
 await visit(page,'/dashboard/settings');await page.getByRole('button',{name:'Edit',exact:true}).first().click();
 await page.getByLabel('School Name',{exact:false}).fill('Draft School');
 await expect(page.getByText(/Draft saved in this tab at/)).toBeVisible();
 await db.school.update({where:{id:school.id},data:{name:'Server School'}});
 await page.reload();await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Edit',exact:true}).first().click();
 await page.getByRole('button',{name:'Review recovered draft'}).click();
 await page.getByLabel('Use draft value',{exact:true}).check();await page.getByRole('button',{name:'Apply selected draft'}).click();
 await expect(page.getByLabel('School Name',{exact:false})).toHaveValue('Draft School');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect.poll(async()=> (await db.school.findUnique({where:{id:school.id}})).name).toBe('Draft School');
 results.push('settings: real refresh, concurrent school edit, review and confirmed save');
 // Same-browser account switch: old admission draft must not be offered to a teacher.
 await login(context,users.TEACHER);await visit(page,'/teacher/marks');
 const cell=page.getByRole('spinbutton',{name:/Mathematics marks for Synthetic Learner/});await expect(cell).toHaveValue('10');
 assert(!await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('skoolee:draft:')&&sessionStorage.getItem(k).includes('Recoverable Pupil'))));
 await cell.fill('25');await expect(page.getByText(/Draft saved in this tab at/)).toBeVisible();
 // A second staff update is genuine server data, not a mocked API response.
 await db.mark.update({where:{id:mark.id},data:{marksObtained:30}});
 await page.reload();await page.waitForLoadState('networkidle');await expect(cell).toHaveValue('30');
 await page.getByRole('button',{name:'Review recovered draft'}).click();
 await expect(page.getByText(/Resolve 1 conflicting fields/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Apply selected draft'})).toBeDisabled();
 await page.getByLabel('Use draft value',{exact:true}).check();await page.getByRole('button',{name:'Apply selected draft'}).click();await expect(cell).toHaveValue('25');
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');
 await cell.fill('101');await expect(cell).toHaveAttribute('aria-invalid','true');await page.getByRole('button',{name:/Synthetic Learner: Mathematics must be between/}).click();await expect(cell).toBeFocused();
 await page.screenshot({path:`${output}/marks-focused-zoom.png`});

 await expect.poll(()=>cell.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;})).toBe(true);
 await cell.fill('25');await cell.press('Tab');
 // Browser Back is intercepted before leaving, and cancel retains keyboard input.
 await page.evaluate(()=>history.pushState({...history.state},'',location.href+'?audit=1'));
 await page.evaluate(()=>history.back());
 await expect(page.getByRole('alertdialog',{name:'Leave without saving?'})).toBeVisible();
 await page.getByRole('button',{name:'Stay on this page'}).click();await expect(cell).toHaveValue('25');
 // A server change while the sheet is open must return conflict, retaining local edits.
 await db.mark.update({where:{id:mark.id},data:{marksObtained:40}});
 const conflict=await page.evaluate(async body=>(await fetch('/api/marks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,{examId:exam.id,entries:[{studentId:student.id,subjectId:subject.id,marksObtained:25}],expectedMarks:{[`${student.id}:${subject.id}`]:'30'}});
 assert.equal(conflict,409);assert.equal((await db.mark.findUnique({where:{id:mark.id}})).marksObtained,40);

 await page.reload();await page.waitForLoadState('networkidle');
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');
 const reviewButton=page.getByRole('button',{name:'Review recovered draft'});
 await tabTo(page,reviewButton);await page.keyboard.press('Enter');
 const chooseDraft=page.getByLabel('Use draft value',{exact:true});
 await tabTo(page,page.getByLabel('Use current value',{exact:true}));await page.keyboard.press('ArrowRight');await expect(chooseDraft).toBeChecked();
 const applyButton=page.getByRole('button',{name:'Apply selected draft'});
 await tabTo(page,applyButton);await page.keyboard.press('Enter');await expect(cell).toHaveValue('25');
 const saveMarksButton=page.getByRole('button',{name:'Save marks',exact:true});
 await tabTo(page,saveMarksButton);await page.keyboard.press('Enter');
 await expect.poll(async()=>(await db.mark.findUnique({where:{id:mark.id}})).marksObtained).toBe(25);
 await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
 await page.screenshot({path:`${output}/marks-conflict-reviewed.png`,fullPage:true});
 results.push('marks: current server 30 vs draft 25 vs base 10, explicit conflict choice, field error + summary keyboard focus, keyboard-only second recovery and confirmed save at 200%');
 // Incomplete onboarding has its own scoped draft and actual sign-out purge.
 await login(context,onboardingUser);await visit(page,'/onboarding');
 await page.getByLabel('School Name',{exact:false}).fill('Unfinished School');
 await expect(page.getByText(/Draft saved in this tab at/)).toBeVisible();
 await page.reload();await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Review recovered draft'}).click();
 await page.getByRole('button',{name:'Apply selected draft'}).click();
 await expect(page.getByLabel('School Name',{exact:false})).toHaveValue('Unfinished School');
 await page.getByRole('button',{name:'Sign Out',exact:true}).first().click();await page.waitForURL('**/login');
 assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('skoolee:draft:')).length),0);
 await login(context,onboardingUser);await visit(page,'/onboarding');await expect(page.getByRole('button',{name:'Review recovered draft'})).toHaveCount(0);
 results.push('onboarding: actual incomplete-account draft recovery, actual sign-out purge, same-account new-login isolation');
 await login(context,teacherOnboardingUser);await visit(page,'/teacher-onboarding');
 assert.equal(new URL(page.url()).pathname,'/teacher-onboarding');
 await page.getByLabel(/^Full Name/).fill('Recovered Teacher');await page.getByLabel(/^Phone Number/).fill('03001234567');
 await page.getByLabel('CNIC',{exact:true}).fill('PRIVATE_ID_SENTINEL');
 await expect(page.getByText(/Draft saved in this tab at/)).toBeVisible();
 await page.reload();await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Review recovered draft'}).click();
 await page.getByRole('button',{name:'Apply selected draft'}).click();
 await expect(page.getByLabel(/^Full Name/)).toHaveValue('Recovered Teacher');await expect(page.getByLabel('CNIC',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
 await page.getByRole('button',{name:'Complete Profile',exact:true}).click();await page.waitForURL('**/teacher');
 assert.equal((await db.user.findUnique({where:{id:teacherOnboardingUser.id}})).onboardingComplete,true);
 results.push('teacher onboarding: correct incomplete-role route, real refresh/recovery, national ID excluded, confirmed profile completion');
 await login(context,users.TEACHER);await visit(page,'/teacher/marks');
 await cell.fill('45');await expect(page.getByText(/Draft saved in this tab at/)).toBeVisible();
 await page.reload();await page.waitForLoadState('networkidle');
 await db.user.update({where:{id:users.TEACHER.id},data:{isActive:false}});
 await page.getByRole('button',{name:'Review recovered draft'}).click();await page.waitForURL('**/login?reason=session-changed');
 assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('skoolee:draft:')).length),0);
 results.push('revocation: real account deactivation before review prevents disclosure and purges protected draft');
 await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 await browser?.close();
 let cleaned=false;
 if(school){
 const users=await db.user.findMany({where:{schoolId:school.id},select:{id:true}});
 await db.superAdminAuditLog.deleteMany({where:{userId:{in:users.map(x=>x.id)}}});
 await db.mark.deleteMany({where:{schoolId:school.id}});await db.exam.deleteMany({where:{schoolId:school.id}});await db.subject.deleteMany({where:{schoolId:school.id}});await db.student.deleteMany({where:{schoolId:school.id}});await db.class.deleteMany({where:{schoolId:school.id}});await db.user.deleteMany({where:{schoolId:school.id}});await db.school.delete({where:{id:school.id}});cleaned=true;
 }
 await db.$disconnect();writeFileSync(`${output}/results.json`,JSON.stringify({run,results,fixturesRemoved:cleaned},null,2));console.log(JSON.stringify({results,fixturesRemoved:cleaned}));
});
