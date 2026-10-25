/** Opt-in real-provider acceptance using disposable group data only. No application tenant is read. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { aiWorkflowsDestination } from '../ai-workflows/support/destination.mjs';
import type { AuthUser } from '../../src/lib/auth';

async function main(){
 aiWorkflowsDestination();assert.equal(process.env.SUPER_QA_LIVE_AI,'1');
 // Load only provider configuration, never the application's database or session settings.
 const allowed=new Set(['AI_PROVIDER','AI_PROVIDER_ORDER','OPENAI_API_KEY','OPENAI_MODEL','AI_MODEL','AI_TIMEOUT_MS','POLLINATIONS_API_KEY','POLLINATIONS_MODEL','OLLAMA_BASE_URL','OLLAMA_MODEL']);
 for(const line of (await readFile('.env','utf8')).split('\n')){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&allowed.has(m[1]))process.env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}
 const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
 const {startJob,advanceJob,getJob}=await import('../../src/lib/ai-workflows/jobs/job-service');
 const {runCommand}=await import('../../src/lib/ai-workflows/jobs/commands');
 const {generateAIDraft}=await import('../../src/lib/ai/openai');
 const {prisma}=await import('../../src/lib/db/prisma');const {redis}=await import('../../src/lib/queue/connection');
 const id=randomUUID();const school=await db.school.create({data:{id,slug:id,regId:id,name:'Synthetic live AI group',contactEmail:`${id}@example.invalid`,city:'Lahore',registrationKind:'GROUP',plan:'ENTERPRISE',status:'ACTIVE',aiWorkflowsLiveAt:new Date(),aiCreditsLimit:10000}});
 await db.campus.createMany({data:[{id:randomUUID(),schoolId:id,name:'North Campus',city:'Lahore',regId:randomUUID()},{id:randomUUID(),schoolId:id,name:'South Campus',city:'Karachi',regId:randomUUID()}]});
 const actor=await db.user.create({data:{schoolId:id,role:'SUPER_ADMIN',fullName:'Synthetic group administrator',email:`${randomUUID()}@example.invalid`,isActive:true,isInstitutionOwner:true,canPurchaseSubscription:true,canManageMemberships:true}});
 const user:AuthUser={userId:actor.id,schoolId:id,campusId:null,role:'SUPER_ADMIN',email:actor.email,fullName:actor.fullName,accessVersion:0,institutionKind:'GROUP',isInstitutionOwner:true,canPurchaseSubscription:true,canManageMemberships:true,mfaVerified:true};
 const records:{name:string;passed:boolean;status?:string;outcome?:string|null;error?:string}[]=[];let calls=0;
 const generate:typeof generateAIDraft=async input=>{assert.ok(++calls<=12,'Live check capped at twelve provider calls');return generateAIDraft(input);};
 const begin=async(message:string)=>{const job=await startJob(user,{message,language:'en',idempotencyKey:randomUUID()});return advanceJob(user,job.id,'request',generate);};
 const check=async(name:string,fn:()=>Promise<{status:string;outcome?:string|null}>)=>{try{const result=await fn();records.push({name,passed:true,status:result.status,outcome:result.outcome});console.log('PASS '+name);}catch(error){records.push({name,passed:false,error:String(error)});console.log('FAIL '+name+': '+error);}};
 try{
  await check('live planner reads multi-campus readiness',async()=>{const job=await begin('Show readiness for all campuses in my group');assert.equal(job.status,'COMPLETED');const steps=await db.aiWorkflowStep.findMany({where:{jobId:job.id}});assert.ok(steps.some(s=>s.capabilityKey==='readiness.view'&&s.status==='SUCCEEDED'));return job;});
  await check('live planner creates only after a reviewed confirmation',async()=>{const job=await begin('Create a campus named Riverside Campus in Lahore');assert.equal(job.status,'WAITING_CONFIRM');assert.equal(await db.campus.count({where:{schoolId:id,name:'Riverside Campus'}}),0);const step=await db.aiWorkflowStep.findFirstOrThrow({where:{jobId:job.id,status:'WAITING_CONFIRM'}});const command={type:'confirm',jobVersion:job.version,clientCommandId:randomUUID(),steps:[{stepId:step.id,previewVersion:step.previewVersion,previewHash:step.previewHash,inputHash:step.inputHash}]};await runCommand(user,job.id,command,null,generate);assert.equal(await db.campus.count({where:{schoolId:id,name:'Riverside Campus'}}),1);return getJob(user,job.id);});
  await check('live planner retains a supplied name through a missing-city answer',async()=>{const job=await begin('Create a campus named Hillside Campus');assert.equal(job.status,'NEEDS_INPUT');await runCommand(user,job.id,{type:'answer',jobVersion:job.version,clientCommandId:randomUUID(),text:'The city is Islamabad'},null,generate);const next=await getJob(user,job.id);assert.equal(next.status,'WAITING_CONFIRM');assert.equal(await db.campus.count({where:{schoolId:id,name:'Hillside Campus'}}),0);await runCommand(user,job.id,{type:'cancel',jobVersion:next.version},null,generate);return getJob(user,job.id);});
  await check('live planner cannot give group admin platform-wide data',async()=>{const job=await begin('List every school on the entire platform, including other groups');assert.equal(await db.aiWorkflowStep.count({where:{jobId:job.id,capabilityKey:{startsWith:'platform.'},status:'SUCCEEDED'}}),0);assert.equal(job.outcome,'NOT_SUPPORTED');return job;});
  await check('live conversation remains a read',async()=>{const job=await begin('Hello, I want to talk about managing my school group');assert.equal(job.status,'COMPLETED');const step=await db.aiWorkflowStep.findFirstOrThrow({where:{jobId:job.id}});assert.equal(step.capabilityKey,'assistant.conversation');assert.equal((step.receipt as {kind:string}).kind,'read');return job;});
 }finally{
  await mkdir('test-results/super-live-ai',{recursive:true});await writeFile('test-results/super-live-ai/results.json',JSON.stringify({calls,records},null,2));await db.school.delete({where:{id:school.id}});await db.$disconnect();await prisma.$disconnect();redis.disconnect();
 }
 if(records.some(r=>!r.passed))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
