import { readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { calibrationFixturesSchema,calibrationFixtureHash,scoreCalibration } from "../src/lib/school-ai/calibration";

const args=process.argv.slice(2),value=(name:string)=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
async function main(){
 const fixturesPath=value("--fixtures"),resultsPath=value("--results"),reportPath=value("--report");
 if(!fixturesPath)throw new Error("Usage: node --import tsx scripts/school-ai-calibration.ts --fixtures FILE [--results FILE | --synthetic-replay] [--policy FILE] [--report FILE] [--require-gate]");
 const fixtures=calibrationFixturesSchema.parse(JSON.parse(await readFile(resolve(fixturesPath),"utf8")));
 if(!resultsPath&&!args.includes("--synthetic-replay"))throw new Error("Supply recorded provider results, or explicitly select --synthetic-replay. This CLI never sends school data to a provider.");
 const results=resultsPath?JSON.parse(await readFile(resolve(resultsPath),"utf8")):{version:1,runId:"synthetic-replay",mode:"SYNTHETIC_REPLAY",provider:"none",model:"fixture-replay",createdAt:new Date().toISOString(),fixtureSha256:calibrationFixtureHash(fixtures),results:fixtures.cases.map(row=>({caseId:row.id,requestId:null,humanReview:null,output:{text:row.expected.text,fields:row.expected.fields,answers:row.expected.answers?.map(answer=>({questionId:answer.questionId,response:answer.numericValue!==undefined?String(answer.numericValue):answer.acceptedAnswers[0]??"",marks:answer.marks})),uncertainties:row.expected.requiredUncertainties}}))};
 const policy=value("--policy"),report=scoreCalibration(fixtures,results,policy?JSON.parse(await readFile(resolve(policy),"utf8")):undefined);
 if(reportPath)await writeFile(resolve(reportPath),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
 process.stdout.write(JSON.stringify({gate:report.gate,passed:report.cases.filter(row=>row.passed).length,total:report.cases.length,liveProviderVerified:report.liveProviderVerified,blockers:report.blockers,reportPath:reportPath?resolve(reportPath):null},null,2)+"\n");
 if(args.includes("--require-gate")&&report.gate!=="READY_FOR_SCHOOL_PILOT")process.exitCode=2;
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;});
