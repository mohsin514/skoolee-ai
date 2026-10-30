# Curriculum abstraction check (SKAI-1106)

Date: 2026-10-29. Context: SKAI-1006 market expansion review, item 3 ("a curriculum abstraction in Exam Studio, so boards beyond FBISE/BISE can be added as content packs").

## Question

Can a new curriculum (British GCSE, IB, CBSE, UAE Ministry of Education) be added as a curriculum pack without code changes?

## How packs work today

| Layer | File | Board-aware? |
|---|---|---|
| Contract schema and publication checks | `src/lib/school-ai/curriculum-contract.ts` | Yes: `contractBoards` enum, `language` enum, board rules |
| Shipped packs | `src/lib/school-ai/packs/*.ts` | Content as TypeScript data |
| Registry, activation lifecycle and gate | `src/lib/school-ai/curriculum-pack-registry.ts` | `shippedCurriculumPacks()` list, `packGeographyScope` |
| Pilot gate | `src/lib/school-ai/pilot-eligibility.ts` | `geography` enum, allowed and budget-approver sets |
| Catalogue tables | `curriculum_pack_versions`, `curriculum_pack_activations`, `curriculum_pack_activation_events` | No: `board`, `language`, `geography` are plain strings; content is JSON |
| Seed | `scripts/seed-curriculum-packs.ts` | No: iterates `shippedCurriculumPacks()`, idempotent by hash |

The database, seed, activation lifecycle, approval rules, Exam Studio gate and hash pinning are all board-neutral. A new board needs no migration.

## Verdict

**Mostly data, not zero code.** A new board needs:

1. One value in `contractBoards` and one entry in `boardPublicationRules` (empty if it has no extra rule). This PR moves the scattered `if (board === ...)` checks into that table.
2. A pack file under `src/lib/school-ai/packs/` and one line in `shippedCurriculumPacks()`.
3. A code change only if its market is outside today's enums (below).

### Per curriculum

| Curriculum | Board value | Fits now? | Remaining gap |
|---|---|---|---|
| British (GCSE / A level) | `BRITISH_NATIONAL` (added) | Yes, Foundation/Higher tier rule | Awarding body (AQA, Edexcel, OCR) is free text in `qualification`; separate boards if rules differ |
| IB Diploma | `IB` (added) | Yes, SL/HL tier rule; proven by the end-to-end fixture test | Internal assessment is not a timed paper; model it as an unassessed outcome for now |
| CBSE | `CBSE` (added) | Partly | Hindi medium needs `hi` in the `language` enum; India geographies are not in the pilot enum |
| MOE UAE | `MOE_UAE` (added) | Yes for Dubai, named-term rule | Abu Dhabi / Sharjah campuses map to `OTHER` and are outside the pilot scope |

## Hardcoded assumptions found

| Assumption | Where | Status |
|---|---|---|
| Board rules as inline `if` chains | `validateContractForPublication` | **Fixed**: `boardPublicationRules` table, with a test that every board has an entry |
| Closed board enum (4 boards) | `contractBoards` | **Fixed**: British, IB, CBSE, MOE UAE added |
| Language enum `en`, `ar`, `ur` | contract schema, `pilotEligibilityInputSchema`, `ContractRequest` | Open: add `hi` when a CBSE Hindi pack ships |
| Pilot geographies (PK, KSA, Dubai only) | `pilot-eligibility.ts` | Open on purpose: scope is a SKAI-1007 product decision, not a code defect |
| Packs registered in a code list | `shippedCurriculumPacks()` | Open: acceptable while packs are reviewed in PRs; a loader over `packs/` is optional |
| Section formats `MCQ`/`SHORT`/`LONG`/`PRACTICAL` | `paperSectionSchema` | Open: IB/GCSE structured and extended-response questions fit `SHORT`/`LONG`; coursework does not |
| Exam year is a 4-digit year, teaching year `YYYY-YY` | contract schema | Fits all four (northern-hemisphere sessions) |

## Evidence

- `tests/fixtures/curriculum/ib-dp-mathematics-aa-sl.fixture.ts`: a synthetic IB pack (not curriculum facts).
- `tests/school-ai/curriculum-second-market.test.ts`: parse, catalogue row, DRAFT blockers (rights, UAE budget approver), approval by a different person, activation, Exam Studio gate and hash pin.

## Recommended follow-ups

- Add `hi` to the language enums with the first CBSE pack.
- Decide the UAE/India geography list with the SKAI-1007 owner before any non-Dubai pilot.
- Add a `COURSEWORK` section format if a board's assessed component is not a timed paper.
