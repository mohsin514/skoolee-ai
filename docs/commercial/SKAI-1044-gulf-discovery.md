# SKAI-1044 [D1-04]: Gulf discovery script and SAR/AED quote template

**Status: draft. No Gulf price is published, and none may be published.** Source: D1 ([d1-business-model.md](../product-review-2026-10/d1-business-model.md), approved). Gulf (option B) runs as parallel discovery with no build spend until two Gulf schools agree to a paid pilot. Exam Studio is quoted as a per-campus annual module in SAR (KSA) or AED (Dubai), and only after a discovery call. Market context is in [d2-market-research.md](../product-review-2026-10/d2-market-research.md); the bounded scope is in [SKAI-1017](SKAI-1017-bounded-pilot-offer.md).

## 1. Discovery call script (30–40 minutes)

Who should be on the call: the principal or head of secondary, plus whoever approves the budget and data processing (in KSA: principal + budget + processing approver; in Dubai: head of secondary + bursar/IT or group procurement).

1. **Context (5 min).** Introduce Skoolee as a bounded exam workflow that runs alongside your existing systems. It is not an ERP replacement and has no Noor, Madrasati or KHDA connector.
2. **Current exam workflow.** How are papers authored, moderated, printed and marked today? Which curriculum and grades? How many campuses and students per grade?
3. **Pain and cost.** Where do staff hours go? What breaks at exam time? What do you use today, and what does it cost? (Record the answer as stated; do not prompt with numbers.)
4. **Systems.** Which SIS/LMS do you use (e.g. Noor, Madrasati, Classera, other)? Import/export only: is CSV acceptable?
5. **Data and approval.** Who approves processing student data? What residency or hosting requirements apply? Data cannot be processed until the SKAI-1016 trust gate passes for this market.
6. **Language.** Arabic and English needs for staff, students and parents.
7. **Buying process.** Budget cycle, approvers, whether procurement uses a vendor registration, and the timeline to a decision.
8. **Willingness to pay (SKAI-894).** "If this solved the problem you described for one grade on one campus for a term, would you pay for a pilot?" Record yes / no / undecided. **Do not state a price on the call.**
9. **Next step.** Agree whether a written quote should follow, and who receives it.

Record the call through the pilot readiness evidence flow (`DEMO_INTEREST` / `UNDECIDED` / `DECLINED_PAYMENT`). Never move a stage forward on stated intent alone (`classifyStage()`).

## 2. Quote template (private, per school, sent only after discovery)

| Field | Value |
| --- | --- |
| Quote no. / version / date | |
| School, city, market | KSA (SAR) / Dubai (AED) |
| Scope | Exam Studio module: up to 2 campuses, one grade/term, one approved pack (SKAI-1017) |
| Term | annual per campus (pilot term: one term) |
| Price per campus per year | **[SAR / AED amount: FOUNDER-SET per quote]** |
| Pilot price | **[FOUNDER-SET]** |
| VAT | **[rate and treatment: finance/legal to confirm]** |
| Payment | bank transfer against invoice. No SAR/AED card provider is integrated (`Unavailable`, SKAI-1017 §3) |
| Validity | **[days: FOUNDER-SET]** |
| Exclusions | ERP replacement, government-platform connectors, certification claims |
| Data processing | per SKAI-1016 trust review for the market |

There is no exchange conversion from PKR: the catalogue is PKR only (`regionalPriceDisclosure`). A Gulf amount is a separate founder decision for each quote.

## 3. Gate

Build spend for the Gulf starts only after two Gulf schools reach `PAID_COMMITMENT` (signed agreement plus settlement reference).

## Human-only

Booking calls, running them, setting every price, VAT advice, legal review and signature.
