# Ask, Check, Keep the Receipt: the unified UX/UI/interaction design for AI Workflows and the per-role first-login sheet (synthesis of U1-companion, U2-console, U3-outcome)

# Ask, Check, Keep the Receipt

**What this is.** The single UX/UI/interaction design that implementation follows for the two LEAP 2027 flagships: **AI Workflows** (any of the 11 roles asks in free text, and the AI does it if the role has that feature) and the **per-role first-login sheet** (each role answers a different short sheet, and the system is set up for them). It is a synthesis of three candidates (U1-companion, U2-console, U3-outcome) and three judge verdicts.

**Status.** Read-only design, 2026-10-23. No repository file was changed.

**Ground truth.** Appendix B (B.engine, B.typedOps, B.roles, B.ui, B.qa, B.decisions) and Appendix A in `docs/product-review-2026-10/ai-automation-plan-2026-10-23/`. Every claim about current code cites file:line, either verified for this synthesis or verified by the audit. Everything else is design.

**Scope guards.**
- Voice and document intake stay with SKO-460.
- Syllabus → paper → moderation → Seal stays in Exam Studio (SKO-408). This design only deep-links to `/ai/studio` (rule 21).
- Run lifecycle, approval binding and pause/resume reuse SKO-470 (`SchoolAiRun`/`SchoolAiExecution`, `runs-panel.tsx`).
- Thread persistence reuses SKO-460's conversation model (`/api/school-ai/conversations`).
- Nothing here widens a seat or a permission (rules 2 and 19).
- Every "the AI does X" assumes a typed adapter for X exists. Where it does not, the UI shows the honest **Not connected** state.

### How the synthesis was decided

