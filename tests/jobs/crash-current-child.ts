import { PrismaClient } from "@prisma/client";
import { consume } from "../../src/lib/queue/outbox";
import { processingWorkflow } from "../../src/lib/jobs/processing";
import { jobsDestination } from "./local-destination.mjs";
jobsDestination();
const db=new PrismaClient();
void consume(db,JSON.parse(process.argv[2]),async ctx=>{await processingWorkflow(ctx);process.send?.("checkpoint");await new Promise(()=>setInterval(()=>{},1000));});
