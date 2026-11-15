import test from "node:test";
import assert from "node:assert/strict";
import { renderLocaleReceipt, repairGlyphCodePoints } from "../../src/lib/locale/invoice-pdf";
import { defaultLocale } from "../../src/lib/locale/package";

const receipt = (language: "en" | "ar" | "ur", note: string) => renderLocaleReceipt({
  receiptNo: "RCP-2096", paymentDate: new Date("2026-11-15T00:00:00Z"), paymentMethod: "cash", referenceNumber: null,
  amount: 100, fineAmount: 0, discountAmount: 0, note, campus: { name: "Main Campus" },
  student: { fullName: "Ibrahim Abbasi", rollNo: "1", class: { name: "5", section: "A" } },
  invoice: { invoiceNumber: "INV-2026-00111", currency: "PKR", localeSnapshot: { ...defaultLocale, language }, totalAmount: 100, totalAmountPaid: 100, balanceDue: 0 },
  recorder: { fullName: "Accountant" },
});

test("SKAI-2096: Arabic receipt notes render after earlier receipts warmed the glyph cache", async () => {
  // In one process, "ظة" then "دفعة" used to throw TypeError (reading 'id') in textkit reorderLine.
  for (const [language, note] of [["ar", "ظة"], ["ar", "دفعة"], ["ar", "ملاحظة الدفع S4T08"], ["ur", "ملاحظة عربية S4T08 اردو نوٹ"], ["ar", "دفعة نهائية S4T08"], ["en", "حظة"]] as const) {
    const pdf = await receipt(language, note);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", `${language} ${note}`);
  }
});

test("SKAI-2096: a glyph first cached without code points takes them from a later lookup", () => {
  const cache = new Map<number, { codePoints: number[] }>();
  const font = { getGlyph: (id: number, codePoints: number[] = []) => { if (!cache.has(id)) cache.set(id, { codePoints }); return cache.get(id)!; } };
  repairGlyphCodePoints(font);
  font.getGlyph(309);
  assert.deepEqual(font.getGlyph(309, [1593]).codePoints, [1593]);
  assert.deepEqual(font.getGlyph(309, [9999]).codePoints, [1593]);
});
