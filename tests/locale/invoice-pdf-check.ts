import { writeFile } from "node:fs/promises";
import { renderLocaleInvoice } from "../../src/lib/locale/invoice-pdf";
import { defaultLocale } from "../../src/lib/locale/package";
async function main() {
 const pdf = await renderLocaleInvoice({ invoiceNumber: "DEMO-014", currency: "KWD", localeSnapshot: { ...defaultLocale, language: "ar", numberingSystem: "arab", timezone: "Asia/Riyadh" }, invoiceDate: new Date("2027-04-01T00:00:00Z"), dueDate: new Date("2027-04-10T00:00:00Z"), campus: { name: "مدرسة الاختبار العربية" }, student: { fullName: "أحمد محمد", rollNo: "AR-014", class: { name: "الصف الخامس", section: "A" } }, monthlyFee: 1234567, oneTimeFees: 0, subtotal: 1234567, discountAmount: 0, lateFeeAmount: 0, taxAmount: 0, totalAmount: 1234567, totalAmountPaid: 0, balanceDue: 1234567 });
 await writeFile("/tmp/sko201-evidence/actual-invoice-ar.pdf", pdf);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
