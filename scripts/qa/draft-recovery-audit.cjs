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
async function admission(page){await page.getByRole('button',{name:'Add Student',exact:true}).click();await expect(page.getByRole('dialog').first()).toBeVisible();}
async function fits(page){
 const dialog=page.getByRole('dialog').last();
 if(await dialog.count()){
  const bounds=await dialog.boundingBox();const width=page.viewportSize().width;
  assert(bounds && bounds.x>=-1 && bounds.x+bounds.width<=width+1,'active dialog exceeds viewport');
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'active dialog has horizontal overflow');
 }else assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
 await page.screenshot({path:`${output}/latest.png`});
}

(async()=>{
 school=await db.school.create({data:{name:'Synthetic Draft QA',slug:`sko196-${run}`,status:'ACTIVE',plan:'PRO',city:'Baseline City',regId:run,contactEmail:`${run}@example.invalid`}});
 const campus=await db.campus.create({data:{schoolId:school.id,name:'QA Campus',city:'Baseline City',regId:`${run}-campus`}});
 const users={};for(const role of ['ADMIN','TEACHER'])users[role]=await db.user.create({data:{schoolId:school.id,campusId:campus.id,email:`${run}-${role}@example.invalid`,fullName:`QA ${role}`,role,password:await bcrypt.hash(password,10),onboardingComplete:true}});
 const classroom=await db.class.create({data:{schoolId:school.id,campusId:campus.id,name:'QA Class',academicYear:2026,classTeacherId:users.TEACHER.id}});
 const student=await db.student.create({data:{schoolId:school.id,campusId:campus.id,classId:classroom.id,fullName:'Synthetic Learner',rollNo:'QA01',gender:'MALE'}});
 const subject=await db.subject.create({data:{schoolId:school.id,campusId:campus.id,classId:classroom.id,name:'Mathematics',teacherId:users.TEACHER.id,totalMarks:100}});
 const exam=await db.exam.create({data:{schoolId:school.id,campusId:campus.id,classId:classroom.id,title:'Draft QA Exam',term:'First',academicYear:2026,status:'ACTIVE'}});
 const mark=await db.mark.create({data:{schoolId:school.id,campusId:campus.id,examId:exam.id,studentId:student.id,subjectId:subject.id,marksObtained:10,enteredBy:users.TEACHER.id}});
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});const page=await context.newPage();
 page.on('dialog',d=>d.accept());
 await login(context,users.ADMIN);await visit(page,'/dashboard/students');await admission(page);
 const name=page.getByLabel('Full Name (English) *',{exact:true});await name.fill('Recoverable Pupil');
 await expect(page.getByText(/Draft saved in this tab at/)).toBeVisible();
 await page.reload();await page.waitForLoadState('networkidle');await admission(page);
 await expect(name).toHaveValue('');await page.getByRole('button',{name:'Review recovered draft'}).click();
 await expect(page.getByRole('dialog',{name:'Recover your work'})).toBeVisible();
 await page.getByRole('button',{name:'Apply selected draft'}).click();await expect(name).toHaveValue('Recoverable Pupil');
 await page.getByRole('dialog').getByRole('button',{name:'Next',exact:true}).click();
 // Keyboard and mobile/RTL with the real recovered admission dialog.
 for(const width of [1280,768,360]){await page.setViewportSize({width,height:900});await fits(page);}
 await page.evaluate(()=>{document.documentElement.dir='rtl';document.documentElement.style.fontSize='200%';});await fits(page);
 await page.screenshot({path:`${output}/admission-recovered-rtl-zoom.png`,fullPage:true});
 results.push('admission: real edit, refresh, explicit recovery, desktop/tablet/phone, RTL + 200% text');
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
 await cell.fill('101');await expect(cell).toHaveAttribute('aria-invalid','true');await page.getByRole('button',{name:/Synthetic Learner: Mathematics must be between/}).click();await expect(cell).toBeFocused();
 await cell.fill('25');await cell.press('Tab');
 await page.screenshot({path:`${output}/marks-conflict-reviewed.png`,fullPage:true});
 results.push('marks: current server 30 vs draft 25 vs base 10, explicit conflict choice, field error + summary keyboard focus');
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
