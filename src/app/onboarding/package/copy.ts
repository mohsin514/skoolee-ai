import { countLabel } from "@/lib/locale/count-label";

export type PackageCopy = {
  back: string; setup: string; title: string; intro: string; sizing: string; availablePackages: string; billingPeriod: string; campuses: string; enrollment: string;
  monthly: string; annual: string; annualDiscount: string; catalogue: string; regionalCurrency: string;
  current: string; free: string; customQuote: string; freeDescription: string; customDescription: string;
  fits: string; exceeds: string; students: string; teachers: string; branches: string; aiCredits: string;
  unlimited: string; perMonth: string; perYear: string; continueFree: string; choose: string; quote: string;
  checkoutUnavailable: string; checkoutNotConfigured: string; statusReserved: string; savedReserved: string; sizingTitle: string; folio: string; paidUnavailable: string; regionalQuote: string; pricesAndTerms: string; approvedTerms: string;
  priceDisclosure: string; statusTitle: string; loadingOrder: string; missingReference: string;
  statusConfirmed: string; statusPending: string; statusQuote: string; statusFree: string;
  statusCancelled: string; statusFailed: string; savedActive: string; savedPending: string;
  savedFailed: string; savedCancelled: string; savedSelection: string; orderReference: string;
  package: string; paymentState: string; savedAmount: string; bank: string; accountTitle: string;
  accountNumber: string; iban: string; continueCheckout: string; retryCheckout: string;
  refreshStatus: string; resumeSetup: string; paymentFailure: string; chooseAnother: string;
  planNames: Record<"FREE" | "BASIC" | "PRO" | "ENTERPRISE", string>;
  stateNames: Record<string, string>;
  featureNames: Record<string, string>;
  /** The package chooser modal (src/components/onboarding/PackageChooser.tsx). {0}/{1} are filled with fill(). */
  chooser: ChooserCopy;
};

