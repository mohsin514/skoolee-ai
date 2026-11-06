/**
 * SKAI-561: the lending desk's availability tiles. A returned copy kept on the hold shelf for a READY reservation is
 * neither on the shelf (copiesAvailable) nor on loan, so it is counted once, as "ready to collect".
 */
export function deskPulse(books: { copiesTotal: number; copiesAvailable: number }[], reservations: { status: string }[]) {
  const total = books.reduce((sum, b) => sum + b.copiesTotal, 0);
  const shelf = books.reduce((sum, b) => sum + b.copiesAvailable, 0);
  const ready = reservations.filter((r) => r.status === "READY").length;
  return { shelf, onLoan: Math.max(0, total - shelf - ready), ready };
}
