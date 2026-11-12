/**
 * Client-side enquiry search (SKAI-1822). The enquiries panel used to send `search` to
 * GET /api/admission-queries and then filter the reply again in the browser, so every keystroke
 * re-read every page of enquiries. The panel now loads the list once and applies this predicate,
 * which is the AND of both former filters, so the rows shown for a query do not change:
 *   - the API's clause: name/email contain the trimmed query ignoring case, or phone contains it as typed;
 *   - the panel's clause: name/email/phone contain the lower-cased query (untrimmed).
 */
export type SearchableEnquiry = { name?: string | null; phone?: string | null; email?: string | null };

export function matchesEnquirySearch(enquiry: SearchableEnquiry, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const name = enquiry.name ?? "";
  const phone = enquiry.phone ?? "";
  const email = enquiry.email ?? "";

  const lowerTrimmed = trimmed.toLowerCase();
  const serverMatch =
    name.toLowerCase().includes(lowerTrimmed) || phone.includes(trimmed) || email.toLowerCase().includes(lowerTrimmed);
  if (!serverMatch) return false;

  const lower = query.toLowerCase();
  return name.toLowerCase().includes(lower) || phone.includes(lower) || email.toLowerCase().includes(lower);
}
