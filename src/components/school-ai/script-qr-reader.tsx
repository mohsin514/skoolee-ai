"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { scriptCodeFromQr } from "@/lib/school-ai/script-qr";

const copy = {
 en: { camera:"Scan script QR", image:"Read QR from a photo", stop:"Stop QR camera", hint:"Only the matching code is read on this device. A code still needs server verification; no photo is uploaded. You can also paste the printed code below.", unsupported:"This browser cannot read QR images. Use a supported browser or paste the printed matching code.", failure:"The code could not be read. Check camera permission and image clarity, or paste the printed code.", invalid:"Show one complete script QR code. Unrecognized or multiple codes cannot identify a student.", scanning:"Point the camera at one script QR code.", timeout:"No code was found within one minute. Try again or paste the code.", read:"Code read. Verifying the student and paper version…" },
 ar: { camera:"مسح رمز ورقة الإجابة", image:"قراءة الرمز من صورة", stop:"إيقاف كاميرا الرمز", hint:"تُقرأ شفرة المطابقة على هذا الجهاز فقط. يلزم التحقق منها في الخادم؛ لا تُرفع الصورة. يمكنك أيضًا لصق الشفرة المطبوعة أدناه.", unsupported:"هذا المتصفح لا يدعم قراءة صور الرموز. استخدم متصفحًا مدعومًا أو الصق شفرة المطابقة المطبوعة.", failure:"تعذرت قراءة الرمز. تحقق من إذن الكاميرا ووضوح الصورة أو الصق الشفرة المطبوعة.", invalid:"اعرض رمز ورقة إجابة كاملًا واحدًا. الرموز غير المعروفة أو المتعددة لا تحدد الطالب.", scanning:"وجّه الكاميرا إلى رمز ورقة إجابة واحد.", timeout:"لم يُعثر على رمز خلال دقيقة. أعد المحاولة أو الصق الشفرة.", read:"قُرئ الرمز. جارٍ التحقق من الطالب وإصدار الورقة…" },
 ur: { camera:"جوابی ورق کا کیو آر اسکین کریں", image:"تصویر سے کیو آر پڑھیں", stop:"کیو آر کیمرہ روکیں", hint:"ملانے کا کوڈ صرف اس آلے پر پڑھا جاتا ہے۔ سرور پر تصدیق ضروری ہے؛ تصویر اپ لوڈ نہیں ہوتی۔ آپ نیچے چھپا ہوا کوڈ بھی چسپاں کر سکتے ہیں۔", unsupported:"یہ براؤزر کیو آر تصاویر نہیں پڑھ سکتا۔ معاون براؤزر استعمال کریں یا چھپا ہوا ملانے کا کوڈ چسپاں کریں۔", failure:"کوڈ پڑھا نہیں جا سکا۔ کیمرے کی اجازت اور تصویر کی وضاحت دیکھیں یا چھپا ہوا کوڈ چسپاں کریں۔", invalid:"ایک مکمل جوابی ورق کا کیو آر دکھائیں۔ نامعلوم یا متعدد کوڈ طالب علم کی شناخت نہیں کرتے۔", scanning:"کیمرے کو ایک جوابی ورق کے کیو آر کی طرف رکھیں۔", timeout:"ایک منٹ میں کوڈ نہیں ملا۔ دوبارہ کوشش کریں یا کوڈ چسپاں کریں۔", read:"کوڈ پڑھ لیا گیا۔ طالب علم اور پرچے کے نسخے کی تصدیق ہو رہی ہے…" },
};
type Detector = { detect(image: CanvasImageSource): Promise<Array<{ rawValue:string }>> };
type DetectorConstructor = { new(options:{formats:string[]}):Detector; getSupportedFormats?:()=>Promise<string[]> };
async function detector() {
 const Constructor = (globalThis as unknown as { BarcodeDetector?:DetectorConstructor }).BarcodeDetector;
 if (!Constructor || Constructor.getSupportedFormats && !(await Constructor.getSupportedFormats()).includes("qr_code")) throw new Error("UNSUPPORTED");
 return new Constructor({ formats:["qr_code"] });
}
export function ScriptQrReader({locale,disabled,onRead}:{locale:AssessmentLocale;disabled?:boolean;onRead:(token:string)=>Promise<void>}) {
 const t=copy[locale],video=useRef<HTMLVideoElement>(null),file=useRef<HTMLInputElement>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),generation=useRef(0),mounted=useRef(true);
 const [active,setActive]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(""),[error,setError]=useState("");
 const release=()=>{generation.current++;if(timer.current)clearTimeout(timer.current);timer.current=null;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(video.current)video.current.srcObject=null;};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;release();};},[]);
 const stop=()=>{release();setActive(false);setBusy(false);setStatus("");};
 const accept=async(values:string[])=>{const code=scriptCodeFromQr(values);release();if(!mounted.current)return;setActive(false);setBusy(false);setStatus(t.read);await onRead(code);if(mounted.current)setStatus("");};
 const fail=(cause:unknown)=>{release();if(!mounted.current)return;setActive(false);setBusy(false);setStatus("");setError(cause instanceof Error&&cause.message==="UNSUPPORTED"?t.unsupported:cause instanceof Error&&cause.message==="UNRECOGNIZED_OR_AMBIGUOUS_SCRIPT_QR"?t.invalid:t.failure);};
 const start=async()=>{
  setError("");setBusy(true);const request=++generation.current;
  try {const reader=await detector();if(!mounted.current||request!==generation.current)return;
   const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"}}});
   if(!mounted.current||request!==generation.current){media.getTracks().forEach(track=>track.stop());return;}
   stream.current=media;if(!video.current)throw new Error("CAMERA_UNAVAILABLE");video.current.srcObject=media;await video.current.play();if(!mounted.current||request!==generation.current)return;
   setActive(true);setBusy(false);setStatus(t.scanning);const deadline=Date.now()+60000;
   const scan=async()=>{if(!mounted.current||request!==generation.current)return;if(Date.now()>deadline){stop();setError(t.timeout);return;}try{if(video.current&&video.current.readyState>=2){const values=await reader.detect(video.current);if(!mounted.current||request!==generation.current)return;if(values.length){setBusy(true);await accept(values.map(row=>row.rawValue));return;}}timer.current=setTimeout(()=>void scan(),250);}catch(cause){if(request===generation.current)fail(cause);}};
   await scan();
  }catch(cause){if(request===generation.current)fail(cause);}
 };
 const readFile=async(value:File|undefined)=>{if(!value)return;setError("");setBusy(true);let bitmap:ImageBitmap|undefined;const request=++generation.current;try{if(value.size>10*1024*1024||!value.size||!["image/png","image/jpeg","image/webp"].includes(value.type))throw new Error("INVALID_IMAGE");const reader=await detector();bitmap=await createImageBitmap(value);if(!mounted.current||request!==generation.current)return;if(bitmap.width*bitmap.height>20000000)throw new Error("IMAGE_TOO_LARGE");const results=await reader.detect(bitmap);if(!mounted.current||request!==generation.current)return;await accept(results.map(row=>row.rawValue));}catch(cause){if(request===generation.current)fail(cause);}finally{bitmap?.close();if(mounted.current&&request===generation.current)setBusy(false);}};
 return <div className="space-y-3 rounded-xl border border-border p-4"><p className="text-sm text-ink-subtle">{t.hint}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled||busy||active} onClick={()=>void start()}><Camera aria-hidden="true"/>{t.camera}</Button><Button type="button" variant="outline" disabled={disabled||busy||active} onClick={()=>file.current?.click()}><ImagePlus aria-hidden="true"/>{t.image}</Button>{(active||busy)&&<Button type="button" variant="ghost" onClick={stop}><Square aria-hidden="true"/>{t.stop}</Button>}</div><Input ref={file} type="file" className="hidden" tabIndex={-1} accept="image/png,image/jpeg,image/webp" aria-label={t.image} disabled={disabled||busy||active} onChange={event=>{const selected=event.target.files?.[0];event.target.value="";void readFile(selected);}}/><video ref={video} muted playsInline aria-label={t.scanning} className={active?"aspect-video w-full max-w-xl rounded-xl bg-black object-contain":"hidden"}/>{status&&<p role="status" className="text-sm">{status}</p>}{error&&<p role="alert" className="text-sm text-status-error-text">{error}</p>}</div>;
}