- **Spine: U3-outcome.** Two of three judges picked it (usability researcher, implementing engineer). It is phone-first and outcome-first, its slice 1 ships on today's engine, and it carries the lowest risk of a second design language.
- **From U1-companion** (the founder judge's winner): the role companion as a *bounded* presence, the Known-fact stack, ghost cards, the four-stage honest hand-off timeline, the high-blast checkbox, local "yes" interception, registry-owned localized titles, and a receipt-driven Build ceremony. The ceremony is rebuilt on the existing Charter Desk parts (`CharterLedger`, `SealSlot`) instead of nine bespoke illustrated tiles.
- **From U2-console:** the merged ⌘K palette (generalising the existing `TeacherCommandPalette`), page-registered context chips, per-step hash binding for Build, the WillCreateDiff three-way split, the read-only HandoffInbox, the honest coverage count, and SKO-460/470 reuse.
- **Every judge mustFix is resolved.** §11.4 is the checklist.

Class labels used throughout. Classes are static per capability in the registry and never chosen by the model (B.decisions T1):
- **A**: runs on its own.
- **B**: you check and confirm on the card.
- **C**: prepared and handed to the person who approves it, on the screen they already use.

---

## 1. The idea and the signature moments

### 1.1 The idea in one paragraph

People do not want to "use AI". They want the register saved, the book issued, the campus standing. So every surface opens on the **outcome**, and there is one way to ask: the **Ask bar** on Today and `/ai`, or **⌘K / Ctrl+K** from any page, carrying chips for what you are looking at. The AI turns the request into a **Task Card**, a small structured form for exactly one capability. It is already filled from your words and the school's records, and every field says where its value came from (*from your words*, *from school records*, *default*, *needs you*). You **correct instead of type**. What happens next is fixed per capability:
- **A** runs.
- **B** waits for a button that says exactly what it does ("Save register · 31 present, 2 absent"). The button is bound to the exact preview, and the preview shows a short code (**Preview 7C1D**).
- **C** is prepared and handed to the named person, on the screen where they already approve that kind of thing.

Nothing is called *Saved* or *Done* until the server returns a **receipt** (record ids, counts, a link). Your role's companion, the existing animated cast (`AiGuide.tsx:12`, `RoleGuideProps.tsx`, `role-guide-copy.ts`), is the face of this. It greets you, interviews you on first login, and sits in the corner of every Run Sheet. It is never the thing that confirms, and it never moves ahead of the database.

The first-login sheet uses the same grammar:
- A short sheet per role, made of chips, steppers, grids and pickers. There are no essay boxes.
- It is prefilled from what registration, the wizard and records already know.
- It shows a "what this will create" preview, then one press: **Build my workspace**.
- A ledger inks in one row per receipt, and the sheet ends on a receipts page with an honest "waiting on others" list and a "still to do" list.

### 1.2 The four signature moments (the LEAP demo is built on these)

1. **"It already knows me."** First login opens on your role's companion in its outfit, greeting you in your language. Before asking anything it shows a stack of **Known-fact cards**: "Al-Noor Grammar · Lahore · Asia/Karachi · Session 2026–27, 1 Sep – 30 Jun · Weekend: Sunday". The wizard already wrote all of this (`setup-service.ts:369-425`). One press, **All correct**, ticks them. The academic year is never asked twice (B.ui finding 2).
2. **"The school assembles itself, and only as fast as the database."** The admin presses **Build my workspace**. The `CharterLedger` on the ink cover inks one row per receipt: "12 classes · saved", "48 subjects · saved", "8 periods · saved", "14 rooms · working…", "9 staff invitations · pending until accepted", "Fee structure · with Sana Malik (Accountant)". The `SealSlot` presses only when every A/B row has a receipt. While anything is waiting the heading reads "Mostly set up: 2 things are with other people".
3. **"Twenty seconds between lessons."** A teacher on a 360 px Android phone, in Urdu, taps the chip *"7B register · period 3"*. She types "علی اور سارہ غیر حاضر" ("Ali and Sara absent"). Two rows flip to absent, each with its quote. One tap on **Mark the other 31 present** (an explicit act by her, never inferred from a phrase, T3). Then **Save register · 31 present, 2 absent**, a receipt, and back in her pocket. A visible on-stage timer reads 0:19. She also types "جی" ("yes") on another card, and nothing happens except a hint pointing at the button.
4. **"Handed to the right person, same code on both screens."** The accountant asks to "record Rs 12,000 cash from Bilal's father for October". It becomes a prepared payment, shown as *"Prepared · with Farah Siddiqui (Admin) in Finance operations · Preview 4F2A"*. On the approver's tablet, Finance operations shows the **Prepared by AI** panel with the same `4F2A`, the requester's words verbatim, and the screen's own approve control. She approves there. The accountant's card flips to "Approved by Farah · 14:02" with the receipt.

The closing frame: `/ai/can-do` shows **"AI is connected to 38 of 151 things you can do"** for a teacher. The real number rises as adapters ship. The close line: *"It shows what it did, what it didn't, and who decides."*

---

## 2. Surface map

New components live in `src/components/ai-workflows/`. That folder already exists and holds `AiWorkflowsHome.tsx` and `ai-workflows-copy.ts`, which today save drafts only (B.ui). Generic new primitives go to `src/components/ui/`. Charter-Desk-specific pieces go to `src/components/onboarding/`.

| # | Surface | Where it mounts | What it replaces / changes |
|---|---|---|---|
| S1 | **AskPalette**: ⌘K / Ctrl+K command palette, "Ask Skoolee or jump to…" | Global, inside `RoleShell` (`RoleShell.tsx:111-112`, inside `LocaleProvider` → `NavigationAccessProvider`) via a new `AskProvider`. Opened by the shortcut, by `openAsk()` on `ask-bus.ts`, and by a header `IconButton` (founder sign-off, §12 D2) | **Generalises** `TeacherCommandPalette` (`src/components/teacher/command-palette.tsx:41`, ⌘K at `:51-56`) and `palette-bus.ts`. The teacher's Jump results become the palette's Jump section for every console, so there is one listener and no collision |
| S2 | **AskBar** (outcome composer) + **SuggestionRail** | Top of every console's Today page (the first leaf of each console in `ROLE_NAV`) and the top of `/ai` | Replaces the `AutomaticWorkspace` textarea panel (`automatic-workspace.tsx:56`) |
| S3 | **RunSheet**: where one request lives (thread, ribbon, Task Card, confirm, hand-off, receipts) | Host mounted beside `ChatDock` in `RoleShell` (`RoleShell.tsx:392`). Desktop: an end-side panel. Phone: `ModalSurface fullscreen`. On `/ai` it is docked inline in the centre column | Replaces the fullscreen modal that auto-advances every 600 ms (`automatic-workspace.tsx:54,57`) |
| S4 | **TaskCard** + **ConfirmBar** | Inside the RunSheet | New |
| S5 | **AI Workflows home** at `/ai` | `src/app/ai/page.tsx` (today it branches families/owner → `AutomaticWorkspace`, staff → the 17-tab `SchoolAIWorkspace`, `page.tsx:14-30`) | The home becomes the same for all 11 roles. Staff keep the 17 tabs under a **Studio tools** `ViewTabs` (`school-ai-workspace.tsx:62-64`), and nothing is removed (§12 D3) |
| S6 | **HandoffInbox** "Waiting for you" at `/ai/waiting` + a card on the approver's Today | Route under `/ai` | New read index. It is **not** a second approval screen |
| S7 | **CapabilityAtlas** "What AI can do here" at `/ai/can-do`; `?` in the palette; an icon button in the AskBar | Route + drawer | New. Built from the registry plus `ROLE_NAV` (the B.roles §(c) checklist) |
| S8 | **PreparedByAiPanel** (approver side) | Embedded above the existing decide controls of: Finance operations (`finance-operations-panel.tsx`), SKO-470 runs/approvals (`runs-panel.tsx`, `#run-<id>` anchors at `:36-37`), Fee invoices, Leave approvals, Announcements queue, Timetable publish, People & access, Pickup | Adds provenance. Never replaces the domain's controls |
| S9 | **WorkspaceSheet**: per-role first-login sheet | ADMIN/CAMPUS_ADMIN: `/ai?setup=1` (existing entry). SUPER_ADMIN: after the wizard, before `/setup/readiness` (`setup-role.ts:6-8`). TEACHER: **extends** `/teacher-onboarding` (`src/app/teacher-onboarding/page.tsx:47`, whose profile steps become sheet 1; no fork). Everyone else: the existing first-login redirect | Replaces `GuidedSetup`'s 18 free-text question loop (`guided-setup.tsx:176-224`) and keeps its ONBOARDING record, `confirmedKeys` and version binding (`schemas.ts:23-34`, `service.ts:43-48`) |
| S10 | **BuildBoard** (the Build moment) → **WorkspaceReady** receipts page at `/ai/setup/[runId]` | Last step of S9; the receipts page is permanent, linked from Today and the account menu ("My setup") | Replaces the Today card keyed on the dead `SETUP_GENERATION_V1` (`dashboard.ts:73-85`, B.ui finding 4) |
| S11 | **GroupLaunchBoard** (SUPER_ADMIN) | `/super` Today hero after the group sheet | New. Built on `CampusPlan.tsx` + `CapacityMeter.tsx` |
| S12 | **Ask indicator** | The header Ask `IconButton` carries a status ring/badge (needs you · working · approvals for you) | Deliberately **not** a second floating launcher. ChatDock keeps its corner (`chat-dock.tsx:87-88`: `bottom-24 end-4`, `md:bottom-6 md:end-6`). No DockRail refactor |
| S13 | **Draft-tool notice** | `/teacher/ai`, admin/principal `?view=ai`, the SKO-460 private assistant | They **stay** as draft/read tools, each with one `Alert tone="info"`: "This tool writes drafts. To have AI do the work, ask Skoolee →". The link opens the RunSheet prefilled. SKO-460's surface is linked, never replaced or forked |

**ChatDock coexistence.**
- **Desktop.** When the RunSheet is open as an end-side panel, `ChatDock` receives a new boolean prop `suppressed`, which hides its launcher with `hidden`. This is a one-line prop, not a refactor, and it is agreed with the chat owner.
- **Phone.** The RunSheet is a fullscreen `ModalSurface`, so it covers the launcher.
- **Exam Studio.** ChatDock already hides there (`onExamStudio`), and the RunSheet deep-links out instead of opening.

---

## 3. Component spec

All components use shared primitives only. Strings go through `useUiText()` (`LocaleProvider.tsx:25`) or the new `ai-workflows-copy.ts` triples, in the `Localized` pattern of `role-guide-copy.ts:5-23`. Every interactive element carries a `data-ai-*` anchor (B.qa: the current component has none).

### 3.1 The view model the UI renders (UI contract; the engine track owns it)

```ts
type RunView = {
  id: string; version: number; language: "en" | "ar" | "ur";
  status: "PLANNING" | "RUNNING" | "WAITING_INPUT" | "WAITING_CONFIRM" | "PAUSED" | "COMPLETED" | "FAILED" | "BLOCKED" | "CANCELLED";
  outcome?: "executed" | "answered" | "plan_saved" | "awaiting_approval" | "partial";
  pauseReason?: "user" | "credits" | "step_cap" | "subscription";
  blockReason?: { kind: "not_connected" | "not_your_role" | "policy_separation" | "seat_held" | "access_changed" | "gate_closed";
                  owner?: ApproverRef; href?: string; capabilityLabel?: string };
  request: { text: string; chips: AskContextChip[]; source: "bar" | "palette" | "chip" | "sheet" };
  steps: StepView[];                    // persisted plan, dependency order
  credits: { estimated?: number; reserved?: number; used: number };   // server reservation (T9), never client-computed
  practiceMode: boolean;                // ai-release-evaluation closed or prototype fallback
  lastServerAt: string;                 // drives the 8 s / 60 s honesty copy
};
type StepView = {
  key: string; capabilityKey: string; cls: "A" | "B" | "C"; lane?: Lane;
  title: Localized;                     // registry-owned template + slots, e.g. "Create {count} classes"
  state: "planned" | "needs_input" | "preparing" | "awaiting_confirm" | "running" | "saved" | "looked_up" | "draft"
       | "queued" | "pending_acceptance" | "handed_off" | "approved_elsewhere" | "returned" | "skipped" | "not_connected" | "failed" | "stale";
  dependsOn: string[];
  fields?: FieldValue[];                // TaskCard values + provenance
  preview?: { hash: string; short: string /* first 4 hex, upper */; summary: Localized; counts: Record<string, number>;
              diff?: PreviewDiff; warnings: string[]; blockers: string[]; highBlast: boolean };
  pendingKey?: string; idempotencyKey?: string;
  receipt?: Receipt;                    // present ONLY when a write/read/draft/queue committed
  handoff?: Handoff;
  error?: { code: string; savedCount?: number; totalCount?: number };   // code → EN/AR/UR, never raw server text
};
type Receipt = { kind: "write" | "read" | "draft" | "queued" | "pending"; counts: Record<string, number>;
                 ids: string[]; links: { label: Localized; href: string }[]; at: string; previewShort?: string; domainReceiptId?: string };
type Handoff = { approver: ApproverRef; surface: { label: Localized; href: string /* exact record version */ };
                 events: { notifiedAt?: string; openedAt?: string /* only if the surface records it */; decidedAt?: string };
                 status: "prepared" | "in_queue" | "opened" | "approved" | "returned" | "stale"; note?: string; separation: "required" | "optional" | "self_on_surface" };
type ApproverRef = { role: UserRole; displayName?: string; seat: "filled" | "vacant"; isRequester: boolean };
```

**Hard rule.** A component may render `saved`, a tick, an inked ledger row or a pressed seal only from `step.receipt`. A dev-time assertion (`assertReceipt(step)`) throws in development and test builds otherwise.

### 3.2 Components

| Component | Key props | States | Built from | Notes |
|---|---|---|---|---|
| `AskProvider` / `ask-bus.ts` | `role, campusId, language` | — | `palette-bus.ts` evolved | `openAsk({ text?, chips?, capabilityKey? })`, `useAskContext(chips)` (page-level, cleared on unmount, **never scraped from the DOM**) |
| `AskPalette` | `role, campusId, language` | `closed · open-empty · typing · submitting · error` | `Modal` (md) / `ModalSurface fullscreen` at 360, `useDialogBehaviour`, `InputGroup`+`Input`, `Badge`, `EmptyState` | Groups: **Ask** (first when there is a verb or more than 3 words) · **Jump** (`ROLE_NAV` leaves, `allowsHref`) · **Records** (roles with `recordSearch`). `?` opens the Atlas filtered to this route. `@` starts an entity mention resolved against scoped data |
| `ContextChipRow` | `chips: AskContextChip[]`, `onRemove` | — | `Badge` + `IconButton` | `AskContextChip = { kind, id, label, source: "page"\|"mention"\|"user", removable }`. Chips and @-entities are sent as ids and pseudonymised by construction |
| `AskBar` | `role, suggestions, state, creditHint?, onSubmit, onOpenAtlas` | `idle · typing · submitting · offline · no_credits · paused_subscription · practice · waiting_confirm_elsewhere` | `InputGroup`, `Textarea` (auto-grow to 4 lines), `IconButton`, `OfflineBanner` | Enter sends; Shift+Enter is a newline; **no send during IME composition** (Urdu/Arabic). `dir="auto"`. A per-submission idempotency UUID is kept until the text changes (today's pattern, `automatic-workspace.tsx:36-37`). No mic or attachment button (SKO-460) |
| `SuggestionRail` | `suggestions: Suggestion[]` | — | `Button variant="choice" size="sm"`, `Badge` | Server-computed per role and page (§7.2). A chip carries `capabilityKey` + `prefill`, and **never a class** (the class comes from the server) |
| `RunSheet` | `runId, returnFocusTo` | mirrors `RunView.status` | `ModalSurface` (phone), panel (desktop), `CollapsiblePanel`, `Skeleton` | Header: compact `AiGuide` (40 px) + request line + `PracticeBadge` + close ("Close · it keeps going") |
| `RequestThread` | `entries: ThreadEntry[]` | — | `<ol role="log">` | Entries: request · question · answer · note (AI prose, never a status claim) · confirmation · handoff · outcome · system. Persisted through the SKO-460 conversation model |
| `ProgressRibbon` | `steps, density: "inline"\|"ledger"` | per row: `planned · needs you · working · saved · with {name} · skipped · didn't run` | `<ol>` + `TaskStatus` | Counts only ("5 of 7 saved"), **never a percentage**. `aria-current="step"` on the running row |
| `TaskCard` | `step, fields: FieldSpec[], values, provenance, issues, mode` | `editing · previewing · confirming · locked` | `FormField`, `DatePicker`, `Select`, `OptionCard`, `Input`, `Textarea`, `assistant-entity-picker.tsx` pattern | Field kinds: `entity · date · time · period · stepper · choice · roster-exceptions · money (read-only for C) · text`. `FieldSpec[]` is **generated from the adapter's zod schema** plus an optional registry `uiSchema` override. The model fills values only and never chooses fields |
| `ProvenanceChip` | `source: "words"\|"records"\|"default"\|"missing"`, `quote?` | — | `Badge` (+ `Tooltip` with the quote) | "From your words: '…'" makes `evidenceQuote` (`service.ts:152`) visible. A `missing` field is focused first |
| `ConfirmBar` | `effectLabel, counts, previewShort, highBlast, reason?, state, onConfirm, onEdit, onSkip` | `ready · recomputing · submitting · stale` | `Button`, `Checkbox`, `LedgerList`, `ConfirmAction` (only when the domain requires a reason, `confirm-action.tsx:16-55`) | **`effectLabel` and `counts` are required props.** A lint rule forbids a generic "Confirm"/"Yes" label. Sticky at the bottom on phones, StepDock style (`StepDock.tsx:7-16`) |
| `PreviewCode` | `hash` | — | `<code dir="ltr">` inside `Badge` | "Preview 7C1D", the first 4 hex of `previewHash` |
| `PreviewDiff` | `diff` or `operation preview` | — | `ExecutionPreview` (`execution-preview.tsx:12-25`) for the 15 typed ops; a generic group/rows renderer for new adapters | First 3 rows (phone) / 10 rows (desktop) + "Show all {n}" |
| `HandoffCard` | `step, onOpenSurface, onWithdraw, onFix` | `prepared · in_queue · opened · approved · returned · stale` | `Card variant="featured"`, `TaskStatus`, an outline `SealSlot state="open"` | Timeline stages render **only when true**. "Opened" is omitted when the surface records no view event |
| `ReceiptList` / `ReceiptRow` | `receipts` | kinds: `Saved · Looked up · Draft · Queued · Pending` | `LedgerList`/`LedgerRow` (`ReviewSheet.tsx:46-52`, `ltr` prop), `Menu` (Copy receipt id) | Tick only for `write`; an eye for `read`; a document icon for `draft`; a clock for `queued`/`pending` |
| `NotYetCard` | `blockReason` | `not_connected · not_your_role · seat_held` | `TaskFeedback kind="permission"`, `Button` link | Logs a structured "asked but not connected" event (B.engine finding 12) |
| `PracticeBadge` | — | — | `Badge` | "Practice mode · nothing is saved to your school". Shown on every card, receipt and Build screen while `practiceMode` is true |
| `HandoffInbox` | — | `waiting · returned · decided (7 days)` | `ViewTabs`, `Table`, side drawer `ModalSurface`, `ExecutionPreview` | Row: what · who asked · age · blast-radius chip ("Rs 12,000", "46 families") · state. The drawer's **only** primary action is "Review and decide in {surface} ↗" |
| `PreparedByAiPanel` | `requestedBy, preparedAt, requestText, provenance, previewShort, effect, nonEffect, creditsUsed, runHref` | `fresh · stale` | `Alert tone="info"`, `ProvenanceChip`, `PreviewCode` | Blocks: Asked for (verbatim, original language, "Show translation" toggle where available) · What AI filled · What approving does · What it does not do. Return-with-note flows back as `returned` |
| `CapabilityAtlas` | `role, route?` | — | `CollapsiblePanel` per nav group, `Badge`, `EmptyState` | Header: "AI is connected to {n} of {m} things you can do". Groups: **Here · Elsewhere · With approval · Not connected · Not your role (who does it)** |
| `RunHistory` | `filter` | `Needs you · With others · Done · Stopped` | `ViewTabs`, cursor pagination | Replaces the 20-item `<details>` (`automatic-workspace.tsx:56`, `service.ts:36`) |
| `WorkspaceSheet` | `role, language, campusId, definition: SheetDefinition, record: {id, version}, prefill` | `greeting · answering · reviewing · building · ready` | `SheetRail`, `StepCard`, `StepDock`, `ConfirmedChoice`, `OptionCard`, `MoreDetails`, `WeekStrip`, `SetupBar`, `AiGuide`, `InkHeading` | §6 |
| `KnownFactStack` | `facts: KnownFact[]` | per card: `unconfirmed · confirmed · editing` | `ConfirmedChoice` + `Button` "All correct" | Facts from another person's record are not edited here. "Something's wrong" becomes a hand-off to that person |
| `WillCreateDiff` | `groups, credits` | — | `ReviewArticle` ×3 (`ReviewSheet.tsx:25`), `LedgerRow`, ghost rows as dashed `Skeleton` outline | Articles: **Pressing Build creates** (A/B) · **Prepared for someone else** (C, names the approver) · **Not from this sheet** (roster import, guardian access, not connected). Ghost rows show what a skipped question would have added |
| `BuildBoard` | `run` | `building · paused · built_with_problems · built` | `.sk-ink-cover`, `CharterLedger` (`CharterLedger.tsx:6-13`), `SealSlot` (`open\|pending\|pressed\|failed`, `SealSlot.tsx:19`), `ProgressRibbon density="ledger"`, `ConfirmBar` | ADMIN/CAMPUS_ADMIN/SUPER_ADMIN only get the ink cover. Other roles get a plain ribbon |
| `WorkspaceReady` | `runId` | — | `InkHeading`, `ReceiptList`, `HandoffCard` (mini), `FollowUpList` (`follow-up-list.tsx:15`, brand/berry tone) | Sections: Created · Queued / pending · With others · Not connected · Later. Print stylesheet |
| `GroupLaunchBoard` | `campuses` | per tile: record · admin invitation · admin's sheet progress · receipts | `CampusPlan` (`active\|draft\|slot`), `CapacityMeter`, `Table`, `TaskStatus` | §6.8 |

### 3.3 New primitives (and why they are needed)

Each is composed only of `Input`, `IconButton`, `Table`, `Button variant="choice"`, `Checkbox` and `FormField`. Each uses tokens only, ships stories at 360/768/1440 × EN/AR/UR, and is added to the adoption ratchet.

| Primitive | Location | Why it is needed |
|---|---|---|
| `Stepper` | `ui/` | Numeric counts (periods, sections, loan days) appear in 8 of 11 role sheets, and nothing like it exists today |
| `TagList` | `ui/` | Subjects, fee heads, shelf sections; paste splits on commas and new lines |
| `GradeSectionGrid` | `onboarding/` | Grades × sections in two taps. It replaces the free-text `grades` key |
| `SubjectMatrix` | `onboarding/` | Subjects × grades toggles with "same as previous grade" |
| `PeriodBuilder` | `onboarding/` | Start time, length, breaks, with a live ladder preview |
| `AvailabilityGrid` | `ui/` | Days × periods toggles (teacher free periods, student study times, parent availability) |
| `RosterTable` | `ui/` | Spreadsheet/CSV paste into a typed grid. It routes **only** through the `importBatch` review token (`students.ts:20-22`) and never reaches a prompt (B.ui finding 5) |
| `MoneyLines` | `onboarding/` | Fee head × grade amounts with `formatMoney` and the `LocalePolicy` currency |

**Companion pose extension (bounded).** `AiGuide`'s `pose` union (`AiGuide.tsx:12`: `wave | think | ready`) gains exactly three poses: `listen` (needs you), `wait` (with someone else) and `puzzled` (not connected / didn't run). Each is one CSS state in `guide-stage.module.css` reusing the persona props. "Celebrate" is not a pose; the pressed `SealSlot` is the celebration. Total cost: 3 poses × 11 personas, static frames under reduced motion.

---

## 4. State choreography

### 4.1 The client never drives execution

Slice 1 deletes the 600 ms `advance` timer (`automatic-workspace.tsx:54`). The browser only **observes** and **acts**:
- **Observe:** poll with backoff 1 s → 2 s → 4 s (max 8 s) while visible, or use SSE if SKO-470 provides it. Polling pauses when `document.visibilityState !== "visible"`.
- **Act:** with explicit commands: `answer`, `confirm`, `edit`, `skip`, `pause`, `resume`, `cancel`, `withdraw`.

The worker advances class A. Class B stops at `WAITING_CONFIRM`, which the worker never advances. Class C finishes by handing off. The server **rejects `answer` on a `WAITING_CONFIRM` run**. Only a bound `confirm` moves it.

### 4.2 The ten engine states the design must cover

Columns: phase · server source · what the user sees · EN copy (exact) · AR/UR notes and draft strings. AR/UR strings are drafts for native translator review; they fix tense and register, not final wording.

| Phase | Source | UI | EN copy | AR / UR |
|---|---|---|---|---|
| **1 Planning** | `PLANNING`, or `RUNNING` with no plan yet | Ribbon with one indeterminate row; `Skeleton` card; companion `think`; header indicator spinner | "Working out the steps for: *{request}*. Nothing has changed yet." After 8 s with no server change: "Still working. You can close this; it keeps going and you'll find it under Needs you." After 60 s: `Alert tone="warning"` "This is taking longer than it should. Nothing new was saved." + **Retry** | Quote the request in `<bdi>`. AR: «أرتّب الخطوات لـ: …. لم يتغيّر شيء بعد.» UR: «…کے لیے مراحل ترتیب دے رہا ہوں۔ ابھی کچھ نہیں بدلا۔» "Nothing new was saved" is literal in every language, never softened |
| **2 Needs detail** | `WAITING_INPUT` (typed `ask` with `field` + `widget`) | Task Card with the `needs you` field focused, or a `DetailCard` (entity / date / amount / choice / text-last-resort); companion `listen`; header ring amber | Heading: "One detail needed". Field hint: "Which Ali in 7B?" Reason under it, muted: "Two students match." Always offered: **I don't know** (skips the step into Still to do; the run does not fail) | AR: «مطلوب تفصيل واحد» (noun phrase, gender-neutral). UR: «ایک تفصیل درکار ہے». Names stay in their original script, never transliterated |
| **3 Confirm step (B)** | `WAITING_CONFIRM` | Card in `previewing`; `PreviewDiff`; `PreviewCode`; `ConfirmBar` with the verb + count; high-blast checkbox when flagged | Button: "Save register · 31 present, 2 absent". Sub-line: "Nothing is saved until you press this." Binding line, muted: "You're confirming what is shown (Preview 7C1D). If anything changes before it runs, you'll be asked again." | AR verb first: «احفظ السجل · ٣١ حاضر، ٢ غائب» (digits follow `Intl.NumberFormat(locale)`; no hard-coded digit shapes). UR verb last: «رجسٹر محفوظ کریں · 31 حاضر، 2 غیر حاضر». Before the receipt use nouns or the imperative, never the perfect tense |
| **4 Running** | `RUNNING` with a pending step executing | Row "working…"; companion `ready` (no walking); header ring progress (receipts / planned) | Progressive only: "Creating 12 classes…", "Saving the register…" | AR: «جارٍ إنشاء ١٢ صفًا…». UR: «12 کلاسیں بن رہی ہیں…». Present progressive until the receipt |
| **5 Step done** | `step.receipt` present | `ReceiptRow`; a single tick draws in 150 ms (reduced motion: none); polite announce once | Write: "Saved · 12 classes · Open Classes & subjects". Read: "Looked up: 4 overdue loans" (no tick). Draft: "Saved as a draft. Nothing in the school changed." Queued: "Queued for 212 families · 9 skipped (no consent or verified contact) · delivery not confirmed yet". Invitations: "9 invitations pending until accepted · 0 accepted" | Perfect tense only now. AR: «تم الحفظ · ١٢ صفًا». UR: «محفوظ ہو گیا · 12 کلاسیں». Arabic plurals via `Intl.PluralRules` (zero/one/two/few/many/other); Urdu one/other |
| **6 Blocked / unsupported** | `BLOCKED` + `blockReason` | `NotYetCard`; companion `puzzled`; no ring | **not_connected:** "AI can't issue certificates for you yet. You can do it yourself in Documents." [Open Documents]. **not_your_role:** "Publishing results is done by the principal. Your request was not sent anywhere." **seat_held:** "Timetables on this campus are run by the principal, Bilal Ahmed." **access_changed:** "Your access changed, so this stopped. Nothing after step 2 ran." **gate_closed:** practice-mode alert | The sentence "Your request was not sent anywhere" is mandatory in all three languages. AR: «لم يُرسَل طلبك إلى أي جهة.» UR: «آپ کی درخواست کہیں نہیں بھیجی گئی۔» Name screens exactly as their nav label reads in that locale |
| **7 Awaiting approver (C)** | outcome `awaiting_approval`, or step `handed_off` | `HandoffCard`; companion `wait`; header envelope badge | "Prepared · with Farah Siddiqui (Admin) in Finance operations · Preview 4F2A. Not applied until she approves." Returned: "Returned by Farah: 'wrong month'." + **Change and resend** / **Drop this step** | Never translated as "completed" or "sent". AR: «مُعَدّ · لدى فرح صدیقی للاعتماد. لا يُطبَّق قبل اعتمادها.» UR: «تیار · فرح صدیقی کے پاس منظوری کے لیے۔ منظوری تک لاگو نہیں ہوگا۔» Quote the approver's note verbatim in their language |
| **8 Paused** | `PAUSED` + `pauseReason` | Grey ribbon; `Alert` | **user:** "Paused. Nothing more will run until you continue." [Continue]. **credits:** "Paused: your school's AI credits have run out. 4 steps are saved; 2 are waiting. An administrator can add credits; then press Continue." (neutral per G51, `openai.ts:441-452`; never a price). **step_cap:** "This request is large. 30 steps are saved; continue to do the rest." [Continue in a new request], seeded with a summary + receipt ids only. **subscription:** "AI actions are paused for your school's plan. Everything saved so far is kept." | Credit exhaustion is PAUSED, never FAILED (T9) |
| **9 Failed, resumable** | `FAILED` (step), or partial adapter result | `Alert tone="danger"` (assertive, the only assertive case besides access_changed and stale); companion `puzzled` | "This step didn't run. Nothing was changed by this step. Earlier steps are saved." [Try again] (same idempotency key) [Change details]. Partial: "7 of 10 saved. 3 were not saved: rooms must have a number." Stale: "Something changed since you looked: Hamza moved to 7C. Check the card again." | Server `SchoolAiError` gets a stable `code` mapped in EN/AR/UR (B.ui finding 9). Until a code is mapped: the localized generic sentence, with the raw text under "Details" |
| **10 Done** | `COMPLETED` | Outcome entry; receipts; header idle | **executed** (at least one write receipt, `validation.ts:12-17`): "Done · 3 changes saved: 12 classes, 48 subjects, 8 periods." **partial:** "Partly done: 5 saved · 2 with Farah · 1 not connected." **answered:** "Here's what I found." (no "Done", no tick). **plan_saved:** "Saved as a plan. Nothing in the school changed." **cancelled:** "Stopped. 2 steps had already run; they are kept." | Heading = worst true state (Partly done > Waiting > Done). AR «اكتمل» / UR «مکمل» only for `executed` with nothing waiting |

Also covered:
- **Offline** (`OfflineBanner`): "You're offline. Your text is kept on this device and not sent."
- **409 from another tab:** "Updated from your other window."
- **Lease held elsewhere** (`service.ts:93`): "Still working on the server. You can leave this page."

### 4.3 Honest-progress rules (binding, enforced in code)

1. **No receipt, no tick, no ink, no seal.** `saved` is set only by the server. `assertReceipt` throws in dev. The Playwright helper `expectNoPrematureDone(page)` asserts that no `[data-ai-receipt]`, inked `[data-ai-ledger-row]` or pressed `[data-ai-seal]` renders before the network response carrying that receipt id. It runs in every spec of these surfaces.
2. **Present progressive until committed.** The past tense appears only with the receipt.
3. **Queued is not delivered.** "Sent" is banned for queued messages and invitations. Delivery counts appear only from delivery events (`announcements-service.ts:65-84`).
4. **Pending is not done.** Invitations read "pending until accepted" (`execution.ts:36`, `inviteAccounts:false`). Guardian links read "unverified".
5. **Prepared is not approved.** A C step shows no tick until the domain receipt exists. "In {name}'s queue" requires a notification row. "Opened" requires a recorded view event; otherwise the stage is omitted.
6. **Reads and drafts are not done.** "Looked up" and "Draft · not applied" never count toward "Done".
7. **Counts, never percentages.** No progress bar for model thinking. `Progress` (`progress.tsx`, `valueText`) is used only for "3 of 7 saved".
8. **Time honesty.** The 8 s and 60 s messages above. Never a silent spin through the 120 s lease.
9. **Failures say what was and wasn't saved**, every time.
10. **Estimates are labelled.** Credits and steps are labelled "estimate", come from the server reservation (T9) and are reconciled on WorkspaceReady ("AI actions used: 9 · estimate was 9").
11. **Practice mode is visible on every surface** while `CURRENT_AI_RELEASE_EVALUATION` is null (`ai-release-evaluation.ts:3-7`) or the prototype fallback is active. Its receipts say "Example · not saved".
12. **Claim words.** Use "built", "prepared", "estimate", "not measured". Never "instant", "autonomous", "fully automatic", "first", "only" (rule 24).
13. **Animation starts and ends on server events, never on a timer** (`prd-revised.md:82`).
14. **Privacy copy claims only what is true.** "Names you pick with @ or from the page are hidden from the AI provider." It does not claim that all names are masked until the engine masks free text (B.engine finding 7).

### 4.4 Choreography timings

| Event | Normal motion | Reduced motion |
|---|---|---|
| Thread entry | 180 ms fade + 4 px rise | 120 ms opacity |
| Ribbon row change | 150 ms crossfade of the status text; tick draws on `saved` | Text and colour only |
| Ledger row ink (Build) | 320 ms ink-in on receipt, max 8 concurrent, others appear at once | 120 ms opacity |
| Seal press | Existing `SealSlot` press | Final state, static |
| Companion | Pose swap only, no walking or flying | Static frame (`paused`) |

Teacher and parent paths at 360 px run **with no motion beyond the tick**. Low-end Android: if `navigator.hardwareConcurrency <= 4` or `deviceMemory <= 2`, Build uses the reduced-motion ledger.

---

## 5. Confirmation and approval interactions

### 5.1 Class B: the exact binding

```ts
type ConfirmBinding = { runId: string; runVersion: number; stepKey: string; pendingKey: string; previewHash: string; idempotencyKey: string };
POST /api/automation/{runId}/confirm   body: { bindings: ConfirmBinding[] }   // length 1 except Build (§5.3)
```
The server re-checks all of these at confirm time and again atomically at execution (rules 3 and 13): role, campus, permission, accessVersion, questionnaire version, run version and preview hash. A mismatch returns `STALE_EXECUTION_PREVIEW` / `STALE_WORKSPACE_VERSION` (`execution.ts:157`, `run-service.ts:59`). The card then goes `stale`, the changed rows are highlighted, and the button becomes **Preview changed: check again**. Focus moves to the first changed row.

**Interaction rules.**
1. **The button is the approval; the conversation is not.** The label is verb + count + object ("Create 12 classes", "Issue LB-0042 to Ayesha Khan (7B) · due Fri 30 Oct"). It stays disabled until the preview for this hash has rendered, plus about 300 ms after any recompute.
2. **Edits invalidate.** Changing any field moves the card to `editing`, requests a new preview and replaces the `PreviewCode`.
3. **High blast** (a static registry flag: more than 50 rows, staff invitations, or `DESTRUCTIVE` risk in Appendix A) adds **"I've checked the list"** (`Checkbox`) and expands the `LedgerList` of changes. It is not a typed phrase, which keeps it accessible and RTL-safe.
4. **Reasons** (`ConfirmAction requireReason`, minimum 10 characters, `confirm-action.tsx:43`) apply only where the domain already demands one, or where the step replaces or removes existing rows. The reason goes into the audit row.
5. **Several B steps in one request** page through one sheet ("1 of 3"), each with its own button and binding. There is **no "confirm all"** outside Build.
6. **The ConfirmBar button is never auto-focused**, which prevents an accidental Enter right after typing.

### 5.2 What a bare "yes" does: nothing

While any step in the visible run is `WAITING_CONFIRM`, the AskBar checks the text on the client against a small affirmative-only lexicon:
- EN: yes · ok · okay · go · go ahead · do it · confirm
- AR: نعم · موافق · تمام · أكيد
- UR: جی · ہاں · ٹھیک ہے · جی ہاں · کر دو

On a match, nothing is sent: **no model call and no credit**. The thread replies locally: "To save, press **Save register** on the card, so you approve exactly what you see. Typing 'yes' doesn't save anything." Focus moves to the bound button. In normal motion it rings once with a 2 px focus ring; there is no pulse animation.

Server defence in depth: `answer` on a `WAITING_CONFIRM` run is rejected (409 `CONFIRM_REQUIRED`), so a lexicon miss still confirms nothing. Voice "yes" (SKO-460, later) follows the same rule (`ROLLOUT.md:13`).

### 5.3 Build: one press, per-step bindings

**Build my workspace** sends `bindings[]` with one `ConfirmBinding` per A/B step that **already has a preview** (U2 binding, U1 lane rule). Rules:
- **Class C is never included.** C steps become hand-offs.
- **Dependent steps** whose preview needs earlier receipts (for example subjects need the ACTIVE cycle, B.typedOps §5) get their own `ConfirmBar` later, inline in the BuildBoard.
- **Drift.** Any step whose hash drifts between press and execution drops back to its own `awaiting_confirm` card. The rest continue.
- **Exhaustive preview.** The `WillCreateDiff` lists every count the batch covers, so the press never covers more than the user can see.
- **Fallback.** If the engine cannot accept a binding array, Build falls back to one `ConfirmBar` per lane (Structure · Teaching · People · Money). An admin then has 4–6 presses.

### 5.4 Class C: requester side

`HandoffCard` shows:
- The same read-only preview and `PreviewCode`.
- **Who:** a named person when exactly one holds the approver seat, otherwise "any campus admin".
- **Where:** the screen's nav label, deep-linked to the exact record version.
- A timeline whose stages appear only when true:
  1. **Prepared**: the draft and preview are saved.
  2. **In Farah's queue**: a notification row exists.
  3. **Opened by Farah**: only if the surface records a view event; otherwise omitted (§12 D9).
  4. **Approved**, with the domain receipt, or **Returned**, with the verbatim note.

Variants:
- **Seat vacant** (no accountant on campus): "No accountant on this campus yet. You approve this yourself in Finance operations. Approval happens there, not here." [Open Finance operations]. The AI never self-approves class C, which retires `service.ts:80-81` for class C.
- **Separation required** (`repository.ts:366-368`, `finance-operations-service.ts:94-98`): "Your school requires someone other than you to approve this. Prepared for Bilal Ahmed (Principal)." Today's dead-end 403 becomes a hand-off.
- **C-self** (access grants and consent the user owns: `pickup.issue_authorization`, `family.trip_consent`, `parent.accept_invitation`, campus-admin invitations): the AI pre-fills the domain screen, and the user finishes it there with the native control. Copy: "Ready on the Pickup screen. Finish it there to give Uncle Imran a pickup code."
- **Withdraw**: available until the approver opens it, or always if "opened" is not tracked.

Class C capabilities: `finance.apply_operation`, `fees.generate_invoices`, `communications.queue_announcement`, `timetable.publish_reviewed`, `students.promote_enrollment`, `academics.transition_year`, `operations.record_risk_decision`, every future publish, access-grant, delete or archive adapter, and the operator bulk register (see §12 D1). Results publication and report sending are **never** registry operations (T4): the hand-off is a deep link to that version's publication page. Papers deep-link to `/ai/studio` (rule 21).

### 5.5 Class C: approver side

- **Notification.** One per hand-off, never batched across requesters. It uses the existing `NotificationCenter` (`RoleHeader.tsx:20-21,96`) and the nav `badge: "approvals"` count (`role-nav.ts:54`). Text: "Payment prepared with AI by Ahmed Raza (Accountant): Rs 12,000 · INV-2026-0412 · Preview 4F2A. Needs your approval." There is **no inline Approve** in notifications, toasts, push or chat. The approver's header Ask indicator shows a berry count "2 for you".
- **HandoffInbox** (`/ai/waiting`, plus an approver Today card) is a read index. Its drawer shows the request, the evidence and the read-only preview. Its one primary action deep-links to the exact record version (`#run-<id>` pattern, `runs-panel.tsx:36-37`). Keyboard: ↑/↓ moves through rows, Enter opens the drawer, ⌘/Ctrl+Enter opens the surface.
- **PreparedByAiPanel** sits above the domain's own preview and controls. It shows: Asked for (verbatim) · What AI filled (provenance chips) · `PreviewCode` (must match) · What approving does (the domain effect text, e.g. `execution.ts:33-49`) · What it does not do ("Approving records the payment. It does not send a receipt to the family.") · AI actions used. Approve and return are the screen's own controls, with `ConfirmAction requireReason` where the domain already uses it.
- **Stale.** If the record drifted, the surface already refuses. The panel then says "Changed since prepared; the requester must prepare it again", and the requester's card goes `stale`.

---

## 6. The per-role first-login sheet

### 6.1 Framework

```ts
type SheetDefinition = { role: UserRole; variant?: "campus" | "group" | "standalone"; version: number; sheets: Sheet[] };
type Sheet = { id: string; title: Localized; estimate: Localized /* "about 1 min" */; questions: SheetQuestion[] };
type SheetQuestion = {
  key: string; type: QuestionType; prompt: Localized; why: Localized;       // "why" = one line on what it produces
  produces: { capabilityKey: string; cls: "A" | "B" | "C"; entity: string }[];  // drives WillCreateDiff + ghost rows
  required: boolean; skippable: boolean; showIf?: Condition; prefill?: PrefillRule;
  answerSchema: ZodSchema;                                                  // typed, replaces string(max 4000) keys
  adapterStatus: "connected" | "not_connected";                             // not_connected → saved for later, tagged
};
type QuestionType = "known" | "pick" | "multiPick" | "stepper" | "tags" | "grid" | "matrix" | "week" | "dayShape"
  | "table" | "people" | "availability" | "moneyLines" | "consentCard" | "invitationCard" | "note";
```

**Rules.**
- **No free-text answers.** The only optional text is one note, "Anything else we should know?". It is saved as a draft note, labelled as such, and never executed.
- **The escape hatch.** "Something else…" on any chip question opens an `Input`. The existing analysis (`setup-answer-analysis.tsx`, `/api/school-ai/setup/analyze`) may *propose* chips, and the user must press them. Prose never becomes records (rule 16).
- **Typed answers are the evidence.** A pressed chip or a grid cell is its own evidence, which removes the brittle `evidenceQuote` substring test for setup (B.engine finding 5).
- **Pressing Next confirms the key.** It adds the key to `confirmedKeys` (T8). Known-fact cards each need a tick, and **All correct** ticks every visible card.
- **One question block per screen at 360**, one sheet (2–4 questions) at 768 and above. At 1440 the companion and a live `WillCreateDiff` sit on the end side.
- **Skip vs. Later.** **Skip** = "doesn't apply to us", and the step leaves the plan. **Later** = "I'll do it myself", and the item becomes a Still-to-do row with a deep link. Required questions show neither, only **Why I need this**.
- **Unconnected questions stay visible.** A question whose adapter does not exist yet is shown with the tag "Not connected yet · saved for later", so coverage gaps stay visible and are not hidden.

### 6.2 Prefill: never ask what Skoolee knows

| Fact | Source | Shown as |
|---|---|---|
| School name, country, city, timezone, currency, language | Registration + wizard (`register.ts:133-171`, `setup-service.ts:369-384`) | `KnownFactStack`. Currency is read-only (changes go through Settings) |
| Academic year label/dates, weekends | Wizard (`setup-service.ts:419-425`) | `known`. Editing deep-links to School settings. The sheet never creates a second cycle |
| Campus | Invitation or seat | Read-only header chip |
| Teacher's classes and subjects | **Allocations only** (`setup.apply_changes` TEACHER_ALLOCATIONS, which needs active, accepted teachers; or the principal's sheet) | `known` if present. If absent: "Not assigned yet. Your coordinator assigns these." This creates a `readiness.update_task` hand-off to the academic lead, or a Still-to-do row. A teacher never assigns herself, and the system **never fabricates known facts** |
| Parent's children | **Verified** guardian links only (rule 8) | `known`. A missing child becomes "Ask the school office", a message to the campus office (`chat.send_message`, B), never a self-link |
| Student's class/subjects | Enrolment | `known`, read-only. A correction goes to the class teacher or office |
| Existing records on re-entry | Live counts (`setup-journey-service.ts:10-41`) | "You already have 12 classes. Keep them?" Services KEEP existing rows |
| Admin's earlier draft (e.g. fee heads) | ONBOARDING record | Prefilled for the accountant, marked "from Ayesha's setup" |

