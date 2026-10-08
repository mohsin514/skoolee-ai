import bcrypt from 'bcryptjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redis } from '../../src/lib/queue/connection';
import { PrismaClient } from '@prisma/client';
import { hashSessionToken } from '../../src/lib/auth/session-cookie';
import { SignJWT } from 'jose';
import { acceptInvite as acceptInviteAction } from '../../src/app/actions/invite';
import { invitationContext } from '../../src/lib/auth/invitation-context';
import { resolveCurrentPrincipal, assertInitialInstitutionSetup } from '../../src/lib/auth/principal';
import { prisma } from '../../src/lib/db/prisma';
import { INVITABLE_ROLES } from '../../src/lib/membership-access';
import { ROLE_DASHBOARD_PATHS, USER_ROLES } from '../../src/lib/roles';
import { runWithTenantContext } from '../../src/lib/db/tenant-context';
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55419' || url.pathname !== '/sko219') throw new Error('Use isolated local sko219 database');
const raw = new PrismaClient();
const school = randomUUID(), foreign = randomUUID(), campus = randomUUID(), second = randomUUID(), foreignCampus = randomUUID();
const owner = randomUUID();
const accepted = new Map<string, string>();
const tokens = new Map<string, string>();
async function acceptInvite(token: string, password: string, name?: string) { const invite=await raw.staffInvitation.findUnique({where:{token}}); return acceptInviteAction(token,password,name,invite ? invitationContext(invite) : undefined); }
async function cookie(id: string) {
 await raw.user.update({where:{id},data:{mfaEnabled:true}});
 const user = await raw.user.findUniqueOrThrow({ where: { id } });
 const token = await new SignJWT({mfaVerified:true,userId:id,schoolId:user.schoolId,campusId:user.campusId,role:user.role,onboardingComplete:true,accessVersion:user.accessVersion}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
 await raw.loginSession.create({data:{schoolId:user.schoolId,userId:id,tokenHash:hashSessionToken(token),expiresAt:new Date(Date.now()+3600_000)}});
 return `skoolee_token=${token}`;
}
async function request(id:string,path:string,body?:unknown,method='POST') {
 return fetch(`http://127.0.0.1:3219${path}`, {redirect:'manual',headers:{cookie:await cookie(id),'content-type':'application/json'},...(body ? {method,body:JSON.stringify(body)} : {})});
}
before(async()=> {
 for(const id of [school,foreign]) await raw.school.create({data:{id,name:'Synthetic membership institution',slug:id,regId:id,contactEmail:`${id}@example.invalid`,city:'Synthetic',status:'ACTIVE',plan:'PRO',registrationKind:'GROUP'}});
 for(const [id,schoolId] of [[campus,school],[second,school],[foreignCampus,foreign]]) await raw.campus.create({data:{id,schoolId,name:'Synthetic campus',city:'Synthetic',regId:id}});
 await raw.user.create({data:{id:owner,schoolId:school,campusId:campus,email:`${owner}@example.invalid`,fullName:'Synthetic owner',role:'SUPER_ADMIN',onboardingComplete:true,isInstitutionOwner:true,canManageMemberships:true,canPurchaseSubscription:true}});
 for(const role of INVITABLE_ROLES) {const token=randomUUID();tokens.set(role,token);await raw.staffInvitation.create({data:{schoolId:school,campusId:campus,email:`${role}-${school}@example.invalid`,role,token,expiresAt:new Date(Date.now()+3600000),invitedBy:'Synthetic owner'}});}
});
after(async()=>{await raw.school.deleteMany({where:{id:{in:[school,foreign]}}}); await raw.$disconnect();await prisma.$disconnect();redis.disconnect();});
for(const role of INVITABLE_ROLES) test(`${role}: actual invitation acceptance, landing, no ownership or purchase`,async()=> {
 const result=await acceptInvite(tokens.get(role)!, 'Synthetic219Password', 'Synthetic Invitee'); assert.equal(result.user.role,role);
 const account=await raw.user.findFirstOrThrow({where:{schoolId:school,role}});accepted.set(role,account.id);
 assert.equal(account.onboardingComplete,true);assert.equal(account.isInstitutionOwner,false);assert.equal(account.canPurchaseSubscription,false);
 const actor=await resolveCurrentPrincipal({userId:account.id,schoolId:school,role});assert.ok(actor);
 await assert.rejects(()=>runWithTenantContext({schoolId:school},()=>assertInitialInstitutionSetup({...actor,onboardingComplete:false})));
 const status=await request(account.id,'/api/auth/session');assert.equal(status.status,200,await status.text());
 const setup=await request(account.id,'/onboarding');assert.equal(setup.status,307);assert.ok(setup.headers.get('location')?.endsWith(ROLE_DASHBOARD_PATHS[role]));
 const workspace=await request(account.id,'/subscription');
 if(workspace.status===307) assert.ok(workspace.headers.get('location')?.endsWith('/403'));
 else assert.match(await workspace.text(), /NEXT_REDIRECT;replace;\/403|url=\/403/);
 const purchase=await request(account.id,'/api/stripe/checkout',{plan:'PRO',billingPeriod:'monthly'});assert.equal(purchase.status,403,await purchase.text());
 const replay=acceptInvite(tokens.get(role)!, 'Synthetic219Password');await assert.rejects(()=>replay);
});
test('APP_OWNER cannot be invited; campus admin cannot grant membership without delegation',async()=>{
 let response=await request(owner,'/api/staff',{email:'forbidden@example.invalid',role:'APP_OWNER',campusId:campus});assert.equal(response.status,400);
 response=await request(accepted.get('CAMPUS_ADMIN')!,'/api/staff',{email:'forbidden@example.invalid',role:'TEACHER',campusId:campus});assert.equal(response.status,403);
});
test('reviewed reassignment invalidates old token and audits exact scope',async()=> {
 const id=accepted.get('TEACHER')!;const stale=await cookie(id);
 const response=await request(owner,'/api/memberships',{userId:id,role:'TEACHER',campusId:second,canPurchaseSubscription:false,canManageMemberships:false,isActive:true,expectedVersion:0,reviewed:true},'PUT');assert.equal(response.status,200,await response.text());
 const old=await fetch('http://127.0.0.1:3219/api/auth/session',{headers:{cookie:stale}});assert.equal(old.status,401);
 assert.equal((await request(id,'/api/auth/session')).status,200);
 const audit=await raw.auditLog.findFirst({where:{recordId:id,tableName:'membership',oldValue:undefined}});assert.ok(audit);
 const cross=await request(owner,'/api/memberships',{userId:id,role:'TEACHER',campusId:foreignCampus,canPurchaseSubscription:false,canManageMemberships:false,isActive:true,expectedVersion:1,reviewed:true},'PUT');assert.equal(cross.status,403);
});
test('all eleven role identifiers have explicit workspaces',()=>{assert.equal(USER_ROLES.length,11);for(const role of USER_ROLES) assert.ok(ROLE_DASHBOARD_PATHS[role]);});

test('expired and cancelled links cannot create accounts or disclose scope',async()=> {
 for (const status of ['expired','cancelled']) {
  const token=randomUUID(); await raw.staffInvitation.create({data:{schoolId:school,campusId:campus,email:`${token}@example.invalid`,role:'TEACHER',token,status:status==='expired'?'pending':'cancelled',expiresAt:new Date(status==='expired'?0:Date.now()+3600000)}});
  await assert.rejects(()=>acceptInvite(token,'Synthetic219Password'));
  const response=await fetch(`http://127.0.0.1:3219/api/invite/status?token=${token}`);const result=await response.json();assert.equal(result.status,status);assert.equal(result.institutionName,undefined);
 }
});
test('owner invitation creation uses explicit delegation; student administrative delegation is rejected',async()=> {
 const response=await request(owner,'/api/staff',{email:`new-${school}@example.invalid`,role:'ACCOUNTANT',campusId:campus,canPurchaseSubscription:true});assert.equal(response.status,201,await response.text());
 const row=await raw.staffInvitation.findFirstOrThrow({where:{email:`new-${school}@example.invalid`}});assert.equal(row.canPurchaseSubscription,true);assert.equal(row.canManageMemberships,false);
 const forbidden=await request(owner,'/api/staff',{email:`student-${school}@example.invalid`,role:'STUDENT',campusId:campus,canPurchaseSubscription:true});assert.equal(forbidden.status,400);
});
test('rank changes do not alter permissions; owner records cannot be reassigned',async()=> {
 const id=accepted.get('PRINCIPAL')!;const before=await raw.user.findUniqueOrThrow({where:{id}});
 await raw.staffProfile.update({where:{userId:id},data:{designation:'Synthetic senior appointment'}});
 const after=await raw.user.findUniqueOrThrow({where:{id}});assert.equal(after.role,before.role);assert.equal(after.accessVersion,before.accessVersion);assert.equal(after.canPurchaseSubscription,before.canPurchaseSubscription);
 const response=await request(owner,'/api/memberships',{userId:owner,role:'TEACHER',campusId:second,canPurchaseSubscription:false,canManageMemberships:false,isActive:true,expectedVersion:0,reviewed:true},'PUT');assert.equal(response.status,403);
});

test('revocation denies old and newly minted sessions and persists audit',async()=> {
 const id=accepted.get('LIBRARIAN')!;const stale=await cookie(id);
 const response=await request(owner,'/api/memberships',{userId:id,role:'LIBRARIAN',campusId:campus,canPurchaseSubscription:false,canManageMemberships:false,isActive:false,expectedVersion:0,reviewed:true},'PUT');assert.equal(response.status,200,await response.text());
 assert.equal((await fetch('http://127.0.0.1:3219/api/auth/session',{headers:{cookie:stale}})).status,401);assert.equal((await request(id,'/api/auth/session')).status,401);
 assert.equal((await raw.auditLog.findMany({where:{recordId:id,tableName:'membership'}})).length,2);
});
test('one-campus group admin has no ownership; explicit standalone owner retains setup',async()=> {
 const group=await raw.school.findUniqueOrThrow({where:{id:school}});assert.equal(group.registrationKind,'GROUP');
 const admin=await resolveCurrentPrincipal({userId:accepted.get('CAMPUS_ADMIN')!,schoolId:school,role:'CAMPUS_ADMIN'});assert.equal(admin?.isInstitutionOwner,false);
 const id=randomUUID(); const email=`standalone-${school}@example.invalid`;
 await raw.school.update({where:{id:foreign},data:{registrationKind:'STANDALONE',contactEmail:email}});
 await raw.user.create({data:{id,schoolId:foreign,campusId:foreignCampus,email,fullName:'Synthetic standalone owner',role:'ADMIN',isInstitutionOwner:true,canPurchaseSubscription:true,onboardingComplete:false}});
 const standalone=await resolveCurrentPrincipal({userId:id,schoolId:foreign,role:'ADMIN'});assert.ok(standalone?.isInstitutionOwner);
 await runWithTenantContext({schoolId:foreign},()=>assertInitialInstitutionSetup(standalone!));
});

test('concurrent invitation acceptance claims the token exactly once',async()=> {
 const token=randomUUID();const email=`race-${token}@example.invalid`;await raw.staffInvitation.create({data:{schoolId:school,campusId:campus,email,role:'TEACHER',token,expiresAt:new Date(Date.now()+3600000)}});
 const attempts=await Promise.allSettled([acceptInvite(token,'Synthetic219Password'),acceptInvite(token,'Synthetic219Password')]);assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);assert.equal(await raw.user.count({where:{schoolId:school,email}}),1);
});

