# SKAI-906 — D6 tracker of record recommendation

Research cut-off: 29 October 2026. Owner/decider: Mohsin Ali. **For founder approval; not yet recorded in the PRD decision log.**

## Options considered

| Option | Description |
| --- | --- |
| Jira | Already holds SKAI-* tickets; PRD v2.0 and the decision log live in Confluence on the same Atlassian site; PR hygiene CI enforces `SKAI-` keys. |
| Linear | Holds historic SKO-* tickets; faster UI; separate from Confluence. |
| Both | Current state: drift between SKO and SKAI that needs `historical-ticket-crosswalk.md`. |

## Evidence, interpretation and limits

| Evidence | What it supports | What it does not establish |
| --- | --- | --- |
| [Automation Atlas, Linear pricing 2026](https://automationatlas.io/answers/linear-pricing-2026/) (viewed 29 Oct 2026): free to 10 users and 250 issues; Basic USD 10, Business USD 16 per user per month (annual). | Linear's free tier is already too small for this backlog. | Exact current prices; check vendor page. |
| [eesel.ai, Linear vs Jira](https://www.eesel.ai/blog/linear-vs-jira) (viewed 29 Oct 2026): Jira free to 10 users; Standard about USD 8 per user per month. | Jira is cheaper and its free tier fits a team of up to 10. | Vendor-neutral benchmark; sources differ by cents. |
| Repo: `.github/workflows/pr-hygiene.yml` requires `SKAI-\d+` in PR title and branch. | Switching cost falls on Linear, not Jira. | — |

## Recommendation

**Jira (SKAI) is the single delivery tracker of record; SKMR stays the strategic board; Linear becomes a read-only archive.** Linear's speed does not outweigh one Atlassian site for PRD, decision log and tickets, and CI already depends on SKAI keys.

## Risks

- Lost SKO history → keep the crosswalk and a read-only Linear export.
- Agent workflows built on Linear → repoint to Jira transitions and update working notes.
- Team grows past 10 → Jira Standard at about USD 8 per user.

## What it unblocks

One place for Done evidence on all D/V tickets; PR hygiene stays valid.

## Follow-up tickets

1. D6-01 Freeze Linear writes; export to CSV archive.
2. D6-02 Migrate open SKO items missing from the crosswalk into SKAI.
3. D6-03 Update agent workflow notes to use Jira statuses.
4. D6-04 Record decision in the PRD decision log.
