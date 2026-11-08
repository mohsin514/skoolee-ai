// SKAI-1002 copy for /security, /ai-governance and /human-review-policy.
// English is the source text moved verbatim from the pages. AR/UR are
// machine-quality drafts pending native/legal review (SKAI-1086, SKAI-1087).
import type { Language } from "@/lib/locale/package";
import type { TrustPackDoc } from "../trust-pack";

export type TrustInfoId = "security" | "ai-governance" | "human-review-policy";

export type TrustInfoDoc = TrustPackDoc & { metaTitle: string; metaDescription: string };
const s = (title: string, body: string) => ({ title, body });

export const TRUST_INFO: Record<Language, Record<TrustInfoId, TrustInfoDoc>> = {
  en: {
    security: {
      metaTitle: "Security | SkooleeAI",
      metaDescription: "SkooleeAI security overview for authentication, tenant scoping, billing controls, and operational safeguards.",
      title: "Security",
      description: "SkooleeAI combines role-based access, school and campus scoping, subscription gates, and provider isolation for a safer school management workflow.",
      sections: [
        s("Authentication", "Authenticated sessions carry user, role, school, campus, onboarding, and school status context so protected routes can make access decisions."),
        s("Tenant scoping", "API routes check that classes, students, invoices, staff, exams, reports, and communications belong to the authenticated school and campus."),
        s("Billing safeguards", "Suspended subscriptions block operational access while preserving the billing route so administrators can restore payment or plan status."),
        s("Provider boundaries", "Stripe, WhatsApp, email, storage, and AI providers are configured through server-side environment variables rather than browser-exposed secrets."),
      ],
    },
    "ai-governance": {
      metaTitle: "AI Governance | SkooleeAI",
      metaDescription: "SkooleeAI's approach to AI drafts, credits, review queues, approvals, and school-controlled use.",
      title: "AI Governance",
      description: "AI in SkooleeAI is designed to assist educators, not replace professional judgment. Drafts are logged, limited, and routed through review before sensitive use.",
      sections: [
        s("Draft-first AI", "AI-generated remarks, insights, and interventions are treated as drafts. The product stores review status and approval fields before final sharing."),
        s("Credit limits", "Each plan includes monthly AI credits. The application checks and consumes credits in code before generating AI content."),
        s("Prompt governance", "AI usage logs include feature names, actions, prompt versions, models, token counts, approval status, and metadata for auditing."),
        s("Human accountability", "Principals and school leaders remain responsible for approving report card remarks, analytics, interventions, and parent-facing communication."),
      ],
    },
    "human-review-policy": {
      metaTitle: "Human Review Policy | SkooleeAI",
      metaDescription: "How SkooleeAI keeps educators in charge of AI drafts, report card remarks, analytics, and parent communication.",
      title: "Human Review Policy",
      description: "SkooleeAI is built around the principle that school leaders review and approve sensitive outputs before they affect students or parents.",
      sections: [
        s("Report cards", "AI remarks must be reviewed and approved before report cards are marked reviewed, published, exported, or sent."),
        s("Parent communication", "Sensitive notification templates can require approved school data before messages are sent through WhatsApp or email."),
        s("Analytics", "AI insights and intervention suggestions are presented as decision-support drafts for educators, not automated judgments."),
        s("Audit trail", "Review queues, approval status, created-by fields, timestamps, and communication logs help schools trace how outputs moved from draft to action."),
      ],
    },
  },
  ar: {
    security: {
      metaTitle: "الأمان | SkooleeAI",
      metaDescription: "نظرة عامة على أمان SkooleeAI: المصادقة، وعزل بيانات كل مدرسة، وضوابط الفوترة، وضمانات التشغيل.",
      title: "الأمان",
      description: "يجمع SkooleeAI بين الوصول حسب الدور، وتحديد النطاق حسب المدرسة والحرم، وبوابات الاشتراك، وعزل مزودي الخدمة لسير عمل أكثر أمانًا في إدارة المدرسة.",
      sections: [
        s("المصادقة", "تحمل الجلسات الموثقة سياق المستخدم والدور والمدرسة والحرم وحالة الإعداد وحالة المدرسة، حتى تتمكن المسارات المحمية من اتخاذ قرارات الوصول."),
        s("عزل بيانات المدرسة", "تتحقق واجهات البرمجة من أن الفصول والطلاب والفواتير والموظفين والامتحانات والتقارير والمراسلات تنتمي إلى المدرسة والحرم الموثقين."),
        s("ضمانات الفوترة", "تمنع الاشتراكات الموقوفة الوصول التشغيلي مع إبقاء صفحة الفوترة متاحة حتى يتمكن المسؤولون من استعادة الدفع أو حالة الخطة."),
        s("حدود مزودي الخدمة", "يتم إعداد Stripe وWhatsApp والبريد الإلكتروني والتخزين ومزودي الذكاء الاصطناعي عبر متغيرات بيئة على الخادم، وليس عبر أسرار مكشوفة في المتصفح."),
      ],
    },
    "ai-governance": {
      metaTitle: "حوكمة الذكاء الاصطناعي | SkooleeAI",
      metaDescription: "نهج SkooleeAI في مسودات الذكاء الاصطناعي والأرصدة وقوائم المراجعة والاعتمادات والاستخدام الذي تتحكم فيه المدرسة.",
      title: "حوكمة الذكاء الاصطناعي",
      description: "صُمم الذكاء الاصطناعي في SkooleeAI لمساعدة المعلمين لا ليحل محل حكمهم المهني. تُسجَّل المسودات وتُقيَّد وتمر بالمراجعة قبل أي استخدام حساس.",
      sections: [
        s("المسودة أولًا", "تُعامل الملاحظات والرؤى والتدخلات التي يولدها الذكاء الاصطناعي كمسودات. يحفظ النظام حالة المراجعة وحقول الاعتماد قبل المشاركة النهائية."),
        s("حدود الأرصدة", "تتضمن كل خطة أرصدة شهرية للذكاء الاصطناعي. يتحقق التطبيق من الأرصدة ويخصمها في الشيفرة قبل توليد أي محتوى."),
        s("حوكمة التوجيهات", "تتضمن سجلات استخدام الذكاء الاصطناعي أسماء الميزات والإجراءات وإصدارات التوجيهات والنماذج وعدد الرموز وحالة الاعتماد وبيانات وصفية للتدقيق."),
        s("المساءلة البشرية", "يبقى المديرون وقادة المدرسة مسؤولين عن اعتماد ملاحظات بطاقات التقارير والتحليلات والتدخلات والمراسلات الموجهة لأولياء الأمور."),
      ],
    },
    "human-review-policy": {
      metaTitle: "سياسة المراجعة البشرية | SkooleeAI",
      metaDescription: "كيف يبقي SkooleeAI المعلمين مسؤولين عن مسودات الذكاء الاصطناعي وملاحظات بطاقات التقارير والتحليلات والتواصل مع أولياء الأمور.",
      title: "سياسة المراجعة البشرية",
      description: "بُني SkooleeAI على مبدأ أن يراجع قادة المدرسة المخرجات الحساسة ويعتمدوها قبل أن تؤثر على الطلاب أو أولياء الأمور.",
      sections: [
        s("بطاقات التقارير", "يجب مراجعة ملاحظات الذكاء الاصطناعي واعتمادها قبل وسم بطاقات التقارير بأنها مُراجَعة أو نشرها أو تصديرها أو إرسالها."),
        s("التواصل مع أولياء الأمور", "يمكن أن تشترط قوالب الإشعارات الحساسة وجود بيانات مدرسية معتمدة قبل إرسال الرسائل عبر WhatsApp أو البريد الإلكتروني."),
        s("التحليلات", "تُعرض رؤى الذكاء الاصطناعي واقتراحات التدخل كمسودات لدعم قرار المعلمين، وليست أحكامًا آلية."),
        s("سجل التدقيق", "تساعد قوائم المراجعة وحالة الاعتماد وحقول المُنشئ والطوابع الزمنية وسجلات المراسلات المدارس على تتبع انتقال المخرجات من مسودة إلى إجراء."),
      ],
    },
  },
  ur: {
    security: {
      metaTitle: "سیکیورٹی | SkooleeAI",
      metaDescription: "SkooleeAI کی سیکیورٹی کا جائزہ: تصدیق، ہر اسکول کے ڈیٹا کی علیحدگی، بلنگ کنٹرول اور آپریشنل حفاظتی اقدامات۔",
      title: "سیکیورٹی",
      description: "SkooleeAI کردار پر مبنی رسائی، اسکول اور کیمپس کی حد بندی، سبسکرپشن گیٹس اور سروس فراہم کنندگان کی علیحدگی کو یکجا کر کے اسکول کے انتظام کو زیادہ محفوظ بناتا ہے۔",
      sections: [
        s("تصدیق", "تصدیق شدہ سیشن صارف، کردار، اسکول، کیمپس، آن بورڈنگ اور اسکول کی حیثیت کا سیاق رکھتے ہیں تاکہ محفوظ صفحات رسائی کا فیصلہ کر سکیں۔"),
        s("اسکول کے ڈیٹا کی علیحدگی", "API راستے جانچتے ہیں کہ کلاسیں، طلبہ، انوائسز، عملہ، امتحانات، رپورٹس اور پیغامات تصدیق شدہ اسکول اور کیمپس ہی کے ہیں۔"),
        s("بلنگ کے حفاظتی اقدامات", "معطل سبسکرپشن آپریشنل رسائی روک دیتی ہے مگر بلنگ کا صفحہ کھلا رہتا ہے تاکہ منتظمین ادائیگی یا پلان بحال کر سکیں۔"),
        s("فراہم کنندگان کی حدود", "Stripe، WhatsApp، ای میل، اسٹوریج اور AI فراہم کنندگان سرور کی ماحولیاتی متغیرات سے ترتیب دیے جاتے ہیں، براؤزر میں ظاہر ہونے والے رازوں سے نہیں۔"),
      ],
    },
    "ai-governance": {
      metaTitle: "AI گورننس | SkooleeAI",
      metaDescription: "AI مسودوں، کریڈٹس، جائزے کی قطاروں، منظوریوں اور اسکول کے کنٹرول میں استعمال کے بارے میں SkooleeAI کا طریقہ۔",
      title: "AI گورننس",
      description: "SkooleeAI میں AI اساتذہ کی مدد کے لیے ہے، ان کے پیشہ ورانہ فیصلے کی جگہ لینے کے لیے نہیں۔ مسودے محفوظ، محدود اور حساس استعمال سے پہلے جائزے سے گزرتے ہیں۔",
      sections: [
        s("پہلے مسودہ", "AI سے بنے تبصرے، بصیرتیں اور تجاویز مسودہ سمجھی جاتی ہیں۔ حتمی اشتراک سے پہلے نظام جائزے کی حیثیت اور منظوری محفوظ کرتا ہے۔"),
        s("کریڈٹ کی حد", "ہر پلان میں ماہانہ AI کریڈٹس شامل ہیں۔ ایپ AI مواد بنانے سے پہلے کوڈ میں کریڈٹس جانچتی اور منہا کرتی ہے۔"),
        s("پرامپٹ گورننس", "AI استعمال کے لاگز میں فیچر کے نام، اقدامات، پرامپٹ ورژن، ماڈلز، ٹوکن کی تعداد، منظوری کی حیثیت اور آڈٹ کے لیے میٹا ڈیٹا شامل ہوتا ہے۔"),
        s("انسانی جواب دہی", "پرنسپل اور اسکول کی قیادت رپورٹ کارڈ کے تبصروں، تجزیات، تجاویز اور والدین سے رابطے کی منظوری کے ذمہ دار رہتے ہیں۔"),
      ],
    },
    "human-review-policy": {
      metaTitle: "انسانی جائزے کی پالیسی | SkooleeAI",
      metaDescription: "SkooleeAI کیسے AI مسودوں، رپورٹ کارڈ تبصروں، تجزیات اور والدین سے رابطے پر اساتذہ کا اختیار برقرار رکھتا ہے۔",
      title: "انسانی جائزے کی پالیسی",
      description: "SkooleeAI اس اصول پر بنا ہے کہ اسکول کی قیادت حساس نتائج کا جائزہ لے کر انہیں منظور کرے، اس سے پہلے کہ وہ طلبہ یا والدین پر اثر ڈالیں۔",
      sections: [
        s("رپورٹ کارڈ", "رپورٹ کارڈ کو جائزہ شدہ، شائع، ایکسپورٹ یا ارسال کرنے سے پہلے AI تبصروں کا جائزہ اور منظوری لازمی ہے۔"),
        s("والدین سے رابطہ", "حساس اطلاعاتی سانچے WhatsApp یا ای میل سے پیغام بھیجنے سے پہلے منظور شدہ اسکول ڈیٹا کا تقاضا کر سکتے ہیں۔"),
        s("تجزیات", "AI بصیرتیں اور تجاویز اساتذہ کے فیصلے میں مدد کے مسودے کے طور پر دکھائی جاتی ہیں، خودکار فیصلوں کے طور پر نہیں۔"),
        s("آڈٹ ٹریل", "جائزے کی قطاریں، منظوری کی حیثیت، بنانے والے کے خانے، اوقات اور پیغامات کے لاگز اسکولوں کو دکھاتے ہیں کہ نتیجہ مسودے سے عمل تک کیسے پہنچا۔"),
      ],
    },
  },
};
