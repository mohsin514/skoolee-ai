-- Reconcile invoices whose recorded payment exceeds what the invoice can absorb.
--
-- recordPayment() used to store the full sum of payments in total_amount_paid
-- while flooring balance_due at 0, and separately wrote the excess into
-- fee_carry_forwards as credit. The overpayment was therefore counted twice,
-- breaking `total_amount_paid + balance_due = total_amount`. The campus fee
-- summary sums those columns directly, so it reported collected > receivable
-- and a collection rate above 100%.
--
-- The write path is fixed in src/lib/fees/payment.ts. This repairs existing rows.
-- No money is lost: the payments table still holds the full amount received, and
-- the surplus already exists as a fee_carry_forwards credit.

UPDATE "invoices"
   SET "total_amount_paid" = "total_amount"
 WHERE "total_amount_paid" > "total_amount";
