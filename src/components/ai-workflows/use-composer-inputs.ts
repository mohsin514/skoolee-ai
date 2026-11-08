"use client";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "./run-copy";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const copy = {
  en: { attach: "Import text file", fileHint: "Import TXT, Markdown or CSV into your draft", voice: "Dictate with your browser", stop: "Stop dictation", listening: "Listening… tap the microphone to stop.", unavailable: "Voice input is unavailable in this browser. You can still type your message.", voiceError: "Could not hear you. Check microphone permission and try again.", fileError: "Choose a non-empty TXT, Markdown or CSV file, up to 32 KB.", tooLong: "This text is too long for the remaining space. Shorten your draft or file and try again.", imported: "File text added. Review it before sending.", voiceReady: "Dictation added. Review it before sending." },
  ar: { attach: "استيراد ملف نصي", fileHint: "استيراد TXT أو Markdown أو CSV إلى المسودة", voice: "الإملاء عبر المتصفح", stop: "إيقاف الإملاء", listening: "جارٍ الاستماع… اضغط الميكروفون للإيقاف.", unavailable: "الإدخال الصوتي غير متاح في هذا المتصفح. يمكنك الكتابة.", voiceError: "تعذر سماعك. تحقق من إذن الميكروفون وحاول مجددًا.", fileError: "اختر ملف TXT أو Markdown أو CSV غير فارغ حتى 32 كيلوبايت.", tooLong: "النص أطول من المساحة المتبقية. اختصر المسودة أو الملف.", imported: "أضيف نص الملف. راجعه قبل الإرسال.", voiceReady: "أضيف الإملاء. راجعه قبل الإرسال." },
  ur: { attach: "متن فائل درآمد کریں", fileHint: "TXT، Markdown یا CSV مسودے میں شامل کریں", voice: "براؤزر سے بول کر لکھیں", stop: "بول کر لکھنا روکیں", listening: "سن رہے ہیں… روکنے کے لیے مائیک دبائیں۔", unavailable: "اس براؤزر میں صوتی ان پٹ دستیاب نہیں۔ آپ لکھ سکتے ہیں۔", voiceError: "آواز نہیں سن سکے۔ مائیک کی اجازت چیک کریں اور دوبارہ کوشش کریں۔", fileError: "32 KB تک غیر خالی TXT، Markdown یا CSV فائل منتخب کریں۔", tooLong: "متن باقی جگہ سے زیادہ ہے۔ مسودہ یا فائل مختصر کریں۔", imported: "فائل کا متن شامل ہوگیا۔ بھیجنے سے پہلے دیکھ لیں۔", voiceReady: "آواز کا متن شامل ہوگیا۔ بھیجنے سے پہلے دیکھ لیں۔" },
};

/** Input methods only: never submits, stores a file, or grants workflow permissions. */
export function useComposerInputs(value: string, onChange: (text: string) => void, max: number, language: Lang, disabled: boolean) {
  const c = copy[language];
  const [feedback, setFeedback] = useState("");
  const [listening, setListening] = useState(false);
  const [reading, setReading] = useState(false);
  const latest = useRef({ value, onChange, max, disabled });
  const mounted = useRef(true);
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => { latest.current = { value, onChange, max, disabled }; }, [value, onChange, max, disabled]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; recognition.current?.abort(); };
  }, []);
  useEffect(() => { if (disabled) recognition.current?.abort(); }, [disabled]);
  const append = (text: string, message: string) => {
    if (!mounted.current || latest.current.disabled) return;
    const current = latest.current;
    const combined = `${current.value}${current.value.trim() ? "\n" : ""}${text.trim()}`;
    if (combined.length > current.max) { setFeedback(c.tooLong); return; }
    current.onChange(combined); setFeedback(message);
  };
  const importFile = async (file?: File) => {
    if (!file || disabled || reading || listening) return;
    setFeedback("");
    if (!/\.(txt|md|csv)$/i.test(file.name) || !file.size || file.size > 32768) { setFeedback(c.fileError); return; }
    setReading(true);
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (!text.trim() || text.includes("\0")) throw new Error("Invalid text");
      append(text, c.imported);
    } catch { if (mounted.current) setFeedback(c.fileError); }
    finally { if (mounted.current) setReading(false); }
  };
  const dictate = () => {
    if (listening) { recognition.current?.stop(); return; }
    if (disabled || reading) return;
    setFeedback("");
    const browser = window as SpeechWindow;
    const Speech = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Speech) { setFeedback(c.unavailable); return; }
    const session = new Speech();
    recognition.current = session;
    session.lang = { en: "en-US", ar: "ar-SA", ur: "ur-PK" }[language];
    session.continuous = false; session.interimResults = false;
    session.onresult = event => {
      const text = Array.from(event.results, result => result[0]?.transcript ?? "").join(" ");
      if (text.trim()) append(text, c.voiceReady);
    };
    session.onerror = () => { if (mounted.current) { setFeedback(c.voiceError); setListening(false); } };
    session.onend = () => { if (mounted.current) setListening(false); recognition.current = null; };
    try { session.start(); setListening(true); } catch { setFeedback(c.voiceError); }
  };
  return { c, feedback, listening, reading, importFile, dictate };
}
