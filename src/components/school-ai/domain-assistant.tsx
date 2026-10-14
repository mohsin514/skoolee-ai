"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import type { AssistantFocus } from "@/lib/school-ai/assistant-focus";
import { PrivateAssistant,type PrivateAssistantProps } from "./private-assistant";
import { useWorkspaceDraftNavigation } from "./draft-safety";
const copy={en:{open:"Ask about this workflow",hint:"Use text, voice, an attachment or a camera photo while working here. Uploaded material goes to the source library for review. Select approved evidence explicitly; unsaved editor changes are not school facts.",evidence:"Approved evidence for this conversation",general:"No specific record",saved:"Saved version"},ar:{open:"اسأل عن سير العمل هذا",hint:"استخدم النص أو الصوت أو المرفق أو صورة الكاميرا أثناء العمل. تذهب المواد المرفوعة إلى مكتبة المصادر للمراجعة. اختر الأدلة المعتمدة صراحة؛ التعديلات غير المحفوظة ليست حقائق مدرسية.",evidence:"الدليل المعتمد لهذه المحادثة",general:"دون سجل محدد",saved:"الإصدار المحفوظ"},ur:{open:"اس کام کے بارے میں پوچھیں",hint:"یہاں کام کرتے ہوئے متن، آواز، فائل یا کیمرے کی تصویر استعمال کریں۔ اپ لوڈ مواد جائزے کے لیے ماخذ لائبریری میں جاتا ہے۔ منظور شدہ ثبوت خود منتخب کریں؛ غیر محفوظ تبدیلیاں اسکول کے حقائق نہیں۔",evidence:"اس گفتگو کا منظور شدہ ثبوت",general:"کوئی مخصوص ریکارڈ نہیں",saved:"محفوظ نسخہ"}};
export function DomainAssistant({domain,title,records,...props}:PrivateAssistantProps&{domain:AssistantFocus["domain"];title:string;records:AiWorkspaceRecord[]}){
 const t=copy[props.language],guard=useWorkspaceDraftNavigation(),[open,setOpen]=useState(false),[selected,setSelected]=useState(""),[active,setActive]=useState(false);
 const approved=records.filter(row=>row.status==="APPROVED"&&(["ONBOARDING","CURRICULUM","POLICY"].includes(row.kind)||row.kind==="SOURCE"&&["syllabus","paper","policy"].includes(String(row.data.documentKind))));
 const record=approved.find(row=>row.id===selected),focus:AssistantFocus={domain,...(record?{recordId:record.id,recordVersion:record.version}:{})};
 return <section className="sk-panel mt-5 space-y-4 p-5"><Button type="button" variant="outline" disabled={active} aria-expanded={open} onClick={()=>open?guard(()=>setOpen(false)):setOpen(true)}><MessageCircle aria-hidden="true"/>{t.open} · {title}</Button>{open&&<><p className="max-w-3xl text-sm text-ink-subtle">{t.hint}</p><FormField name={`assistant-evidence-${domain}`} label={t.evidence}><Select disabled={active||props.disabled} value={selected} onChange={event=>guard(()=>setSelected(event.target.value))}><option value="">{t.general}</option>{approved.map(row=><option key={row.id} value={row.id}>{row.title} · {t.saved} {row.version}</option>)}</Select></FormField><PrivateAssistant {...props} focus={focus} topicKey={`domain:${domain}:${record?.id??"general"}:v${record?.version??0}`} onActivityChange={setActive}/></>}</section>;
}
