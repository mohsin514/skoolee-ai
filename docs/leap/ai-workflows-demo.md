# LEAP · AI Workflows five-minute demo (presenter script)

Internal presenter script for the AI Workflows arc in `docs/product-review-2026-10/ai-automation-plan-2026-10-23/design-ux.md` §10. The tenant is **Al-Noor Grammar, Lahore**, a synthetic school: every person, pupil, invoice and book in it is made up. Say so on stage. `/ai` and `/ai/setup` show the badge **Demo school · synthetic data** for it (`DEMO_SCHOOL_SLUGS` in `src/lib/ai-workflows/demo.ts`).

Rules that hold for the whole demo:

- **Practice mode is not lifted for the demo.** Never set `CURRENT_AI_RELEASE_EVALUATION` (rule 12 / SKO-494) and never claim an evaluation result. Outside production (`NODE_ENV` ≠ `production`), practice mode does not apply (see `src/lib/ai-workflows/practice.ts`). On a production build it applies unless `AI_WORKFLOWS_LIVE_SCHOOLS` lists `al-noor-grammar-demo`, which `practice.ts` allows for synthetic tenants only. Ops decides which, before the rehearsal. If practice mode applies, steps end **Example · not saved**. Say exactly that; don't talk around it.
- **Nothing implies live autonomy.** Each beat ends on a receipt, a hand-off that names who decides, or an honest "not yet".
- **Never fake a run.** If the network or the model provider drops, reopen the beat's **recorded run** from the run list (below). Never retype a result by hand. Keep the `OfflineBanner` visible.

## 1. Before the session

