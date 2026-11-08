# Appendix D — Per-role first-login questionnaires


---

# APP_OWNER

# APP_OWNER: first-login questionnaire and top free-form requests

**Role in one line:** `ROLE_PURPOSE.APP_OWNER` says "Platform owner: manage the application and institutions. Never assume tenant access; support access must be audited." (`src/lib/automation/catalog.ts:16`).

**Where things stand today (evidence):**
- **No first-login path.** `requiredOnboardingPath` returns `/onboarding` only for SUPER_ADMIN/ADMIN and `/teacher-onboarding` only for TEACHER. For APP_OWNER it returns null (`src/lib/onboarding/launch-plan.ts:114-118`), so the proxy sends the owner straight to `/owner`. The only setup surface is `/ai?setup=1`. That page mounts a bare `AutomaticWorkspace roleSetup autoStart` (`src/app/ai/page.tsx:18,30`), which runs the `ROLE_SETUP_INTERVIEW.APP_OWNER` text (`src/lib/automation/role-setup.ts:3`): priorities, language, institution profile fields, and a private checklist.
- **Executable tools:** `profile.update`, `personal.save_plan`, `platform.inspect` (name search only, max 50) and `platform.update_institution` (name, city, website) (`catalog.ts:29-36`, `src/lib/automation/platform.ts`).
  - `school.execute` operations: zero (`src/lib/school-ai/access.ts:76`).
  - Not in `SCHOOL_AI_STAFF_ROLES` (`access.ts:13`).
  - The owner skips the `ai.add` and `assertSchoolOperational` checks (`src/lib/automation/service.ts:33`).
- **Navigation checklist** (B.roles (c), `src/lib/navigation/role-nav.ts:414-437`). No leaf is module-gated, and the matrix row is nominal: fixed full access, `permissions.ts:285-287`. Every owner route goes through `requirePlatformOwner` (`scope.ts:85-96`) or `requireWorkflowOperator` (`queue/operations.ts:5-9`).
  - Schools
  - AI Workflows
  - Tenant users
  - Subscription requests
  - Pricing
  - Payment gateways
  - Plans & revenue
  - Support access
  - Audit log
  - Sessions
  - Pilot evidence
  - Capacity
- **Appendix A rows owned by APP_OWNER (C8):** `platform.resolve_provider_event`, `operate_workflow`, `set_default_plan_pricing`, `capacity_apply_policy` / `revert_policy` / `reset_peaks` / `record_run`, `pilot_create` / `update_charter` / `record_observation` / `exclude_observation` / `record_measure` / `propose_claim` / `review_claim`, `support_grant_request` / `revoke`, `support_incident_close`, `support_session_start`, `support_action_queue` / `execute`, `subscription_request_review`, `session_terminate`, `payment_connect_onboarding`, `payment_save_bank`, `provision_school`, `update_school_plan_status`, `archive_school`, `set_school_pricing`, `provision_user`, `reset_user_password`, `create_tenant`.
  - Every one of them has AI coverage "none". Only `profile.update_own` is partial.
  - Tenant-side rows that also list APP_OWNER (`students.*_document`, `admissions.*`, `enquiries.*`, `care.*`, `imports.*`) are **out of scope** for owner automation under rule 19 (no assumed tenant access). They are reachable only inside an approved support grant, and that grant is limited to school_profile phone, contactEmail and website (`support-access.ts:48`).
- **Read lookups** (Appendix A C8): `GET /api/owner/schools`, `/schools/[id]`, `/users`, `/sessions`, `/support/grants`, `/subscription-requests`, `/provider-events`, `/pilots`, `/pilots/[id]`, `/capacity`, `/workflows`, `/platform-config`, `/payment-settings`, `/audit-logs`, `/stats`, `/api/navigation/counts`.
- **Typed operations and seat rules (B.typedOps):** none of the 15 `school.execute` operations applies. The seat allow-list is empty for APP_OWNER, and the owner also cannot create OWNER-level users: `OWNER_CREATABLE_ROLES` = SUPER_ADMIN, CAMPUS_ADMIN, ADMIN, PRINCIPAL, TEACHER (`provisioning.ts:17-23`). Teacher seats are metered, pending invitations included, and a full plan returns 402 (`provisioning.ts:97-121`).

**Proposed entry point.** Extend `requiredOnboardingPath` so a new APP_OWNER with `onboardingComplete=false` lands on an "Owner desk setup" step. It renders on `/owner` itself (shared `src/components/ui` primitives), not on `/onboarding`, which is the tenant wizard and refuses this role (`setup-service.ts:137-149`). Seeded owners already marked complete can open it from a "Set up your desk" card. Completion sets `onboardingComplete=true` through the same `profile.update_own` path. The answers produce **one** setup job, bound to the questionnaire version (rule 17), that reuses SKO-470's run lifecycle with visible progress and per-item receipts.

## Known before asking

Do not ask for any of these again. Show them prefilled with an "Edit" affordance only.

| Fact | Source |
|---|---|
| Full name, email, phone, city | `User.fullName/email/phone/city` (`prisma/schema.prisma` model User ~l.640-720). Owners are created by the seed (`prisma/seed.ts:275-281`) or by an existing owner. |
| UI language | `User.preferredLanguage` (`schema.prisma:683`), else the locale cookie written by `src/app/actions/locale.ts:saveLanguagePreference` |
| Second factor enrolled | `User.mfaEnabled`, `mfaEnrolledAt` (`schema.prisma:674,681`). Privileged MFA is required (`src/lib/auth/mfa-crypto.ts:107`). |
| Platform home school id | `AuthUser.schoolId` (receipt rows use it, `platform.ts:21-25`) |
| Institutions (name, city, website, status, plan, campus count) | `platform.inspect` (`platform.ts:10-13`) and `GET /api/owner/schools` |
| Waiting queues (subscription requests in PENDING_REVIEW, provider events in NEEDS_REVIEW/FAILED, emergency grants awaiting evidence, failed workflows) | `GET /api/navigation/counts`, `/api/owner/subscription-requests`, `/api/owner/provider-events`, `/api/owner/support/grants`, `/api/owner/workflows` |
| Current default plan prices (FREE/BASIC/PRO/ENTERPRISE) | `GET /api/owner/platform-config` |
| Payment gateway state (Stripe Connect account present? bank configured?) | `GET /api/owner/payment-settings`. Return booleans only; never echo the account number or IBAN. |
| Active capacity policies and telemetry | `GET /api/owner/capacity` (`src/lib/capacity/service.ts`) |
| Existing pilots and the eligible measurement owners (active APP_OWNER users) | `GET /api/owner/pilots` (`src/lib/pilots/service.ts:94-95`) |
| Platform totals | `GET /api/owner/stats` |

Not applicable to this role: wizard answers, campus, invitation, assigned classes or subjects, children. The owner has `campusId=null` (`src/app/ai/page.tsx:30`).

## Questions

There are 10 questions in four short sections: You, Your queue, Commercial, Launch. Each card shows a prefilled answer with Keep/Change, so a returning owner can finish in under 2 minutes.

| # | key | prompt (EN) | input | drives | class | req. | prefill |
|---|---|---|---|---|---|---|---|
| 1 | `language` | Which language should your console use? | choice EN / العربية / اردو (sets RTL) | `profile.update_own` | A | yes | `User.preferredLanguage` / locale cookie |
| 2 | `identity` | Is this how schools and auditors should see your name and city? | text, prefilled, confirm-only | `profile.update_own` | A | yes | `User.fullName`, `User.city` |
| 3 | `focusAreas` | What do you look after first each day? | multi: Schools & onboarding · Subscription requests · Pricing & payments · Support access · Pilots / LEAP evidence · Capacity | `personal.save_plan` (orders the owner checklist) | A | yes | queue counts, busiest first |
| 4 | `queueTriage` | These items are waiting. Which go on your first checklist? | multi over live items (each shows type, school, age) | `personal.save_plan` (checklist with deep links). The decisions themselves are `platform.subscription_request_review` and `platform.resolve_provider_event`, made later on their screens. | A (checklist) / C (decisions) | no | `/api/owner/subscription-requests`, `/provider-events`, `/support/grants`, `/workflows` |
| 5 | `institutionFixes` | These schools are missing a city or website. Add them now? | multi over flagged schools, then one short text per chosen field | `platform.update_institution` | B | no | `platform.inspect` rows with a null city or website |
| 6 | `defaultPricing` | Keep these default monthly prices for new schools? | stepper per plan FREE/BASIC/PRO/ENTERPRISE, with a currency label | `platform.set_default_plan_pricing` | C | no (default: keep) | `GET /api/owner/platform-config` |
| 7 | `paymentGateway` | How will schools pay you? | choice: Card via Stripe Connect · Bank transfer · Not yet | `platform.payment_connect_onboarding` (Stripe) or a human-only task (bank) | C | no | `GET /api/owner/payment-settings` state |
| 8 | `firstSchool` | Do you have a school to onboard now? | choice Yes/No; if Yes, a short form: school name, type (Group / Single school), country, plan, owner's name, owner's email | `platform.provision_school` | C | no | country from the owner's profile; plan from #6 |
| 9 | `leapPilot` | Are you running a pilot with a school? | choice Yes/No; if Yes: school (choice from schools), start date (date), language (choice), curriculum (choice/tags), champion's name (text), workflows to measure (multi of preset keys such as MARKS_ENTRY, EXAM_PAPER, ATTENDANCE, FEE_REMINDER, each with prefilled definition and success text) | `platform.pilot_create` (status DRAFT) | B | no | measurementOwnerId = self; country from the chosen school; synthetic = false |
| 10 | `capacityGuard` | Set a platform-wide limit for background work now? | choice: Keep current · Set a limit; if set: scope (choice BACKGROUND_REQUESTS/BACKGROUND_JOBS), limit (stepper 0-1000), reason (text, at least 10 chars) | `platform.capacity_apply_policy` (targetSchoolId null, so no expiry required) | B | no | current policies from `GET /api/owner/capacity` |

