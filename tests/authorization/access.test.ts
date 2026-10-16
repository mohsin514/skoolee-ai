import { reviewQueue, approveVersions, publishExam } from "../../src/lib/academic/report-versions";
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
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
const appUrl = new URL(process.env.AUTHZ_TEST_APP_URL || 'http://localhost:3107');
if (!['127.0.0.1','localhost'].includes(dbUrl.hostname) || dbUrl.pathname !== '/postgres' || dbUrl.port !== '55438' || process.env.DIRECT_URL !== process.env.DATABASE_URL) throw new Error('Use isolated PG55438 with matching DATABASE_URL and DIRECT_URL');
if (!['127.0.0.1','localhost'].includes(appUrl.hostname) || appUrl.port !== '3107') throw new Error('Use isolated app on 3107');
const raw = new PrismaClient();
const key = randomUUID();
const schoolA = `authz-a-${key}`, schoolB = `authz-b-${key}`;
const campusA = randomUUID(), campusB = randomUUID(), foreignCampus = randomUUID();
const classA = randomUUID(), classB = randomUUID(), foreignClass = randomUUID();
const own = randomUUID(), namesake = randomUUID(), sibling = randomUUID(), foreign = randomUUID();
const published = randomUUID(), draft = randomUUID(), publishedReport = randomUUID(), draftReport = randomUUID();
const actors = new Map<string, AuthUser>();
const cookies = new Map<string,string>();
const privateObjects = new Map<string, string>();
let objectReads = 0, objectPutAttempts = 0, objectWrites = 0;
const objectStore = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '').split('?')[0]);
  if (!path.startsWith('/synthetic-only/')) { res.writeHead(404); res.end(); return; }
  const key = path.replace(/^\/synthetic-only\//, '');
  if (req.method === 'PUT') {
    objectPutAttempts += 1;
    if (req.headers['if-none-match'] !== '*') { res.writeHead(400); res.end(); return; }
    if (privateObjects.has(key)) { res.writeHead(412, {'content-type':'application/xml'}); res.end('<Error><Code>PreconditionFailed</Code></Error>'); return; }
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => { privateObjects.set(key, Buffer.concat(chunks).toString('utf8')); objectWrites += 1; res.writeHead(200, {'etag':'"synthetic"'}); res.end(); });
    return;
  }
  objectReads += 1;
  const object = privateObjects.get(key);
  if (req.method !== 'GET' || object === undefined) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type':'application/pdf', 'content-length':Buffer.byteLength(object)}); res.end(object);
});
const ctx = (user: AuthUser) => ({ schoolId: user.schoolId, campusId: user.campusId, role: user.role, userId: user.userId });
async function request(role: string, path: string, body?: unknown) {
  return fetch(new URL(path, appUrl), { redirect: 'manual', headers: { cookie: cookies.get(role)!, ...(body ? {'content-type':'application/json'} : {}) }, ...(body ? {method:'POST', body:JSON.stringify(body)} : {}) });
}
async function upload(role: string, url: string, bytes = 'ABCD', contentType = 'application/pdf') {
  return fetch(new URL(url,appUrl),{method:'PUT',headers:{cookie:cookies.get(role)!, 'content-type':contentType},body:bytes});
}
before(async () => {
  await new Promise<void>((resolve, reject) => { objectStore.once('error', reject); objectStore.listen(55440, '127.0.0.1', resolve); });
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
  for (const [studentId, campusId] of [[own, campusA], [sibling, campusB]]) {
    const relationship = await raw.guardianRelationship.create({ data: {
      schoolId: schoolA, campusId, studentId, guardianUserId: actors.get('PARENT')!.userId,
      createdByUserId: actors.get('CAMPUS_ADMIN')!.userId, fullName: 'Synthetic guardian',
      email: actors.get('PARENT')!.email, relationship: 'Parent', status: 'ACTIVE', verifiedAt: new Date(),
    } });
    await raw.guardianAccessVersion.create({ data: {
      schoolId: schoolA, relationshipId: relationship.id, createdByUserId: actors.get('CAMPUS_ADMIN')!.userId,
      reason: 'Synthetic authorization fixture', permissions: { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false },
    } });
  }
  const subject=await raw.subject.create({data:{schoolId:schoolA,campusId:campusA,classId:classA,name:'Synthetic math'}});
  for(const [id,status] of [[published,'PUBLISHED'],[draft,'DRAFT']]) {
    await raw.exam.create({data:{id,schoolId:schoolA,campusId:campusA,classId:classA,title:status,term:'Term 1',academicYear:2026,status,isLocked:status==="PUBLISHED"}});
    await raw.mark.create({data:{schoolId:schoolA,campusId:campusA,examId:id,studentId:own,subjectId:subject.id,marksObtained:status==='DRAFT'?99:80}});
    await raw.reportCard.create({data:{id:status==='DRAFT'?draftReport:publishedReport,schoolId:schoolA,campusId:campusA,examId:id,studentId:own,status:status==='DRAFT'?'GENERATED':'PUBLISHED',remarksEn:status==='DRAFT'?null:'Synthetic approved report'}});
  }
  await runWithTenantContext(ctx(actors.get('PRINCIPAL')!), async () => {
    const [version] = await reviewQueue([publishedReport]);
    await approveVersions([{reportCardId:publishedReport,versionId:version.id}],actors.get('PRINCIPAL')!.userId);
    await publishExam(published,actors.get('PRINCIPAL')!.userId);
  });
});
after(async()=>{ objectStore.closeAllConnections(); await new Promise<void>(resolve=>objectStore.close(()=>resolve())); await rm("public/generated/reports/sko207-synthetic.pdf",{force:true}); await rm("public/sko207-control.txt",{force:true}); await raw.school.deleteMany({where:{id:{in:[schoolA,schoolB]}}}); await raw.$disconnect(); await prisma.$disconnect(); });

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
test('permission changes apply to the next protected effect after a navigation read', async () => {
  const permission = await raw.rolePermission.create({data:{schoolId:schoolA,role:'CAMPUS_ADMIN',module:'students',canView:true,canAdd:false,canEdit:false,canDelete:false}});
  try {
    assert.equal((await request('CAMPUS_ADMIN', '/api/navigation/access')).status, 200);
    assert.equal((await request('CAMPUS_ADMIN', '/api/students/export')).status, 200);
    await raw.rolePermission.update({where:{id:permission.id},data:{canView:false}});
    assert.equal((await request('CAMPUS_ADMIN', '/api/students/export')).status, 403);
    const navigation = await request('CAMPUS_ADMIN', '/api/navigation/access');
    assert.equal((await navigation.json()).access.students, false);
  } finally { await raw.rolePermission.delete({where:{id:permission.id}}); }
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

test('guardian revocation and account changes invalidate existing cookies and capability links', async () => {
  const guardian = actors.get('PARENT')!;
  const minted = await request('CAMPUS_ADMIN', '/api/parent/token', { studentId: own });
  assert.equal(minted.status, 200, await minted.clone().text());
  const { token } = await minted.json();
  const linked = () => fetch(new URL(`/api/parent/data?token=${encodeURIComponent(token)}`, appUrl));
  assert.equal((await linked()).status, 200);
  await raw.guardianRelationship.updateMany({where:{schoolId:schoolA, studentId:own, guardianUserId:guardian.userId},data:{status:'REVOKED'}});
  try {
    assert.equal((await linked()).status, 403);
    assert.equal((await request('PARENT', `/api/parent/data?studentId=${own}`)).status, 403);
    assert.equal((await request('PARENT', `/api/parent/data?studentId=${sibling}`)).status, 200);
  } finally {
    await raw.guardianRelationship.updateMany({where:{schoolId:schoolA,studentId:own,guardianUserId:guardian.userId},data:{status:'ACTIVE'}});
  }
  for (const change of [{isActive:false}, {role:'LIBRARIAN'}] as const) {
    await raw.user.update({where:{id:guardian.userId},data:change});
    try {
      assert.equal((await linked()).status, 403);
      assert.equal((await request('PARENT', '/api/auth/session')).status, 401);
    } finally { await raw.user.update({where:{id:guardian.userId},data:{isActive:true,role:'PARENT'}}); }
  }
  await raw.student.update({where:{id:own},data:{archivedAt:new Date()}});
  try { assert.equal((await linked()).status, 403); }
  finally { await raw.student.update({where:{id:own},data:{archivedAt:null}}); }
});

test('changing one guardian permission does not retain cached report or finance authority', async () => {
  const guardian = actors.get('PARENT')!;
  const relationship = await raw.guardianRelationship.findFirstOrThrow({where:{schoolId:schoolA,studentId:own,guardianUserId:guardian.userId}});
  const version = await raw.guardianAccessVersion.findFirstOrThrow({where:{relationshipId:relationship.id}});
  const permissions = version.permissions;
  try {
    await raw.guardianAccessVersion.update({where:{id:version.id},data:{permissions:{learningRecords:false,finances:true,attendance:true,communication:true,pickup:false}}});
    assert.equal((await request('PARENT', `/api/reports/download?reportCardId=${publishedReport}`)).status, 403);
    assert.equal((await request('PARENT', `/api/fees/student/${own}`)).status, 200);
    await runWithTenantContext(ctx(guardian), async () => {
      await assert.rejects(getStudentContext(guardian, own), {message:ACCESS_DENIED});
    });
    await raw.guardianAccessVersion.update({where:{id:version.id},data:{permissions:{learningRecords:true,finances:false,attendance:true,communication:true,pickup:false}}});
    assert.equal((await request('PARENT', `/api/fees/student/${own}`)).status, 403);
    assert.equal((await request('PARENT', `/api/reports/download?reportCardId=${publishedReport}`)).status, 200);
  } finally { await raw.guardianAccessVersion.update({where:{id:version.id},data:{permissions:permissions as never}}); }
});

test('database rejects overlapping or empty guardian permission intervals and permits adjacent versions', async () => {
  const relationship = await raw.guardianRelationship.findFirstOrThrow({where:{schoolId:schoolA,studentId:own,guardianUserId:actors.get('PARENT')!.userId}});
  const version = await raw.guardianAccessVersion.findFirstOrThrow({where:{relationshipId:relationship.id}});
  const boundary = new Date(Date.now() + 60_000);
  const base = {schoolId:schoolA,relationshipId:relationship.id,createdByUserId:actors.get('CAMPUS_ADMIN')!.userId,reason:'Synthetic interval regression',permissions:{learningRecords:false}};
  await raw.guardianAccessVersion.update({where:{id:version.id},data:{effectiveUntil:boundary}});
  let adjacent: string | undefined;
  try {
    await assert.rejects(raw.guardianAccessVersion.create({data:{...base,effectiveFrom:new Date(boundary.getTime()-1)}}), error => (String(error)+JSON.stringify(error)).includes('guardian_access_versions_no_overlap'));
    await assert.rejects(raw.guardianAccessVersion.create({data:{...base,effectiveFrom:boundary,effectiveUntil:boundary}}), error => (String(error)+JSON.stringify(error)).includes('guardian_access_versions_effective_interval_valid'));
    const next = await raw.guardianAccessVersion.create({data:{...base,effectiveFrom:boundary}});
    adjacent = next.id;
    assert.equal(await raw.guardianAccessVersion.count({where:{relationshipId:relationship.id}}),2);
  } finally {
    if (adjacent) await raw.guardianAccessVersion.delete({where:{id:adjacent}});
    await raw.guardianAccessVersion.update({where:{id:version.id},data:{effectiveUntil:version.effectiveUntil}});
  }
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
test('enrollment counts and rows honor independent guardian fields and shared publication authority', async () => {
  const parentId = actors.get('PARENT')!.userId;
  const relationship = await raw.guardianRelationship.findFirstOrThrow({where:{schoolId:schoolA,studentId:own,guardianUserId:parentId}});
  const version = await raw.guardianAccessVersion.findFirstOrThrow({where:{relationshipId:relationship.id,effectiveUntil:null}});
  const originalPermissions = version.permissions;
  const existingEnrollment = await raw.studentEnrollment.findFirst({where:{schoolId:schoolA,studentId:own,endDate:null},orderBy:{startDate:'desc'}});
  const ownEnrollment = existingEnrollment ?? await raw.studentEnrollment.create({data:{schoolId:schoolA,studentId:own,campusId:campusA,classId:classA,campusName:'Synthetic campus',className:'Synthetic class',curriculum:'Synthetic',academicYear:2026,rollNo:own,startDate:new Date('2026-01-01T00:00:00Z')}});
  const originalReports = await raw.reportCard.findMany({where:{id:{in:[publishedReport,draftReport]}},select:{id:true,enrollmentId:true,status:true}});
  // A db-push fixture has no enrollment assignment trigger. Never reassign an existing source.
  for (const report of originalReports) if (!report.enrollmentId) await raw.reportCard.update({where:{id:report.id},data:{enrollmentId:ownEnrollment.id}});
  const date = new Date(); date.setUTCHours(0,0,0,0);
  const attendance = await raw.attendance.create({data:{schoolId:schoolA,campusId:campusA,classId:classA,studentId:own,enrollmentId:ownEnrollment.id,date,status:'PRESENT'}});
  const invoice = await raw.invoice.create({data:{schoolId:schoolA,campusId:campusA,studentId:own,enrollmentId:ownEnrollment.id,invoiceNumber:`SYNTHETIC-${randomUUID()}`,invoiceDate:date,dueDate:date,currency:'PKR',monthlyFee:1234,subtotal:1234,totalAmount:1234,balanceDue:1234}});
  const summaryUrl = `/api/students/enrollments?studentId=${own}`;
  const detailUrl = `${summaryUrl}&enrollmentId=${ownEnrollment.id}`;
  const check = async (attendanceAllowed: boolean, financesAllowed: boolean) => {
    await raw.guardianAccessVersion.update({where:{id:version.id},data:{permissions:{learningRecords:true,attendance:attendanceAllowed,finances:financesAllowed,communication:true,pickup:false}}});
    const summary = await request('PARENT',summaryUrl); assert.equal(summary.status,200,await summary.clone().text());
    assert.equal(summary.headers.get('cache-control'),'private, no-store');
    const counts = (await summary.json()).pupil.enrollments.find((row:{id:string})=>row.id===ownEnrollment.id)._count;
    assert.deepEqual(counts,{attendance:Number(attendanceAllowed),invoices:Number(financesAllowed),reports:1});
    const detail = await request('PARENT',detailUrl); assert.equal(detail.status,200,await detail.clone().text());
    const data = await detail.json();
    assert.deepEqual(data.attendance.map((row:{id:string})=>row.id),attendanceAllowed?[attendance.id]:[]);
    assert.deepEqual(data.invoices.map((row:{id:string})=>row.id),financesAllowed?[invoice.id]:[]);
    assert.deepEqual(data.reports.map((row:{id:string})=>row.id),[publishedReport]);
    assert.ok(!JSON.stringify(data).includes(draftReport),'legacy SENT status cannot reveal an unpublished report');
  };
  try {
    await raw.reportCard.update({where:{id:draftReport},data:{status:'SENT'}});
    await check(true,true); await check(false,false); await check(true,false); await check(false,true);
    await raw.exam.update({where:{id:published},data:{status:'DRAFT'}});
    try {
      const summary = await (await request('PARENT',summaryUrl)).json();
      assert.equal(summary.pupil.enrollments.find((row:{id:string})=>row.id===ownEnrollment.id)._count.reports,0);
      assert.deepEqual((await (await request('PARENT',detailUrl)).json()).reports,[],'an issued version alone cannot expose a draft exam');
    } finally { await raw.exam.update({where:{id:published},data:{status:'PUBLISHED'}}); }
    await raw.guardianAccessVersion.update({where:{id:version.id},data:{permissions:{learningRecords:false,attendance:true,finances:true,communication:true}}});
    assert.equal((await request('PARENT',detailUrl)).status,404,'enrollment entry still requires learning-record authority');
    const student = await request('STUDENT',detailUrl); assert.equal(student.status,200);
    assert.deepEqual((await student.json()).reports.map((row:{id:string})=>row.id),[publishedReport]);
  } finally {
    await raw.guardianAccessVersion.update({where:{id:version.id},data:{permissions:originalPermissions as never}});
    await raw.attendance.delete({where:{id:attendance.id}}); await raw.invoice.delete({where:{id:invoice.id}});
    for (const report of originalReports) await raw.reportCard.update({where:{id:report.id},data:{status:report.status,...(!report.enrollmentId?{enrollmentId:null}:{})}});
    if (!existingEnrollment) await raw.studentEnrollment.delete({where:{id:ownEnrollment.id}});
  }
});

test('exports, search scope, attachment signing and job status enforce current permissions',async()=>{
 assert.equal((await request('PARENT','/api/students/export')).status,403);
 assert.equal((await request('STUDENT','/api/fees/generation-job/invoice-gen-2026-10')).status,403);
 assert.equal((await request('CAMPUS_ADMIN',`/api/students/export?campusId=${campusB}`)).status,403);
 const csv=await request('CAMPUS_ADMIN',`/api/students/export?search=Same`);assert.equal(csv.status,200);const text=await csv.text();assert.ok(text.includes(own));assert.ok(!text.includes(sibling));assert.ok(!text.includes(foreign));
 const attachment=await request('CAMPUS_ADMIN','/api/chat/attachments',{conversationId:randomUUID(),fileName:'synthetic.pdf',contentType:'application/pdf',sizeBytes:128});assert.ok([403,404].includes(attachment.status));
});

test('retained student and staff file URLs reauthorize before fetching private bytes', async () => {
  const studentKey = `student-docs/${campusA}/${own}/synthetic.pdf`;
  const staffId = actors.get('TEACHER')!.userId;
  const staffKey = `staff-docs/${campusA}/${staffId}/synthetic.pdf`;
  privateObjects.set(studentKey, 'SYNTHETIC PRIVATE STUDENT DOCUMENT');
  privateObjects.set(staffKey, 'SYNTHETIC PRIVATE STAFF DOCUMENT');
  const studentDoc = await raw.studentDocument.create({data:{schoolId:schoolA,studentId:own,kind:'OTHER',fileKey:studentKey,fileName:'Synthetic.pdf'}});
  const staffDoc = await raw.staffDocument.create({data:{schoolId:schoolA,userId:staffId,kind:'OTHER',fileKey:staffKey,fileName:'Synthetic.pdf'}});
  const studentList = await request('CAMPUS_ADMIN', `/api/students/documents?studentId=${own}`);
  assert.equal(studentList.status, 200);
  const studentUrl = (await studentList.json()).data.find((doc: {id:string}) => doc.id === studentDoc.id).downloadUrl;
  assert.ok(studentUrl.startsWith('/api/students/documents?'));
  const staffList = await request('CAMPUS_ADMIN', `/api/staff/documents?userId=${staffId}`);
  assert.equal(staffList.status, 200);
  const staffUrl = (await staffList.json()).data.find((doc: {id:string})=>doc.id===staffDoc.id).downloadUrl;
  assert.ok(staffUrl.startsWith('/api/staff/documents?'));
  for (const [url, text] of [[studentUrl,'SYNTHETIC PRIVATE STUDENT DOCUMENT'],[staffUrl,'SYNTHETIC PRIVATE STAFF DOCUMENT']]) {
    const response = await request('CAMPUS_ADMIN',url);
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(await response.text(),text); assert.equal(response.headers.get('location'),null);
    assert.match(response.headers.get('content-security-policy') ?? '', /(?:^|;)\s*sandbox(?:;|$)/);
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  }
  const enrollmentUrl = `/api/students/enrollments?studentId=${own}&documentId=${studentDoc.id}`;
  const enrollmentDownload = await request('CAMPUS_ADMIN',enrollmentUrl);
  assert.equal(enrollmentDownload.status,200);
  assert.equal(await enrollmentDownload.text(),'SYNTHETIC PRIVATE STUDENT DOCUMENT');
  assert.equal(enrollmentDownload.headers.get('location'),null);
  const profile = await request('CAMPUS_ADMIN',`/api/staff/profile?userId=${staffId}`);
  assert.equal(profile.status,200);
  assert.equal((await profile.json()).data.staffDocuments.find((doc:{id:string})=>doc.id===staffDoc.id).downloadUrl,staffUrl);
  const priorReads = objectReads;
  const admin = actors.get('CAMPUS_ADMIN')!;
  await raw.user.update({where:{id:admin.userId},data:{campusId:campusB}});
  try {
    for (const url of [studentUrl,staffUrl,enrollmentUrl]) assert.ok([403,404].includes((await request('CAMPUS_ADMIN',url)).status));
    assert.equal(objectReads,priorReads,'denied scope must not fetch object storage');
  } finally { await raw.user.update({where:{id:admin.userId},data:{campusId:campusA}}); }
  for (const url of [studentUrl,staffUrl,enrollmentUrl]) assert.equal((await request('PARENT',url)).status,403);
  const forged = await request('CAMPUS_ADMIN','/api/students/documents',{studentId:own,kind:'OTHER',fileKey:`student-docs/${foreignCampus}/${foreign}/private.pdf`,fileName:'Forged.pdf'});
  assert.equal(forged.status,400);
  assert.equal(objectReads,priorReads);
});

test('retained chat attachment URL rechecks exact class access and membership before private storage', async () => {
  const parentId = actors.get('PARENT')!.userId;
  const adminId = actors.get('CAMPUS_ADMIN')!.userId;
  const conversation = await raw.conversation.create({data:{schoolId:schoolA,campusId:campusA,classId:classA,kind:'CLASS',createdById:adminId,title:'Synthetic private class',members:{create:[{schoolId:schoolA,userId:adminId,memberRole:'OWNER'},{schoolId:schoolA,userId:parentId}]}}});
  const storageKey = `chat/${schoolA}/${conversation.id}/synthetic.pdf`;
  privateObjects.set(storageKey,'SYNTHETIC PRIVATE CHAT ATTACHMENT');
  const message = await raw.chatMessage.create({data:{schoolId:schoolA,conversationId:conversation.id,senderId:adminId,kind:'FILE',body:'Synthetic attachment',attachments:{create:{schoolId:schoolA,storageKey,fileName:'Synthetic.pdf',contentType:'application/pdf',sizeBytes:33}}},include:{attachments:true}});
  const expectedUrl = `/api/chat/attachments/${message.attachments[0].id}`;
  const list = await request('PARENT',`/api/chat/conversations/${conversation.id}/messages`);
  assert.equal(list.status,200,await list.clone().text());
  const body = await list.json();
  const knownUrl = body.messages.find((item:{id:string})=>item.id===message.id).attachments[0].url;
  assert.equal(knownUrl,expectedUrl);
  assert.ok(!JSON.stringify(body).includes(storageKey),'message payload must not expose storage credentials or keys');
  const initial = await request('PARENT',knownUrl);
  assert.equal(initial.status,200,await initial.clone().text());
  assert.equal(await initial.text(),'SYNTHETIC PRIVATE CHAT ATTACHMENT');
  assert.equal(initial.headers.get('cache-control'),'private, no-store');
  assert.equal(initial.headers.get('location'),null);
  assert.equal(initial.headers.get('x-content-type-options'),'nosniff');
  assert.match(initial.headers.get('content-security-policy') ?? '', /(?:^|;)\s*sandbox(?:;|$)/);
  assert.equal(initial.headers.get('referrer-policy'),'no-referrer');
  const priorReads = objectReads;
  const assertDenied = async (role = 'PARENT') => {
    const response = await request(role,knownUrl);
    assert.equal(response.status,403,await response.clone().text());
    assert.deepEqual(await response.json(),{error:ACCESS_DENIED});
    assert.equal(objectReads,priorReads,'denied known attachment must not fetch private storage');
  };
  const relationshipWhere = {schoolId:schoolA,studentId:own,guardianUserId:parentId};
  await raw.guardianRelationship.updateMany({where:relationshipWhere,data:{status:'REVOKED'}});
  try {
    assert.equal(await raw.guardianRelationship.count({where:{schoolId:schoolA,studentId:sibling,guardianUserId:parentId,status:'ACTIVE'}}),1,'unrelated sibling grant remains active');
    await assertDenied();
    assert.equal((await request('PARENT',`/api/chat/conversations/${conversation.id}/messages`)).status,404,'another class sibling cannot preserve this class channel');
  } finally { await raw.guardianRelationship.updateMany({where:relationshipWhere,data:{status:'ACTIVE'}}); }
  await raw.conversationMember.update({where:{conversationId_userId:{conversationId:conversation.id,userId:parentId}},data:{leftAt:new Date()}});
  try { await assertDenied(); }
  finally { await raw.conversationMember.update({where:{conversationId_userId:{conversationId:conversation.id,userId:parentId}},data:{leftAt:null}}); }
  await assertDenied('STUDENT');
  await raw.chatMessage.update({where:{id:message.id},data:{deletedAt:new Date()}});
  try { await assertDenied(); }
  finally { await raw.chatMessage.update({where:{id:message.id},data:{deletedAt:null}}); }
  const restored = await request('PARENT',knownUrl);
  assert.equal(restored.status,200); assert.equal(await restored.text(),'SYNTHETIC PRIVATE CHAT ATTACHMENT');
  assert.equal(objectReads,priorReads+1,'restoration uses current authority and fetches bytes again');
  const minted = await request('PARENT','/api/chat/attachments',{conversationId:conversation.id,fileName:'Synthetic.pdf',contentType:'application/pdf',sizeBytes:4});
  assert.equal(minted.status,200,await minted.clone().text());
  const uploadIntent = await minted.json();
  assert.ok(uploadIntent.uploadUrl.startsWith('/api/uploads/file?intent='));
  const attempts = objectPutAttempts;
  await raw.guardianRelationship.updateMany({where:relationshipWhere,data:{status:'REVOKED'}});
  try { assert.equal((await upload('PARENT',uploadIntent.uploadUrl)).status,404); assert.equal(objectPutAttempts,attempts); }
  finally { await raw.guardianRelationship.updateMany({where:relationshipWhere,data:{status:'ACTIVE'}}); }
  await raw.conversationMember.update({where:{conversationId_userId:{conversationId:conversation.id,userId:parentId}},data:{leftAt:new Date()}});
  try { assert.equal((await upload('PARENT',uploadIntent.uploadUrl)).status,404); assert.equal(objectPutAttempts,attempts); }
  finally { await raw.conversationMember.update({where:{conversationId_userId:{conversationId:conversation.id,userId:parentId}},data:{leftAt:null}}); }
  const uploaded = await upload('PARENT',uploadIntent.uploadUrl);
  assert.equal(uploaded.status,200,await uploaded.clone().text());
  assert.equal(privateObjects.get(uploadIntent.storageKey),'ABCD');

});

test('retained document upload intents cannot write after permission or campus changes', async () => {
  const input = {studentId:own,fileName:'Synthetic.pdf',contentType:'application/pdf',sizeBytes:4};
  const response = await request('CAMPUS_ADMIN','/api/uploads/presign',input);
  assert.equal(response.status,200);
  const {data} = await response.json();
  assert.ok(data.uploadUrl.startsWith('/api/uploads/file?intent='));
  const prior = objectPutAttempts, writes = objectWrites;
  const permission = await raw.rolePermission.create({data:{schoolId:schoolA,role:'CAMPUS_ADMIN',module:'students',canView:true,canEdit:false}});
  try { assert.equal((await upload('CAMPUS_ADMIN',data.uploadUrl)).status,403); assert.equal(objectPutAttempts,prior); }
  finally { await raw.rolePermission.delete({where:{id:permission.id}}); }
  const admin = actors.get('CAMPUS_ADMIN')!;
  await raw.user.update({where:{id:admin.userId},data:{campusId:campusB}});
  try { assert.equal((await upload('CAMPUS_ADMIN',data.uploadUrl)).status,403); assert.equal(objectPutAttempts,prior); }
  finally { await raw.user.update({where:{id:admin.userId},data:{campusId:campusA}}); }
  assert.equal((await upload('PARENT',data.uploadUrl)).status,403); assert.equal(objectPutAttempts,prior);
  const stored = await upload('CAMPUS_ADMIN',data.uploadUrl);
  assert.equal(stored.status,200,await stored.clone().text()); assert.equal(privateObjects.get(data.key),'ABCD'); assert.equal(objectWrites,writes+1);
  assert.equal((await upload('CAMPUS_ADMIN',data.uploadUrl)).status,409); assert.equal(objectWrites,writes+1,'replay cannot overwrite completed bytes');
  const fresh = (await (await request('CAMPUS_ADMIN','/api/uploads/presign',input)).json()).data;
  const attempts = objectPutAttempts;
  assert.equal((await upload('CAMPUS_ADMIN',fresh.uploadUrl,'ABCDE')).status,400);
  assert.equal((await upload('CAMPUS_ADMIN',fresh.uploadUrl,'ABCD','text/plain')).status,400);
  assert.equal(objectPutAttempts,attempts,'invalid bodies must not reach storage');
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
   assert.equal(new URL(page.url()).pathname,ROLE_DASHBOARD_PATHS[role],`${role} must render its authenticated dashboard`);
   const rendered=await page.locator('body').innerText();
   assert.ok(!rendered.includes('Application error'),`${role} server render`);
   if(role==='STUDENT' || role==='PARENT') await page.getByText('Same pupil name',{exact:false}).first().waitFor({state:'visible',timeout:20000});
   if(role==='PARENT') {
     // Same-name siblings intentionally have different records. Select the
     // published-record child explicitly rather than relying on tie ordering.
     await page.getByRole('button',{name:'Change child',exact:true}).click();
     await page.getByRole('dialog',{name:'Choose child',exact:true}).getByRole('button').filter({hasText:own}).click();
     await page.getByText('PUBLISHED',{exact:true}).first().waitFor({state:'visible',timeout:20000});
   }
   await page.waitForTimeout(400); // Let the existing dashboard entrance animation settle.
   await page.screenshot({path:`/private/tmp/sko377-${role.toLowerCase()}-desktop.png`,fullPage:true});
   await page.setViewportSize({width:768,height:1024});
   await page.screenshot({path:`/private/tmp/sko377-${role.toLowerCase()}-tablet.png`,fullPage:true});
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:`/private/tmp/sko377-${role.toLowerCase()}-mobile.png`,fullPage:true});
   if (role==='STUDENT' || role==='PARENT') {
     await page.setViewportSize({width:320,height:720});
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`${role} narrow phone overflow`);
     await page.addStyleTag({content:'html { font-size: 200% !important; }'});
     try { await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,null,{timeout:3000}); }
     catch {
       await page.screenshot({path:`/private/tmp/sko379-${role.toLowerCase()}-overflow-failure.png`,fullPage:true});
       const offenders=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(element=>({tag:element.tagName,className:element.getAttribute('class'),bounds:element.getBoundingClientRect().toJSON()})).filter(item=>item.bounds.right>innerWidth+1||item.bounds.left< -1).slice(0,20));
       assert.fail(`${role} persistent enlarged text overflow: ${JSON.stringify(offenders)}`);
     }
     assert.equal(await page.locator('.chat-launcher').isVisible(),false,`${role} floating chat must not cover mobile content`);
     await page.screenshot({path:`/private/tmp/sko379-${role.toLowerCase()}-phone-enlarged-text.png`,fullPage:true});
     await page.screenshot({path:`/private/tmp/sko379-${role.toLowerCase()}-phone-enlarged-viewport.png`,fullPage:false});
     const insight=page.getByRole('heading',{name:'Results by subject',exact:true});
     await insight.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
     await page.waitForFunction(()=>{
       const heading=[...document.querySelectorAll('h3')].find(element=>element.textContent==='Results by subject');
       const box=heading?.getBoundingClientRect();return box && box.y>=0 && box.bottom<innerHeight-100;
     });
     const titleGeometry=await insight.evaluate(element=>{
       const style=getComputedStyle(element), bounds=element.getBoundingClientRect();
       return {width:bounds.width,lines:bounds.height/parseFloat(style.lineHeight)};
     });
     assert.ok(titleGeometry.width>=120 && titleGeometry.lines<=4,`${role} actual insight heading must reflow into readable words: ${JSON.stringify(titleGeometry)}`);
     await page.screenshot({path:`/private/tmp/sko379-${role.toLowerCase()}-phone-insight-reflow.png`,fullPage:false});
     await page.getByRole('button',{name:'More',exact:true}).click();
     const directory=page.getByRole('dialog',{name:'Navigation',exact:true});
     const messages=directory.getByRole('link',{name:'Messages',exact:true});
     await messages.waitFor({state:'visible'});
     assert.equal(await messages.getAttribute('href'),'/messages',`${role} messages remains accessible without floating chat`);
     await messages.focus();
     await page.screenshot({path:`/private/tmp/sko379-${role.toLowerCase()}-phone-messages-directory.png`,fullPage:true});
     await page.keyboard.press('Escape');
     await directory.waitFor({state:'hidden'});
   }
   const journeys: Record<string, [string, string, string, string]> = {
     ACCOUNTANT:['invoices','Invoices','payments','Payments'], LIBRARIAN:['library','Library','leave','Leave'],
     RECEPTIONIST:['visitors','Visitors','complaints','Complaints'], APP_OWNER:['users','Users','audit','Audit Log'],
     SUPER_ADMIN:['billing','Plans & Billing','settings','School Settings'], PRINCIPAL:['attendance','Attendance','report-cards','Report Cards'],
   };
   const journey = journeys[role];
   if (journey) {
     const [first, firstLabel, second, secondLabel] = journey;
     if (role==='LIBRARIAN') assert.equal(await page.getByRole('button',{name:'Inventory',exact:true}).count(),0,'unavailable inventory shortcut must remain hidden');
     await page.setViewportSize({width:1440,height:1000});
     await page.getByRole('button',{name:firstLabel,exact:true}).first().click();
     await page.waitForFunction(view=>new URLSearchParams(location.search).get('view')===view,first);
     await page.reload({waitUntil:'domcontentloaded'});
     await page.locator(`[aria-current="page"][aria-label="${firstLabel}"]`).first().waitFor();
     assert.equal(new URL(page.url()).searchParams.get('view'),first);
     await page.screenshot({path:`/private/tmp/sko379-${role.toLowerCase()}-restored-workspace.png`,fullPage:true});
     if (role==='PRINCIPAL') await page.getByRole('button',{name:'Academics',exact:true}).first().click();
     await page.getByRole('button',{name:secondLabel,exact:true}).first().click();
     await page.waitForFunction(view=>new URLSearchParams(location.search).get('view')===view,second);
     await page.goBack({waitUntil:'domcontentloaded'});
     await page.waitForFunction(view=>new URLSearchParams(location.search).get('view')===view,first);
     await page.locator(`[aria-current="page"][aria-label="${firstLabel}"]`).first().waitFor();
   }
   if (role==='PRINCIPAL') {
     await page.goto(new URL('/principal?view=permissions',appUrl).href,{waitUntil:'domcontentloaded'});
     await page.getByRole('heading',{name:'Role permissions',exact:true}).waitFor();
     await page.getByText('Read only. Only the institution owner or super administrator with current staff-edit permission can change these school-wide defaults.',{exact:true}).waitFor();
     for(const control of await page.getByRole('switch').all()) assert.equal(await control.isDisabled(),true,'campus-bound principal cannot change school-wide defaults');
     await page.screenshot({path:'/private/tmp/sko377-permission-panel-actual-desktop.png',fullPage:true});
     await page.setViewportSize({width:390,height:844});
     await page.screenshot({path:'/private/tmp/sko377-permission-panel-actual-phone.png',fullPage:false});
   }
   await context.close();
  }
 } finally {await browser.close();}
});

