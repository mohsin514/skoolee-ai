/**
 * P1 (institution authority, capability keys, billing and institution server gates) — Arabic and Urdu
 * for every new or changed EN UI key in P1 files. Aggregated by P9 into arabicRoleUxUi / urduRoleUxUi
 * (src/lib/locale/role-ux/index.ts).
 *
 * Covers: mode-aware role labels (§1.5), the /billing resolver and the suspended screen (§6.2, §6.3), the SafePay
 * test checkout page, action-queue items (G39) and the server error copy those surfaces show through toasts and
 * inline errors (G51, §7.2, §7.3). Kept as [en, ar, ur] rows so every key always has both translations.
 */
const ROWS: ReadonlyArray<readonly [string, string, string]> = [
  // §1.5 role labels (session/profile return roleLabelFor(user, language) plus the EN roleLabelKey for clients that re-translate)
  ["Group admin", "مدير المجموعة", "ادارے کا منتظم"],
  ["School admin", "مدير المدرسة", "اسکول منتظم"],
  ["Campus admin", "مدير الفرع", "کیمپس منتظم"],
  ["Platform operator", "مشغّل المنصة", "پلیٹ فارم آپریٹر"],
  ["Acting academic lead", "القائم بأعمال القيادة الأكاديمية", "قائم مقام تعلیمی سربراہ"],

  // /billing resolver and suspended screen
  ["Billing & plan", "الفوترة والخطة", "بلنگ اور پلان"],
  ["The SkooleeAI subscription is managed by the school.", "تدير المدرسة اشتراك SkooleeAI.", "SkooleeAI سبسکرپشن کا انتظام اسکول کرتا ہے۔"],
  ["Contact SkooleeAI support to restore billing access.", "تواصل مع دعم SkooleeAI لاستعادة الوصول إلى الفوترة.", "بلنگ تک رسائی بحال کرنے کے لیے SkooleeAI سپورٹ سے رابطہ کریں۔"],
  ["Your school's plan is paused", "خطة مدرستك متوقفة مؤقتًا", "آپ کے اسکول کا پلان عارضی طور پر رکا ہوا ہے"],
  ["Your school's plan is paused.", "خطة مدرستك متوقفة مؤقتًا.", "آپ کے اسکول کا پلان عارضی طور پر رکا ہوا ہے۔"],
  ["The school's SkooleeAI plan is paused. Your records stay in place, and you can sign back in once the school renews it.", "خطة SkooleeAI الخاصة بالمدرسة متوقفة مؤقتًا. تبقى سجلاتك محفوظة، ويمكنك تسجيل الدخول مجددًا بعد أن تجددها المدرسة.", "اسکول کا SkooleeAI پلان عارضی طور پر رکا ہوا ہے۔ آپ کا ریکارڈ محفوظ ہے، اور اسکول کے تجدید کرنے کے بعد آپ دوبارہ سائن اِن کر سکتے ہیں۔"],
  ["Your plan is paused. {0} can renew it.", "خطتك متوقفة مؤقتًا. يمكن لـ {0} تجديدها.", "آپ کا پلان عارضی طور پر رکا ہوا ہے۔ {0} اس کی تجدید کر سکتے ہیں۔"],
  ["Your records stay in place, and your workspace opens again as soon as the plan is renewed.", "تبقى سجلاتك محفوظة، وتُفتح مساحة عملك مجددًا فور تجديد الخطة.", "آپ کا ریکارڈ محفوظ رہتا ہے، اور پلان کی تجدید ہوتے ہی آپ کی کام کی جگہ دوبارہ کھل جائے گی۔"],
  ["Open Billing & plan", "افتح الفوترة والخطة", "بلنگ اور پلان کھولیں"],
  ["Renew the plan or update the payment method in Billing & plan.", "جدّد الخطة أو حدّث طريقة الدفع من الفوترة والخطة.", "بلنگ اور پلان میں پلان کی تجدید کریں یا ادائیگی کا طریقہ اپ ڈیٹ کریں۔"],

  // SafePay test checkout
  ["The payment did not go through. Please try again.", "لم تكتمل عملية الدفع. حاول مرة أخرى.", "ادائیگی مکمل نہیں ہوئی۔ براہِ کرم دوبارہ کوشش کریں۔"],
  ["Payment successful", "تم الدفع بنجاح", "ادائیگی کامیاب رہی"],
  ["Taking you back to your fees…", "نعيدك إلى صفحة الرسوم…", "آپ کو فیس کے صفحے پر واپس لے جا رہے ہیں…"],
  ["Taking you back to your setup…", "نعيدك إلى الإعداد…", "آپ کو سیٹ اپ پر واپس لے جا رہے ہیں…"],
  ["Taking you back to Billing & plan…", "نعيدك إلى الفوترة والخطة…", "آپ کو بلنگ اور پلان پر واپس لے جا رہے ہیں…"],
  ["Secured by HBL", "مؤمَّن بواسطة HBL", "HBL کے ذریعے محفوظ"],
  ["Order reference", "مرجع الطلب", "آرڈر حوالہ"],
  ["Invoice:", "الفاتورة:", "انوائس:"],
  ["Plan:", "الخطة:", "پلان:"],
  ["Annual", "سنوي", "سالانہ"],
  ["Monthly", "شهري", "ماہانہ"],
  ["20% annual discount applied", "تم تطبيق خصم سنوي بنسبة 20%", "20% سالانہ رعایت لاگو ہو گئی"],
  ["Cardholder name", "اسم حامل البطاقة", "کارڈ ہولڈر کا نام"],
  ["Name on the card", "الاسم المدوّن على البطاقة", "کارڈ پر لکھا نام"],
  ["Card number", "رقم البطاقة", "کارڈ نمبر"],
  ["Month / year", "الشهر / السنة", "مہینہ / سال"],
  ["CVV", "رمز CVV", "CVV"],
  ["3 digits on the back", "3 أرقام على ظهر البطاقة", "کارڈ کی پشت پر 3 ہندسے"],
  ["Pay {0}", "ادفع {0}", "{0} ادا کریں"],
  ["This is a test payment page. No real payment will be charged.", "هذه صفحة دفع تجريبية. لن يتم خصم أي مبلغ حقيقي.", "یہ آزمائشی ادائیگی کا صفحہ ہے۔ کوئی حقیقی رقم نہیں کاٹی جائے گی۔"],

  // Action queue (G39)
  ["Payment correction awaiting a decision", "تصحيح دفعة بانتظار القرار", "ادائیگی کی تصحیح فیصلے کی منتظر ہے"],
  ["Mark correction awaiting a decision", "تصحيح درجة بانتظار القرار", "نمبروں کی تصحیح فیصلے کی منتظر ہے"],
  ["Review the correction", "راجع التصحيح", "تصحیح کا جائزہ لیں"],
  ["Queue item not found.", "لم يُعثر على عنصر قائمة المهام.", "فہرست کا یہ آئٹم نہیں ملا۔"],
  ["This queue item belongs to another role on this campus.", "يخص عنصر قائمة المهام هذا دورًا آخر في هذا الفرع.", "فہرست کا یہ آئٹم اس کیمپس پر کسی دوسرے کردار سے متعلق ہے۔"],
  ["The group admin reads campus queues; the campus team assigns and resolves them.", "يطّلع مدير المجموعة على قوائم مهام الفروع؛ ويتولى فريق الفرع إسنادها وإنجازها.", "ادارے کا منتظم کیمپس کی فہرستیں دیکھتا ہے؛ کیمپس کی ٹیم انہیں تفویض اور حل کرتی ہے۔"],

  // Plan and suspension errors (G51) and subscription gates (G6, G8, G9)
  ["This school's SkooleeAI plan is paused until the account owner renews it.", "خطة SkooleeAI لهذه المدرسة متوقفة مؤقتًا حتى يجددها مالك الحساب.", "اس اسکول کا SkooleeAI پلان اکاؤنٹ کے مالک کی تجدید تک رکا ہوا ہے۔"],
  // Plan limits (G51, R11): one placeholder key per unit and number; {0} plan name, {1} limit (bidi-isolated in AR/UR).
  ["{0} allows {1} student. The account owner can upgrade the plan.", "تسمح خطة {0} بحد أقصى {1} طالب. يمكن لمالك الحساب ترقية الخطة.", "{0} پلان میں زیادہ سے زیادہ {1} طالب علم کی گنجائش ہے۔ اکاؤنٹ کا مالک پلان اپ گریڈ کر سکتا ہے۔"],
  ["{0} allows {1} students. The account owner can upgrade the plan.", "تسمح خطة {0} بحد أقصى {1} من الطلاب. يمكن لمالك الحساب ترقية الخطة.", "{0} پلان میں زیادہ سے زیادہ {1} طلبہ کی گنجائش ہے۔ اکاؤنٹ کا مالک پلان اپ گریڈ کر سکتا ہے۔"],
  ["{0} allows {1} teacher. The account owner can upgrade the plan.", "تسمح خطة {0} بحد أقصى {1} معلم. يمكن لمالك الحساب ترقية الخطة.", "{0} پلان میں زیادہ سے زیادہ {1} استاد کی گنجائش ہے۔ اکاؤنٹ کا مالک پلان اپ گریڈ کر سکتا ہے۔"],
  ["{0} allows {1} teachers. The account owner can upgrade the plan.", "تسمح خطة {0} بحد أقصى {1} من المعلمين. يمكن لمالك الحساب ترقية الخطة.", "{0} پلان میں زیادہ سے زیادہ {1} اساتذہ کی گنجائش ہے۔ اکاؤنٹ کا مالک پلان اپ گریڈ کر سکتا ہے۔"],
  ["{0} allows {1} campus. The account owner can upgrade the plan.", "تسمح خطة {0} بحد أقصى {1} فرع. يمكن لمالك الحساب ترقية الخطة.", "{0} پلان میں زیادہ سے زیادہ {1} کیمپس کی گنجائش ہے۔ اکاؤنٹ کا مالک پلان اپ گریڈ کر سکتا ہے۔"],
  ["{0} allows {1} campuses. The account owner can upgrade the plan.", "تسمح خطة {0} بحد أقصى {1} من الفروع. يمكن لمالك الحساب ترقية الخطة.", "{0} پلان میں زیادہ سے زیادہ {1} کیمپس کی گنجائش ہے۔ اکاؤنٹ کا مالک پلان اپ گریڈ کر سکتا ہے۔"],
  ["This feature is not part of the school's plan. The account owner can add it.", "هذه الميزة ليست ضمن خطة المدرسة. يمكن لمالك الحساب إضافتها.", "یہ سہولت اسکول کے پلان میں شامل نہیں۔ اکاؤنٹ کا مالک اسے شامل کر سکتا ہے۔"],
  ["Turn on two-step sign-in before you cancel the plan or request a refund.", "فعّل تسجيل الدخول بخطوتين قبل إلغاء الخطة أو طلب استرداد المبلغ.", "پلان منسوخ کرنے یا رقم کی واپسی کی درخواست سے پہلے دو مرحلہ سائن اِن آن کریں۔"],
  ["Turn on two-step sign-in before you change the payment method.", "فعّل تسجيل الدخول بخطوتين قبل تغيير طريقة الدفع.", "ادائیگی کا طریقہ بدلنے سے پہلے دو مرحلہ سائن اِن آن کریں۔"],
  ["Fee setup, invoices and payments moved. Use /api/fees.", "انتقل إعداد الرسوم والفواتير والمدفوعات. استخدم ‎/api/fees.", "فیس سیٹ اپ، انوائسز اور ادائیگیاں منتقل ہو گئی ہیں۔ ‎/api/fees استعمال کریں۔"],

  // Institution authority gates (§7.3)
  ["Only the institution administrator can review support access.", "لا يراجع وصول الدعم إلا مسؤول المؤسسة.", "سپورٹ رسائی کا جائزہ صرف ادارے کا منتظم لے سکتا ہے۔"],
  ["Turn on two-step sign-in before you review support access.", "فعّل تسجيل الدخول بخطوتين قبل مراجعة وصول الدعم.", "سپورٹ رسائی کا جائزہ لینے سے پہلے دو مرحلہ سائن اِن آن کریں۔"],
  ["Only the institution administrator can open this.", "لا يفتح هذا إلا مسؤول المؤسسة.", "اسے صرف ادارے کا منتظم کھول سکتا ہے۔"],
  ["Turn on two-step sign-in before you reset someone's password.", "فعّل تسجيل الدخول بخطوتين قبل إعادة تعيين كلمة مرور أي شخص.", "کسی کا پاس ورڈ ری سیٹ کرنے سے پہلے دو مرحلہ سائن اِن آن کریں۔"],
  ["This account resets its own password.", "يعيد صاحب هذا الحساب تعيين كلمة مروره بنفسه.", "یہ اکاؤنٹ اپنا پاس ورڈ خود ری سیٹ کرتا ہے۔"],
  ["Only the institution administrator can change school details.", "لا يغيّر بيانات المدرسة إلا مسؤول المؤسسة.", "اسکول کی تفصیلات صرف ادارے کا منتظم تبدیل کر سکتا ہے۔"],
  ["Only the group admin can archive or restore a campus.", "لا يؤرشف الفرع أو يستعيده إلا مدير المجموعة.", "کیمپس کو آرکائیو یا بحال صرف ادارے کا منتظم کر سکتا ہے۔"],
  ["Only the institution administrator can change the school logo", "لا يغيّر شعار المدرسة إلا مسؤول المؤسسة", "اسکول کا لوگو صرف ادارے کا منتظم تبدیل کر سکتا ہے"],
  ["Only the institution administrator manages sign-in and roster connections.", "لا يدير اتصالات تسجيل الدخول والقوائم إلا مسؤول المؤسسة.", "سائن اِن اور فہرست کے کنکشن صرف ادارے کا منتظم سنبھالتا ہے۔"],
  ["Only the institution administrator or a campus admin can open sign-in and roster settings.", "لا يفتح إعدادات تسجيل الدخول والقوائم إلا مسؤول المؤسسة أو مدير الفرع.", "سائن اِن اور فہرست کی ترتیبات صرف ادارے کا منتظم یا کیمپس منتظم کھول سکتا ہے۔"],
  ["Only the institution administrator or a campus admin reviews roster batches.", "لا يراجع دفعات القوائم إلا مسؤول المؤسسة أو مدير الفرع.", "فہرست کے بیچ کا جائزہ صرف ادارے کا منتظم یا کیمپس منتظم لیتا ہے۔"],
  ["Emergency administrators must be active institution administrators of this school.", "يجب أن يكون مسؤولو الطوارئ من مسؤولي المؤسسة النشطين في هذه المدرسة.", "ہنگامی منتظمین کا اس اسکول کے فعال ادارہ جاتی منتظمین ہونا ضروری ہے۔"],
  ["Only the institution administrator manages integrations.", "لا يدير التكاملات إلا مسؤول المؤسسة.", "انٹیگریشنز صرف ادارے کا منتظم سنبھالتا ہے۔"],
  ["Integration access is required.", "يلزم الوصول إلى التكاملات.", "انٹیگریشن تک رسائی درکار ہے۔"],
  ["Only the group admin can change group policy.", "لا يغيّر سياسة المجموعة إلا مدير المجموعة.", "گروپ پالیسی صرف ادارے کا منتظم تبدیل کر سکتا ہے۔"],
  ["Group policy applies to school groups.", "تنطبق سياسة المجموعة على مجموعات المدارس.", "گروپ پالیسی اسکولوں کے گروپ پر لاگو ہوتی ہے۔"],
  ["Only a campus admin in a school group can request a policy override.", "لا يطلب استثناءً من السياسة إلا مدير فرع ضمن مجموعة مدارس.", "پالیسی میں استثنا کی درخواست صرف اسکول گروپ کا کیمپس منتظم دے سکتا ہے۔"],
  ["Another group admin must decide an override you requested.", "يجب أن يقرر مدير مجموعة آخر الاستثناء الذي طلبته.", "آپ کی درخواست کردہ استثنا کا فیصلہ کسی دوسرے منتظم کو کرنا ہوگا۔"],
  ["Choose another group admin to review this change.", "اختر مدير مجموعة آخر لمراجعة هذا التغيير.", "اس تبدیلی کے جائزے کے لیے کوئی دوسرا منتظم منتخب کریں۔"],
  ["You are the only group admin. Give a reason of at least 10 characters to approve your own version.", "أنت مدير المجموعة الوحيد. اكتب سببًا من 10 أحرف على الأقل لاعتماد إصدارك.", "آپ واحد ادارہ جاتی منتظم ہیں۔ اپنا ورژن منظور کرنے کے لیے کم از کم 10 حروف کی وجہ لکھیں۔"],
  ["Another group admin is now active. Ask them to review this version.","أصبح مدير مجموعة آخر نشطًا. اطلب منه مراجعة هذا الإصدار.", "اب ایک اور منتظم فعال ہے۔ ان سے اس ورژن کا جائزہ لینے کو کہیں۔"],
  ["Only the institution administrator may review or consolidate identities.", "لا يراجع الهويات أو يدمجها إلا مسؤول المؤسسة.", "شناختوں کا جائزہ یا انضمام صرف ادارے کا منتظم کر سکتا ہے۔"],
  ["Verify both permanent IDs and record a reason of at least 10 characters", "تحقق من المعرّفين الدائمين واكتب سببًا من 10 أحرف على الأقل", "دونوں مستقل شناختیں تصدیق کریں اور کم از کم 10 حروف کی وجہ درج کریں"],
  ["Your school is a single school. Contact SkooleeAI support to become a school group.", "مدرستك مدرسة واحدة. تواصل مع دعم SkooleeAI لتصبح مجموعة مدارس.", "آپ کا اسکول ایک واحد اسکول ہے۔ اسکول گروپ بننے کے لیے SkooleeAI سپورٹ سے رابطہ کریں۔"],
  ["Only the group admin can add a campus.", "لا يضيف فرعًا إلا مدير المجموعة.", "کیمپس صرف ادارے کا منتظم شامل کر سکتا ہے۔"],
  ["Only the platform operator can create a school.", "لا ينشئ مدرسة إلا مشغّل المنصة.", "اسکول صرف پلیٹ فارم آپریٹر بنا سکتا ہے۔"],
  ["Only the institution administrator can change the messaging policy.", "لا يغيّر سياسة المراسلة إلا مسؤول المؤسسة.", "پیغام رسانی کی پالیسی صرف ادارے کا منتظم تبدیل کر سکتا ہے۔"],
  ["Your own role's permissions are managed for you and cannot be changed here.", "تُدار صلاحيات دورك نيابةً عنك ولا يمكن تغييرها هنا.", "آپ کے اپنے کردار کی اجازتیں آپ کے لیے طے ہیں اور یہاں تبدیل نہیں ہو سکتیں۔"],
  ["The school admin always keeps Staff view.", "يحتفظ مدير المدرسة دائمًا بصلاحية عرض الموظفين.", "اسکول منتظم کے پاس عملہ دیکھنے کی اجازت ہمیشہ رہتی ہے۔"],
  ["The platform operator and group admin permissions are fixed.", "صلاحيات مشغّل المنصة ومدير المجموعة ثابتة.", "پلیٹ فارم آپریٹر اور ادارے کے منتظم کی اجازتیں مقرر ہیں۔"],
  ["Add a reason of at least 10 characters.", "أضف سببًا لا يقل عن 10 أحرف.", "کم از کم 10 حروف کی وجہ لکھیں۔"],

  ["You cannot request a data export.", "لا يمكنك طلب تصدير البيانات.", "آپ ڈیٹا ایکسپورٹ کی درخواست نہیں دے سکتے۔"],
  ["Data lifecycle information is not available for your role.", "معلومات دورة حياة البيانات غير متاحة لدورك.", "ڈیٹا لائف سائیکل کی معلومات آپ کے کردار کے لیے دستیاب نہیں۔"],
  ["Could not load workspace counts.", "تعذّر تحميل أعداد مساحة العمل.", "ورک اسپیس کی گنتی لوڈ نہیں ہو سکی۔"],

  // Memberships (G7, G7b)
  ["Membership management is not delegated", "لم تُفوَّض إدارة العضويات", "رکنیت کا انتظام تفویض نہیں کیا گیا"],
  ["Membership authority changed. Sign in again.", "تغيّرت صلاحية إدارة العضويات. سجّل الدخول مجددًا.", "رکنیت کا اختیار بدل گیا ہے۔ دوبارہ سائن اِن کریں۔"],
  ["Membership management is not delegated to this account.","لم تُفوَّض إدارة العضويات لهذا الحساب.", "رکنیت کا انتظام اس اکاؤنٹ کو تفویض نہیں کیا گیا۔"],
  ["You can only invite staff to your own campus", "يمكنك دعوة الموظفين إلى فرعك فقط", "آپ صرف اپنے کیمپس میں عملے کو مدعو کر سکتے ہیں"],
  ["Family memberships cannot receive administrative delegations", "لا يمكن منح عضويات الأسر تفويضات إدارية", "خاندانی رکنیتوں کو انتظامی اختیارات نہیں دیے جا سکتے"],
  ["Subscription purchasing can only be shared with another group admin, from People & access.", "لا يمكن مشاركة شراء الاشتراك إلا مع مدير مجموعة آخر، من الأشخاص والوصول.", "سبسکرپشن کی خریداری صرف کسی دوسرے ادارہ جاتی منتظم کے ساتھ، لوگ اور رسائی سے، شیئر کی جا سکتی ہے۔"],
  ["Only the institution administrator can delegate membership management.", "لا يفوّض إدارة العضويات إلا مسؤول المؤسسة.", "رکنیت کے انتظام کا اختیار صرف ادارے کا منتظم دے سکتا ہے۔"],
  ["Only the institution administrator appoints campus leaders.", "لا يعيّن قادة الفروع إلا مسؤول المؤسسة.", "کیمپس کی قیادت کی تقرری صرف ادارے کا منتظم کرتا ہے۔"],
  ["Turn on two-step sign-in before you delegate membership management.", "فعّل تسجيل الدخول بخطوتين قبل تفويض إدارة العضويات.", "رکنیت کے انتظام کا اختیار دینے سے پہلے دو مرحلہ سائن اِن آن کریں۔"],
  ["Turn on two-step sign-in before you delegate purchasing or membership management.", "فعّل تسجيل الدخول بخطوتين قبل تفويض الشراء أو إدارة العضويات.", "خریداری یا رکنیت کے انتظام کا اختیار دینے سے پہلے دو مرحلہ سائن اِن آن کریں۔"],
  ["Only the institution administrator can change another administrator.", "لا يغيّر مسؤولًا آخر إلا مسؤول المؤسسة.", "کسی دوسرے منتظم میں تبدیلی صرف ادارے کا منتظم کر سکتا ہے۔"],
  ["Another administrator's role and campus cannot be changed here.", "لا يمكن تغيير دور مسؤول آخر وفرعه من هنا.", "کسی دوسرے منتظم کا کردار اور کیمپس یہاں تبدیل نہیں ہو سکتا۔"],
  ["The institution administrator must review this authority change", "يجب أن يراجع مسؤول المؤسسة تغيير الصلاحيات هذا", "اختیار کی اس تبدیلی کا جائزہ ادارے کے منتظم کو لینا ہوگا"],
  ["This membership cannot be changed here", "لا يمكن تغيير هذه العضوية من هنا", "یہ رکنیت یہاں تبدیل نہیں ہو سکتی"],
  ["Review the role, campus and access change before confirming", "راجع تغيير الدور والفرع والوصول قبل التأكيد", "تصدیق سے پہلے کردار، کیمپس اور رسائی کی تبدیلی کا جائزہ لیں"],
  ["The account owner cannot be removed", "لا يمكن إزالة مالك الحساب", "اکاؤنٹ کے مالک کو ہٹایا نہیں جا سکتا"],
  ["Only the institution administrator can remove campus leaders and delegated administrators", "لا يزيل قادة الفروع والمسؤولين المفوَّضين إلا مسؤول المؤسسة", "کیمپس کی قیادت اور تفویض یافتہ منتظمین کو صرف ادارے کا منتظم ہٹا سکتا ہے"],

  // Fix pass: kind-aware purchase refusal (R-I11), permission-matrix MFA refusal (G18/F28), /billing PageHeader (§8.1 R1),
  // and the action-queue sorting rule after CORRECTION_APPROVAL (G39).
  ["Subscription purchasing stays with the school admin.", "يبقى شراء الاشتراك لدى مدير المدرسة.", "سبسکرپشن کی خریداری اسکول منتظم کے پاس ہی رہتی ہے۔"],
  ["Turn on two-step sign-in before you change role permissions.", "فعّل تسجيل الدخول بخطوتين قبل تغيير صلاحيات الأدوار.", "کرداروں کی اجازتیں بدلنے سے پہلے دو مرحلہ سائن اِن آن کریں۔"],
  ["The school's SkooleeAI plan, AI credits and payment method.", "خطة SkooleeAI للمدرسة ورصيد الذكاء الاصطناعي وطريقة الدفع.", "اسکول کا SkooleeAI پلان، اے آئی کریڈٹس اور ادائیگی کا طریقہ۔"],
  ["Overdue items first; then confidential and late complaints, missing attendance today, failed family messages, leave to decide, report versions to approve, fee adjustments to decide, record corrections to decide, missed learning-action check-ins, syllabi to approve, papers due, papers waiting for moderation, papers to seal and results to release; then the earliest due time. No pupil risk score is used.", "العناصر المتأخرة أولًا؛ ثم الشكاوى السرية والمتأخرة، والحضور غير المسجل اليوم، ورسائل الأسر الفاشلة، والإجازات المطلوب البت فيها، ونسخ التقارير المطلوب اعتمادها، وتسويات الرسوم المطلوب البت فيها، وتصحيحات السجلات المطلوب البت فيها، ومواعيد متابعة إجراءات التعلم الفائتة، والمناهج المطلوب اعتمادها، والأوراق المستحقة، والأوراق بانتظار التدقيق، والأوراق المطلوب ختمها، والنتائج المطلوب نشرها؛ ثم الأقرب موعدًا. لا يُستخدم أي مؤشر خطر للطلاب.", "پہلے تاخیر شدہ آئٹمز؛ پھر خفیہ اور تاخیر والی شکایات، آج کی غیر درج حاضری، ناکام خاندانی پیغامات، فیصلہ طلب چھٹیاں، منظوری طلب رپورٹ ورژن، فیصلہ طلب فیس ایڈجسٹمنٹس، فیصلہ طلب ریکارڈ کی تصحیحات، چھوٹ جانے والے تعلیمی اقدام کے جائزے، منظوری طلب نصاب، واجب پرچے، جانچ کے منتظر پرچے، سیل طلب پرچے اور شائع طلب نتائج؛ پھر قریب ترین آخری تاریخ۔ کوئی طالب علم خطرہ اسکور استعمال نہیں ہوتا۔"],

  // Addendum 2026-10-22: SafePay's first-paint placeholder (its accessible name, now translated).
  ["Loading the payment page", "جارٍ تحميل صفحة الدفع", "ادائیگی کا صفحہ لوڈ ہو رہا ہے"],
];

export const arabicP1Ui: Record<string, string> = Object.fromEntries(ROWS.map(([en, ar]) => [en, ar]));

export const urduP1Ui: Record<string, string> = Object.fromEntries(ROWS.map(([en, , ur]) => [en, ur]));
