/** SKAI-1399 load-failure copy for portfolio, pickup and activities panels: [English, Arabic, Urdu]. */
export const portfolioLoadUiEntries: readonly (readonly [string, string, string])[] = [
  ["The learners could not be loaded.", "تعذر تحميل المتعلمين.", "طلبہ کی فہرست لوڈ نہیں ہو سکی۔"],
  ["Shared progress could not be loaded.", "تعذر تحميل التقدم المشترك.", "مشترکہ پیش رفت لوڈ نہیں ہو سکی۔"],
  ["Pickup authorizations could not be loaded", "تعذر تحميل تصاريح الاستلام", "لینے کی اجازتیں لوڈ نہیں ہو سکیں"],
  ["Clubs, sports and trips could not be loaded", "تعذر تحميل الأندية والرياضة والرحلات", "کلبز، کھیل اور دورے لوڈ نہیں ہو سکے"],
];

export const arabicPortfolioLoadUi: Record<string, string> = Object.fromEntries(portfolioLoadUiEntries.map(([en, ar]) => [en, ar]));
export const urduPortfolioLoadUi: Record<string, string> = Object.fromEntries(portfolioLoadUiEntries.map(([en, , ur]) => [en, ur]));