test('neutral denied page offers a safe keyboard-accessible return in EN, AR and UR', {timeout:90_000}, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({headless:true});
  const parent = actors.get('PARENT')!;
  try {
    for (const [language, title] of [['en','Access Restricted'],['ar','الوصول مقيّد'],['ur','رسائی محدود ہے']]) {
      await raw.user.update({where:{id:parent.userId},data:{preferredLanguage:language}});
      const context = await browser.newContext({viewport:{width:320,height:720},reducedMotion:'reduce'});
      await context.addCookies([{name:'skoolee_token',value:cookies.get('PARENT')!.split('=')[1],url:appUrl.origin}]);
      const page = await context.newPage();
      await page.goto(new URL('/403', appUrl).href);
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      assert.equal(await page.locator('main').getAttribute('dir'), language==='en'?'ltr':'rtl');
      assert.ok(!(await page.locator('main').innerText()).includes('Same pupil name'));
      const home = page.locator('main a');
      assert.equal(await home.getAttribute('href'),'/parent');
      await home.focus();
      assert.equal(await home.evaluate(element=>element===document.activeElement),true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('main button').evaluate(element=>element===document.activeElement),true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await home.evaluate(element=>element===document.activeElement),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      await page.screenshot({path:`/private/tmp/sko377-denied-${language}-phone.png`,fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
      await page.screenshot({path:`/private/tmp/sko377-denied-${language}-desktop.png`,fullPage:true});
      await context.close();
    }
  } finally {
    await raw.user.update({where:{id:parent.userId},data:{preferredLanguage:'en'}});
    await browser.close();
  }
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
 await raw.guardianRelationship.updateMany({where:{schoolId:schoolA,studentId:own,guardianUserId:actors.get('PARENT')!.userId},data:{status:'REVOKED'}});
 assert.equal((await request('PARENT',pdfUrl)).status,403);
 await raw.guardianRelationship.updateMany({where:{schoolId:schoolA,studentId:own,guardianUserId:actors.get('PARENT')!.userId},data:{status:'ACTIVE'}});
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
 await assertInitialInstitutionSetup({...user,isInstitutionOwner:true,onboardingComplete:false});
 await assert.rejects(assertInitialInstitutionSetup({...user,role:'TEACHER',onboardingComplete:false}));
 await raw.school.update({where:{id:schoolA},data:{contactEmail:previous}});
});
