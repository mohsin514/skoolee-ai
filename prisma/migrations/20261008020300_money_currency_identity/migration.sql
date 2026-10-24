-- Existing values were explicitly denominated in paisa. Preserve their identity.
ALTER TABLE fee_structures ADD COLUMN currency TEXT NOT NULL DEFAULT 'PKR';
ALTER TABLE fee_groups ADD COLUMN currency TEXT NOT NULL DEFAULT 'PKR';
ALTER TABLE fee_discounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'PKR';
ALTER TABLE fee_carry_forwards ADD COLUMN currency TEXT NOT NULL DEFAULT 'PKR';
ALTER TABLE ledger_entries ADD COLUMN currency TEXT NOT NULL DEFAULT 'PKR';
-- Currency identity is immutable after creation; change defaults for NEW records only.
CREATE FUNCTION preserve_money_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.currency IS DISTINCT FROM OLD.currency THEN
  RAISE EXCEPTION 'Existing monetary currency cannot be changed';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_currency_immutable BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION preserve_money_currency();
CREATE TRIGGER fee_structure_currency_immutable BEFORE UPDATE ON fee_structures FOR EACH ROW EXECUTE FUNCTION preserve_money_currency();
CREATE TRIGGER fee_group_currency_immutable BEFORE UPDATE ON fee_groups FOR EACH ROW EXECUTE FUNCTION preserve_money_currency();
CREATE TRIGGER ledger_currency_immutable BEFORE UPDATE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION preserve_money_currency();
