# Linear archive (read-only from 29 October 2026)

Decision D6 (`docs/product-review-2026-10/d6-tracker-of-record.md`) makes Jira project **SKAI** the only delivery tracker. The Linear workspace `skoolee-ai-app` (team key `SKO`) is frozen as a read-only archive from **29 October 2026**. Do not create, move or comment on Linear issues; raise new work in Jira SKAI.

## Contents

| File | What it is |
| --- | --- |
| `linear-issues-2026-10-29.csv` | Every Linear issue, including archived, completed and canceled ones (SKAI-1054, D6-01). Columns: `id,title,status,statusType,project,createdAt,completedAt,url`. |
| `open-items-crosswalk.md` | Open SKO issues grouped by Linear project, each with a suggested SKAI home (SKAI-1055, D6-02). |

Issue descriptions, comments and attachments are deliberately **not** exported. At least one issue (SKO-5) contains plaintext test passwords in its description; for full detail, open the issue URL in Linear (read-only).

## Counts by status (export of 29 October 2026)

| Status | Status type | Issues |
| --- | --- | --- |
| Todo | unstarted | 329 |
| Done | completed | 211 |
| Canceled | canceled | 89 |
| Backlog | backlog | 11 |
| In Progress | started | 9 |
| **Total** | | **649** |

Open (not completed or canceled): **349**. Completed or canceled: **300**. SKO-559, SKO-560 and SKO-561 are truncated duplicates of PM-01 (already delivered as SKAI-52 to SKAI-55) and are superseded.

## How this was produced

Exported with the Linear MCP `list_issues` tool (`includeArchived: true`, 250 per page, cursor pagination, ordered by creation date) and written to CSV without descriptions. Mapping of older SKO epics to SKAI tickets lives in `docs/product-review-2026-10/historical-ticket-crosswalk.md`.
