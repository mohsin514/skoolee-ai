## Jira ticket
SKAI-   <!-- one ticket per PR, e.g. SKAI-123 — https://skooleeai.atlassian.net/browse/SKAI-123 -->

## What changed and why
- 

## Acceptance criteria covered
<!-- Copy the acceptance criteria from the ticket and tick what this PR delivers. -->
- [ ] 

## How it was tested
- [ ] Unit / integration tests added or updated
- [ ] Permitted role succeeds, denied role is blocked
- [ ] Two schools / campuses — no data crossing (if data access changed)
- [ ] EN, UR and AR (right-to-left) checked (if UI changed)
- [ ] Keyboard only and 200% text (if UI changed)
- [ ] Ran locally: lint, typecheck, test, build (+ isolation / e2e smoke if relevant)

## Screenshots / recordings
<!-- Required when UI files change: before/after screenshots or a short recording.
     Name files like SKAI-123_01_success_EN.png. No passwords, tokens or real student/guardian data.
     If nothing visual changed, write: No visual change — <reason> -->

## Risk, rollback and flags
- Risk: low / medium / high — 
- Rollback: <how to undo: revert the commit / turn off flag X / run the down-migration>
- Feature flag: none / `flag-name` (default off in production until QA passes)

## Database migrations
- [ ] None
- [ ] Yes — backwards-compatible; destructive changes split into two releases (described above)

## Security, privacy and AI
- [ ] No secrets, tokens or real personal data in code, fixtures, logs or screenshots
- [ ] Touches auth / roles, payments, messaging (WhatsApp, email, SMS, OTP), the security policy (CSP) or migrations → code owner requested
- [ ] AI-05 evaluation impact reviewed (required if AI code, prompts, models or the AI gateway changed): 

## After merge
- [ ] Ticket moves to **Deployed to Dev** after the dev deploy; QA follows the ticket's "QA & evidence" section and attaches screenshots; only QA moves it to **Done**