### 6.3 The Build moment

1. The last answer is confirmed. The companion says "That's everything I need. Here's what will happen." The `WillCreateDiff` shows three articles:
   - **Pressing Build creates**: "12 classes · 48 subject slots · 8 periods · 14 rooms · 9 staff invitations (pending until accepted)".
   - **Prepared for someone else to approve**: "Fee structure for 12 classes → Sana Malik (Accountant)", or "→ you, in Finance (no accountant yet)".
   - **Not from this sheet**: "Students: import a roster (Student list → Import)", "Guardian access: after students exist", "Fee reminders: not connected yet".

   Footer: "Estimate: 23 steps · about 9 AI actions · you have 480 · 2 approvals by others". This is the server reservation (T9).
2. The primary button is **Build my workspace**, with role variants "Set up my classes" and "Set up my family home". The secondary is **Review answers**. The press sends per-step bindings (§5.3) and reserves the credits.
3. The BuildBoard opens.
   - ADMIN/CAMPUS_ADMIN/SUPER_ADMIN: the ink cover with `CharterLedger` rows per lane, inking only on receipt, plus `SealSlot open → pending`.
   - Other roles: a plain ribbon, no cover.
   - A dependent B step shows its own `ConfirmBar` inline, and the other rows dim. On a phone it is a sheet.
   - C rows read "Prepared → with {name}".
