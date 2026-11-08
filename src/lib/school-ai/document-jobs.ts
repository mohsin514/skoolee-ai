import { z } from "zod";
import { extractionSchema } from "./intake";
export const documentJobCreateSchema = z.strictObject({version:z.number().int().positive(),kind:z.enum(["EXTRACT","DELETE_ORIGINAL"]),scheduledAt:z.iso.datetime().optional()});
export const documentJobUpdateSchema = z.strictObject({version:z.number().int().positive(),action:z.enum(["cancel","retry","apply"]),recordVersion:z.number().int().positive().optional()});
export const extractionResultSchema=extractionSchema.safeExtend({model:z.string().min(1).max(120),tokensUsed:z.number().int().nonnegative()});
export interface DocumentJob {id:string;recordId:string;recordVersion:number;version:number;kind:"EXTRACT"|"DELETE_ORIGINAL";status:"QUEUED"|"PROCESSING"|"READY"|"APPLIED"|"COMPLETED"|"CANCELLED"|"FAILED";scheduledAt:string;attempts:number;errorCode:string|null;result:z.infer<typeof extractionResultSchema>|null;completedAt:string|null;appliedVersion:number|null}
