# Email domain authentication (SKAI-950, SKAI-983, SKAI-984)

Status: findings and DNS change plan. DNS changes must be made by the domain owner in the
Hostinger DNS console (nameservers `atlas.dns-parking.com` / `hyperion.dns-parking.com`).
Engineering cannot make them from the repo.

## 1. What actually sends app email (SKAI-983)

- Code: `src/lib/email.ts` -> `src/lib/email/smtp.ts` (own SMTP client, React Email templates).
  No Resend, SendGrid, SES, Postmark or Mailgun SDK is used.
- Config keys: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
  `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `EMAIL_DEV_MODE` (fallbacks `EMAIL_FROM_ADDRESS`,
  `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`).
- Code defaults: host `smtp.gmail.com`, port 465, From `mohsin@skooleeai.com`.
- Local/dev `.env`: `SMTP_HOST=smtp.gmail.com`, and `SMTP_FROM_EMAIL` is a **@gmail.com** address.
  The production values were not visible here; confirm them in the deploy secrets.

**Root cause of spam placement:** mail is relayed through Gmail SMTP (a personal Google account),
while the domain's SPF authorises only Hostinger and no DKIM key exists for `skooleeai.com`.
If From is `@skooleeai.com`, Gmail's servers are not in SPF and Gmail signs DKIM as `gmail.com`,
so neither SPF nor DKIM aligns -> DMARC fails. If From is `@gmail.com`, the mail is "authenticated"
only as a consumer Gmail account, with tight sending limits and no domain reputation.

Other From addresses in code: `noreply@skoolee.ai`, `sales@skoolee.ai`, `support@skoolee.ai`.
`skoolee.ai` has **no** DNS records at all (no MX, TXT, DMARC); those addresses cannot receive or
authenticate and must be changed to `@skooleeai.com` (or the domain must be set up).

## 2. Current DNS (dig, 2026-10-29)

| Record | skooleeai.com | skoolee.ai |
|---|---|---|
| MX | `5 mx1.hostinger.com`, `10 mx2.hostinger.com` | none |
| SPF | `v=spf1 include:_spf.mail.hostinger.com ~all` | none |
| DMARC (`_dmarc`) | `v=DMARC1; p=none` (no `rua`) | none |
| DKIM | none at resend, default, hostingermail, hostingermail1/2, s1, s2, google, selector1/2, dkim, mail, k1 | none |

## 3. Decision: pick one authenticated sender

Recommended (no new vendor): **Hostinger SMTP with a domain mailbox**, since MX and SPF are already Hostinger.
- `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`
- `SMTP_USER` / `SMTP_FROM_EMAIL=noreply@skooleeai.com` (create the mailbox in hPanel)
- Limitation: mailbox-provider rate limits; for higher volume use a transactional provider
  (Resend / Amazon SES / Postmark) and add its SPF include and DKIM records exactly as its dashboard shows.

Do **not** keep Gmail SMTP for production. (If the team insists on Google, the sender must be a
Google Workspace account on `skooleeai.com` with Workspace DKIM enabled, plus `include:_spf.google.com`.)

## 4. Exact DNS records (domain owner, Hostinger DNS zone for skooleeai.com)

1. **SPF** (one TXT at `@`, replace the existing one; never publish two SPF records):
   - Hostinger only: keep `v=spf1 include:_spf.mail.hostinger.com ~all`
   - If a transactional provider is added, merge its include, e.g. Resend (uses a subdomain):
     TXT `send` = `v=spf1 include:amazonses.com ~all` and MX `send` = `10 feedback-smtp.<region>.amazonses.com`
     (copy the exact values from the provider dashboard).
2. **DKIM**:
   - Hostinger: hPanel -> Emails -> skooleeai.com -> DNS/Authentication -> enable DKIM. It publishes
     CNAMEs `hostingermail-a._domainkey`, `hostingermail-b._domainkey`, `hostingermail-c._domainkey`
     pointing at Hostinger's key hosts. Use the exact targets hPanel shows.
   - Resend instead: TXT `resend._domainkey` = `p=MIIGf...` (key from Resend dashboard).
3. **DMARC** (TXT at `_dmarc`), staged:
   - Stage 0 (now, add reporting): `v=DMARC1; p=none; rua=mailto:dmarc@skooleeai.com; fo=1; adkim=r; aspf=r`
   - Stage 1 (after 7+ days of reports showing aligned pass for all legitimate sources):
     `v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@skooleeai.com; fo=1` then `pct=100`.
   - Stage 2 (after 2-4 clean weeks at quarantine 100): `v=DMARC1; p=reject; rua=mailto:dmarc@skooleeai.com; fo=1`.
   - Create the `dmarc@skooleeai.com` mailbox (or use a free report parser such as dmarcian / Postmark DMARC).
4. **skoolee.ai**: either replace those addresses in code with `@skooleeai.com`, or (if kept) publish
   MX + SPF + DKIM + DMARC for it too. Until then, add `v=spf1 -all` and `v=DMARC1; p=reject` to stop spoofing.

Keep sales@ and support@ working (INT-EMAIL-01): before moving to quarantine, confirm every service that
sends as `@skooleeai.com` (Hostinger mailboxes, app SMTP, any CRM/marketing tool) appears as aligned-pass in reports.

## 5. Verification and seed test (SKAI-984)

1. `dig +short TXT skooleeai.com`, `dig +short TXT _dmarc.skooleeai.com`,
   `dig +short CNAME hostingermail-a._domainkey.skooleeai.com` -> records present. Screenshot the DNS console.
2. Update deploy secrets (`SMTP_*`) for dev, restart, and confirm `EMAIL_DEV_MODE` is not `true`.
3. On dev.skooleeai.com, as an admin of the synthetic pilot school, send invites to fresh seed inboxes:
   2 x Gmail, 2 x Outlook.com/Hotmail (optionally Yahoo). Also run one send to mail-tester.com (target >= 9/10).
4. In each inbox: confirm Inbox (not Spam/Junk). Gmail "Show original" must show `SPF: PASS`, `DKIM: PASS with domain skooleeai.com`,
   `DMARC: PASS`. Outlook: message headers `Authentication-Results` with `dmarc=pass`, `dkim=pass header.d=skooleeai.com`.
5. After 7 days, attach a DMARC aggregate report excerpt showing pass; then apply Stage 1, re-run step 3, and attach evidence.
6. Repeat on production for L4.

Rollback: restore the previous TXT values; DMARC can be dropped back to `p=none` instantly (TTL permitting).