**Design notes**
- Only two inputs are free text (#2 confirm and the #10 reason). Every value maps to a typed schema field:
  - #9 maps to `PilotInput` (`src/lib/pilots/service.ts:29-43`).
  - #10 maps to `applyInput` (`src/lib/capacity/service.ts:97-101`).
  - #5 maps to `platformUpdateSchema` (`src/lib/automation/role-actions.ts:8`).
- #8 never asks for or shows a password. The provisioning response's one-time `tempPassword` (`owner/schools/route.ts:179,269`) is shown only in the Schools screen, never in chat or receipts.
- #9 champion name and participants pass the pseudonym/banned-term refinements already in the pilot service. The answer is masked before any prompt (rule 9).
- Section "Launch" (#8-#10) is collapsed by default, with "Skip, I'll do this later". A skipped item becomes a checklist row, not a silent default.
- **Review screen.** Each row carries one of these badges:
  - **Will be done now (A)**
  - **Confirm here (B)**: one confirm per row, bound to `pendingKey + previewHash + job.version`
  - **Needs your sign-off on its screen (C)**: deep link, with the outcome `awaiting_approval`
  - The copy must not say "nothing applies until you approve" for A rows, because they do apply.
- **Credits:** estimate the setup job's steps up front and reserve them (T9). Owner AI actions are still charged to the platform home school's credits.

## Build outcome

**autoProvisioned** (records created from confirmed answers):
1. `profile.update_own`: preferredLanguage, fullName, city, and `onboardingComplete=true` at the end (A). Receipt: the updated fields.
2. `personal.save_plan`: the private "Owner desk" checklist, ordered by `focusAreas`, with one deep-linked row per `queueTriage` item and per skipped or class-C item (A). Receipt: the plan id. It is labelled plan_saved, never "done".
3. `platform.update_institution`: one row per confirmed school field (B). Each confirm writes an `auditLog` (`platform.ts:24`), plus the missing `logSuperAdminAction` that the new adapter adds.
4. `platform.pilot_create`: a DRAFT pilot charter (B). Receipt: pilot id, workflow keys.
5. `platform.capacity_apply_policy`: a platform-wide background limit (B). Receipt: policy id, revert link (`capacity_revert_policy`).

**remainsAsTasks** (who does what):
- **Default pricing change:** owner, on Pricing, with a step-up MFA confirm. The adapter must add the audit row `platform-config` PUT lacks (`platform-config/route.ts:48-52`).
- **Stripe Connect onboarding:** owner completes the hosted Stripe URL. The adapter only mints the link, under a lock, because concurrent calls double-create (Appendix A note). **Bank account/IBAN entry stays human-only** (`payment_save_bank`).
- **Provisioning the first school:** owner presses Provision on the prefilled Schools > New school form. The credential is shown there once. Then the school's owner (SUPER_ADMIN/ADMIN) runs `/onboarding` and their own questionnaire. Watch the verifier note that owner provisioning sets `onboardingComplete:true` and skips the school's questionnaire.
- **Pilot activation:** owner, after the school's consent is recorded (`consentReference` required for ACTIVE). Case-study permission comes from the school's institution authority.
- **Waiting subscription requests and provider events:** owner decides on each screen (C).
- **Emergency support grants awaiting evidence:** the target school's institution authority (`governance.support_emergency_review`).
- **MFA enrolment** if `mfaEnabled=false`: owner, on `/protect-account`. Never automated.
- **Adding another platform operator (APP_OWNER):** no in-app path, because APP_OWNER is not in `OWNER_CREATABLE_ROLES`. This is an engineering or ops task.
- **Default support-access posture** (preferred grant length, typical scopes): there is no preference store or adapter, so it is recorded as a checklist note only.
- **Audit gaps:** engineering closes them before the class C adapters ship. `payment-settings` POST, `platform-config` PUT and the fire-and-forget `logSuperAdminAction` calls write no reliable audit row.

## Top requests

The 10 most likely free-form requests from an owner, in realistic language:

| # | Request | Capability key(s) | Class | Adapter today |
|---|---|---|---|---|
| 1 | "Show me every school on PRO whose subscription is in grace or expires this month." | `platform.inspect` (needs status/plan/expiry filters from `GET /api/owner/schools`) | A | partial: name search only (`platform.ts:11`), so an extension is needed |
| 2 | "Approve Al-Noor's grace extension request for two weeks." | `platform.subscription_request_review` | C | none, needed (prepare + deep link; approve on Subscription requests) |
| 3 | "Onboard Crescent Grammar as a single school on BASIC; the owner is Sara Khan, sara@crescent.edu.pk." | `platform.provision_school` | C | none, needed (prefilled form; credential never in chat) |
| 4 | "Move Beacon Valley to Enterprise from next month." | `platform.update_school_plan_status` | C | none, needed (it rewrites `aiCreditsLimit` and `commercialContract`) |
| 5 | "Fix the website for City Model School to https://citymodel.edu.pk." | `platform.update_institution` | B | partial: exists, but it auto-runs. It needs class B, `logSuperAdminAction`, and the support-session refusal from `requirePlatformOwner` (Appendix A C8 note l.1002). |
| 6 | "Request 30 minutes of support access to Al-Falah to correct their contact email." | `platform.support_grant_request`, then `platform.support_action_queue` | C | none, needed. The grant waits for the school authority's MFA approval. `support_session_start` is an HttpOnly cookie, so the owner starts it in the browser. |
| 7 | "Log out all sessions for the Al-Noor bursar account, it may be compromised." | `platform.session_terminate` | C | none, needed (the adapter must await its audit write) |
| 8 | "Mark the failed Stripe event for Beacon Valley resolved: refund already done manually." | `platform.resolve_provider_event` | B | none, needed (note only; never applies the event) |
| 9 | (Urdu) «النور اسکول کے لیے یکم نومبر سے LEAP پائلٹ بنا دیں، مارکس انٹری اور حاضری ناپنی ہے» ("Create a LEAP pilot for Al-Noor school from 1 November; we need to measure marks entry and attendance.") | `platform.pilot_create` | B | none, needed |
| 10 | (Arabic) «خفّض حد الطلبات الخلفية لمدرسة الريادة إلى 20 حتى نهاية اليوم بسبب الحادث» ("Lower Al-Riyada school's background request limit to 20 until the end of the day because of the incident.") | `platform.capacity_apply_policy` (school-scoped, so expiresAt is required) | B | none, needed |

**Refused with a "who must do this" answer** (never adapters): `platform.reset_user_password` (plaintext credential, no MFA), `platform.payment_save_bank` (bank data), `platform.archive_school` (an exact typed-name confirmation must stay human), and `platform.provision_user` credential relay. Also refused: any tenant record work (students, admissions, marks, fees) outside an approved support grant's school_profile scope. The answer is "ask the school's administrator, or request support access".

## Adapters needed

Each adapter calls the existing direct or wrapper service, re-checks `requirePlatformOwner` (including the "end support session first" refusal), MFA where the route demands it, and accessVersion. Each binds approval to version + previewHash + idempotency key and runs inside `runUnscoped` with a stated reason. Each gets an explicit two-tenant isolation test (B.qa).

- `platform.inspect`: extend with plan/status/expiry filters and the read lookups. Class A, read only, never "done".
- `platform.update_institution`: rework, not new. Reclass to B, add `logSuperAdminAction`, honour the support-session refusal.
- `platform.pilot_create`: B, direct (`pilots/service.ts`).
- `platform.capacity_apply_policy`: B, direct (`capacity/service.ts:102`).
- `platform.resolve_provider_event`: B, direct.
- `platform.subscription_request_review`: C, inline-prisma, so it needs a service extraction.
- `platform.provision_school`: C, inline-prisma. Add an idempotency key, never return the tempPassword to the engine, and await the audit write.
- `platform.update_school_plan_status`: C, inline-prisma.
- `platform.set_default_plan_pricing`: C, inline-prisma. Add schema strictness (unknown keys are stored today) and an audit row.
- `platform.payment_connect_onboarding`: C, inline-prisma. Add a lock against a double Connect account.
- `platform.support_grant_request`: C, inline-prisma. MFA required; the school authority approves.
- `platform.support_action_queue`: C. Its executor `platform.support_action_execute` needs a second-person check that does not exist today.
- `platform.session_terminate`: C, inline-prisma.
- Product plumbing (not a capability key): extend `requiredOnboardingPath` for APP_OWNER, and add a confirmation-class field on `automaticCatalog` entries.

## Role-specific guardrails

- **Rule 19 / ROLE_PURPOSE:** the owner never assumes tenant access. Every unscoped read or write states its reason (`runUnscoped("…")`) and is audited. Tenant data is reached only through an approved, unexpired support grant, whose writes are limited to school_profile phone, contactEmail and website. Safeguarding, clinic, counselling and custody scopes can never be granted (`support-access.ts:10`). The AI may draft the grant request but never starts the cookie session.
- **Rule 5:** no chat phrase alone changes money or access. Pricing, plan or status changes, gateway connection, subscription decisions, school provisioning, session termination and support grants are class C. The AI prepares the typed preview, finishes with `awaiting_approval`, and deep-links to the owner screen. A bare "yes", typed or spoken, does nothing.
- **Rule 8:** no accounts created or invited silently. `provision_school` / `provision_user` stay class C. Credentials (tempPassword, password resets) are never generated, relayed, typed or logged by the AI. The new school owner's own questionnaire is a remaining task, not "done".
- **Separation-of-duties gaps the adapters must not inherit:** `pilot_review_claim` has no proposer≠reviewer check. `support_action_execute` lets the same owner queue and execute. The AI must not be the proposer of a claim it then routes to the same owner for approval without flagging it.
- **Honest outcomes:** inspect results and checklists are `answered` / `plan_saved`. Stripe onboarding ends at "link ready; complete it in Stripe". A pilot is DRAFT until consent is recorded.
- **PII:** school contact emails, owner names in #8, and champion names are masked before any prompt. Pilot participants are pseudonyms only. OpenAI stays the provider. Each owner AI action consumes credits, so the owner bypass of `ai.add` (`service.ts:33`) must not become a bypass of credit metering.
- **Exam Studio, voice and documents:** none applies to the owner; nothing to deep-link. Voice and document intake stay with SKO-460.


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `language` | Which language should your console use? | choice | profile.update_own | A | yes | User.preferredLanguage (prisma/schema.prisma:683) or locale cookie from src/app/actions/locale.ts:saveLanguagePreference |
| `identity` | Is this how schools and auditors should see your name and city? | text-last-resort (prefilled, confirm-only) | profile.update_own | A | yes | User.fullName, User.city |
| `focusAreas` | What do you look after first each day? | multi | personal.save_plan | A | yes | GET /api/navigation/counts and GET /api/owner/stats (busiest queue first) |
| `queueTriage` | These items are waiting. Which go on your first checklist? | multi | personal.save_plan, platform.subscription_request_review, platform.resolve_provider_event | A | no | GET /api/owner/subscription-requests, /api/owner/provider-events, /api/owner/support/grants, /api/owner/workflows |
| `institutionFixes` | These schools are missing a city or website. Add them now? | multi + short text per chosen field | platform.update_institution | B | no | platform.inspect (src/lib/automation/platform.ts:10-13) rows with null city/website |
| `defaultPricing` | Keep these default monthly prices for new schools? | stepper (one per plan FREE/BASIC/PRO/ENTERPRISE) | platform.set_default_plan_pricing | C | no | GET /api/owner/platform-config |
| `paymentGateway` | How will schools pay you? | choice | platform.payment_connect_onboarding | C | no | GET /api/owner/payment-settings (configured booleans only) |
| `firstSchool` | Do you have a school to onboard now? | choice + short structured form (name, type, country, plan, owner name, owner email) | platform.provision_school | C | no | country from owner profile; plan list from GET /api/owner/platform-config |
| `leapPilot` | Are you running a pilot with a school? | choice + school choice, date, language choice, curriculum tags, champion text, workflow multi | platform.pilot_create | B | no | GET /api/owner/schools (school list, country); measurementOwnerId = current user (src/lib/pilots/service.ts:29-43) |
| `capacityGuard` | Set a platform-wide limit for background work now? | choice + scope choice + stepper (0-1000) + short reason text | platform.capacity_apply_policy | B | no | GET /api/owner/capacity (current policies; src/lib/capacity/service.ts:97-101) |

**Auto-provisioned:**
- profile.update_own: preferredLanguage, fullName, city, then onboardingComplete=true (class A)
- personal.save_plan: private 'Owner desk' checklist ordered by focusAreas with deep-linked rows for each triaged queue item and each skipped or class-C item (class A, outcome plan_saved)
- platform.update_institution: confirmed city/website/name fixes per school, audited (class B, one confirm per row)
- platform.pilot_create: DRAFT pilot charter with chosen school, dates, language, curriculum, workflows; measurement owner = self (class B)
- platform.capacity_apply_policy: platform-wide background limit with reason, revertible via platform.capacity_revert_policy (class B, only if chosen)

**Remains as tasks:**
- Apply default plan pricing change: APP_OWNER on Pricing with step-up MFA confirm (class C); adapter must add the missing audit row
- Complete Stripe Connect onboarding: APP_OWNER on the hosted Stripe URL; bank account/IBAN entry stays human-only (platform.payment_save_bank never automated)
- Provision first school: APP_OWNER presses Provision on the prefilled Schools form (credential shown only there); then the new school's SUPER_ADMIN/ADMIN runs /onboarding and their own questionnaire
- Activate the pilot: APP_OWNER after the school's consentReference is recorded; case-study permission from the school's institution authority
- Decide waiting subscription requests and provider events: APP_OWNER on Subscription requests / Plans & revenue screens (class C)
- Review emergency support grants awaiting evidence: target school's institution authority (governance.support_emergency_review)
- Enrol MFA if mfaEnabled=false: APP_OWNER on /protect-account (never automated)
- Add another platform operator (APP_OWNER): no in-app path (not in OWNER_CREATABLE_ROLES); engineering/ops task
- Default support-access posture (grant length, typical scopes): no preference store or adapter; kept as a checklist note
- Close audit gaps (payment-settings POST, platform-config PUT, fire-and-forget logSuperAdminAction): engineering, before class C adapters ship

**Adapters needed:** `platform.inspect`, `platform.update_institution`, `platform.pilot_create`, `platform.capacity_apply_policy`, `platform.resolve_provider_event`, `platform.subscription_request_review`, `platform.provision_school`, `platform.update_school_plan_status`, `platform.set_default_plan_pricing`, `platform.payment_connect_onboarding`, `platform.support_grant_request`, `platform.support_action_queue`, `platform.session_terminate`


---

# SUPER_ADMIN

# SUPER_ADMIN — first-login questionnaire and top free-form requests

**Role in one line:** this is the group administrator. They handle campuses, group rules, delegation and group readiness. Classes, students, timetables and fees belong to the campus operators (`ROLE_PURPOSE.SUPER_ADMIN`, `src/lib/automation/catalog.ts:17`). Their questionnaire builds the group layer: campuses, leaders, standards and rules. It then hands each campus to its own administrator, whose questionnaire builds that campus.

**Coverage baseline**
- **Navigation features** (`role-nav.ts:113-129`): Overview, AI Workflows, Campuses, Approvals, People & access, Group standards, Billing & plan, Messages, Settings.
- **Permissions:** the matrix is fixed at VAED on all 17 modules (`permissions.ts:318`). In practice the real gates are the purpose predicates:
  - `isInstitutionAuthority` / `isGroupConsole` / `canOwnSubscription` (`institution.ts:24-32`)
  - `canManageCampusOps` / `canManageAcademics` / `canManageFinance` (`scope.ts:219-237`)
  - `canLeadAcademics` is always false for SUPER_ADMIN (`scope.ts:249-258`).
- **Typed operations:** none. `schoolAiOperationsFor` returns an empty set (`access.ts:76`), and B.typedOps §1 confirms SUPER_ADMIN cannot use `school.execute`.
- **What the AI can do today:** only `campus.create`, `profile.update`, `personal.save_plan` and `work.save` (`catalog.ts:33`). `campus.create` differs from `addCampus`: it does no calendar seeding, no email/phone validation, no CAMPUS_ADMIN invite, and checks role instead of `isGroupConsole` (Appendix A C8 invariants).
- **Writes the role is allowed** (Appendix A, about 520 operator rows). The relevant group-level ones:
  - C2 people/access (`staff.*`, `memberships.change_access`, `leave.*`, `roles.update_permission`, `identity.*`)
  - C5 `group_policy.*` (SUPER_ADMIN only), `chat.update_school_settings`, `policies.approve`
  - C1 `academic.model.create_template` / `approve_template` (SUPER_ADMIN only)
  - C6 `subscription.*`, `tax.approve_package`, `payroll.save_policy` / `approve_run`
  - C7 `campus_packages.*`
  - C8 `governance.*`, `readiness.*`, `onboarding.choose_package`
- **Name→id read lookups:** C2 (22: `GET /api/staff`, `GET /api/memberships`, designations) and C8 (33). SUPER_ADMIN may name any campus (`resolveCampusId`, `scope.ts:328-349`).

**Today's journey gap:** GROUP owners never see a questionnaire. Activation redirects them to `/setup/readiness` (`setup-role.ts:6-8`), and ONBOARDING writes are refused for non-campus roles (`access.ts:247`). A SUPER_ADMIN created by the owner gets `onboardingComplete:true` and skips first-run entirely (C8 verifier). This design adds a group-scoped questionnaire record that is not campus-pinned. Trigger it from a first-login marker, not from `onboardingComplete`.

---

## Known before asking (never ask again)

| Fact | Source (prefill) |
|---|---|
| Owner name, email, phone, preferred language; `isInstitutionOwner`, `canPurchaseSubscription` | `src/lib/auth/register.ts:147-162` |
| Institution kind GROUP, school name, country, currency | `register.ts:133-144,164-171` (School, LocalePolicy) |
| School identity: city, address, phone, website, logo, established year, tagline, regId, **timezone** | wizard `schoolDraftSchema` `src/lib/onboarding/setup-state.ts:55-78`, written by `completeSetup` `src/lib/onboarding/setup-service.ts:369-384` |
| Academic year label, start/end, **weekends** (ACTIVE cycle + Weekend rows per campus) | `setup-service.ts:419-425` |
| Campus drafts: name, city, address, phone, email, website, **principalName** (no email), regId, board; which ones were activated and which overflow as drafts over `maxCampuses` | `setup-state.ts:42-54`; `splitByCapacity` `setup-service.ts:365` |
| Adoption mode (EXAM_STUDIO / FULL_OPERATIONS), package chosen | `setup-state.ts:13-27`; `onboarding.choose_package` |
| Plan limits (campuses, teacher seats, AI credits) | `src/config/plans.ts`; `assertPlanCapacity` (`role-action-service.ts:31`) |
| Existing members, pending invitations, delegation flags | `GET /api/memberships`, `GET /api/staff` (Appendix A C2 lookups) |
| Existing group policy templates/versions and the allowed keys (GRADING 9 keys, CALENDAR 4 keys) | `src/lib/group-policy/service.ts:23-45,259` |
| Messaging settings (defaults: no student↔student or parent↔parent, attachments on, quiet hours off 20:00–07:00) | `src/lib/chat/policy.ts:55-75` |
| Readiness checks and tasks per campus; lead = authority/delegate | `src/lib/readiness/service.ts:22-26,82` |
| Effective locale package (weekend override, currency) | `src/lib/locale/store.ts:5-15` |
| MFA status (needed for People & access, permissions, support grants) | session / `permission-administration.ts:18-25` |
| Delegate case: a SUPER_ADMIN created by `assignOnboardingDelegate` (with temporary password) inherits the creator's wizard draft | `setup-service.ts:517` |

Not applicable to this role: assigned classes and subjects, children.

---

## Questions (14; at most 10 shown for a typical group)

All answers are typed (not 4000-char strings). Each is confirmed per key (`confirmedKeys`). Every row is prefilled where a source exists. The final review screen shows the exact batch preview. Class B items run only after a confirm bound to `pendingKey + previewHash + job.version`. Class C items are saved as prepared drafts and route to their domain screen.

| # | key | Prompt (EN) | Input | Drives | Class | Req. | Prefill |
|---|---|---|---|---|---|---|---|
| 1 | `campusRoster` | "These are your campuses. Fix anything wrong, and add any campus you'll open this year." | Editable rows (name, city, phone; status Live / Draft / Add) | `campus.create` (rebuilt on `addCampus`: calendar seeding + plan capacity), `campus.update_details` | B | yes | Wizard campus drafts + live campuses |
| 2 | `planHeadroom` *(only if rows exceed `maxCampuses`)* | "Your plan covers N campuses. What should happen to the extra ones?" | Choice: keep as drafts / request a bigger plan | `subscription.preview` (read), `subscription.request_plan_change` | C | cond. | `plans.ts` + roster count |
| 3 | `campusLeaders` | "Who runs each campus day to day?" | Per-campus row: campus admin (name, email) + principal (name, email); "I'll add later" chip | `staff.invite` (role CAMPUS_ADMIN / PRINCIPAL; leaders only by the authority, `membership-access.ts:83`) | C | yes (one of: a name or "later") | `principalName` from wizard; existing members |
| 4 | `leaderDelegation` | "Can campus admins invite and manage their own staff?" | Choice per campus: yes / no / decide later | `memberships.change_access` (`canManageMemberships`) | C | no | Current flags (default no) |
| 5 | `standardsScope` | "Which rules should be the same at every campus?" | Grid per rule (Grading, Calendar): Locked for all / Group default, campus can ask to change / Each campus decides | `group_policy.create_template` (incl. `overridableKeys`) | B | yes | Existing templates |
| 6 | `gradingStandard` *(if Grading not "each campus")* | "Set the group grading scale." | Preset by board/country + steppers: pass %, A+/A/B/C/D starts; choices: rounding, missing marks, absent marks | `group_policy.save_draft` (GRADING), then `group_policy.submit_for_review` | B | cond. | Board/country preset; must strictly descend (service rule) |
| 7 | `calendarStandard` *(if Calendar not "each campus")* | "Set the group calendar basics." | Weekday chips (weekend, up to 3), week-start chip, terms stepper 1–4, school-day start time | `group_policy.save_draft` (CALENDAR) | B | cond. | Wizard weekends; locale package |
| 8 | `standardsReviewer` | "Who checks group rules before they go live?" | Choice: a named colleague (picker of active SUPER_ADMIN/delegates) / me alone (a reason is required) | parameter of `group_policy.submit_for_review`; enables `group_policy.review_version` by that person | none | cond. | Members list; `soleReviewer` flag (`group-policy/service.ts:259`) |
| 9 | `staffStructure` | "What kind of institution are you? We'll set up the staff ranks." | Choice: School (K-12) / College / University / Academy / Custom | `staff.apply_hierarchy_preset` (tops up and never duplicates) | B | no | `INSTITUTION_PRESETS` (`src/lib/staff/hierarchy-presets.ts:213`) |
| 10 | `leavePolicy` | "Which staff leave types and yearly days apply across campuses?" | Tags (Casual, Sick, Annual, + custom) × day stepper; campus multi-select (default all live) | `leave.create_type`, `leave.create_allocation` (per campus) | B | no | Existing leave types |
| 11 | `messagingRules` | "Who may message whom across the group?" | Toggles: parent↔parent, student↔student, families→office, attachments; quiet-hours time range | `chat.update_school_settings` (GROUP authority only) | B | no | `DEFAULT_CHAT_SETTINGS` / current |
| 12 | `readinessOwners` | "Who should chase each campus's go-live checklist?" | Per campus: me / its campus admin once they join | `readiness.update_task` (assign self now; reassign queued until the leader is active) | A | no | `readinessView` |
| 13 | `signInDomain` | "Do staff sign in with school Google or Microsoft accounts? Which domain?" | Choice (No / Google / Microsoft) + domain field (text, last resort) | `identity.add_domain` (issues a DNS token, so no access yet) | B | no | none |
| 14 | `homePriorities` | "What should your Overview show first?" | Ordered multi: campus readiness, approvals waiting, plan & AI credits, standards drift, support requests | `profile.update_own` (extended with a workspace preference) | A | no | Default order |

**Not asked because there is no adapter or it is a policy without a record:** governance priorities as prose, support-access stance (grants are decided one request at a time), and permission matrix edits. The last needs MFA and is an access grant, so it stays a human task in People & access. Language is not asked again (it comes from registration). An inline language chip in the header lets the user change it, through `profile.update_own`, class A.

**Interaction notes (LEAP demo):**
- The questionnaire is shown as a "Group map". Campuses appear as cards on one canvas. Answering Q3 fills each card with leader avatars marked "invite prepared". Q5–Q7 show a live "same everywhere / campus may ask / campus decides" lens over all cards.
- Phone: the cards become a vertical list. Tablet: two columns. RTL mirrors the order of the canvas.
- One review sheet groups the result into three receipts:
  - "Creating now" (A/B, with the exact preview)
  - "Prepared — needs your sign-off in People & access / Approvals" (C)
  - "Handed to campus admins"
- Built only from shared primitives (`ModalSurface`, `Button`, stepper/chip components) and passes the `check:ui` gate.

---

## Build outcome

### autoProvisioned (after the single bound confirm on the review sheet)
- **Campuses:** new campus rows via `campus.create`, rebuilt on `src/app/actions/addCampus.ts`. Each gets an ACTIVE cycle copied from a sibling plus weekend rows, inside `assertPlanCapacity(campuses)`. Corrected details on existing campuses go through `campus.update_details` (`settings.ts:97-107`, revision check + audit).
- **Group standards:** a template per chosen domain via `group_policy.create_template`, with locked/overridable keys from Q5. A DRAFT version holds the grading and calendar values (`group_policy.save_draft`), and it is submitted to the named reviewer (`group_policy.submit_for_review`, preview hash bound). The receipt says "submitted for review", not "live".
- **Staff ranks:** the designation ladder and units via `staff.apply_hierarchy_preset`.
- **Leave:** leave types plus yearly allocations per selected campus (`leave.create_type`, `leave.create_allocation`). Existing names are KEPT (409 on replay is mapped to KEEP).
- **Messaging:** the group messaging policy (`chat.update_school_settings`).
- **Sign-in domain:** the domain is registered as pending verification with its DNS token (`identity.add_domain`).
- **Readiness:** checklist tasks are assigned to the SUPER_ADMIN where Q12 says "me" (`readiness.update_task`).
- **Preferences:** the Overview order is saved to the user's own profile (`profile.update_own`).
- **Plan check:** the plan-change preview is shown (`subscription.preview`, read only).

### remainsAsTasks (honest; shown as setup tasks, never as "done")
- **Send leader invitations** (`staff.invite`, class C). Done by the SUPER_ADMIN in People & access with MFA, on prepared rows. After that each invitee accepts with their own password. AI never relays credentials.
- **Membership delegation** (`memberships.change_access`, class C). Done by the SUPER_ADMIN in People & access with MFA, after each leader is active.
- **Approve the group standards version** (`group_policy.review_version`, class C). Done by the named reviewer, or by the SUPER_ADMIN as sole reviewer with the required reason. After that, activation runs on schedule (`system.group_policy_activate`).
- **Plan upgrade** (`subscription.request_plan_change`, class C). APP_OWNER platform review comes first. Then the SUPER_ADMIN completes checkout in the browser (`subscription.start_checkout` is human only).
- **SSO:** domain verification is done by the school's IT through DNS. Saving the identity connection with its client secret (`identity.save_connection`) is human only.
- **Campus build-out** (classes, sections, subjects, rooms, periods, students, staff below leader level, fee structures): done by each campus's ADMIN/CAMPUS_ADMIN in their own campus questionnaire. Year activation, timetables and exam sessions are done by each principal (academic lead).
- **Group academic model template** (`academic.model.create_template` / `approve_template`). Later step for the SUPER_ADMIN; it overlaps with the GRADING standard, so only one source should be chosen.
- **Readiness sign-off** (`readiness.approve`). Done by the SUPER_ADMIN once the required checks pass with real records.
- **Tax package approval** (`tax.approve_package`). The SUPER_ADMIN approves after the accountant prepares it.

---

## Top requests (free-form)

| # | Request (as typed) | Capability keys | Class | Adapter today? |
|---|---|---|---|---|
| 1 | "Open a new campus in Johar Town, Lahore and make Sana Malik (sana@…) its campus admin" | `campus.create` + `staff.invite` (CAMPUS_ADMIN) | B + C | `campus.create` partial (differs from `addCampus`), needs a rebuild; `staff.invite` partial (STAFF setup excludes leaders, and SA has no `school.execute`), needs a new adapter |
| 2 | "Which campuses are behind on setup and what's missing at each?" | `readiness.view` (read; group-wide `readinessView`) | A | none, needs a read adapter (SA has no `school.inspect`) |
| 3 | "Make 40% the pass mark with the same grade bands at all campuses from next term" | `group_policy.save_draft`, `group_policy.submit_for_review` → `group_policy.review_version` | B → C | none, needed |
| 4 | "North campus asked to change its weekend for Ramadan — approve it till Eid" | `group_policy.decide_override` | C (prepared, opened in Approvals with the request preselected) | none, needed |
| 5 | (UR) "تمام کیمپسز کے پرنسپلز کو دعوت نامے دوبارہ بھیج دیں" (resend invitations to all campus principals) | `staff.resend_invitation` | C | none, needed |
| 6 | (AR) "أوقف دخول أحمد في فرع الشمال فوراً" (block Ahmed's access at the North branch now) | `staff.deactivate` / `memberships.change_access` | C | none, needed |
| 7 | "Skoolee support asked to see Model Town's fee setup — approve it for one day" | `governance.support_grant_decide` | C (MFA; AI never approves, opens Approvals) | none, needs a prepare-and-route adapter |
| 8 | "Let campus admins invite their own teachers" | `memberships.change_access` (`canManageMemberships`) | C | none, needed |
| 9 | "We're opening two more campuses next year — what plan do we need? Request it." | `subscription.preview` + `subscription.request_plan_change` | A + C | none, needed |
| 10 | "Turn off parent-to-parent chat everywhere and set quiet hours after 9 pm" | `chat.update_school_settings` | B | none, needed |

**Requests that must not execute** (answer with "who must do this" and a link):
- "Add Grade 6 sections at Gulberg" or "import students": these belong to the campus operator (`role-setup.ts:4`, rule 19).
- "Publish results" or "send fee reminders": class C domains owned by other roles.
- Any request to type or reset a password (`governance.reset_user_password` is human only).
- Exam papers: deep-link into Exam Studio. SUPER_ADMIN cannot open Exam Studio by design (B.decisions rule 19).

---

## Adapters needed
`campus.create` (rebuild on addCampus), `campus.update_details`, `subscription.preview`, `subscription.request_plan_change`, `staff.invite`, `staff.resend_invitation`, `staff.deactivate`, `memberships.change_access`, `group_policy.create_template`, `group_policy.save_draft`, `group_policy.submit_for_review`, `group_policy.review_version` (prepare/route only), `group_policy.decide_override` (prepare/route only), `staff.apply_hierarchy_preset`, `leave.create_type`, `leave.create_allocation`, `chat.update_school_settings`, `readiness.update_task`, `readiness.view` (read), `identity.add_domain`, `profile.update_own` (extend with workspace preferences), `governance.support_grant_decide` (prepare/route only).

Reuse notes:
- **Clean `(AuthUser, body)` services exist for:** group_policy, hierarchy preset, readiness, identity, and chat settings (in `src/lib/chat`).
- **Need a wrapper:** `staff.invite`, `resend` and `deactivate` (their email base URL sits in the server action).
- **Logic lives only in the route; extract a service first:** `leave.*`, `memberships.change_access`, `subscription.request_plan_change`, `chat.update_school_settings`.

---

## Role-specific guardrails
- **Purpose ceiling (catalog.ts:17; rule 19):** the role covers campuses, governance, delegation and group readiness. It never creates classes, students, subjects, timetables, fee lines or attendance, even when the matrix (fixed VAED) and `canManageCampusOps` would allow the route. Such requests answer "who must do this" and name the campus admin or principal. Widening `schoolAiOperationsFor` for SUPER_ADMIN is forbidden (T2). The new adapters are group-level only.
- **Rule 5:** no chat phrase alone grants access, sends invitations, approves standards or overrides, approves support access, changes the plan or moves money. All of these are class C: prepared draft plus preview, then a deep link to People & access, Approvals or Billing, with MFA where the route needs it. Messaging settings are class B, and they never send a message.
- **Rule 8:** leader and staff invitations stay pending until accepted. Automation never creates active accounts, never generates or relays temporary passwords (`assignOnboardingDelegate`, `provision_user` and the reset routes stay human only), and never links guardians. Roster batches through `identity.apply_roster_batch` are out of scope for this role's AI.
- **Separation of duties:**
  - Group standards: the reviewer must differ from the author, unless the actor is sole reviewer and gives the stated reason (`SELF_APPROVAL_REASON_MIN`).
  - Support grants: the institution authority decides an APP_OWNER request. The AI never takes either side.
  - No self-approval from chat on any `APPROVAL_DECISION` row.
- **Every write re-checks:**
  - `isGroupConsole` / `isInstitutionAuthority` (not just `role === "SUPER_ADMIN"`)
  - `accessVersion` and school operational status
  - plan capacity, for campuses
  - the campus named in the request resolved through `resolveCampusId`
  - Note: `completeSetup` bumps `accessVersion`, so a job started during first login must pause and resume after the session is re-issued.
- **Privacy and cost:**
  - Pseudonymise invitee names, emails and phones before every prompt; mask class and subject names as entities, not as `[PERSON_n]` (B.engine defect).
  - Charge credits per AI action and reserve an estimate before the group setup job starts.
  - Outcomes are honest: a readiness read is "answered", a submitted standard is "awaiting approval", and a prepared invitation is "prepared — not sent".


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `campusRoster` | These are your campuses. Fix anything wrong, and add any campus you'll open this year. | editable-rows (name, city, phone; status Live/Draft/Add) | campus.create, campus.update_details | B | yes | Wizard campus drafts (src/lib/onboarding/setup-state.ts:42-54) + live campuses written by completeSetup (src/lib/onboarding/setup-service.ts:396-413) |
| `planHeadroom` | Your plan covers N campuses. What should happen to the extra ones? | choice (keep as drafts / request a bigger plan); shown only when roster exceeds maxCampuses | subscription.preview, subscription.request_plan_change | C | no | src/config/plans.ts maxCampuses + splitByCapacity (setup-service.ts:365) |
| `campusLeaders` | Who runs each campus day to day? | per-campus rows: campus admin (name, email) + principal (name, email); 'I'll add later' chip | staff.invite | C | yes | Wizard campus principalName (setup-state.ts:50) + GET /api/memberships |
| `leaderDelegation` | Can campus admins invite and manage their own staff? | choice per campus (yes / no / decide later) | memberships.change_access | C | no | Current canManageMemberships flags (GET /api/memberships) |
| `standardsScope` | Which rules should be the same at every campus? | grid per rule (Grading, Calendar): locked / group default with campus override / each campus decides | group_policy.create_template | B | yes | Existing group policy templates (src/lib/group-policy/service.ts:259) |
| `gradingStandard` | Set the group grading scale. | preset choice + steppers (pass %, A+/A/B/C/D starts) + choices (rounding, missing marks, absent marks) | group_policy.save_draft, group_policy.submit_for_review | B | no | Board/country preset; GRADING keys in src/lib/group-policy/service.ts:28-38 |
| `calendarStandard` | Set the group calendar basics. | weekday chips (weekend <=3), week-start chip, terms stepper 1-4, school-day start time | group_policy.save_draft | B | no | Wizard weekends (setup-state.ts:77; setup-service.ts:425) + locale package (src/lib/locale/store.ts:5-15) |
| `standardsReviewer` | Who checks group rules before they go live? | choice: named colleague (picker) / me alone (a reason is required) | group_policy.submit_for_review, group_policy.review_version | none | no | Active SUPER_ADMIN/delegates (GET /api/memberships); soleReviewer flag (group-policy/service.ts:259) |
| `staffStructure` | What kind of institution are you? We'll set up the staff ranks. | choice (School K-12 / College / University / Academy / Custom) | staff.apply_hierarchy_preset | B | no | INSTITUTION_PRESETS (src/lib/staff/hierarchy-presets.ts:213) |
| `leavePolicy` | Which staff leave types and yearly days apply across campuses? | tags x day stepper + campus multi-select | leave.create_type, leave.create_allocation | B | no | Existing leave types per campus (GET /api/leave/types) |
| `messagingRules` | Who may message whom across the group? | toggles (parent-parent, student-student, families-to-office, attachments) + quiet-hours time range | chat.update_school_settings | B | no | getChatSettings / DEFAULT_CHAT_SETTINGS (src/lib/chat/policy.ts:65-75) |
| `readinessOwners` | Who should chase each campus's go-live checklist? | choice per campus (me / its campus admin once they join) | readiness.update_task | A | no | readinessView (src/lib/readiness/service.ts:82) |
| `signInDomain` | Do staff sign in with school Google or Microsoft accounts? Which domain? | choice (No / Google / Microsoft) + domain text (last resort) | identity.add_domain | B | no | Domain of the owner's email (register.ts:147-162), offered as a suggestion only |
| `homePriorities` | What should your Overview show first? | ordered multi (campus readiness, approvals waiting, plan & AI credits, standards drift, support requests) | profile.update_own | A | no | Default order |

**Auto-provisioned:**
- campus.create — new campus rows with seeded ACTIVE cycle + weekends inside plan capacity (rebuilt on src/app/actions/addCampus.ts)
- campus.update_details — corrected name/city/phone of existing campuses (settings.ts:97-107, revision check + audit)
- group_policy.create_template — one template per chosen domain (GRADING/CALENDAR) with locked vs overridable keys
- group_policy.save_draft — DRAFT version holding the grading scale and calendar basics
- group_policy.submit_for_review — draft submitted to the named reviewer with preview hash (receipt: submitted, not live)
- staff.apply_hierarchy_preset — designation ladder and units for the chosen institution type
- leave.create_type — staff leave types per selected campus (existing names KEPT)
- leave.create_allocation — yearly day allocations per leave type and campus
- chat.update_school_settings — group messaging policy and quiet hours
- identity.add_domain — sign-in domain registered as pending verification with DNS token
- readiness.update_task — campus checklist tasks assigned to the SUPER_ADMIN where chosen
- profile.update_own — Overview priority order saved as own workspace preference
- subscription.preview — plan-change preview shown (read only)

**Remains as tasks:**
- staff.invite — send prepared CAMPUS_ADMIN/PRINCIPAL invitations: SUPER_ADMIN in People & access with MFA; then each invitee accepts with their own password
- memberships.change_access — grant canManageMemberships delegation: SUPER_ADMIN in People & access with MFA, after leaders are active
- group_policy.review_version — approve the standards version: named reviewer (or SUPER_ADMIN as sole reviewer with reason); activation then runs via system.group_policy_activate
- subscription.request_plan_change — APP_OWNER platform review, then SUPER_ADMIN completes subscription.start_checkout in the browser
- identity.verify_domain / identity.save_connection — school IT verifies DNS; client secret entered by a human only
- Campus build-out (classes, subjects, rooms, periods, students, non-leader staff, fee structures) — each campus ADMIN/CAMPUS_ADMIN in their own campus questionnaire
- academics.transition_year / timetables / exam sessions — each campus PRINCIPAL (academic lead)
- readiness.update_task reassignment to campus admins — queued until each leader account is active
- academic.model.create_template / approve_template — later SUPER_ADMIN step; choose one source of truth with the GRADING standard
- readiness.approve — SUPER_ADMIN sign-off once required checks pass on real records
- tax.approve_package — SUPER_ADMIN approval after the ACCOUNTANT prepares the package

**Adapters needed:** `campus.create`, `campus.update_details`, `subscription.preview`, `subscription.request_plan_change`, `staff.invite`, `staff.resend_invitation`, `staff.deactivate`, `memberships.change_access`, `group_policy.create_template`, `group_policy.save_draft`, `group_policy.submit_for_review`, `group_policy.review_version`, `group_policy.decide_override`, `staff.apply_hierarchy_preset`, `leave.create_type`, `leave.create_allocation`, `chat.update_school_settings`, `readiness.update_task`, `readiness.view`, `identity.add_domain`, `profile.update_own`, `governance.support_grant_decide`


---

# ADMIN

# ADMIN: first-login questionnaire and top free-form requests

**Who this is.** In almost every tenant, ADMIN is the **standalone school owner** (`isStandaloneOwner`, `src/lib/auth/institution.ts:33`). They land on `/ai?setup=1` straight after the Charter Desk wizard (`src/lib/school-ai/setup-role.ts:6-8`). A less common case is an ADMIN pinned to a campus inside a GROUP. That user has no institution authority and can create staff invitations only with `canManageMemberships` (`school-setup-service.ts:36-39,84-86`). The questionnaire branches on two things, both re-read at every step: `isStandaloneOwner`, and the **seats** (`getCampusSeats`, `src/lib/auth/seats.ts:12-27`).
- With no active PRINCIPAL, the admin is also the academic lead and gets the ACADEMIC_TOOLS.
- With no active ACCOUNTANT, the admin is also the finance desk and gets the FINANCE_TOOLS (`src/lib/school-ai/access.ts:56-60,84-89`).

ROLE_PURPOSE (`src/lib/automation/catalog.ts:18`): *"School administrator: operational setup within current campus and delegated academic/finance authority."*

**Reach today.** The nav checklist (B.roles §c, `role-nav.ts:132-205`) has about 45 leaves across Students, Attendance, Staff, Academics, Money, Campus services and Your school, all VAED by default (`permissions.ts:39-57`). Appendix A gives ADMIN 554 write rows. AI can reach only 6–15 typed ops plus `students.create`, `library.create_books`, `front_desk.log_call`, `profile.update`, `personal.save_plan` and `work.save`.

---

## Known before asking (never ask again; show it as one editable "Your school as we know it" card)

| Fact | Source (prefill) | Used for |
|---|---|---|
| School name, kind (STANDALONE/GROUP), status TRIAL | `src/lib/auth/register.ts:133-144`; wizard update `src/lib/onboarding/setup-service.ts:369-384` | header, branching |
| Country, countryIso, **currency** | LocalePolicy `register.ts:164-171` (`currencyForCountry`); `src/lib/locale/package.ts:8,31-38` | money grids in the fee step, board presets |
| Preferred language (en/ar/ur) → `dir` | `register.ts:152` `preferredLanguage` | questionnaire locale and RTL |
| Timezone, city, address, phone, email, website, logo, established year | `src/lib/onboarding/setup-state.ts:55-78` → `setup-service.ts:369-384` | not asked |
| Campus(es): name, board, principalName, regId | `setup-state.ts:40-53` (campus draft) → `setup-service.ts:396-413` | board → subject presets; principalName → seed for the "who leads" step |
| **Academic year: ACTIVE cycle** (label, year, start, end) | `setup-service.ts:419-423` | used as `existingCycleId`; never re-asked (removes the `CYCLE_DETAILS_CONFLICT` risk, `academic-setup-service.ts:20-26`) |
| **Weekends** | `setup-service.ts:425`; resolved via `src/lib/locale/store.ts:5-15` | day-shape grid greys these days out; WEEKENDS is not re-written |
| Plan / package, expectedCampuses, **expectedEnrollment** | `setup-service.ts:158-221`; `src/config/plans.ts` | suggested section counts; teacher-seat cap (`SETUP_TEACHER_LIMIT`, `school-setup-service.ts:99-103`) shown before the staff step |
| Seats held (PRINCIPAL / ACCOUNTANT active on campus), pending staff invitations | `src/lib/auth/seats.ts:12-27`; `staffInvitation` rows | skips or opens the fee step and the academic-lead steps |
| Existing classes, subjects, teachers, rooms, periods | `automaticCatalog` context `src/lib/automation/catalog.ts:47-55`; `setup-journey-service.ts:10-41` | KEEP semantics; resume after partial setup |
| Earlier answers (old ONBOARDING record: path, grades, resources, staff…) | `GET /api/school-ai/workspace?kind=ONBOARDING&activeOnly=1` (`school-ai-workspace.tsx:164-178`), `schemas.ts:23-34` | migration of the 18 free-text keys into the new structured keys |
| Permission matrix and capability keys (institutionAuthority, memberships, academicLead, financeDesk) | `src/lib/permissions.ts:316-323`; `src/lib/navigation/capabilities.ts:129-169` | hides questions whose adapter the user cannot run |

**Dropped from today's 18 keys:** `schoolName`, `country`, `timezone`, `campuses`, `academicYear`, `startDate`, `endDate`, `workingDays`. The wizard already wrote all of them, and no ADMIN tool edits them. A "This is wrong" link on the card opens School settings. That edit is a remaining task, because no route edits cycle dates (Appendix A `academic.cycle.create` corrections).

---

## Questions (13, seat-aware; one per screen on phone, two-pane on tablet/desktop)

**Interaction idea: the Campus Blueprint.**
- **Layout.** Each answer redraws a live blueprint pane: a grade ladder of section cards, a day strip of periods, a seat board of staff roles, and a fee strip per grade band.
- **Live counts.** Every answer shows "will create" counts, for example *24 classes · 168 subjects · 9 periods · 30 rooms · 18 pending invitations*.
- **No model where none is needed.** Structured answers map *deterministically* to typed proposals, so no AI step and no credit is spent on them. The model is used only for preset suggestions and for text-last-resort parsing. Those AI credits are estimated before Build and reserved per T9.
- **Shared components only.** Grids use logical properties and mirror in RTL.
- **Localised presets.** Number steppers and money inputs use the locale package (`formatMoney`, `package.ts:86`).

| # | key | Prompt (EN) | Input | Drives | Class | Req | Prefill |
|---|---|---|---|---|---|---|---|
| 1 | `startingPoint` | How are you starting? | choice: Fresh start / From a spreadsheet / Moving from another system | branching; `imports.stage_batch` path | none | yes | old ONBOARDING `path` (`schemas.ts:23`) |
| 2 | `academicLeads` | Who leads academics and finance here? | choice ×2: "I do" / "Someone will join" (name + email) / "Already on staff" | seat branch for steps 5, 9, 10; leadership invite draft | C | yes | `getCampusSeats` (`seats.ts:12-27`); campus `principalName` (`setup-state.ts:50`) |
| 3 | `gradeLadder` | Which grades do you run, and how many sections each? | stepper grid (grade presets from board/country; sections 0–12 per grade) | `academic.class.create` via `academics.setup_year` | B | yes | existing classes (`catalog.ts:51`); campus board; `expectedEnrollment` ÷ 30 → suggested sections |
| 4 | `teachingMode` | Class teacher for everything, or subject teachers? | choice per grade band (Early / Primary / Middle / Senior) → SINGLE / SUBJECT | `academic.class.create` (teachingMode field, `academic-setup.ts:16-21`) | B | yes | default SINGLE up to Grade 2, SUBJECT above |
| 5 | `subjectsByGrade` | Which subjects does each grade study? | tags per grade band (board preset chips) + total-marks stepper (default 100) | `academic.subject.create` via `setup.apply_changes` SUBJECTS | B | yes | board preset (new content table); existing subjects |
| 6 | `dayShape` | What does a school day look like? | schedule-grid: start time, period length, periods/day, breaks/assembly/prayer slots; second tab for exam slots | `academic.period.create` (CLASS + EXAM) via `setup.apply_changes` PERIODS | B | yes (if timetable wanted) | weekends greyed out from the wizard; existing `periodDefinition` rows |
| 7 | `rooms` | How many rooms do you have? | stepper per type (classroom / lab / hall) + layout rows × benches × seats + numbering pattern | `academic.room.create` via `setup.apply_changes` ROOMS | B | no | one classroom per section from step 3; existing `classRoom` rows |
| 8 | `staffRoster` | Who's on your team? | table rows (name, email/phone, role TEACHER/ACCOUNTANT/LIBRARIAN/RECEPTIONIST) with CSV paste; text-last-resort | `staff.invite` via `setup.apply_changes` STAFF (pending rows only) | B (create pending) / C (send) | no | pending `staffInvitation` rows; plan teacher cap |
| 9 | `feePlan` | What does each grade pay? *(only when financeDesk = admin)* | money grid per grade band (monthly) + one-time fee chips (admission, annual, exam) + due-day stepper + late fine (flat/percent/per day) + sibling discount % | `fees.create_fee_group`, `fees.create_fee_type`, `fees.create_master_line`, `fees.assign_fee_group`, `fees.create_fine_rule`, `fees.create_discount` | B | no | currency from LocalePolicy; grade bands from step 3 |
| 10 | `studentsRoster` | Add your students now? | choice: Upload spreadsheet / Admissions first / Later → upload goes through a staged review table | `imports.stage_batch` → `students.create` (importBatch review token, `inviteAccounts:false`) | B | no | file intake reuses the SKO-460 composer (deferred); spreadsheet only for now |
| 11 | `leavePolicy` | How many leave days do staff get each year? | stepper per type (Casual / Sick / Annual), optional per role | `leave.create_type`, `leave.create_allocation` | B | no | country defaults (new content) |
| 12 | `campusServices` | Which services do you run? | multi: Transport, Hostel, Library, Canteen, Front desk, Inventory | `readiness.update_task` (one owned setup task per service) | A | no | `capabilities.ts` package flags (`pkgCanteen`) |
| 13 | `familyMessaging` | How should families reach the school? *(standalone only)* | multi channels (App chat / Email / SMS / WhatsApp) + quiet-hours range + toggles (parent-to-parent, attachments) | `chat.update_school_settings` | B | no | current chat settings; plan WhatsApp entitlement |

**Ending.** A **Build my campus** sheet shows the full preview: a counts table, the first ten rows of each record type and the credit estimate. It is a single Class-B confirmation bound to `{questionnaireId, version, previewHash, pendingKey}`. A bare "yes" in chat does nothing.

---

## Build outcome

**autoProvisioned.** Created in dependency order after the one B confirmation, each with a receipt chip:
1. `academic.class.create`: sections from steps 3 and 4 in the wizard's ACTIVE cycle, via `academics.setup_year` with `existingCycleId`. Classes that already exist are KEPT.
2. `academic.subject.create`: per section, via SUBJECTS. This works now because the cycle is already ACTIVE (`school-setup-academics.ts:28`).
3. `academic.period.create`: CLASS and EXAM periods via PERIODS.
4. `academic.room.create`: via ROOMS.
5. `staff.invite`: **pending** invitation rows only (STAFF). Receipt reads "18 invitations ready, not sent".
6. `imports.stage_batch` → `students.create`: only after the admin reviews the staged rows. No accounts are created and no guardians are invited.
7. Finance desk = admin only: `fees.create_fee_group`, `fees.create_fee_type`, `fees.create_master_line`, `fees.assign_fee_group`, `fees.create_fine_rule`, `fees.create_discount`.
8. `leave.create_type`, `leave.create_allocation`.
9. `chat.update_school_settings` (standalone only).
10. `readiness.update_task`: one owned task per service chosen in step 12, plus every hand-off below.

**remainsAsTasks.** Each becomes an owned row on a "Hand-offs" board with a deep link.

| Task | Owner | Why it isn't automatic |
|---|---|---|
| Send staff invitations | ADMIN, in Staff & invites | access grant, class C (rule 8) |
| Invite the principal / accountant | ADMIN as institution authority, in People & access (`inviteLeaders`) | setup STAFF cannot invite leaders; access grant |
| Class-teacher and subject-teacher allocation | academic lead (principal, or the admin while the seat is vacant) | needs active TEACHER users (`school-setup-academics.ts:68-69`); runs after invitations are accepted |
| Draft and publish timetables | academic lead; publish is class C | needs allocations; `timetable.publish_reviewed` is C |
| Fee structure, when an accountant seat exists | ACCOUNTANT's own questionnaire | finance-desk seat |
| First invoices (`fees.generate_invoices`) | finance desk, in Fees | moves money, class C |
| Bank accounts / payment methods | finance desk, in Accounts | sensitive account numbers stay out of prompts |
| Guardian links and access | ADMIN, in Guardians & access | rule 8; class C |
| Guardian channel consent | parents, or the admin with verified evidence | `communications.set_guardian_channel_preference` needs consent evidence |
| Grading rules / assessment model | academic lead (Curriculum & grading / Exam Studio) | `academic.grading_rules.set` and `academic.model.activate` are academic-lead and publish |
| Attendance counting rule | academic lead / admin | `attendance.publish_counting_rule` is a publish |
| Canteen / hostel package with named operators | ADMIN | `campus_packages.setup` is an access grant (C) |
| Transport routes and vehicles; inventory stores | ADMIN, from the service task | not in the questionnaire scope |
| Correct year label or dates | ADMIN, in School settings | no route edits cycle dates |
| Readiness sign-off | ADMIN (`readiness.approve`) | approval decision |

---

## Top requests (free-form, after setup)

| # | Typical request | Capability keys | Class | Adapter today |
|---|---|---|---|---|
| 1 | "Mark Grade 3A attendance for today — all present except Ali and Sara." | `attendance.mark_class` via `attendance.record_register` | C (T3: shows the full per-pupil register; "all present" alone is refused) | partial |
| 2 | "Invite Ayesha Khan, ayesha@school.pk, as a Maths teacher." | `staff.invite` (STAFF pending row); sending = `staff.resend_invitation` | B to create, C to send | partial |
| 3 | "Open a new section 7C and move Hamza, Bilal and Zainab from 7B." | `academic.class.create` (`academics.setup_year`), `academic.class.transfer_section` (TRANSFERS) | B | partial |
| 4 | "Approve Mr Imran's leave for Thursday–Friday and arrange cover." | `leave.review`; `timetable.assign_substitutes` (only while no principal, otherwise route to the principal) | C | leave.review: none (needs a prepare-decision adapter); substitutes: partial |
| 5 | "Tell all Grade 5 parents school is closed tomorrow because of rain." | `academic.calendar.add_holiday` (HOLIDAYS) + `communications.queue_announcement` | B + C | partial / partial |
| 6 | "Grade 1–5 fee is Rs 4,500 a month plus Rs 10,000 admission." | `fees.create_fee_group`, `fees.create_fee_type`, `fees.create_master_line`, `fees.assign_fee_group` (finance desk only; else route to the accountant) | B | none |
| 7 | "Generate October invoices for Grades 1–5 and remind whoever is overdue." | `fees.generate_invoices` / `fees.generate_monthly_invoices`; `fees.send_due_reminder` | C | partial; reminder none |
| 8 | (UR) "۲۰ دسمبر سے ۵ جنوری تک سردیوں کی چھٹیاں کیلنڈر میں ڈال دیں" | `academic.calendar.add_holiday` (HOLIDAYS) | B | partial |
| 9 | (AR) "أضف الطالب يوسف أحمد إلى الصف الرابع (ب)، رقم ولي الأمر 0501234567" | `students.create` (asks for roll no/gender; guardian phone saved as contact only) | B | partial |
| 10 | "Give offers to the three Grade 1 applicants waiting since Monday." | `admissions.decide_application` | C | none |

Requests that are deep-link only: no new adapter, and the finish state is `awaiting_approval`.
- "Approve October payroll" (`payroll.approve_run`; separation rule).
- "Publish results / send report cards" (`exams.publish_results`, `reports.send_all`). These go to Exam Studio / Report cards.

---

## Adapters needed

**Questionnaire:**
- Fees: `fees.create_fee_group`, `fees.create_fee_type`, `fees.create_master_line`, `fees.assign_fee_group`, `fees.create_fine_rule`, `fees.create_discount`.
- Staff leave: `leave.create_type`, `leave.create_allocation`.
- Settings and tasks: `chat.update_school_settings`, `readiness.update_task`.
- Roster: `imports.stage_batch`. Today's `students.create` writes ImportBatch directly and bypasses CSV and duplicate matching.

**Requests:** `leave.review` and `admissions.decide_application` (C-class prepare-decision adapters), and `fees.send_due_reminder` (C).

All of these are `inline-prisma` or `direct` per Appendix A. The inline ones need the route logic pulled into an `(AuthUser, body)` service first.

**Non-adapter content needed:** board/country presets for grades and subjects, and country leave defaults.

---

## Role-specific guardrails

- **Seats decide reach, re-checked every step** (`access.ts:84-89`, `seats.ts`). If a principal or accountant accepts an invitation mid-job, the academic or finance steps not yet run move to that person's queue. They never fail silently and are never run by the admin.
- **Standalone vs group ADMIN.** Institution-authority items (chat settings, leader invites, permissions, billing) apply only when `isStandaloneOwner`. A group-campus ADMIN without `canManageMemberships` gets no staff step.
- **Rule 5, enforced in code.** No chat phrase, questionnaire answer or "yes" does any of the following: publishes a timetable or results, sends report cards or announcements, posts or moves money (invoices, payments, payroll), decides leave or admissions, or grants guardian or staff access. These are class C: the AI prepares the draft and preview, does not self-approve, and deep-links to the domain approval surface. On a sole-admin campus the admin approves there, not in chat. A school with `separationOfDuties: REQUIRED` gets a named second approver (`repository.ts:366-369`).
- **Rule 8.**
  - Students only from structured confirmed rows or a reviewed staged roster (importBatch review token, `inviteAccounts:false`). Never from prose or OCR.
  - Guardian relationships stay INVITED/unverified.
  - Staff invitations stay pending until sent and accepted.
  - Setup STAFF never invites PRINCIPAL or CAMPUS_ADMIN.
- **Rule 19.** ADMIN gets no APP_OWNER or SUPER_ADMIN reach: no campus creation, no plan-limit or subscription change from AI. The teacher-seat cap is shown and enforced (`SETUP_TEACHER_LIMIT`).
- **Year integrity.** Always reuse the wizard's ACTIVE cycle (`existingCycleId`). Never create a second cycle. Never transition the year from chat while a principal holds the seat.
- **Honest receipts.** "Invitations ready, not sent", "roster staged, not committed" and "tasks created" are never shown as "done". Hand-offs are listed with owners.
- **PII.** Staff and student rows are never sent to the model. Structured answers bypass the model entirely. Any free-text fallback is pseudonymised first, and class/subject names are not masked as `[PERSON_n]` (engine defect to fix).
- **Credits.** Estimated and reserved before Build. Running out pauses the job with a resume option instead of failing it. Deterministic steps cost nothing.
- **Exam Studio.** It owns syllabus → paper → seal. ADMIN deep-links there only while it is the academic lead.


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `startingPoint` | How are you starting? | choice | imports.stage_batch | none | yes | old ONBOARDING record path (src/lib/school-ai/schemas.ts:23-34) |
| `academicLeads` | Who leads academics and finance here? | choice | staff.invite | C | yes | getCampusSeats (src/lib/auth/seats.ts:12-27); campus principalName (src/lib/onboarding/setup-state.ts:50); pending staffInvitation rows |
| `gradeLadder` | Which grades do you run, and how many sections each? | stepper | academic.class.create | B | yes | existing classes (src/lib/automation/catalog.ts:51); campus board (setup-state.ts:53); expectedEnrollment (src/lib/onboarding/setup-service.ts:177) |
| `teachingMode` | Class teacher for everything, or subject teachers? | choice | academic.class.create | B | yes | default by grade band (SINGLE up to Grade 2, SUBJECT above) |
| `subjectsByGrade` | Which subjects does each grade study? | tags | academic.subject.create | B | yes | board/country subject preset (new content) + existing subjects (src/lib/school-ai/access.ts:215-223) |
| `dayShape` | What does a school day look like? | schedule-grid | academic.period.create | B | yes | wizard weekends (setup-service.ts:425); existing periodDefinition rows (catalog.ts:54) |
| `rooms` | How many rooms do you have? | stepper | academic.room.create | B | no | one classroom per section from gradeLadder; existing classRoom rows (catalog.ts:53) |
| `staffRoster` | Who's on your team? | table (structured rows, CSV paste; text-last-resort) | staff.invite | B | no | pending staffInvitation rows; plan teacher cap (src/lib/school-ai/school-setup-service.ts:99-103) |
| `feePlan` | What does each grade pay? | stepper (money grid per grade band + one-time fee chips + due day + late fine + sibling discount) | fees.create_fee_group, fees.create_fee_type, fees.create_master_line, fees.assign_fee_group, fees.create_fine_rule, fees.create_discount | B | no | currency from LocalePolicy (src/lib/auth/register.ts:164-171); shown only when financeDesk = admin (src/lib/navigation/capabilities.ts:167) |
| `studentsRoster` | Add your students now? | choice (upload spreadsheet -> staged review table) | imports.stage_batch, students.create | B | no | none (spreadsheet only; document/voice intake deferred to SKO-460) |
| `leavePolicy` | How many leave days do staff get each year? | stepper | leave.create_type, leave.create_allocation | B | no | country leave defaults (new content) |
| `campusServices` | Which services do you run? | multi | readiness.update_task | A | no | package flags (src/lib/navigation/capabilities.ts:183 pkgCanteen) |
| `familyMessaging` | How should families reach the school? | multi (+ quiet-hours range) | chat.update_school_settings | B | no | current chat settings; plan WhatsApp entitlement; shown only when isStandaloneOwner (src/lib/auth/institution.ts:33) |

**Auto-provisioned:**
- academic.class.create (sections + teachingMode in the wizard's ACTIVE cycle via academics.setup_year with existingCycleId; existing kept)
- academic.subject.create (per section via setup.apply_changes SUBJECTS)
- academic.period.create (CLASS and EXAM periods via setup.apply_changes PERIODS)
- academic.room.create (via setup.apply_changes ROOMS)
- staff.invite (pending staffInvitation rows only, not sent, via setup.apply_changes STAFF)
- imports.stage_batch -> students.create (only after the admin reviews the staged roster; inviteAccounts:false)
- fees.create_fee_group, fees.create_fee_type, fees.create_master_line, fees.assign_fee_group (only when admin holds the finance desk)
- fees.create_fine_rule, fees.create_discount (only when admin holds the finance desk)
- leave.create_type, leave.create_allocation
- chat.update_school_settings (standalone owner only)
- readiness.update_task (one owned task per chosen campus service and per hand-off)

**Remains as tasks:**
- Send staff invitations - ADMIN in Staff & invites (class C access grant)
- Invite principal/accountant - ADMIN as institution authority in People & access (setup STAFF cannot invite leaders)
- Class-teacher and subject-teacher allocation - academic lead (principal, or admin while seat vacant) after invitations are accepted
- Draft and publish timetables - academic lead; publish is class C
- Fee structure when an accountant seat exists - ACCOUNTANT's own questionnaire
- First invoices (fees.generate_invoices) - finance desk in Fees (class C)
- Bank accounts and payment methods - finance desk in Accounts (sensitive data kept out of prompts)
- Guardian links and access - ADMIN in Guardians & access (class C)
- Guardian channel consent - parents or admin with verified evidence (communications.set_guardian_channel_preference)
- Grading rules / assessment model - academic lead in Curriculum & grading or Exam Studio
- Attendance counting rule - academic lead/admin (publish)
- Canteen/hostel package with named operators (campus_packages.setup) - ADMIN (class C)
- Transport routes/vehicles and inventory stores - ADMIN from the service task
- Correct academic year label or dates - ADMIN in School settings (no route edits cycle dates)
- Readiness sign-off (readiness.approve) - ADMIN

**Adapters needed:** `fees.create_fee_group`, `fees.create_fee_type`, `fees.create_master_line`, `fees.assign_fee_group`, `fees.create_fine_rule`, `fees.create_discount`, `leave.create_type`, `leave.create_allocation`, `chat.update_school_settings`, `readiness.update_task`, `imports.stage_batch`, `leave.review`, `admissions.decide_application`, `fees.send_due_reminder`


---

# CAMPUS_ADMIN

# CAMPUS_ADMIN: first-login questionnaire and top free-form requests

Role purpose (`src/lib/automation/catalog.ts:19`): *"Campus administrator: classes, students, staff and campus operations within current authority."* Interview text today (`src/lib/automation/role-setup.ts`): *"Ask academic year, class names and sections, staff, students, subjects and timetable requirements for this campus. Create records in dependency order using only supplied facts."*

What the role can do (from B.roles and B.typedOps):
- **Console:** `/admin` (role-nav.ts l.132-205). Today, AI Workflows, Exam Studio (only as academic lead), Students (list, admissions, guardians, family communication, learning actions, year end), Attendance, Staff (teachers, staff & invites, leave approvals, structure, performance), Academics (hub, classes & subjects, timetable, exams, report cards, academic year, access plans, secure delivery), Money (fees, payroll approvals, corrections), Messages, Campus services (front desk, pickup, transport, hostel, canteen, inventory, library, activities, service desk, care), and Campus setup (`campusOps`). The "Your school" group appears only for a standalone owner, so a CAMPUS_ADMIN never sees it. In a STANDALONE school the role is `standaloneDeputy`.
- **Module matrix:** VAED (view, add, edit, delete) on all 17 modules by default (permissions.ts:39-57). A school can lower this per row in `role_permissions`.
- **Typed ops:** `school.execute` always gives `OPERATOR_TOOLS` (setup.apply_changes, academics.setup_year, attendance.record_register, operations.record_risk_decision, communications.queue_announcement, students.promote_enrollment). It adds `FINANCE_TOOLS` only while the campus has no active ACCOUNTANT, and `ACADEMIC_TOOLS` only while it has no active PRINCIPAL (access.ts:56-89; seats.ts:12-27). Role tools: `students.create`, `library.create_books`, `front_desk.log_call`, `work.save`, `profile.update`, `personal.save_plan`.
- **Appendix A:** about 520 operator rows list CAMPUS_ADMIN in rolesAllowed. Some carry extra predicates:
  - `staff.invite` needs `canManageMemberships`.
  - `academic.class.assign_teacher`, `timetable.publish` and `academic.grading_rules.set` need the academic-lead seat.
  - `leave.review` covers teachers only while no principal is in post.
  - Read lookups used for name→id resolution: C1 (37), C2 (22), C3 (33), C5 (28), C6 (44).

---

## Known before asking

None of these are asked again. Each one prefills a question or is shown read-only on a "Your campus at a glance" card.

| Fact | Source (file path) | Notes |
|---|---|---|
| Name, email, phone, preferred language | invitation acceptance → `User` row; `src/lib/staff/invitation-schema.ts:20-41`, `src/lib/staff/invitation-write.ts` | Language drives the EN/AR/UR + `dir` of the questionnaire itself. |
| Role, pinned `campusId`, `designation`/`designationId`, `canManageMemberships` | `invitation-schema.ts:20-41` | Decides whether staff invites are offered or become a task for the institution authority. |
| School name, timezone, registrationKind (GROUP / STANDALONE) | `src/lib/onboarding/setup-service.ts:369-384`; `src/lib/auth/institution.ts:7-22` | Never asked. The old `schoolName`, `timezone` and `campuses` keys are dropped for this role. |
| Country, currency (LocalePolicy), campus `localeDelegatedFields` | `src/lib/auth/register.ts:164-171`; `prisma/schema.prisma` Campus.localeDelegatedFields | Currency prefills the fee amounts. The `country` key is dropped. |
| Campus name, city, address, phone, email, website, principalName, regId, **board** | `setup-service.ts:396-413`; `prisma/schema.prisma:546-586` | `board` (e.g. FBISE) seeds the subject template. `principalName` is text only, not a seat. |
| Academic cycle (label, year, start/end, status) | `setup-service.ts:419-423`; `GET /api/academic-cycle?campusId=` | Wizard campuses already have an **ACTIVE** cycle. Campuses made by `campus.create` have **none** (Appendix A C1 verifier note). |
| Weekend days | `setup-service.ts:425`; `GET /api/academic/calendar?campusId=` | Prefill only. |
| Seats held on campus (PRINCIPAL? ACCOUNTANT?) | `getCampusSeats` `src/lib/auth/seats.ts:12-27` | Shows or hides the academic and fee questions. Re-read at every build step. |
| Live counts (classes, cycles, teachers, students, subjects, rooms, periods, timetables, fees) | `getSetupJourney` `src/lib/school-ai/setup-journey-service.ts:10-41` | An answer that is already satisfied shows as "Already set up: keep". |
| Existing classes, active teachers, rooms, periods | `automaticCatalog` context `src/lib/automation/catalog.ts:47-55` | The class-teacher question appears only when ≥1 **active** TEACHER exists. |
| Effective permission snapshot | `loadWorkspacePermissionSnapshot` (`src/lib/school-ai/access.ts:105-111`) | A question whose capability is not granted is hidden and turned into a task. |
| Teacher plan capacity, AI credits | `school-setup-service.ts:99-103` (`SETUP_TEACHER_LIMIT`); `ensureAICreditsAvailable` (`src/lib/ai/openai.ts`) | Shown as a limit on the staff table, plus a credit estimate before Build. |
| Group-locked policy values | `GET /api/group-policy?view=campus&campusId=` | Locked values (grading, locale) show with a lock icon and are never asked. |
| Any earlier ONBOARDING answers for this campus | `src/lib/school-ai/onboarding.ts`, ONBOARDING record via `/api/school-ai/workspace?kind=ONBOARDING` | Lets a campus admin resume or inherit what an ADMIN started. |

---

## Questions

**Design concept: "Campus Blueprint".** Questions sit on the left. On the right is a live blueprint of the campus that fills in as the user answers: a grade × section grid, a bell-schedule ribbon, rows of room tiles, a staff roster. Under each answer is a plain "will create" chip, e.g. "Will create 18 classes · 9 already exist (kept)".

All answers are typed structures, not prose. That lets most proposals be built **deterministically, with no model call**. This saves credits, keeps PII out of prompts, and makes the evidence exact. The model is used only to fill gaps.

Questions whose seat or permission is missing are hidden and appear as tasks instead.

| # | key | Prompt (EN) | Input | Drives | Class | Req. | Prefill |
|---|---|---|---|---|---|---|---|
| 1 | `sessionConfirm` | "Is this your current school year?" | choice: Yes / Change dates (date pair) / No year yet (create) | `academic.cycle.create` (via `academics.setup_year`) | B | yes | ACTIVE cycle from `setup-service.ts:419-423` / `GET /api/academic-cycle` |
| 2 | `workingWeek` | "Which days is the campus closed each week?" | multi (Mon–Sun chips) | `academic.calendar.set_weekends` (setup WEEKENDS) | B | yes | Weekend rows (`setup-service.ts:425`) |
| 3 | `classLadder` | "Which classes run here, and how many sections each?" | stepper grid: grade ladder preset by board (PG…10, O/A-Level) × section count; toggle "one teacher per class" (SINGLE) / "subject teachers" (SUBJECT) per band | `academic.class.create` (via `academics.setup_year`) | B | yes | existing classes (`catalog.ts:51`), campus `board` |
| 4 | `subjectMatrix` | "Which subjects does each grade band study?" | multi chips per grade band + total-marks stepper (default 100) | `academic.subject.create` (setup SUBJECTS) | B | yes | board template + existing subjects |
| 5 | `bellSchedule` | "What does a normal school day look like?" | schedule-grid: start time, period length, periods per day, break after period N, optional short-day (Friday) | `academic.period.create` (setup PERIODS, CLASS type) | B | yes | existing `periodDefinition` rows |
| 6 | `rooms` | "How many teaching rooms, and how are they named?" | stepper + naming pattern (e.g. R-101…) + optional layout rows × benches × seats; special rooms (lab, hall) as tags | `academic.room.create` (setup ROOMS) | B | no | existing `classRoom` rows |
| 7 | `holidays` | "Any holidays already fixed this year?" | date list (name + from/to); quick-add from the school's own calendar | `academic.calendar.add_holiday` (setup HOLIDAYS) | B | no | `GET /api/academic/calendar/unified` |
| 8 | `staffInvites` | "Who should get a staff login?" | table rows: full name, email, phone, role (Teacher / Accountant / Librarian / Receptionist) | `staff.invite` (setup STAFF → pending invitation; delivery is a separate send) | C | no | active staff (`GET /api/staff?campusId=`) shown as "already here" |
| 9 | `classTeachers` | "Who is the class teacher for each section?" | choice per section from **active** teachers only | `academic.class.assign_teacher`, `academic.subject.assign_teacher` (setup TEACHER_ALLOCATIONS) | B | no | active TEACHER users (`catalog.ts:52`); hidden when there are none |
| 10 | `studentIntake` | "How will your students come in?" | choice: Not yet / Upload roster file (existing RosterImport → staged batch → review) / Type a few rows (structured table) | `imports.stage_batch`, `students.create` (reviewed batch token only) | B | no | `getSetupJourney` student count |
| 11 | `staffStructure` | "Which staff structure fits this campus?" | choice of hierarchy preset (e.g. Small school, K-12 with coordinators, College) | `staff.apply_hierarchy_preset` | B | no | existing designations (`GET /api/staff/designations`) |
| 12 | `leavePolicy` | "How many leave days does staff get each year?" | stepper table: leave type (Casual, Sick, Annual…) × days, per role | `leave.create_type`, `leave.create_allocation` | B | no | existing leave types (`GET /api/leave/types`) |
| 13 | `feeHeads` | "What are your fee heads and monthly amounts?" (only when no accountant is on campus) | tags (Tuition, Admission, Exam, Transport…) + amount stepper per grade band, currency locked to LocalePolicy | `fees.create_fee_type`, `fees.create_fee_group`, `fees.create_master_line`, `fees.assign_fee_group` | B | no | LocalePolicy currency; existing fee groups (`GET /api/fees/groups`, after `assertFeesRead`) |
| 14 | `campusServices` | "Which services does this campus run?" | multi: Transport, Hostel, Canteen, Library desk, Front desk, Pickup | `readiness.update_task` (creates owner-assigned setup tasks) | A | no | enabled campus packages (`GET /api/campus-packages?view=states`) |

**Dropped for this role** (already known, or no adapter): `path`, `schoolName`, `country`, `timezone`, `campuses`, `academicYear`/`startDate`/`endDate` as free text (replaced by #1), `firstOutcome` (the blueprint orders the work itself), and `assessmentPolicy`, `communications`, `migrationSource` (moved to tasks).

**Dependency gates the UI must show, not fail on:**
- #4, #7 and #9 need an **ACTIVE** cycle (`school-setup-academics.ts:28,54`). If #1 creates a DRAFT cycle, those questions show "Waits for year activation".
- #9 needs active teachers. Pending invites from #8 do not count.

---

## Build outcome

The questionnaire ends on a **Build plan** screen with three lanes. Progress and receipts use the SKO-470 run lifecycle; nothing is forked.

1. **Building now (Class B).** One confirm for the whole lane. That confirm binds a *manifest*: questionnaire `{id, version}` plus one `previewHash` and idempotency key per step. If any preview changes at execution time, only that step drops back to `WAITING_CONFIRM`. The worker never advances a job in `WAITING_CONFIRM`.
2. **Needs your approval in place (Class C).** A deep link to the domain surface, with the draft and preview already saved. The step ends as `awaiting_approval`, never as "done".
3. **Waiting on others.** Each item shows the owner's role or avatar.

Fix the copy as well. Replace "nothing applies until you approve" with **"You'll review every change before it is built."**

### autoProvisioned (records created from confirmed answers)
- `academic.cycle.create`: a DRAFT cycle, only when the campus has none (#1), via `academics.setup_year`.
- `academic.calendar.set_weekends`: only if #2 differs from the stored rows.
- `academic.class.create`: classes and sections from #3. Matching classes are KEPT.
- `academic.subject.create`: from #4, once the cycle is ACTIVE.
- `academic.period.create`: CLASS periods from #5.
- `academic.room.create`: from #6.
- `academic.calendar.add_holiday`: from #7. The REST route is not idempotent, so the adapter must de-duplicate by (campus, name, from, to).
- `academic.class.assign_teacher` / `academic.subject.assign_teacher`: from #9. Class-teacher allocation runs only when this admin holds the academic-lead seat (`canLeadAcademics`).
- `imports.stage_batch` → `students.create`: only from a reviewed roster batch or structured rows (#10). `inviteAccounts:false`.
- `staff.apply_hierarchy_preset`: from #11.
- `leave.create_type`, `leave.create_allocation`: from #12.
- `fees.create_fee_type`, `fees.create_fee_group`, `fees.create_master_line`, `fees.assign_fee_group`: from #13, only when no accountant seat.
- `readiness.update_task`: one setup task per service in #14, plus one per remaining task below.

### remainsAsTasks (who does what next)
- **Activate the academic year** (`academic.cycle.transition`, Class C). Done by the PRINCIPAL, or by this admin in Academic year when the principal seat is empty. Subjects, holidays and allocations resume after it.
- **Send staff invitations** (`staff.invite` delivery / `staff.resend_invitation`, Class C). Done by this admin in Staff & invites. Without `canManageMemberships`, it goes to the institution authority (SUPER_ADMIN or standalone ADMIN).
- **Appoint a Principal or another Campus Admin.** Only the institution authority can do this (`invitation-write.ts:120`; setup STAFF cannot invite these roles).
- **Assign class and subject teachers for invited staff,** once they accept. The class teacher is the PRINCIPAL's call when that seat is held.
- **Link guardians and send invitations** (setup GUARDIANS / `guardians.change_access`, Class C). This admin reviews; guardians accept.
- **Family channel consent** (`communications.set_guardian_channel_preference`). Guardians, or the office with real consent evidence. AI never asserts consent.
- **Timetable drafts and publish** (`timetable.create_school_drafts` B, `timetable.publish_reviewed` C). Done by the PRINCIPAL, or this admin when vacant, after teachers, periods and rooms exist.
- **Fee setup and invoices** (`fees.generate_invoices` C). The ACCOUNTANT does this when one is in post; otherwise this admin, in Fees.
- **Grading rules and attendance counting rule** (`academic.grading_rules.set`, `attendance.publish_counting_rule`, Class C). The academic lead does these.
- **Exam session / datesheet.** The PRINCIPAL, via Exam Studio (deep link; no duplicate flow).
- **Payroll policy** (`payroll.save_policy`). The ACCOUNTANT prepares it; this admin approves the runs.
- **Library loan rules** (`library.desk_save_rules`). The LIBRARIAN.
- **Campus packages** (`campus_packages.setup`, Class C because naming operators grants authority) **and transport routes and vehicles.** This admin does these from the #14 tasks.

---

## Top requests

| # | Request (as typed) | Capability key(s) | Class | Adapter today |
|---|---|---|---|---|
| 1 | "Add section C to Grade 6 and make Ms. Ayesha the class teacher" | `academic.class.create`; `academic.class.assign_teacher` | B | **partial**: `academics.setup_year` + setup TEACHER_ALLOCATIONS. The allocation needs the `canLeadAcademics` seat fix. |
| 2 | "Invite Bilal as a maths teacher — bilal@school.pk, 0300 1234567" | `staff.invite` | C | **partial**: setup STAFF writes a pending row. Delivery is not covered, so an adapter is needed. |
| 3 | "Approve Sana's leave for Thursday and Friday" | `leave.review` | C | **none**: adapter needed. It must refuse the admin's own request (no self-approval guard today). |
| 4 | "Close the campus on 5 February for Kashmir Day" | `academic.calendar.add_holiday` | B | **partial**: setup HOLIDAYS. Needs an ACTIVE cycle and de-duplication. |
| 5 | "Grade 3 Blue today: everyone present except Ali Raza and Hamza, absent" | `attendance.save_register` (via `attendance.record_register`) | C | **partial**: PRESENT/ABSENT/LEAVE only, no LATE. A per-student evidence quote is required; "all present" alone gets an ask. |
| 6 | "Remind Grade 9 parents that the PTM is Saturday at 10am" | `communications.queue_announcement` | C | **partial**: queued, not sent. Audience preview shows consent and contact skips. |
| 7 | "کلاس 5 کے تمام بچوں کے نومبر کی فیس کے واؤچر بنا دیں" (make November fee vouchers for all of Class 5) | `fees.generate_invoices` | C | **partial**: only while no accountant seat. Otherwise the answer routes to the ACCOUNTANT. Capped at 50 students per run. |
| 8 | "أضف طالبًا جديدًا اسمه يوسف أحمد إلى الصف الرابع أ" (add new student Yusuf Ahmad to Grade 4A) | `students.create` | B | **partial**: the AI asks for roll no., gender, guardian phone and address. It never invites accounts. |
| 9 | "Mr. Khan is absent today — mark him and find cover for his periods" | `teacher_attendance.record_register`; `staff.propose_cover` (→ `timetable.assign_substitutes` only when no principal) | B / A (proposal) / C (assign) | **none / partial**: adapters needed for teacher attendance and cover proposal. `assign_substitutes` exists in ACADEMIC_TOOLS. |
| 10 | "Approve the November payroll run" | `payroll.approve_run` | C | **none**: adapter needed. It must keep the `requireSeparation` rule (preparer ≠ approver). |

Exam requests ("set mid-term papers", "seal the paper") deep-link to `/ai/studio` and end as `answered`.

---

## Adapters needed

**From the questionnaire:** `staff.apply_hierarchy_preset`, `leave.create_type`, `leave.create_allocation`, `fees.create_fee_type`, `fees.create_fee_group`, `fees.create_master_line`, `fees.assign_fee_group`, `readiness.update_task`, `imports.stage_batch` (proper CSV staging; automation's direct ImportBatch upsert bypasses per-row matching), `staff.invite` (delivery).

**From top requests:** `leave.review`, `teacher_attendance.record_register`, `staff.propose_cover`, `payroll.approve_run`.

**Fixes to existing adapters (not new keys):**
- TEACHER_ALLOCATIONS (CLASS) must apply `canLeadAcademics`, as the REST route does.
- HOLIDAYS CREATE must be de-duplicated.
- `attendance.record_register` should accept LATE/EXCUSED to match `attendance.save_register`.

---

## Role-specific guardrails

- **Rule 5 (class C by construction).** No questionnaire answer or chat phrase alone does any of the following:
  - publishes a timetable or attendance rule;
  - posts invoices or payments;
  - approves payroll or leave;
  - sends a family message;
  - delivers a staff invitation;
  - links a guardian.

  Each of these saves a draft and preview and ends as `awaiting_approval` on the domain surface. A bare "yes" (typed or spoken) without the `pendingKey + previewHash + job.version` binding does nothing. A school with `separationOfDuties: REQUIRED` is never self-approved from chat.
- **Rule 8 (people and access).**
  - Students come only from a reviewed roster batch (`importBatch` review token) or structured rows, never from prose. `inviteAccounts:false`.
  - Staff invitations stay pending until delivered and accepted, and are reported as remaining work.
  - Guardian links stay INVITED / unverified.
  - The AI never asserts channel consent.
  - Staff and student rows from the questionnaire map to proposals deterministically and **never enter a prompt**. Free text is pseudonymised before every model call, and class and subject names must not be masked as `[PERSON_n]`.
- **Rule 19 and the seat ceilings.**
  - CAMPUS_ADMIN holds finance tools only while no ACCOUNTANT is active, and academic tools only while no PRINCIPAL is active. Seats are re-read on every step, so a principal appointed mid-build moves activation, timetable and class-teacher steps to the principal's queue instead of failing.
  - The role cannot invite a PRINCIPAL or CAMPUS_ADMIN, cannot create campuses, and cannot edit school identity or the group ladder beyond the designation preset.
  - Every write stays pinned to `user.campusId` and re-checks role, campus, permission and accessVersion.
- **ROLE_PURPOSE ("within current authority").** Hidden questions and blocked requests name the authority that owns them: Principal, Accountant, Institution authority, Exam Studio. The role is never widened to cover them.
- **Credits and honest outcomes.**
  - Show a credit estimate before Build. Deterministic steps charge per AI action only where the model is used.
  - On credit exhaustion, pause with resume instead of FAILED.
  - Reads and drafts are never shown as "done".


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `sessionConfirm` | Is this your current school year? | choice | academic.cycle.create | B | yes | ACTIVE academicCycle from src/lib/onboarding/setup-service.ts:419-423 via GET /api/academic-cycle?campusId= |
| `workingWeek` | Which days is the campus closed each week? | multi | academic.calendar.set_weekends | B | yes | Weekend rows (setup-service.ts:425; GET /api/academic/calendar?campusId=) |
| `classLadder` | Which classes run here, and how many sections each? | stepper | academic.class.create | B | yes | existing classes (src/lib/automation/catalog.ts:51) + Campus.board grade preset |
| `subjectMatrix` | Which subjects does each grade band study? | multi | academic.subject.create | B | yes | Campus.board subject template + existing subjects (GET /api/subjects?campusId=) |
| `bellSchedule` | What does a normal school day look like? | schedule-grid | academic.period.create | B | yes | existing periodDefinition rows (catalog.ts:54; GET /api/academic/periods?campusId=&timeType=CLASS) |
| `rooms` | How many teaching rooms, and how are they named? | stepper | academic.room.create | B | no | existing classRoom rows (catalog.ts:53; GET /api/academic/rooms?campusId=) |
| `holidays` | Any holidays already fixed this year? | date | academic.calendar.add_holiday | B | no | GET /api/academic/calendar/unified?campusId=&year= |
| `staffInvites` | Who should get a staff login? | table | staff.invite | C | no | active staff (GET /api/staff?campusId=) shown as already here; plan teacher limit (school-setup-service.ts:99-103) |
| `classTeachers` | Who is the class teacher for each section? | choice | academic.class.assign_teacher, academic.subject.assign_teacher | B | no | active TEACHER users (catalog.ts:52); hidden when none |
| `studentIntake` | How will your students come in? | choice | imports.stage_batch, students.create | B | no | student count from getSetupJourney (src/lib/school-ai/setup-journey-service.ts:10-41) |
| `staffStructure` | Which staff structure fits this campus? | choice | staff.apply_hierarchy_preset | B | no | existing designations (GET /api/staff/designations) |
| `leavePolicy` | How many leave days does staff get each year? | stepper | leave.create_type, leave.create_allocation | B | no | existing leave types (GET /api/leave/types?campusId=) |
| `feeHeads` | What are your fee heads and monthly amounts? | tags | fees.create_fee_type, fees.create_fee_group, fees.create_master_line, fees.assign_fee_group | B | no | LocalePolicy currency (src/lib/auth/register.ts:164-171); existing fee groups (GET /api/fees/groups after assertFeesRead); shown only when getCampusSeats has no ACCOUNTANT |
| `campusServices` | Which services does this campus run? | multi | readiness.update_task | A | no | GET /api/campus-packages?view=states |

**Auto-provisioned:**
- academic.cycle.create (DRAFT, only when campus has no cycle; via academics.setup_year)
- academic.calendar.set_weekends (only if changed; setup WEEKENDS)
- academic.class.create (via academics.setup_year; existing kept)
- academic.subject.create (setup SUBJECTS; after ACTIVE cycle)
- academic.period.create (setup PERIODS, CLASS)
- academic.room.create (setup ROOMS)
- academic.calendar.add_holiday (setup HOLIDAYS; de-duplicated; after ACTIVE cycle)
- academic.class.assign_teacher / academic.subject.assign_teacher (setup TEACHER_ALLOCATIONS; active teachers only; class teacher only with academic-lead seat)
- imports.stage_batch -> students.create (reviewed roster batch or structured rows only; inviteAccounts:false)
- staff.apply_hierarchy_preset
- leave.create_type
- leave.create_allocation
- fees.create_fee_type / fees.create_fee_group / fees.create_master_line / fees.assign_fee_group (only when no ACCOUNTANT seat)
- readiness.update_task (one setup task per selected service and per remaining task)

**Remains as tasks:**
- Activate the academic year (academic.cycle.transition, class C) - PRINCIPAL, or this campus admin in Academic year when no principal seat
- Send staff invitations (staff.invite delivery / staff.resend_invitation, class C) - campus admin in Staff & invites; institution authority if canManageMemberships is false
- Appoint Principal or another Campus Admin - institution authority (SUPER_ADMIN or standalone ADMIN)
- Assign class/subject teachers for invited staff after they accept - campus admin; class teacher by PRINCIPAL when seat held
- Link guardians and send guardian invitations (setup GUARDIANS / guardians.change_access, class C) - campus admin review, guardians accept
- Family channel consent (communications.set_guardian_channel_preference) - guardians or office with real consent evidence
- Timetable drafts and publication (timetable.create_school_drafts B, timetable.publish_reviewed C) - PRINCIPAL, or campus admin when vacant
- Fee setup and invoice generation (fees.generate_invoices, class C) - ACCOUNTANT when in post, else campus admin in Fees
- Grading rules and attendance counting rule (academic.grading_rules.set, attendance.publish_counting_rule, class C) - academic lead
- Exam session and datesheet - PRINCIPAL via Exam Studio deep link
- Payroll policy (payroll.save_policy) - ACCOUNTANT prepares, campus admin approves runs
- Library loan rules (library.desk_save_rules) - LIBRARIAN
- Campus packages operators (campus_packages.setup, class C) and transport routes/vehicles (transport.route_create, transport.vehicle_create) - campus admin from service setup tasks

**Adapters needed:** `staff.apply_hierarchy_preset`, `leave.create_type`, `leave.create_allocation`, `fees.create_fee_type`, `fees.create_fee_group`, `fees.create_master_line`, `fees.assign_fee_group`, `readiness.update_task`, `imports.stage_batch`, `staff.invite`, `leave.review`, `teacher_attendance.record_register`, `staff.propose_cover`, `payroll.approve_run`


---

# PRINCIPAL

# PRINCIPAL — first-login questionnaire and top free-form requests

Role purpose (`src/lib/automation/catalog.ts:20`): "Academic lead: curriculum, timetable, assessment and academic approvals. No campus admissions or group governance."
Seat allow-list (`src/lib/school-ai/access.ts:62,71`): 7 ACADEMIC_TOOLS (`timetable.create_draft`, `timetable.create_school_drafts`, `timetable.publish_reviewed`, `timetable.assign_substitutes`, `exams.create_session_plan`, `academics.transition_year`, `curriculum.import_topics`) + `operations.record_risk_decision` + `communications.queue_announcement`. The announcement tool is filtered out by default because PRINCIPAL `students.canEdit=false` (`src/lib/permissions.ts:200-218`, `execution.ts:126`). No `setup.apply_changes`, fees, finance, student attendance or promotion.
Default matrix: timetable/exams/reports VAED, leave VAE., students/attendance/staff V..., ai VAE., everything else none (B.roles §a).
Appendix A: 241 write rows list PRINCIPAL. About 15 are reachable through AI today, all through the 9 typed operations.
Navigation checklist (`src/lib/navigation/role-nav.ts:208-259`): Today, AI Workflows, Exam Studio, Report cards, Exams & results, Mark corrections, Timetable & cover, Classes & subjects, Curriculum & grading, School calendar, Teacher profiles, Teacher performance, Leave approvals, Students, Attendance, Learning actions, Promotion approval, Academic year, Messages, Report delivery, Access plans, Secure exam delivery, Objective map, Learning resources, Improvement evidence, Care & safeguarding, My leave.

Routing today: a principal on `/ai?setup=1` gets `<AutomaticWorkspace roleSetup autoStart>` (`src/components/school-ai/school-ai-workspace.tsx:380`). It runs the free-text interview `ROLE_SETUP_INTERVIEW.PRINCIPAL` (`src/lib/automation/role-setup.ts`). `requiredOnboardingPath` sends only SUPER_ADMIN/ADMIN to onboarding (`src/lib/onboarding/launch-plan.ts:114-118`). This design replaces that interview with a structured questionnaire. A principal first-login gate is needed.

## Known before asking (never ask again; show as prefilled facts with an "edit elsewhere" link)

| Fact | Source |
|---|---|
| Full name, phone, qualification, specialization, subjectSpecialties, designation, joiningDate, reportsToId, primaryDepartmentId | `StaffInvitation.profile` captured at invite (`src/lib/staff/invitation-schema.ts:2-30`, model `prisma/schema.prisma:4955`) |
| Email, role PRINCIPAL, campusId | `StaffInvitation` / `User` (`src/lib/staff/invitation-write.ts:120`: one principal per campus) |
| Password set, MFA state | `src/app/(auth)/first-login/page.tsx:185` → `/api/auth/first-password` |
| Academic-lead seat held | `getCampusSeats` (`src/lib/auth/seats.ts:12-27`); `canLeadAcademics` (`src/lib/api/scope.ts:249-258`) |
| School name, timezone, campus name/board, `Campus.principalName` | wizard `completeSetup` (`src/lib/onboarding/setup-service.ts:369-413`; `prisma/schema.prisma:582`) |
| Academic cycle label, dates, status; weekends | `setup-service.ts:419-425` (ACTIVE from the wizard) or a DRAFT made by `academics.setup_year` |
| Currency / country | `LocalePolicy` (`src/lib/auth/register.ts:164-171`) |
| Classes + sections + teaching mode, subjects + totalMarks, class/subject teachers, teacher roster, rooms, CLASS/EXAM periods, holidays, timetables, exam sessions, grade models | live records. Counts from `getSetupJourney` (`src/lib/school-ai/setup-journey-service.ts:10-41`), catalogue from `automaticCatalog` (`catalog.ts:49`) |
| Permission snapshot and overrides | `loadWorkspacePermissionSnapshot` (`src/lib/school-ai/access.ts`) |
| Launch tasks already offered (Exam Studio, Classes) | `src/lib/onboarding/launch-plan.ts:56-72` |
| Group grading template (group schools) | academic-models route `:110-111` |
| Preferred language | `User.preferredLanguage`. Asked only when unset or still the default (Q13) |

The questionnaire never asks about name, contact, campus, school, year label/dates, weekends, timezone, class list, teacher list, rooms, periods, holidays, fees or students. All of those are either known already or sit outside the principal's seat.

## Questions (13; the pipeline shows only those whose prerequisites exist)

UX: "Your first academic week" in 4 short screens: **Year → People → Week → Assessment**. Each answer shows a live **build receipt** beside it (phone: a bottom sheet). The receipt names the exact records that will be made, each with an A/B/C chip. Class B answers collect into one **Review & build** sheet bound to `{questionnaireVersion, previewHash, idempotencyKey}`. Class C items become **Waiting for your approval** cards that deep-link to the domain screen. Grids are made of shared design-system primitives, mirror in RTL, and on phone turn into per-class cards with steppers.

| # | key | prompt (EN) | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|---|
| 1 | `firstPriority` | What should be ready first? | choice: timetable / exams / teacher allocation / everything | personal.save_plan (launch plan + order of the build) | A | yes | launch-plan.ts tasks |
| 2 | `yearStart` | Your year {label} runs {start}–{end}. Start it now? (shown only if DRAFT) | choice: start now / on {start} / not yet | academic.cycle.transition (typed `academics.transition_year activate`) | C | no | cycle |
| 3 | `classTeachers` | Who is the class teacher for each class? | grid class → teacher picker | academic.class.assign_teacher | B | yes | Class.classTeacherId |
| 4 | `missingSubjects` | These classes have no subjects. Add them? (conditional) | tags per class + marks stepper | academic.subject.create | B | no | sibling-section subjects |
| 5 | `subjectTeachers` | Who teaches each subject? | grid class×subject → TEACHER picker | academic.subject.assign_teacher | B | yes | Subject.teacherId, invite subjectSpecialties |
| 6 | `weeklyLessons` | Lessons per week for each subject | stepper grid | timetable.create (solver input to `timetable.create_school_drafts`) | B | yes | board defaults by grade |
| 7 | `dayShape` | Mark breaks, assembly and prayer | schedule-grid over existing CLASS periods × weekdays | timetable.create (slotType BREAK/ASSEMBLY/PRAYER) | B | yes | PeriodDefinition rows |
| 8 | `timetableScope` | Draft timetables for which term and classes? | choice term + multi classes / not now | timetable.create (typed `timetable.create_school_drafts`, ≤24 classes per run) | B | no | active term |
| 9 | `teacherWeeklyCap` | Most lessons a teacher should teach per week | stepper (+ per-teacher overrides) | staff.set_workload_capacity | B | no | none |
| 10 | `gradingScale` | Which grading scale and weights? | choice preset + weight steppers (sum 100) | academic.model.create_draft | B | yes | group template / board |
| 11 | `examWindows` | When are this year's term exams? | date ranges per term + type MID_TERM/FINAL | exams.session.create (or typed `exams.create_session_plan` when EXAM periods, exam-capacity rooms and totalMarks exist) | B | no | cycle dates |
| 12 | `improvementFramework` | Which inspection standards do you report against? | choice (national / board / school's own / none) | improvement.create_framework | B | no | country/board |
| 13 | `language` | Language for your workspace | choice EN/AR/UR (only if unset) | profile.update_own | A | no | User.preferredLanguage |

Order of the build: yearStart → missingSubjects → classTeachers/subjectTeachers → teacherWeeklyCap → timetable drafts → exam sessions → grading draft → framework. Subjects and allocations need an ACTIVE cycle (`school-setup-academics.ts:28,54`), so while Q2 waits on class C the dependent items show "after the year starts".

Not asked, because no adapter exists (these become tasks): who covers approvals when I am away, the cover-priority policy, report-card dates, syllabus documents, parent-meeting windows.

## Build outcome

**autoProvisioned** (Class A runs immediately. Class B runs after one bound confirm in Review & build. Every receipt comes from a real mutation.)
- `personal.save_plan`: principal launch plan with the priority order (A)
- `profile.update_own`: language (A)
- `academic.class.assign_teacher`: class teachers, re-checking the academic-lead seat (B)
- `academic.subject.create`: missing subjects with totalMarks (B)
- `academic.subject.assign_teacher`: subject teachers. Must be role TEACHER (`subject-write.ts:27`) (B)
- `staff.set_workload_capacity`: weekly load caps (B)
- `timetable.create`: DRAFT timetables via `timetable.create_school_drafts`, solver-seeded from Q6/Q7 (B)
- `exams.session.create` / `exams.create_session_plan`: session in PLANNING with optional datesheet/seating/duties (B)
- `academic.model.create_draft`: grading model, DRAFT version (B)
- `improvement.create_framework`: inspection framework (B)

**remainsAsTasks** (who acts)
- Start the academic year (`academic.cycle.transition` / `academics.transition_year`): you, on Academic year (class C)
- Publish reviewed timetables (`timetable.publish`; notifies teachers, students, guardians): you, on Timetable & cover (class C)
- Activate the grading model (`academic.model.activate`): you, on Curriculum & grading (class C; the adapter must add the missing GRADING lock check)
- Publish the exam datesheet (`exams.datesheet.publish`): you, once papers are placed (class C)
- Missing CLASS/EXAM periods, rooms with exam capacity, holidays: CAMPUS_ADMIN (`academic.period.create`, `academic.room.create`, `academic.calendar.add_holiday`; the principal has no seat for these)
- Missing teachers for unallocated subjects: CAMPUS_ADMIN invites through access management. Invitations stay pending.
- Syllabus/curriculum upload and papers: you, in Exam Studio `/ai/studio` (SKO-408). Document intake belongs to SKO-460.
- Approval delegation and the cover-priority policy: a reviewed POLICY record later (rules 7/18). Delegation goes through CAMPUS_ADMIN access management.
- Family announcement about the new timetable or exams (`communications.queue_announcement`): needs an ADMIN-granted `students.edit` override, then your approval (class C)
- Group grading template changes: SUPER_ADMIN

## Top requests (10)

| # | request | capability keys | class | adapter today |
|---|---|---|---|---|
| 1 | "Ms Ayesha is off tomorrow, arrange cover for all her lessons." | staff.propose_cover + typed `timetable.assign_substitutes` | B | exists (partial) |
| 2 | "Approve Mr Khan's leave for 3–5 November." | leave.review | C | needed (inline-prisma; blocked by assigned cover/invigilation) |
| 3 | "Draft the Term 2 timetable for all Grade 6–8 sections." | timetable.create (`create_school_drafts`) | B | exists (partial) |
| 4 | "Publish the reviewed Grade 6–8 timetables from Monday." | timetable.publish (`publish_reviewed`) | C | exists (partial) |
| 5 | "Plan mid-terms 10–20 December for all classes with seating and invigilators." | exams.session.create, exams.schedule.create, exams.session.auto_seat, exams.invigilation.assign (`exams.create_session_plan`) | B | partial; exams.invigilation.assign needed for edits |
| 6 | "Make Sana class teacher of 7B and give 9A Physics to Mr Imran." | academic.class.assign_teacher, academic.subject.assign_teacher | B | needed (the setup op is admin-only) |
| 7 | "Approve every Grade 9 report card with no blockers and mark the exam reviewed." | reports.approve_versions, exams.principal_review (publishing via exams.publish_results stays a deep link) | C | needed |
| 8 | Urdu: "کلاس 8 ریاضی کے نمبروں کی اصلاح کی درخواست دکھائیں اور منظور کر دیں" | corrections.decide_mark | C | needed |
| 9 | Arabic: "أنشئ خطة دعم للطلاب الذين حصلوا على أقل من 40% في رياضيات الصف التاسع" | learning_actions.save_draft (B), learning_actions.activate (C) | B→C | needed |
| 10 | "Remind Grade 10 parents that finals start on 5 January." | exams.datesheet.publish; typed `communications.queue_announcement` | C | queue exists but is filtered by the default matrix; datesheet.publish needed |

Reads that come with these requests ("which lessons are uncovered this week?") use `school.inspect` (class A). Recording a decision on one uses `operations.record_risk_decision` (class C).

## Adapters needed
New typed adapters for the questionnaire: academic.class.assign_teacher, academic.subject.create, academic.subject.assign_teacher, staff.set_workload_capacity, academic.model.create_draft, improvement.create_framework, exams.session.create (standalone, outside the session-plan op).
New for requests: exams.invigilation.assign, leave.review, reports.approve_versions, exams.principal_review, corrections.decide_mark, learning_actions.save_draft, learning_actions.activate, exams.datesheet.publish.
Class C adapters only prepare a preview and a deep link. They never execute.
Not new adapters, but needed: wire `suggestSchoolTimetable` as the input for `timetable.create_school_drafts`, and give the principal's matrix a students.edit override (or move the announcement gate) so `communications.queue_announcement` is reachable.

## Role-specific guardrails
- **Rule 5:** no chat phrase alone publishes timetables (`timetable.publish` notifies families), publishes or locks results (`exams.publish_results`, `reports.publish`, `reports.send_all`, `exams.lock`), sends family messages or starts or closes the year. All of these are class C deep links, and class C is static in the registry. "Publish results" always ends as `awaiting_approval`, never as "done".
- **Rule 8:** the principal never creates students, never invites staff and never links guardians. Unallocated subjects produce a named CAMPUS_ADMIN task, not invented teachers. Teacher names come only from the live roster picker, never from prose.
- **Rule 19 and ROLE_PURPOSE:** no admissions, fees, finance, rooms, periods, holidays, student attendance registers, promotion execution or group governance. The `canManageLibrary`/`canManageFrontDesk` predicates admit PRINCIPAL, but the matrix does not, so adapters must check the matrix and never offer library or front-desk work.
- **Seat recheck:** every write re-checks `canLeadAcademics`, campus, permission and accessVersion. When the principal becomes active, the admin loses ACADEMIC_TOOLS, so any in-flight admin setup job must re-authorize (rule 13).
- **Self-approval:** `learning_actions.activate`, `academic.model.activate` and `digests.approve` have no maker≠checker check. The AI never approves its own draft, and `separationOfDuties: REQUIRED` is honoured (`repository.ts:366-368`).
- **Exam Studio owns** syllabus, papers, moderation and the Seal. Q11 and request 5 create only sessions, datesheets, seating and duties.
- **Pseudonymise:** teacher and student names in leave, cover and learning actions are masked before every prompt. Class and subject names ("7B", "Physics") must not be over-masked as [PERSON_n]. Urdu/Arabic evidence quotes must match after normalisation.
- **Sensitive records:** accommodations are never written from chat (`sensitiveInstructionIssue`). `teacher_attendance.record_register` does not validate the userId and is not exposed.
- **Credits:** each AI action costs credits. Estimate and reserve credits for the build before it starts. Honest outcomes: drafts, reads and handoffs are never reported as executed.


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `firstPriority` | What should be ready first? | choice | personal.save_plan | A | yes | src/lib/onboarding/launch-plan.ts:56-72 launch tasks |
| `yearStart` | Your year {label} runs {start}–{end}. Start it now? | choice | academic.cycle.transition | C | no | AcademicCycle (setup-service.ts:419-423); shown only when status DRAFT |
| `classTeachers` | Who is the class teacher for each class? | schedule-grid | academic.class.assign_teacher | B | yes | Class.classTeacherId + active TEACHER roster |
| `missingSubjects` | These classes have no subjects yet. Add them? | tags | academic.subject.create | B | no | subjects of sibling sections of the same grade |
| `subjectTeachers` | Who teaches each subject? | schedule-grid | academic.subject.assign_teacher | B | yes | Subject.teacherId + StaffInvitation.profile.subjectSpecialties |
| `weeklyLessons` | Lessons per week for each subject | stepper | timetable.create | B | yes | board/grade defaults |
| `dayShape` | Mark breaks, assembly and prayer | schedule-grid | timetable.create | B | yes | PeriodDefinition CLASS rows + Weekend rows |
| `timetableScope` | Draft timetables for which term and classes? | multi | timetable.create | B | no | active cycle term + all ACTIVE classes |
| `teacherWeeklyCap` | Most lessons a teacher should teach per week | stepper | staff.set_workload_capacity | B | no | none |
| `gradingScale` | Which grading scale and weights? | choice | academic.model.create_draft | B | yes | group grading template (academic-models route:110-111) or Campus.board |
| `examWindows` | When are this year's term exams? | date | exams.session.create, exams.schedule.create, exams.session.auto_seat | B | no | AcademicCycle start/end dates |
| `improvementFramework` | Which inspection standards do you report against? | choice | improvement.create_framework | B | no | LocalePolicy country + Campus.board |
| `language` | Language for your workspace | choice | profile.update_own | A | no | User.preferredLanguage (asked only if unset/default) |

**Auto-provisioned:**
- personal.save_plan — principal launch plan and build order (A)
- profile.update_own — workspace language (A)
- academic.class.assign_teacher — class teacher per class, with the academic-lead seat re-checked (B)
- academic.subject.create — missing subjects with totalMarks (B)
- academic.subject.assign_teacher — subject teachers, role TEACHER only (B)
- staff.set_workload_capacity — weekly lesson caps (B)
- timetable.create — DRAFT timetables via typed timetable.create_school_drafts, solver-seeded from weeklyLessons/dayShape (B)
- exams.session.create — exam session in PLANNING, or typed exams.create_session_plan with datesheet/seating/duties when EXAM periods, rooms and totalMarks exist (B)
- academic.model.create_draft — grading model DRAFT version (B)
- improvement.create_framework — inspection framework (B)

**Remains as tasks:**
- academic.cycle.transition (typed academics.transition_year activate) — principal approves on Academic year screen (class C)
- timetable.publish (typed timetable.publish_reviewed) — principal on Timetable & cover; notifies teachers/students/guardians (class C)
- academic.model.activate — principal on Curriculum & grading; the adapter must add the GRADING lock check (class C)
- exams.datesheet.publish — principal after papers are placed (class C)
- academic.period.create / academic.room.create / academic.calendar.add_holiday — CAMPUS_ADMIN (outside the principal's seat)
- Missing teachers for unallocated subjects — CAMPUS_ADMIN invites via access management; invitations stay pending
- Syllabus upload and papers — principal in Exam Studio /ai/studio (SKO-408); document intake SKO-460
- Approval delegation / deputy and cover-priority policy — reviewed POLICY record later; delegation via CAMPUS_ADMIN access management
- communications.queue_announcement to families — ADMIN must grant a students.edit override, then principal approval (class C)
- Group grading template changes — SUPER_ADMIN

**Adapters needed:** `academic.class.assign_teacher`, `academic.subject.create`, `academic.subject.assign_teacher`, `staff.set_workload_capacity`, `academic.model.create_draft`, `improvement.create_framework`, `exams.session.create`, `exams.invigilation.assign`, `leave.review`, `reports.approve_versions`, `exams.principal_review`, `corrections.decide_mark`, `learning_actions.save_draft`, `learning_actions.activate`, `exams.datesheet.publish`


---

# TEACHER

# TEACHER: first-login questionnaire and top free-form requests

Sources: Appendix B (B.roles TEACHER nav l.506-514, the matrix row, B.typedOps §1, B.ui A1-A6, B.decisions rules 1-24 and T1-T13), Appendix A (148 rows whose roles include TEACHER, plus the read-lookup lines at :91, :193, :326, :472), and code read for this design: `src/lib/automation/catalog.ts:15-56`, `src/lib/automation/role-setup.ts:9`, `src/app/actions/completeTeacherOnboarding.ts`, `src/app/teacher-onboarding/page.tsx:47-50`, `src/app/actions/invite.ts:324-404`, `src/lib/onboarding/launch-plan.ts:114-118`, `prisma/schema.prisma` (User, MeetingWindow, StaffInvitation, ChatSettings). Nothing in the repo was modified.

## 0. Where the teacher stands today
- **Features in navigation (20):** Today, AI Workflows, Exam Studio, Attendance register, Tests and quizzes, Marks, Report cards, Homework, My classes, Students, Resources, Portfolios, Messages, Objective map, Timetable and cover, Calendar and meetings, AI assistant, Access plans, Activities, Today's trip, Care, My teaching evidence, Record corrections, My leave.
- **Default matrix:** students V; leave VA; attendance VA; timetable V; exams VAE (the exams API limits teachers to quizzes and class tests); reports V.E; ai VA. No fees, staff, library, front-desk or admissions access.
- **Typed operations:** none. `schoolAiOperationsFor` returns an empty set for TEACHER (`access.ts:76`). The teacher catalog today is `profile.update` (teaching fields are TEACHER-only, `role-action-service.ts:31`), `personal.save_plan` and `work.save`. `school.inspect` and `school.execute` are never offered. Workspace kinds: SOURCE, CURRICULUM, PAPER, WORKFLOW, BRIEF, PRACTICE. There is **no ONBOARDING kind**.
- **Seat rules that matter:** the academic lead (`canLeadAcademics`: PRINCIPAL, or a campus operator when no principal is active) owns timetable, term exams, syllabus progress, mark-correction decisions and learning-action activation. A teacher only reaches subjects with `teacherId = self` and classes with `classTeacherId = self` (`access.ts:142-154, 215-223`).
- **Coverage:** 151 capabilities, 4 reachable, all of them partial and reachable only through operator paths.

**Defects found while tracing the first login (new, verified in code):**
1. **Invited teachers never see first-login setup.** Accepting an invitation writes `onboardingComplete: true` (`src/app/actions/invite.ts:366` and `:400`). So `requiredOnboardingPath` → `/teacher-onboarding` (`launch-plan.ts:116`) only fires for teachers created some other way. The new questionnaire needs its own trigger: a per-user setup record, plus `welcomeCompletedAt` being null (`api/auth/welcome/route.ts:49`). It must not rely on `onboardingComplete`.
2. **`/teacher-onboarding` asks again for data the invite already captured.** Name, phone, CNIC, date of birth, gender, qualification, specialities, joining date, address and emergency contact are copied from `StaffInvitation.profile` at acceptance (`invite.ts:327-404`), yet the 4-step form asks for them again.
3. **The engine has no path for a teacher questionnaire.** The questionnaire branch of `startAutomaticJob` is ADMIN/CAMPUS_ADMIN-only and requires kind ONBOARDING (`service.ts:43-48`). TEACHER has no ONBOARDING kind (`access.ts:35-40`). A per-user ROLE_SETUP binding is needed, carrying `{recordId, version}` and `confirmedKeys`. It should reuse the SKO-470 run lifecycle, not a fork.

## Known before asking (never ask again)
| Fact | Source (prefill) |
|---|---|
| School, campus, role, accessVersion, timezone | session/JWT; `School.timezone` (written by the wizard, `setup-service.ts:382`) |
| Full name, email, phone, CNIC, DOB, gender, address, city, province, emergency contact | `StaffInvitation.profile` → User at acceptance (`invite.ts:327-404`), or `completeTeacherOnboarding.ts:150-175` |
| Qualification, specialization, subjectSpecialties / teachesAllSubjects, experience, joiningDate | same; `User` columns (`schema.prisma` User model) |
| Designation, primary department, salary profile | `invite.ts:~412-470` staffProfile (salary is **never** shown or put in a prompt) |
| Preferred language | `User.preferredLanguage`, then language cookie (`src/lib/locale/sign-in-language.ts` precedence), then school or campus locale default. Invitees usually have null, so this is the one identity fact worth confirming |
| Class-teacher-of and subjects taught | `readinessFor()` `completeTeacherOnboarding.ts:27-42`; `getAssignedWorkspaceSubjects` `access.ts:215-223` |
| Weekly timetable, free periods, rooms | `GET /api/timetable/teacher?teacherId=self`; `GET /api/academic/periods` |
| Cover duties | `GET /api/cover` |
| Active academic cycle, weekends, holidays | wizard-created ACTIVE cycle (`setup-service.ts:419-425`); `GET /api/academic/calendar`, `/calendar/unified` |
| Rosters of assigned classes | `GET /api/students?classId=` (read grant students V) |
| Syllabus topics and approved curriculum for assigned subjects | `GET /api/subjects/[id]/syllabus`; `GET /api/curriculum/map` |
| Existing exams, subject totalMarks, grade rules | `GET /api/exams?classId=`; `GET /api/grade-config` |
| Leave types and balances | `GET /api/leave?mode=balances`; `GET /api/leave/types` |
| Extra capabilities (activityStaff, tripToday, careMember, accessPlans, corrections, schoolAiExams) | `GET /api/navigation/access` (`src/lib/navigation/capabilities.ts`) |
| Learners with access plans in my classes | `GET /api/accommodations?view=staff`. Shown as a count only and **kept out of prompts** (Appendix A note) |
| Welcome and tour state | `User.welcomeCompletedAt`, `User.tourProgress` |

**Interaction idea (flagship).** The questionnaire is **"Your week, built live."** The left pane shows the teacher's real Today and week (timetable, free periods, assigned classes). Each answer paints records onto it as *pending ghosts*: meeting slots in free periods, test dates on the calendar, a plan card per subject. The final screen turns the ghosts into receipts.
- Most answers are structured, so they **compile deterministically to typed adapters with zero model calls**. Credits are spent only on text-last-resort fields, and the estimate is shown before Build (T9).
- Questions that do not apply are skipped. Examples: a teacher with no class-teacher role never sees the digest question; a teacher with no `activityStaff` never sees the activity question; a teacher with no assignments sees only Q1-Q4.

## Questions
| # | key | Prompt (EN) | Input | Drives | Class | Req. | Prefill |
|---|---|---|---|---|---|---|---|
| 1 | `assignmentCheck` | "These are the classes and subjects the school gave you. Is this right?" | choice: Correct / Something is missing / Something is wrong (+ pick the rows) | `readiness.update_task` (task for the academic lead: "fix my assignment") | B | yes | `readinessFor()`; `getAssignedWorkspaceSubjects` |
| 2 | `preferredLanguage` | "Which language should Skoolee use with you?" | choice en / ar / ur | `profile.update_own` (via automation `profile.update`) | A | yes | User.preferredLanguage → cookie → school default |
| 3 | `professionalGaps` | "Add what's missing from your teaching profile." Shown only for null fields | tags (specialities) + stepper (years) + choice (qualification level) | `profile.update_own` | A | no | invite profile / User columns |
| 4 | `focusAreas` | "What do you want ready first?" | multi: Register, Homework, Class tests and marks, Report remarks, Papers (Exam Studio), Parent meetings, Resources | `personal.save_plan` (private "first two weeks" checklist with deep links); also orders and skips later questions | A | yes | nav capability keys; class-teacher flag puts Register first |
| 5 | `startingUnits` | "For each subject, which unit are you teaching first?" | choice per subject from syllabus topics (text-last-resort if no syllabus) | `work.save` (a teaching plan per subject, outcome `plan_saved`) | A | no | `/api/subjects/[id]/syllabus`; `/api/curriculum/map` |
| 6 | `meetingHours` | "When can families book a meeting with you?" | schedule-grid over own free periods + stepper "weeks ahead" (1-6) | `meetings.open_window` (one window per date) | B | no | `/api/timetable/teacher` (busy periods greyed), calendar weekends and holidays, School.timezone |
| 7 | `meetingDetails` | "How should those meetings run?" | choice mode (In person / Online / Either) + stepper slot minutes (10/15/20) + location (prefilled) + choice cancellation notice | `meetings.open_window` (mode, slotMinutes, location, cancellationPolicy are required by the model) | B | when Q6 answered | room from own timetable slots |
| 8 | `classTests` | "Plan a first class test for each subject?" | rows per assigned class×subject: date + total marks stepper, or "Not yet" | `exams.create` (quiz/class-test type only) | B | no | assigned subjects, `/api/exams`, unified calendar (blocks holidays and term exams), subject totalMarks |
| 9 | `marksEntry` | "How will you enter marks for these tests?" | choice: Type them / Scan paper mark sheets | `marks_scan.create_template` per new test (scan only) | A | no (only if Q8) | none |
| 10 | `weeklyDigest` | "Prepare a weekly update for your class's families?" Class teachers only | choice No / Yes + weekday | `digests.prepare` (this week's draft only) | A (draft); sending stays C | no | classTeacherOf |
| 11 | `resourceLinks` | "Any links you already use with these classes?" | tags (https links) + class/subject choice | `resources.create` (link, DRAFT, staff audience) | A | no | `/api/resources?classId=` (dedupe by URL) |
| 12 | `activityLead` | "Do you run a club or activity this term?" Only with `activityStaff` | choice No / Yes + name, day, time | `activities.create` | B | no | `/api/activities`, own free periods |

Rules for the build:
- Answers are confirmed per key (`confirmedKeys`), and the build is one job bound to `{recordId, version}`.
- Class A items run on Build.
- Each Class B item shows its exact preview: dates, slot count, the families who can book, the notification an exam creates. The confirm carries `pendingKey + previewHash + job.version`. A bare "yes" does nothing.

**Deliberately not asked** (no adapter, or not the teacher's decision):
- Message quiet hours: this is school-level `ChatSettings`, ADMIN/SUPER_ADMIN only.
- Cover availability: there is no teacher write.
- Homework rhythm and recurring digests: recurrence needs an approved POLICY (rule 18).
- Profile photo: `profile.update` lacks profileImageUrl, and document intake is deferred to SKO-460.
- MFA: never automated.

All of these go to remainsAsTasks.

## Build outcome
**Auto-provisioned (with a receipt each):**
- `profile.update_own`: language, plus missing qualification, experience and specialities (A).
- `personal.save_plan`: a private first-fortnight checklist from `focusAreas`, with deep links to Register, Homework, Marks, Exam Studio and Meetings (A, outcome `plan_saved`, never called "done").
- `work.save`: one teaching plan per subject, starting at the chosen unit (A, `plan_saved`).
- `meetings.open_window`: windows for N weeks in free periods only (B).
- `exams.create`: one class test or quiz per chosen class×subject (B). The preview names the EXAM_CREATED notification.
- `marks_scan.create_template`: printable scan sheets for those tests (A).
- `digests.prepare`: this week's family digest draft for the class-teacher class. It is built only from evidence already released to families (A, draft).
- `resources.create`: link resources as DRAFT, staff audience (A).
- `activities.create`: the club or activity (B).
- `readiness.update_task`: an "assignment needs fixing" task owned by the academic lead (B). This is created only when Q1 is not "Correct".

**Remains as tasks (who):**
- Fix class or subject assignments: academic lead (PRINCIPAL; campus operator if none). The teacher never assigns themselves.
- Approve and send each weekly digest: the teacher, on the digest review screen (Class C, family message).
- A recurring weekly digest or homework rhythm: needs a POLICY approved by a School AI manager (rule 18).
- Publish link resources to students: the teacher in Resources (`resources.publish`, B, from chat later).
- Release homework: the teacher (`assignments.release`).
- Write papers: Exam Studio (deep link; moderation, Seal and release belong to its tiered authority).
- Family message quiet hours: school admin (`chat.update_school_settings`).
- Being available for cover: academic lead (assigns cover; no teacher write exists).
- Syllabus progress: academic lead (`curriculum.syllabus_topic.update` excludes TEACHER).
- MFA and account protection: the teacher at `/protect-account`.
- Profile photo: the teacher in profile.
- Leave entitlements: admin (leave types and allocations).

## Top requests
| # | Typical request | Capability keys | Class | Adapter today |
|---|---|---|---|---|
| 1 | "Take 7B register: Ali and Sara absent, Hamza late 8:20, rest present" | `attendance.save_register` | B: full grid preview. Each mark comes from a quoted per-student statement. "Rest present" is only the grid's own human "Mark remaining present" tap (T3). Past or locked days become C via corrections | **needed** (partial for operators only) |
| 2 | "Enter the 8A science quiz marks: Ayesha 18, Bilal 15 …" | `marks.enter_bulk` | C: AI prefills the marks sheet draft and the teacher saves it there (rule 5 / T3; MARKS_ENTERED notification). Can drop to B only if that notification is shown to be staff-only | **needed** |
| 3 | "Make a 25-mark class test for Maths 7A on 12 Nov" | `exams.create` | B | **needed** (partial for operators via session plan) |
| 4 | "Set homework for 8A English: read chapter 4, answer Q1-5, due Thursday" | `assignments.create`, `assignments.release` | create A (DRAFT); release B | **needed** |
| 5 | "Apply for leave 14-15 Nov, family wedding" | `leave.apply` | B (reviewers are notified; approval stays with the reviewer) | **needed** |
| 6 | "Write report remarks for 7B from their term marks" | `reports.edit_remarks` (`reports.send_one` later) | B per remark (the edit clears approval); sending C | **needed** |
| 7 | Urdu: "کل شام 3 سے 5 بجے تک والدین کی ملاقات کے لیے 15 منٹ کے سلاٹ کھول دیں" (open 15-minute parent slots tomorrow 3-5 pm) | `meetings.open_window` | B | **needed** |
| 8 | Arabic: "اطلب تصحيح درجة أحمد في اختبار العلوم من 12 إلى 15 لأن الورقة صُححت خطأ" (request a mark correction for Ahmed in the science test, 12 → 15) | `corrections.preview`, `corrections.request_mark` | C (the academic lead decides; reviewHash must equal the preview hash) | **needed** |
| 9 | "Tell 7B parents the trip is moved to Friday" | `chat.start_direct` / `chat.send_message` (draft hand-off) | C (family message; AI drafts, the teacher sends from Messages) | **needed** (draft-only adapter) |
| 10 | "Make a 20-question Grade 8 Physics paper from chapters 3-4" | none: Exam Studio owns syllabus → paper → seal (rule 21) | none (deep link to `/ai/studio` with subject and class prefilled; outcome `answered`) | not an adapter (do not duplicate) |

Next most likely: "I'm covering 6C period 4, done the worksheet" (`cover.acknowledge_duty` A, `cover.record_outcome` A); "Share the fractions worksheet link with 7A" (`resources.create` A + `resources.publish` B); "Check me in" (`teacher_attendance.check_in_self` A); "Open a learning plan for Usman in maths" (`learning_actions.save_draft` A; activation by the lead).

## Adapters needed
`readiness.update_task`, `meetings.open_window`, `exams.create`, `marks_scan.create_template`, `digests.prepare`, `resources.create`, `activities.create`, `attendance.save_register`, `marks.enter_bulk`, `assignments.create`, `assignments.release`, `leave.apply`, `reports.edit_remarks`, `corrections.preview`, `corrections.request_mark`, `chat.send_message`.

Already covered (reuse, no new adapter): `profile.update_own` via `profile.update` (language and teaching fields), `personal.save_plan`, `work.save`.

**Notes for implementers:**
- **Idempotency.** `readiness.update_task` (create), `meetings.open_window`, `exams.create`, `marks_scan.create_template`, `resources.create`, `activities.create`, `assignments.create` and `corrections.request_mark` are not idempotent. Each adapter must add a key such as `role-setup-{recordId}-{version}-{key}-{n}` or a fingerprint replay (as in `role-action-service.ts:23-27`).
- **Reuse readiness.** `leave.apply`, `marks.enter_bulk`, `exams.create` and `reports.edit_remarks` are inline-prisma, so their logic must be extracted into a service first. The rest are `direct`.
- **Route-only side effects.** `attendance.save_register`'s future-date check and its ATTENDANCE_SUBMITTED notification live in the route only, so the adapter must call them.

## Role-specific guardrails
- **ROLE_PURPOSE (catalog.ts:21):** "own professional profile, assigned subjects and teaching preparation. Never create campus classes or change another teacher's records." Every teacher adapter re-checks:
  - `role === TEACHER`, campus, accessVersion and the matrix flag;
  - **assignment**: the subject's `teacherId = self` or the class's `classTeacherId = self`, re-resolved at execute time, never taken from the model;
  - for cover writes, that the duty is assigned to self.

  The adapter refuses records belonging to another teacher.
- **Rule 19:** TEACHER executes no school operation, and these adapters do not change that. They are teacher-scoped role tools added to `automaticCatalog`. The seat allow-list in `access.ts:56-89` is not widened, and timetable, term exams, syllabus progress and class or subject assignment stay with the academic lead (asked for through a task, Q1).
- **Rule 5:**
  - No chat phrase alone publishes marks or results, sends report cards, digests or family messages, or applies a mark correction. Those are Class C and end as `awaiting_approval` with a deep link.
  - Marks and attendance are never invented (T3). A mark or status needs a quoted per-student statement, and "all present" from chat alone does not mark a register.
  - Exam types are limited to quizzes and class tests. Term exams go to the academic lead.
- **Rule 8:** the teacher never creates students, invites accounts or links guardians, including from a pasted list. Roster gaps become a task for the campus operator.
- **Privacy:**
  - Student names in marks, remarks and attendance requests are pseudonymised before every prompt.
  - Class and subject names must **not** be masked as [PERSON_n] (current engine defect), or class-scoped requests cannot resolve.
  - Access-plan instructions, care and safeguarding content, and staff salary never enter a prompt.
- **Honest outcomes:** teaching plans and checklists are `plan_saved`, digest drafts are "draft ready, not sent", and an exam created with a notification says who was notified. Credits are charged per AI action, and deterministic compiles of structured answers spend none.
- **UI:** shared design-system primitives only (schedule-grid and stepper must be added there, not page-local); EN/AR/UR with RTL; schedule-grid usable on phone (day-by-day list), tablet and desktop.


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `assignmentCheck` | These are the classes and subjects the school gave you. Is this right? | choice | readiness.update_task | B | yes | readinessFor() src/app/actions/completeTeacherOnboarding.ts:27-42; getAssignedWorkspaceSubjects src/lib/school-ai/access.ts:215-223 |
| `preferredLanguage` | Which language should Skoolee use with you? | choice | profile.update_own | A | yes | User.preferredLanguage, then language cookie (src/lib/locale/sign-in-language.ts), then school/campus locale default |
| `professionalGaps` | Add what's missing from your teaching profile. | tags+stepper+choice (only null fields shown) | profile.update_own | A | no | StaffInvitation.profile copied at acceptance src/app/actions/invite.ts:327-404; User qualification/experience/subjectSpecialties |
| `focusAreas` | What do you want ready first? | multi | personal.save_plan | A | yes | GET /api/navigation/access capability keys; class-teacher flag puts Register first |
| `startingUnits` | For each subject, which unit are you teaching first? | choice per subject (text-last-resort if no syllabus) | work.save | A | no | GET /api/subjects/[subjectId]/syllabus; GET /api/curriculum/map |
| `meetingHours` | When can families book a meeting with you? | schedule-grid + stepper (weeks ahead) | meetings.open_window | B | no | GET /api/timetable/teacher (busy periods greyed); GET /api/academic/calendar (weekends/holidays); School.timezone |
| `meetingDetails` | How should those meetings run? | choice (mode) + stepper (slot minutes) + text (location, prefilled) + choice (cancellation notice) | meetings.open_window | B | no | room of own timetable slots (GET /api/timetable/teacher) |
| `classTests` | Plan a first class test for each subject? | rows per class x subject: date + stepper (total marks) or Not yet | exams.create | B | no | assigned subjects; GET /api/exams?classId=; GET /api/academic/calendar/unified; subject totalMarks |
| `marksEntry` | How will you enter marks for these tests? | choice | marks_scan.create_template | A | no | shown only when classTests created rows |
| `weeklyDigest` | Prepare a weekly update for your class's families? | choice (No / Yes + weekday) | digests.prepare | A | no | classTeacherOf from readinessFor(); shown to class teachers only |
| `resourceLinks` | Any links you already use with these classes? | tags (https links) + choice (class/subject) | resources.create | A | no | GET /api/resources?classId= (dedupe by URL) |
| `activityLead` | Do you run a club or activity this term? | choice + text (name) + schedule (day/time) | activities.create | B | no | activityStaff capability (GET /api/navigation/access); GET /api/activities; own free periods |

**Auto-provisioned:**
- profile.update_own: preferred language plus missing qualification/experience/subject specialities (Class A)
- personal.save_plan: private first-fortnight checklist from focusAreas with deep links (Class A, outcome plan_saved)
- work.save: one teaching plan per assigned subject starting at the chosen unit (Class A, outcome plan_saved)
- meetings.open_window: family meeting windows in own free periods for N weeks (Class B)
- exams.create: one class test/quiz per chosen class x subject, preview names EXAM_CREATED notification (Class B)
- marks_scan.create_template: printable scan sheets for the new tests when scan chosen (Class A)
- digests.prepare: this week's family digest draft for the class-teacher class, from released evidence only (Class A, draft not sent)
- resources.create: link resources as DRAFT with staff audience (Class A)
- activities.create: the club/activity the teacher runs (Class B, only with activityStaff)
- readiness.update_task: 'fix my class/subject assignment' task owned by the academic lead, only when assignmentCheck is not Correct (Class B)

**Remains as tasks:**
- Correct class/subject assignments: academic lead (PRINCIPAL, or CAMPUS_ADMIN/ADMIN when no active principal) - teacher never assigns self
- Approve and send each weekly family digest: teacher on the digest review screen (Class C, family message)
- Recurring weekly digest / homework rhythm automation: School AI manager must approve a POLICY in approval_required mode (rule 18)
- Publish link resources to students: teacher in Resources (resources.publish)
- Release homework to students: teacher (assignments.release)
- Write, moderate and seal papers: Exam Studio tiered authority (deep link /ai/studio)
- Family-message quiet hours: school admin via chat.update_school_settings (school-level ChatSettings, no per-teacher setting)
- Availability for cover: academic lead assigns cover (no teacher write exists)
- Syllabus topic progress: academic lead (curriculum.syllabus_topic.update excludes TEACHER)
- MFA / account protection: teacher at /protect-account (never automated)
- Profile photo: teacher in profile (profile.update lacks profileImageUrl; document intake deferred to SKO-460)
- Leave types and allocations: campus admin (leave.create_type / allocations)
- Missing students in an assigned class: campus operator (teacher never creates students, rule 8)

**Adapters needed:** `readiness.update_task`, `meetings.open_window`, `exams.create`, `marks_scan.create_template`, `digests.prepare`, `resources.create`, `activities.create`, `attendance.save_register`, `marks.enter_bulk`, `assignments.create`, `assignments.release`, `leave.apply`, `reports.edit_remarks`, `corrections.preview`, `corrections.request_mark`, `chat.send_message`


---

# ACCOUNTANT

# ACCOUNTANT: first-login questionnaire and top free-form requests

Sources: B.roles (ACCOUNTANT nav `src/lib/navigation/role-nav.ts:303-325`, matrix `src/lib/permissions.ts:222-240`), B.typedOps §2.13–2.14 and §1, Appendix A C6 (rows 612–680) plus the C3/C5 rows that allow ACCOUNTANT, B.decisions rules 1–24 and tensions T1/T5/T7/T8, `src/lib/automation/catalog.ts:22`, `src/lib/automation/role-setup.ts:9`, `src/lib/onboarding/launch-plan.ts:86-93`.

**Role at a glance.**
- **Nav (9 features):** Today, AI Workflows, Collect (fees), Invoices (fees), Reports & reminders (reports), Accounts & ledger (accounts), Tax packages (fees), Payroll (payroll), Messages, Fee setup (fees), Payment corrections (corrections), My leave.
- **Module grants:** fees VAE·, accounts VAE·, payroll VA··, ai VAE·, leave VA··. View only: students, staff, attendance, reports. No timetable, exams, admissions, library or front desk.
- **Typed operations today:** `finance.apply_operation` (PAYMENT, CREDIT, REFUND, OPENING_BALANCE, EXPENSE, RECONCILE, SCENARIO) and `fees.generate_invoices` (at most 50 students and 30 lines; refused when a tax package is active).
- **Seat rule:** while an active ACCOUNTANT holds the campus seat, ADMIN/CAMPUS_ADMIN lose both finance operations (`access.ts:58,72-75`; `seats.ts:12-27`). So the accountant's first login is also a **handover**: any finance setup the operator left half-done becomes this user's to finish.
- **Capabilities:** 110 write capabilities, 8 reachable by AI today (all partial).

## Known before asking (never ask again)

| Fact | Source (prefill) |
|---|---|
| Full name, email, phone, qualification | `User` row + `StaffInvitation.profile` captured at invite (`prisma/schema.prisma:4955-4976`, accepted in `src/app/(auth)/accept-invite/page.tsx`) |
| Role, school, campusId, invitedBy | `StaffInvitation.role/campusId/invitedBy`; session `AuthUser`. If campusId is null, `launch-plan.ts:93` sets `needsCampus`, and the questionnaire is replaced by one task, "Campus admin assigns you a campus". |
| UI language (EN/AR/UR, RTL) | `user.preferredLanguage` (profile; `profileActionSchema` in `src/lib/automation/schema.ts:9`) |
| Currency, timezone, weekends, number/date formats | `getLocalePackage(schoolId, campusId)` `src/lib/locale/store.ts:18` (LocalePolicy; currency is snapshotted into fee groups, discounts and bank accounts). Currency is **never asked**. A pending currency change shows as a review task instead. |
| Active academic year and its dates | wizard-created ACTIVE cycle (`setup-service.ts:419-423`); `GET /api/academic-cycle?campusId=` |
| Classes and sections, active student counts per class | `GET /api/classes?campusId=`; automation catalog context (`catalog.ts:56`); setup journey counts (`src/lib/school-ai/setup-journey-service.ts:10-41`) |
| Finance config that already exists (operator may have started) | `GET /api/fees/types`, `/api/fees/groups`, `/api/fees/master-lines`, `/api/fees/assignments`, `/api/fees/discounts`, `/api/fees/fine-rules`, `/api/fees/structure`, `/api/accounts/chart`, `/api/accounts/bank-accounts`, `/api/accounts/payment-methods`, `/api/tax?view=overview`, `/api/payroll/runs` (policies, provider mappings). Each one must run `assertFeesRead` first (`src/lib/api/scope.ts:166`); Appendix A flags gate gaps on these GETs. |
| Tax package catalog for the school's country | `/api/tax?view=overview` (package must match campus jurisdiction) |
| Separation settings | `School.correctionSeparateApprover` (schema default true), Delivery Policy `separationOfDuties` (`delivery-policy.ts:197`), `PayrollPolicy.requireSeparation` |
| Whether a principal or other accountant exists | `getCampusSeats` (`src/lib/auth/seats.ts:12-27`); another accountant matters for currency review (`src/app/actions/locale.ts:140-157`) |

**Adaptive rule.** Before each question the flow reads the matching lookup. If records already exist, the question becomes a **confirm card** ("We found 3 fee heads set up by Sara (admin): Tuition, Admission, Exam. Keep / add more"). It does not re-ask. Questions whose answer already exists are skipped. The flow is 6 questions at minimum (operator did fee setup) and 13 at most (empty campus).

## Questions

Interaction concept: **"Open the books."** The flow is a ledger-styled stepper with three chapters: *Money in* (accounts, methods), *What families pay* (heads, class grid, due dates, fines, discounts) and *Desk duties* (balances, reminders, tax, payroll). A live **Desk preview** panel builds on the right on desktop/tablet, or as a bottom sheet on phone. It shows each record that will be created and tags it A, B or C. Amounts use the locale currency with a Western/Eastern-Arabic numeral toggle, and RTL mirrors the grid. Everything is shared design-system primitives: Stepper, ChoiceCard, TagInput, DataGrid, DateField and Sheet.

| # | key | Prompt (EN) | Input | Drives | Class | Req. | Prefill |
|---|---|---|---|---|---|---|---|
| 1 | `booksStartPoint` | Where are this campus's fee records today? | choice: Starting fresh this year / Moving from another system or spreadsheet / Already mid-year in Skoolee | branches Q10; `imports.stage_batch`, `fees.create_carry_forward` | none | yes | invoice count > 0 ⇒ "mid-year" preselected |
| 2 | `collectionAccounts` | Which bank accounts receive fee money? | tags (rows: display name, bank name; currency locked to locale; **no account number in this flow**) | `accounts.create_bank_account` | B | yes (≥1, or "cash only") | existing `/api/accounts/bank-accounts` |
| 3 | `paymentMethods` | How do families pay? | multi: Cash, Bank transfer, Cheque, Card, Mobile wallet, Online (Safepay) | `accounts.create_payment_method` | B | yes | existing payment methods; Online only if the campus gateway is on |
| 4 | `chartOfAccounts` | Start with the standard school chart of accounts? | choice: Use standard (preview list) / I'll set mine up in Accounts | `accounts.create_account` | B | no (default standard) | `/api/accounts/chart` system accounts |
| 5 | `feeHeads` | Which fees does the school charge? | tags with presets (Tuition, Admission, Annual/Development, Exam, Transport, Lab, Sports, Uniform/Books) | `fees.create_fee_type` | B | yes | existing fee types |
| 6 | `classFeeGrid` | What does each class pay? | schedule-grid: rows = existing classes, columns = chosen heads, cell = amount + frequency (monthly / termly / once) with "copy down" | `fees.create_fee_group`, `fees.create_master_line`, `fees.assign_fee_group` | B | yes | classes from `/api/classes` (active cycle); existing groups, lines and assignments; legacy `/api/fees/structure` rows offered for conversion |
| 7 | `billingCalendar` | When do fees fall due? | stepper: issue day of month, due day (1–28), first billing month (date, inside the active cycle) | master-line `dueDate`; first-run proposal for `fees.generate_invoices` | B (dates) / C (first invoice run) | yes | cycle start month; locale weekends |
| 8 | `lateFeeRule` | Charge a late fee after the due date? | choice: No / Flat amount / Percent, plus stepper (grace days, amount or %) | `fees.create_fine_rule` | B | no | existing fine rules |
| 9 | `discountTypes` | Which discounts do you give? | multi + stepper % or amount: Sibling, Staff child, Merit scholarship, Need-based, Early payment | `fees.create_discount` (types only; per-student assignment stays a task) | B | no | existing discounts |
| 10 | `openingBalances` | Do any families owe money from before Skoolee? | choice: No / Yes, I'll bring a sheet / Yes, I'll enter them later (shown only if Q1 ≠ fresh) | task: `imports.stage_batch` then `finance.apply_operation` OPENING_BALANCE / `fees.create_carry_forward` | C | if shown | none |
| 11 | `reminderPlan` | When should families get due-date reminders? | multi: 3 days before, on due day, 7 days late, plus channel shown read-only (verified-WhatsApp guardians only) | POLICY draft for `fees.send_due_reminder` (approval_required) | C | no | `GuardianChannelPreference` counts ("212 of 640 families reachable") |
| 12 | `taxOnFees` | Does the school charge tax on fees? | choice: No / Yes, then pick a package from the country catalog | `tax.save_package_draft`, then `tax.request_signoff` | B (draft) / C (sign-off) | yes | `/api/tax?view=overview` catalog for the school's country |
| 13 | `payrollHere` | Will you prepare staff salaries in Skoolee? | choice: Yes, from month (date) / Not yet | readiness tasks for `payroll.set_employee_details`, `payroll.prepare_run` | none | no | existing PayrollPolicy and provider mapping (if both exist, shows "ready to prepare") |

Questions deliberately **not** asked:
- name, language, campus, currency, academic year, classes (all known);
- refund/approval routing (owned by school policy, not the accountant);
- bank account numbers or IBANs (entered only in the native Accounts form);
- dashboard preferences (no adapter);
- class or student creation (outside the role ceiling).

## Build outcome

When the user presses **"Set up my desk"**, one setup job starts, bound to `questionnaire {id, version}`. Credits are estimated and reserved first (T9). All Class B records are shown as **one grouped preview** carrying a previewHash, with a single confirm. Order follows the C6 dependency chain: chart → bank accounts → payment methods → fee types → fee groups → master lines → class assignments → fine rules → discounts → tax draft.

**autoProvisioned** (each from confirmed answers only, each with a receipt):
- `accounts.create_account`: standard chart (Q4), skipping system accounts that already exist
- `accounts.create_bank_account`: named accounts in locale currency, no numbers (Q2)
- `accounts.create_payment_method` (Q3)
- `fees.create_fee_type` (Q5)
- `fees.create_fee_group`: one group per distinct class package (Q6)
- `fees.create_master_line`: head × amount × due date (Q6, Q7)
- `fees.assign_fee_group`: class → group for the active academic year (Q6)
- `fees.create_fine_rule` (Q8)
- `fees.create_discount`: discount types only (Q9)
- `tax.save_package_draft`: DRAFT only (Q12)

**remainsAsTasks** (shown on the accountant's Today screen as setup tasks, each naming its owner):
1. **First invoice run** (`fees.generate_invoices` / `fees.generate_monthly_invoices`, Class C). The **accountant** reviews the deterministic preview in Invoices and applies it there. If Delivery Policy separation is REQUIRED, a **campus admin** approves. If a tax package is active, the run goes through the Fees module route, because the AI op refuses it (FEE_TAX_PACKAGE).
2. **Opening balances** (Q10): `imports.stage_batch` → reviewed rows → `finance.apply_operation` OPENING_BALANCE / `fees.create_carry_forward`, Class C. Done by the **accountant** in Accounts. Document intake is deferred to SKO-460, so this deep-links to the existing import screen.
3. **Reminder schedule** (Q11): a POLICY record in `approval_required` mode for `fees.send_due_reminder`. A **campus admin** approves it, because ACCOUNTANT cannot author POLICY kind (`allowedWorkspaceKinds`). Sends are Class C and report provider acceptance, not delivery.
4. **Tax sign-off** (Q12): `tax.run_fixtures` + `tax.request_signoff` by the **accountant**, then `tax.approve_package` by the **institution authority** (SUPER_ADMIN in a group, ADMIN when standalone).
5. **Payroll readiness** (Q13): `payroll.save_policy` and `payroll.save_provider_mapping` by the **campus admin**. After that, the **accountant** does `payroll.set_employee_details` and `payroll.prepare_run`, and the **campus admin** does `payroll.approve_run`. Target the SKO-434 runs engine, not the legacy one, which excludes ACCOUNTANT.
6. **Bank account numbers / IBAN**: the **accountant** enters them in the native Accounts form (`accounts.update_bank_account`). They are never passed through a prompt.
7. **Per-student discount assignment** (`fees.assign_discount`): the **accountant** does this later in chat (Class B, one evidence quote per student, sibling suggestions via `GET /api/students/siblings`). Waivers go to the **campus admin**.
8. **Missing classes or students** found while filling Q6: the **admin** or **principal** creates them. The accountant cannot.
9. **Pending currency change** (if any): `reviewLocaleCurrency` by an **accountant other than its creator**.
10. **Unassigned campus** (if `needsCampus`): the **campus admin** assigns one.

Readiness wording follows rule 17. It is computed from real records (setup-journey), never from questionnaire completion. Copy says "Ready to invoice: 3 of 4 steps done", never "Your desk is set up" while a C task is open.

## Top requests

| # | Typed request | Capability key(s) | Class | Adapter today |
|---|---|---|---|---|
| 1 | "Record Rs 12,500 cash from Ali Raza's father for the October fee, 7B" | `fees.collect_payment` (today via `finance.apply_operation` PAYMENT) | C (AI drafts receipt preview; post happens on the Collect screen, bound to previewHash) | partial: needs a new adapter on the collect service (receipt counter, idempotencyKey + requestHash, method enum normalisation) |
| 2 | "Generate November invoices for all classes" | `fees.generate_invoices` / `fees.generate_monthly_invoices` | C | partial: AI op is capped at 50 students and refuses tax packages; a whole-month adapter is needed on `invoice-generation.ts` |
| 3 | "Who in Class 9 hasn't paid this month? Send them a reminder" | read `/api/fees/reports/defaulters` (A, answered) + `fees.send_due_reminder` | A read / C send | none: adapter needed |
| 4 | "Ahmed's family will pay the remaining 30,000 in three instalments" | `fees.propose_payment_plan` (approved by a different staff member via `fees.decide_payment_plan`) | C | none: adapter needed |
| 5 | "Give the 20% sibling discount to Fatima and her brother" | `fees.assign_discount` | B (per-student preview with evidence) | none: adapter needed |
| 6 | "Refund the Rs 5,000 extra transport fee Hamza Khan paid" | `fees.request_adjustment` → campus admin `fees.decide_adjustment` → `fees.record_refund_disbursement` | C | partial: today's AI REFUND posts a reversal at once (governance bypass); a new adapter must call `requestAdjustment` |
| 7 | "Match this month's HBL statement with the payments" | `imports.stage_batch`, `imports.commit_bank_statement`, `fees.post_bank_reconciliation` (or `finance.apply_operation` RECONCILE) | C | partial (stage only): commit and post adapters needed; file intake deferred to SKO-460, so deep-link to Accounts |
| 8 | "Add the electricity bill, Rs 48,000, paid from the main account" | `accounts.post_ledger_entry` (via `finance.apply_operation` EXPENSE) | C | partial: exists via EXPENSE |
| 9 | Urdu: "اکتوبر کی تنخواہیں تیار کر دیں" (prepare October salaries) | `payroll.prepare_run` (campus admin `payroll.approve_run`) | C | none: adapter needed; blocked until policy and provider mapping exist, and the AI must say who must do that |
| 10 | Arabic: "أضف رسوم النقل الشهرية ٣٠٠٠ لطلاب الصف الخامس" (add a 3,000 monthly transport fee for Grade 5) | `fees.create_fee_type` (if missing), `fees.create_master_line`, `fees.assign_fee_group` | B | none: adapters needed (same as questionnaire Q5/Q6) |

Honest outcomes (rule 15):
- "How much did we collect today?" is `answered` (a read), never `executed`.
- Every C row ends `awaiting_approval`, with a deep link and the approver's name. It never ends as done.
- A request outside the role ("add a new student to 7B", "change the exam date") ends `unsupported_for_role` and names who can do it.

## Adapters needed

| Capability(ies) | Where the need comes from | What the adapter must do |
|---|---|---|
| `accounts.create_account`, `accounts.create_bank_account`, `accounts.create_payment_method` | Q2–Q4 | inline-prisma today; move to services, campus-pinned |
| `fees.create_fee_type`, `fees.create_fee_group`, `fees.create_master_line`, `fees.assign_fee_group`, `fees.create_fine_rule`, `fees.create_discount` | Q5–Q9 and request 10 | inline-prisma; pin to `user.campusId` (school-wide PATCH fence gaps in C6) |
| `tax.save_package_draft`, `tax.request_signoff` | Q12 | direct services exist |
| `fees.collect_payment` | request 1 | replaces PAYMENT through finance.apply_operation |
| `fees.generate_monthly_invoices` | request 2 | full-month generation with tax |
| `fees.send_due_reminder`, `fees.propose_payment_plan`, `fees.assign_discount` | requests 3–5 | |
| `fees.request_adjustment` | request 6 | replaces AI REFUND/CREDIT |
| `imports.commit_bank_statement`, `fees.post_bank_reconciliation` | request 7 | |
| `payroll.prepare_run`, `payroll.set_employee_details` | request 9 and the payroll task | |

## Role-specific guardrails

- **ROLE_PURPOSE** (`catalog.ts:22`): "Accountant: campus financial work and own profile. Never manage classes or academic outcomes."
  - The fee grid only reads existing classes. A missing class becomes a task for the admin or principal, never a create.
  - No student, class, timetable, exam or attendance write is ever offered.
  - Student data is used only as a read lookup (students: view).
- **Rule 5 / T5 (money):** no chat phrase alone posts a payment, moves money, issues invoices, refunds, credits, reconciles or sends a family reminder.
  - All of these are Class C. Classes are static per capability in the registry, never model-chosen.
  - The accountant's own approval of `finance.apply_operation` / `fees.generate_invoices` (`assertApprovalRole` exemption, `access.ts:155-158`) must **not** be exercised by the engine's self-approve (`service.ts:81`). The apply happens on the domain screen, bound to version + previewHash + idempotencyKey.
  - A bare "yes", typed or spoken, does nothing.
- **Fix before widening:**
  - AI CREDIT edits invoice totals directly, and AI REFUND posts a reversal immediately (`finance-operations-service.ts:143-155`). Route both through `requestAdjustment` so the campus admin decides.
  - Keep `FINANCE_SEPARATE_APPROVER` and the payment-plan "approver ≠ proposer" rule (`payment-plans/route.ts:78`).
- **Rule 8 (access):**
  - Reminders and receipts never invite guardian accounts or grant financial access.
  - Reminders go only to guardians who already have verified WhatsApp consent and financial access.
  - A reminder result is "accepted by provider", not "delivered".
- **Rule 19 (role ceiling):**
  - No POLICY authoring, so reminder schedules go to the campus admin.
  - No tax approval (institution authority).
  - No payroll policy or approval (campus admin).
  - No fee-type, line, discount or account deletes (ACCOUNTANT lacks fees.delete and accounts.delete).
  - No legacy payroll engine.
- **Every write re-checks:**
  - role, campus, `accessVersion`;
  - the matrix (fees V/A/E, accounts V/A, payroll V/A);
  - `canManageFinance` (`scope.ts:235`);
  - the financeDesk seat;
  - `assertSchoolOperational`.
  - Every read runs `assertFeesRead` first.
- **PII:**
  - Pseudonymise student and guardian names before every prompt.
  - Never mask class names or fee heads as [PERSON_n] (current engine defect; the grid and requests need them).
  - Bank account numbers, IBANs and card data never enter a prompt or a log.
- **Normalise payment-method enums** across collect (CASH|BANK|CHEQUE|SAFEPAY|MOBILE_WALLET), basic payment (lowercase) and AI PAYMENT (CASH|BANK_TRANSFER|CHEQUE|CARD|OTHER).
- **Credits** are charged per AI action. The setup job estimates and reserves them up front, then pauses and resumes on exhaustion.
- **EN/AR/UR + RTL, phone/tablet/desktop:**
  - Amounts render in the locale currency with tabular numerals.
  - The class fee grid collapses to one card per class on phone.
- **Seat handover:** when this accountant becomes active, the operator's finance tools disappear. The first-login flow must list any operator-authored finance drafts or jobs and offer to adopt them instead of leaving them orphaned.


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `booksStartPoint` | Where are this campus's fee records today? | choice | imports.stage_batch, fees.create_carry_forward | none | yes | invoice count via /api/fees/invoices (>0 preselects 'mid-year in Skoolee') |
| `collectionAccounts` | Which bank accounts receive fee money? | tags | accounts.create_bank_account | B | yes | GET /api/accounts/bank-accounts; currency from getLocalePackage (src/lib/locale/store.ts:18); no account numbers collected |
| `paymentMethods` | How do families pay? | multi | accounts.create_payment_method | B | yes | GET /api/accounts/payment-methods; online option only if campus payment gateway enabled |
| `chartOfAccounts` | Start with the standard school chart of accounts? | choice | accounts.create_account | B | no | GET /api/accounts/chart (existing/system accounts skipped) |
| `feeHeads` | Which fees does the school charge? | tags | fees.create_fee_type | B | yes | GET /api/fees/types (operator-created heads shown as confirm card) |
| `classFeeGrid` | What does each class pay? | schedule-grid | fees.create_fee_group, fees.create_master_line, fees.assign_fee_group | B | yes | GET /api/classes?campusId= (active cycle), GET /api/fees/groups, /api/fees/master-lines, /api/fees/assignments, legacy /api/fees/structure |
| `billingCalendar` | When do fees fall due? | stepper | fees.create_master_line, fees.generate_invoices | B | yes | active academic cycle start month (GET /api/academic-cycle); locale weekends |
| `lateFeeRule` | Charge a late fee after the due date? | choice | fees.create_fine_rule | B | no | GET /api/fees/fine-rules |
| `discountTypes` | Which discounts do you give? | multi | fees.create_discount | B | no | GET /api/fees/discounts |
| `openingBalances` | Do any families owe money from before Skoolee? | choice | imports.stage_batch, finance.apply_operation, fees.create_carry_forward | C | no | shown only when booksStartPoint is not 'fresh'; GET /api/fees/carry-forwards |
| `reminderPlan` | When should families get due-date reminders? | multi | fees.send_due_reminder | C | no | GuardianChannelPreference verified-WhatsApp counts for the campus |
| `taxOnFees` | Does the school charge tax on fees? | choice | tax.save_package_draft, tax.request_signoff | B | yes | GET /api/tax?view=overview (country package catalog, existing activations) |
| `payrollHere` | Will you prepare staff salaries in Skoolee? | choice | payroll.set_employee_details, payroll.prepare_run | none | no | GET /api/payroll/runs (PayrollPolicy and provider mapping presence) |

**Auto-provisioned:**
- accounts.create_account — standard chart of accounts, skipping existing system accounts (Q4, class B)
- accounts.create_bank_account — named collection accounts in locale currency, no account numbers (Q2, class B)
- accounts.create_payment_method — accepted payment methods (Q3, class B)
- fees.create_fee_type — fee heads (Q5, class B)
- fees.create_fee_group — one group per distinct class package (Q6, class B)
- fees.create_master_line — head x amount x due date per group (Q6+Q7, class B)
- fees.assign_fee_group — class to group for the active academic year (Q6, class B)
- fees.create_fine_rule — late fee rule (Q8, class B)
- fees.create_discount — discount types only, no student assignment (Q9, class B)
- tax.save_package_draft — DRAFT tax package only (Q12, class B)

**Remains as tasks:**
- First invoice run (fees.generate_invoices / fees.generate_monthly_invoices, class C) — accountant applies from Invoices preview; campus admin approves if Delivery Policy separation is REQUIRED; tax-active campuses go through the Fees module route
- Opening balances (imports.stage_batch -> finance.apply_operation OPENING_BALANCE / fees.create_carry_forward, class C) — accountant in Accounts import screen (document intake deferred to SKO-460)
- Reminder schedule POLICY (approval_required) for fees.send_due_reminder — campus admin approves (ACCOUNTANT cannot author POLICY); sends stay class C
- Tax sign-off — accountant runs tax.run_fixtures + tax.request_signoff; institution authority (SUPER_ADMIN in group / ADMIN standalone) runs tax.approve_package
- Payroll readiness — campus admin payroll.save_policy + payroll.save_provider_mapping; then accountant payroll.set_employee_details + payroll.prepare_run; campus admin payroll.approve_run (SKO-434 runs engine)
- Bank account numbers/IBAN — accountant enters in native Accounts form (accounts.update_bank_account), never via AI
- Per-student discount assignment (fees.assign_discount) — accountant later in chat, class B with per-student evidence; waivers by campus admin
- Missing classes or students found while filling the fee grid — admin or principal creates them
- Pending currency change review (reviewLocaleCurrency) — an accountant other than its creator
- Campus assignment when needsCampus — campus admin
- Adopt operator-authored finance drafts/jobs left when the accountant seat became active — accountant

**Adapters needed:** `accounts.create_account`, `accounts.create_bank_account`, `accounts.create_payment_method`, `fees.create_fee_type`, `fees.create_fee_group`, `fees.create_master_line`, `fees.assign_fee_group`, `fees.create_fine_rule`, `fees.create_discount`, `tax.save_package_draft`, `tax.request_signoff`, `fees.collect_payment`, `fees.generate_monthly_invoices`, `fees.send_due_reminder`, `fees.propose_payment_plan`, `fees.assign_discount`, `fees.request_adjustment`, `imports.commit_bank_statement`, `fees.post_bank_reconciliation`, `payroll.prepare_run`, `payroll.set_employee_details`


---

# LIBRARIAN

# LIBRARIAN: first-login questionnaire and top free-form requests

Ground truth: B.roles (LIBRARIAN nav l.521, matrix row LIB l.241-259, `canManageLibrary` scope.ts:260-262), Appendix A C7 library rows (lines 800-817, 882), B.typedOps §1 (`schoolAiOperationsFor` returns an empty set for LIBRARIAN, access.ts:76), `ROLE_PURPOSE.LIBRARIAN` (src/lib/automation/catalog.ts:23), `ROLE_SETUP_INTERVIEW.LIBRARIAN` (src/lib/automation/role-setup.ts:10), library services `src/lib/library/desk.ts` and `src/lib/library/rules.ts`.

**What the role can use today.** Nav: Today, AI Workflows, Lending desk, Catalogue & members, Messages, plus My leave in the account menu. Modules: `library` VAED, `ai` view+add, and read access to `students` and `reports` with no nav item for either. The only AI tools are `library.create_books` (class A, partial: it has no `categoryId`) plus `profile.update`, `personal.save_plan` and `work.save`. That is 1 of 4 nav features, and 2 of 75 capabilities are reachable. No `school.execute` operation is allowed for this role. Workspace kinds are SOURCE and WORKFLOW only.

**What the role is allowed to write (Appendix A).** Fourteen library capabilities:
- Desk: `library.desk_issue_copy`, `library.desk_return_copy`, `library.desk_renew_loan`, `library.desk_reserve_title`, `library.desk_add_copies`, `library.desk_mark_lost`, `library.desk_decide_charge` (HAND_TO_FEES only; WAIVE is CAMPUS_ADMIN/ADMIN only, desk.ts:19,229), `library.desk_save_rules`.
- Catalogue and members: `library.book_create/update/delete`, `library.category_create/update/delete`, `library.member_create/delete`.

It also gets the staff-wide rows: `leave.apply`, `chat.*`, `purchasing.save_request/submit_request/receive_goods`, `service_desk.*`, `care.report_concern`, `policies.*`, `readiness.update_task`, `activities.*`, `improvement.*`, `notifications.*`, `profile.update_own`.

Read lookups: `GET /api/library/desk?code=`. This lookup also writes: it expires holds (row 882, ⚑). Roster and class lookups go through `students.view`. `GET /api/reports` must not be used, because it returns guardian WhatsApp numbers and emails (Appendix A l.496).

**There is no first-login route for this role today.** `requiredOnboardingPath` returns null for LIBRARIAN (src/lib/onboarding/launch-plan.ts:114-118). The only entry point is the "Start my role setup" button, which feeds a one-line interview (role-setup.ts:10). This design adds a librarian path to the shared first-login questionnaire, using the same journey shell and the SKO-470 run lifecycle.

## Known before asking (never ask again)
| Fact | Source |
|---|---|
| Full name, email, phone, qualification, role, campus | `StaffInvitation.email/role/campusId/profile` (prisma/schema.prisma:4955-4976); name re-entered at accept (src/app/(auth)/accept-invite/page.tsx:304) |
| School, campus, campus count | session `AuthUser.schoolId/campusId` |
| Interface language | `User.preferredLanguage` (set at accept or sign-in; EN/AR/UR) |
| Currency, country | `LocalePolicy` (src/lib/auth/register.ts:164-171) becomes the `currency` in the loan rules |
| Weekends and school holidays | `Weekend` / `Holiday` rows from the wizard and `setup.apply_changes` (B.typedOps 2.2); used to prefill `closures` |
| Session start and end | wizard `sessionStart/sessionEnd` (setup-state.ts:55-78); used to bound closure dates |
| Existing library state (titles, copies, categories, members, open and overdue loans) | `librarianSummary` (src/app/actions/dashboard.ts:1627), `currentRules` (desk.ts:33), `DEFAULT_RULES` (rules.ts: 14 days, 3 loans, 2 renewals, 3 hold days, no fines) |
| Classes, sections, pupils with accounts, active staff | `students.view` lookups (`GET /api/classes`, `GET /api/students`), `GET /api/memberships` (office staff are missing from /api/staff, Appendix A l.222) |
| Campus subjects | `GET /api/subjects?campusId=`, used to suggest shelf sections |

Language is shown as a prefilled chip that the librarian can change through `profile.update_own` (class A). It is not asked as a question.

## Questions (13; branches skip what does not apply)
| # | key | Prompt (EN) | Input | Drives | Class | Req | Prefill |
|---|---|---|---|---|---|---|---|
| 1 | `lib_starting_point` | Where is your library today? | choice: Starting fresh / Paper register or spreadsheet / Another library system / Already in Skoolee | branching only (preference) | none | yes | "Already in Skoolee" if `librarianSummary.books>0` |
| 2 | `lib_loan_days` | How many days can a book be borrowed? | stepper 1-120 | `library.desk_save_rules.loanDays` | B | yes | current rules or 14 |
| 3 | `lib_max_loans` | How many books can one reader hold at a time? | stepper 1-20 | `desk_save_rules.maxLoans` | B | yes | 3 |
| 4 | `lib_renew_hold` | Renewals allowed, and days a reserved book waits on the hold shelf | two steppers (0-10, 1-14) | `desk_save_rules.maxRenewals/holdDays` | B | yes | 2 / 3 |
| 5 | `lib_closures` | Extra days the library is closed, beyond school holidays | date multi-pick on the session calendar | `desk_save_rules.closures` | B | no | Holiday rows, shown locked |
| 6 | `lib_late_fines` | Do you charge late fines? | choice: No / Yes, then amount per day, grace days and cap (currency fixed) | `desk_save_rules.finePerDay/graceDays/fineCap` | C | yes | No (0) |
| 7 | `lib_lost_book` | When a book is lost, what is charged? | choice: Nothing / Fixed amount | `desk_save_rules.lostCharge` | C | yes | Nothing |
| 8 | `lib_sections` | Which shelf sections do you use? | tags with suggestions | `library.category_create` (bulk) | A | yes | campus subjects plus Fiction, Reference, Urdu, Arabic, Islamiyat, Children |
| 9 | `lib_first_titles` | Add the titles you have now (you can add more later) | editable grid: title, author, ISBN, copies, section; max 100 rows | `library.book_create` (+`categoryId`) | A | no | blank, or the rows from the last import; ISBN duplicates are merged, never added twice |
| 10 | `lib_copy_labels` | Do your books carry accession or barcode labels? | choice: Yes, existing labels / Number them for me from ___ / No labels yet (count only) | `library.desk_add_copies` | B | yes | No labels |
| 11 | `lib_borrowers` | Who can borrow? | multi: classes from the roster, All teachers, All office staff | `library.member_create` (bulk) | B | yes | all ACTIVE classes plus all teachers |
| 12 | `lib_member_numbers` | What should a member number be? | choice: Admission number / Staff code / Auto (LIB-0001...) | `library.member_create.memberNo` | B | yes | Admission number for pupils, Auto for staff |
| 13 | `lib_purchase_list` | Books you need to buy this term (optional) | grid: title, quantity, estimated price | `purchasing.save_request` (DRAFT only) | B | no | none |

Rules for the flow:
- Questions 2-7 are saved as one versioned `LibraryLoanPolicy`, because each save adds a version (desk.ts:44-49). In the review step, one preview card shows the fine preview from `finePreview` (rules.ts).
- If question 1 is "Already in Skoolee", the flow skips 8-10 and shows the counts it already has.
- If question 1 is "Another library system" or "Paper register or spreadsheet", question 9 gets an "Upload file (coming soon)" button, which is disabled because document intake belongs to SKO-460. The typed grid stays available.
- No question asks for anything already in the table above.
- Opening hours, overdue follow-up preference and the daily brief order have no adapter, so they are not asked (see remainsAsTasks).

## Build outcome
**autoProvisioned** (each item gets a receipt line with a count and links):
1. A loan-policy version with the circulation fields (questions 2-5, class B: one confirm with preview hash). Fine and lost-charge fields equal to 0 are written in the same version.
2. Book categories (question 8), class A. A duplicate name returns 409 and is reported as "already there".
3. Catalogue titles with `categoryId` (question 9), class A. The receipt counts merged ISBNs separately.
4. Barcoded copies (question 10), class B. When the librarian picks "Number them for me", the barcodes are derived from the start number.
5. Library members for pupils and staff **who already have user accounts** (questions 11-12), class B. `LibraryMember.userId` is required, so pupils without accounts are listed as not enrolled, with the reason.
6. A purchase request in DRAFT (question 13), class B. It is never submitted automatically.

**remainsAsTasks** (each is shown as pending with the owner named, never as done):
- Fine and lost-charge amounts (questions 6-7, class C). These are saved as a draft rule version and routed to CAMPUS_ADMIN/ADMIN for approval. Until a separate approver confirms, the live policy keeps 0. A new approval wrapper is needed, because `saveRules` has none today.
- Submitting the purchase request. The librarian presses Submit in Purchasing, and a CAMPUS_ADMIN/ADMIN decides.
- Pupils or staff with no user account cannot become members. Accounts and invitations are created by CAMPUS_ADMIN/ADMIN (rule 8).
- Overdue notices to families. A CAMPUS_ADMIN/ADMIN or the PRINCIPAL queues them through `communications.queue_announcement` (class C); the librarian only drafts them.
- Back-filling open loans from a paper register. This is done by hand at the desk: `desk_issue_copy` dates loans today, and the legacy issue path that bypasses the rules must not be used.
- Importing the catalogue from a spreadsheet or photo (SKO-460).
- Printing labels.
- Opening hours, which have no field.
- Migration from another system, which needs an operator migration request.

## Top free-form requests
| # | Request (as typed) | Capability | Class | Adapter today |
|---|---|---|---|---|
| 1 | "Issue Harry Potter to Ali Raza, 7B" | `library.desk_issue_copy` (+ member/copy lookup) | B (name resolved to a pseudonymised candidate list; confirm shows copy, due date and reader) | needed |
| 2 | "Return ACC-1043, cover damaged" | `library.desk_return_copy` | B (preview shows any fine computed from approved rules; `returnedOn` capped at today) | needed |
| 3 | "Renew all of Fatima's books for another week" | `library.desk_renew_loan` | A (receipt wrapper, because a replay would renew twice) | needed |
| 4 | "Who has overdue books in class 9?" | `library.desk_lookup_expire_holds` (read; the GET also expires holds) | A (answered, not executed) | needed |
| 5 | "Add 20 copies of Oxford English Grammar, ISBN 978..." | `library.book_create` + `library.desk_add_copies` | A / B | partial (book only, no category or copies) |
| 6 | "Mark Usman's copy as lost and send the charge to fees" | `library.desk_mark_lost` (B) + `library.desk_decide_charge` HAND_TO_FEES (C) | B + C | needed |
| 7 | "Remind parents of class 6 about overdue books" | draft only, then hand-off to `communications.queue_announcement` (operator/principal); optional `chat.send_message` to the class teacher (B) | C | needed (librarian holds no communications operation) |
| 8 | Urdu: "کلاس 8 کے تمام بچوں کو لائبریری ممبر بنا دیں" ("make every class 8 pupil a library member") | `library.member_create` (bulk, by class) | B | needed |
| 9 | Arabic: "أضف قسمًا جديدًا باسم كتب الأطفال وانقل إليه كتب القصص" ("add a Children's Books section and move the story books into it") | `library.category_create` (A) + `library.book_update` categoryId (B) | A + B | needed |
| 10 | "Apply for leave this Thursday, family wedding" | `leave.apply` | B (notifies reviewers; approval stays with the reviewer) | needed |

Other requests that will come up: reserve a title for a pupil (`library.desk_reserve_title`, A); change the loan period (`desk_save_rules`, B, or C if money fields change); waive a fine. A waiver is refused for this role and routed to CAMPUS_ADMIN/ADMIN, with the reason required.

## Adapters needed
- Questionnaire: `library.desk_save_rules`, split into a circulation face (B) and a charges face (C). `library.category_create`. `library.book_create`, widened with `categoryId` and own-campus checks. `library.desk_add_copies`. `library.member_create` (bulk). `purchasing.save_request`.
- Requests: `library.desk_issue_copy`, `library.desk_return_copy`, `library.desk_renew_loan`, `library.desk_lookup_expire_holds`, `library.desk_mark_lost`, `library.desk_decide_charge`, `library.desk_reserve_title`, `library.book_update`, `chat.send_message`, `leave.apply`.
- Also needed: a library lookup inside `school.inspect` (titles, copies, members, loans), because the AI cannot resolve library names to ids today (Appendix A l.895).

## Role-specific guardrails
- **ROLE_PURPOSE (catalog.ts:23):** "Librarian: library preparation and own profile. Never manage campus academics or admissions." The catalogue never offers class, subject, timetable, exam, admissions or student-record writes to this role. Reads of the roster are only for resolving borrowers.
- **Rule 5:** no chat phrase alone posts or moves money or sends family messages.
  - Fine and lost-charge rates are class C and need a separate CAMPUS_ADMIN/ADMIN approval.
  - HAND_TO_FEES is class C.
  - WAIVE is refused for the librarian (desk.ts:19).
  - Family overdue notices are drafts handed to the operator or principal.
  - A return that creates a fine shows the computed amount before the confirm.
- **Rule 8:** automation never creates students, accounts or invitations. Member enrolment only links users who already exist. Pupils without accounts are reported as remaining work, never as done.
- **Rule 19 (role ceilings):** LIBRARIAN gets library adapters plus staff self-service only (leave, chat, purchasing draft, profile). It gets no `school.execute` operation.
- **Adapter hygiene from Appendix A (C7):**
  - Add own-campus checks. Legacy book, category, member and desk renew/lost/charge lookups match on schoolId only (l.893).
  - Use the desk service and never `library.legacy_issue_book`.
  - Do not copy the predicate-only gate that lets PRINCIPAL write the library. Use predicate + `assertWorkspacePermission`, as in role-action-service.ts:41-42.
  - Wrap the desk calls that have no key (renew, rules) in the AUTOMATIC_ACTION_V1 receipt.
- **Privacy:** pseudonymise pupil and staff names before every prompt. Book titles, authors and section names are not PII, so they are not masked; this fixes the engine defect that masks class and subject names. Never read `GET /api/reports` for contacts.
- **Honest outcomes:**
  - An overdue list is "answered", not "done".
  - A draft purchase request is "draft saved".
  - Copy condition and return events must quote the user's words; nothing observed at the desk is invented.


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `lib_starting_point` | Where is your library today? | choice |  | none | yes | src/app/actions/dashboard.ts:1627 librarianSummary (books>0 => Already in Skoolee) |
| `lib_loan_days` | How many days can a book be borrowed? | stepper | library.desk_save_rules | B | yes | src/lib/library/desk.ts:33 currentRules, else src/lib/library/rules.ts DEFAULT_RULES.loanDays=14 |
| `lib_max_loans` | How many books can one reader hold at a time? | stepper | library.desk_save_rules | B | yes | currentRules / DEFAULT_RULES.maxLoans=3 |
| `lib_renew_hold` | Renewals allowed, and days a reserved book waits on the hold shelf | stepper | library.desk_save_rules | B | yes | currentRules / DEFAULT_RULES maxRenewals=2, holdDays=3 |
| `lib_closures` | Extra days the library is closed, beyond school holidays | date | library.desk_save_rules | B | no | Holiday and Weekend rows (wizard + setup.apply_changes HOLIDAYS/WEEKENDS), bounded by wizard sessionStart/sessionEnd (src/lib/onboarding/setup-state.ts:55-78) |
| `lib_late_fines` | Do you charge late fines? | choice | library.desk_save_rules | C | yes | currentRules finePerDay/graceDays/fineCap (default 0); currency from LocalePolicy (src/lib/auth/register.ts:164-171) |
| `lib_lost_book` | When a book is lost, what is charged? | choice | library.desk_save_rules | C | yes | currentRules lostCharge (default 0); LocalePolicy currency |
| `lib_sections` | Which shelf sections do you use? | tags | library.category_create | A | yes | GET /api/subjects?campusId= names + existing BookCategory rows + common sections |
| `lib_first_titles` | Add the titles you have now (you can add more later) | grid (title, author, ISBN, copies, section) | library.book_create | A | no | existing Book rows for ISBN reconciliation (role-setup.ts:10) |
| `lib_copy_labels` | Do your books carry accession or barcode labels? | choice | library.desk_add_copies | B | yes | existing BookCopy count (none => No labels yet) |
| `lib_borrowers` | Who can borrow? | multi | library.member_create | B | yes | GET /api/classes (ACTIVE classes) + GET /api/memberships (active teachers/office staff) |
| `lib_member_numbers` | What should a member number be? | choice | library.member_create | B | yes | student admission numbers (GET /api/students) / staff codes; existing LibraryMember.memberNo pattern |
| `lib_purchase_list` | Books you need to buy this term (optional) | grid (title, quantity, estimated price) | purchasing.save_request | B | no | none |

**Auto-provisioned:**
- library.desk_save_rules: one versioned LibraryLoanPolicy with loanDays/maxLoans/maxRenewals/holdDays/closures from Q2-Q5 (class B, single confirm with preview hash); money fields stay 0 until approved
- library.category_create: shelf sections from Q8 (class A, duplicate name 409 reported as already there)
- library.book_create: catalogue titles with categoryId from Q9 (class A, ISBN duplicates merged not duplicated)
- library.desk_add_copies: barcoded copies from Q10, using existing labels or numbering from the given start number (class B)
- library.member_create: library members for pupils/staff who already have user accounts, chosen in Q11 with member numbers from Q12 (class B); users without accounts listed as not enrolled
- purchasing.save_request: purchase request saved as DRAFT from Q13 (class B, never auto-submitted)

**Remains as tasks:**
- Late-fine and lost-book charge amounts (Q6-Q7, class C): draft rule version routed to CAMPUS_ADMIN/ADMIN for approval; live policy keeps 0 until a separate approver confirms
- Submit the draft purchase request: librarian submits in Purchasing, then CAMPUS_ADMIN/ADMIN decides
- Pupils/staff without user accounts cannot become library members: CAMPUS_ADMIN/ADMIN creates accounts and invitations (rule 8)
- Overdue notices to families: CAMPUS_ADMIN/ADMIN or PRINCIPAL queues them via communications.queue_announcement (class C); librarian only drafts
- Fine waivers: CAMPUS_ADMIN/ADMIN only, with a reason (desk.ts:19,229)
- Back-filling open loans from a paper register: librarian does it at the desk by hand (desk issue dates loans today; legacy issue path must not be used)
- Catalogue import from a spreadsheet or photo: deferred to SKO-460 document intake
- Printing accession/barcode labels: librarian, outside the system
- Library opening hours: no field or adapter exists; product decision needed
- Migration from another library system: operator migration request (CAMPUS_ADMIN/ADMIN)

**Adapters needed:** `library.desk_save_rules`, `library.category_create`, `library.book_create`, `library.desk_add_copies`, `library.member_create`, `purchasing.save_request`, `library.desk_issue_copy`, `library.desk_return_copy`, `library.desk_renew_loan`, `library.desk_lookup_expire_holds`, `library.desk_mark_lost`, `library.desk_decide_charge`, `library.desk_reserve_title`, `library.book_update`, `chat.send_message`, `leave.apply`


---

# RECEPTIONIST

# RECEPTIONIST — first-login questionnaire and top free-form requests

**Working idea: "Move the paper notebook onto the desk in three minutes."** A receptionist's first day on Skoolee is a cutover, not a configuration job. Most of what the system needs (who they are, which campus, timezone, classes, the permission row) is already known. What it lacks is what currently sits in the desk notebook: callbacks still owed, parcels not handed over, enquiries being chased, complaints on paper, visitors still in the building, and the documents families keep asking for. Each question is a short structured card. Every row maps directly to one typed front-desk adapter, and next to the form a **Desk preview** shows the Today queue as it will look after the build. Structured rows go straight into adapter parameters without a model call, so they cost no AI credits and nothing is pseudonymised away. Only the optional "type or paste it instead" fallback calls OpenAI, and that is pseudonymised and charged per action.

Today this role gets no questionnaire. `launchPlan` sends it to `/ai?setup=1` (`src/lib/onboarding/launch-plan.ts:87-93`), where `AutomaticWorkspace roleSetup autoStart` (`src/components/school-ai/school-ai-workspace.tsx:380`) runs the free-chat interview `ROLE_SETUP_INTERVIEW.RECEPTIONIST` (`src/lib/automation/role-setup.ts`: "Ask front-desk priorities and whether I have existing calls to record… Do not fabricate historical calls"). The only executable tool is `front_desk.log_call` (`src/lib/automation/catalog.ts:37`). That is 2 of 93 capabilities reachable (B.roles).

## Known before asking (never ask again)

| Fact | Source (prefill) |
|---|---|
| Role RECEPTIONIST, campus | `StaffInvitation.role/campusId` (`prisma/schema.prisma:4965-4966`), copied to `User.campusId` on accept (`src/app/actions/invite.ts:332-345`). If campusId is missing, `needsCampus` blocks the role (`launch-plan.ts:93`); show "ask your campus admin", not the questionnaire |
| Full name, phone, CNIC, DOB, gender, address, city, joining date, designation, department, reports-to | Invite `profile` JSON (`src/lib/staff/invitation-schema.ts:2-17`), applied at accept (`src/app/actions/invite.ts:327-430`) |
| Preferred language | `User.preferredLanguage` (`prisma/schema.prisma:683`), else school locale (`LocalePolicy`, `src/lib/auth/register.ts:164-171`) |
| School timezone, weekends, active academic year | Wizard `completeSetup` (`src/lib/onboarding/setup-service.ts:382,419-425`). Timezone is required to parse "call back at 2pm" (`src/lib/front-desk/phone-calls.ts:96`) |
| Module grants | RCP row: front-desk VAED, admissions VAE., leave VA.., ai VA.., view on students/timetable/attendance/reports (`src/lib/permissions.ts:260-278`) |
| Desk features | `ROLE_NAV.RECEPTIONIST` (`src/lib/navigation/role-nav.ts:328-347`): Today, AI Workflows, Visitors, Pickup, Admissions, Complaints, Phone calls, Post, Documents, Messages, My leave |
| Front-office colleagues (valid owners for callbacks, post and complaints) | `GET /api/front-desk/postal?owners=1` and `/phone-calls?owners=1`. Owners can only be CAMPUS_ADMIN, ADMIN or RECEPTIONIST (`src/lib/front-desk/postal.ts:19,47-50`) |
| Classes (for "class interested") | `GET /api/classes?campusId=` |
| Existing open callbacks, post, complaints, visitors on site (to avoid duplicates) | C7 read lookups (`appendix-a…md:884`); `receptionistSummary` (`src/app/actions/dashboard.ts:1764`) |
| Existing certificate / ID-card templates | `GET /api/front-desk/certificates?campusId=`; kinds `STUDENT_CERTIFICATE`, `ID_CARD` (`src/lib/certificates/service.ts:19`) |
| Whether an admission form is published | `GET /api/admissions?forms=1`. `admissions.start_application` needs a published form |
| MFA status | Already handled by `/protect-account` in the auth flow; not a questionnaire item |

## Questions (11)

All answers are confirmed per key (`confirmedKeys`). The build is one job bound to `{questionnaireId, version}`. Card types are choice, multi, tags, and **rows**: a structured repeater with one adapter call per row, with columns that match the adapter schema, "+ add another", and a pre-ticked "nothing to add" so that skipping costs one tap. Free prose is never the main input.

| # | key | Prompt (EN) | Input | Drives | Class | Req. | Prefill |
|---|---|---|---|---|---|---|---|
| 1 | `language` | Which language should your desk use? | choice EN/AR/UR | `profile.update_own` | A | yes | `User.preferredLanguage` |
| 2 | `deskPhone` | Your desk phone number for staff and callers | text (phone mask) | `profile.update_own` (phone; adapter extension needed) | A | no | invite `profile.phone` |
| 3 | `deskDuties` | Which of these do you handle? | multi: visitors, pickup gate, enquiries and admissions, complaints, calls and callbacks, post and parcels, certificates and ID cards | none (decides which cards 4–10 appear; the layout preference has no store, see tasks) | none | yes | every nav view the RCP row can see, all ticked |
| 4 | `openCallbacks` | Any callbacks you still owe? | rows: caller, phone, in/out, when called, purpose, call back by, owner, sensitive? | `front_desk.call_log` (with callbackDue/callbackOwnerId) | A | no | owner = me; owner list from lookup |
| 5 | `openPost` | Post or parcels at the desk, not handed over yet | rows: in/out, date, from, to, courier, reference no., owner | `front_desk.postal_log` | A | no | owner = me; a duplicate open referenceNo is flagged before the build (service returns 409) |
| 6 | `openEnquiries` | Admission enquiries you are following up | rows: parent name, phone, email (optional), class interested (picker), source (walk-in/phone/website/referral/advert), note | `enquiries.create` | B | no | classes from lookup |
| 7 | `openComplaints` | Complaints written on paper that are still open | rows: type, complainant or "anonymous", phone, date, short description, confidential? | `front_desk.complaint_intake` | B | no | none. Confidential rows show "a campus leader will assign this" |
| 8 | `visitorsOnSite` | Anyone signed in on paper who is still on site? | rows: name, phone, purpose, host (staff picker), time in | `front_desk.visitor_check_in` | B | no | host picker from staff lookup; time in must be in the past (`visitors.ts` instant check) |
| 9 | `documentTypes` | Which documents do families ask the desk for? | multi: enrolment (bonafide) certificate, character certificate, school-leaving certificate, student ID card | `front_desk.certificate_template_save` (drafts using whitelisted `{{variables}}` only) | B | no | existing templates already ticked and locked ("already set up") |
| 10 | `documentLanguages` | Print them in which languages? | multi EN/AR/UR | `front_desk.certificate_template_save` (one draft per type × language) | B | no | school locale + #1 |
| 11 | `deskRoutine` | Your opening and closing checks | tags (suggested: overnight post, overdue callbacks, visitors still on site at close, pickup list, complaint due dates) | `personal.save_plan` (private checklist; outcome `plan_saved`, never "done") | A | no | suggestions follow the #3 duties |

The questionnaire does not ask for name, campus, role, timezone, classes, MFA, historical closed calls, closed visits or child pickup codes.

## Build outcome

Before anything runs, the review screen shows each row as a receipt-to-be, grouped by class. Class A rows run on Build. All class B rows are approved with one bound confirm (`pendingKey + previewHash + job.version`). After the build each row has a receipt link (call id, postal ref, enquiry id, complaint reference code, visit id, template draft id).

**autoProvisioned**
- `profile.update_own`: preferredLanguage (A). Phone needs the adapter extension.
- `front_desk.call_log`: one call log and its open callback per row, with the owner notified when it is not me (A). The adapter exists in partial form; `phoneCallSchema` lacks callbackDue/callbackOwnerId.
- `front_desk.postal_log`: one open item per row, owner notified (A).
- `enquiries.create`: one enquiry per row (B). The route is not idempotent, so the call goes through the automation receipt (AUTOMATIC_ACTION_V1 fingerprint replay).
- `front_desk.complaint_intake`: one case per row (B). Confidential rows return only a referenceCode, and the narrative is never fed back into AI context.
- `front_desk.visitor_check_in`: one ON_SITE visit per row (B). A namesake or duplicate 409 becomes an explicit choice.
- `front_desk.certificate_template_save`: draft templates per type × language (B). ID_CARD is always `requiresApproval`.
- `personal.save_plan`: private desk checklist (A, `plan_saved`).

**remainsAsTasks** (shown as "Waiting on others" with a named owner, never as done)
- Approve certificate and ID-card templates: CAMPUS_ADMIN/ADMIN via `front_desk.certificate_template_approve` (class C; no maker≠checker today).
- Publish and open the admission form if none is published: CAMPUS_ADMIN/ADMIN (`admissions.manage_form`). Until then, applications cannot start.
- Assign owners to confidential complaints: campus leader (`canManageCampusOps`, `complaints.ts:65`).
- Pickup custody / do-not-release restrictions: CAMPUS_ADMIN/ADMIN (`pickup.add_restriction`). The receptionist only reads them at the gate.
- Pupil fields missing for certificates (DOB, guardian and so on, from preview `missing[]`): CAMPUS_ADMIN (students module edit). The receptionist has students view only.
- Desk preferences (which cards appear on Today, desk hours, default callback window): no store exists, so this needs a product decision on a front-desk settings model.
- Phone and emergency phone on the profile, until `profile.update` covers phone: the user, via /account.
- Child-safety or health concerns from the paper notebook: the receptionist personally, via /care (`care.report_concern`). These are never entered in the questionnaire or by the AI.
- Closed historical visits and calls are not imported (ROLE_SETUP_INTERVIEW: "Do not fabricate historical calls"; visitor contacts are kept for 180 days, `visitors.ts`).

## Top requests (10)

| # | Request (as typed) | Capability keys | Class | Adapter today |
|---|---|---|---|---|
| 1 | "Mr. Khan is here to see the principal about his son's admission, sign him in" | `front_desk.visitor_check_in` (+ host resolved from staff lookup) | B | needed |
| 2 | "Sign out the AC technician, he left at 11:30" | `front_desk.visitor_check_out` | A | needed |
| 3 | (UR) "مسز فاطمہ کا فون آیا تھا، بیٹے کی چھٹی کے بارے میں، کل صبح دس بجے واپس کال کرنی ہے" | `front_desk.call_log` with callbackDue | A | partial (exists; no callback fields) |
| 4 | "The 2pm callback to Mrs. Siddiqui is done, she needs a call again Monday" | `front_desk.callback_complete` (nextDue), `front_desk.callback_reschedule` | A | needed |
| 5 | (AR) "وصل طرد من أرامكس برقم 55120 لمكتب مدير الفرع" | `front_desk.postal_log` (owner must be front office: CAMPUS_ADMIN/ADMIN/RECEPTIONIST) | A | needed |
| 6 | "New walk-in: parents want Grade 3 admission for their daughter, 0321-5550101" | `enquiries.create` (+ `enquiries.update` for follow-ups) | B | needed |
| 7 | "Start an application for this morning's Grade 3 enquiry and fill in what we know" | `admissions.start_application`, `admissions.save_answers` | B | needed |
| 8 | "Issue an enrolment certificate for Hamza Ali, 7B" | `front_desk.certificate_preview` (A read), `front_desk.certificate_issue`. If the template requires approval → PENDING_APPROVAL, outcome `awaiting_approval` with CAMPUS_ADMIN named | B | needed |
| 9 | "A parent complained the canteen food was cold, log it and give it to the admin" | `front_desk.complaint_intake`, `front_desk.complaint_assign` (non-confidential only) | B | needed |
| 10 | "Which callbacks are overdue and who owns them?" | read only: `GET /api/front-desk/phone-calls?view=overdue` (C7 lookup; `school.inspect` has no front-desk lookups today) | A (read, `answered`) | needed (lookup) |

Also likely: "Apply leave for me this Thursday" → `leave.apply` (B, needed). Also likely, and always refused with a deep link: "Ali's uncle is at the gate, let him take Ali" → `pickup.gate_release` requires in-person identity attestation and stays human-only. The AI opens Pickup › Gate and does nothing else.

## Adapters needed

`profile.update_own` (add phone), `front_desk.call_log` (add callbackDue/callbackOwnerId), `front_desk.postal_log`, `front_desk.visitor_check_in`, `front_desk.visitor_check_out`, `front_desk.callback_complete`, `front_desk.callback_reschedule`, `enquiries.create`, `enquiries.update`, `admissions.start_application`, `admissions.save_answers`, `front_desk.certificate_template_save`, `front_desk.certificate_preview`, `front_desk.certificate_issue`, `front_desk.complaint_intake`, `front_desk.complaint_assign`, `leave.apply`. Separately, `school.inspect` needs the C7 front-desk read lookups (visitors, phone-calls, postal, complaints, certificates, owners) so names can be resolved to ids.

Key deduplication: Appendix A lists certificates twice (`certificates.*` in C4 and `front_desk.certificate_*` in C7, B gaps l.963). Use `front_desk.certificate_*` as the canonical key.

Pattern for every adapter: `executeRoleAction` with `canManageFrontDesk` **plus** `assertWorkspacePermission('front-desk'|'admissions', action)` **plus** own campus, following `role-action-service.ts:17-18`. This matters because `canManageFrontDesk` alone admits PRINCIPAL (B.roles l.546). Pass `idempotencyKey` (pattern `[A-Za-z0-9-]{8,80}`) and read-then-pass `version` on every PATCH.

## Role-specific guardrails

- **ROLE_PURPOSE** (`catalog.ts`): "Receptionist: admissions/front-desk preparation and own profile. Never make academic or financial decisions." The receptionist therefore never decides admissions (`admissions.decide_application` and `admissions.enrol_applicant` are CAMPUS_ADMIN/ADMIN), never collects, waives or quotes fees as settled, and never touches attendance or timetable writes. Read-only grants (students, timetable, attendance, reports) are used for look-ups only.
- **Rule 5 (class C, no chat phrase alone):** sending a family message (`admissions.progress_application` request-info with familyMessage, `policies.escalate`, chat to guardians), granting access (`chat.add_members`, `service_desk.add_watcher`, `care.open_emergency_access`), moving money (`activities.record_fee`, `canteen.decide_order`) and releasing a child (`pickup.gate_release`) are never executed from chat. They are drafted with a deep link, or refused as human-only. A bare "yes" does nothing without the bound confirm.
- **Rule 8:** an enquiry or applicant is never a student. No student rows are created from enquiries, prose or scans, and certificate issue never edits pupil fields (missing fields become a task for the campus admin). Pickup codes are never echoed into chat or model context (`pickup.issue_authorization` note).
- **Rule 19:** RECEPTIONIST keeps zero `school.execute` operations (`access.ts:76`). Coverage grows only through role adapters with the same seat and permission checks; seats are never widened.
- **Privacy:** visitor phones, complaint narratives and certificate pupil data (DOB, guardian) are pseudonymised before any prompt. Confidential complaints return only a referenceCode to non-leaders, and the AI never reads the narrative back. Safeguarding reports go only through /care, typed by the human.
- **Honest outcomes:** a callback logged means "callback open, due at X, owner Y", not "parent called back". A certificate pending approval is `awaiting_approval`. Post is "delivered" only with evidence text; a tracking number alone is never delivery (`postal.ts:14`). Handover is a physical attestation and stays human-only (`front_desk.postal_advance` handover).
- **Copy fix:** the receptionist build must not inherit the "nothing applies until you approve" promise. The review screen states per class what runs on Build (A) and what runs after the bound confirm (B).
- **Surfaces:** shared design-system primitives only. The rows repeater must work on a counter tablet (large targets) and on desktop with the keyboard (Enter adds a row). EN/AR/UR with RTL, phone, tablet and desktop. Reuse SKO-470's run lifecycle for receipts and SKO-460's conversation surface for the typed fallback. Voice and document intake stay deferred to SKO-460.


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `language` | Which language should your desk use? | choice | profile.update_own | A | yes | User.preferredLanguage (prisma/schema.prisma:683), else LocalePolicy (src/lib/auth/register.ts:164-171) |
| `deskPhone` | Your desk phone number for staff and callers | text | profile.update_own | A | no | StaffInvitation.profile.phone (src/lib/staff/invitation-schema.ts:4; applied src/app/actions/invite.ts:327-345) |
| `deskDuties` | Which of these do you handle? | multi |  | none | yes | ROLE_NAV.RECEPTIONIST views visible under the RCP permission row (src/lib/navigation/role-nav.ts:328-347; src/lib/permissions.ts:260-278) |
| `openCallbacks` | Any callbacks you still owe? | rows | front_desk.call_log | A | no | owner = current user; owners from GET /api/front-desk/phone-calls?owners=1; timezone from School.timezone (setup-service.ts:382) |
| `openPost` | Post or parcels at the desk, not handed over yet | rows | front_desk.postal_log | A | no | owner = current user; owners from GET /api/front-desk/postal?owners=1; open items for duplicate referenceNo check |
| `openEnquiries` | Admission enquiries you are following up | rows | enquiries.create | B | no | class picker from GET /api/classes?campusId=; existing enquiries from GET /api/admission-queries for dedupe |
| `openComplaints` | Complaints written on paper that are still open | rows | front_desk.complaint_intake | B | no | none |
| `visitorsOnSite` | Anyone signed in on paper who is still on site? | rows | front_desk.visitor_check_in | B | no | host picker from campus staff lookup; ON_SITE list from GET /api/front-desk/visitors?status=ON_SITE for dedupe |
| `documentTypes` | Which documents do families ask the desk for? | multi | front_desk.certificate_template_save | B | no | existing templates from GET /api/front-desk/certificates?campusId= (locked as already set up) |
| `documentLanguages` | Print them in which languages? | multi | front_desk.certificate_template_save | B | no | school LocalePolicy language plus answer to language |
| `deskRoutine` | Your opening and closing checks | tags | personal.save_plan | A | no | suggested tags derived from deskDuties |

**Auto-provisioned:**
- profile.update_own: preferredLanguage (and desk phone once the adapter covers phone) - class A
- front_desk.call_log: one call log + open callback per row, owner notified - class A
- front_desk.postal_log: one open postal item per row, owner notified - class A
- enquiries.create: one admission enquiry per row via automation receipt (route not idempotent) - class B
- front_desk.complaint_intake: one complaint case per row; confidential rows return referenceCode only - class B
- front_desk.visitor_check_in: one ON_SITE visit per row; namesake/duplicate 409 becomes an explicit choice - class B
- front_desk.certificate_template_save: draft certificate/ID-card templates per type x language - class B
- personal.save_plan: private desk opening/closing checklist (outcome plan_saved) - class A

**Remains as tasks:**
- Approve certificate and ID-card templates - CAMPUS_ADMIN/ADMIN via front_desk.certificate_template_approve (class C)
- Publish/open the admission form if none is published - CAMPUS_ADMIN/ADMIN via admissions.manage_form
- Assign owners to confidential complaints - campus leader (canManageCampusOps)
- Pickup custody/do-not-release restrictions - CAMPUS_ADMIN/ADMIN via pickup.add_restriction (receptionist reads only)
- Fill pupil fields missing for certificates - CAMPUS_ADMIN (students edit); receptionist has view only
- Desk preferences (Today layout, desk hours, default callback window) - no store exists; product decision on a front-desk settings model
- Profile phone/emergency phone until profile.update covers phone - the user via /account
- Child-safety or health concerns from the paper notebook - receptionist personally via /care (care.report_concern), never AI
- Closed historical visits and calls are not imported (no fabricated history)

**Adapters needed:** `profile.update_own`, `front_desk.call_log`, `front_desk.postal_log`, `front_desk.visitor_check_in`, `front_desk.visitor_check_out`, `front_desk.callback_complete`, `front_desk.callback_reschedule`, `enquiries.create`, `enquiries.update`, `admissions.start_application`, `admissions.save_answers`, `front_desk.certificate_template_save`, `front_desk.certificate_preview`, `front_desk.certificate_issue`, `front_desk.complaint_intake`, `front_desk.complaint_assign`, `leave.apply`


---

# STUDENT

# STUDENT: first-login questionnaire and top free-form requests

Scope: the STUDENT role (console `student`, base `/student`, `src/lib/navigation/role-nav.ts:389-411`). Read-only design built on Appendix B (B.roles, B.typedOps, B.ui, B.decisions) and Appendix A. Nothing in the repository was changed.

**Role facts that drive the design**
- **Module grants** (`src/lib/permissions.ts:110-128` plus the ai override at l.221): view-only on students, fees, attendance, timetable, exams and reports; `ai` view and add. There is no add, edit or delete on any school module.
- **Navigation checklist** (the coverage target): Today · AI Workflows · My online exams · Work · Timetable · Results · Messages · Study help · Portfolio & goals · Attendance · My class & subjects · Fees · Support plan · Record corrections.
- **Typed operations:** none. STUDENT is not in `SCHOOL_AI_STAFF_ROLES` (`src/lib/school-ai/access.ts:13`), so `catalog.ts:38` returns before capabilities are read, and `school.execute` and `school.inspect` are never offered. The seat rules (principal and accountant seats) do not apply.
- **Engine tools today:** `profile.update` and `personal.save_plan` only (`src/lib/automation/catalog.ts:29,36`).
- **Appendix A:** 37 write capabilities list STUDENT. One is reachable today: `profile.update_own`, partially.
  - Student-only rows: portfolio (3), pathways (6), `accommodations.record_rehearsal`, assignments learner flow (4), study (4).
  - Shared rows: chat (12), notifications (2), policies (3), uploads (2).
  - Not inventoried: `/ai/exams` (`src/app/api/school-ai/exams/[id]/attempt`, `practice`).
  - Record corrections is read-only for families. `isFamily` users see only APPLIED history and cannot request (`src/lib/corrections/service.ts:270,306`).
- **ROLE_PURPOSE** (`catalog.ts:24`): "Student: own learning and personal preferences only; never change school structure or other users."
- **Routing gap:** `requiredOnboardingPath` (`src/lib/onboarding/launch-plan.ts:114-118`) never routes a STUDENT anywhere. The only first-run entry is the `roleSetup` launch task to `/ai?setup=1` (`launch-plan.ts:85-92`). That opens a free-text interview (`src/lib/automation/role-setup.ts`, STUDENT line) whose only outputs are a language change and a private plan.

## Known before asking

Never ask for any of these again. Show them as read-only facts on the questionnaire's first card ("This is what your school set up for you"). If something is wrong, the answer is "Tell your class teacher or the office", never an edit.

| Fact | Source (prefill) | Notes |
|---|---|---|
| Full name, email/login, preferred language | `User` (`prisma/schema.prisma:683` preferredLanguage; `welcomeCompletedAt` l.721) | The language is prefilled into Q1. The name is **not editable here**: `PATCH /api/profile` for STUDENT also rewrites student rows that match the old fullName (Appendix A `profile.update_own`, route l.155-167). |
| Account came from the school's roster invitation | `src/lib/students/create.ts:305,384` (student/guardian invitations created with the student record); first password `PUT /api/auth/first-password`; welcome `POST /api/auth/welcome` | The questionnaire starts after first-password and welcome. It never touches credentials or MFA. |
| Campus, class, section, roll number, gender, date of birth, linked parent | `Student` via `studentUserId` (`schema.prisma` model Student l.15-32); `learnerOf` `src/lib/study/assistant.ts:28` | School-owned placement. The DB trigger `pupil_identity_guard` blocks changes outside enrolment review. |
| Subjects and subject teachers of my class | `getStudentDashboardData` `src/app/actions/dashboard.ts:1398`; `src/app/student/student-data-context.tsx` | Prefills the options of Q2. |
| Weekly timetable (school hours) | `/student/timetable` data; published timetable of the class | Greys out school hours in Q3. |
| Academic year, term dates, weekends, holidays | Wizard `completeSetup` `src/lib/onboarding/setup-service.ts:419-425`; LocalePolicy (`src/lib/auth/register.ts:164-171`) | Bounds every plan date. |
| Upcoming exams and work due | `src/app/student/exam-timeline`; `listAssignments` `src/lib/assignments/service.ts:147` | Prefills Q4. |
| Active support plan (access arrangements) | `learnerView` `src/lib/accommodations/service.ts:122` | Only shows whether a plan exists. Supporting records are confidential and never go to a prompt. |
| Existing goals and campus counsellors | `pathwayOverview` `src/lib/pathways/service.ts:270` | Skip Q6–Q8 when a goal already exists. Hide Q9 when the campus has no designated counsellor. |
| Work eligible for the portfolio | `eligibleEvidence` `src/lib/portfolio/service.ts:63` | Hide Q10 when nothing has been returned with feedback. |
| Approved study collection | `studyCollection` `src/lib/study/assistant.ts:51` | Context for the study plan. Read only. |
| Who I may message | `ChatSettings` (`schema.prisma` ~6294: studentToStudent, studentToSupport) | School-level policy. Never asked. |

## Questions

Design intent: about 90 seconds on a phone, one question per card, choices before text. Every answer previews the record it will create, and the build screen shows a receipt per record. Q6–Q10 are conditional. The flow ends on a single "Set up my space" step. Class A items run on that step; each class B item gets its own bound confirm card (preview hash, version and idempotency key), never a bare "yes".

| # | key | prompt (EN) | input | drives | class | req. | prefill |
|---|---|---|---|---|---|---|---|
| 1 | `language` | Which language should Skoolee use with you? | choice (English / العربية / اردو), switches RTL live | `profile.update_own` (engine tool `profile.update`, field preferredLanguage only) | A | yes | `User.preferredLanguage`, else the school LocalePolicy |
| 2 | `focusSubjects` | Which subjects do you want help with first? | multi (chips from my class subjects, max 4) | `personal.save_plan` (plan scope); context for `study.ask` | A | yes | class subjects (`dashboard.ts:1398`) |
| 3 | `studyTimes` | When can you study outside school? | schedule-grid (Mon–Sun × after-school slots; school hours and weekends locked) | `personal.save_plan` (step due dates) | A | yes | timetable plus campus weekends |
| 4 | `planTarget` | What should your plan get you ready for? | choice (next exam: {name, date} / work due this week / steady daily revision) | `personal.save_plan` (goal and horizon) | A | yes | exam timeline and `listAssignments` |
| 5 | `planLeadDays` | How many days before a deadline do you want to start? | stepper (1–7, default 3) | `personal.save_plan` (step dueDate offsets) | A | no | 3 |
| 6 | `termGoal` | One goal for this term? | choice of suggested chips built from Q2/Q4 ("Raise Maths to 80%") plus text as a last resort | `pathways.save_goal` | A (private by default) | no | existing goal, if any (then skip) |
| 7 | `goalAudience` | Who can see this goal? | multi (Only me / My counsellor / My parent) | `pathways.save_goal` (audience COUNSELLOR / GUARDIAN) | B (sharing changes who sees it) | no (default Only me) | Only me |
| 8 | `goalFirstStep` | Your first step, and by when? | choice from suggested steps plus date (inside the term) | `pathways.add_action` (owner STUDENT) | A | no | the first study-time slot from Q3 |
| 9 | `counsellorMeeting` | Would you like to meet a counsellor? | choice (Not now / Pick a time → slot picker of designated counsellors) | `pathways.request_appointment` (the counsellor confirms) | B | no | campus counsellors from `pathwayOverview`; hidden if none |
| 10 | `portfolioPick` | Add one piece of returned work you are proud of to your portfolio? | choice (cards of eligible work) plus a one-line reflection in my own words | `portfolio.create_entry` (teacher review follows) | B | no | `eligibleEvidence`; hidden if empty |

Not asked, on purpose:
- Name, class, roll number, subjects taken: school-owned.
- Reminder channel and quiet hours: no per-user notification-preference adapter.
- Display and reading preferences: no adapter.
- Guardian links and sharing with classmates: access grants.
- Exam access arrangements: decided by the principal or admin (`accommodations.save_plan`).

## Build outcome

**autoProvisioned** (created from confirmed answers, in this order, each with a receipt):
1. `profile.update_own`: preferredLanguage set (class A). The adapter exists as `profile.update`, restricted to the language field for STUDENT.
2. `personal.save_plan`: one private "My study plan" with ≤30 steps. Steps are slots from Q3, filtered to Q2 subjects, aimed at Q4, and offset by Q5 (class A). The adapter exists.
3. `pathways.save_goal`: the term goal, private (class A). It is re-saved with the Q7 audience only after the class B confirm.
4. `pathways.add_action`: the first step with a due date (class A).
5. `pathways.request_appointment`: a REQUESTED appointment. Confirmed in chat (B); the outcome is "requested", not "booked", until the counsellor confirms.
6. `portfolio.create_entry`: an entry with the student's own reflection. Confirmed in chat (B); the outcome is "sent for teacher review".

**remainsAsTasks** (shown on the build screen with the person who acts):
- **Wrong name, class, roll or subject:** class teacher or office (CAMPUS_ADMIN/ADMIN through enrolment review; RECEPTIONIST can record the request). Students cannot request corrections (`corrections/service.ts:306`).
- **Run the support-plan practice check:** the student, by hand at `/student/access`. `accommodations.record_rehearsal` stores settings computed from a real practice run, so chat cannot run it.
- **Linking a parent account:** the school office invites; the guardian accepts with the invited email. Automation never grants guardian access.
- **Notification and reminder preferences, quiet hours:** no user-preference adapter yet (needs a new field plus adapter; owner: product). Today chat quiet hours are school-level `ChatSettings` (ADMIN).
- **Reading and display preferences** (text size, dyslexia-friendly font): no adapter; same owner.
- **Per-learner AI credit cap:** ADMIN or school owner policy. Student AI actions draw on the school's credit pool.
- **Counsellor confirms the appointment:** designated counsellor (`pathways.update_appointment`).
- **Teacher reviews the portfolio entry:** subject teacher (`portfolio.reviewEntry`).
- **Leave or absence for tomorrow:** the parent (`family.request_leave` is PARENT-only); a student cannot file it.

## Top requests

"Exists today" comes from the Appendix A coverage column, plus the engine tool list in `catalog.ts`.

| # | Request (as typed) | Capability key(s) | Class | Adapter today |
|---|---|---|---|---|
| 1 | "What homework is due this week?" | `read.student.assignments` (`listAssignments`, `assignments/service.ts:147`) | A (read; honest outcome "answered") | **Needed** (read adapter) |
| 2 | "Make me a revision plan for my maths test on Monday" | `personal.save_plan` | A | **Exists** |
| 3 | "Submit my science assignment" | `assignments.save_learner_draft`, `assignments.submit` | B (the preview shows the exact draft version, the late policy and that a resubmit needs the teacher) | **Needed** (both are `direct` services) |
| 4 | "Explain photosynthesis from my class notes" | `study.ask` (credits; blocked during an active exam; citations only) | A | **Needed** (wrap `study/assistant.ts:95`; do not duplicate it) |
| 5 | "I still don't get fractions, ask my teacher for help" | `study.request_help` (notifies the class teacher once) | B | **Needed** (`wrapper`) |
| 6 | "Book a meeting with the counsellor next Tuesday at 11" | `pathways.request_appointment` | B | **Needed** |
| 7 | Urdu: "میری اس مہینے کی حاضری کتنی ہے؟" ("What is my attendance this month?") | `read.student.attendance` | A (read) | **Needed** (read adapter) |
| 8 | Arabic: "أضف هدفاً: أريد أن أرفع درجتي في الرياضيات إلى ٨٠٪ قبل الامتحانات النهائية" ("Add a goal: I want to raise my maths mark to 80% before the final exams") | `pathways.save_goal`, `pathways.add_action` | A (private) / B (if shared) | **Needed** |
| 9 | "Message Ms. Sara that I couldn't open the worksheet" | `chat.start_direct`, `chat.send_message` (own teachers; school `ChatSettings` respected) | B (the draft is shown; the student sends) | **Needed** |
| 10 | "Change my language to Urdu" | `profile.update_own` | A | **Exists** (partial) |

Refused or deep-linked (not counted as adapters):
- "Start my online exam" or "answer my test": deep-link to `/ai/exams`. The AI never opens, answers or submits an exam attempt.
- "Pay my fee": fees are view-only for students; route to the parent or the office.
- "Change my marks" or "mark me present": refuse and name the owner.
- "Write my essay": the AI coaches. Submitted text must be the student's own words, quoted verbatim as evidence.

## Adapters needed

**Writes:** `pathways.save_goal`, `pathways.add_action`, `pathways.request_appointment`, `portfolio.create_entry`, `assignments.save_learner_draft`, `assignments.submit`, `study.ask`, `study.request_help`, `chat.start_direct`, `chat.send_message`.

**Read adapters** (not in Appendix A, which lists writes only; still needed for honest answers): `read.student.assignments`, `read.student.attendance`.

**Existing, needs tightening:**
- `profile.update` for STUDENT must drop `fullName`, so a student cannot rename their school record through the old-name rewrite.
- `personal.save_plan` must accept date-bound steps generated from the schedule grid.

**Engine change:**
- `automaticCatalog` must add a family branch (the role check at `catalog.ts:38`) that offers these student adapters without `assertSchoolAiAccess`, which refuses families.
- Every adapter re-resolves `ownStudent(user)` itself and never takes a studentId from the model.

## Role-specific guardrails

- **ROLE_PURPOSE (`catalog.ts:24`):** own learning and personal preferences only; never change school structure or other users.
  - Every adapter is keyed to the caller's own Student row (`ownStudent` / `learnerOf`) and re-checks role, campus and accessVersion on each write.
  - No adapter accepts a studentId, classId or another userId chosen by the model.
- **Rule 19 (role ceiling):** STUDENT touches only its own preferences, private plans and the learner flows the product already gives it (draft or submit own work, own goals, own portfolio, own study questions, own messages).
  - It never gets `school.execute` or `school.inspect`, and never any staff operation.
  - Name, class, roll, enrolment, marks, attendance, fees and support-plan settings are read-only. The AI names who changes them.
- **Rule 5 (no chat phrase alone):** a student phrase never publishes, never moves money, never sends a family message and never grants access.
  - Messages to teachers, help requests, counsellor requests, portfolio shares, goal sharing and assignment submission are class B. They need a bound confirm card (pendingKey + previewHash + job version); a typed or spoken "yes" does nothing.
  - `chat.add_members` and `chat.remove_member` (ACCESS_GRANT) are never exposed to STUDENT.
- **Rule 8 (no silent account or guardian changes):** the questionnaire never invites, links or verifies a parent and never touches login, MFA or sessions. Credential flows (`auth.change_password`, `account.manage_mfa`) are never automated.
- **Exam and academic integrity:**
  - While the student has an in-progress online exam attempt, all student AI actions are BLOCKED, mirroring `study.ask`.
  - The AI never authors submitted work. Draft and submit content must be the student's verbatim text (`evidenceQuote`).
  - `/ai/exams` is deep-link only.
- **Honest outcomes:** a read is "answered"; a plan is "plan saved". A counsellor request is "requested", a portfolio entry "sent for review", help "teacher notified". Never "done" for something another person still decides.
- **Privacy (minors):**
  - Pseudonymise the student's and teachers' names before every prompt.
  - Do not mask class or subject names as `[PERSON_n]` (an engine defect), or the plans become useless.
  - Support-plan records, counselling notes and medical fields never enter a prompt.
- **Credits and UI:**
  - Each AI action is charged to the school pool under the school lock. Show the student a neutral "AI is paused" message on a 402.
  - Use shared design-system primitives only, in EN, AR and UR with RTL, phone-first.


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `language` | Which language should Skoolee use with you? | choice | profile.update_own | A | yes | User.preferredLanguage (prisma/schema.prisma:683), else school LocalePolicy |
| `focusSubjects` | Which subjects do you want help with first? | multi | personal.save_plan, study.ask | A | yes | Class subjects via getStudentDashboardData (src/app/actions/dashboard.ts:1398) |
| `studyTimes` | When can you study outside school? | schedule-grid | personal.save_plan | A | yes | Class timetable (school hours locked) + campus weekends (setup-service.ts:425) |
| `planTarget` | What should your plan get you ready for? | choice | personal.save_plan | A | yes | Exam timeline (src/app/student/exam-timeline) and listAssignments (src/lib/assignments/service.ts:147) |
| `planLeadDays` | How many days before a deadline do you want to start? | stepper | personal.save_plan | A | no | default 3 |
| `termGoal` | One goal for this term? | choice | pathways.save_goal | A | no | pathwayOverview existing goals (src/lib/pathways/service.ts:270); suggestions from focusSubjects/planTarget |
| `goalAudience` | Who can see this goal? | multi | pathways.save_goal | B | no | Only me |
| `goalFirstStep` | Your first step, and by when? | date | pathways.add_action | A | no | First studyTimes slot within the term dates |
| `counsellorMeeting` | Would you like to meet a counsellor? | choice | pathways.request_appointment | B | no | Designated campus counsellors from pathwayOverview; hidden if none |
| `portfolioPick` | Add one piece of returned work you are proud of to your portfolio? | choice | portfolio.create_entry | B | no | eligibleEvidence (src/lib/portfolio/service.ts:63); hidden if empty |

**Auto-provisioned:**
- profile.update_own: preferredLanguage set from Q1 (class A, adapter exists as profile.update, language-only for STUDENT)
- personal.save_plan: private 'My study plan' with dated steps from Q2-Q5 (class A, adapter exists)
- pathways.save_goal: private term goal from Q6; audience from Q7 applied only after class B confirm
- pathways.add_action: first step with due date from Q8 (class A)
- pathways.request_appointment: REQUESTED counsellor appointment from Q9 after class B confirm (outcome 'requested', counsellor confirms)
- portfolio.create_entry: portfolio entry with student's own reflection from Q10 after class B confirm (outcome 'sent for teacher review')

**Remains as tasks:**
- Wrong name/class/roll/subjects -> class teacher or office (CAMPUS_ADMIN/ADMIN via enrolment review); families cannot request corrections (src/lib/corrections/service.ts:306)
- Support-plan practice check (accommodations.record_rehearsal) -> student completes by hand at /student/access; needs a real practice run
- Link parent account -> school office invites, guardian accepts with invited email; automation never grants guardian access
- Reminder channel / quiet hours / notification preferences -> no per-user preference adapter (product to add field + adapter); school-level ChatSettings owned by ADMIN
- Reading/display preferences (text size, dyslexia font) -> no adapter; product
- Per-learner AI credit cap -> ADMIN / school owner policy (student actions draw on school credit pool)
- Counsellor confirms appointment -> designated counsellor (pathways.update_appointment)
- Teacher reviews portfolio entry -> subject teacher (portfolio reviewEntry)
- Leave/absence requests -> PARENT only (family.request_leave)

**Adapters needed:** `pathways.save_goal`, `pathways.add_action`, `pathways.request_appointment`, `portfolio.create_entry`, `assignments.save_learner_draft`, `assignments.submit`, `study.ask`, `study.request_help`, `chat.start_direct`, `chat.send_message`, `read.student.assignments`, `read.student.attendance`


---

# PARENT

# PARENT — first-login questionnaire and top free-form requests

Read-only design, 2026-10-23. Built on Appendix B (B.roles, B.typedOps, B.ui, B.decisions) and on the Appendix A rows whose roles include PARENT. I checked a few code facts directly; they are cited inline.

## 0. What the role can do today (the coverage checklist)

**Navigation** (`src/lib/navigation/role-nav.ts:366-386`, B.roles §c):
- Home
- AI Workflows (`ai` + `schoolAi`)
- Fees (`fees`)
- Attendance (`attendance`)
- Results (`reports`)
- Messages
- Meet a teacher (no gate)
- Timetable & exams (`timetable`)
- Homework & resources (`timetable`)
- Activities & trips (no gate)
- Pickup & transport (`pickupGuardian`)
- Canteen (`pkgCanteen`)
- Support plans (`accessPlans`)
- Record corrections (`corrections`)

**Module grants (V2 defaults):**
- View only (`V...`): students, fees, attendance, timetable, exams, reports.
- `ai` is `VA..`.
- Every other module is `....`.
- `isFamilyRole` is true, so `assertSharedModuleRead` passes for this role.

**Typed operations:**
- None. `schoolAiOperationsFor` returns an empty set for PARENT (`src/lib/school-ai/access.ts:76`).
- The engine offers only `profile.update` and `personal.save_plan` (`catalog.ts:29,36`).
- PARENT runs no typed `school.execute` operation. Seat rules do not apply because a parent holds no seat.
- The `/ai` page sends PARENT to the personal `AutomaticWorkspace` behind `ai.view` (`src/app/ai/page.tsx:18-30`), not `SchoolAIWorkspace`.

**PARENT write rows in Appendix A** (about 48). AI coverage is "none" for all of them except `profile.update_own`, which is partial. Reuse is mostly **direct**:

| Area | Capability keys | Service |
|---|---|---|
| Absence and leave | `family.request_leave`, `family.update_leave`, `parent.explain_absence` | `src/lib/family/leave.ts:34,51`, `src/lib/attendance/register.ts:178 submitExplanation` |
| Meetings | `family.meeting` (book/reschedule/cancel/action-done), `meetings.family_cancel` | `src/lib/meetings/service.ts:287 bookMeeting`; the route also calls `notifyParty`, and an adapter must do the same |
| Trips and activities | `family.trip_consent`, `family_activities.request_place/answer_offer/withdraw`, `family.activity_place` | `src/lib/family/trips.ts:180 answerTrip`, `src/lib/activities/service.ts:126 requestPlace` |
| Pickup | `pickup.issue_authorization`, `pickup.reissue_code`, `pickup.revoke_authorization` | `src/lib/pickup/service.ts:52,84,92`. Day passes only: a window of 12 hours or less, at most 14 days ahead. There is no standing authorisation. |
| Canteen | `canteen.set_spend_limit`, `canteen.record_dietary`, `canteen.place_order`, `canteen.decide_order` | `src/lib/campus-packages/service.ts:165,172` |
| Money | `fees.start_online_payment` | Wrapper. Settles only via webhook; never auto-complete. |
| Communication | `communications.set_guardian_channel_preference`, `chat.start_direct`, `chat.send_message`, `chat.*`, `policies.ask/feedback/escalate`, `notifications.mark_read/open` | `src/lib/school-ai/announcement-preferences-service.ts:25`, chat service |
| Access and consent | `parent.accept_invitation`, `family.transfer_consent`, `data_lifecycle.request_export`/`download_export` | |
| Own account | `profile.update_own`, `uploads.*`, `auth.*`, `account.manage_mfa` | Credential flows are never automated |

**Read-only lookups.** These are GET routes; Appendix A lists write capabilities only.
- `/api/parent/{attendance,timetable,exam-datesheet,exam-results,exam-timeline,exam-brief,result-notes,learning-actions,inbox,data}`
- `/api/family/{digests,care-messages,transport,trips,leave,meetings,activities}`
- `?view=family` on `/api/campus-packages`
- `guardianPickups` (`pickup/service.ts:102`)
- `guardianTrips` (`family/trips.ts:155`)
- `guardianDigests` (`family/digests.ts:189`)

**Per-child rights gate every one of these.** `GUARDIAN_PERMISSION_KEYS` = learningRecords, attendance, finances, communication, pickup. `GUARDIAN_CONSENT_KEYS` = medicalTreatment, fieldTrips, mediaPublication, offsiteTravel (`src/lib/parent/guardian-permissions.ts:1-2`). Unknown or missing rights resolve to denied (l.19).

**Today's PARENT setup interview** (`src/lib/automation/role-setup.ts:13`) asks for language, family support goals and available time. It saves the language and a private checklist and nothing else. In practice PARENT reaches 1 of 48 capabilities.

## 1. Known before asking (never ask again)

Parents skip the institution wizard, which is for SUPER_ADMIN/ADMIN only (B.ui A1–A2). Their account is created by staff: `students.create` with `inviteAccounts` (Appendix A row 232), or `guardians.change_access`.

| Fact | Source (prefill) |
|---|---|
| Full name, email, phone, city, emergency phone, preferred language, campus | `User` (`prisma/schema.prisma:670-720`: `preferredLanguage` l.683, `campusId` l.690, `phone` l.699, `city` l.713, `emergencyPhone` l.718) |
| Linked children, the relationship ("Mother", "Father", …), and status ACTIVE/INVITED/REVIEW_REQUIRED | `GuardianRelationship` (`schema.prisma:1422`) via `resolveParentScope` (`src/lib/parent/resolve-child.ts:51`) and `currentGuardianRelationship` (`src/lib/parent/guardian-access.ts:9`) |
| What this parent may see or do for each child (rights and consent authority) | Latest `GuardianAccessVersion.permissions`, parsed by `parseGuardianPermissions` (`guardian-permissions.ts:19`) |
| Pending invitations to accept | `GET /api/parent/invitations` (status INVITED, email match, not expired) |
| Each child's class, timetable, homework, exam datesheet and results | `/api/parent/timetable`, `/api/parent/exam-datesheet`, `/api/parent/exam-results` |
| Absences and late marks that have no explanation yet | `/api/parent/attendance` (rows inside the explain window) |
| Trip consent requests that are still open | `guardianTrips` (`src/lib/family/trips.ts:155`) |
| Open meeting windows of the child's teachers | `meetings` service (windows opened by `meetings.open_window`) |
| Transport route and stop | `GET /api/family/transport` |
| Whether canteen is enabled, the current daily limit, dietary record | `familyCanteen` (`/api/campus-packages?view=family`) |
| Current WhatsApp/email channel preference | `listChannelPreferences` (`announcement-preferences-service.ts:17`) |
| School timezone, currency, weekend | `getLocalePackage(schoolId, campusId)` |
| Whether families may message support staff, and quiet hours | `chat_settings.parentToSupport`, `quietHours*` (`schema.prisma:~6295-6308`) |

**Design rule:** the first screen is a "Here is what the school already set up for you" card that lists the children, rights, class and campus. It is read-only, with nothing to type.

## 2. Questions

Twelve questions in total. Seven are always asked (Q1–Q7). Five appear only when the data calls for them: Q8 and Q9 when pickup or canteen applies, and Q10–Q12 when there are open items. Interaction model:
- One question per screen on a phone, with child chips across the top.
- Each per-child answer is shown under that child's name and photo initial.
- Every answer shows a live "What this will set up" receipt line.
- Class B answers collect into one confirm sheet at the end: exact previews and one bound confirm per item.
- Class C items open the native control and are never auto-approved.

| # | key | Prompt (EN) | Input | Drives | Class | Req. | Prefill |
|---|---|---|---|---|---|---|---|
| 1 | `pendingInvitations` | "The school invited you as a guardian for these children. Review each one." | invitation cards with the native Accept / Not me buttons | `parent.accept_invitation` | C | yes, if any | `GET /api/parent/invitations` |
| 2 | `childrenCheck` | "Are these your children and classes?" | choice: All correct / Something is wrong / A child is missing | `chat.start_direct`, `chat.send_message` (to the campus office, only when the answer is not "All correct") | B | yes | `resolveParentScope` children and relationships |
| 3 | `language` | "Which language should Skoolee use with you?" | choice: English / العربية / اردو | `profile.update_own` | A | yes | `User.preferredLanguage` |
| 4 | `contactPhone` | "Is this the best number for the school to reach you?" | choice Yes/Change, then a phone field | `profile.update_own` (phone field) | B | yes | `User.phone`, else `GuardianRelationship.phone` |
| 5 | `updatesChannel` | "How should school updates reach you?" | choice: In the app only / App + WhatsApp on {phone} | `communications.set_guardian_channel_preference` (opt-out only from the parent) | B | yes | `listChannelPreferences` |
| 6 | `familyGoals` | "What would you like help keeping on top of?" | multi: Homework, Attendance, Fees and due dates, Exams and results, Reading, Trips and activities | `personal.save_plan` (private family checklist and Home order) | A | yes | none |
| 7 | `availability` | "When are you usually free for school meetings or calls?" | schedule-grid (school weekdays × morning/after school/evening) | `personal.save_plan`; prefills `family.meeting` | A | no | school weekend from `getLocalePackage` |
| 8 | `pickupHelpers` | "Besides you, who sometimes collects {child}?" (only if the `pickup` right is held) | tags: name + relationship, with no ID number | `personal.save_plan` (saved helpers); later `pickup.issue_authorization` per day | A | no | none |
| 9 | `canteenSetup` | "Daily canteen limit and any food allergies for {child}" (only if canteen is enabled) | stepper (amount in the school currency) + multi over a fixed allergen list + optional diet | `canteen.set_spend_limit`, `canteen.record_dietary` | B | no | `familyCanteen` current limit and dietary record |
| 10 | `meetTeacher` | "Would you like a short meeting with {child}'s class teacher?" | choice per child: Yes, book the first free slot / Not now | `family.meeting` (book) | B | no | open windows ∩ `availability` |
| 11 | `openAbsences` | "{child} was absent on {date} with no reason given. What happened?" (only if any are open) | choice (Ill / Family reason / Travel / Other), text only for Other | `parent.explain_absence` | B | no | `/api/parent/attendance` |
| 12 | `openConsents` | "{trip} on {date} needs your answer." (only if any are open) | consent card with the native Allow / Do not allow controls, bound to the trip version | `family.trip_consent` | C | no | `guardianTrips` |

What each question does with its answer:

- **Q1 (`pendingInvitations`).** The answer is the parent's own tap on the existing control, bound to the relationship id and the email match. The AI never accepts on the parent's behalf (rule 8).
- **Q2 (`childrenCheck`).** A "Something is wrong" or "A child is missing" answer drafts a message to the campus office for confirmation. It never edits a guardian link.
- **Q4 (`contactPhone`).** The automation `profile.update` covers only fullName, preferredLanguage and city (Appendix A row 169), so the adapter must be extended to cover phone. The school's guardian-record phone is staff-owned and becomes a task.
- **Q5 (`updatesChannel`).** `saveChannelPreference` denies a PARENT setting `enabled: true` (`announcement-preferences-service.ts:27`). The parent can therefore only opt out. Opting in becomes a staff task with verified consent evidence.
- **Q8 (`pickupHelpers`).** Day passes cannot be standing (window of 12 hours or less, at most 14 days ahead). The questionnaire only remembers who the helpers are, and a later request issues a pass.
- **Q9 (`canteenSetup`).** Allergens use a structured picker so health data never reaches the model. The dietary record is saved as NEEDS_CONFIRMATION.
- **Q10 (`meetTeacher`).** Uses `bookMeeting` with a `requestKey`, and the adapter replicates `notifyParty`. If the teacher has no open window, the answer becomes a task.

**Not asked**, because no adapter or record exists, or because the system already knows: name, email, children and class, school language and currency, digest frequency, notification quiet hours, and child support-plan details. Support plans are read-only for families and are written by staff.

## 3. Build outcome

**autoProvisioned.** These are records created from confirmed answers, each bound to the questionnaire `{id, version}` and an idempotency key `parent-setup-{userId}-{version}-{key}`:

- **`profile.update_own`** (`language`, Class A): `User.preferredLanguage`. Copy and RTL switch immediately.
- **`profile.update_own` phone** (`contactPhone`, Class B): `User.phone`.
- **`personal.save_plan`** (`familyGoals` + `availability` + `pickupHelpers`, Class A): one private "Family plan". It holds a checklist per goal (for example "Check homework Sun–Thu 7 pm"), the free-time grid used to prefill bookings, and the saved pickup helpers. Visible only to this parent.
- **`communications.set_guardian_channel_preference`** (`updatesChannel` = app only, Class B): a WhatsApp opt-out row with version and evidence. Applies only when a channel was enabled.
- **`canteen.set_spend_limit`** (`canteenSetup`, Class B): a `CanteenSpendLimit` per child.
- **`canteen.record_dietary`** (`canteenSetup`, Class B): a `DietaryRecord`, source GUARDIAN, status NEEDS_CONFIRMATION.
- **`family.meeting`** book (`meetTeacher`, Class B): a booking. The teacher is notified.
- **`parent.explain_absence`** (`openAbsences`, Class B): an explanation in PENDING, awaiting staff review.
- **`chat.start_direct` + `chat.send_message`** (`childrenCheck` mismatch, Class B): a message thread to the campus office with the exact text previewed.
- **Native control, not the AI** (Class C): `parent.accept_invitation` (Q1) and `family.trip_consent` (Q12). The receipt says "you accepted / you answered", with `receiptCode` for trips.

**remainsAsTasks.** These need another approver or a later step:

- **Campus admin:**
  - Enable WhatsApp after verifying the number and recording consent evidence (`communications.set_guardian_channel_preference` enable). Parents cannot opt in themselves.
  - Fix or add a guardian link when Q2 says "Something is wrong" or "A child is missing" (`guardians.change_access` / `guardians.resolve_review`).
  - Update the phone on the guardian record if it differs from Q4 (`guardians.change_access`).
- **Canteen dietary lead:** confirm or mark uncertain the allergen record (`reviewDietary`).
- **Campus admin or attendance staff:** review the absence explanation (`attendance.review_explanation`).
- **Class teacher:** open a meeting window when Q10 = Yes and none is free (`meetings.open_window`). The booking then runs from the saved availability.
- **Parent, later, from Pickup:** issue a day pass for a saved helper (`pickup.issue_authorization`). The code appears only in the native pass card.
- **Parent, per trip:** any trip consent not answered in Q12 stays on Activities & trips with its deadline.

**Readiness** is shown from live records (children linked, rights, open items cleared), never from "questionnaire complete" (rule 17).

**Copy change:** replace "nothing applies until you approve" with "Class A saves now; everything else waits for your confirm or the school's decision."

## 4. Top free-form requests

| # | Request (as typed) | Capability key(s) | Class | Adapter today |
|---|---|---|---|---|
| 1 | Urdu: "کل احمد کی طبیعت خراب ہے، وہ اسکول نہیں آئے گا" ("Ahmed is unwell tomorrow, he won't come to school") | `family.request_leave` | B | none, needed (direct: `requestLeave`) |
| 2 | "Sara was marked absent yesterday, she had fever" | `parent.explain_absence` | B | none, needed (direct: `submitExplanation`) |
| 3 | Arabic: "أريد موعداً مع معلمة الرياضيات لابنتي مريم يوم الأحد بعد الظهر" ("I want an appointment with my daughter Maryam's maths teacher on Sunday afternoon") | `family.meeting` (book) | B | none, needed (direct: `bookMeeting` + `notifyParty`) |
| 4 | "My brother Bilal will pick up Hamza today at 1:30" | `pickup.issue_authorization` | B | none, needed (direct). The code never enters chat, the model or logs. |
| 5 | "How much fee is due for both kids? Pay Ali's now" | read (`/parent/fees`) + `fees.start_online_payment` | C | none, needed (wrapper). The adapter only hands off to the provider page; settlement happens via webhook. |
| 6 | "Yes Zain can go on the museum trip" | `family.trip_consent` | C | none, needed: prepare-only, then the native consent control bound to the trip version |
| 7 | "Sign Fatima up for the football club" | `family_activities.request_place` | B | none, needed (wrapper) |
| 8 | "Set Hamza's canteen limit to 300 a day, he is allergic to peanuts" | `canteen.set_spend_limit`, `canteen.record_dietary` | B | none, needed (direct) |
| 9 | "Stop sending me WhatsApp messages" | `communications.set_guardian_channel_preference` (opt-out) | B | none, needed (direct) |
| 10 | "What homework does Ayesha have this week and when are her exams?" | read only (`/api/parent/timetable`, `exam-datesheet`); deep-link to Exam Studio-owned surfaces for papers and results | none (outcome `answered`, never "done") | read lookup; no write adapter |

A request also counts when it is one step removed. "Cancel my meeting on Monday" maps to `family.meeting` cancel/`meetings.family_cancel` (B). "Change my language to Urdu" maps to `profile.update_own` (A, partial adapter exists today).

How every request behaves:
- If the parent has more than one child and the request does not name one, the AI asks which child. It never picks a default.
- The AI re-checks the child's relationship rights before it previews.
- The AI asks only for the missing details: dates, slot, who collects and the time window, or the amount.

## 5. Adapters needed

| Capability key | Reuse | Note |
|---|---|---|
| `profile.update_own` | inline-prisma | extend the existing profile.update adapter with phone |
| `communications.set_guardian_channel_preference` | direct | opt-out only for PARENT |
| `chat.start_direct`, `chat.send_message` | direct | `clientKey` required for idempotency |
| `family.request_leave` | direct | |
| `parent.explain_absence` | direct | |
| `family.meeting` | direct | must replicate `notifyParty` |
| `pickup.issue_authorization` | direct | the secret code is returned only to the native card |
| `canteen.set_spend_limit`, `canteen.record_dietary` | direct | |
| `family_activities.request_place` | wrapper | |
| `family.trip_consent` | direct | Class C: prepare a version-bound preview, then apply through the native control |
| `fees.start_online_payment` | wrapper | Class C: hand-off only |

**No adapter by design:**
- `parent.accept_invitation`: native control only (rule 8).
- `canteen.place_order`, `canteen.decide_order`: money stays in the Canteen screen (rule 5).
- `data_lifecycle.*`: full learner PII must never pass through the model.
- `account.manage_mfa`, `auth.change_password`: credential flows.

## 6. Role-specific guardrails

- **ROLE_PURPOSE** (`src/lib/automation/catalog.ts:26`): "Parent: own preferences and children's authorized information only; never create or edit school records." The new adapters write only **family-owned requests and preferences** that the existing family services already allow: leave requests, explanations, bookings, consents, day passes, canteen limits, dietary notes. They never write staff-owned school records such as attendance, marks, invoices, guardian links or timetables. The purpose line should be extended to say this explicitly. The outcome for every request is "Sent to the school, awaiting its decision", never "done" (rule 15).
- **Rule 19 (role ceiling).** PARENT never receives `school.execute` or any of the 15 typed operations. Reach grows only through typed adapters that call the family services, which already run `guardianChild` / `guardianFor` / `guardianHasAccess` (T2). Each write re-checks role, campus, accessVersion and that child's live relationship rights at execution time, not at planning time.
- **Rule 5 (no chat phrase alone):**
  - The AI never moves money: online payment and canteen orders are Class C hand-off or no adapter.
  - It never sends messages to other families. Parent-to-office messages are the parent's own words shown in full before a bound confirm.
  - It never gives legal consent for the guardian. Trip consent uses the native control, and a typed or spoken "yes" does nothing without the `{pendingKey, previewHash, version}` binding.
- **Rule 8:**
  - The AI never accepts an invitation, never creates or infers a guardian link, and never adds a child.
  - Children come only from live ACTIVE relationships. A mismatch becomes a message to the office plus an admin task.
- **Secrets and PII:**
  - Pickup codes and QR codes never enter chat history, model context or logs (Appendix A row 264).
  - The ID number is limited to its last 4 characters and is never prompted for in free text.
  - Allergens and illness reasons are pseudonymised. The allergen picker and the absence-reason choice are deterministic, with no model call.
- **Communication consent.** A parent can only opt out of WhatsApp. Opting in needs staff-verified evidence. The AI must never assert consent.
- **Exam Studio ownership.** Exam questions, papers and results are deep-links to the parent's datesheet and results views. Nothing is duplicated.
- **Credits.** Structured questionnaire answers run deterministic adapters with no model call and no credit. Free-text parsing in AI Workflows charges per AI action. A paused subscription blocks AI with neutral copy, and the manual parent screens keep working (rule 20).
- **Plumbing.** Today the ONBOARDING questionnaire kind and the questionnaire branch of `startAutomaticJob` accept only ADMIN/CAMPUS_ADMIN (`service.ts:43-48`). A per-user role questionnaire record bound to `{id, version}` is needed for PARENT. It should reuse the SKO-470 run lifecycle and the SKO-460 conversation surfaces, not fork them.
- **UX.**
  - Phone-first: most parents arrive from an SMS or WhatsApp invite.
  - EN/AR/UR with full RTL. Per-child chips. Shared design-system primitives only.
  - Every answer shows a receipt line: "Saved", "Sent to {office}, awaiting decision", or "Needs your tap in {screen}".


### Question table

| key | prompt | input | drives | class | req | prefill |
|---|---|---|---|---|---|---|
| `pendingInvitations` | The school invited you as a guardian for these children. Review each one. | invitation-cards (native Accept / Not me controls) | parent.accept_invitation | C | yes | GET /api/parent/invitations (GuardianRelationship status INVITED, email match, unexpired) |
| `childrenCheck` | Are these your children and classes? | choice | chat.start_direct, chat.send_message | B | yes | resolveParentScope (src/lib/parent/resolve-child.ts:51) + GuardianAccessVersion.permissions |
| `language` | Which language should Skoolee use with you? | choice | profile.update_own | A | yes | User.preferredLanguage (prisma/schema.prisma:683) |
| `contactPhone` | Is this the best number for the school to reach you? | choice + phone field | profile.update_own | B | yes | User.phone, else GuardianRelationship.phone |
| `updatesChannel` | How should school updates reach you? | choice | communications.set_guardian_channel_preference | B | yes | listChannelPreferences (src/lib/school-ai/announcement-preferences-service.ts:17) |
| `familyGoals` | What would you like help keeping on top of? | multi | personal.save_plan | A | yes |  |
| `availability` | When are you usually free for school meetings or calls? | schedule-grid | personal.save_plan, family.meeting | A | no | school weekend from getLocalePackage(schoolId, campusId) |
| `pickupHelpers` | Besides you, who sometimes collects {child}? | tags (name + relationship) | personal.save_plan, pickup.issue_authorization | A | no | shown only when the relationship has the pickup right; guardianPickups (src/lib/pickup/service.ts:102) for past helpers |
| `canteenSetup` | Daily canteen limit and any food allergies for {child} | stepper + multi (fixed allergen list) | canteen.set_spend_limit, canteen.record_dietary | B | no | familyCanteen (/api/campus-packages?view=family); shown only when canteen is enabled |
| `meetTeacher` | Would you like a short meeting with {child}'s class teacher? | choice per child | family.meeting | B | no | open meeting windows intersected with the availability answer |
| `openAbsences` | {child} was absent on {date} with no reason given. What happened? | choice (text only for Other) | parent.explain_absence | B | no | /api/parent/attendance rows inside the explain window |
| `openConsents` | {trip} on {date} needs your answer. | consent card (native Allow / Do not allow, version-bound) | family.trip_consent | C | no | guardianTrips (src/lib/family/trips.ts:155) |

**Auto-provisioned:**
- profile.update_own: User.preferredLanguage from language (A)
- profile.update_own: User.phone from contactPhone (B; adapter extension)
- personal.save_plan: private Family plan with goal checklist, availability grid and saved pickup helpers (A)
- communications.set_guardian_channel_preference: WhatsApp opt-out row when the parent chooses app only (B)
- canteen.set_spend_limit: CanteenSpendLimit per child (B)
- canteen.record_dietary: DietaryRecord source GUARDIAN, status NEEDS_CONFIRMATION (B)
- family.meeting: meeting booking with the class teacher when a window is open; teacher notified (B)
- parent.explain_absence: pending absence explanation per open absence (B)
- chat.start_direct + chat.send_message: message to the campus office when childrenCheck reports a mismatch (B)
- parent.accept_invitation: by the parent's own tap on the native control, not by the AI (C)
- family.trip_consent: by the parent's own answer on the native, version-bound consent card; receiptCode shown (C)

**Remains as tasks:**
- CAMPUS_ADMIN: enable WhatsApp after verifying the number and recording consent evidence (communications.set_guardian_channel_preference enable; PARENT may only opt out)
- CAMPUS_ADMIN: correct or add a guardian link when childrenCheck says wrong or missing (guardians.change_access / guardians.resolve_review)
- CAMPUS_ADMIN: update the phone on the guardian record if it differs from contactPhone (guardians.change_access)
- Canteen dietary lead: confirm or mark uncertain the allergen record (reviewDietary)
- CAMPUS_ADMIN / attendance staff: review each absence explanation (attendance.review_explanation)
- TEACHER: open a meeting window when meetTeacher = Yes and no slot is free (meetings.open_window); booking then runs from saved availability
- PARENT (later, Pickup screen): issue a day pass for a saved helper (pickup.issue_authorization; code shown only in the native card)
- PARENT (later, Activities & trips): answer any trip consent not answered in the questionnaire before its deadline

**Adapters needed:** `profile.update_own`, `communications.set_guardian_channel_preference`, `chat.start_direct`, `chat.send_message`, `family.request_leave`, `parent.explain_absence`, `family.meeting`, `pickup.issue_authorization`, `canteen.set_spend_limit`, `canteen.record_dietary`, `family_activities.request_place`, `family.trip_consent`, `fees.start_online_payment`
