export const MAX_SCAN_PAGES = 10;
export const MAX_SCAN_BYTES = 8 * 1024 * 1024;
export const MAX_SCAN_PIXELS = 12_000_000;
export type ScanCrop = { top: number; right: number; bottom: number; left: number };
export const EMPTY_SCAN_CROP: ScanCrop = { top: 0, right: 0, bottom: 0, left: 0 };
export type ScanPoint={x:number;y:number};
export type ScanQuad=[ScanPoint,ScanPoint,ScanPoint,ScanPoint];
export function validateScanQuad(points:ScanPoint[]):asserts points is ScanQuad{
 if(points.length!==4||points.some(point=>![point.x,point.y].every(value=>Number.isFinite(value)&&value>=0&&value<=1)))throw new Error("SCAN_CORNERS");
 const crosses=points.map((a,i)=>{const b=points[(i+1)%4],c=points[(i+2)%4];return(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});
 const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%4];return sum+a.x*b.y-a.y*b.x;},0)/2;
 if(crosses.some(value=>value<=0.001)||area<0.05)throw new Error("SCAN_CORNERS");
}
export function perspectiveMap(points:ScanPoint[]){validateScanQuad(points);const[p0,p1,p2,p3]=points,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;let g=0,h=0;if(Math.abs(dx3)+Math.abs(dy3)>1e-10){const determinant=dx1*dy2-dx2*dy1;if(Math.abs(determinant)<1e-10)throw new Error("SCAN_CORNERS");g=(dx3*dy2-dx2*dy3)/determinant;h=(dx1*dy3-dx3*dy1)/determinant;}const a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x,d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y;return(u:number,v:number)=>{const divisor=g*u+h*v+1;return{x:(a*u+b*v+p0.x)/divisor,y:(d*u+e*v+p0.y)/divisor};};}
/** Heuristic local signals only, not a certificate of OCR or handwriting accuracy. */
export function scanQuality(data:Uint8ClampedArray,width:number,height:number){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<3||height<3||width*height>1024*1024||data.length!==width*height*4)throw new Error("SCAN_QUALITY_DIMENSIONS");
 const gray=new Float32Array(width*height);let sum=0,squares=0;
 for(let i=0;i<gray.length;i++){const value=data[i*4]*0.299+data[i*4+1]*0.587+data[i*4+2]*0.114;gray[i]=value;sum+=value;squares+=value*value;}
 const contrast=Math.sqrt(Math.max(0,squares/gray.length-(sum/gray.length)**2));let edges=0,edgeSquares=0,count=0;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x,laplace=gray[i-1]+gray[i+1]+gray[i-width]+gray[i+width]-4*gray[i];edges+=laplace;edgeSquares+=laplace*laplace;count++;}
 const sharpness=Math.max(0,edgeSquares/count-(edges/count)**2);return{contrast:Math.round(contrast*10)/10,sharpness:Math.round(sharpness*10)/10,lowContrast:contrast<14,blurRisk:sharpness<75};
}

export function cropRectangle(width: number, height: number, crop: ScanCrop) {
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0) || width * height > MAX_SCAN_PIXELS) throw new Error("SCAN_DIMENSIONS");
  if (!Object.values(crop).every(value => Number.isFinite(value) && value >= 0 && value <= 40)) throw new Error("SCAN_CROP");
  const x = Math.floor(width * crop.left / 100), y = Math.floor(height * crop.top / 100);
  const w = width - x - Math.floor(width * crop.right / 100), h = height - y - Math.floor(height * crop.bottom / 100);
  return { x, y, width: w, height: h };
}

/** Read dimensions before passing an untrusted image to the PDF renderer. */
export function scanImageDimensions(bytes: Uint8Array, mimeType: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0;
  if (mimeType === "image/png" && bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) {
    if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") throw new Error("SCAN_IMAGE_INVALID");
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (mimeType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 0xff) throw new Error("SCAN_IMAGE_INVALID");
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error("SCAN_IMAGE_INVALID");
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) { height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break; }
      offset += length;
    }
  }
  if (!width || !height || width > 6000 || height > 6000 || width * height > MAX_SCAN_PIXELS) throw new Error("SCAN_DIMENSIONS");
  return { width, height };
}
