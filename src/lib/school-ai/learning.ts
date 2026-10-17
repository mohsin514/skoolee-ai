import { z } from "zod";
import type { CurriculumData, PaperData } from "./assessment";
const id = z.string().trim().min(1).max(120);
export const lessonPlanSchema = z.object({
 id, title: z.string().trim().min(1).max(240), kind: z.enum(["LESSON", "REMEDIATION"]), language: z.enum(["en", "ar", "ur"]), outcomeIds: z.array(id).min(1).max(30), durationMinutes: z.number().int().min(10).max(240),
 activities: z.array(z.object({ title: z.string().trim().min(1).max(200), instructions: z.string().trim().min(1).max(4000), minutes: z.number().int().min(1).max(240) }).strict()).min(1).max(12),
 checks: z.array(z.object({ question: z.string().trim().min(1).max(2000), expectedEvidence: z.string().trim().min(1).max(2000) }).strict()).min(1).max(10),
 adaptations: z.string().max(4000), sourceRefs: z.array(z.object({ sourceId: id, page: z.string().trim().min(1).max(80), excerpt: z.string().trim().min(1).max(3000) }).strict()).min(1).max(30), confirmed: z.boolean(),
 // SKO-414: the teacher who owns and signs off the plan, whether it began as an AI draft, and the
 // class resources it uses. Groups, delivery and published tasks live in LessonPlanState so recording
 // them never reopens an approved curriculum.
 ownerId: id.optional(), origin: z.enum(["AI", "TEACHER"]).optional(), resourceIds: z.array(id).max(10).optional(),
}).strict();
export type LessonPlan = z.infer<typeof lessonPlanSchema>;

/**
 * SKO-414: fields the generic curriculum save may not forge. Ownership and AI
 * origin are kept from the saved version (a new plan is owned by its author);
 * groups, delivery and published tasks change only through the lesson-plan
 * service; and only the owner — or a school leader — can confirm a plan.
 */
export function protectLessonPlans(next: unknown, previous: unknown, actor: { userId: string; leader: boolean }) {
 if (!next || typeof next !== "object" || !Array.isArray((next as { lessonPlans?: unknown }).lessonPlans)) return next;
 const before = new Map(((previous as { lessonPlans?: LessonPlan[] } | undefined)?.lessonPlans ?? []).map(plan => [plan.id, plan]));
 const plans = ((next as { lessonPlans: Array<Record<string, unknown>> }).lessonPlans).map(raw => {
  const prior = before.get(String(raw.id));
  const plan: Record<string, unknown> = { ...raw, ownerId: prior?.ownerId ?? actor.userId, origin: prior ? prior.origin : "TEACHER" };
  if (plan.origin === undefined) delete plan.origin;
  if (plan.confirmed === true && !(prior?.confirmed) && plan.ownerId !== actor.userId && !actor.leader) throw Object.assign(new Error("Only the teacher who owns this lesson plan can confirm it."), { status: 403 });
  return plan;
 });
 return { ...(next as object), lessonPlans: plans };
}

export type PlanGroup = { id: string; label: string; studentIds: string[] };

/** Deterministic pre-publication checks for one plan; each issue says how to repair it. */
export function lessonPlanIssues(plan: LessonPlan, context: { lessonMinutes: number | null; publishedResourceIds: string[]; rosterIds: string[]; groups: PlanGroup[] }) {
 const issues: string[] = [];
 const total = plan.activities.reduce((sum, row) => sum + row.minutes, 0);
 if (total !== plan.durationMinutes) issues.push(`Activities add up to ${total} of ${plan.durationMinutes} minutes. Adjust activity minutes to match the lesson.`);
 if (context.lessonMinutes && plan.durationMinutes > context.lessonMinutes) issues.push(`The lesson is ${plan.durationMinutes} minutes but a period is ${context.lessonMinutes}. Shorten the plan or split it across lessons.`);
 const missing = (plan.resourceIds ?? []).filter(id => !context.publishedResourceIds.includes(id));
 if (missing.length) issues.push(`${missing.length} resource(s) are not published to this class's learners. Publish them or remove them from the plan.`);
 for (const group of context.groups) {
  const gone = group.studentIds.filter(id => !context.rosterIds.includes(id));
  if (gone.length) issues.push(`${group.label} includes ${gone.length} learner(s) no longer in this class. Update the group.`);
  if (!group.studentIds.length) issues.push(`${group.label} has no learners. Add learners or remove the group.`);
 }
 if (!plan.confirmed) issues.push("The owning teacher has not confirmed this plan yet.");
 return issues;
}

