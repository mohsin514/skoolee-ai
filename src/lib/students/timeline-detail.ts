// SKAI-65: fee payments are stored on the timeline as "<CURRENCY> <minor> minor units" (src/lib/fees/payment.ts).
// Staff read that through the school's money format instead of the raw storage shape.
const STORED_AMOUNT = /^([A-Z]{3}) (\d{1,15}) minor units$/;

export function readableTimelineDetail(detail: string, money: (minor: number, currency: string) => string): string {
  const match = STORED_AMOUNT.exec(detail.trim());
  return match ? money(Number(match[2]), match[1]) : detail;
}