4. The seal **presses** only when every A/B row has a receipt or an explicit skip. It goes `failed` (warning ring) on any failed A/B row: "Built with 1 problem. Fix it below."
5. **WorkspaceReady** (`/ai/setup/[runId]`). Heading through `InkHeading`:
   - "Your campus is set up" only when nothing is waiting.
   - Otherwise "Your campus is mostly set up: 3 things are with other people".

   Sections: **Created** (receipts with Open links) · **Queued / pending** ("9 invitations · 0 accepted yet", live) · **With others** (mini `HandoffCard`s) · **Not connected yet** (manual link each) · **Later** (skipped questions). Footer: "AI actions used: 9 (estimate 9)" · **Print / save PDF** · **Try your first request** (three role chips, the bridge into AI Workflows).
6. **Copy fix in the same slice.** `src/app/onboarding/page.tsx:34` ("nothing applies until you approve it") becomes, in EN/AR/UR: "After your answers you'll see exactly what will be created. Nothing is created until you press Build. Anything about money, messages to families or access waits for the person who approves it." Drafts:
   - AR: «بعد إجاباتك سترى بالضبط ما سيُنشأ. لا يُنشأ شيء قبل أن تضغط "أنشئ". وكل ما يتعلق بالمال أو رسائل الأسر أو الصلاحيات ينتظر من يعتمده.»
   - UR: «جوابات کے بعد آپ دیکھیں گے کہ بالکل کیا بنے گا۔ "بنائیں" دبانے سے پہلے کچھ نہیں بنتا۔ پیسے، گھرانوں کو پیغامات یا رسائی سے متعلق ہر چیز منظوری دینے والے کا انتظار کرتی ہے۔»

### 6.4 Resume

- `SetupBar` autosaves on every change (`saving | saved | dirty | failed`). The record version increments on every confirmed answer.
- On return the companion says "Welcome back. We were on *School day*." and reopens at the first unconfirmed question. `DraftRecovery` covers interrupted sessions.
- **After Build**, "Change answers" starts a new version, and re-building shows **only the delta** ("2 new subjects"), because services KEEP existing rows.
- **Today card:** "Finish setting up · 2 sheets left". **Account menu:** "My setup".
- **Dismissal.** Non-campus roles may dismiss the sheet on first login. For campus admins the sheet stays as the Today hero until Build has run once.

### 6.5 How the 11 roles differ

Rules for this table:
- The "Builds" column is what the role's adapters would produce. The digest's adapter lists apply, and anything not connected yet is tagged on the sheet.
- **Today's connected set** is the 15 typed operations (`execution.ts:33-49`) plus the role adapters `students.create`, `campus.create`, `library.create_books`, `front_desk.log_call`, `profile.update`, `personal.save_plan` and platform ops (`role-action-service.ts:12-56`).
- Tone per role lives in `ai-workflows-copy.ts`.

