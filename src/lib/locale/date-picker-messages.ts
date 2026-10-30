import type { DatePickerMessages } from "@/components/ui/date-picker";
import type { Language } from "./package";
export const datePickerMessages: Record<Language, Partial<DatePickerMessages>> = {
 en: {},
 ar: { openCalendar: (field) => `اختر ${field}`, dialogTitle: "اختيار التاريخ", title: "اختر تاريخًا", close: "إغلاق التقويم", selected: "التاريخ المحدد", unselected: "لم يُحدّد تاريخ", chooseDay: "اختر يومًا أدناه", previousMonth: "الشهر السابق", nextMonth: "الشهر القادم", days: "أيام الشهر", today: "اليوم", cancel: "إلغاء", keyboardHelp: "استخدم الأسهم للتنقل بين الأيام، وHome وEnd داخل الأسبوع، وPage Up وPage Down لتغيير الشهر. اضغط Shift لتغيير العام." },
 ur: { openCalendar: (field) => `${field} منتخب کریں`, dialogTitle: "تاریخ کا انتخاب", title: "تاریخ منتخب کریں", close: "تقویم بند کریں", selected: "منتخب تاریخ", unselected: "تاریخ منتخب نہیں ہوئی", chooseDay: "نیچے دن منتخب کریں", previousMonth: "پچھلا مہینہ", nextMonth: "اگلا مہینہ", days: "مہینے کے دن", today: "آج", cancel: "منسوخ کریں", keyboardHelp: "دن بدلنے کے لیے تیر، ہفتے کے اندر Home اور End، اور مہینہ بدلنے کے لیے Page Up اور Page Down استعمال کریں۔ سال بدلنے کے لیے Shift دبائیں۔" },
};
