import { cropRectangle, EMPTY_SCAN_CROP, MAX_SCAN_BYTES, perspectiveMap,scanQuality,type ScanPoint, type ScanCrop } from "@/lib/school-ai/scan";

function quality(canvas:HTMLCanvasElement){const probe=document.createElement("canvas"),scale=Math.min(1,512/Math.max(canvas.width,canvas.height));probe.width=Math.max(3,Math.round(canvas.width*scale));probe.height=Math.max(3,Math.round(canvas.height*scale));const ctx=probe.getContext("2d",{willReadFrequently:true});if(!ctx)throw new Error("SCAN_CANVAS_UNAVAILABLE");ctx.drawImage(canvas,0,0,probe.width,probe.height);return scanQuality(ctx.getImageData(0,0,probe.width,probe.height).data,probe.width,probe.height);}
async function preparedCanvas(canvas:HTMLCanvasElement){const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("SCAN_IMAGE_INVALID")),"image/jpeg",0.92));return{file:new File([blob],"scan-page.jpg",{type:"image/jpeg"}),width:canvas.width,height:canvas.height,quality:quality(canvas)};}

/** Normalization/cropping happens locally; only an explicit save sends the result. */
export async function prepareScanImage(file: File, crop: ScanCrop = EMPTY_SCAN_CROP, rotate = false) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > MAX_SCAN_BYTES) throw new Error("SCAN_IMAGE_INVALID");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const rect = cropRectangle(bitmap.width, bitmap.height, crop);
    const scale = Math.min(1, 2400 / Math.max(rect.width, rect.height));
    const width = Math.max(1, Math.round(rect.width * scale)), height = Math.max(1, Math.round(rect.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = rotate ? height : width; canvas.height = rotate ? width : height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("SCAN_CANVAS_UNAVAILABLE");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    if (rotate) context.rotate(Math.PI / 2);
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, -width / 2, -height / 2, width, height);
    return await preparedCanvas(canvas);
  } finally { bitmap.close(); }
}

export async function straightenScanImage(file:File,points:ScanPoint[]){
 const map=perspectiveMap(points),bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
 try{cropRectangle(bitmap.width,bitmap.height,EMPTY_SCAN_CROP);const distance=(a:ScanPoint,b:ScanPoint)=>Math.hypot((a.x-b.x)*bitmap.width,(a.y-b.y)*bitmap.height),rawWidth=Math.max(distance(points[0],points[1]),distance(points[3],points[2])),rawHeight=Math.max(distance(points[0],points[3]),distance(points[1],points[2])),scale=Math.min(1,1800/Math.max(rawWidth,rawHeight));const output=document.createElement("canvas");output.width=Math.max(3,Math.round(rawWidth*scale));output.height=Math.max(3,Math.round(rawHeight*scale));const source=document.createElement("canvas");source.width=bitmap.width;source.height=bitmap.height;const input=source.getContext("2d",{willReadFrequently:true}),ctx=output.getContext("2d");if(!input||!ctx)throw new Error("SCAN_CANVAS_UNAVAILABLE");input.drawImage(bitmap,0,0);const pixels=input.getImageData(0,0,source.width,source.height).data,target=ctx.createImageData(output.width,output.height);
 for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){const point=map(x/(output.width-1),y/(output.height-1)),sx=Math.max(0,Math.min(source.width-1,point.x*(source.width-1))),sy=Math.max(0,Math.min(source.height-1,point.y*(source.height-1))),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(source.width-1,x0+1),y1=Math.min(source.height-1,y0+1),dx=sx-x0,dy=sy-y0,index=(y*output.width+x)*4;for(let c=0;c<3;c++)target.data[index+c]=pixels[(y0*source.width+x0)*4+c]*(1-dx)*(1-dy)+pixels[(y0*source.width+x1)*4+c]*dx*(1-dy)+pixels[(y1*source.width+x0)*4+c]*(1-dx)*dy+pixels[(y1*source.width+x1)*4+c]*dx*dy;target.data[index+3]=255;}ctx.putImageData(target,0,0);return await preparedCanvas(output);
 }finally{bitmap.close();}
}
