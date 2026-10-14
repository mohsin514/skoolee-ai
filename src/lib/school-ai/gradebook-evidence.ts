import { z } from "zod";
const frozenMarks=z.object({marks:z.array(z.object({subjectId:z.string(),obtained:z.number().finite(),total:z.number().finite().positive(),isAbsent:z.boolean().optional(),isExempt:z.boolean().optional()}))});
export type LegacyMark={id:string;studentId:string;subjectId:string;marksObtained:number;isAbsent:boolean;isExempt:boolean;correctionVersion:number;enteredBy:string|null};
/** Historical percentages require a matching approved report, never today's mutable subject maximum. */
export function frozenMarkMaximum(mark:LegacyMark,snapshot:unknown):number|null{
 const parsed=frozenMarks.safeParse(snapshot);if(!parsed.success)return null;
 const rows=parsed.data.marks.filter(row=>row.subjectId===mark.subjectId);if(rows.length!==1)return null;
 const row=rows[0];return row.obtained===mark.marksObtained&&(row.isAbsent??false)===mark.isAbsent&&(row.isExempt??false)===mark.isExempt&&row.obtained>=0&&row.obtained<=row.total?row.total:null;
}
export function legacyExamMetrics(rows:Array<{state:"SCORED"|"ABSENT"|"EXEMPT";marks:number;maximum:number|null}>,roster:number,imported:number){
 const scored=rows.filter(row=>row.state==="SCORED"),comparable=scored.filter((row):row is typeof row&{maximum:number}=>row.maximum!==null);
 const maxima=new Set(comparable.map(row=>row.maximum));
 return{scored:scored.length,absent:rows.filter(row=>row.state==="ABSENT").length,exempt:rows.filter(row=>row.state==="EXEMPT").length,missing:Math.max(0,roster-rows.length-imported),imported,withFrozenMaximum:comparable.length,meanPercentage:comparable.length&&comparable.length===scored.length&&maxima.size===1?Math.round(comparable.reduce((sum,row)=>sum+row.marks/row.maximum*100,0)/comparable.length*10)/10:null};
}
