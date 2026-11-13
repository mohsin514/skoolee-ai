# Daily collection and close: decision record (SKAI-816)

Status: **open — awaiting pilot accountant and code-owner sign-off.**
No code for a close record, period lock or close checklist ships until every question below has an agreed answer.

## Why this is blocked

SKAI-816 asks for one accountant workspace per school/campus business day (confirmed collections, unmatched items, exceptions with owner and age, a close checklist). The first requirement is to agree the close semantics with a pilot accountant. Those answers decide the data model (a close record, and possibly a lock on ledger postings), and this is a payments area that needs code-owner review.

## Existing engines to reuse (no parallel write paths)

| Concern | Module |
| --- | --- |
| Idempotent collection and receipt | `src/lib/fees/collect-command.ts`, `src/lib/fees/receipt.ts` |
| Bank matching / unmatched deposits | `src/lib/fees/bank-reconciliation.ts` |
| Refunds, credit notes, waivers, approvals | `src/lib/fees/adjustments-service.ts` |
| Ledger totals, manual entries, reversals | `src/lib/fees/ledger-service.ts`, `src/lib/fees/journal-balance.ts` |

## Questions to answer with the pilot accountant

1. **Business day boundary.** Which timezone (school or campus)? Does the day end at midnight or at a cut-off (for example 17:00)? How are online payments that settle after the cut-off dated?
2. **Channels.** Which channels close separately: cash drawer, bank transfer, card/online gateway, cheque? Is a cash count (denominations) recorded?
3. **Currency.** One currency per campus, or several? If several, totals stay per currency; is any reviewed conversion policy needed at all for the pilot? (Default: no conversion, never sum across currencies.)
4. **Period lock.** After close, are postings to that day blocked, allowed with approval, or allowed and flagged? Who can reopen a closed day?
5. **Unresolved items.** Can a day close with open exceptions? If yes, which ones, carried forward with what explanation and owner?
6. **Exception owners.** Which role owns each exception type (unmatched deposit, pending refund approval, disputed payment, reversed receipt)? What age triggers escalation?
7. **Export.** Which format and fields form the agreed daily record (PDF, CSV, both)? Who receives it?
8. **Scope.** Platform subscription income is excluded from school collections (confirmed by the card). Are fines, transport and hostel fees in scope?

## Proposed delivery once agreed (each under 400 lines)

1. Read-only day view API + page: settled / pending / reversed / disputed / unmatched per currency, opening, movements, closing, with links to source entries. Campus-scoped; tests for two schools, two campuses and a denied role.
2. Exception list: amount, source, responsible role, age, safe next action linking to the existing review flows.
3. Close checklist + close record (backwards-compatible migration), carry-forward of unresolved items, and the lock behaviour chosen in question 4.

## Sign-off

| Role | Name | Date | Decision |
| --- | --- | --- | --- |
| Pilot accountant | | | |
| Finance code owner | | | |
| Product owner | | | |
