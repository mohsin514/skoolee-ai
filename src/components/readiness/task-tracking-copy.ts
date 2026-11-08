type TaskTrackingCopy = {
  owner: string; unassigned: string; due: string; overdue: string; start: string; remind: string; reminded: string; history: string;
  actions: Record<string, string>;
};

const en: TaskTrackingCopy = {
  owner: "Owner", unassigned: "Unassigned", due: "Due", overdue: "Overdue", start: "Start", remind: "Send reminder", reminded: "Reminded", history: "History",
  actions: { create: "Added", assign: "Owner changed", schedule: "Due date changed", remind: "Reminder sent", "status:OPEN": "Reopened", "status:IN_PROGRESS": "Started", "status:DONE": "Marked done", "status:DEFERRED": "Moved to later" },
};

const ar: TaskTrackingCopy = {
  owner: "المسؤول", unassigned: "غير مُسند", due: "تاريخ الاستحقاق", overdue: "متأخرة", start: "بدء", remind: "إرسال تذكير", reminded: "أُرسل تذكير", history: "السجل",
  actions: { create: "أُضيفت", assign: "تغيّر المسؤول", schedule: "تغيّر تاريخ الاستحقاق", remind: "أُرسل تذكير", "status:OPEN": "أُعيد فتحها", "status:IN_PROGRESS": "بدأت", "status:DONE": "أُنجزت", "status:DEFERRED": "أُجّلت" },
};

const ur: TaskTrackingCopy = {
  owner: "ذمہ دار", unassigned: "غیر تفویض", due: "آخری تاریخ", overdue: "تاخیر", start: "شروع کریں", remind: "یاد دہانی بھیجیں", reminded: "یاد دہانی بھیجی", history: "تاریخچہ",
  actions: { create: "شامل کیا", assign: "ذمہ دار تبدیل", schedule: "آخری تاریخ تبدیل", remind: "یاد دہانی بھیجی", "status:OPEN": "دوبارہ کھولا", "status:IN_PROGRESS": "شروع کیا", "status:DONE": "مکمل کیا", "status:DEFERRED": "بعد کے لیے" },
};

export function getTaskTrackingCopy(language: string): TaskTrackingCopy {
  return language === "ar" ? ar : language === "ur" ? ur : en;
}
