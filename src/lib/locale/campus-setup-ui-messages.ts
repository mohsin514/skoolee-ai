/** SKAI-113 campus setup copy: [English, Arabic, Urdu]. Reviewed catalogs win for shared words. */
export const campusSetupUiEntries: readonly (readonly [string, string, string])[] = [
  ["Active", "نشط", "فعال"],
  ["Paused", "متوقف مؤقتًا", "معطل"],
  ["Resumed", "استؤنف", "بحال"],
  ["Pause", "إيقاف مؤقت", "معطل کریں"],
  ["Resume", "استئناف", "بحال کریں"],
  ["Pause {0}?", "إيقاف {0} مؤقتًا؟", "{0} معطل کریں؟"],
  ["Resume {0}?", "استئناف {0}؟", "{0} بحال کریں؟"],
  ["Pause campus", "إيقاف الفرع مؤقتًا", "کیمپس معطل کریں"],
  ["Resume campus", "استئناف الفرع", "کیمپس بحال کریں"],
  ["Give a reason for pausing this campus.", "اذكر سبب إيقاف هذا الفرع مؤقتًا.", "اس کیمپس کو معطل کرنے کی وجہ لکھیں۔"],
  ["{0} resumed.", "استؤنف {0}.", "{0} بحال ہو گیا۔"],
  ["{0} paused. Its people and records are kept.", "أُوقف {0} مؤقتًا. يُحتفظ بأفراده وسجلاته.", "{0} معطل ہو گیا۔ اس کے افراد اور ریکارڈ محفوظ ہیں۔"],
  ["Could not change this campus's status.", "تعذّر تغيير حالة هذا الفرع.", "اس کیمپس کی حالت تبدیل نہیں ہو سکی۔"],
  ["The campus becomes active again and can take new staff invitations.", "يعود الفرع نشطًا ويمكنه استقبال دعوات موظفين جديدة.", "کیمپس دوبارہ فعال ہو جائے گا اور نئے عملے کی دعوتیں لے سکے گا۔"],
  ["The campus stays in every list and keeps its people and records, but takes no new staff invitations until you resume it.", "يبقى الفرع في كل القوائم ويحتفظ بأفراده وسجلاته، لكنه لا يستقبل دعوات موظفين جديدة حتى تستأنفه.", "کیمپس ہر فہرست میں رہے گا اور اس کے افراد اور ریکارڈ محفوظ رہیں گے، مگر بحال کرنے تک نئے عملے کی دعوتیں نہیں لے گا۔"],
  ["Only the group admin can pause or resume a campus.", "يمكن لمسؤول المجموعة فقط إيقاف الفرع أو استئنافه.", "صرف گروپ ایڈمن کیمپس معطل یا بحال کر سکتا ہے۔"],
  ["Restore this campus before changing its status.", "استعد هذا الفرع قبل تغيير حالته.", "حالت بدلنے سے پہلے اس کیمپس کو بحال کریں۔"],
  ["Restore this campus before editing it.", "استعد هذا الفرع قبل تعديله.", "ترمیم سے پہلے اس کیمپس کو بحال کریں۔"],
  ["This campus is archived. Restore it before inviting staff.", "هذا الفرع مؤرشف. استعده قبل دعوة الموظفين.", "یہ کیمپس محفوظ شدہ ہے۔ عملے کو مدعو کرنے سے پہلے اسے بحال کریں۔"],
  ["This campus is paused. Resume it before inviting staff.", "هذا الفرع متوقف مؤقتًا. استأنفه قبل دعوة الموظفين.", "یہ کیمپس معطل ہے۔ عملے کو مدعو کرنے سے پہلے اسے بحال کریں۔"],
  ["Use 3 to 20 letters, digits or dashes for the campus ID, like BR-NORTH.", "استخدم من 3 إلى 20 حرفًا أو رقمًا أو شرطة لمعرّف الفرع، مثل BR-NORTH.", "کیمپس آئی ڈی کے لیے 3 سے 20 حروف، ہندسے یا ڈیش استعمال کریں، جیسے BR-NORTH۔"],
];
export const arabicCampusSetupUi: Record<string, string> = Object.fromEntries(campusSetupUiEntries.map(([key, ar]) => [key, ar]));
export const urduCampusSetupUi: Record<string, string> = Object.fromEntries(campusSetupUiEntries.map(([key, , ur]) => [key, ur]));
