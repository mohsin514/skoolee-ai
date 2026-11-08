import type { TourDef } from "./types";
import { helpStep } from "./resolve";

/** Platform operations (APP_OWNER). SPEC §9.7 `owner` v1. */
export const ownerTour: TourDef = {
  id: "owner", version: 1, console: "owner",
  steps: [
    {
      id: "schools", anchor: "owner.schools.table", view: "schools",
      title: ["Schools", "المدارس", "اسکول"],
      body: [
        "Every school on the platform, with its plan and status.",
        "كل مدرسة على المنصة مع خطتها وحالتها.",
        "پلیٹ فارم کا ہر اسکول، اس کے پلان اور حیثیت کے ساتھ۔",
      ],
    },
    {
      id: "subscription-requests", anchor: "shell.nav.subscription-requests",
      title: ["Subscription requests", "طلبات الاشتراك", "سبسکرپشن کی درخواستیں"],
      body: [
        "Plan changes, cancellations and refunds that schools request, waiting for your review.",
        "تغييرات الخطط والإلغاءات والمبالغ المستردة التي تطلبها المدارس، بانتظار مراجعتك.",
        "اسکولوں کی جانب سے پلان کی تبدیلی، منسوخی اور رقم کی واپسی کی درخواستیں، آپ کے جائزے کی منتظر۔",
      ],
    },
    {
      id: "pricing", anchor: "shell.nav.pricing",
      title: ["Pricing", "الأسعار", "قیمتیں"],
      body: [
        "Default and per-school prices.",
        "الأسعار الافتراضية والأسعار الخاصة بكل مدرسة.",
        "طے شدہ قیمتیں اور ہر اسکول کی الگ قیمتیں۔",
      ],
    },
    {
      id: "gateways", anchor: "shell.nav.gateways",
      title: ["Payment gateways", "بوابات الدفع", "ادائیگی کے گیٹ وے"],
      body: [
        "Stripe, SafePay and the bank details schools pay into.",
        "Stripe وSafePay وبيانات الحساب البنكي الذي تدفع إليه المدارس.",
        "Stripe، SafePay اور وہ بینک تفصیلات جن میں اسکول ادائیگی کرتے ہیں۔",
      ],
    },
    {
      id: "support", anchor: "shell.nav.support",
      title: ["Support access", "وصول الدعم", "سپورٹ رسائی"],
      body: [
        "Support access works only within a grant the school approves.",
        "لا يعمل وصول الدعم إلا ضمن إذن توافق عليه المدرسة.",
        "سپورٹ رسائی صرف اسی اجازت کے اندر کام کرتی ہے جو اسکول منظور کرے۔",
      ],
    },
    {
      id: "audit", anchor: "shell.nav.audit",
      title: ["Audit log", "سجل التدقيق", "آڈٹ لاگ"],
      body: [
        "Every platform action, who did it and when.",
        "كل إجراء على المنصة، ومن قام به ومتى.",
        "پلیٹ فارم کا ہر عمل، کس نے کیا اور کب۔",
      ],
    },
    helpStep([
      "Replay this tour from Help at any time.",
      "أعد هذه الجولة من «المساعدة» في أي وقت.",
      "«مدد» سے یہ تعارفی دورہ کسی بھی وقت دوبارہ دیکھیں۔",
    ]),
  ],
};
