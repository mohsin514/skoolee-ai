"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, Pause, Play, Square, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/locale/package";
import { advanceVoiceActivity, voiceLanguage } from "@/lib/school-ai/voice";
import { useWorkspaceDraft } from "./draft-safety";
const strings = {
 start:["Start voice conversation","بدء محادثة صوتية","صوتی گفتگو شروع کریں"], end:["End voice conversation","إنهاء المحادثة الصوتية","صوتی گفتگو ختم کریں"], pause:["Pause microphone","إيقاف الميكروفون مؤقتًا","مائیکروفون روکیں"], resume:["Resume listening","استئناف الاستماع","دوبارہ سنیں"], interrupt:["Interrupt and speak","مقاطعة والتحدث","روک کر بولیں"], ready:["Speak naturally. Your words become a private chat message after a short pause. Review every proposed school change before applying it.","تحدث بشكل طبيعي. تتحول كلماتك إلى رسالة خاصة بعد توقف قصير. راجع كل تغيير مقترح قبل تطبيقه.","آسانی سے بات کریں۔ مختصر وقفے کے بعد آپ کی بات نجی پیغام بن جائے گی۔ اسکول کی ہر مجوزہ تبدیلی کو لاگو کرنے سے پہلے دیکھیں۔"], listening:["Listening…","جارٍ الاستماع…","سن رہا ہے…"], transcribing:["Understanding your words…","جارٍ فهم كلامك…","آپ کی بات سمجھی جا رہی ہے…"], thinking:["Preparing your answer…","جارٍ إعداد الإجابة…","آپ کا جواب تیار ہو رہا ہے…"], speaking:["Speaking — you can interrupt","جارٍ التحدث — يمكنك المقاطعة","جواب سنایا جا رہا ہے — آپ روک سکتے ہیں"], paused:["Microphone paused","الميكروفون متوقف مؤقتًا","مائیکروفون رکا ہوا ہے"], failed:["Voice stopped. Your chat remains saved. Check microphone access or continue typing.","توقف الصوت. تبقى محادثتك محفوظة. تحقق من الميكروفون أو تابع بالكتابة.","آواز رک گئی۔ آپ کی گفتگو محفوظ ہے۔ مائیکروفون کی اجازت چیک کریں یا لکھ کر جاری رکھیں۔"], noVoice:["A spoken voice for this language is unavailable on this device. Read the answer in your conversation.","لا يتوفر صوت لهذه اللغة على هذا الجهاز. اقرأ الإجابة في المحادثة.","اس آلے پر اس زبان کی آواز دستیاب نہیں۔ جواب گفتگو میں پڑھیں۔"], limit:["Voice session finished. Start again to continue.","انتهت الجلسة الصوتية. ابدأ مجددًا للمتابعة.","صوتی نشست مکمل ہوئی۔ جاری رکھنے کے لیے دوبارہ شروع کریں۔"]
} as const;
type Phase="off"|"listening"|"transcribing"|"thinking"|"speaking"|"paused";
export function VoiceConversation({language,disabled,onTurn,onActivityChange}:{language:Language;disabled?:boolean;onTurn:(text:string)=>Promise<string|undefined>;onActivityChange?:(active:boolean)=>void}) {
 const index=language==="ar"?1:language==="ur"?2:0,c=Object.fromEntries(Object.entries(strings).map(([k,v])=>[k,v[index]])) as Record<keyof typeof strings,string>;
 const [phase,setPhase]=useState<Phase>("off"),[notice,setNotice]=useState(""),[transcript,setTranscript]=useState("");
 const lifecycle=useRef(0),stream=useRef<MediaStream|null>(null),context=useRef<AudioContext|null>(null),recorder=useRef<MediaRecorder|null>(null),interval=useRef<ReturnType<typeof setInterval>|null>(null),request=useRef<AbortController|null>(null),sessionStart=useRef(0),turns=useRef(0),callbacks=useRef({onTurn,onActivityChange}),activePhase=useRef<Phase>("off");
 useEffect(()=>{callbacks.current={onTurn,onActivityChange};},[onTurn,onActivityChange]);
 const transition=(next:Phase)=>{activePhase.current=next;setPhase(next);};
 const releaseCapture=()=>{if(interval.current)clearInterval(interval.current);interval.current=null;if(recorder.current?.state!=="inactive"){recorder.current?.stop();}recorder.current=null;stream.current?.getTracks().forEach(track=>{track.enabled=false;});};
 const stop=()=>{lifecycle.current++;request.current?.abort();releaseCapture();stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;void context.current?.close();context.current=null;if(typeof speechSynthesis!=="undefined")speechSynthesis.cancel();transition("off");callbacks.current.onActivityChange?.(false);};
 useEffect(()=>()=>{lifecycle.current++;request.current?.abort();if(interval.current)clearInterval(interval.current);if(recorder.current?.state!=="inactive")recorder.current?.stop();stream.current?.getTracks().forEach(track=>track.stop());void context.current?.close();if(typeof speechSynthesis!=="undefined")speechSynthesis.cancel();callbacks.current.onActivityChange?.(false);},[]);
 useEffect(()=>{const hide=()=>{if(document.hidden&&activePhase.current!=="off"){lifecycle.current++;request.current?.abort();releaseCapture();if(typeof speechSynthesis!=="undefined")speechSynthesis.cancel();transition("paused");}};document.addEventListener("visibilitychange",hide);return()=>document.removeEventListener("visibilitychange",hide);},[]);
 useWorkspaceDraft(phase!=="off");
 const listen=(token:number)=>{
  if(token!==lifecycle.current||!stream.current||!context.current)return;
  // Event-only recursive capture callback; never invoked during render.
  // eslint-disable-next-line react-hooks/purity
  if(Date.now()-sessionStart.current>300000||turns.current>=16){stop();setNotice(c.limit);return;}
  const media=stream.current;media.getTracks().forEach(track=>{track.enabled=true;});
  const audio=context.current,source=audio.createMediaStreamSource(media),analyser=audio.createAnalyser();analyser.fftSize=512;source.connect(analyser);
  const mime=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(type=>MediaRecorder.isTypeSupported(type)),capture=new MediaRecorder(media,mime?{mimeType:mime}:undefined),chunks:Blob[]=[];
  // eslint-disable-next-line react-hooks/purity -- Recorder callbacks start each turn after a browser event.
  recorder.current=capture;let activity={startedAt:Date.now(),lastSpeechAt:Date.now(),voicedMs:0},empty=true,bytes=0;
  capture.ondataavailable=event=>{if(token!==lifecycle.current)return;if(event.data.size){bytes+=event.data.size;chunks.push(event.data);if(bytes>8*1024*1024){stop();setNotice(c.failed);}}};
  capture.onerror=()=>{if(token===lifecycle.current){stop();setNotice(c.failed);}};
  capture.onstop=async()=>{
   source.disconnect();if(token!==lifecycle.current)return;
   if(interval.current)clearInterval(interval.current);interval.current=null;media.getTracks().forEach(track=>{track.enabled=false;});
   if(empty){listen(token);return;}
   try {
    transition("transcribing");const blob=new Blob(chunks,{type:capture.mimeType||"audio/webm"});if(!blob.size)throw new Error("empty");
    const form=new FormData();form.append("file",blob,capture.mimeType.includes("mp4")?"voice.m4a":"voice.webm");form.append("language",language);request.current=new AbortController();
    const response=await fetch("/api/school-ai/transcribe",{method:"POST",body:form,signal:request.current.signal}),data=await response.json();if(!response.ok||typeof data.text!=="string"||!data.text.trim())throw new Error("transcribe");if(token!==lifecycle.current)return;
    setTranscript(data.text.slice(0,4000));transition("thinking");turns.current++;const reply=await callbacks.current.onTurn(data.text.slice(0,4000));if(token!==lifecycle.current)return;if(!reply)throw new Error("chat");
    const voice=typeof speechSynthesis!=="undefined"?speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith(language)):undefined;
    if(!voice){setNotice(c.noVoice);transition("paused");return;}
    const speech=new SpeechSynthesisUtterance(reply);speech.lang=voiceLanguage[language];speech.voice=voice;speech.rate=1;transition("speaking");speech.onend=()=>{if(token===lifecycle.current)listen(token);};speech.onerror=()=>{if(token===lifecycle.current){transition("paused");setNotice(c.noVoice);}};speechSynthesis.speak(speech);
   }catch{if(token===lifecycle.current){stop();setNotice(c.failed);}}
  };
  transition("listening");capture.start(500);const values=new Float32Array(analyser.fftSize);
  interval.current=setInterval(()=>{if(token!==lifecycle.current)return;analyser.getFloatTimeDomainData(values);const rms=Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length),result=advanceVoiceActivity(activity,rms,Date.now());activity=result.next;empty=result.empty;if(result.finish&&capture.state!=="inactive")capture.stop();},100);
 };
 const start=async()=>{setNotice("");const token=++lifecycle.current;sessionStart.current=Date.now();turns.current=0;transition("paused");callbacks.current.onActivityChange?.(true);try{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"||typeof AudioContext==="undefined")throw new Error("unsupported");const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});if(token!==lifecycle.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;context.current=new AudioContext();await context.current.resume();listen(token);}catch{if(token===lifecycle.current){stop();setNotice(c.failed);}}};
 const pause=()=>{lifecycle.current++;request.current?.abort();releaseCapture();if(typeof speechSynthesis!=="undefined")speechSynthesis.cancel();transition("paused");};
 const resume=()=>{const token=++lifecycle.current;if(typeof speechSynthesis!=="undefined")speechSynthesis.cancel();void context.current?.resume();listen(token);};
 return <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4" dir={language==="en"?"ltr":"rtl"}><p className="text-sm leading-relaxed text-ink-muted">{c.ready}</p><div className="flex flex-wrap items-center gap-2">{phase==="off"?<Button variant="outline" disabled={disabled} onClick={()=>void start()}><Headphones aria-hidden="true"/>{c.start}</Button>:<><Button variant="outline" onClick={stop}><Square aria-hidden="true"/>{c.end}</Button>{phase==="paused"?<Button variant="outline" disabled={disabled} onClick={resume}><Play aria-hidden="true"/>{c.resume}</Button>:phase==="speaking"?<Button variant="outline" onClick={resume}><VolumeX aria-hidden="true"/>{c.interrupt}</Button>:phase==="listening"?<Button variant="ghost" onClick={pause}><Pause aria-hidden="true"/>{c.pause}</Button>:null}<span role="status" className="flex items-center gap-2 text-sm font-medium"><Mic aria-hidden="true" className={`size-4 ${phase==="listening"?"text-primary motion-safe:animate-pulse":"text-ink-muted"}`}/>{c[phase]}</span></>}</div>{transcript&&phase!=="off"&&<p className="whitespace-pre-wrap break-words text-sm">{transcript}</p>}{notice&&<p role="status" className="text-sm text-ink-muted">{notice}</p>}</div>;
}
