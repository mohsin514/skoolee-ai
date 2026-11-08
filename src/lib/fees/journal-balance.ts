/**
 * SKAI-1313: a journal groups the lines of one accounting event. Its debits and credits must
 * be equal before anything is written, so an unbalanced event cannot reach the ledger.
 * Amounts are whole minor units; a line is never zero or negative (a reversal swaps its sides).
 */
export type JournalSide = "DEBIT" | "CREDIT";

export interface JournalLine {
  accountId: string;
  side: JournalSide;
  amount: number;
}

export class UnbalancedJournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnbalancedJournalError";
  }
}

export function journalTotals(lines: readonly JournalLine[]) {
  let debits = 0;
  let credits = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.amount) || line.amount <= 0) throw new UnbalancedJournalError("Each journal line needs a positive whole amount.");
    if (line.side === "DEBIT") debits += line.amount;
    else credits += line.amount;
  }
  return { debits, credits };
}

/** Throws unless the journal has at least two lines, uses both sides, and its debits equal its credits. */
export function assertBalancedJournal(lines: readonly JournalLine[]) {
  if (lines.length < 2) throw new UnbalancedJournalError("A journal needs at least two lines.");
  const { debits, credits } = journalTotals(lines);
  if (debits === 0 || credits === 0) throw new UnbalancedJournalError("A journal needs both a debit and a credit line.");
  if (debits !== credits) throw new UnbalancedJournalError(`Journal does not balance: debits ${debits}, credits ${credits}.`);
}
