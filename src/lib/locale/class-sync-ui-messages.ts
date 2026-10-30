/** SKAI-193 offline class edits copy: [English, Arabic, Urdu]. Reviewed catalogs win for shared words. */
export const classSyncUiEntries: readonly (readonly [string, string, string])[] = [
  ["Class edits on this device", "تعديلات الفصول على هذا الجهاز", "اس ڈیوائس پر جماعتوں کی ترامیم"],
  ["Rename a class, change its section or seats even without a connection. Edits sync when you reconnect.", "أعد تسمية فصل أو غيّر شعبته أو مقاعده حتى دون اتصال. تتم مزامنة التعديلات عند عودة الاتصال.", "کنکشن کے بغیر بھی جماعت کا نام، سیکشن یا نشستیں بدلیں۔ دوبارہ جڑنے پر ترامیم ہم آہنگ ہو جاتی ہیں۔"],
  ["Pending sync", "بانتظار المزامنة", "ہم آہنگی باقی"],
  ["Needs your decision", "يحتاج إلى قرارك", "آپ کے فیصلے کا منتظر"],
  ["Synced", "تمت المزامنة", "ہم آہنگ ہو گیا"],
  ["Not synced", "لم تتم المزامنة", "ہم آہنگ نہیں ہوا"],
  ["Pending: {0}", "قيد الانتظار: {0}", "زیرِ التوا: {0}"],
  ["{0} class edit(s) need your decision.", "{0} من تعديلات الفصول تحتاج إلى قرارك.", "جماعت کی {0} ترامیم آپ کے فیصلے کی منتظر ہیں۔"],
  ["Class changes synced.", "تمت مزامنة تغييرات الفصول.", "جماعت کی تبدیلیاں ہم آہنگ ہو گئیں۔"],
  ["No connection. Your class edits stay on this device until the server accepts them.", "لا يوجد اتصال. تبقى تعديلات الفصول على هذا الجهاز حتى يقبلها الخادم.", "کنکشن نہیں۔ آپ کی جماعتی ترامیم سرور کے قبول کرنے تک اسی ڈیوائس پر رہیں گی۔"],
  ["Saved on this device. It syncs when you are back online.", "حُفظ على هذا الجهاز. ستتم المزامنة عند عودتك إلى الاتصال.", "اس ڈیوائس پر محفوظ ہو گیا۔ آن لائن ہونے پر ہم آہنگ ہو جائے گا۔"],
  ["No classes on this device yet.", "لا توجد فصول على هذا الجهاز بعد.", "اس ڈیوائس پر ابھی کوئی جماعت نہیں۔"],
  ["Connect once to keep a copy of your campus classes here.", "اتصل مرة واحدة للاحتفاظ بنسخة من فصول الحرم هنا.", "اپنے کیمپس کی جماعتوں کی نقل یہاں رکھنے کے لیے ایک بار جڑیں۔"],
  ["Edit {0}", "تعديل {0}", "{0} میں ترمیم"],
  ["Class name", "اسم الفصل", "جماعت کا نام"],
  ["Changed {0}", "تغيّر في {0}", "تبدیلی {0}"],
  ["A class name is required", "اسم الفصل مطلوب", "جماعت کا نام ضروری ہے"],
  ["The class changed again. Review the latest value.", "تغيّر الفصل مرة أخرى. راجع أحدث قيمة.", "جماعت دوبارہ بدل گئی۔ تازہ ترین قدر دیکھیں۔"],
  ["This class was changed after your edit was captured.", "تم تغيير هذا الفصل بعد حفظ تعديلك.", "آپ کی ترمیم محفوظ ہونے کے بعد یہ جماعت بدل دی گئی۔"],
  ["Only a class's name, section and capacity can be changed offline.", "يمكن تغيير اسم الفصل وشعبته وسعته فقط دون اتصال.", "آف لائن صرف جماعت کا نام، سیکشن اور گنجائش بدلی جا سکتی ہے۔"],
  ["This class is no longer available to you.", "لم يعد هذا الفصل متاحاً لك.", "یہ جماعت اب آپ کے لیے دستیاب نہیں۔"],
  ["Changes older than 3 days are not synced. Make the change again online.", "لا تتم مزامنة التغييرات الأقدم من 3 أيام. أجرِ التغيير مرة أخرى عبر الاتصال.", "3 دن سے پرانی تبدیلیاں ہم آہنگ نہیں ہوتیں۔ آن لائن دوبارہ تبدیلی کریں۔"],
];

export const arabicClassSyncUi: Record<string, string> = Object.fromEntries(classSyncUiEntries.map(([en, ar]) => [en, ar]));
export const urduClassSyncUi: Record<string, string> = Object.fromEntries(classSyncUiEntries.map(([en, , ur]) => [en, ur]));