/** Copy content to another class: groups, dates, observations and confirmation are never copied. */
export function copyLessonPlan(plan: LessonPlan, ownerId: string, newId: string): LessonPlan {
 return { ...plan, id: newId, ownerId, confirmed: false };
}
export function validateLessonPlan(plan: LessonPlan, curriculum: CurriculumData) {
 const errors: string[]=[];
 if (new Set(plan.outcomeIds).size!==plan.outcomeIds.length || plan.outcomeIds.some(id=>!curriculum.outcomes.some(row=>row.id===id))) errors.push("A learning plan needs distinct curriculum outcomes.");
 if (plan.activities.reduce((sum,row)=>sum+row.minutes,0)!==plan.durationMinutes) errors.push("Activity minutes must equal the lesson duration.");
 for (const ref of plan.sourceRefs) { const source=curriculum.sources.find(row=>row.id===ref.sourceId&&row.approved); if(!source?.excerpt.includes(ref.excerpt)||!curriculum.outcomes.some(row=>plan.outcomeIds.includes(row.id)&&row.sourceId===ref.sourceId&&row.sourcePage===ref.page)) errors.push("Learning activities require exact source evidence from their mapped outcome pages."); }
 for (const outcomeId of plan.outcomeIds) { const outcome=curriculum.outcomes.find(row=>row.id===outcomeId); if(!outcome||!plan.sourceRefs.some(ref=>ref.sourceId===outcome.sourceId&&ref.page===outcome.sourcePage)) errors.push("Every learning-plan outcome needs its approved source evidence."); }
 return [...new Set(errors)];
}
export const semanticReviewSchema = z.object({
 findings:z.array(z.object({questionId:id,category:z.enum(["AMBIGUITY","ANSWER_KEY","SCOPE","RUBRIC","DIAGRAM","LANGUAGE"]),severity:z.enum(["WARNING","BLOCKER"]),explanation:z.string().trim().min(1).max(2500),quote:z.string().trim().min(1).max(3000)}).strict()).max(60),
 checks:z.array(z.object({questionId:id,independentAnswer:z.string().trim().min(1).max(4000),consistent:z.boolean(),reason:z.string().trim().min(1).max(2000)}).strict()).max(20),
}).strict();
export type SemanticReview=z.infer<typeof semanticReviewSchema>;
export function validateSemanticReview(review:SemanticReview,paper:PaperData,questionIds:string[]) {
 if(new Set(review.checks.map(row=>row.questionId)).size!==review.checks.length||review.checks.length!==questionIds.length||review.checks.some(row=>!questionIds.includes(row.questionId))) throw new Error("The independent review must cover each selected question once.");
 for(const finding of review.findings){const question=paper.questions.find(row=>row.id===finding.questionId&&questionIds.includes(row.id));if(!question||![question.prompt,question.modelAnswer,...question.options.map(row=>row.text),...question.rubric.map(row=>row.criterion)].some(text=>text.includes(finding.quote)))throw new Error("Review findings must quote the selected question or its marking guidance exactly.");}
 return review;
}
export type OutcomeEvidence={outcomeId:string;title:string;answered:number;possible:number;awarded:number;percentage:number|null};
export function summarizeOutcomeEvidence(curriculum:CurriculumData,rows:Array<{paper:PaperData;marks:Array<{questionId:string;marks:number}>;responses:Record<string,string>}>) {
 const totals=new Map(curriculum.outcomes.map(row=>[row.id,{outcomeId:row.id,title:row.title,answered:0,possible:0,awarded:0,percentage:null as number|null}]));
 for(const row of rows)for(const mark of row.marks){const question=row.paper.questions.find(item=>item.id===mark.questionId);if(!question||!row.responses[question.id]?.trim()||mark.marks<0||mark.marks>question.marks)continue;for(const id of question.outcomeIds){const total=totals.get(id);if(total){total.answered++;total.possible+=question.marks;total.awarded+=mark.marks;}}}
 return [...totals.values()].map(row=>({...row,percentage:row.possible?Math.round(row.awarded/row.possible*1000)/10:null}));
}

export function summarizeItemEvidence(rows:Array<{paperId:string;paperVersion:number;paper:PaperData;marks:Array<{questionId:string;marks:number}>;responses:Record<string,string>}>) {
 const items=new Map<string,{paperId:string;paperVersion:number;questionId:string;prompt:string;type:PaperData["questions"][number]["type"];answered:number;fullCredit:number;possible:number;awarded:number;choices:Record<string,number>}>();
 for(const row of rows)for(const mark of row.marks){const question=row.paper.questions.find(item=>item.id===mark.questionId),answer=question&&row.responses[question.id]?.trim();if(!question||!answer||!Number.isFinite(mark.marks)||mark.marks<0||mark.marks>question.marks)continue;const key=JSON.stringify([row.paperId,row.paperVersion,question.id]);const item=items.get(key)??{paperId:row.paperId,paperVersion:row.paperVersion,questionId:question.id,prompt:question.prompt,type:question.type,answered:0,fullCredit:0,possible:0,awarded:0,choices:Object.create(null) as Record<string,number>};item.answered++;item.possible+=question.marks;item.awarded+=mark.marks;if(mark.marks===question.marks)item.fullCredit++;
 if(question.type==="SINGLE_CHOICE"){const option=question.options.find(option=>option.id===answer);if(option)item.choices[option.id]=(item.choices[option.id]??0)+1;}else if(question.type==="MULTIPLE_CHOICE"){try{const answers:unknown=JSON.parse(answer);if(Array.isArray(answers))for(const option of question.options)if(answers.includes(option.id))item.choices[option.id]=(item.choices[option.id]??0)+1;}catch{/* Invalid response shapes are excluded by the service. */}}
 items.set(key,item);}
 return [...items.values()].map(item=>{const paper=rows.find(row=>row.paperId===item.paperId&&row.paperVersion===item.paperVersion)!.paper,question=paper.questions.find(row=>row.id===item.questionId)!;return{...item,percentage:Math.round(item.awarded/item.possible*1000)/10,fullCreditPercentage:Math.round(item.fullCredit/item.answered*1000)/10,choices:question.options.map(option=>({label:option.text,count:item.choices[option.id]??0}))};});
}
