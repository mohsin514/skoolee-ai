export type PackageCopy = {
  back: string; setup: string; title: string; intro: string; sizing: string; availablePackages: string; billingPeriod: string; campuses: string; enrollment: string;
  monthly: string; annual: string; annualDiscount: string; catalogue: string; regionalCurrency: string;
  current: string; free: string; customQuote: string; freeDescription: string; customDescription: string;
  fits: string; exceeds: string; students: string; teachers: string; branches: string; aiCredits: string;
  unlimited: string; perMonth: string; perYear: string; continueFree: string; choose: string; quote: string;
  checkoutUnavailable: string; paidUnavailable: string; pricesAndTerms: string; approvedTerms: string;
  priceDisclosure: string; statusTitle: string; loadingOrder: string; missingReference: string;
  statusConfirmed: string; statusPending: string; statusQuote: string; statusFree: string;
  statusCancelled: string; statusFailed: string; savedActive: string; savedPending: string;
  savedFailed: string; savedCancelled: string; savedSelection: string; orderReference: string;
  package: string; paymentState: string; savedAmount: string; bank: string; accountTitle: string;
  accountNumber: string; iban: string; continueCheckout: string; retryCheckout: string;
  refreshStatus: string; resumeSetup: string; paymentFailure: string;
  planNames: Record<"FREE" | "BASIC" | "PRO" | "ENTERPRISE", string>;
  stateNames: Record<string, string>;
  featureNames: Record<string, string>;
};

const en: PackageCopy = {
  back: "Back to saved setup", setup: "Skoolee · Setup", title: "Choose a package for your institution", sizing: "Institution sizing", availablePackages: "Available packages", billingPeriod: "Billing period",
  intro: "Compare the approved offers against your expected campus and student needs. Your setup draft stays saved while you decide.",
  campuses: "Expected campuses", enrollment: "Expected student enrollment", monthly: "Monthly", annual: "Annual",
  annualDiscount: "annual discount", catalogue: "Catalogue", regionalCurrency: "Regional display currency",
  current: "Current", free: "Free", customQuote: "Custom quote",
  freeDescription: "Start without a payment card. This is the free package; no time-limited trial is stated in the catalogue.",
  customDescription: "Price and capacity are set by a custom quote.", fits: "Fits the expected size",
  exceeds: "Expected size is above this package limit", students: "Students", teachers: "Teachers", branches: "Campuses",
  aiCredits: "AI credits / month", unlimited: "Unlimited", perMonth: "mo", perYear: "yr",
  continueFree: "Continue with free package", choose: "Choose this package", quote: "Request a custom quote",
  checkoutUnavailable: "Checkout unavailable", paidUnavailable: "Paid checkout is not currently available.",
  pricesAndTerms: "Prices in PKR. The regional currency does not convert the catalogue price.", approvedTerms: "Approved terms",
  priceDisclosure: "Prices are shown in PKR. Regional currency is informational and does not convert the price.",
  statusTitle: "Payment and setup status", loadingOrder: "Loading saved order…", missingReference: "Checkout reference is missing.",
  statusConfirmed: "Payment confirmed by the provider", statusPending: "Payment is being confirmed",
  statusQuote: "Custom quote requested", statusFree: "Free package selected", statusCancelled: "Checkout cancelled",
  statusFailed: "Payment failed", savedActive: "Your package is active. Resume the setup you saved.",
  savedPending: "Your school setup is saved. You can wait here or return to it while confirmation continues.",
  savedFailed: "Your setup draft is saved. You can retry the payment or choose the free package.",
  savedCancelled: "Your setup draft is saved. Choose another package or try checkout again.",
  savedSelection: "Your selection is saved with the approved commercial catalogue.", orderReference: "Order reference",
  package: "Package", paymentState: "Payment state", savedAmount: "Saved amount", bank: "Bank",
  accountTitle: "Account title", accountNumber: "Account number", iban: "IBAN", continueCheckout: "Continue checkout",
  retryCheckout: "Retry checkout", refreshStatus: "Refresh payment status", resumeSetup: "Resume saved setup",
  paymentFailure: "Payment status could not be loaded.",
  planNames: { FREE: "Basic", BASIC: "Pro", PRO: "Enterprise", ENTERPRISE: "Custom" },
  stateNames: { FREE_SELECTED: "Free package selected", CUSTOM_QUOTE: "Custom quote requested", CHECKOUT_PENDING: "Checkout started", PENDING: "Payment is pending", PENDING_SETTLEMENT: "Payment is being confirmed", SETTLED: "Payment confirmed", FAILED: "Payment failed", CANCELLED: "Checkout cancelled" },
  featureNames: {},
};

