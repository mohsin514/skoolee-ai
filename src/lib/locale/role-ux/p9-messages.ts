/**
 * P9 (UX unification: shared primitives, feedback, notification/search/job links, readiness) — Arabic and Urdu
 * for every new or changed EN UI key in P9 files. Aggregated by src/lib/locale/role-ux/index.ts into
 * arabicRoleUxUi / urduRoleUxUi. Kept as [en, ar, ur] rows so every key always carries both translations.
 * AR/UR to be reviewed by a native reader.
 */
const ROWS: ReadonlyArray<readonly [string, string, string]> = [
  // Toast helpers (src/components/ui/toast.ts, §10.9)
  ["Saved", "تم الحفظ", "محفوظ ہو گیا"],
  ["{0} saved", "تم حفظ {0}", "{0} محفوظ ہو گیا"],
  ["Deleted", "تم الحذف", "حذف ہو گیا"],
  ["{0} deleted", "تم حذف {0}", "{0} حذف ہو گیا"],
  ["Sent", "تم الإرسال", "بھیجا گیا"],
  ["{0} sent", "تم إرسال {0}", "{0} بھیج دیا گیا"],
  ["{0} sent to {1}", "تم إرسال {0} إلى {1}", "{0} {1} کو بھیج دیا گیا"],
  ["Copied", "تم النسخ", "کاپی ہو گیا"],
  ["Copied to clipboard", "تم النسخ إلى الحافظة", "کلپ بورڈ پر کاپی ہو گیا"],
  ["Could not {0}. Try again.", "تعذّر {0}. حاول مرة أخرى.", "{0} نہیں ہو سکا۔ دوبارہ کوشش کریں۔"],
  ["Something went wrong. Try again.", "حدث خطأ ما. حاول مرة أخرى.", "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔"],

  // ConfirmAction reason (src/components/ui/confirm-action.tsx, §10.9)
  ["Reason", "السبب", "وجہ"],
  ["Keep editing", "متابعة التعديل", "ترمیم جاری رکھیں"],
  ["Enter at least {0} characters.", "أدخل {0} أحرف على الأقل.", "کم از کم {0} حروف درج کریں۔"],
  ["{0} of {1} characters", "{0} من {1} حرفًا", "{1} میں سے {0} حروف"],
  ["Explain why, for the audit record.", "اشرح السبب لسجل التدقيق.", "آڈٹ ریکارڈ کے لیے وجہ لکھیں۔"],

  // Shared states (src/components/ui/empty-state.tsx, error-state.tsx, task-patterns.tsx)
  ["We could not load this", "تعذّر تحميل هذا المحتوى", "یہ لوڈ نہیں ہو سکا"],
  ["Check your connection and try again. Nothing you entered was lost.", "تحقق من اتصالك وحاول مرة أخرى. لم يُفقد أي شيء أدخلته.", "اپنا کنکشن چیک کریں اور دوبارہ کوشش کریں۔ آپ کا درج کیا ہوا کچھ ضائع نہیں ہوا۔"],
  ["Try again", "حاول مجدداً", "دوبارہ کوشش کریں"],
  ["Retrying…", "جارٍ إعادة المحاولة…", "دوبارہ کوشش ہو رہی ہے…"],
  ["Some parts of this page couldn't load and are shown as empty.", "تعذّر تحميل بعض أجزاء هذه الصفحة، وهي معروضة فارغة.", "اس صفحے کے کچھ حصے لوڈ نہیں ہو سکے اور خالی دکھائے جا رہے ہیں۔"],

  // Notifications (src/lib/notifications/events.ts, G41/G41b)
  ["Some actions are paused while the school's plan is renewed.", "بعض الإجراءات متوقفة مؤقتًا إلى أن تُجدَّد خطة المدرسة.", "اسکول کے پلان کی تجدید تک کچھ کام عارضی طور پر رکے ہوئے ہیں۔"],
  ["School plan paused", "خطة المدرسة متوقفة مؤقتًا", "اسکول کا پلان عارضی طور پر رکا ہوا ہے"],
  ["No campus admin at {0}", "لا يوجد مدير فرع في {0}", "{0} میں کوئی کیمپس منتظم نہیں"],
  ["No campus admin at {0}: {1}", "لا يوجد مدير فرع في {0}: {1}", "{0} میں کوئی کیمپس منتظم نہیں: {1}"],
  ["Correction waiting for approval", "تصحيح بانتظار الموافقة", "اصلاح منظوری کی منتظر ہے"],
  ["A payment correction is waiting for your approval.", "تصحيح دفعة بانتظار موافقتك.", "ادائیگی کی ایک اصلاح آپ کی منظوری کی منتظر ہے۔"],
  ["A mark correction is waiting for your approval.", "تصحيح درجة بانتظار موافقتك.", "نمبروں کی ایک اصلاح آپ کی منظوری کی منتظر ہے۔"],
  ["Self-approved decision", "قرار معتمد ذاتيًا", "خود منظور شدہ فیصلہ"],
  ["Self-approved", "معتمد ذاتيًا", "خود منظور شدہ"],
  ["{0} approved their own {1} because no other approver is available. Reason: {2}", "اعتمد {0} طلب {1} الخاص به لعدم توفر معتمد آخر. السبب: {2}", "{0} نے اپنی {1} خود منظور کی کیونکہ کوئی اور منظور کنندہ موجود نہیں۔ وجہ: {2}"],
  ["fee adjustment", "تسوية الرسوم", "فیس میں ردوبدل"],
  ["purchase order", "أمر الشراء", "خریداری کا آرڈر"],
  ["tax package", "الحزمة الضريبية", "ٹیکس پیکیج"],
  ["group policy", "سياسة المجموعة", "گروپ پالیسی"],
  ["Tax package waiting for your sign-off", "حزمة ضريبية بانتظار اعتمادك", "ٹیکس پیکیج آپ کی منظوری کا منتظر ہے"],
  ["A tax package draft is ready for your sign-off. Review it in Approvals.", "مسودة حزمة ضريبية جاهزة لاعتمادك. راجعها في الموافقات.", "ٹیکس پیکیج کا ایک مسودہ آپ کی منظوری کے لیے تیار ہے۔ اسے منظوریوں میں دیکھیں۔"],

  // Readiness (src/lib/readiness/checks.ts, G49a)
  ["Managed per campus", "يُدار لكل فرع", "ہر کیمپس الگ سنبھالتا ہے"],
  ["Each campus admin completes this step for their campus.", "يُكمل كل مدير فرع هذه الخطوة لفرعه.", "ہر کیمپس منتظم یہ مرحلہ اپنے کیمپس کے لیے مکمل کرتا ہے۔"],

  // Search (src/components/search/search-workspace.tsx, G47)
  ["Record search is not part of your workspace.", "البحث في السجلات ليس جزءًا من مساحة عملك.", "ریکارڈ کی تلاش آپ کی کام کی جگہ کا حصہ نہیں ہے۔"],
  ["Find a pupil, class, staff member or application in your own school and open it in your workspace.", "ابحث عن طالب أو صف أو موظف أو طلب التحاق في مدرستك وافتحه في مساحة عملك.", "اپنے اسکول میں کوئی طالب علم، جماعت، عملے کا رکن یا درخواست تلاش کریں اور اسے اپنی کام کی جگہ میں کھولیں۔"],

  // Notification titles and messages that are fixed sentences (no names), read in the viewer's language by
  // src/components/notifications/notification-center.tsx (kinds listed in src/lib/notifications/links.ts).
  ["New class created", "تم إنشاء صف جديد", "نئی جماعت بنائی گئی"],
  ["Class archived", "تمت أرشفة الصف", "جماعت آرکائیو کر دی گئی"],
  ["New student enrolled", "تم تسجيل طالب جديد", "نیا طالب علم داخل ہو گیا"],
  ["Student transferred", "تم نقل الطالب", "طالب علم منتقل ہو گیا"],
  ["Student archived", "تمت أرشفة الطالب", "طالب علم آرکائیو کر دیا گیا"],
  ["New teacher added", "تمت إضافة معلم جديد", "نیا استاد شامل کیا گیا"],
  ["New staff added", "تمت إضافة موظف جديد", "عملے کا نیا رکن شامل کیا گیا"],
  ["Staff invitation sent", "تم إرسال دعوة الموظف", "عملے کو دعوت نامہ بھیج دیا گیا"],
  ["Staff removed", "تمت إزالة الموظف", "عملے کا رکن ہٹا دیا گیا"],
  ["Invitation accepted", "تم قبول الدعوة", "دعوت قبول کر لی گئی"],
  ["Attendance submitted", "تم إرسال الحضور", "حاضری جمع کرا دی گئی"],
  ["Attendance corrected", "تم تصحيح الحضور", "حاضری درست کر دی گئی"],
  ["Teacher attendance marked", "تم تسجيل حضور المعلمين", "اساتذہ کی حاضری لگا دی گئی"],
  ["New exam created", "تم إنشاء اختبار جديد", "نیا امتحان بنایا گیا"],
  ["Exam status updated", "تم تحديث حالة الاختبار", "امتحان کی صورتحال تبدیل ہو گئی"],
  ["Marks sent back for correction", "أُعيدت الدرجات للتصحيح", "نمبر درستی کے لیے واپس بھیجے گئے"],
  ["Report cards published", "تم نشر بطاقات التقارير", "رپورٹ کارڈ شائع ہو گئے"],
  ["Fee structure created", "تم إنشاء هيكل الرسوم", "فیس کا ڈھانچہ بنایا گیا"],
  ["Fee structure updated", "تم تحديث هيكل الرسوم", "فیس کا ڈھانچہ اپ ڈیٹ ہو گیا"],
  ["Payment recorded", "تم تسجيل الدفعة", "ادائیگی درج ہو گئی"],
  ["Timetable created", "تم إنشاء الجدول الدراسي", "ٹائم ٹیبل بنایا گیا"],
  ["Weekly update ready", "التحديث الأسبوعي جاهز", "ہفتہ وار رپورٹ تیار ہے"],
  ["Your child's weekly school update is ready to read.", "التحديث المدرسي الأسبوعي لطفلك جاهز للقراءة.", "آپ کے بچے کی ہفتہ وار اسکول رپورٹ پڑھنے کے لیے تیار ہے۔"],
  ["A place is available", "يتوفر مقعد", "ایک جگہ دستیاب ہے"],
  ["A waitlisted activity place is now offered to your child. Accept it before the offer expires.", "عُرض الآن على طفلك مقعد في نشاط كان على قائمة الانتظار. اقبله قبل انتهاء العرض.", "انتظار کی فہرست والی سرگرمی میں اب آپ کے بچے کو جگہ پیش کی گئی ہے۔ پیشکش ختم ہونے سے پہلے اسے قبول کریں۔"],
  ["Activity cancelled", "تم إلغاء النشاط", "سرگرمی منسوخ کر دی گئی"],
  ["An activity your child had a place in was cancelled by the school.", "ألغت المدرسة نشاطًا كان لطفلك مقعد فيه.", "اسکول نے وہ سرگرمی منسوخ کر دی جس میں آپ کے بچے کی جگہ تھی۔"],
  ["Pickup completed", "اكتمل الاستلام", "بچے کی وصولی مکمل ہو گئی"],
  ["Your child was collected under a pickup authorization you issued.", "تم استلام طفلك بموجب تفويض استلام أصدرته.", "آپ کے بچے کو آپ کی جاری کردہ اجازت کے تحت لے جایا گیا۔"],
  ["Pickup needs a lead decision", "الاستلام يحتاج إلى قرار من المسؤول", "وصولی کے لیے ذمہ دار کا فیصلہ درکار ہے"],
  ["A pickup could not be verified at the gate. The student is being kept supervised.", "تعذّر التحقق من عملية استلام عند البوابة. يبقى الطالب تحت الإشراف.", "گیٹ پر ایک وصولی کی تصدیق نہیں ہو سکی۔ طالب علم نگرانی میں ہے۔"],
  ["A learner asked for help", "طلب متعلم المساعدة", "ایک طالب علم نے مدد مانگی"],
  ["A learner asked for your help with a study question.", "طلب متعلم مساعدتك في سؤال دراسي.", "ایک طالب علم نے مطالعے کے ایک سوال میں آپ سے مدد مانگی۔"],
  ["A service request is now yours to handle.", "أصبح طلب خدمة مسندًا إليك لمعالجته.", "ایک سروس درخواست اب آپ کے ذمے ہے۔"],
  ["There is an update on a request you follow.", "يوجد تحديث على طلب تتابعه.", "آپ کی زیرِ نگرانی ایک درخواست پر نئی پیش رفت ہے۔"],
  ["The work is done. Confirm it or reopen the request.", "اكتمل العمل. أكّده أو أعد فتح الطلب.", "کام مکمل ہو گیا۔ اس کی تصدیق کریں یا درخواست دوبارہ کھولیں۔"],
  ["A resolved request was reopened.", "أُعيد فتح طلب تم حله.", "حل شدہ درخواست دوبارہ کھول دی گئی۔"],
  ["The requester added a message.", "أضاف مقدم الطلب رسالة.", "درخواست گزار نے ایک پیغام شامل کیا۔"],
  ["A service request passed its due time.", "تجاوز طلب خدمة موعده المحدد.", "ایک سروس درخواست اپنے مقررہ وقت سے آگے نکل گئی۔"],
  ["A safety concern was reported. Follow the school's escalation procedure.", "تم الإبلاغ عن مخاوف تتعلق بالسلامة. اتبع إجراءات التصعيد في المدرسة.", "حفاظت سے متعلق ایک خدشہ رپورٹ ہوا ہے۔ اسکول کے طریقۂ کار کے مطابق اسے آگے بڑھائیں۔"],
  ["Cover handover ready", "تسليم الحصة البديلة جاهز", "متبادل کلاس کی حوالگی تیار ہے"],
  ["The lesson you are covering has a handover with its objective and resources.", "للدرس الذي تغطيه تسليم يتضمن هدفه وموارده.", "جس سبق کی آپ جگہ لے رہے ہیں اس کی حوالگی میں مقصد اور وسائل موجود ہیں۔"],
  ["A covered or uncovered lesson needs a catch-up decision.", "يحتاج درس مغطى أو غير مغطى إلى قرار تعويض.", "متبادل یا خالی رہ جانے والے سبق کی تلافی کا فیصلہ درکار ہے۔"],
  ["Meeting booked", "تم حجز اجتماع", "ملاقات طے ہو گئی"],
  ["A family booked a meeting with you.", "حجزت أسرة اجتماعًا معك.", "ایک خاندان نے آپ سے ملاقات طے کی ہے۔"],
  ["Meeting moved", "تغيّر موعد الاجتماع", "ملاقات کا وقت تبدیل ہو گیا"],
  ["A parent–teacher meeting has a new time.", "لاجتماع ولي الأمر والمعلم موعد جديد.", "والدین اور استاد کی ملاقات کا نیا وقت مقرر ہوا ہے۔"],
  ["Meeting cancelled", "تم إلغاء الاجتماع", "ملاقات منسوخ ہو گئی"],
  ["A parent–teacher meeting was cancelled.", "أُلغي اجتماع ولي الأمر والمعلم.", "والدین اور استاد کی ملاقات منسوخ کر دی گئی۔"],
  ["Meeting needs a new time", "الاجتماع يحتاج إلى موعد جديد", "ملاقات کے لیے نیا وقت درکار ہے"],
  ["The teacher is no longer free at the booked time. A new time is needed.", "لم يعد المعلم متاحًا في الموعد المحجوز. يلزم موعد جديد.", "استاد طے شدہ وقت پر اب دستیاب نہیں۔ نیا وقت درکار ہے۔"],
  ["Meeting soon", "اجتماع قريب", "ملاقات جلد ہے"],
  ["You have a parent–teacher meeting within the next day.", "لديك اجتماع بين ولي الأمر والمعلم خلال اليوم القادم.", "اگلے ایک دن کے اندر آپ کی والدین اور استاد کی ملاقات ہے۔"],
  ["Meeting follow-up shared", "تمت مشاركة متابعة الاجتماع", "ملاقات کا خلاصہ شیئر کر دیا گیا"],
  ["The teacher shared the meeting summary and agreed actions.", "شارك المعلم ملخص الاجتماع والإجراءات المتفق عليها.", "استاد نے ملاقات کا خلاصہ اور طے شدہ اقدامات شیئر کیے۔"],
  ["Transport exception to resolve", "استثناء نقل يحتاج إلى حل", "ٹرانسپورٹ کا مسئلہ حل کرنا ہے"],
  ["A trip has an exception assigned to you.", "في رحلة استثناء مسند إليك.", "ایک سفر کا مسئلہ آپ کے ذمے لگایا گیا ہے۔"],
  ["New concern to triage", "مخاوف جديدة للفرز", "جانچ کے لیے نیا خدشہ"],
  ["A safeguarding concern was recorded at your campus.", "سُجّلت مخاوف تتعلق بالحماية في فرعك.", "آپ کے کیمپس پر تحفظ سے متعلق ایک خدشہ درج کیا گیا۔"],
  ["Case assigned to you", "أُسندت إليك حالة", "کیس آپ کے سپرد کیا گیا"],
  ["You are now the owner of a safeguarding case.", "أصبحت الآن مسؤولًا عن حالة حماية.", "اب آپ تحفظ کے ایک کیس کے ذمہ دار ہیں۔"],
  ["A proposed disclosure needs a second lead's review.", "يحتاج إفصاح مقترح إلى مراجعة مسؤول ثانٍ.", "مجوزہ انکشاف کے لیے دوسرے ذمہ دار کا جائزہ درکار ہے۔"],
  ["Emergency access opened", "تم فتح وصول طارئ", "ہنگامی رسائی کھولی گئی"],
  ["Emergency access to a confidential record was opened and needs your review.", "فُتح وصول طارئ إلى سجل سري ويحتاج إلى مراجعتك.", "ایک خفیہ ریکارڈ تک ہنگامی رسائی کھولی گئی ہے اور آپ کا جائزہ درکار ہے۔"],
  ["Message from the school", "رسالة من المدرسة", "اسکول کی طرف سے پیغام"],
  ["The school shared a message with you.", "شاركت المدرسة رسالة معك.", "اسکول نے آپ کے ساتھ ایک پیغام شیئر کیا۔"],
  ["Leave request answered", "تم الرد على طلب الإجازة", "رخصت کی درخواست کا جواب آ گیا"],
  ["The school approved a leave request.", "وافقت المدرسة على طلب إجازة.", "اسکول نے رخصت کی ایک درخواست منظور کر لی۔"],
  ["The school declined a leave request.", "رفضت المدرسة طلب إجازة.", "اسکول نے رخصت کی ایک درخواست مسترد کر دی۔"],
  ["The school asked for more detail on a leave request.", "طلبت المدرسة مزيدًا من التفاصيل حول طلب إجازة.", "اسکول نے رخصت کی ایک درخواست پر مزید تفصیل مانگی ہے۔"],
  ["Timetable updated", "تم تحديث الجدول الدراسي", "ٹائم ٹیبل اپ ڈیٹ ہو گیا"],
  ["Exam datesheet published", "تم نشر جدول الاختبارات", "امتحانات کی ڈیٹ شیٹ شائع ہو گئی"],
  ["Exam datesheet changed", "تغيّر جدول الاختبارات", "امتحانات کی ڈیٹ شیٹ تبدیل ہو گئی"],
  ["Timetable published", "تم نشر الجدول الدراسي", "ٹائم ٹیبل شائع ہو گیا"],
  ["Timetable deleted", "تم حذف الجدول الدراسي", "ٹائم ٹیبل حذف کر دیا گیا"],
  ["Academic year closed", "تم إغلاق العام الدراسي", "تعلیمی سال بند کر دیا گیا"],
  ["Students promoted", "تمت ترقية الطلاب", "طلبہ اگلی جماعت میں ترقی پا گئے"],
  ["Academic cycle updated", "تم تحديث الدورة الأكاديمية", "تعلیمی دور اپ ڈیٹ ہو گیا"],
  ["New subject created", "تم إنشاء مادة جديدة", "نیا مضمون بنایا گیا"],
  ["Leave request to review", "طلب إجازة للمراجعة", "جائزے کے لیے رخصت کی درخواست"],
  ["Leave approved", "تمت الموافقة على الإجازة", "رخصت منظور"],
  ["Leave rejected", "تم رفض الإجازة", "رخصت مسترد ہو گئی"],
  ["Teacher assigned to subject", "تم إسناد معلم إلى المادة", "مضمون کے لیے استاد مقرر کیا گیا"],
  ["Subscription expiring", "الاشتراك على وشك الانتهاء", "سبسکرپشن ختم ہونے والی ہے"],
  ["Subscription suspended", "تم تعليق الاشتراك", "سبسکرپشن معطل کر دی گئی"],

  // Insight charts (src/components/insights/chart-kit.tsx, F27)
  ["Show chart", "عرض المخطط", "چارٹ دکھائیں"],
  ["Show table", "عرض الجدول", "جدول دکھائیں"],
  ["Show the numbers as a table", "اعرض الأرقام في جدول", "اعداد جدول میں دکھائیں"],
  ["Nothing to tabulate yet", "لا توجد بيانات للجدول بعد", "جدول کے لیے ابھی کچھ نہیں"],
  ["{0}: {1} percent", "{0}: {1} بالمئة", "{0}: {1} فیصد"],
  ["{0} trend", "اتجاه {0}", "{0} کا رجحان"],
  ["No data for this period yet", "لا توجد بيانات لهذه الفترة بعد", "اس مدت کا ابھی کوئی ڈیٹا نہیں"],

  // Improvement evidence (src/components/improvement/improvement-workspace.tsx)
  ["Improvement evidence could not be loaded", "تعذّر تحميل أدلة التحسين", "بہتری کے شواہد لوڈ نہیں ہو سکے"],
  ["Could not refresh. Showing the last loaded evidence.", "تعذّر التحديث. تُعرض آخر أدلة تم تحميلها.", "تازہ نہیں ہو سکا۔ آخری بار لوڈ کیے گئے شواہد دکھائے جا رہے ہیں۔"],
  ["No criteria mapped yet", "لم تُربط أي معايير بعد", "ابھی کوئی معیار منسلک نہیں"],
  ["Revoke reviewer access?", "إلغاء صلاحية المراجِع؟", "جائزہ کار کی رسائی منسوخ کریں؟"],
  ["{0} can no longer open these criteria or their evidence. You can grant access again later.", "لن يتمكن {0} بعد الآن من فتح هذه المعايير أو أدلتها. يمكنك منح الصلاحية مجددًا لاحقًا.", "{0} اب یہ معیار یا ان کے شواہد نہیں کھول سکیں گے۔ آپ بعد میں دوبارہ رسائی دے سکتے ہیں۔"],

  // Profile card (src/components/profile/editable-profile-card.tsx)
  ["Image uploaded", "تم رفع الصورة", "تصویر اپ لوڈ ہو گئی"],
  ["Add image", "إضافة صورة", "تصویر شامل کریں"],
  ["Email locked", "البريد الإلكتروني مقفل", "ای میل مقفل ہے"],
  ["Account profile", "الملف الشخصي للحساب", "اکاؤنٹ پروفائل"],
  ["Your profile", "ملفك الشخصي", "آپ کی پروفائل"],
  ["Your full name", "اسمك الكامل", "آپ کا پورا نام"],
  ["Image URL", "رابط الصورة", "تصویر کا لنک"],
  ["Teaching specialities", "تخصصات التدريس", "تدریسی مہارتیں"],
  ["Used when subjects and timetable slots are assigned to you.", "يُستخدم عند إسناد المواد وحصص الجدول إليك.", "جب مضامین اور ٹائم ٹیبل کے پیریڈ آپ کو دیے جاتے ہیں تو یہ استعمال ہوتا ہے۔"],
  ["Remove image", "إزالة الصورة", "تصویر ہٹائیں"],
  ["Save profile", "حفظ الملف الشخصي", "پروفائل محفوظ کریں"],

  // Flagships (src/components/ui/flagship.tsx, addendum 2026-10-22). "AI Workflows" / "Exam Studio" are P2 nav keys.
  ["Flagship AI feature", "ميزة رئيسية بالذكاء الاصطناعي", "اے آئی کی نمایاں سہولت"],
  // The addendum's three flagship calls to action are one shared vocabulary on every Today screen (super, admin,
  // principal, teacher) and in the guides, so FlagshipCard's owner fixes their wording here; P9 has the highest
  // role-ux precedence, so P4/P6 duplicates no longer decide it (they should drop their rows).
  ["Set up your school with AI", "جهّز مدرستك بالذكاء الاصطناعي", "اے آئی کے ساتھ اپنا اسکول سیٹ اپ کریں"],
  ["Run an AI workflow", "شغّل مسارًا بالذكاء الاصطناعي", "اے آئی ورک فلو چلائیں"],
  ["Create an exam in Exam Studio", "أنشئ اختبارًا في استوديو الاختبارات", "ایگزام اسٹوڈیو میں امتحان بنائیں"],

  // Owner badge (P9-01): "Owner" stays the task/case owner (المسؤول / ذمہ دار); the account proprietor chip uses
  // this key so the two meanings never share one translation (ScopeBadge, P2).
  ["Account owner", "مالك الحساب", "اکاؤنٹ کا مالک"],

  // Search result labels (src/lib/search/service.ts, R7: statuses in words)
  ["Under review", "قيد المراجعة", "زیرِ جائزہ"],
  ["Offer made", "تم تقديم عرض", "پیشکش کی گئی"],

  // Coverage gaps already present at af1c6a75 (src/app/teacher-onboarding/page.tsx is listed in
  // tests/locale/ui-coverage.test.ts, which P9 owns). Kept here so the coverage test is green; P3 may move them.
  ["Your profile could not be opened", "تعذّر فتح ملفك الشخصي", "آپ کی پروفائل نہیں کھل سکی"],
  ["Saved to your staff record only. It is not shown to parents and is not kept in device drafts.", "يُحفظ في سجلك الوظيفي فقط. لا يظهر لأولياء الأمور ولا يُحتفظ به في مسودات الجهاز.", "صرف آپ کے عملے کے ریکارڈ میں محفوظ ہوتا ہے۔ یہ والدین کو نہیں دکھایا جاتا اور ڈیوائس کے مسودوں میں نہیں رکھا جاتا۔"],
];

export const arabicP9Ui: Record<string, string> = Object.fromEntries(ROWS.map(([en, ar]) => [en, ar]));

export const urduP9Ui: Record<string, string> = Object.fromEntries(ROWS.map(([en, , ur]) => [en, ur]));
