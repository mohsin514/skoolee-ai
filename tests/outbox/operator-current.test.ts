import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { hashSessionToken } from "../../src/lib/auth/session-cookie";
import { appendEvent } from "../../src/lib/queue/outbox";

// Synthetic local-only integration: never load repository environment files.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
const app = new URL(process.env.AUTHZ_TEST_APP_URL || "http://localhost:3107");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres" || process.env.DIRECT_URL !== process.env.DATABASE_URL) throw new Error("Isolated PG55438 required");
if (!['localhost','127.0.0.1'].includes(app.hostname) || app.port !== '3107' || !process.env.AUTH_SECRET) throw new Error("Isolated app3107 and explicit test secret required");
const db = new PrismaClient();
const schools = [randomUUID(), randomUUID()];
const users = new Map<string, string>();
const cookies = new Map<string, string>();
const endpoint = new URL('/api/owner/workflows', app);
before(async () => {
  for (const id of schools) await db.school.create({data:{id,name:'Synthetic workflow QA',slug:id,regId:id,contactEmail:`${id}@example.invalid`,city:'Synthetic',status:'ACTIVE',plan:'PRO'}});
  for (const role of ['APP_OWNER','PRINCIPAL','CAMPUS_ADMIN','PARENT'] as const) {
    const id = randomUUID(); users.set(role,id);
    await db.user.create({data:{id,schoolId:schools[0],role,email:`${id}@example.invalid`,fullName:'Synthetic operator',mfaEnabled:true,onboardingComplete:true}});
    const token = await new SignJWT({userId:id,schoolId:schools[0],role,email:`${id}@example.invalid`,mfaVerified:true,onboardingComplete:true}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await db.loginSession.create({data:{schoolId:schools[0],userId:id,tokenHash:hashSessionToken(token),expiresAt:new Date(Date.now()+3600000)}});
    cookies.set(role,`skoolee_token=${token}`);
  }
});
after(async () => { await db.school.deleteMany({where:{id:{in:schools}}}); await db.$disconnect(); });
function headers(role='APP_OWNER') { return {cookie:cookies.get(role)!, 'content-type':'application/json',origin:app.origin}; }
function get(role='APP_OWNER', eventId?:string) { return fetch(`${endpoint}?schoolId=${schools[0]}${eventId ? `&eventId=${eventId}` : ''}`,{headers:headers(role),redirect:'manual'}); }
function post(body:unknown, extra:Record<string,string>={}) { return fetch(endpoint,{method:'POST',headers:{...headers(),...extra},body:JSON.stringify(body),redirect:'manual'}); }
async function event() { return db.$transaction(tx=>appendEvent(tx,{schoolId:schools[0],actorId:users.get('APP_OWNER')!,kind:'SYNTHETIC_OPERATOR_QA',version:1,referenceId:randomUUID(),identity:randomUUID()})); }

test('operator reconciliation requires current role and returns private no-store metadata',async()=>{
  assert.equal((await fetch(endpoint)).status,401);
  for (const role of ['PRINCIPAL','CAMPUS_ADMIN','PARENT']) assert.equal((await get(role)).status,403,role);
  const id=await event(); const response=await get('APP_OWNER',id);
  assert.equal(response.status,200); assert.match(response.headers.get('cache-control')! ,/no-store/);
  const body=await response.text(); assert.doesNotMatch(body,/example\.invalid|Synthetic operator/);
  assert.equal(JSON.parse(body).workflows[0].id,id);
});
test('operator mutation rejects cross-origin and missing/incompatible reasons without audit writes',async()=>{
  const eventId=await event(); const body={schoolId:schools[0],eventId,action:'cancel'};
  assert.equal((await post({...body,reason:'NO_LONGER_REQUIRED'},{origin:'https://untrusted.example.invalid'})).status,403);
  assert.equal((await post(body)).status,400);
  assert.equal((await post({...body,reason:'CONFIGURATION_CORRECTED'})).status,400);
  assert.equal(await db.auditLog.count({where:{schoolId:schools[0],recordId:eventId}}),0);
});
test('cancellation is school-scoped, audited with explicit reason, and terminal replay conflicts',async()=>{
  const eventId=await event(); const body={schoolId:schools[0],eventId,action:'cancel',reason:'NO_LONGER_REQUIRED'};
  assert.equal((await post({...body,schoolId:schools[1]})).status,409);
  const response=await post(body); assert.equal(response.status,200,await response.clone().text());
  assert.equal((await response.json()).reason,body.reason);
  const logs=await db.auditLog.findMany({where:{schoolId:schools[0],recordId:eventId}});
  assert.equal(logs.length,1); assert.equal((logs[0].newValue as {reason:string}).reason,body.reason);
  assert.equal((await post(body)).status,409);
  assert.equal(await db.auditLog.count({where:{schoolId:schools[0],recordId:eventId}}),1);
});
test('existing operator cookie loses authority immediately on live role change or deactivation',async()=>{
  const id=users.get('APP_OWNER')!;
  try {
    await db.user.update({where:{id},data:{role:'PRINCIPAL'}});
    assert.equal((await get()).status,401,'role-bound session is invalidated after role change');
    await db.user.update({where:{id},data:{role:'APP_OWNER',isActive:false}});
    assert.equal((await get()).status,401);
  } finally { await db.user.update({where:{id},data:{role:'APP_OWNER',isActive:true}}); }
});
test('retry preserves checkpoint and refuses uncertain external effects',async()=>{
  const eventId=await event();
  const body={schoolId:schools[0],eventId,action:'retry',reason:'TRANSIENT_FAILURE_RESOLVED'};
  assert.equal((await post(body)).status,409,'queued work cannot be retried');
  await db.workflowJob.update({where:{id:eventId},data:{state:'failed',checkpoint:3,attempts:5}});
  const effectId=randomUUID();
  await db.workflowEffect.create({data:{id:effectId,schoolId:schools[0],jobId:eventId,identity:randomUUID(),state:'uncertain'}});
  const refused=await post(body); assert.equal(refused.status,409);
  assert.equal((await refused.json()).error,'RECONCILE_EXTERNAL_OUTCOME_FIRST');
  assert.equal(await db.auditLog.count({where:{schoolId:schools[0],recordId:eventId}}),0);
  await db.workflowEffect.update({where:{id:effectId},data:{state:'committed'}});
  const response=await post(body); assert.equal(response.status,200,await response.clone().text());
  const job=await db.workflowJob.findUniqueOrThrow({where:{id:eventId}});
  assert.equal(job.state,'queued'); assert.equal(job.checkpoint,3); assert.equal(job.maxAttempts,10);
  assert.equal(await db.workflowEffect.count({where:{jobId:eventId,state:'committed'}}),1);
});