const ar: PackageCopy = {
  ...en,
  back: "العودة إلى الإعداد المحفوظ", setup: "سكوولي · الإعداد", title: "اختر الباقة المناسبة لمؤسستك",
  intro: "قارن الباقات المعتمدة مع احتياجات مؤسستك المتوقعة من حيث الفروع والطلاب. سيظل إعدادك محفوظاً أثناء الاختيار.",
  sizing: "حجم المؤسسة", availablePackages: "الباقات المتاحة", billingPeriod: "مدة الفوترة", campuses: "عدد الفروع المتوقع", enrollment: "عدد الطلاب المتوقع", monthly: "شهرياً", annual: "سنوياً",
  annualDiscount: "خصم سنوي", catalogue: "الكتالوج", regionalCurrency: "العملة الإقليمية المعروضة",
  current: "الحالية", free: "مجانية", customQuote: "عرض سعر مخصص",
  freeDescription: "ابدأ دون بطاقة دفع. هذه باقة مجانية؛ ولا يذكر الكتالوج فترة تجريبية محددة المدة.",
  customDescription: "يُحدد السعر والسعة في عرض سعر مخصص.", fits: "تناسب الحجم المتوقع",
  exceeds: "الاحتياج المتوقع يتجاوز حد هذه الباقة", students: "الطلاب", teachers: "المعلمون", branches: "الفروع",
  aiCredits: "رصيد الذكاء الاصطناعي شهرياً", unlimited: "غير محدود", perMonth: "شهرياً", perYear: "سنوياً",
  continueFree: "المتابعة بالباقة المجانية", choose: "اختيار هذه الباقة", quote: "طلب عرض سعر مخصص",
  checkoutUnavailable: "الدفع غير متاح", paidUnavailable: "الدفع للباقة المدفوعة غير متاح حالياً.",
  pricesAndTerms: "الأسعار بعملة PKR. العملة الإقليمية لا تحوّل سعر الكتالوج.", approvedTerms: "الشروط المعتمدة",
  priceDisclosure: "تُعرض الأسعار بعملة PKR. العملة الإقليمية للمعلومات فقط ولا تحوّل السعر.",
  statusTitle: "حالة الدفع والإعداد", loadingOrder: "جارٍ تحميل الطلب المحفوظ…", missingReference: "مرجع الدفع غير موجود.",
  statusConfirmed: "أكد مزود الدفع العملية", statusPending: "جارٍ تأكيد الدفع",
  statusQuote: "تم طلب عرض سعر مخصص", statusFree: "تم اختيار الباقة المجانية", statusCancelled: "تم إلغاء الدفع",
  statusFailed: "تعذر إتمام الدفع", savedActive: "أصبحت باقتك مفعّلة. تابع الإعداد الذي حفظته.",
  savedPending: "تم حفظ إعداد المدرسة. يمكنك الانتظار هنا أو العودة إليه أثناء متابعة التأكيد.",
  savedFailed: "تم حفظ مسودة الإعداد. أعد محاولة الدفع أو اختر الباقة المجانية.",
  savedCancelled: "تم حفظ مسودة الإعداد. اختر باقة أخرى أو أعد محاولة الدفع.",
  savedSelection: "تم حفظ اختيارك وفق الكتالوج التجاري المعتمد.", orderReference: "مرجع الطلب",
  package: "الباقة", paymentState: "حالة الدفع", savedAmount: "المبلغ المحفوظ", bank: "البنك",
  accountTitle: "اسم صاحب الحساب", accountNumber: "رقم الحساب", iban: "رقم الحساب المصرفي الدولي",
  continueCheckout: "متابعة الدفع", retryCheckout: "إعادة محاولة الدفع", refreshStatus: "تحديث حالة الدفع",
  resumeSetup: "متابعة الإعداد المحفوظ", paymentFailure: "تعذر تحميل حالة الدفع.",
  planNames: { FREE: "أساسية", BASIC: "احترافية", PRO: "مؤسسية", ENTERPRISE: "مخصصة" },
  stateNames: { FREE_SELECTED: "تم اختيار الباقة المجانية", CUSTOM_QUOTE: "تم طلب عرض سعر مخصص", CHECKOUT_PENDING: "بدأ الدفع", PENDING: "الدفع قيد الانتظار", PENDING_SETTLEMENT: "جارٍ تأكيد الدفع", SETTLED: "تم تأكيد الدفع", FAILED: "تعذر إتمام الدفع", CANCELLED: "تم إلغاء الدفع" },
  featureNames: {
    "Up to 50 students": "حتى ٥٠ طالباً", "2 teacher accounts": "حسابان للمعلمين", "1 campus": "فرع واحد",
    "100 AI credits/month": "١٠٠ رصيد ذكاء اصطناعي شهرياً", "Standard report cards": "تقارير دراسية قياسية", "Email support": "دعم عبر البريد الإلكتروني",
    "Up to 500 students": "حتى ٥٠٠ طالب", "10 teacher accounts": "١٠ حسابات للمعلمين", "1,000 AI credits/month": "١٬٠٠٠ رصيد ذكاء اصطناعي شهرياً",
    "Branded report cards": "تقارير دراسية بهوية المؤسسة", "WhatsApp notifications": "إشعارات واتساب", "Bulk PDF export": "تصدير ملفات PDF دفعة واحدة", "Priority support": "دعم ذو أولوية",
    "Up to 2,500 students": "حتى ٢٬٥٠٠ طالب", "50 teacher accounts": "٥٠ حساباً للمعلمين", "5 campuses": "٥ فروع",
    "5,000 AI credits/month": "٥٬٠٠٠ رصيد ذكاء اصطناعي شهرياً", "Custom branded report cards": "تقارير دراسية بهوية مخصصة",
    "WhatsApp + Email notifications": "إشعارات واتساب والبريد الإلكتروني", "Analytics dashboard": "لوحة التحليلات", "API access": "الوصول إلى واجهة API", "Dedicated support": "دعم مخصص",
    "Unlimited students": "طلاب غير محدودين", "Unlimited teacher accounts": "حسابات معلمين غير محدودة", "Unlimited campuses": "فروع غير محدودة",
    "50,000 AI credits/month": "٥٠٬٠٠٠ رصيد ذكاء اصطناعي شهرياً", "Advanced WhatsApp workflows": "سير عمل متقدم عبر واتساب",
    "Network analytics": "تحليلات الشبكة", "Custom security review": "مراجعة أمنية مخصصة", "Dedicated onboarding": "تهيئة مخصصة",
  },
};

