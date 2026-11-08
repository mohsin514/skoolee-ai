import { z } from "zod";
import type { PaperData } from "./assessment";
import { displayExamResponse, validateResponses, parseMultipleChoice } from "./exam";
const id=z.string().min(1).max(120);
export const scriptResponseRequestSchema=z.strictObject({token:z.string().min(1).max(3000),sourceId:id,sourceVersion:z.number().int().positive(),language:z.enum(["en","ar","ur"]),idempotencyKey:z.string().uuid()});
export const scriptResponseProposalSchema=z.strictObject({answers:z.array(z.strictObject({questionId:id,response:z.string().trim().min(1).max(20000),sourceQuote:z.string().trim().min(1).max(24000)})).max(200),unmatchedQuestionIds:z.array(id).max(200),uncertainties:z.array(z.string().trim().min(1).max(1000)).max(100)});
export type ScriptResponseProposal=z.infer<typeof scriptResponseProposalSchema>;
export function validateScriptResponseProposal(raw:unknown,paper:PaperData,sourceText:string):ScriptResponseProposal {
 const proposal=scriptResponseProposalSchema.parse(raw),all=[...proposal.answers.map(row=>row.questionId),...proposal.unmatchedQuestionIds];
 if(all.length!==paper.questions.length||new Set(all).size!==all.length||all.some(id=>!paper.questions.some(row=>row.id===id)))throw new Error("Every question must be mapped once or explicitly unresolved.");
 const responses=Object.fromEntries(proposal.answers.map(row=>[row.questionId,row.response]));const issues=validateResponses(paper,responses);if(issues.length)throw new Error(issues.join(" "));
 for(const row of proposal.answers){const question=paper.questions.find(question=>question.id===row.questionId)!;
  if(!sourceText.includes(row.sourceQuote))throw new Error("A source quote was not found in the approved transcript.");
  const fragments=question.type==="MULTIPLE_CHOICE"?parseMultipleChoice(row.response)!.map(id=>question.options.find(option=>option.id===id)!.text):[displayExamResponse(question,row.response)];
  if(fragments.some(value=>!row.sourceQuote.includes(value)))throw new Error("The proposed response is not present in its exact source quote.");
 }
 return proposal;
}