test('multiple memberships require explicit password-verified institution selection',async()=> {
 const email=`multi-${school}@example.invalid`;const password='Synthetic219Password';const hashed=await bcrypt.hash(password,10);
 for(const [schoolId,campusId] of [[school,campus],[foreign,foreignCampus]]) await raw.user.create({data:{schoolId,campusId,email,password:hashed,fullName:'Synthetic multiple memberships',role:'TEACHER',onboardingComplete:true}});
 const login=(body:unknown)=>fetch('http://127.0.0.1:3219/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const response=await login({email,password});const result=await response.json();assert.equal(result.needsSchoolSelection,true);assert.equal(result.schools.length,2);assert.equal(response.headers.get('set-cookie'),null);
 const selected=await login({email,password,schoolId:foreign});assert.equal(selected.status,200);assert.equal((await selected.json()).user.schoolId,foreign);
 const invalid=await login({email,password,schoolId:randomUUID()});assert.equal(invalid.status,401);
});
test('purchasing delegation grants only explicit purchasing workspace, not tuition data',async()=> {
 const id=accepted.get('TEACHER')!;
 const change=await request(owner,'/api/memberships',{userId:id,role:'TEACHER',campusId:second,canPurchaseSubscription:true,canManageMemberships:false,isActive:true,expectedVersion:1,reviewed:true},'PUT');assert.equal(change.status,200,await change.text());
 const workspace=await request(id,'/subscription');assert.equal(workspace.status,200);
 const billing=await request(id,'/api/billing');assert.equal(billing.status,200);const result=await billing.json();assert.equal(result.billing.canPurchaseSubscription,true);assert.deepEqual(result.feeStructures,[]);
});