const ur: PackageCopy = {
  ...en,
  back: "محفوظہ سیٹ اپ پر واپس جائیں", setup: "سکولی · سیٹ اپ", title: "اپنے ادارے کے لیے پیکیج منتخب کریں",
  intro: "منظور شدہ پیکیجز کا اپنے متوقع کیمپس اور طلبہ کی ضروریات سے موازنہ کریں۔ انتخاب کے دوران آپ کا سیٹ اپ محفوظ رہے گا۔",
  sizing: "ادارے کا حجم", availablePackages: "دستیاب پیکیجز", billingPeriod: "ادائیگی کی مدت", campuses: "متوقع کیمپس", enrollment: "متوقع طلبہ کی تعداد", monthly: "ماہانہ", annual: "سالانہ",
  annualDiscount: "سالانہ رعایت", catalogue: "منظور شدہ فہرست", regionalCurrency: "علاقائی دکھائی جانے والی کرنسی",
  current: "موجودہ", free: "مفت", customQuote: "حسب ضرورت قیمت",
  freeDescription: "ادائیگی کارڈ کے بغیر شروع کریں۔ یہ مفت پیکیج ہے؛ فہرست میں محدود مدت کی آزمائش درج نہیں ہے۔",
  customDescription: "قیمت اور گنجائش حسب ضرورت پیشکش میں طے ہوں گی۔", fits: "متوقع حجم کے لیے موزوں",
  exceeds: "متوقع ضرورت اس پیکیج کی حد سے زیادہ ہے", students: "طلبہ", teachers: "اساتذہ", branches: "کیمپس",
  aiCredits: "ماہانہ AI کریڈٹس", unlimited: "لامحدود", perMonth: "ماہانہ", perYear: "سالانہ",
  continueFree: "مفت پیکیج کے ساتھ جاری رکھیں", choose: "یہ پیکیج منتخب کریں", quote: "حسب ضرورت قیمت طلب کریں",
  checkoutUnavailable: "ادائیگی دستیاب نہیں", paidUnavailable: "ادائیگی والا پیکیج فی الحال دستیاب نہیں۔",
  pricesAndTerms: "قیمتیں PKR میں ہیں۔ علاقائی کرنسی فہرست کی قیمت تبدیل نہیں کرتی۔", approvedTerms: "منظور شدہ شرائط",
  priceDisclosure: "قیمتیں PKR میں دکھائی گئی ہیں۔ علاقائی کرنسی صرف معلومات کے لیے ہے اور قیمت تبدیل نہیں کرتی۔",
  statusTitle: "ادائیگی اور سیٹ اپ کی حالت", loadingOrder: "محفوظ آرڈر لوڈ ہو رہا ہے…", missingReference: "ادائیگی کا حوالہ موجود نہیں۔",
  statusConfirmed: "ادائیگی فراہم کنندہ نے تصدیق کر دی", statusPending: "ادائیگی کی تصدیق ہو رہی ہے",
  statusQuote: "حسب ضرورت قیمت کی درخواست بھیج دی گئی", statusFree: "مفت پیکیج منتخب کیا گیا", statusCancelled: "ادائیگی منسوخ کر دی گئی",
  statusFailed: "ادائیگی مکمل نہیں ہو سکی", savedActive: "آپ کا پیکیج فعال ہے۔ محفوظ کردہ سیٹ اپ جاری رکھیں۔",
  savedPending: "آپ کے اسکول کا سیٹ اپ محفوظ ہے۔ تصدیق جاری رہنے تک یہیں انتظار کریں یا سیٹ اپ پر واپس جائیں۔",
  savedFailed: "آپ کا سیٹ اپ محفوظ ہے۔ ادائیگی دوبارہ کریں یا مفت پیکیج منتخب کریں۔",
  savedCancelled: "آپ کا سیٹ اپ محفوظ ہے۔ دوسرا پیکیج منتخب کریں یا ادائیگی دوبارہ کریں۔",
  savedSelection: "آپ کا انتخاب منظور شدہ تجارتی فہرست کے مطابق محفوظ ہے۔", orderReference: "آرڈر کا حوالہ",
  package: "پیکیج", paymentState: "ادائیگی کی حالت", savedAmount: "محفوظ رقم", bank: "بینک",
  accountTitle: "اکاؤنٹ کا عنوان", accountNumber: "اکاؤنٹ نمبر", iban: "آئی بین", continueCheckout: "ادائیگی جاری رکھیں",
  retryCheckout: "ادائیگی دوبارہ کریں", refreshStatus: "ادائیگی کی حالت تازہ کریں", resumeSetup: "محفوظ سیٹ اپ جاری رکھیں",
  paymentFailure: "ادائیگی کی حالت لوڈ نہیں ہو سکی۔",
  planNames: { FREE: "بنیادی", BASIC: "پرو", PRO: "انٹرپرائز", ENTERPRISE: "حسب ضرورت" },
  stateNames: { FREE_SELECTED: "مفت پیکیج منتخب کیا گیا", CUSTOM_QUOTE: "حسب ضرورت قیمت کی درخواست بھیج دی گئی", CHECKOUT_PENDING: "ادائیگی شروع ہو گئی", PENDING: "ادائیگی زیرِ انتظار ہے", PENDING_SETTLEMENT: "ادائیگی کی تصدیق ہو رہی ہے", SETTLED: "ادائیگی کی تصدیق ہو گئی", FAILED: "ادائیگی مکمل نہیں ہو سکی", CANCELLED: "ادائیگی منسوخ کر دی گئی" },
  featureNames: {
    "Up to 50 students": "۵۰ طلبہ تک", "2 teacher accounts": "اساتذہ کے ۲ اکاؤنٹس", "1 campus": "۱ کیمپس",
    "100 AI credits/month": "ماہانہ ۱۰۰ AI کریڈٹس", "Standard report cards": "معیاری رپورٹ کارڈ", "Email support": "ای میل مدد",
    "Up to 500 students": "۵۰۰ طلبہ تک", "10 teacher accounts": "اساتذہ کے ۱۰ اکاؤنٹس", "1,000 AI credits/month": "ماہانہ ۱٬۰۰۰ AI کریڈٹس",
    "Branded report cards": "ادارے کے برانڈ والے رپورٹ کارڈ", "WhatsApp notifications": "واٹس ایپ اطلاعات", "Bulk PDF export": "متعدد PDF فائلیں برآمد کریں", "Priority support": "ترجیحی مدد",
    "Up to 2,500 students": "۲٬۵۰۰ طلبہ تک", "50 teacher accounts": "اساتذہ کے ۵۰ اکاؤنٹس", "5 campuses": "۵ کیمپس",
    "5,000 AI credits/month": "ماہانہ ۵٬۰۰۰ AI کریڈٹس", "Custom branded report cards": "حسب ضرورت برانڈ والے رپورٹ کارڈ",
    "WhatsApp + Email notifications": "واٹس ایپ اور ای میل اطلاعات", "Analytics dashboard": "تجزیاتی ڈیش بورڈ", "API access": "API تک رسائی", "Dedicated support": "مخصوص مدد",
    "Unlimited students": "لامحدود طلبہ", "Unlimited teacher accounts": "اساتذہ کے لامحدود اکاؤنٹس", "Unlimited campuses": "لامحدود کیمپس",
    "50,000 AI credits/month": "ماہانہ ۵۰٬۰۰۰ AI کریڈٹس", "Advanced WhatsApp workflows": "واٹس ایپ کے جدید ورک فلو",
    "Network analytics": "نیٹ ورک تجزیات", "Custom security review": "حسب ضرورت سکیورٹی جائزہ", "Dedicated onboarding": "مخصوص ابتدائی سیٹ اپ",
  },
};

export function getPackageCopy(language: string): PackageCopy {
  return language === "ar" ? ar : language === "ur" ? ur : en;
}
