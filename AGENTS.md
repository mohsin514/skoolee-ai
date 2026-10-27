<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:pr-rules -->
# PR rules for the coding agent

Full copy also lives at `AGENT-PR-RULES.md` in the repo root.

1. **Pick work correctly.** Take the highest unassigned ticket in the active SKAI sprint that has no open "is blocked by" link. One ticket = one branch = one PR. Never use Linear (SKO-) keys for new work.
2. **Name things with the key.** Branch `SKAI-123-short-description`; PR title `SKAI-123 Short description`; every commit message starts with `SKAI-123`.
3. **Verify before you build.** For VERIFY tickets, test the existing behaviour first and fix only demonstrated gaps. Do not refactor unrelated code.
4. **Keep PRs small:** 400 changed lines or fewer (lockfiles, translations and generated files excluded). Over 1000 is blocked.
5. **Run these locally before pushing:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, plus `npm run test:isolation`, `npm run i18n:check`, `npm run size:check` and `npm run test:e2e:smoke` when relevant.
6. **Fill in every section of the PR template.** For UI changes, attach screenshots or a recording (EN and AR/right-to-left), or write "No visual change" and why.
7. **Never weaken the pipeline.** Do not skip or disable tests or checks, add `.only`, lower thresholds, or add `'unsafe-inline'` / `'unsafe-eval'` to the content security policy.
8. **No secrets or real data.** No secrets, tokens, `.env` files or real student/guardian data in code, fixtures, logs, screenshots or tickets. Use the synthetic QA schools (QA-01).
9. **Multi-tenant safety.** Any data-access change keeps or adds tests for two schools, two campuses and denied roles.
10. **Sensitive areas need a human.** Changes to auth/roles, payments, messaging (WhatsApp, email, SMS, OTP), the security policy, migrations or AI need code-owner review. For AI: keep features behind a flag (off in production until AI-05 passes); never change model, prompt or gateway versions without re-running the AI-05 evaluation, and tick the AI-05 box in the PR.
11. **Migrations** must be backwards-compatible; split destructive changes into two releases.
12. **Statuses.** Opening a PR moves the ticket to In Review. After the dev deploy it moves to Deployed to Dev. Never move a ticket to Done — QA does that, after checking the evidence the ticket asks for.
13. **When a check fails,** fix the cause and push again. Never bypass a required check or merge without the "PR hygiene" and "PR gate" checks green and a human approval.
<!-- END:pr-rules -->
