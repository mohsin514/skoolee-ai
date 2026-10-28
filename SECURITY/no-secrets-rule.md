# No Secrets in Tickets or Docs — and No Seed Accounts on Internet-Facing Environments

**Requirement:** PRD v2.0 · NFR-SEC-09 (P0) — *"No secrets in tickets or docs; seed
accounts never on internet-facing environments. Rotate the credentials found in SCRUM-6."*
**Tracked by:** SKAI-947 (parent SKAI-1, Gate G0).

This is a binding project rule. It applies to every contributor and to every
automated agent working in this repository.

## 1. Never put a secret in a ticket, comment, doc, PR or commit

A "secret" is any value that grants access or proves identity:

- passwords and passphrases (including demo / seed passwords);
- API tokens, access keys, client secrets, webhook signing secrets;
- database URLs or connection strings that contain a password;
- private keys, session cookies, presigned URLs, OTP seeds.

Do **not** paste these into:

- Jira tickets, descriptions or comments (this is exactly what SCRUM-6 did);
- Confluence pages, READMEs, design docs or runbooks;
- commit messages, PR titles/descriptions, or code comments;
- chat messages, screenshots or logs attached as evidence.

**Instead:** reference the secret by name and location — e.g. *"owner password is in
the `SEED_OWNER_PASSWORD` env var / the team password manager"* — never its value.
When evidence needs a login, use the synthetic pilot school and blur anything
sensitive in screenshots.

## 2. Credentials live in the environment, not the codebase

- Seed and app credentials are read from environment variables
  (`SEED_OWNER_PASSWORD`, `SEED_DEMO_PASSWORD`, `DATABASE_URL`, …).
- `.env*` files holding real values are git-ignored. Only `.env.*.example`
  templates — with placeholder values — are committed.
- The seed script (`prisma/seed.ts`) no longer hardcodes any owner password and
  no longer prints passwords to the console (see `prisma/seed-guard.ts`).

## 3. Seed accounts never exist on internet-facing environments

Demo/seed accounts (`*@demo.com`, the demo owner, etc.) are for **local
development only**. They must never be reachable on `dev.skooleeai.com`,
`app.skooleeai.com`, or any hosted environment.

This is enforced in code by `prisma/seed-guard.ts`, which **fails closed**:
`npm run db:seed` aborts before writing anything if

- `APP_ENV` / `VERCEL_ENV` / `NODE_ENV` names a `production`, `staging`, `qa`
  or `preview` environment; or
- the app host is an internet-facing `skooleeai.com` host; or
- the database host looks hosted (Supabase, RDS, Neon, …) and
  `ALLOW_HOSTED_SEED=1` was not explicitly set; or
- the database host is not a recognised local host.

## 4. If a secret leaks

1. **Rotate it immediately** — change the credential in the live system; the
   leaked value is now untrusted forever.
2. **Purge it** from wherever it was pasted (ticket/doc/commit). For git history,
   use history-rewriting tools (e.g. `git filter-repo`) and force-rotate.
3. **Record the rotation** with *who* and *when* — **never the value**.

## 5. Review gate

Reviewers must reject any PR, ticket update or doc that contains a literal
secret. Treat a secret in a diff as a blocking finding, not a nit.

---
*Rule adopted under SKAI-947 / NFR-SEC-09. Source of truth: PRD v2.0.*
