-- Legacy bank balances were recorded in paisa. Preserve those units.
ALTER TABLE bank_accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'PKR';
CREATE TRIGGER bank_currency_immutable BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION preserve_money_currency();