| Step | Command or check |
|---|---|
| Build | Record the exact commit you will demo (`git log -1 --oneline`). Don't demo uncommitted work. |
| Flag | `AI_WORKFLOWS_V2` unset (non-production), `all`, or a list that includes `al-noor-grammar-demo`. Otherwise nothing new starts. |
| Reset | `DEMO_PASSWORD=<12+ chars> DATABASE_URL=<demo db> DIRECT_URL=<demo db> node --import ./tests/support/server-only.mjs --import tsx scripts/demo/seed-ai-workflows-demo.ts --reset`. A non-loopback database also needs `DEMO_RESET_ALLOW_REMOTE=1`, and only for the dedicated demo environment. |
| Confirm | The printed manifest shows `created: true`. Its `counts` are `users 7, classes 3, pupils 33, guardianLinks 1, invoices 2, payments 1, attendance 33, books 1, bookCopies 3, leaveRequests 1, jobs 7`, and there are seven `runs`, all `COMPLETED`. Running the seed again without `--reset` prints `created: false` and the same `fingerprint`. |
| Accounts | Emails are `demo-alnoor-<key>@example.invalid`, with `<key>` = `admin` (Imran Qureshi, owner), `approver` (Farah Naz, admin), `teacher` (Ayesha Siddiqui, class teacher of 7B, Science, Urdu), `teacher2` (Usman Ghani, Mathematics 7B), `accountant` (Sana Malik), `parent` (Tariq Mehmood, Hamza's father, Arabic) and `librarian` (Nadia Perveen). The password is `DEMO_PASSWORD`. It is never printed or written to a file, so don't reuse a real one. If the demo environment requires MFA enrolment for admins, do it during the rehearsal, not on stage. |
| Devices | Laptop 1440 px (admin, accountant), tablet 768 px (approver Farah), phone 390 px (teacher in Urdu RTL, parent in Arabic RTL, librarian). Mirror them on stage. Sign everyone in before the session. |
| Day | Rehearse and present on a school day (Monday to Saturday; Sunday is the weekend). Run the reset on the morning of the demo: the recorded register is for the **previous** school day and the recorded leave is **two school days ahead**, so the live beats (today, tomorrow) never collide with them. |

### What the seed creates

- **Fixtures, written directly** as the other demo seeds do:
  - the school and its Gulberg campus (PKR, Asia/Karachi, Sunday weekend) and an ACTIVE 2026–27 cycle;
  - no principal;
  - two accepted, active teachers;
  - Grade 7 B with 33 pupils, two of them called Ali (Ali Raza, Ali Hassan), and a published 7B timetable (Mathematics in period 2, Science in period 3);
  - Tariq's verified guardian link to Hamza Tariq;
  - Bilal Ahmed's September and October invoices, Rs 12,000 each;
  - a campus Delivery Policy that requires a second person for money.
- **Recorded runs**, one `AiWorkflowJob` per beat, built through the real services (`startJob`, `advanceJob`, `answer`/`amend`/`confirm` commands, the hand-off claim and the Collect desk's own command). The planner's single model call is a recorded stand-in, logged as model `demo-recorded:planner-stand-in` with zero tokens and no credit. The real planner still checks it: retrieval, handle binding, evidence quotes and the input schema. Every preview, question, receipt and event in those runs is what the engine produced. The admin Build compiles without a model call at all. Free-form recorded runs have the idempotency key `demo-recorded-<beat>`; the Build keeps its questionnaire key and is named by job id in the manifest.
- **Order matters.** The admin Build runs while the finance desk is vacant, so it includes fee rules. Sana is created right after it. The live admin sheet then shows *Accountant · In post*, and the fee structure appears under what remains, with the accountant.

### Reopening a recorded run

Sign in as the beat's actor, open `/ai`, and open the run from the run list (newest first; `listJobs`). The admin Build is also on `/ai/setup` until a new Build replaces it there. It stays in the run list either way.

## 2. Keys: design names → registry now

| Design-ux §10 says | Registry key now | Note |
|---|---|---|
| `attendance.save_register` | **`attendance.mark_class`** (B) | The step's receipt still names `attendance.save_register` as its capability. |
| `library.create_books` | **`library.book_create`** (A) | `library.create_books` is an inventory alias of it. To **add copies to a title already in the catalogue**, the honest capability is **`library.desk_add_copies`** (B, labelled copies). `book_create` would merge the title and add nothing. |
| `finance.apply_operation` for "Record Rs 12,000 cash…" | **`fees.collect_payment`** (C, `DOMAIN_SCREEN`) | Slice 5 moved collections onto the Collect desk. `finance.apply_operation` still exists as a Finance-operations record hand-off, but its `invoiceId` has no handle kind, so a typed request cannot bind it. |
| `parent.explain_absence` or `family.request_leave` | **`family.request_leave`** (B) for "absent tomorrow" | `parent.explain_absence` is for a day already marked absent. |
| `setup.apply_changes` (SUBJECTS / PERIODS / ROOMS / STAFF / TEACHER_ALLOCATIONS) | `setup.subjects_by_class`, `setup.periods`, `setup.rooms`, `setup.staff_invitations`, `setup.teacher_allocations` | The Build compiles `setup.subjects_by_class`. It does **not** compile teacher allocations; "Assign class and subject teachers" is listed under what remains. |
| `attendance.record_register` (operator) | `attendance.record_register_operator` (C) | |
| `front_desk.log_call` | `front_desk.call_log` (A) | |
| fee-structure adapters | `fees.create_fee_type`, `fees.create_fee_group`, `fees.create_master_line`, `fees.assign_fee_group`, `fees.create_fine_rule`, `fees.create_discount` (B) | Compiled only while no accountant holds the desk. |
| guardian channel adapter | `communications.set_guardian_channel_preference` (B) | Not part of any beat. |

Sheet keys (`/ai/setup`): `admin` (four sheets: Classes · The school day · People · Money and policies), `teacher`, `parent` (one sheet: Your family), `accountant`, `librarian`.

## 3. Primary arc (§10.1)

Type the text exactly as written. The teacher beat is in Urdu, the parent beat in Arabic.

### 0:00–0:30 · Admin · laptop · EN · `/ai/setup` (sheet `admin`)

- **Do:** Open the sheet. The known facts are the campus, academic year `2026–27 · active`, currency PKR, *Principal · You lead academics for now*, *Accountant · In post*, and what is already set up (3 classes, subjects, rooms, 8 periods from the recorded Build).
- **Say:** "It never asks what it already knows."
- **Recorded fallback:** None needed: this screen makes no model call.

### 0:30–2:00 · Admin · Sheets → Build

- **Do:**
  - Grade ladder: set Grades 1–6 to **2** sections each. Grade 7 and Grade 8 stay as they are; classes that already exist are kept, never duplicated.
  - Subjects for Primary: take the suggested chips.
  - The school day is already 08:00 · 40 min · break after the 4th period (kept from the recorded Build).
  - Rooms: add classrooms.
  - Staff: paste the staff table.
  - Then press **Build my workspace**.
- **Expected:**
  - Each school record waits for its own preview and save. Saved steps show receipts: 12 new classes, their subjects, the rooms, and pending invitations. Invitations are prepared, not sent; nobody gets access until they accept.
  - No fee question is asked, because the accountant is in post. *Fee structure · Your accountant, in their own setup* is listed under what remains.
- **Recorded fallback:** In the admin's run list, open the earlier Build, a completed `QUESTIONNAIRE` run with 15 receipts:
  - `academics.setup_year` (Grade 8 A, 8 B), `setup.subjects_by_class`, `setup.periods` (8 periods), `setup.rooms` (4 classrooms, 1 lab);
  - two `fees.create_fee_type`, `fees.create_fee_group`, two `fees.create_master_line`, `fees.assign_fee_group` (*Assign to classes · 2*), `fees.create_fine_rule`;
  - two `leave.create_type` and two `leave.create_allocation`.
  - Say: "This is the Build from the rehearsal, when the finance desk was still vacant."

### 2:00–2:50 · Teacher · phone · **Urdu RTL** · `/ai`

- **Type:** `7B رجسٹر: علی اور زینب غیر حاضر`
- **Expected:**
  - The planner binds 7B (a class Ayesha leads) and asks **which Ali**, with two choices: Ali Raza · علی رضا · 1, and Ali Hassan · علی حسن · 2.
  - Pick Ali Raza. The preview lists the two pupils absent and *باقی طلبہ · 31 کی حاضری نہیں لگے گی*.
  - Press **باقی 31 کو حاضر لگائیں** (Mark the other 31 present). Then **رجسٹر محفوظ کریں · 31 حاضر، 2 غیر حاضر**. The receipt reads 33 saved, 31 present, 2 absent.
- **Second card:** On a waiting card, type `جی`. The hint points to the button, because typing yes saves nothing.
- **Recorded fallback:** Ayesha's run `demo-recorded-teacherRegister`, for the previous school day. Its text was `7B کا کل کا رجسٹر: علی اور زینب غیر حاضر`. It holds the answered PUPIL_AMBIGUOUS question, the amended preview and the save receipt with the same counts.

### 2:50–3:40 · Accountant → approver · laptop + tablet · EN

- **Type (Sana, laptop):** `Record Rs 12,000 cash from Bilal's father for October`
- **Expected:**
  - `fees.collect_payment` binds Bilal and his October invoice (masked number) and prepares the collection. Policy requires a second person, so the card says it is with an **Admin**, not with Sana.
  - On the tablet (Farah): `/ai/waiting` lists it. Claim it. The Collect desk opens (`/admin?view=fees&tab=payments&invoice=…`) with the amount and method filled in.
  - Farah records it with the desk's own button. Sana's card flips to approved elsewhere, and the receipt names the approver.
  - Sana cannot take it herself: the hand-off targets admins, and under this policy the Collect command refuses a requester's own post (`HANDOFF_SEPARATION`).
- **Recorded fallback:** Sana's run `demo-recorded-accountantCollect` (text: `Record Rs 12,000 cash from Bilal's father for the September fee`). Farah claimed it and posted the September payment through the hand-off, so the step is `HANDED_OFF_DONE` with the payment receipt. October stays open for the live beat.

### 3:40–4:20 · Parent · phone · Arabic RTL · `/ai`

- **Type:** `حمزة غائب غداً، عنده موعد عند الطبيب`. The reason must be in the text; without one, the reason is asked too.
- **Expected:**
  - Hamza is known from the verified link. Relative words are not evidence for a date, so the date is asked; pick tomorrow.
  - The preview reads *طلب إجازة*: child, from/to, days, reason, and *بانتظار مراجعة المدرسة*. Press **إرسال طلب الإجازة**. The receipt shows the request pending school review.
  - The register is not changed, and the school sends no family message.
- **Recorded fallback:** Tariq's run `demo-recorded-parentLeave` (text: `حمزة سيغيب بعد غد، عنده موعد عند الطبيب`, two school days ahead), with the answered date question and the receipt.

### 4:20–4:45 · Librarian · phone · EN · `/ai`

- **Type:** `Add 3 copies of Atlas of the World, numbered from LB-0104`
- **Expected:** The preview reads *Register copies*: Atlas of the World · Collins, *3 · LB-0104, LB-0105, LB-0106*. Press **Register · 3**. The receipt shows 3 copies added. If the labels are left out of the text, the copy labels are asked.
- **Then type:** `Publish the Grade 9 results`
- **Expected:** Not supported. Nothing is planned or sent, and the run ends `NOT_SUPPORTED`. Say: "Publishing results is the principal's decision. Your request was not sent anywhere."
- **Recorded fallback:** Nadia's runs:
  - `demo-recorded-librarianCatalogue` (`Add Atlas of the World by Collins, 2 copies`, `library.book_create`): this is how the Atlas entered the catalogue;
  - `demo-recorded-librarianCopies` (`Add 3 copies of Atlas of the World, numbered from LB-0101`, three copies registered);
  - `demo-recorded-librarianNotYet` (`NOT_SUPPORTED`, no steps).

### 4:45–5:00 · Admin · laptop · `/ai/can-do`, then the Build summary

- **Do:** Show "AI is connected to *n* of *m* things you can do". Read *n* and *m* off the screen; never quote numbers from memory. Then show the Build's ready summary: created, pending, with others, not connected.
- **Say:** "Everything you saw has a receipt, or says who decides."
- **Recorded fallback:** None needed: no model call.

## 4. Fallback arc (§10.3)

§10.3 was written for missing adapters. All of them are now in the registry, so these swaps are needed only if an adapter is switched off for the demo environment. Each swap still ends on a real receipt or an honest not-yet. None of them has its own recording, and the seed does not exercise them, so rehearse any swap you plan to use. If the network drops, reopen the primary beat's recorded run.

| Beat | Swap | What to type |
|---|---|---|
| Teacher register | A campus admin on a campus with no principal records the register with `attendance.record_register_operator` (C, reviewed on the attendance screen). The teacher instead asks for a private plan (`personal.save_plan`, A, private draft). | `Record today's 7B register: Ali Raza and Zainab absent`, then (teacher) `Make me a revision plan for 7B Science this week` |
| Admin fee hand-off | The fee question shows *Not connected yet · saved for later*, and the ready summary lists it under not connected. The money beat stays the accountant's collection. | — |
| Parent absence | The parent sheet: language (`profile.update`, A) and family goals (`personal.save_plan`, A). The absence request shows a not-yet card. | — |
| Parent channel | The question shows *Not connected yet*. No beat depends on it. | — |

## 5. After the session

- Reset: run the seed command above with `--reset`. It deletes only `al-noor-grammar-demo`, and only when it is labelled `[Synthetic demo]`.
- Don't keep screenshots that show the password, and don't reuse the demo password anywhere.
- The test `tests/ai-workflows/demo-seed.database.test.ts` checks four things: the seed is idempotent, every recorded run reopens from its actor's run list with receipts, the model stand-in charged nothing, and the badge flag is set.
