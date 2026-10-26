import type { CapabilityContext } from "../registry/types";
import { entriesForRole } from "../registry";
import { checkCapabilityAccess } from "../registry/gates";
import { rank } from "./retrieve";

/** Code-backed knowledge retrieval. Only reviewed registry copy is returned, and permissions are
 * checked before ranking. This is app guidance, never evidence of live records or completed work. */
export async function retrieveAppKnowledge(ctx: CapabilityContext, query: string) {
  const allowed = [];
  for (const entry of entriesForRole(ctx.user.role)) {
    if (entry.key.startsWith("assistant.")) continue;
    if ((await checkCapabilityAccess(ctx, entry)).ok) allowed.push(entry);
  }
  const ranked = rank(query, allowed);
  const broad = !query.trim() || /what can|available|help me use|my role|کیا کر|ماذا يمكنك/i.test(query);
  const minimumScore = (ranked[0]?.score ?? 0) * 0.55;
  const selected = (broad ? ranked : ranked.filter(item => item.score > 0 && item.score >= minimumScore)).slice(0, broad ? 8 : 3);
  const modes = {
    en: { A: "Runs in chat", B: "Requires your confirmation in chat", C: "Prepared in chat; final approval is on the linked screen" },
    ur: { A: "چیٹ میں چلتا ہے", B: "چیٹ میں آپ کی تصدیق درکار ہے", C: "چیٹ میں تیار ہوتا ہے؛ آخری منظوری متعلقہ صفحے پر ہے" },
    ar: { A: "ينفذ في الدردشة", B: "يتطلب تأكيدك في الدردشة", C: "يجهز في الدردشة؛ الموافقة النهائية في الصفحة المرتبطة" },
  }[ctx.locale];
  const sources = selected.map(({ entry }) => ({ key: entry.key, version: entry.version, title: entry.copy.title[ctx.locale],
    description: entry.copy.whenToUse[ctx.locale], example: entry.copy.examples[ctx.locale][0], mode: modes[entry.class],
  }));
  const intro = { en: "App guidance for your current permissions. This does not read or change school records.", ur: "آپ کی موجودہ اجازتوں کے مطابق رہنمائی۔ اس سے اسکول کا ریکارڈ پڑھا یا تبدیل نہیں ہوتا۔", ar: "إرشادات التطبيق حسب صلاحياتك الحالية. لا تقرأ سجلات المدرسة ولا تغيرها." }[ctx.locale];
  const empty = { en: "No verified guidance matches this topic for your current role. Open the workflow catalogue to see connected actions.", ur: "اس موضوع کے لیے آپ کے کردار کی تصدیق شدہ رہنمائی موجود نہیں۔ دستیاب کاموں کے لیے ورک فلو کیٹلاگ کھولیں۔", ar: "لا توجد إرشادات موثقة لهذا الموضوع ضمن دورك. افتح دليل سير العمل لرؤية الإجراءات المتاحة." }[ctx.locale];
  return { sources, text: sources.length ? `${intro}\n\n${sources.map(source => `${source.title}\n${source.description}\n${source.mode}\n“${source.example}”\nSource: ${source.key} v${source.version}`).join("\n\n")}` : empty };
}
