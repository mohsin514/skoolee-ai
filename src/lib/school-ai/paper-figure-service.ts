import { z } from "zod";
import sharp from "sharp";
import { createHash,randomUUID } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { assertSchoolAiAccess,assertWorkspacePermission,assertWorkspaceSubject,loadWorkspacePermissionSnapshot,type WorkspacePermissionSnapshot } from "./access";
import { schoolAiTransaction } from "./transaction";
import { getWorkspaceRecordInTransaction,assertSourceOriginalAccess } from "./repository";
import { sourceDataSchema } from "./schemas";
import { readOriginal } from "./source-storage";
import { assertOriginalAvailable } from "./document-jobs-service";
import { sourceStructureApprovalIssues } from "./intake";
import { paperFigureSchema,figureCrop,figureBudgetIssues,MAX_FIGURE_BYTES,type PaperFigure } from "./paper-figures";
import type { PaperData } from "./assessment";
const id=z.string().min(1).max(120);
const selectionSchema=z.strictObject({sourceId:id,sourceVersion:z.number().int().positive(),page:z.literal(1),regionId:id,subjectId:id,classId:id});
async function approvedRegion(user:AuthUser,selection:{sourceId:string;sourceVersion:number;page:number;regionId:string;subjectId:string;classId:string},campusId:string|null,tx:TxClient,permissions:WorkspacePermissionSnapshot,current=false){
 await assertSchoolAiAccess(user,"view",permissions);await assertWorkspacePermission(user,"exams","edit",permissions);
 const source=await getWorkspaceRecordInTransaction(user,selection.sourceId,tx,permissions);
 if(source.kind!=="SOURCE"||!source.campusId||campusId!==null&&source.campusId!==campusId||current&&(source.status!=="APPROVED"||source.version!==selection.sourceVersion))throw new ApiError("Choose the exact approved source in this campus.",409);
 await assertWorkspaceSubject(user,source.campusId,selection,tx);
 const revision=await tx.schoolAiRevision.findFirst({where:{recordId:source.id,schoolId:user.schoolId,campusId:source.campusId,version:selection.sourceVersion,status:"APPROVED"},select:{data:true}});if(!revision)throw new ApiError("The approved source version is unavailable.",409);
 await assertSourceOriginalAccess(user,source.id,tx,{version:selection.sourceVersion,permissions});
 const data=sourceDataSchema.parse(revision.data);
 if(!["syllabus","paper","other"].includes(data.documentKind)||data.subjectId!==selection.subjectId||data.classId!==selection.classId||!["image/png","image/jpeg","image/webp"].includes(data.mimeType)||selection.page!==1||!data.sha256||!data.storageKey?.startsWith(`school-ai/${user.schoolId}/`))throw new ApiError("Choose a reviewed educational image source for this subject and class. Capture a PDF figure page as a separate reviewed image first.",422);
 const region=data.sourcePages?.find(page=>page.page===selection.page)?.regions?.find(region=>region.id===selection.regionId);
 if(sourceStructureApprovalIssues(data).length||!region||region.kind!=="FIGURE"||!region.box||!region.reviewed||region.needsReview)throw new ApiError("Review the figure boundary and every source page first.",422);
 return{source,data,region};
}
async function crop(region:Awaited<ReturnType<typeof approvedRegion>>,user:AuthUser,tx:TxClient){
 await assertOriginalAvailable(user,region.source.id,tx);const bytes=await readOriginal(region.data.storageKey!);if(bytes.length>10*1024*1024||createHash("sha256").update(bytes).digest("hex")!==region.data.sha256)throw new ApiError("The original does not match its reviewed source hash.",409);
 const raster=sharp(bytes,{limitInputPixels:20000000}),metadata=await raster.metadata();if(!metadata.width||!metadata.height||!['png','jpeg','webp'].includes(metadata.format??""))throw new ApiError("The figure original is not a supported raster image.",422);
 const swapped=(metadata.orientation??0)>=5,width=swapped?metadata.height:metadata.width,height=swapped?metadata.width:metadata.height;
 let rect;try{rect=figureCrop(region.region.box!,width,height);}catch{throw new ApiError("The reviewed figure boundary is too small or invalid.",422);}
 const output=await raster.rotate().extract(rect).resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true}).png({compressionLevel:9}).toBuffer({resolveWithObject:true});if(output.data.length>MAX_FIGURE_BYTES)throw new ApiError("The cropped figure exceeds 48 KB. Review a smaller or simpler image region.",422);
 return{width:output.info.width,height:output.info.height,png:output.data.toString("base64"),sha256:createHash("sha256").update(output.data).digest("hex")};
}
export async function preparePaperFigure(user:AuthUser,raw:unknown){const input=selectionSchema.parse(raw);return schoolAiTransaction(user,async tx=>{const permissions=await loadWorkspacePermissionSnapshot(user,tx);const found=await approvedRegion(user,input,null,tx,permissions,true);const image=await crop(found,user,tx);return paperFigureSchema.parse({id:randomUUID(),sourceId:input.sourceId,sourceVersion:input.sourceVersion,page:input.page,regionId:input.regionId,...image,alt:"",caption:"",approved:false});});}
/** Byte comparison, not a client supplied hash, proves that only the approved crop is saved. */
export async function validatePaperFigures(user:AuthUser,paper:PaperData,campusId:string|null,tx:TxClient,permissions:WorkspacePermissionSnapshot){
 const figures=paper.questions.flatMap(question=>question.figures??[]),issues=figureBudgetIssues(figures);if(issues.length)throw new ApiError(issues.join(" "),422);const cache=new Map<string,Awaited<ReturnType<typeof crop>>>();
 for(const figure of figures){const selection={...figure,subjectId:paper.subjectId,classId:paper.classId},key=JSON.stringify([figure.sourceId,figure.sourceVersion,figure.page,figure.regionId]);let expected=cache.get(key);if(!expected){const region=await approvedRegion(user,selection,campusId,tx,permissions);expected=await crop(region,user,tx);cache.set(key,expected);}if(figure.png!==expected.png||figure.sha256!==expected.sha256||figure.width!==expected.width||figure.height!==expected.height)throw new ApiError("The candidate figure differs from its reviewed source crop. Select it again.",422);}
}
