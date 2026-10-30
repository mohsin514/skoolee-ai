import { formatDateOnly, formatInstant, formatMoney, parseMoney, type LocalePackage } from "./package";
import { messages } from "./messages";
export const SAMPLE = { attendanceDate: "2027-04-01", birthday: "2015-01-01", invoiceId: "DEMO-014", future: "2027-04-01T00:30:00.000Z", historical: "2026-03-08T06:30:00.000Z" };
export function workflowSample(policy: LocalePackage) {
  const t = messages(policy.language);
  const amount = formatMoney(parseMoney("1234.567", policy.currency), policy);
  const attendance = formatDateOnly(SAMPLE.attendanceDate, policy);
  return { attendance, birthday: formatDateOnly(SAMPLE.birthday, policy), amount, invoiceId: SAMPLE.invoiceId, future: formatInstant(SAMPLE.future, policy), notification: `${t.attendance}: ${attendance} · ${t.invoice}: ${SAMPLE.invoiceId} · ${amount}`, report: `${t.report}: ${attendance}` };
}
