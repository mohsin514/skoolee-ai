// SKAI-1002 trust-page chrome in EN/AR/UR. AR/UR are machine-quality drafts:
// native and legal review pending (SKAI-1086 Arabic, SKAI-1087 Urdu).
import type { Language } from "@/lib/locale/package";

export interface TrustChrome {
  product: string;
  eyebrow: string;
  chips: [string, string, string];
  continueReading: string;
  navLabel: string;
  back: string;
  languageLabel: string;
  nav: { label: string; href: string; desc: string }[];
}

const HREFS = ["/privacy", "/security", "/ai-governance", "/human-review-policy", "/terms", "/dpa", "/guardian-notice"];
const nav = (rows: [string, string][]) => rows.map(([label, desc], i) => ({ label, desc, href: HREFS[i] }));

export const TRUST_CHROME: Record<Language, TrustChrome> = {
  en: {
    product: "Product",
    eyebrow: "Skoolee Trust",
    chips: ["Encrypted at rest & in transit", "Role-scoped access", "Human-reviewed AI"],
    continueReading: "Continue reading",
    navLabel: "Trust policies",
    back: "Back to Skoolee AI",
    languageLabel: "Language",
    nav: nav([
      ["Privacy", "Who can see each school record"],
      ["Security", "How access and data are protected"],
      ["AI Governance", "How AI assists and is reviewed"],
      ["Human Review Policy", "How drafts are approved before sharing"],
      ["Terms of service", "Rules for using Skoolee AI"],
      ["Data processing agreement", "Template between a school and Skoolee"],
      ["Guardian notice", "What parents are told about their child's data"],
    ]),
  },
  ar: {
    product: "المنتج",
    eyebrow: "الثقة في Skoolee",
    chips: ["تشفير أثناء التخزين والنقل", "وصول محدد حسب الدور", "ذكاء اصطناعي يراجعه البشر"],
    continueReading: "تابع القراءة",
    navLabel: "سياسات الثقة",
    back: "العودة إلى Skoolee AI",
    languageLabel: "اللغة",
    nav: nav([
      ["الخصوصية", "من يمكنه رؤية كل سجل مدرسي"],
      ["الأمان", "كيف نحمي الوصول والبيانات"],
      ["حوكمة الذكاء الاصطناعي", "كيف يساعد الذكاء الاصطناعي وكيف تتم مراجعته"],
      ["سياسة المراجعة البشرية", "كيف تُعتمد المسودات قبل مشاركتها"],
      ["شروط الخدمة", "قواعد استخدام Skoolee AI"],
      ["اتفاقية معالجة البيانات", "نموذج بين المدرسة وSkoolee"],
      ["إشعار أولياء الأمور", "ما يُبلَّغ به الآباء عن بيانات أبنائهم"],
    ]),
  },
  ur: {
    product: "پروڈکٹ",
    eyebrow: "Skoolee پر اعتماد",
    chips: ["محفوظ شدہ اور منتقلی کے دوران خفیہ کاری", "کردار کے مطابق رسائی", "انسانی جائزے والا AI"],
    continueReading: "مزید پڑھیں",
    navLabel: "اعتماد کی پالیسیاں",
    back: "Skoolee AI پر واپس جائیں",
    languageLabel: "زبان",
    nav: nav([
      ["رازداری", "ہر اسکول ریکارڈ کون دیکھ سکتا ہے"],
      ["سیکیورٹی", "رسائی اور ڈیٹا کی حفاظت کیسے ہوتی ہے"],
      ["AI گورننس", "AI کیسے مدد کرتا ہے اور اس کا جائزہ کیسے ہوتا ہے"],
      ["انسانی جائزے کی پالیسی", "مسودے شیئر کرنے سے پہلے کیسے منظور ہوتے ہیں"],
      ["سروس کی شرائط", "Skoolee AI استعمال کرنے کے قواعد"],
      ["ڈیٹا پروسیسنگ معاہدہ", "اسکول اور Skoolee کے درمیان نمونہ"],
      ["سرپرست کے لیے نوٹس", "والدین کو ان کے بچے کے ڈیٹا کے بارے میں کیا بتایا جاتا ہے"],
    ]),
  },
};
