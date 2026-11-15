import { ApiError } from "@/lib/api/scope";

// SKAI-2234: a bank account number is an IBAN (checked with mod-97; a Pakistani IBAN is 24 characters) or a plain
// account number of digits and hyphens. Lists show it masked; only staff who may edit accounts read it in full.
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const PLAIN = /^\d[\d-]{4,32}\d$/;

function ibanChecksumOk(iban: string) {
  const moved = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, letter => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of moved) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

export function parseBankAccountNumber(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError("Account number must be text", 400);
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!compact) return null;
  if (/^[A-Z]{2}/.test(compact)) {
    if (!IBAN.test(compact) || (compact.startsWith("PK") && compact.length !== 24) || !ibanChecksumOk(compact)) throw new ApiError("Enter a valid IBAN (for example PK36SCBL0000001123456702) or an account number of digits and hyphens.", 400);
    return compact;
  }
  if (!PLAIN.test(compact)) throw new ApiError("Enter a valid IBAN (for example PK36SCBL0000001123456702) or an account number of digits and hyphens.", 400);
  return compact;
}

export function maskBankAccountNumber(value: string | null | undefined) {
  return value ? `••••${value.slice(-4)}` : null;
}
