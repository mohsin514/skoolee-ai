import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { assertWorkspaceDomainPermission,loadWorkspacePermissionSnapshot,SchoolAiError,type WorkspacePermissionSnapshot } from "./access";
import { getWorkspaceRecordInTransaction } from "./repository";
import type { AiWorkspaceRecord } from "./types";
import { knowledgeSchema,knowledgeTopic,knowledgeActive,knowledgeOverlaps,type Knowledge } from "./knowledge";
const knowledgeOf=(record:{kind:string;data:unknown})=>record.kind==="POLICY"&&record.data&&typeof record.data==="object"&&(record.data as Record<string,unknown>).knowledge?knowledgeSchema.safeParse((record.data as Record<string,unknown>).knowledge):null;
export async function validateKnowledgeReferences(user:AuthUser,id:string|null,campusId:string|null,data:Record<string,unknown>,db:TxClient,permissions:WorkspacePermissionSnapshot,approve=false){
 if(!data.knowledge)return;
 const knowledge=knowledgeSchema.parse(data.knowledge);
 if(knowledge.source){const source=await getWorkspaceRecordInTransaction(user,knowledge.source.recordId,db,permissions);if(source.kind!=="SOURCE"||source.status!=="APPROVED"||source.campusId!==campusId||source.version!==knowledge.source.version||typeof source.data.extractedText!=="string"||!source.data.extractedText.includes(knowledge.source.quote))throw new SchoolAiError("Choose an exact excerpt from a currently approved source in this campus.",409,"KNOWLEDGE_SOURCE_CHANGED");}
 const ancestors=new Set<string>();let reference=knowledge.supersedes;
 while(reference){
  if(reference.recordId===id||ancestors.has(reference.recordId)||ancestors.size>=50)throw new SchoolAiError("Knowledge replacement history cannot contain a loop.",409,"KNOWLEDGE_CONFLICT");
  const current=await getWorkspaceRecordInTransaction(user,reference.recordId,db,permissions);
  // The immediate replacement is freshly reviewed. Earlier links are immutable
  // approvals: editing a retired item must not break the subsequent lineage.
  const revision=ancestors.size?await db.schoolAiRevision.findFirst({where:{recordId:reference.recordId,schoolId:user.schoolId,campusId,version:reference.version,status:"APPROVED"},select:{data:true,version:true,status:true}}):null;
  const old=revision?{...current,...revision}:current,parsed=knowledgeOf(old);
  if(!parsed?.success||old.campusId!==campusId||old.version!==reference.version||old.status!=="APPROVED"||(old.data as Record<string,unknown>).scope!==data.scope||knowledgeTopic(parsed.data.topic)!==knowledgeTopic(knowledge.topic)||parsed.data.category!==knowledge.category)throw new SchoolAiError("Review the exact approved item you want to replace in the same topic and scope.",409,"KNOWLEDGE_CONFLICT");
  await assertWorkspaceDomainPermission(user,"POLICY",old.data as Record<string,unknown>,"view",permissions);
  if(parsed.data.source)await getWorkspaceRecordInTransaction(user,parsed.data.source.recordId,db,permissions);
  ancestors.add(old.id);reference=parsed.data.supersedes;
 }
 if(approve){const rows=await db.schoolAiRecord.findMany({where:{schoolId:user.schoolId,campusId,kind:"POLICY",status:"APPROVED",id:{not:id??""}},take:501,select:{id:true,kind:true,data:true}});if(rows.length>500)throw new SchoolAiError("Archive unused knowledge before adding more items in this campus.",409,"KNOWLEDGE_LIMIT");for(const row of rows){const parsed=knowledgeOf(row);if(!parsed?.success||ancestors.has(row.id)||(row.data as Record<string,unknown>).scope!==data.scope)continue;if(parsed.data.category===knowledge.category&&knowledgeTopic(parsed.data.topic)===knowledgeTopic(knowledge.topic)&&knowledgeOverlaps(parsed.data,knowledge)&&!await supersededAt(user,row.id,db,new Date(knowledge.effectiveFrom)))throw new SchoolAiError("An approved fact or preference already covers this topic and time. Explicitly replace that item or choose a non-overlapping period.",409,"KNOWLEDGE_CONFLICT");}}
}
/** Approved replacement revisions remain a retirement record even while a newer replacement draft is being edited. */
async function supersededAt(user:AuthUser,id:string,db:TxClient,at:Date){const rows=await db.schoolAiRevision.findMany({where:{schoolId:user.schoolId,status:"APPROVED",action:"APPROVE",data:{path:["knowledge","supersedes","recordId"],equals:id}},select:{data:true},take:101});if(rows.length>100)return true;return rows.some(row=>{const k=knowledgeSchema.safeParse((row.data as Record<string,unknown>).knowledge);return k.success&&new Date(k.data.effectiveFrom)<=at;});}
export async function knowledgeIsCurrent(user:AuthUser,record:AiWorkspaceRecord,db:TxClient,permissions?:WorkspacePermissionSnapshot,at=new Date()){
 const parsed=knowledgeOf(record);if(!parsed)return true;if(!parsed.success||record.status!=="APPROVED"||!knowledgeActive(parsed.data,at)||await supersededAt(user,record.id,db,at))return false;
 const knowledge=parsed.data;
 if(knowledge.source){try{const source=await getWorkspaceRecordInTransaction(user,knowledge.source.recordId,db,permissions??await loadWorkspacePermissionSnapshot(user,db));if(source.kind!=="SOURCE"||source.campusId!==record.campusId||source.version!==knowledge.source.version||source.status!=="APPROVED"||typeof source.data.extractedText!=="string"||!source.data.extractedText.includes(knowledge.source.quote))return false;}catch(error){if(error instanceof SchoolAiError&&[403,404].includes(error.status))return false;throw error;}}
 return true;
}
export function knowledgeForEditor(record:AiWorkspaceRecord):Knowledge|null{const parsed=knowledgeOf(record);return parsed?.success?parsed.data:null;}
