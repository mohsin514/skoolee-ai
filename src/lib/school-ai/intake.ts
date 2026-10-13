import { z } from "zod";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
export const documentKinds = ["syllabus", "paper", "answer_script", "register", "fee_sheet", "timetable", "staff_list", "policy", "other"] as const;
export const documentKindSchema = z.enum(documentKinds);
export const languageSchema = z.enum(["en", "ar", "ur"]);

const mimeExtensions: Record<string, string[]> = {
  "application/pdf": ["pdf"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"],
  "image/webp": ["webp"], "text/plain": ["txt"], "text/csv": ["csv"],
};

/** Both MIME and signature matter. HTML/SVG/Office macros never become trusted previews. */
export function validateDocument(fileName: string, mimeType: string, bytes: Uint8Array): string {
  const mime = mimeType.split(";")[0].toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!mimeExtensions[mime]?.includes(ext)) throw new Error("Use a PDF, JPEG, PNG, WebP, text or CSV file.");
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Documents must be between 1 byte and 10 MB.");
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 16));
  const valid = mime === "application/pdf" ? head.startsWith("%PDF-")
    : mime === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mime === "image/png" ? [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)
    : mime === "image/webp" ? head.startsWith("RIFF") && head.slice(8, 12) === "WEBP"
    : !bytes.includes(0);
  if (!valid) throw new Error("The file content does not match its format.");
  return mime;
}

export function validateAudio(mimeType: string, bytes: Uint8Array): string {
  const mime = mimeType.split(";")[0].toLowerCase();
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error("Recording must be between 1 byte and 12 MB.");
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 16));
  const valid = ["audio/webm", "video/webm"].includes(mime) ? [0x1a,0x45,0xdf,0xa3].every((n,i) => bytes[i] === n)
    : ["audio/mp4", "video/mp4", "audio/x-m4a"].includes(mime) ? head.slice(4,8) === "ftyp"
    : ["audio/wav", "audio/x-wav"].includes(mime) ? head.startsWith("RIFF") && head.slice(8,12) === "WAVE"
    : mime === "audio/mpeg" ? head.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    : false;
  if (!valid) throw new Error("Use a supported WebM, MP4, MP3 or WAV recording.");
  return mime;
}

export const documentRegionSchema=z.strictObject({
  id:z.string().trim().min(1).max(100),kind:z.enum(["TEXT","HANDWRITING","TABLE","MATH","FIGURE"]),
  box:z.strictObject({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).nullable(),
  text:z.string().max(12000),confidence:z.number().min(0).max(1).nullable(),needsReview:z.boolean(),reviewed:z.boolean(),issue:z.string().max(1000),
  table:z.strictObject({rows:z.array(z.array(z.string().max(2000)).max(30)).max(100)}).optional(),
  math:z.strictObject({latex:z.string().max(6000),plainText:z.string().max(6000)}).optional(),
  figure:z.strictObject({description:z.string().max(6000),labels:z.array(z.string().max(500)).max(50)}).optional(),
}).superRefine((value,ctx)=>{if(value.box&&(value.box.x+value.box.width>1.000001||value.box.y+value.box.height>1.000001))ctx.addIssue({code:"custom",path:["box"],message:"The region must fit within its page."});if(value.table&&value.kind!=="TABLE"||value.math&&value.kind!=="MATH"||value.figure&&value.kind!=="FIGURE")ctx.addIssue({code:"custom",message:"Structured details must match the region kind."});if(value.reviewed&&value.needsReview)ctx.addIssue({code:"custom",message:"Resolve the region review flag before confirming it."});});
export const extractedPageSchema=z.strictObject({page:z.number().int().min(1).max(10000),text:z.string().max(20000),reviewed:z.boolean().optional(),regions:z.array(documentRegionSchema).max(100).optional()}).superRefine((value,ctx)=>{if(new Set(value.regions?.map(row=>row.id)).size!==(value.regions?.length??0))ctx.addIssue({code:"custom",message:"Region identifiers must be unique within a page."});});
export const documentStructureSchema=z.strictObject({expectedPageCount:z.number().int().positive().max(10000).nullable().optional(),missingPages:z.array(z.number().int().positive().max(10000)).max(200).optional(),structureReviewed:z.boolean().optional()});
export type ExtractedPage=z.infer<typeof extractedPageSchema>;
export type DocumentRegion=z.infer<typeof documentRegionSchema>;
export type DocumentStructure=z.infer<typeof documentStructureSchema>;
export const extractionSchema = z.object({
  text: z.string().max(80000),
  pages: z.array(extractedPageSchema).max(200),
  uncertainties: z.array(z.string().max(1000)).max(100),
  ...documentStructureSchema.shape,
}).strict().superRefine((value, context) => {
  if (new Set(value.pages.map(page => page.page)).size !== value.pages.length) context.addIssue({ code: "custom", message: "Duplicate source page numbers." });
  if(new Set(value.missingPages).size!==(value.missingPages?.length??0)||value.missingPages?.some(page=>value.pages.some(row=>row.page===page)))context.addIssue({code:"custom",message:"Missing pages must be distinct and absent from the extraction."});
  if(value.expectedPageCount&&[...value.pages.map(row=>row.page),...(value.missingPages??[])].some(page=>page>value.expectedPageCount!))context.addIssue({code:"custom",message:"Page numbers cannot exceed the known document length."});
});
/** A provider cannot confirm its own recognition or silently resolve visual uncertainty. */
export function unreviewedExtraction(raw:unknown){const value=extractionSchema.parse(raw);return {...value,structureReviewed:false,pages:[...value.pages].sort((a,b)=>a.page-b.page).map(page=>({...page,reviewed:false,regions:page.regions?.map(region=>({...region,reviewed:false,needsReview:true}))}))};}
export function sourceStructureApprovalIssues(value:{sourcePages?:ExtractedPage[];expectedPageCount?:number|null;missingPages?:number[];structureReviewed?:boolean;extractedText?:string}){
 const pages=value.sourcePages??[],structured=value.expectedPageCount!==undefined||value.structureReviewed!==undefined||Boolean(value.missingPages?.length)||pages.some(page=>page.reviewed!==undefined||page.regions!==undefined);
 if(!structured)return[];
 const issues:string[]=[];
 if(!value.expectedPageCount||value.expectedPageCount!==pages.length||pages.some((page,index)=>page.page!==index+1)||value.missingPages?.length)issues.push("Confirm the physical page count and transcribe every missing page in order before source approval.");
 if(pages.some(page=>!page.reviewed||page.regions?.some(region=>!region.reviewed||region.needsReview)))issues.push("Review every page and resolve every structured region before source approval.");
 if(!value.structureReviewed)issues.push("Confirm the complete structured document review before source approval.");
 if(value.extractedText!==undefined&&value.extractedText!==pages.map(page=>page.text).join("\n\n"))issues.push("Apply the corrected page text to the source before approving the structured document.");
 return issues;
}

export function parseModelJson(text: string): unknown {
  if (text.length > 250000) throw new Error("The generated response exceeds the review limit.");
  const value = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(value);
}

export function safeOriginalFileName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180) || "document";
}
