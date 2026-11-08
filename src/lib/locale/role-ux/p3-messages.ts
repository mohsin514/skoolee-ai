/**
 * P3 (spotlight tour, onboarding copy) — Arabic and Urdu for every new or changed EN UI key in P3 files.
 * Aggregated by P9 into arabicRoleUxUi / urduRoleUxUi (src/lib/locale/role-ux/index.ts).
 *
 * Tour step copy itself ships as [en, ar, ur] tuples in src/lib/onboarding/tours/*.ts, and LaunchGuide / register /
 * accept-invite keep their co-located copy objects; this file holds the strings read through useUiText().
 * AR/UR to be reviewed by a native reader.
 */
export const arabicP3Ui: Record<string, string> = {
  // TourCard (src/components/tour/TourCard.tsx)
  "Step {0} of {1}: {2}": "الخطوة {0} من {1}: {2}",
  "Step": "الخطوة",
  "Read more": "اقرأ المزيد",
  "Skip tour": "تخطَّ الجولة",
  "Try it": "جرّبها",
  "Back": "رجوع",
  "Next": "التالي",
  "Done": "تم",
  // Teacher onboarding ready panel (src/app/teacher-onboarding/page.tsx)
  "Show me around": "خذني في جولة",
  // TourProvider: a tour never starts over unsaved work
  "Save or discard your changes first, then start the tour.": "احفظ تغييراتك أو تجاهلها أولًا، ثم ابدأ الجولة.",
  // TourProvider: no tour during a scoped support session (§9.1)
  "Tours are paused during a support session.": "الجولات متوقفة أثناء جلسة الدعم.",
  // TourProvider: a requested tour that cannot start (access check failed or never ready)
  "The tour could not start. Try again from Help.": "تعذّر بدء الجولة. حاول مرة أخرى من «المساعدة».",
};

export const urduP3Ui: Record<string, string> = {
  "Step {0} of {1}: {2}": "مرحلہ {0} از {1}: {2}",
  "Step": "مرحلہ",
  "Read more": "مزید پڑھیں",
  "Skip tour": "تعارفی دورہ چھوڑیں",
  "Try it": "آزمائیں",
  "Back": "واپس",
  "Next": "اگلا",
  "Done": "مکمل",
  "Show me around": "مجھے تعارفی دورہ کرائیں",
  "Save or discard your changes first, then start the tour.": "پہلے اپنی تبدیلیاں محفوظ کریں یا ترک کریں، پھر تعارفی دورہ شروع کریں۔",
  "Tours are paused during a support session.": "سپورٹ سیشن کے دوران تعارفی دورے بند رہتے ہیں۔",
  "The tour could not start. Try again from Help.": "تعارفی دورہ شروع نہیں ہو سکا۔ «مدد» سے دوبارہ کوشش کریں۔",
};
