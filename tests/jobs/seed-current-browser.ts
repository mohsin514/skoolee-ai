import { writeFileSync, chmodSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { readJob } from "../../src/lib/jobs/service";
import { startPdfJob, startImportJob } from "../../src/lib/jobs/processing";
import { consume } from "../../src/lib/queue/outbox";
import { reportDeliveryWorkflow } from "../../src/lib/queue/report-delivery";
import { createCurrentFixture } from "./current-fixture";
if (!process.env.AUTH_SECRET) throw new Error("Explicit synthetic session secret required");
process.env.DISABLE_OUTBOUND_MESSAGES="true";
const db=new PrismaClient();
async function main(){
 const f=await createCurrentFixture(db), deliveries=[];
 for(let index=0;index<100;index++) deliveries.push(await f.delivery(index,index===97?{status:"NO_RECIPIENT",workflow:false}:{}));
 const recovery=await f.track(deliveries.map(row=>row.communication));
 // UI seeds represent already persisted states; actual workflow execution is proven separately in current.database.test.ts.
 for(let index=0;index<97;index++){
  await db.parentCommunication.update({where:{id:deliveries[index].communication.id},data:{status:"SENT",sentAt:new Date(),providerMessageId:`synthetic-browser-${deliveries[index].communication.id}`}});
  await db.workflowJob.update({where:{id:deliveries[index].eventId!},data:{state:"completed",attempts:1,finishedAt:new Date()}});
 }
 await db.guardianRelationship.update({where:{id:f.pupilRows[97].relationshipId},data:{phone:null}});
 for(const index of [98,99])await db.workflowJob.update({where:{id:deliveries[index].eventId!},data:{state:"failed",attempts:5,reason:index===98?"PROVIDER_UNAVAILABLE":"AUTHORIZATION_OR_PUBLICATION_REVOKED",finishedAt:new Date()}});
 const unknownDelivery=await f.delivery(0); const unknown=await f.track([unknownDelivery.communication],"Synthetic outcome to reconcile");
 await consume(db,{schoolId:f.schoolId,eventId:unknownDelivery.eventId!},ctx=>reportDeliveryWorkflow(ctx,async()=>({success:false,error:"Synthetic uncertain provider response"})));
 const queuedDelivery=await f.delivery(1);const queued=await f.track([queuedDelivery.communication],"Synthetic queued cancellation");
 const pdf=await f.scoped(()=>startPdfJob(f.actor,{...f.exam,title:"Synthetic original PDF artifacts"}));
 const importId=await f.scoped(()=>startImportJob(f.actor,f.campusId,{csv:"transaction_date,amount,description\n2026-10-08,1500,Synthetic payment",fileName:"synthetic386.csv",accountName:"Synthetic bank import",statementFrom:"2026-10-01",statementTo:"2026-10-08",currency:"PKR",campusId:f.campusId}));
 const detail=await f.scoped(()=>readJob(f.actor,recovery));
 const fixture={schoolId:f.schoolId,campusId:f.campusId,classId:f.classId,examId:f.examId,users:f.users,cookies:f.cookies,jobs:{recovery,unknown,queued,pdf,import:importId},eligibleItemId:detail.items.find(item=>item.canRetry)!.id};
 const path="/private/tmp/sko386-browser-fixture.json";writeFileSync(path,JSON.stringify(fixture),{mode:0o600});chmodSync(path,0o600);
 console.log("Synthetic SKO-386 browser fixture created; session-bearing file is private and excluded from evidence.");
}
main().finally(async()=>{await db.$disconnect();await prisma.$disconnect();});