type Plural = (n: number) => string;
type FourPlans = Record<"FREE" | "BASIC" | "PRO" | "ENTERPRISE", string>;
type ReceiptKinds = "active" | "reserved" | "custom" | "bank" | "pending" | "deferred";
export type ChooserCopy = {
  eyebrow: string; title: string; subtitle: string; sizeLabel: string; studentsLabel: string; studentsPlaceholder: string; perStudentHint: string;
  fewerCampuses: string; moreCampuses: string; fewerStudents: string; moreStudents: string; packagesLabel: string; save: string;
  recommended: string; ribbonBeyond: string; reason: string; reasonCampuses: string; tagline: FourPlans;
  customPrice: string; unitMonth: string; billedMonthly: string; billedYearly: string; noCard: string; customNote: string; wasSr: string; saveYearly: string;
  meterOf: string; upTo: string; fitsYou: string; fitsCampuses: string; fitShort: string; tooSmall: string; studentsOver: string; campusDrafts: Plural;
  includes: string; plusHeading: string; tagReserved: string; tagRequested: string; tagCheckout: string; tagRoom: string;
  choose: string; keep: string; viewReservation: string; viewRequest: string; campusCount: Plural; studentCount: Plural;
  next: { free: string; current: string; online: string; bank: string; test: string; reserve: string; custom: string; pendingReserved: string; pendingCustom: string; pendingCheckout: string; downgrade: string; pendingDeferred: string };
  nextDrafts: Plural;
  verdict: { loading: string; beyond: string; campusesOnly: string; tight: string; tightAlt: string; current: string; roomy: string; fit: string; whyNotCampuses: string; whyNotStudents: string; price: string; announce: string };
  selected: string; continueWith: string; reserveNow: string;
  payEyebrow: string; payTitle: string; payBody: string; payNow: string; payLater: string; payNowTest: string;
  notNow: string; modeTestTitle: string; modeTest: string; modeReserve: string;
  handoffTitle: string; handoffTestTitle: string; handoffBody: string; handoffTestBody: string; handoffFallback: string;
  failTitle: string; failBody: string; saveFirstFailed: string; viewStatus: string;
  eyebrows: Record<ReceiptKinds, string>; titles: Record<ReceiptKinds, string>; bodies: Record<ReceiptKinds, string>; tags: Record<ReceiptKinds, string>;
  stepsLabel: string; steps: Record<ReceiptKinds, string[]>; stepState: { done: string; current: string; pending: string };
  ledgerBilling: string; ledgerSize: string; sizeValue: string; studentsNotSet: string; meanwhile: string;
  changeChoice: string; continueSetup: string; copyValue: string; copied: string; contactAt: string; pending: string;
  loadFailed: string; retry: string; loading: string;
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
  checkoutUnavailable: "Checkout unavailable", statusReserved: "Package reserved", savedReserved: "Nothing has been charged. Our team will contact you to confirm the price and payment; your setup stays saved and you can keep going.", checkoutNotConfigured: "Online checkout is not switched on yet. Request a quote and our team will confirm the price and payment with you; your setup stays saved.", sizingTitle: "Your expected size", folio: "Setup · Package", paidUnavailable: "Paid checkout is not currently available.", regionalQuote: "Online payment is not available for your region yet. Request a quote and our team will confirm the price, currency and payment method with you.",
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
  paymentFailure: "Payment status could not be loaded.", chooseAnother: "Choose another package",
  planNames: { FREE: "Basic", BASIC: "Pro", PRO: "Enterprise", ENTERPRISE: "Custom" },
  stateNames: { FREE_SELECTED: "Free package selected", CUSTOM_QUOTE: "Custom quote requested", CHECKOUT_PENDING: "Checkout started", PENDING: "Payment is pending", PENDING_SETTLEMENT: "Payment is being confirmed", SETTLED: "Payment confirmed", FAILED: "Payment failed", CANCELLED: "Checkout cancelled" },
  featureNames: {},
  chooser: {
    eyebrow: "Setup · Package", title: "Pick the package that fits", subtitle: "Prices in PKR. Your setup stays saved while you decide.",
    sizeLabel: "Your expected size", studentsLabel: "Expected students", studentsPlaceholder: "e.g. 350", perStudentHint: "Students across all campuses",
    fewerCampuses: "Fewer campuses", moreCampuses: "More campuses", fewerStudents: "Fewer students", moreStudents: "More students", packagesLabel: "Packages", save: "Save {0}%",
    recommended: "Recommended for you", ribbonBeyond: "Best for your size", reason: "Fits your {0} and {1}", reasonCampuses: "Fits your {0}",
    tagline: { FREE: "For a single campus getting started", BASIC: "For a growing single campus", PRO: "For schools with several campuses", ENTERPRISE: "For school networks and groups" },
    customPrice: "Tailored", unitMonth: "/mo", billedMonthly: "Billed monthly", billedYearly: "{0} billed yearly", noCard: "No card needed", customNote: "Terms set with our team",
    wasSr: "Was {0} per month", saveYearly: "Save {0} a year",
    meterOf: "{0} of {1}", upTo: "Up to {0}", fitsYou: "Fits your size", fitsCampuses: "Fits your campuses", fitShort: "Fits", tooSmall: "Too small",
    studentsOver: "{0} over the limit", campusDrafts: (n) => `${countLabel("en", n, "campus")} ${n === 1 ? "stays a draft" : "stay drafts"}`,
    includes: "Includes", plusHeading: "Everything in {0}, plus", tagReserved: "Reserved", tagRequested: "Requested", tagCheckout: "Checkout started", tagRoom: "Room to grow",
    choose: "Choose {0}", keep: "Keep {0}", viewReservation: "View reservation", viewRequest: "View request",
    campusCount: (n) => countLabel("en", n, "campus"), studentCount: (n) => countLabel("en", n, "student"),
    next: {
      free: "Starts now. No card needed.", current: "This is your package today.", online: "Pay securely online, then you're back in setup.",
      bank: "Pay by bank transfer. Details come next.", test: "Opens a test checkout. No money moves.",
      reserve: "Reserved now. Our team confirms payment. Nothing is charged here.", custom: "Reserved now. Our team agrees terms with you. Nothing is charged here.",
      pendingReserved: "Reserved. Our team will confirm payment with you.", pendingCustom: "Requested. Our team will agree terms with you.", pendingCheckout: "Checkout started. Continue where you left off.",
      downgrade: "Your {0} package stays active. Moving to a smaller package happens from Billing after setup.", pendingDeferred: "Payment due. Pay now to activate it.",
    },
    nextDrafts: (n) => `${countLabel("en", n, "campus")} ${n === 1 ? "stays saved as a draft" : "stay saved as drafts"} until you upgrade.`,
    verdict: {
      loading: "Finding the package that fits…", beyond: "Your size is beyond our listed packages. {0} is shaped with you.",
      campusesOnly: "{0} fits {1}. Add your students for a sharper match.", tight: "{0} fits {1} and {2}, close to its limit of {3}.", tightAlt: "{0} gives you room to grow.",
      current: "Your current package, {0}, already fits {1} and {2}.", roomy: "{0} fits {1} and {2}, with room for {3} more.", fit: "{0} fits {1} and {2}.",
      whyNotCampuses: "Why not {0}? It covers {1}.", whyNotStudents: "Why not {0}? It covers up to {1}.", price: "{0} · {1}", announce: "Recommended: {0}. {1}",
    },
    selected: "Selected", continueWith: "Continue with {0}", reserveNow: "Reserve {0}, our team confirms payment", payEyebrow: "Payment", payTitle: "Pay for {0}", payBody: "Pay now and {0} is active straight away. Or skip for now: your choice is saved, setup carries on, and {0} activates as soon as you pay.", payNow: "Pay now", payLater: "Skip for now, pay later", payNowTest: "Pay now (test checkout)",
    notNow: "Not now", modeTestTitle: "Test checkout (development only)",
    modeTest: "No payment keys are set on this server, so paid packages open a test payment page. No money moves.",
    modeReserve: "Online payment isn't available for your school yet. Choosing a paid package reserves it, and our team confirms the price and payment with you. Nothing is charged here.",
    handoffTitle: "Opening secure checkout", handoffTestTitle: "Opening test checkout",
    handoffBody: "Taking you to pay for {0}. Your setup is saved and you'll come back here.", handoffTestBody: "Taking you to the test checkout for {0}. No money moves.",
    handoffFallback: "Not moving? Continue to checkout",
    failTitle: "We couldn't save your choice", failBody: "Check your connection and try again. Nothing was charged.",
    saveFirstFailed: "Your setup couldn't be saved, so checkout didn't open. Try again.", viewStatus: "View order status",
    eyebrows: { active: "Package selected", reserved: "Package reserved", custom: "Package reserved", bank: "Awaiting transfer", pending: "Payment in progress", deferred: "Payment due" },
    titles: { active: "You're on {0}", reserved: "{0} is reserved for you", custom: "Custom package requested", bank: "Transfer to activate {0}", pending: "Payment for {0} is being confirmed", deferred: "{0} chosen · pay when you're ready" },
    bodies: {
      active: "{0} is active. Carry on with your setup.",
      reserved: "Nothing has been charged. Our team will contact you to confirm the price and payment. Your setup stays saved, so keep going.",
      custom: "Our team will contact you to agree capacity and price. Keep setting up in the meantime.",
      bank: "Use these details and the reference so we can match your payment. {0} activates once it's confirmed. Nothing has been charged yet.",
      pending: "Your setup is saved. The order status page shows progress.",
      deferred: "Nothing has been charged. Pay any time from the Package step; {0} activates as soon as it's paid. Until then setup uses your current limits.",
    },
    tags: { active: "Selected just now", reserved: "Reserved just now", custom: "Requested just now", bank: "Transfer details ready", pending: "Checkout started", deferred: "Pay any time" },
    stepsLabel: "What happens next",
    steps: {
      active: ["{0} chosen", "Continue setup"], reserved: ["Reserved", "Our team confirms payment", "{0} activates"],
      custom: ["Requested", "Our team agrees terms", "{0} activates"], bank: ["Details shown", "You transfer, we confirm", "{0} activates"],
      pending: ["Checkout started", "Payment confirmed", "{0} activates"],
      deferred: ["{0} chosen", "Pay when you're ready", "{0} activates"],
    },
    stepState: { done: "Done", current: "Next", pending: "Later" },
    ledgerBilling: "Billing", ledgerSize: "Sized for", sizeValue: "{0} · {1}", studentsNotSet: "students not set",
    meanwhile: "Keep setting up while we confirm. Campuses beyond {0} stay saved as drafts until {1} activates.",
    changeChoice: "Choose a different package", continueSetup: "Continue setup", copyValue: "Copy {0}", copied: "Copied",
    contactAt: "We'll write to {0}.", pending: "{0} reserved · awaiting confirmation",
    loadFailed: "Packages could not be loaded", retry: "Try again", loading: "Loading packages",
  },
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
  checkoutUnavailable: "الدفع غير متاح", statusReserved: "تم حجز الباقة", savedReserved: "لم يتم خصم أي مبلغ. سيتواصل معك فريقنا لتأكيد السعر والدفع، ويبقى إعدادك محفوظاً ويمكنك المتابعة.", checkoutNotConfigured: "الدفع الإلكتروني غير مفعّل بعد. اطلب عرض سعر وسيؤكد فريقنا السعر وطريقة الدفع معك، ويبقى إعدادك محفوظاً.", sizingTitle: "الحجم المتوقع", folio: "الإعداد · الباقة", paidUnavailable: "الدفع للباقة المدفوعة غير متاح حالياً.", regionalQuote: "الدفع الإلكتروني غير متاح لمنطقتك بعد. اطلب عرض سعر وسيؤكد فريقنا السعر والعملة وطريقة الدفع معك.",
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
  resumeSetup: "متابعة الإعداد المحفوظ", paymentFailure: "تعذر تحميل حالة الدفع.", chooseAnother: "اختر باقة أخرى",
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
  chooser: {
    eyebrow: "الإعداد · الباقة", title: "اختر الباقة المناسبة", subtitle: "الأسعار بالروبية الباكستانية. يبقى إعدادك محفوظاً أثناء اختيارك.",
    sizeLabel: "الحجم المتوقع", studentsLabel: "عدد الطلاب المتوقع", studentsPlaceholder: "مثال: 350", perStudentHint: "الطلاب في جميع الفروع",
    fewerCampuses: "فروع أقل", moreCampuses: "فروع أكثر", fewerStudents: "طلاب أقل", moreStudents: "طلاب أكثر", packagesLabel: "الباقات", save: "وفّر {0}%",
    recommended: "موصى بها لك", ribbonBeyond: "الأنسب لحجمك", reason: "تناسب {0} و{1}", reasonCampuses: "تناسب {0}",
    tagline: { FREE: "لفرع واحد في بدايته", BASIC: "لفرع واحد في نمو", PRO: "للمدارس متعددة الفروع", ENTERPRISE: "لشبكات ومجموعات المدارس" },
    customPrice: "مخصص", unitMonth: "/شهرياً", billedMonthly: "تُدفع شهرياً", billedYearly: "{0} تُدفع سنوياً", noCard: "دون بطاقة", customNote: "تُحدد الشروط مع فريقنا",
    wasSr: "كان {0} شهرياً", saveYearly: "وفّر {0} سنوياً",
    meterOf: "{0} من {1}", upTo: "حتى {0}", fitsYou: "تناسب حجمك", fitsCampuses: "تناسب فروعك", fitShort: "مناسبة", tooSmall: "صغيرة",
    studentsOver: "{0} فوق الحد", campusDrafts: (n) => `${countLabel("ar", n, "campus")} ${n === 1 ? "يبقى مسودة" : n === 2 ? "يبقيان مسودتين" : "تبقى مسودات"}`,
    includes: "تشمل", plusHeading: "كل ما في {0}، بالإضافة إلى", tagReserved: "محجوزة", tagRequested: "مطلوبة", tagCheckout: "بدأ الدفع", tagRoom: "مساحة للنمو",
    choose: "اختر {0}", keep: "الإبقاء على {0}", viewReservation: "عرض الحجز", viewRequest: "عرض الطلب",
    campusCount: (n) => countLabel("ar", n, "campus"), studentCount: (n) => countLabel("ar", n, "student"),
    next: {
      free: "تبدأ الآن. دون بطاقة.", current: "هذه باقتك اليوم.", online: "ادفع إلكترونياً بأمان، ثم تعود إلى الإعداد.",
      bank: "الدفع بالتحويل البنكي. تظهر التفاصيل تالياً.", test: "تفتح دفعاً تجريبياً. لا تُنقل أي أموال.",
      reserve: "تُحجز الآن ويؤكد فريقنا الدفع. لا يُخصم شيء هنا.", custom: "تُحجز الآن ويتفق فريقنا معك على الشروط. لا يُخصم شيء هنا.",
      pendingReserved: "محجوزة. سيؤكد فريقنا الدفع معك.", pendingCustom: "مطلوبة. سيتفق فريقنا معك على الشروط.", pendingCheckout: "بدأ الدفع. تابع من حيث توقفت.",
      downgrade: "تبقى باقتك {0} مفعّلة. الانتقال إلى باقة أصغر يتم من الفوترة بعد الإعداد.", pendingDeferred: "الدفع مستحق. ادفع الآن لتفعيلها.",
    },
    nextDrafts: (n) => `${countLabel("ar", n, "campus")} ${n === 1 ? "يبقى محفوظاً كمسودة" : "تبقى محفوظة كمسودات"} حتى الترقية.`,
    verdict: {
      loading: "نبحث عن الباقة المناسبة…", beyond: "حجمك يتجاوز باقاتنا المدرجة. تُصمم {0} معك.",
      campusesOnly: "{0} تناسب {1}. أضف عدد طلابك لمطابقة أدق.", tight: "{0} تناسب {1} و{2}، قرب حدها البالغ {3}.", tightAlt: "{0} تمنحك مساحة للنمو.",
      current: "باقتك الحالية {0} تناسب {1} و{2} بالفعل.", roomy: "{0} تناسب {1} و{2}، مع مساحة لـ{3} إضافيين.", fit: "{0} تناسب {1} و{2}.",
      whyNotCampuses: "لماذا ليست {0}؟ تغطي {1}.", whyNotStudents: "لماذا ليست {0}؟ تغطي حتى {1}.", price: "{0} · {1}", announce: "الموصى بها: {0}. {1}",
    },
    selected: "محددة", continueWith: "المتابعة مع {0}", reserveNow: "احجز {0}، ويؤكد فريقنا الدفع", payEyebrow: "الدفع", payTitle: "ادفع لـ{0}", payBody: "ادفع الآن لتُفعّل {0} فوراً. أو تخطَّ الآن: يُحفظ اختيارك ويستمر الإعداد، وتُفعّل {0} فور الدفع.", payNow: "ادفع الآن", payLater: "تخطَّ الآن، ادفع لاحقاً", payNowTest: "ادفع الآن (دفع تجريبي)",
    notNow: "ليس الآن", modeTestTitle: "دفع تجريبي (للتطوير فقط)",
    modeTest: "لا توجد مفاتيح دفع على هذا الخادم، لذا تفتح الباقات المدفوعة صفحة دفع تجريبية. لا تُنقل أي أموال.",
    modeReserve: "الدفع الإلكتروني غير متاح لمدرستك بعد. اختيار باقة مدفوعة يحجزها، ويؤكد فريقنا السعر والدفع معك. لا يُخصم شيء هنا.",
    handoffTitle: "جارٍ فتح الدفع الآمن", handoffTestTitle: "جارٍ فتح الدفع التجريبي",
    handoffBody: "ننقلك لدفع {0}. إعدادك محفوظ وستعود إلى هنا.", handoffTestBody: "ننقلك إلى الدفع التجريبي لـ{0}. لا تُنقل أي أموال.",
    handoffFallback: "لم يحدث شيء؟ تابع إلى الدفع",
    failTitle: "تعذر حفظ اختيارك", failBody: "تحقق من اتصالك وحاول مرة أخرى. لم يُخصم أي مبلغ.",
    saveFirstFailed: "تعذر حفظ إعدادك، لذا لم يُفتح الدفع. حاول مرة أخرى.", viewStatus: "عرض حالة الطلب",
    eyebrows: { active: "تم اختيار الباقة", reserved: "تم حجز الباقة", custom: "تم حجز الباقة", bank: "بانتظار التحويل", pending: "الدفع قيد التنفيذ", deferred: "الدفع مستحق" },
    titles: { active: "أنت على {0}", reserved: "تم حجز {0} لك", custom: "تم طلب باقة مخصصة", bank: "حوّل لتفعيل {0}", pending: "جارٍ تأكيد دفع {0}", deferred: "تم اختيار {0} · ادفع متى شئت" },
    bodies: {
      active: "{0} مفعّلة. تابع إعدادك.",
      reserved: "لم يتم خصم أي مبلغ. سيتواصل معك فريقنا لتأكيد السعر والدفع. يبقى إعدادك محفوظاً، فتابع.",
      custom: "سيتواصل معك فريقنا للاتفاق على السعة والسعر. تابع الإعداد في الأثناء.",
      bank: "استخدم هذه التفاصيل والمرجع لنطابق دفعتك. تُفعّل {0} بعد التأكيد. لم يُخصم شيء بعد.",
      pending: "إعدادك محفوظ. تعرض صفحة حالة الطلب التقدم.",
      deferred: "لم يُخصم أي مبلغ. ادفع في أي وقت من خطوة الباقة؛ تُفعّل {0} فور الدفع. حتى ذلك يعمل الإعداد بحدودك الحالية.",
    },
    tags: { active: "اختيرت للتو", reserved: "حُجزت للتو", custom: "طُلبت للتو", bank: "تفاصيل التحويل جاهزة", pending: "بدأ الدفع", deferred: "ادفع متى شئت" },
    stepsLabel: "ما الخطوات التالية",
    steps: {
      active: ["تم اختيار {0}", "تابع الإعداد"], reserved: ["محجوزة", "يؤكد فريقنا الدفع", "تُفعّل {0}"],
      custom: ["مطلوبة", "يتفق فريقنا على الشروط", "تُفعّل {0}"], bank: ["عُرضت التفاصيل", "تحوّل ونؤكد", "تُفعّل {0}"],
      pending: ["بدأ الدفع", "تأكيد الدفع", "تُفعّل {0}"],
      deferred: ["تم اختيار {0}", "ادفع متى شئت", "تُفعّل {0}"],
    },
    stepState: { done: "تم", current: "التالي", pending: "لاحقاً" },
    ledgerBilling: "الفوترة", ledgerSize: "مُقاسة لـ", sizeValue: "{0} · {1}", studentsNotSet: "عدد الطلاب غير محدد",
    meanwhile: "تابع الإعداد أثناء التأكيد. تبقى الفروع بعد {0} محفوظة كمسودات حتى تُفعّل {1}.",
    changeChoice: "اختر باقة أخرى", continueSetup: "تابع الإعداد", copyValue: "نسخ {0}", copied: "تم النسخ",
    contactAt: "سنراسلك على {0}.", pending: "{0} محجوزة · بانتظار التأكيد",
    loadFailed: "تعذر تحميل الباقات", retry: "إعادة المحاولة", loading: "جارٍ تحميل الباقات",
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
  checkoutUnavailable: "ادائیگی دستیاب نہیں", statusReserved: "پیکیج محفوظ کر لیا گیا", savedReserved: "کوئی رقم نہیں کاٹی گئی۔ ہماری ٹیم قیمت اور ادائیگی کی تصدیق کے لیے آپ سے رابطہ کرے گی؛ آپ کا سیٹ اپ محفوظ ہے اور آپ جاری رکھ سکتے ہیں۔", checkoutNotConfigured: "آن لائن ادائیگی ابھی فعال نہیں۔ قیمت طلب کریں، ہماری ٹیم قیمت اور ادائیگی آپ کے ساتھ طے کرے گی؛ آپ کا سیٹ اپ محفوظ رہے گا۔", sizingTitle: "متوقع حجم", folio: "سیٹ اپ · پیکیج", paidUnavailable: "ادائیگی والا پیکیج فی الحال دستیاب نہیں۔", regionalQuote: "آپ کے علاقے کے لیے آن لائن ادائیگی ابھی دستیاب نہیں۔ قیمت طلب کریں، ہماری ٹیم آپ کے ساتھ قیمت، کرنسی اور ادائیگی کا طریقہ طے کرے گی۔",
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
  paymentFailure: "ادائیگی کی حالت لوڈ نہیں ہو سکی۔", chooseAnother: "دوسرا پیکیج منتخب کریں",
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
  chooser: {
    eyebrow: "سیٹ اپ · پیکیج", title: "موزوں پیکیج منتخب کریں", subtitle: "قیمتیں پاکستانی روپے میں۔ فیصلہ کرتے وقت آپ کا سیٹ اپ محفوظ رہتا ہے۔",
    sizeLabel: "متوقع حجم", studentsLabel: "متوقع طلبہ", studentsPlaceholder: "مثلاً 350", perStudentHint: "تمام کیمپسز کے طلبہ",
    fewerCampuses: "کم کیمپس", moreCampuses: "زیادہ کیمپس", fewerStudents: "کم طلبہ", moreStudents: "زیادہ طلبہ", packagesLabel: "پیکیجز", save: "{0}% بچت",
    recommended: "آپ کے لیے تجویز کردہ", ribbonBeyond: "آپ کے حجم کے لیے بہترین", reason: "آپ کے {0} اور {1} کے لیے موزوں", reasonCampuses: "آپ کے {0} کے لیے موزوں",
    tagline: { FREE: "شروعات کرنے والے ایک کیمپس کے لیے", BASIC: "بڑھتے ہوئے ایک کیمپس کے لیے", PRO: "کئی کیمپسز والے اسکولوں کے لیے", ENTERPRISE: "اسکول نیٹ ورکس اور گروپس کے لیے" },
    customPrice: "حسبِ ضرورت", unitMonth: "/ماہانہ", billedMonthly: "ماہانہ ادائیگی", billedYearly: "{0} سالانہ ادائیگی", noCard: "کارڈ کی ضرورت نہیں", customNote: "شرائط ہماری ٹیم کے ساتھ",
    wasSr: "پہلے {0} ماہانہ", saveYearly: "سالانہ {0} بچت",
    meterOf: "{1} میں سے {0}", upTo: "{0} تک", fitsYou: "آپ کے حجم کے مطابق", fitsCampuses: "آپ کے کیمپسز کے مطابق", fitShort: "موزوں", tooSmall: "چھوٹا",
    studentsOver: "حد سے {0} زیادہ", campusDrafts: (n) => `${countLabel("ur", n, "campus")} ڈرافٹ ${n === 1 ? "رہے گا" : "رہیں گے"}`,
    includes: "شامل ہے", plusHeading: "{0} کی ہر چیز، مزید", tagReserved: "محفوظ", tagRequested: "درخواست شدہ", tagCheckout: "ادائیگی شروع", tagRoom: "بڑھنے کی گنجائش",
    choose: "{0} منتخب کریں", keep: "{0} برقرار رکھیں", viewReservation: "ریزرویشن دیکھیں", viewRequest: "درخواست دیکھیں",
    campusCount: (n) => countLabel("ur", n, "campus"), studentCount: (n) => countLabel("ur", n, "student"),
    next: {
      free: "ابھی شروع کریں۔ کارڈ کی ضرورت نہیں۔", current: "یہ آج آپ کا پیکیج ہے۔", online: "محفوظ آن لائن ادائیگی کریں، پھر سیٹ اپ پر واپس آئیں۔",
      bank: "بینک ٹرانسفر سے ادائیگی۔ تفصیلات اگلے مرحلے میں۔", test: "ٹیسٹ ادائیگی کھلتی ہے۔ کوئی رقم منتقل نہیں ہوتی۔",
      reserve: "ابھی محفوظ؛ ہماری ٹیم ادائیگی کی تصدیق کرے گی۔ یہاں کچھ نہیں کاٹا جاتا۔", custom: "ابھی محفوظ؛ ہماری ٹیم آپ کے ساتھ شرائط طے کرے گی۔ یہاں کچھ نہیں کاٹا جاتا۔",
      pendingReserved: "محفوظ۔ ہماری ٹیم آپ کے ساتھ ادائیگی کی تصدیق کرے گی۔", pendingCustom: "درخواست شدہ۔ ہماری ٹیم شرائط طے کرے گی۔", pendingCheckout: "ادائیگی شروع ہو چکی۔ جہاں چھوڑا تھا وہاں سے جاری رکھیں۔",
      downgrade: "آپ کا {0} پیکیج فعال رہے گا۔ چھوٹے پیکیج پر منتقلی سیٹ اپ کے بعد بلنگ سے ہوتی ہے۔", pendingDeferred: "ادائیگی باقی ہے۔ فعال کرنے کے لیے ابھی ادائیگی کریں۔",
    },
    nextDrafts: (n) => `اپ گریڈ تک ${countLabel("ur", n, "campus")} ڈرافٹ کے طور پر محفوظ ${n === 1 ? "رہے گا" : "رہیں گے"}۔`,
    verdict: {
      loading: "موزوں پیکیج تلاش ہو رہا ہے…", beyond: "آپ کا حجم ہمارے درج پیکیجز سے زیادہ ہے۔ {0} آپ کے ساتھ ترتیب دیا جاتا ہے۔",
      campusesOnly: "{0} آپ کے {1} کے لیے موزوں ہے۔ بہتر مطابقت کے لیے طلبہ کی تعداد شامل کریں۔", tight: "{0} آپ کے {1} اور {2} کے لیے موزوں ہے، اپنی {3} کی حد کے قریب۔", tightAlt: "{0} آپ کو بڑھنے کی گنجائش دیتا ہے۔",
      current: "آپ کا موجودہ پیکیج {0} پہلے ہی {1} اور {2} کے لیے موزوں ہے۔", roomy: "{0} آپ کے {1} اور {2} کے لیے موزوں ہے، مزید {3} کی گنجائش کے ساتھ۔", fit: "{0} آپ کے {1} اور {2} کے لیے موزوں ہے۔",
      whyNotCampuses: "{0} کیوں نہیں؟ اس میں {1} ہے۔", whyNotStudents: "{0} کیوں نہیں؟ اس میں {1} تک کی گنجائش ہے۔", price: "{0} · {1}", announce: "تجویز کردہ: {0}۔ {1}",
    },
    selected: "منتخب", continueWith: "{0} کے ساتھ جاری رکھیں", reserveNow: "{0} محفوظ کریں، ٹیم ادائیگی کی تصدیق کرے گی", payEyebrow: "ادائیگی", payTitle: "{0} کی ادائیگی", payBody: "ابھی ادائیگی کریں تو {0} فوراً فعال ہو جائے گا۔ یا ابھی چھوڑ دیں: آپ کا انتخاب محفوظ ہے، سیٹ اپ جاری رہے گا، اور ادائیگی ہوتے ہی {0} فعال ہو جائے گا۔", payNow: "ابھی ادائیگی کریں", payLater: "ابھی چھوڑیں، بعد میں ادائیگی", payNowTest: "ابھی ادائیگی (ٹیسٹ)",
    notNow: "ابھی نہیں", modeTestTitle: "ٹیسٹ ادائیگی (صرف ڈیولپمنٹ)",
    modeTest: "اس سرور پر ادائیگی کیز موجود نہیں، اس لیے ادائیگی والے پیکیج ٹیسٹ صفحہ کھولتے ہیں۔ کوئی رقم منتقل نہیں ہوتی۔",
    modeReserve: "آپ کے اسکول کے لیے آن لائن ادائیگی ابھی دستیاب نہیں۔ ادائیگی والا پیکیج منتخب کرنے سے وہ محفوظ ہو جاتا ہے، اور ہماری ٹیم قیمت اور ادائیگی طے کرتی ہے۔ یہاں کچھ نہیں کاٹا جاتا۔",
    handoffTitle: "محفوظ ادائیگی کھل رہی ہے", handoffTestTitle: "ٹیسٹ ادائیگی کھل رہی ہے",
    handoffBody: "{0} کی ادائیگی کے لیے لے جا رہے ہیں۔ آپ کا سیٹ اپ محفوظ ہے اور آپ یہیں واپس آئیں گے۔", handoffTestBody: "{0} کی ٹیسٹ ادائیگی پر لے جا رہے ہیں۔ کوئی رقم منتقل نہیں ہوتی۔",
    handoffFallback: "آگے نہیں بڑھا؟ ادائیگی پر جائیں",
    failTitle: "آپ کا انتخاب محفوظ نہیں ہو سکا", failBody: "اپنا کنکشن چیک کریں اور دوبارہ کوشش کریں۔ کوئی رقم نہیں کاٹی گئی۔",
    saveFirstFailed: "آپ کا سیٹ اپ محفوظ نہیں ہو سکا، اس لیے ادائیگی نہیں کھلی۔ دوبارہ کوشش کریں۔", viewStatus: "آرڈر کی حالت دیکھیں",
    eyebrows: { active: "پیکیج منتخب", reserved: "پیکیج محفوظ", custom: "پیکیج محفوظ", bank: "ٹرانسفر کا انتظار", pending: "ادائیگی جاری", deferred: "ادائیگی باقی" },
    titles: { active: "آپ {0} پر ہیں", reserved: "{0} آپ کے لیے محفوظ ہے", custom: "کسٹم پیکیج کی درخواست ہو گئی", bank: "{0} فعال کرنے کے لیے ٹرانسفر کریں", pending: "{0} کی ادائیگی کی تصدیق ہو رہی ہے", deferred: "{0} منتخب · جب چاہیں ادائیگی کریں" },
    bodies: {
      active: "{0} فعال ہے۔ اپنا سیٹ اپ جاری رکھیں۔",
      reserved: "کوئی رقم نہیں کاٹی گئی۔ ہماری ٹیم قیمت اور ادائیگی کی تصدیق کے لیے رابطہ کرے گی۔ آپ کا سیٹ اپ محفوظ ہے، جاری رکھیں۔",
      custom: "ہماری ٹیم گنجائش اور قیمت طے کرنے کے لیے رابطہ کرے گی۔ اس دوران سیٹ اپ جاری رکھیں۔",
      bank: "یہ تفصیلات اور حوالہ استعمال کریں تاکہ ہم آپ کی ادائیگی ملا سکیں۔ تصدیق کے بعد {0} فعال ہو جائے گا۔ ابھی کچھ نہیں کاٹا گیا۔",
      pending: "آپ کا سیٹ اپ محفوظ ہے۔ آرڈر کی حالت کا صفحہ پیش رفت دکھاتا ہے۔",
      deferred: "کوئی رقم نہیں کاٹی گئی۔ پیکیج کے مرحلے سے کسی بھی وقت ادائیگی کریں؛ ادائیگی ہوتے ہی {0} فعال ہو جائے گا۔ تب تک سیٹ اپ موجودہ حدود پر چلے گا۔",
    },
    tags: { active: "ابھی منتخب کیا", reserved: "ابھی محفوظ کیا", custom: "ابھی درخواست کی", bank: "ٹرانسفر کی تفصیلات تیار", pending: "ادائیگی شروع", deferred: "جب چاہیں ادائیگی کریں" },
    stepsLabel: "آگے کیا ہوگا",
    steps: {
      active: ["{0} منتخب", "سیٹ اپ جاری رکھیں"], reserved: ["محفوظ", "ہماری ٹیم ادائیگی کی تصدیق کرے گی", "{0} فعال"],
      custom: ["درخواست شدہ", "ہماری ٹیم شرائط طے کرے گی", "{0} فعال"], bank: ["تفصیلات دکھائی گئیں", "آپ ٹرانسفر کریں، ہم تصدیق کریں گے", "{0} فعال"],
      pending: ["ادائیگی شروع", "ادائیگی کی تصدیق", "{0} فعال"],
      deferred: ["{0} منتخب", "جب چاہیں ادائیگی کریں", "{0} فعال"],
    },
    stepState: { done: "مکمل", current: "اگلا", pending: "بعد میں" },
    ledgerBilling: "ادائیگی", ledgerSize: "حجم", sizeValue: "{0} · {1}", studentsNotSet: "طلبہ کی تعداد درج نہیں",
    meanwhile: "تصدیق کے دوران سیٹ اپ جاری رکھیں۔ {0} سے زائد کیمپس {1} فعال ہونے تک ڈرافٹ رہیں گے۔",
    changeChoice: "دوسرا پیکیج منتخب کریں", continueSetup: "سیٹ اپ جاری رکھیں", copyValue: "{0} کاپی کریں", copied: "کاپی ہو گیا",
    contactAt: "ہم {0} پر لکھیں گے۔", pending: "{0} محفوظ · تصدیق کا انتظار",
    loadFailed: "پیکیجز لوڈ نہیں ہو سکے", retry: "دوبارہ کوشش کریں", loading: "پیکیجز لوڈ ہو رہے ہیں",
  },
};

export function getPackageCopy(language: string): PackageCopy {
  return language === "ar" ? ar : language === "ur" ? ur : en;
}
