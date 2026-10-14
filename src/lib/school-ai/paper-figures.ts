import { z } from "zod";
export const MAX_FIGURE_BYTES=48*1024,MAX_PAPER_FIGURE_BYTES=96*1024,MAX_PAPER_FIGURES=6;
const id=z.string().trim().min(1).max(120);
export const paperFigureSchema=z.strictObject({id,sourceId:id,sourceVersion:z.number().int().positive(),page:z.number().int().positive().max(200),regionId:id,sha256:z.string().regex(/^[a-f0-9]{64}$/),width:z.number().int().min(1).max(1024),height:z.number().int().min(1).max(1024),png:z.string().max(Math.ceil(MAX_FIGURE_BYTES/3)*4).regex(/^[A-Za-z0-9+/]+={0,2}$/),alt:z.string().max(1200),caption:z.string().max(1200),approved:z.boolean()});
export type PaperFigure=z.infer<typeof paperFigureSchema>;
export type CandidateFigure=Pick<PaperFigure,"id"|"width"|"height"|"png"|"alt"|"caption">;
export const candidateFigure=({id,width,height,png,alt,caption}:PaperFigure):CandidateFigure=>({id,width,height,png,alt,caption});
export function figureBudgetIssues(figures:PaperFigure[]){const issues:string[]=[];if(figures.length>MAX_PAPER_FIGURES)issues.push("A paper can contain at most six candidate figures.");if(new Set(figures.map(row=>row.id)).size!==figures.length)issues.push("Candidate figure identifiers must be distinct.");if(figures.reduce((sum,row)=>sum+row.png.length*3/4-(row.png.endsWith("==")?2:row.png.endsWith("=")?1:0),0)>MAX_PAPER_FIGURE_BYTES)issues.push("Candidate figures exceed the paper's 96 KB image limit.");return issues;}
/** Integer pixels stay wholly inside the reviewed region, without neighboring answer text. */
export function figureCrop(box:{x:number;y:number;width:number;height:number},width:number,height:number){
 if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.x<0||box.y<0||box.width<=0||box.height<=0||box.x+box.width>1||box.y+box.height>1)throw new Error("INVALID_FIGURE_REGION");
 const left=Math.ceil(box.x*width),top=Math.ceil(box.y*height),right=Math.floor((box.x+box.width)*width),bottom=Math.floor((box.y+box.height)*height);
 if(right-left<8||bottom-top<8)throw new Error("FIGURE_REGION_TOO_SMALL");return{left,top,width:right-left,height:bottom-top};
}
/** Text-only providers get reviewed descriptions, never raster bytes or private provenance. */
export const figureTextContext=(figures?:PaperFigure[])=>figures?.filter(figure=>figure.approved).map(({alt,caption})=>({alt,caption,imageVisuallyVerified:false as const}));