| Role | Sheets (≈ time) · tone | Key questions (type) | Builds (A/B, receipts) | Prepared for others (C) / still to do |
|---|---|---|---|---|
| **ADMIN** (standalone owner) | 5 sheets, ≈ 7 min · brisk: "Let's get your campus standing" | Known facts; startingPoint (pick); gradeLadder (grid) + teachingMode (pick); subjectsByGrade (matrix); dayShape (dayShape) + rooms (stepper/tags); staffRoster (table); feePlan (moneyLines, only when the admin holds the finance desk); studentsRoster (pick → staged import); leavePolicy (stepper); campusServices (multiPick); familyMessaging (multiPick) | classes/sections (`academics.setup_year` with existingCycleId, B) · subjects, periods, rooms (`setup.apply_changes`, B) · staff invitations **pending** (B, high-blast) · teacher allocations for already-active teachers only (B) · fee structure *when the desk is held* (fees.* adapters, not connected yet) · leave types · messaging settings · readiness tasks (A) | Leader invitations (principal, accountant) → People & access (C) · fee structure → accountant when the seat exists · timetable drafts/publication → academic lead · students via the Import review · guardian access (C) · readiness sign-off |
| **CAMPUS_ADMIN** | 5 sheets, ≈ 7 min · brisk | sessionConfirm (known/pick), workingWeek (week), classLadder (grid), subjectMatrix (matrix), bellSchedule (dayShape), rooms, holidays (date), staffInvites (table), classTeachers (people), studentIntake (pick), staffStructure (pick), leavePolicy, feeHeads (tags, only with no accountant), campusServices | DRAFT cycle only when none exists · weekends/holidays · classes, subjects, periods, rooms · allocations (active teachers; class teacher only with the academic-lead seat) · reviewed roster · hierarchy preset · leave · fee setup without an accountant | Year activation → principal (C) · invitation delivery (C) · guardian links (C) · timetable publication (C) · grading and attendance-counting rules → academic lead · exam session → Exam Studio · library rules → librarian |
| **SUPER_ADMIN** (group) | 3 sheets, ≈ 5 min · strategic | campusRoster (table: name, city, phone); planHeadroom (pick, only above `maxCampuses`); campusLeaders (people rows per campus, "I'll add later"); standardsScope (grid locked/default/campus); gradingStandard (pick + steppers); calendarStandard (week + stepper); standardsReviewer (people); staffStructure; messagingRules; homePriorities | campuses (`campus.create`, B, inside plan capacity) · group policy templates + DRAFT versions (B) · submitted for review (receipt: "submitted, not live") · hierarchy preset · leave types · messaging policy · own preferences (A) | Campus-admin/principal invitations → C-self on People & access (MFA) · delegation grants (C) · standards approval → named reviewer · plan change → APP_OWNER review · sign-in domain verification → school IT · **each campus build belongs to that campus admin's own sheet**. Lands on `GroupLaunchBoard` |
| **PRINCIPAL** | 3 sheets, ≈ 4 min · academic | firstPriority (pick); yearStart (pick → C); classTeachers + subjectTeachers (people grid); missingSubjects (tags); weeklyLessons (stepper); dayShape (known from admin); timetableScope (multiPick); teacherWeeklyCap (stepper); gradingScale (pick); examWindows (date ranges); improvementFramework (pick) | allocations (B) · missing subjects (B) · workload caps (B) · DRAFT timetables (`timetable.create_school_drafts`, B) · exam session plan (`exams.create_session_plan`, B) · grading model DRAFT (B) · launch plan (A, plan_saved) | Year activation (`academics.transition_year`, C, own screen) · timetable publication (`timetable.publish_reviewed`, C) · grading activation (C) · periods/rooms/holidays → campus admin · papers and syllabus → **Open Exam Studio** deep link only |
| **TEACHER** | 3 short sheets, ≈ 90 s total, each resumable on its own · collegial: "Let's make your Monday easier" | Sheet 1 = the existing `/teacher-onboarding` profile steps + preferredLanguage + professionalGaps (only null fields); Sheet 2: assignmentCheck (known allocations: Correct / Something's wrong), focusAreas (multiPick), startingUnits (pick per subject); Sheet 3: meetingHours (availability), classTests (rows: date + total marks, or Not yet), marksEntry (pick), weeklyDigest (pick) | profile (A) · private fortnight checklist and teaching plans (A, **draft/plan_saved**) · meeting windows (B) · class tests (B) · scan templates (A) · digest **draft, not sent** (A) · link resources as DRAFT (A) | Wrong allocation → academic-lead task (B) · digest approval and send → teacher on the review screen (C, family message) · releasing homework and publishing resources happen on their screens · papers → Exam Studio. **Never** attendance, marks or self-assignment from the sheet |
| **ACCOUNTANT** | 3 sheets, ≈ 5 min · precise | booksStartPoint (pick); collectionAccounts (tags, names only; account numbers never via AI); paymentMethods (multiPick); chartOfAccounts (pick); feeHeads (tags, prefilled from the admin draft); classFeeGrid (moneyLines); billingCalendar (stepper); lateFeeRule; discountTypes; taxOnFees; reminderPlan (multiPick → C); openingBalances (pick → C) | chart of accounts, collection accounts, payment methods, fee heads, groups, master lines, assignments, fine rule, discount types, tax package DRAFT (all B) | First invoice run (`fees.generate_invoices`, C, from the Invoices preview) · opening balances (C) · reminder POLICY → campus admin · tax sign-off → institution authority · payroll readiness → campus admin then accountant · IBAN entry stays human-only |
| **LIBRARIAN** | 2 sheets, ≈ 3 min · orderly | loan days, max loans, renew/hold (steppers); closures (date); late fines + lost book (pick → C); sections (tags); first titles (table); copy labels (pick); borrowers (multiPick); member numbers (pick); purchase list (table → draft) | loan policy (B, money fields stay 0) · sections (A) · titles (`library.create_books`, A, **connected today**) · copies (B) · members for existing accounts only (B) · purchase request DRAFT (B, never auto-submitted) | Fine and charge amounts → campus admin approval (C) · members without accounts → admin · overdue notices → admin/principal (C) · spreadsheet/photo catalogue import → SKO-460 |
| **RECEPTIONIST** | 2 sheets, ≈ 2 min · warm, efficient | language (pick); deskPhone; deskDuties (multiPick); openCallbacks / openPost / openEnquiries / openComplaints / visitorsOnSite (table rows of what is open **today** only; no history is fabricated); documentTypes + languages (multiPick); deskRoutine (tags) | profile (A) · call logs (`front_desk.log_call`, A, **connected today**) · post (A) · enquiries, complaints, on-site visits (B) · certificate template drafts (B) · desk checklist (A, plan_saved) | Template approval → campus admin (C) · admission form publish → admin · confidential complaint owners → campus leader · pickup restrictions → admin · child-safety concerns → the receptionist personally at `/care`, **never AI** |
| **PARENT** | 2 sheets, ≈ 60 s · warm, short: "Two minutes, and your home will show what matters for Ali and Sara" | pendingInvitations (**invitationCard**, native Accept / Not me, C-self); childrenCheck (known verified links: Correct / Something's wrong); language (pick); contactPhone; updatesChannel (pick per topic); familyGoals; availability; pickupHelpers (tags, saved only); canteenSetup; meetTeacher; openAbsences (pick per open absence); openConsents (**consentCard**, native, version-bound, C-self) | language (A) · phone (B) · WhatsApp **opt-out** (`communications.set_guardian_channel_preference`, B; see §12 D6) · family plan (A, plan_saved) · canteen limit + dietary record "needs confirmation" (B) · meeting booking when a window is open (B) · absence explanations "pending review" (B) · office message on a child mismatch (B) | WhatsApp **enable** → campus admin with consent evidence (C) · link corrections → campus admin · dietary confirmation → canteen lead · pickup day passes → the parent later on Pickup (C-self) · trip consents → the native card only |
| **STUDENT** | 2 sheets, ≈ 90 s · encouraging, never childish | language; focusSubjects (multiPick from enrolment); studyTimes (availability); planTarget; planLeadDays (stepper); termGoal; goalAudience (multiPick → B); goalFirstStep (date); counsellorMeeting (pick → B); portfolioPick (pick → B) | language (A) · "My study plan" (A, plan_saved) · private goal + first step (A) · goal audience (B) · counsellor appointment **requested** (B, the counsellor confirms) · portfolio entry **sent for teacher review** (B) | Wrong class or subjects → class teacher or office · parent account link → school office · leave requests → parents only |
| **APP_OWNER** | 1–2 sheets, ≈ 2 min · operator | language, identity (known); focusAreas, queueTriage (multiPick); institutionFixes (multiPick + per-row field); leapPilot (structured form → B); capacityGuard (B, only if chosen); defaultPricing / paymentGateway / firstSchool shown as **prepared** items | profile (A) · "Owner desk" checklist (A, plan_saved) · audited institution fixes (B, one confirm per row) · DRAFT pilot charter (B) · capacity policy (B, revertible) | Pricing change (C, step-up MFA) · Stripe onboarding (hosted page; bank details human-only) · school provisioning (presses Provision on the prefilled form) · emergency support grants → that school's authority · tenant work needs a support grant (rule 19) |

### 6.6 SUPER_ADMIN / group path

Sequence: wizard → group sheet → Build creates campus records → **GroupLaunchBoard**. Each campus tile shows:
- Campus record ✓, with its receipt.
- Campus-admin invitation: prepared → pending until accepted → accepted.
- That admin's sheet progress ("Sheet 3 of 5"), read from their ONBOARDING record.
- That campus's receipt count.

Copy: "Each campus admin gets their own setup when they first sign in. You'll see their progress here." No campus writes beyond creation (rule 19). Layout:
- **1440:** `CampusPlan` arc (`active | draft | slot`) above a `Table`, with `CapacityMeter` for package places.
- **768:** 2-column tiles.
- **360:** a list.

### 6.7 Teacher-between-lessons path

- The teacher sheet is three independent sheets of at most 4 questions each. Each one saves and ends on its own, with no "you must finish" gate.
- The Today card offers **"1 minute: Your week"**, and the period-aware chip appears only when the timetable says she has a free period.
- Sheet 1 is the existing `/teacher-onboarding` flow, so no step is duplicated.
- Everything on one-thumb reach at 360. `StepDock` stays sticky and never rides the keyboard. The companion is the 40 px head crop. There is no ink cover and no motion.
- **Exit at any point.** Unanswered items land in Later, never as silent defaults.
- **Teacher Build.** The ribbon reads "4 saved · 1 draft (not applied) · 1 with your coordinator", followed by three first-request chips, e.g. "7B register · period 3", shown only if the teacher register adapter has shipped.

---

## 7. Free-form AI Workflows

### 7.1 Composer: the AskBar and the AskPalette

**Two entry points, one engine.**
- **AskBar** on Today and `/ai`.
- **AskPalette** from any page (⌘K / Ctrl+K, or the header Ask `IconButton`).

**What a submit does.**
- It creates a run via `POST /api/automation`, with the existing route and its rate limit of 10 starts per 5 min (`route.ts:8`).
- The page's `useAskContext` chips ride along as typed ids, e.g. `7B` `Attendance` `Thu 23 Oct`.
- @-mentions resolve to scoped entities.

**Busy-state guards.**
- A second ask while a run of yours is waiting opens "Start another request? Your register is still waiting for you." through `ConfirmAction`.
- A second ask never silently replaces the current run.

**Context-chip rollout.**
- Pages register chips through `useAskContext`, one page at a time.
- The first 12 pages: teacher register, marks, class, student, invoice, lending desk, visitors, leave approvals, fees, timetable, and both Today pages.
- Pages without registration send a context-free ask. On those pages the palette says "No page details attached".

### 7.2 Role suggestions

**Rules.**
- Suggestions are **server-computed** from three sources: the schedule (next period, unmarked register, overdue loans), the user's pending work, and the role's registry entries that have adapters.
- The **class comes from the registry**, never from the model or the chip.
- Results are cached for 60 s per user.

**Gates.**
- A chip appears only if its adapter exists **and** the gate passes now.
- Opening a chip still goes through the server: it builds the preview, the `previewHash` and the `pendingKey`, re-checks role, campus, permission and accessVersion, and charges credit if a model call is needed.
- A chip whose gate changed renders a `NotYetCard`, never a card that cannot be submitted.
- A chip with a full prefill **skips the planning call**, which saves a credit and a round trip.

| Role | Starter chips (only those with shipped adapters render; the rest live under Atlas → Not connected) |
|---|---|
| TEACHER | "7B register · period 3" (B) · "Set homework for 8A Maths, due Thursday" (B) · "Draft remarks for 7B English" (A, draft) · "Apply for leave on Monday" (→ leave approver) · "Make a quiz → Exam Studio" (route) |
| LIBRARIAN | "Issue a book" (B) · "Return LB-0042" · "Renew Bilal's loan a week" · "Add 3 copies of *Atlas*" (A, connected today) |
| RECEPTIONIST | "Log a call from Mrs Khan" (A, connected today) · "Check in a visitor for the principal" (B) · "New admission enquiry" (B) |
| ACCOUNTANT | "Record a cash payment" (C, connected today) · "Invoices for Grade 5, November" (C, connected today) · "Who owes more than 2 months?" (read) |
| PRINCIPAL | "Draft timetables for Grades 6–8" (B, connected) · "Mid-term session plan" (B, connected) · "Cover Ms Noor, periods 2–4" (`timetable.assign_substitutes`, connected) · "Open Exam Studio for Grade 9 Physics" (route) |
| ADMIN / CAMPUS_ADMIN | "Add Grade 11 with 2 sections" (B, connected) · "Invite 3 teachers" (B, pending) · "Add a holiday on 12 Nov" (B, connected) · "Message Grade 6 families about the trip" (C, queued) |
| SUPER_ADMIN | "Add a campus in Lahore" (B, connected) · "Who runs each campus?" (read) · "Invite a campus admin for Gulberg" (C-self) |
| PARENT | "Tell school Hamza is absent tomorrow" (B) · "Book a meeting with Hamza's class teacher" (B) · "What's due this week?" (read) · "Change my language" (A, connected) |
| STUDENT | "Plan my week for the Physics test" (A, plan_saved, connected) · "Ask for help in maths" · "What's due Friday?" (read) |
| APP_OWNER | "Which schools are on trial?" (read, connected) · "Update a school's city" (B, connected) |

### 7.3 Missing-detail prompts

- **At most one question screen.** It is asked **as a field**, never as a chat bubble. When three fields are missing they are all highlighted on one card, which still counts as one screen. A card shows its own completeness ("2 of 3 details filled").
- **Widgets come from the adapter's input schema:**
  - `entity`: real records with disambiguators, e.g. "Ali Raza · 7B · Roll 12" / "Ali Khan · 7B · Roll 19", plus "Neither". The model sees pseudonymised tokens only (T11).
  - `date`: "Today · Tomorrow · Fri 30 Oct · Pick a date…".
  - `amount`: currency adornment, formatted through `formatMoney`.
  - `choice`.
  - `text`: the last resort, one line.
- **Answers return as structured values** (`{ field, value, display }`), never prose. A picked entity is its own evidence.
- **Deferral.** Questions a later step needs are deferred to that step ("Step 3 needs a due date"), so the ribbon appears early.
- **Nothing runs** while a required field is `missing`.

### 7.4 Progress

- **1–2 step runs** render inline in the RunSheet thread: request → (detail) → card → receipt.
- **Runs of 3 or more steps** show a `ProgressRibbon` above the active card.
- **On `/ai`** the ribbon can expand into the ledger view used by Build.
- **Mixed classes.** A runs, B waits, C is prepared. The outcome is `partial` or `awaiting_approval`, never `executed`, while anything is waiting.
- **Navigation.** Page lists listen for a `skoolee:receipt` DOM event carrying `{ capabilityKey, ids }` and revalidate (`router.refresh()` or their SWR key), so the new row lands behind the panel. Closing the RunSheet never cancels the run, and the close control says so.

### 7.5 History

`/ai` home zones:
1. AskBar + rail.
2. **Needs you** (`WAITING_INPUT` / `WAITING_CONFIRM`).
3. **With others** (live hand-off status).
4. **Done recently** (receipts).
5. **History**: `RunHistory` with `ViewTabs` Needs you · With others · Done · Stopped. Server-paginated, so the 20-job cap is gone.

Run actions:
- **Continue from this** starts a linked run, seeded with a summary and receipt ids only (B.engine findings 7 and 10).
- **Archive** is soft. Retention is engine-owned.

### 7.6 "What AI can do here"

`CapabilityAtlas` is derived at runtime from the registry plus the caller's live gates (matrix flags, predicates, seats) and grouped by the role's own `ROLE_NAV`, so it doubles as the coverage checklist.

- **Header:** "AI is connected to {n} of {m} things you can do in Skoolee". It uses the real number and rises as adapters land.
- **Each row:** the capability in plain words · its class badge ("Runs on its own" / "You check and confirm" / "Goes to {role}") · an example phrase (tap to fill the bar) · or "Not connected yet · Open Homework →".
- **Grouping:** Here (this route) · Elsewhere · With approval · Not connected (greyed, never hidden) · Not your role (with who does it, T13).
- **Logging:** every `NotYetCard` logs an "asked but not connected" event, so the founder gets a ranked list of next adapters.

---

## 8. Responsive, RTL and accessibility

### 8.1 Breakpoints

| Surface | 360 (hard minimum 320) | 768 | 1440 |
|---|---|---|---|
| AskBar | Docked above the mobile tab bar (offset `--mobile-nav-height`, `RoleShell.tsx:354`). On focus it lifts above the keyboard, the rail appears, and the tab bar hides | Inline at the top of the Today card; rail visible | Inline in the Today header band, max 46rem |
| AskPalette | `ModalSurface fullscreen`; send button sticky above the keyboard | `Modal` 90vw | `Modal md` ≈ 40rem, 12vh top |
| RunSheet | Fullscreen sheet; sticky `ConfirmBar` whose effect + count stay visible while the preview scrolls | End-side panel, 26rem, with scrim | End-side panel, 30rem, no backdrop (page usable); docked centre column on `/ai` |
| TaskCard | Single column; exceptions-first rosters, virtualised above 40 rows; preview shows 3 rows | 2-column short fields | Same; up to 40rem on `/ai` |
| `/ai` home | Stacked, sections collapsed to counts (`CollapsiblePanel`) | Two columns | Three zones: run list (start) · RunSheet (centre) · Atlas (end, collapsible) |
| WorkspaceSheet | One question block per screen; `SheetRail` shows only the current title; companion 40 px | One sheet per screen | Sheet centre, companion + live `WillCreateDiff` on the end side |
| BuildBoard | Collapsed lanes; only the active lane is expanded; earlier lanes become one-line receipt summaries | Two columns | Ink cover + ledger + seal |
| Diff tables | Scroll inside their own container with a sticky first column; the page never scrolls horizontally | — | — |

At 320 px:
- Chips wrap to two lines rather than truncate.
- Tab labels shorten.
- Roster rows become two-line stacked cards.
- Body text never goes below 14 px; metadata never below 12 px (`text-2xs` is the floor).

Reflow holds at 400% zoom.

### 8.2 RTL

- Logical properties only (`ps-*`/`pe-*`, `start-*`/`end-*`, `inset-inline-end`), never left or right. Panels dock to the logical end, so they sit on the left in RTL.
- Directional icons use `rtl:rotate-180` (`guided-setup.tsx:215`). Arrow-key navigation mirrors.
- The companion SVG mirrors with `scale: -1 1` on its wrapper; its props carry no text.
- Ids, roll numbers, ISBNs, phone numbers, amounts, times and `PreviewCode` sit in `<bdi dir="ltr">` (the `LedgerRow ltr` prop, `ReviewSheet.tsx:50`). Names inside AR/UR sentences use `<bdi>`.
- Digits come from `Intl.NumberFormat(locale)`, with one convention per locale. Never hard-code digit shapes.
- Urdu uses the Nastaliq line-height handling from `urdu-input.tsx`. Inputs use `dir="auto"`.
- The rail scrolls from the right in RTL. Timetable and availability grids start the first weekday at the start side.

### 8.3 Keyboard

| Context | Keys |
|---|---|
| Global | ⌘K / Ctrl+K opens or closes the palette. It is the one merged listener (`command-palette.tsx:51-56`) and can be turned off in settings |
| Palette | ↑/↓ moves, Enter runs the row, ⌘/Ctrl+Enter always asks, Esc closes and returns focus to the invoker |
| AskBar | Enter sends, Shift+Enter is a newline, IME-safe; Alt+↑ jumps to the latest open question |
| Chips / rail | Roving-tabindex toolbar; arrows mirror in RTL; Space/Enter toggles (`aria-pressed`) |
| TaskCard | Tab order: first `needs you` field → other fields → ConfirmBar. The ConfirmBar is never auto-focused |
| Grids (GradeSectionGrid, SubjectMatrix, AvailabilityGrid) | Native inputs with row and column headers; arrows move cells |
| HandoffInbox | ↑/↓ rows, Enter drawer, ⌘/Ctrl+Enter surface |
| Skip links | "Skip to card" and "Skip to conversation" at the top of the RunSheet |

There are no single-letter shortcuts (WCAG 2.1.4 risk avoided entirely).

### 8.4 Screen reader

- **One shared polite live region (`AiAnnouncer`)** per RunSheet. It announces receipts and state changes only, throttled to one message per 3 s and batched ("2 more steps saved").
- **No announcements while focus is in the composer**, except assertive ones.
- **Assertive** (`Alert`, `alert.tsx:54`) only for failed, access-changed and stale.
- **Thread:** `role="log"`. **Ribbon:** an `<ol>` with `aria-current="step"`, not a `progressbar`.
- **Provenance** is part of each field's accessible description ("Status, absent, from your words: Ali and Sara absent").
- **Class badges** carry full text and never rely on colour alone.
- **Decoration:** the companion and stage art are `aria-hidden` (`AiGuide.tsx:14`).
- **Grids:** the timetable and availability grids are real `table`s with `th scope`.

### 8.5 Focus choreography and return

| Event | Focus moves to |
|---|---|
| A user-started run reaches needs-detail or confirm | Its first `needs you` field, or the card heading (`tabIndex={-1}`) |
| A **background** run changes state | **Nowhere.** Only the header indicator and the polite region change |
| Confirm succeeds | The new receipt heading |
| Stale preview refresh | The first changed row |
| RunSheet / palette / drawer close | The invoker (chip, bar, header button) via `returnFocusTo` (`ModalSurface` already does this, `modal.tsx:392`) |
| Deep link to an approval surface and back | The hand-off card via `#step-<key>` |
| Build finishes | The `WorkspaceReady` `InkHeading` h1 |

### 8.6 Reduced motion and low-end devices

One `useReducedMotion()` hook, extracted from `GuideShowcase.tsx:32-54`. With it on, or on low-end devices (§4.4):
- No ink animation, seal press or tick draw.
- Static companion frames.
- 120 ms opacity transitions.

Everything is understandable from text alone. `Progress` already has `motion-reduce:transition-none`.

---

## 9. Copy principles and vocabulary

### 9.1 Principles

1. **Say what is true now, then what happens next, and name who decides.** Example: "Not applied until Farah approves", never "will be applied".
2. **Short, declarative, second person.** No exclamation marks, no "Oops", no "Great!", no "AI magic".
3. **Name people and screens** exactly as the nav label reads in that locale.
4. **Every failure says what was and wasn't saved.**
5. **The button says the effect and the count.**
6. **Registry-owned localized titles** with slots ("Create {count} classes"), so EN/AR/UR do not depend on the model's language compliance. Model prose is only ever a `note`, never a status.
7. **AR: Modern Standard Arabic**, respectful and gender-neutral (prefer noun phrases: «مطلوب تأكيدك»). Perfect tense only after a receipt. "AI" = «الذكاء الاصطناعي».
8. **UR: the formal آپ register.** "AI" = «اے آئی» (existing, `automatic-workspace.tsx:20`). No English loanwords for status words. Role names come from the existing role catalogue.

### 9.2 One word per state (all roles, all languages)

| State | EN (badge / status word) | AR | UR | Banned alternatives |
|---|---|---|---|---|
| Planning | Planning | قيد التخطيط | منصوبہ بندی | "Thinking", "Generating" |
| Needs detail | Needs you | بانتظارك | آپ کا منتظر | "Error", "Required!" |
| Class B pending | Check | للمراجعة | جائزہ | "Approve", "Confirm" (alone) |
| Running | Working | جارٍ التنفيذ | جاری | "Done soon", percentages |
| Write receipt | Saved | تم الحفظ | محفوظ ہو گیا | "Completed" before a receipt |
| Read receipt | Looked up | تم الاطلاع | دیکھ لیا | "Done" |
| Draft | Draft | مسودة | مسودہ | "Saved" (alone) |
| Queued message | Queued | في قائمة الانتظار | قطار میں | **"Sent"**, "Delivered" |
| Invitation | Pending | معلّقة | زیرِ التوا | "Added", "Sent" |
| Class C | With {name} | لدى {name} | {name} کے پاس | "Approved", "Completed" |
| Approved elsewhere | Approved | تم الاعتماد | منظور | — |
| Returned | Returned | أُعيد | واپس | "Rejected" |
| Unsupported | Not connected | غير متصل بعد | ابھی منسلک نہیں | "Forbidden", "Error" |
| Not your role | Not your role | ليس ضمن دورك | آپ کے کردار میں نہیں | "Denied" |
| Paused | Paused | متوقف مؤقتًا | رکا ہوا | "Failed" (for credits) |
| Failed | Didn't run | لم يُنفَّذ | نہیں چلا | "Oops" |
| Stale | Changed | تغيّر | تبدیل ہو گیا | "Conflict" |
| Done | Done | اكتمل | مکمل | — |
| Partial | Partly done | اكتمل جزئيًا | جزوی مکمل | "Completed" |
| Cancelled | Stopped | أُوقف | روک دیا | "Undone" |
| Practice | Practice mode | وضع التدريب | مشق موڈ | "Demo AI", "Beta" |

Translators review every AR/UR string. Arabic plural forms go through `Intl.PluralRules`. About 150 new catalogued strings × 3 languages, plus the server error-code map.

---

## 10. LEAP five-minute demo arc

**Setup.**
- A seeded synthetic tenant, "Al-Noor Grammar, Lahore", extending `scripts/demo/seed-*`. It carries a persistent `Badge`: "Demo school · synthetic data".
- **Practice mode** stays labelled on every screen unless a real educator-reviewed evaluation is recorded (rule 12). Nothing implies live autonomy.
- **Devices:** laptop 1440 (admin), tablet 768 (approver), phone 390 (teacher, parent), mirrored on stage.
- **Seed:** two **accepted** teachers, so the admin build's TEACHER_ALLOCATIONS step has active teachers and produces a receipt. The teacher's "known classes" then come from that receipt, never a fabricated fact.

### 10.1 Primary arc (assumes the demo-critical adapters ship)

| Time | Who · device · language | Screen | Beat |
|---|---|---|---|
| 0:00–0:30 | ADMIN · laptop · EN | WorkspaceSheet greeting | The admin companion waves. `KnownFactStack`: school, city, timezone, session, weekend, then **All correct**. *"It never asks what it already knows."* |
| 0:30–1:20 | same | Sheets | Grade grid 1–6 × A/B (two taps); SubjectMatrix "same as previous grade"; PeriodBuilder 08:00 · 40 min · break after 4th; staff table pasted. Ghost rows appear for the skipped fee heads. `WillCreateDiff`: Creates · With Sana (Accountant) · Not from this sheet (students: import). "Estimate 23 steps · about 9 AI actions" |
| 1:20–2:00 | same | BuildBoard | **Build my workspace.** Ledger rows ink in on receipts: 12 classes, 48 subjects, 8 periods, 14 rooms, allocations for 2 teachers. "9 invitations · pending until accepted". "Fee structure · with Sana". Seal stays `pending`, then the heading "Mostly set up: 1 thing is with Sana" |
| 2:00–2:50 | TEACHER · phone · **Urdu RTL** | Today → chip → TaskCard | Known classes "7B Science" come from the build's receipt. Chip "7B register · period 3", then typed absences with provenance chips, the Ali disambiguation, **Mark the other 31 present**, **Save register · 31 present, 2 absent** · Preview 7C1D → receipt. An on-stage timer reads ≈ 0:20. On a second card she types «جی» and the hint points to the button: *"Typing yes saves nothing."* |
| 2:50–3:40 | ACCOUNTANT → ADMIN approver · laptop + tablet · EN | HandoffCard → notification → Finance operations | "Record Rs 12,000 cash from Bilal's father for October" (connected today via `finance.apply_operation`). An invoice detail is picked, then "Prepared · with Farah (Admin) · Preview 4F2A". On the tablet: header badge "1 for you" → `/ai/waiting` → Finance operations with `PreparedByAiPanel`, the same 4F2A. Approve with the screen's own control. The laptop card flips to "Approved by Farah · 14:02" |
| 3:40–4:20 | PARENT · phone · Arabic | Parent sheet (2 sheets) → first chip | Children known (verified links). Channel per topic. "Hamza is absent tomorrow" → B card → receipt "Absence note · pending school review". The home shows Hamza's absence **from the register read**, with no implied family message from the school |
| 4:20–4:45 | LIBRARIAN · phone · EN | AskBar | "Add 3 copies of *Atlas of the World*" (connected today, `library.create_books`) → receipt. Then "Publish the Grade 9 results" → NotYetCard: "Publishing results is done by the principal. Your request was not sent anywhere." |
| 4:45–5:00 | ADMIN · laptop | `/ai/can-do` + WorkspaceReady | "AI is connected to {n} of {m} things you can do." WorkspaceReady: Created · Pending · With others · Not connected. *"Everything you saw has a receipt, or says who decides."* |

### 10.2 Demo-critical adapter list

**Connected today:**
- `academics.setup_year`
- `setup.apply_changes` (SUBJECTS / PERIODS / ROOMS / STAFF / TEACHER_ALLOCATIONS)
- `finance.apply_operation`
- `library.create_books`
- `profile.update`
- `personal.save_plan`
- `campus.create`
- `front_desk.log_call`
- `timetable.create_school_drafts`
- `exams.create_session_plan`
- `attendance.record_register` (operator only)

**Must ship for the primary arc:**
1. `attendance.save_register`: the teacher's own-class register (B), per-learner evidence, T3.
2. `parent.explain_absence` or `family.request_leave` (B).
3. `fees.create_fee_type` / `create_fee_group` / `create_master_line` / `assign_fee_group`, as the prepared fee structure that hands off to the accountant.
4. `communications.set_guardian_channel_preference` as a parent opt-out adapter (B).

Plus the engine prerequisites: persisted plan, `WAITING_CONFIRM`, `awaiting_approval`, receipt-carrying StepView, structured asks, observe-only read model, per-step binding array.

### 10.3 Fallback arc (only adapters connected today; every beat still ends on a real receipt or an honest NotYetCard)

| Beat | If missing | Swap to |
|---|---|---|
| Teacher register | `attendance.save_register` | The teacher asks; a **NotYetCard** reads "AI can't save registers for teachers yet. Open Register →". The register beat moves to a CAMPUS_ADMIN on a campus with no principal seat using `attendance.record_register` (operator, class per §12 D1), with the same card, code and receipt. Then the teacher's "Draft my lesson plan for 7B" (plan_saved, "Draft · not applied") |
| Admin fee hand-off | fees.* structure adapters | The fee question is tagged "Not connected yet · saved for later", and WorkspaceReady lists it under Not connected. The C beat stays the accountant payment (`finance.apply_operation`, connected) |
| Parent absence | `parent.explain_absence` | Parent sheet: language (`profile.update`, A, receipt) + family plan (`personal.save_plan`, plan_saved). The absence ask shows a NotYetCard |
| Parent channel | channel adapter | The question shows "Not connected yet". No beat depends on it |

Every beat also has a **pre-recorded run** in the demo tenant, reopenable from `RunHistory`. If the network drops, the presenter reopens the completed run and never fakes one. `OfflineBanner` stays honest.

---

## 11. Build notes for the engineer

### 11.1 Order (slices; each ships on its own and regresses nothing)

0. **S0 — engine contract (hard prerequisite, architecture track).**
   - `RunView`/`StepView` read model.
   - `WAITING_CONFIRM` and `CANCELLED`.
   - `awaiting_approval` and `partial`.
   - Structured `pauseReason`/`blockReason`.
   - `confirm{bindings[]}`, and the server rejecting `answer` on WAITING_CONFIRM.
   - Error `code`s.
   - Registry fields: `cls`, `highBlast`, localized title template, `domainHref`.

   No BuildBoard ships before persisted plan + WAITING_CONFIRM + receipt-carrying steps exist. It must **never** ship as a client-side simulation.
1. **S1 — honest shell on today's engine.**
   - Delete the 600 ms timer (`automatic-workspace.tsx:54`) and move to observe-only polling with backoff.
   - Ship `RunSheet` + `ProgressRibbon` + `ReceiptList` + `NotYetCard` + `PracticeBadge`, covering all §4.2 states that today's engine can produce.
   - Add `assertReceipt`, `expectNoPrematureDone` and the `data-ai-*` anchors.
   - Keep today's GuidedSetup ONBOARDING `{id, version}` binding intact.
2. **S2 — Task Card and confirmation.** `TaskCard` + field library generated from zod + `ProvenanceChip` + `ConfirmBar` + `PreviewCode` + stale state + the local "yes" interception + the high-blast checkbox. `ExecutionPreview` covers the 15 ops.
3. **S3 — ask everywhere.**
   - `AskProvider`/`ask-bus` + `AskPalette`, merged with `TeacherCommandPalette` (delete its standalone listener in the same PR).
   - `AskBar` + `SuggestionRail` on Today pages.
   - `useAskContext` on the first 12 pages.
   - `CapabilityAtlas` with the coverage count.
   - Draft-tool notices (S13).
   - `/ai` home rework with **Studio tools**.
4. **S4 — teacher register** (`attendance.save_register` adapter + chip + roster-exceptions field). Needs §12 D1 decided.
5. **S5 — campus Build.**
   - `WorkspaceSheet` framework + new primitives + ADMIN/CAMPUS_ADMIN definitions.
   - `KnownFactStack`, `WillCreateDiff`, `BuildBoard` (CharterLedger/SealSlot), `WorkspaceReady`, Today card.
   - The onboarding copy fix (`onboarding/page.tsx:34`) in EN/AR/UR **in this same slice**.
6. **S6 — hand-off.** `HandoffCard` + `PreparedByAiPanel` on Finance operations, runs-panel, Fees, Leave, Announcements, People & access; `HandoffInbox`; notifications.
7. **S7 — remaining role sheets.** TEACHER (extending `/teacher-onboarding`), PARENT, SUPER_ADMIN + `GroupLaunchBoard`, then PRINCIPAL, ACCOUNTANT, LIBRARIAN, RECEPTIONIST, STUDENT, APP_OWNER.
8. **S8 — evidence and demo.** Demo seed + fallback runs. Playwright at 360/768/1440 × EN/AR/UR (reduced motion on and off for Build) via fixture-driven states, not live model runs. Screenshots go in the scratchpad (design-system runs empty `test-results/design-system`).

### 11.2 Reuse list (file paths)

**Automation and engine**
- `src/components/automation/automatic-workspace.tsx`: the idempotency key pattern; its 600 ms timer is deleted.
- `src/app/api/automation/route.ts`: rate limit.
- `src/lib/automation/{service,worker,schema,validation,catalog,role-action-service}.ts`.

**School AI previews, runs and conversations**
- `src/components/school-ai/execution-preview.tsx`
- `src/components/school-ai/runs-panel.tsx` (SKO-470, `#run-` anchors)
- `src/components/school-ai/finance-operations-panel.tsx`
- `src/components/school-ai/assistant-entity-picker.tsx`
- `src/components/school-ai/setup-answer-analysis.tsx`
- `src/components/school-ai/multimodal-composer.tsx` (wrapped with voice and uploads hidden)
- `src/components/school-ai/guided-setup.tsx` (persistence model)
- `/api/school-ai/conversations` (SKO-460 thread persistence)

**Shell, navigation and the palette**
- `src/components/teacher/command-palette.tsx` + `src/components/teacher/palette-bus.ts` → generalised.
- `src/components/role-dashboard/RoleShell.tsx` (providers at `:112`, mount at `:392`).
- `src/components/role-dashboard/RoleHeader.tsx` (notifications at `:20-21,96`).
- `src/lib/navigation/role-nav.ts` (`ROLE_NAV`, approvals badge `:54`).

**Onboarding (Charter Desk)**
- `src/components/onboarding/{AiGuide,GuideStage,GuideShowcase,RoleGuideProps,role-guide-copy,SheetRail,StepCard,StepDock,ConfirmedChoice,OptionCard,MoreDetails,WeekStrip,ReviewSheet,CharterLedger,SealSlot,SetupBar,CampusPlan,CapacityMeter}`.

**Shared ui primitives**
- `src/components/ui/{alert,badge,button (variant "choice"),card (variant "featured"),checkbox,collapsible-panel,confirm-action,date-picker,draft-recovery,empty-state,error-state,follow-up-list,form-field,icon-button,ink-heading,input,input-group,menu,modal (ModalSurface, useDialogBehaviour),offline-banner,progress,select,skeleton,switch,table,task-patterns (TaskHeader/TaskStatus/TaskFeedback),textarea,toast,tooltip,urdu-input,view-tabs}.tsx`.

**Localisation**
- `src/components/locale/LocaleProvider.tsx` (`useUiText`).

### 11.3 check:ui pitfalls (`npm run check:ui`, `tests/design-system/adoption.test.ts`)

- **Tokens only.** No mapped hex. Companion SVG props use `var(--brand-*)`/`var(--berry)` like `GuideStage.tsx`; do not copy the guide's two legacy skin-tone hexes into new files.
- **Type scale only.** `text-2xs` is the floor, no tiny px sizes, no `font-black`.
- **Toasts** only through `@/components/ui/toast`. **Never import `sonner`.**
- **No `title=` tooltips.** Use `Tooltip`/`InfoTip`.
- **Dialogs.** No new `ModalFrame`/`DialogContent` forks: use `Modal`/`ModalSurface`. Fields go through `FormField` with the shared focus token.
- **Logical utilities only.** `rtl:rotate-180` on directional icons.
- **Codemod.** Run `scripts/ui-token-codemod.ts` on every new file before commit, and add the new primitives to the ratchet baseline.
- **CSS.** New styles go in `ai-workflows.module.css`, reusing `.sk-ink-cover`, `.sk-panel`, `.sk-follow-up`.
- **Anchors.** `data-ai-bar`, `data-ai-chip`, `data-ai-card`, `data-ai-field`, `data-ai-confirm` (+ `data-confirm-key`), `data-ai-receipt`, `data-ai-handoff`, `data-ai-ledger-row`, `data-ai-seal`, `data-ai-phase`, `data-step-class`, `data-step-state`.
- **Type-checking.** `tsc` needs `NODE_OPTIONS=--max-old-space-size=12288`.

### 11.4 Judge mustFix checklist and where each is resolved

| mustFix | Resolved in |
|---|---|
| Alt+J / a second ⌘K listener; header-search rule | §2 S1, §8.3, §12 D2 (merge the palette; the IconButton needs sign-off) |
| Teacher prefill from a build that creates no allocations | §6.2, §10 setup (allocations only from TEACHER_ALLOCATIONS with accepted teachers, or "Not assigned yet"; never fabricated) |
| Demo-critical adapter list + fallback arc | §10.2, §10.3 |
| Attendance B vs C; per-learner evidence; visibly unconfirmed rows | §1.2 moment 3 (explicit "Mark the other 31 present" act), §5.4, §12 D1 |
| Lane/Build batch: per-step bindings, drift drops back, never a single planHash | §5.3 |
| Build receipt-gating testable; non-animated ledger | §4.3 rule 1, §4.4, §8.6 |
| Parent beat must not imply a school family message | §10.1 parent row |
| DockRail vs chat dock | §2 S12 (no second launcher; `suppressed` prop; correct `md:bottom-6 md:end-6`) |
| Credit estimate from the server, reconciled | §3.1 `credits`, §4.3 rule 10, §6.3 |
| Practice mode everywhere | §3.2 `PracticeBadge`, §4.3 rule 11 |
| Engine contracts as a hard prerequisite slice + demo subset effort | §11.1 S0, effort estimate |
| Invitations "sent" wording | §4.2 step done, §9.2 (banned) |
| "Opened" stage only with a real signal | §5.4, §12 D9 |
| Don't replace or fork SKO-460 | §2 S13, §3.2 `RequestThread` |
| Chips skipping planning still re-check gates and charge credit | §7.2 |
| uiSchema scaling | §3.2 `TaskCard` (generated from zod; hand-written only for demo-critical adapters) |
| "yes" local, server rejects answer on WAITING_CONFIRM | §5.2 |
| Keyboard map + throttled live region | §8.3, §8.4 |
| AR/UR copy for Build, hand-off, "not sent anywhere" | §4.2, §6.3, §9.2 |
| Motion off on the teacher/parent 360 paths | §4.4, §6.7 |
| Remove "Holds the mic" | Voice is absent everywhere (§7.1) |
| Pin the parent channel class | §12 D6 |
| Copy fix in the same slice as Build | §11.1 S5 |
| Slice 1 deletes the 600 ms advance without regressing version binding | §11.1 S1 |

---

## 12. Open decisions for the founder (with defaults)

| # | Decision | Default if no answer |
|---|---|---|
| D1 | `attendance.record_register` class. B.decisions lists it as C; the README calls a teacher's register B; T3 allows B/C | **Teacher own-class register (`attendance.save_register`) = B**, with per-learner evidence for every statement, the remaining rows shown as "not marked" until the teacher presses **Mark the other N present** (an explicit act), and the high-blast checkbox above 50 rows. **Operator/principal bulk register = C.** Both are set statically in the registry |
| D2 | A header **Ask** `IconButton` despite "no header search, SPEC §4.1 H2" (`RoleShell.tsx:95`) | Allow an icon button, not a text field. ⌘K stays the merged palette |
| D3 | `/ai` becomes the AI Workflows home for staff too, with the 17 School-AI tabs under **Studio tools** | Yes; nothing removed |
| D4 | Class A auto-run per request (a `Switch` "Run safe steps automatically") | On by default, remembered per user (convenience only) |
| D5 | Build confirms several B steps in one press via per-step bindings | Yes. If the engine cannot bind arrays, fall back to one press per lane (4–6 presses) |
| D6 | Parent WhatsApp/channel **opt-out** class | **B** (own consent record). **Enable** stays admin-only with consent evidence (C) |
| D7 | Practice mode at LEAP if the release gate is still closed | Run in labelled Practice mode on the demo tenant; never imply live autonomy |
| D8 | Companion pose scope | Three new poses (`listen`, `wait`, `puzzled`) across 11 personas; no walking, no bespoke build tiles |
| D9 | Add an "opened" view event to approval surfaces | Omit the stage until a surface records it; add it to Finance operations first if desired |
| D10 | Where the SUPER_ADMIN group sheet sits | After the wizard, before `/setup/readiness`; lands on GroupLaunchBoard |
| D11 | Curriculum/syllabus intake owner (T12) | Exam Studio for anything with a source; AI Workflows deep-links to `/ai/studio` |
| D12 | Recurring automations, e.g. a weekly teacher digest or reminder cadence | Only under an approved POLICY in `approval_required` mode (rule 18). The sheet records the wish as a Still-to-do for the School AI manager |
| D13 | Desk-preference store for the receptionist and library opening hours (no model exists) | Saved as a checklist note (plan_saved), labelled "not connected yet" until product adds a store |


**Key decisions**
- Spine is U3-outcome (2 of 3 judges): one Ask grammar (AskBar on Today and /ai plus a merged Cmd/Ctrl+K AskPalette) that resolves requests into a TaskCard, a structured per-capability form prefilled from words and records, with a provenance chip on every field.
- U1's companion is kept as a bounded presence: compact AiGuide in every RunSheet and the first-login greeting, plus exactly three new poses (listen, wait, puzzled). No walking, no flying envelopes and no nine bespoke build tiles; the build ceremony reuses CharterLedger and SealSlot and is driven only by receipts.
- The client never drives execution: delete the 600 ms advance timer (automatic-workspace.tsx:54) and replace it with observe-only polling with backoff (or SSE) plus explicit commands (answer, confirm, edit, skip, pause, resume, cancel, withdraw). The server rejects answer on WAITING_CONFIRM.
- Class B confirmation is a button labelled with verb, count and object, bound to {runId, runVersion, stepKey, pendingKey, previewHash, idempotencyKey}. A visible 4-character PreviewCode matches across requester, receipt and approver. Edits invalidate the preview. High-blast steps add an 'I've checked the list' checkbox. There is no generic Confirm label (enforced by a lint rule).
- A bare 'yes' in EN/AR/UR is intercepted on the client (no model call, no credit) and focus moves to the bound button. Server defence in depth rejects answers on WAITING_CONFIRM.
- Build my workspace sends an array of per-step bindings for the A/B steps that already have previews. Class C is never included, a drifted step drops back to its own ConfirmBar, and per-lane presses are the fallback. There is never a single planHash.
- Class C is a HandoffCard whose honest timeline stages appear only when true ('Opened' only when a view event exists). Approvers decide on their existing domain screens, with a PreparedByAiPanel added above the screen's own controls. /ai/waiting is a read index only. There is no inline approve in notifications, and the AI never self-approves class C (vacant seats and separation of duties become named hand-offs).
- No second floating launcher and no DockRail refactor: the header Ask IconButton carries the status ring, and ChatDock gets a one-line 'suppressed' prop while the desktop RunSheet panel is open.
- Reuse, not fork: generalise TeacherCommandPalette and palette-bus into ask-bus (one Cmd/Ctrl+K listener), persist threads through the SKO-460 conversation model, run through SKO-470's lifecycle, extend /teacher-onboarding, keep the draft-only AI views with an info Alert, and deep-link papers to Exam Studio.
- The first-login WorkspaceSheet uses typed inputs only (known, pick, stepper, tags, grid, matrix, dayShape, table via importBatch review, people, availability, moneyLines, native consent and invitation cards). It is prefilled from registration, the wizard, allocations, verified guardian links and enrolment. WillCreateDiff splits outcomes into three groups: created, prepared for others, and not from this sheet.
- Teacher 'known classes' come only from TEACHER_ALLOCATIONS receipts for accepted teachers, or show 'Not assigned yet' with a hand-off to the academic lead. Known facts are never fabricated. The demo seed includes accepted teachers.
- Honest progress is enforced in code: assertReceipt in dev, the Playwright helper expectNoPrematureDone, counts not percentages, 8 s and 60 s time-honesty copy, queued/pending/prepared kept distinct from done, Practice mode labelled on every surface while the release gate is closed, and the credit estimate taken from the server reservation and reconciled on WorkspaceReady.
- One vocabulary word per state across roles and EN/AR/UR (Planning, Needs you, Check, Working, Saved, Looked up, Draft, Queued, Pending, With {name}, Not connected, Paused, Didn't run, Done, Partly done, Stopped), with banned alternatives such as 'Sent' for anything queued.
- CapabilityAtlas is generated from the registry plus ROLE_NAV and shows an honest coverage count ('AI is connected to n of m things you can do'). Suggestion chips appear only when the adapter exists and the gate passes, and opening a chip still re-checks gates on the server.
- The LEAP arc ships with a demo-critical adapter list and a fallback arc that uses only adapters connected today; every beat ends on a real receipt or an honest NotYetCard. The onboarding copy fix ships in the same slice as Build.

**Risks**
- Hard engine dependency: the BuildBoard, ConfirmBar and HandoffCard need the S0 contract (persisted plan with dependsOn, WAITING_CONFIRM, CANCELLED, awaiting_approval and partial outcomes, receipt-carrying StepView, structured asks, confirm with a bindings array, error codes). If S0 slips, only S1 can ship, and the build must not be faked on the client.
- Adapter coverage is very low today (teacher has no operational tool; access.ts:76). The primary LEAP arc needs attendance.save_register, parent.explain_absence, the fees structure adapters and the guardian-channel opt-out adapter. Without them the fallback arc applies and the demo shows more 'Not connected' cards.
- The attendance class conflict (B.decisions lists it as C; the README and T3 allow B) must be decided before slice S4. The 'Mark the other N present' explicit act is my reconciliation of T3 and needs founder and compliance sign-off.
- The engine may be unable to accept per-step binding arrays for Build; the fallback is 4-6 per-lane presses, which weakens the ceremony.
- Merging TeacherCommandPalette changes an existing shortcut's behaviour for teachers. The header Ask IconButton conflicts with the 'no header search' rule (RoleShell.tsx:95) until the founder signs off.
- PreparedByAiPanel and #step deep links touch about 6-8 approval screens owned by other tickets (SKO-470 runs, finance, leave, announcements, People & access, pickup). This means merge and coordination risk in the shared checkout.
- The 'Opened' hand-off stage depends on a view event that most approval surfaces do not record, so the timeline may look thin until one is added.
- Free-text names are not masked by the engine today (B.engine finding 7). Privacy copy must stay narrow (chips and @-mentions only) until the engine masks free text.
- The release gate is closed (ai-release-evaluation.ts:3-7). LEAP must run in labelled Practice mode unless a real educator-reviewed evaluation is recorded, which may dull the demo.
- AR/UR copy (about 150 strings x 3, Arabic six-form plurals, server error codes that are English-only today) is easy to underestimate and blocks RTL QA. Mixed-direction strings (names, ids, PreviewCode, amounts) are a known bug source.
- Name-to-roster resolution for Urdu/Arabic transliteration in the teacher register must always surface ambiguity as a choice. A silent pick would break trust in the 20-second flow.
- Server-side suggestion computation per user and page needs caching (about 60 s). Stale chips must degrade to a NotYetCard after the server re-checks gates.
- The QA matrix is large: about 20 phases x 3 languages x 3 widths, plus reduced motion for Build. It needs fixture-driven Playwright states with data-ai-* anchors; Playwright runs wipe test-results/design-system, so evidence must be kept in the scratchpad.
- Teacher, parent and student sheets produce few school records by design (preferences, drafts, hand-offs). Stakeholders expecting 'the system generated for every role' may read this as thin unless WorkspaceReady and the demo frame it honestly.

**Effort**: Estimate covers UI and interaction work only. It assumes one senior front-end engineer and that the architecture track delivers the S0 engine and registry contract and the adapters. Translator time and the release evaluation are excluded. The figures are not measured against past velocity.

Breakdown (person-days):
- S1, honest shell on today's engine: 6. Covers RunView mapping, RunSheet, ProgressRibbon, ReceiptList, NotYetCard, PracticeBadge, every section 4.2 state the current engine can produce, removing the 600 ms timer in favour of polling, assertReceipt, expectNoPrematureDone and data-ai-* anchors.
- S2, TaskCard and confirmation: 10. Covers a field-kind library generated from zod, ProvenanceChip, ConfirmBar, PreviewCode, the stale-diff state, local 'yes' interception, the high-blast checkbox, multi-B paging and ExecutionPreview integration.
- S3, ask everywhere: 13.
  - AskProvider, ask-bus and AskPalette, merged with TeacherCommandPalette: 4.
  - AskBar and SuggestionRail on about 10 Today pages, plus useAskContext on 12 pages: 4.
  - CapabilityAtlas with the coverage count: 2.
  - /ai home rework (Needs you, With others, Done, History pagination, Studio tools) and the draft-tool notices: 3.
- S4, teacher register UI: 3. Covers the roster-exceptions field, the explicit 'mark the rest' act and the chip. The adapter itself is excluded.
- S5, campus Build: 21.
  - WorkspaceSheet framework (routing, prefill-to-known, skip vs later, resume, delta rebuild, Today card): 5.
  - Eight new primitives (Stepper, TagList, GradeSectionGrid, SubjectMatrix, PeriodBuilder, AvailabilityGrid, RosterTable, MoneyLines), each with RTL and 360/768/1440 stories: 9.
  - KnownFactStack, WillCreateDiff with ghost rows, BuildBoard on CharterLedger and SealSlot including the reduced and low-end ledger, WorkspaceReady with print, and the onboarding copy fix: 5.
  - ADMIN and CAMPUS_ADMIN definitions: 2.
- S6, hand-off: 8. Covers HandoffCard, PreparedByAiPanel embedded in 6 surfaces, HandoffInbox with the approver Today card, notifications and the #step return.
- S7, remaining roles: 11.5.
  - TEACHER, extending /teacher-onboarding: 2.
  - PARENT, with native consent and invitation cards: 1.5.
  - SUPER_ADMIN and GroupLaunchBoard: 3.
  - PRINCIPAL, ACCOUNTANT, LIBRARIAN, RECEPTIONIST, STUDENT and APP_OWNER: 5.
- Companion poses (listen, wait, puzzled) across 11 personas, with static frames and the RTL mirror: 3, plus about 2 days of illustration design.
- Accessibility pass, check:ui compliance and the codemod: 4. Covers AiAnnouncer throttling, the keyboard map, focus choreography, 320 px and 400% zoom.
- Copy catalogue (about 150 strings x EN/AR/UR) and the server error-code map, engineering side: 4.
- S8, Playwright suites: 7. Covers 360/768/1440 x EN/AR/UR, reduced motion for Build, binding, hand-off and premature-done checks, with screenshots kept in the scratchpad.
- LEAP demo seed, fallback runs and rehearsal polish: 3.

Totals:
- All work: about 93.5 person-days. That is roughly 19 weeks for one engineer, or about 7-8 calendar weeks for three engineers on parallel tracks: ask and run, Task Card plus confirm plus hand-off, and the sheets.
- Demo-critical subset: about 52 person-days. It covers S1, S2, the palette, AskBar and Atlas from S3, S4, S5 for ADMIN only, S6 on Finance operations only, the TEACHER and PARENT sheets, a reduced accessibility, copy and test pass, and the demo seed.

Not included:
- The S0 engine and registry work (architecture estimate).
- The new adapters (attendance.save_register, parent.explain_absence, the fees structure set, the guardian-channel opt-out, and the others listed in the role digests).
- Server-side suggestion computation.
- The approval-surface 'opened' event.
- Server error localisation on the back end.
- The AI release evaluation.
- SKO-460 voice and document intake.
