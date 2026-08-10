# Skoolee AI — Feature-Parity Build Plan (15 Modules)

Hand this document to the implementing agent. Each module is self-contained and
ordered by dependency: **build them in the order listed** — later modules assume
earlier ones exist.

---

## 0. Read this first — codebase conventions

These are established patterns. Follow them; do not invent parallel ones.

**Stack** — Next.js 16.2.3 (App Router, Turbopack), React 19, TypeScript, Prisma + PostgreSQL (Supabase), Tailwind v4 (CSS-first, no config file; tokens in `src/app/globals.css`).

**API route pattern** — every route imports from `src/lib/api/scope.ts`:
```ts
import { ApiError, canManageOperations, errorResponse, requireAuthUser,
         resolveCampusId, scopedCampusWhere } from "@/lib/api/scope";
```
- `requireAuthUser()` → throws if unauthenticated.
- `canManageOperations(user)` → gate all writes.
- `scopedCampusWhere(user, campusId)` → **always** campus-scope queries; this is the multi-tenant boundary.
- Return `Response.json({ success: true, data })`; errors via `return errorResponse(error, "[module] VERB failed")`.
- Convention: `PATCH` takes `{ id, ...updates }` in the **body**; `DELETE` takes `?id=`.
- Public/unauthenticated routes go under `/api/public/*` (proxy.ts early-exits that prefix).

**Money is stored as integers in the smallest unit (paisa)** — `Invoice.totalAmount`, `FeeStructure.monthlyFee` etc. are `Int`. UI divides by 100 for display (see `src/app/owner/page.tsx` revenue tile). Never store floats for money.

**Shared UI** — `src/components/shared-admin/index.tsx` is a large barrel used by **both** Admin (`src/app/admin/page.tsx`) and Principal (`src/app/principal/page.tsx`). Anything built there appears in both roles. Reuse these existing primitives:
- `ModalFrame`, `ModalActions`, `FormInput`, `FormSelect`, `DetailRow`, `PanelTitle`, `StatusPill`, `MiniMetric`, `EmptyInline`
- `BrandButton`, `EmptyState`, `StatCard`, `AiActionPanel` from `@/components/role-dashboard`
- `TeacherPicker` + `useTeacherAvailability` from `@/components/shared-admin/teacher-picker`
- `ConfirmAction` (`src/components/ui/confirm-action.tsx`) for every destructive action

**Navigation** — role dashboards are tab-driven SPAs: a `type XView = "a" | "b" | …` union plus `activeView` state, with `RoleShell`'s `navItems` switching state (not routing). Adding a module = add to the union, add a `navItems` entry, add a render branch.

**Styling** — brand `#8127cf` → `#9c48ea`, bg `#fbf0fe`. Use the existing motion classes (`sk-rise` with staggered `animationDelay`, `sk-glow`, `sk-float`) and the shadow recipes already in use:
- card resting: `shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]`
- card hover: `shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]`
- borders `border-[#cfc2d6]/25` (never `/10` — invisible on the lavender bg)

**Migrations** — the app's `DATABASE_URL` uses the Supabase pooler (`:6543`), which **cannot run DDL**. Run migrations against the direct port:
```bash
DIRECT=$(grep '^DATABASE_URL' .env | sed 's/^DATABASE_URL=//' | tr -d '"' \
  | sed 's/:6543/:5432/' | sed 's/[?&]pgbouncer=true//')
DATABASE_URL="$DIRECT" npx prisma migrate deploy && npx prisma generate
```
**Then restart the dev server** — it caches the Prisma client and will throw unknown-column errors otherwise.

**Payments** — SafePay only (`src/lib/payments/safepay.ts`, `src/lib/payments/gateway.ts`, `/api/safepay/*`). **Do not build Stripe or PayPal.** Existing `/api/stripe/checkout` is legacy; route new payment work through the SafePay gateway abstraction.

**Gates** — every module must end with `npx tsc --noEmit` and `npx eslint <touched files>` clean, plus a browser check as `campusadmin@demo.com` and `principal@demo.com` (both `Admin@123`).

---

## Module 1 — Student Category & Group

**Why first:** fee discounts (Module 2) key off these tags. Nothing else works without them.

**Data model**
```prisma
model StudentCategory {   // General, Scholarship, Orphan, Staff Child…
  id String @id @default(uuid())
  campusId String @map("campus_id")
  campus Campus @relation(...)
  name String
  description String?
  isActive Boolean @default(true) @map("is_active")
  students Student[]
  @@unique([campusId, name])
  @@map("student_categories")
}
model StudentGroup {      // Transport users, Hostel residents, House A…
  id String @id @default(uuid())
  campusId String @map("campus_id")
  name String
  description String?
  students Student[]
  @@unique([campusId, name])
  @@map("student_groups")
}
```
Add to `Student`: `categoryId String? @map("category_id")`, `groupId String? @map("group_id")` + relations.

**API** — `/api/student-categories` and `/api/student-groups`, full CRUD, campus-scoped. Block `DELETE` when students reference the row (return 409 with the count) rather than cascading.

**UI** — new "Student Setup" tab in Admin + Principal: two side-by-side CRUD lists. Add Category/Group selects to `AdmissionForm` (`src/app/dashboard/students/admission-form.tsx`) step 1 and to `StudentDetailModal`. Show category as a pill on the student card in `StudentsPanel`.

**Edge cases** — a school may use neither (both optional/nullable); renaming must not break existing links; deleting a category used by a discount rule must be blocked.

**Verify** — create/rename/delete a category; assign one during admission; confirm the pill renders; confirm delete is blocked while in use.

---

## Module 2 — Fee Structure (4-Layer)

**Why:** the current `FeeStructure` is a single flat row per class (`monthlyFee` + JSON blobs) and can't express per-head fees, packages, or per-student discounts. This is the biggest gap.

**Data model** (new; leave the old `FeeStructure`/`Invoice`/`Payment` intact — see migration note)
```prisma
model FeeType {          // the fee head
  id String @id @default(uuid())
  campusId String @map("campus_id")
  name String                    // "Monthly Tuition", "Lab Charges"
  code String                    // short code, unique per campus
  description String?
  masters FeesMasterLine[]
  @@unique([campusId, code])
  @@map("fee_types")
}
model FeeGroup {         // a package of heads, e.g. "Monthly Package"
  id String @id @default(uuid())
  campusId String @map("campus_id")
  name String
  description String?
  lines FeesMasterLine[]
  assignments FeeGroupAssignment[]
  @@unique([campusId, name])
  @@map("fee_groups")
}
model FeesMasterLine {   // the priced row: group + type + amount
  id String @id @default(uuid())
  campusId String @map("campus_id")
  feeGroupId String @map("fee_group_id")
  feeTypeId String @map("fee_type_id")
  amount Int                     // paisa
  dueDate DateTime? @map("due_date")
  @@unique([feeGroupId, feeTypeId])
  @@map("fees_master_lines")
}
model FeeGroupAssignment {  // which classes/sections get which group
  id String @id @default(uuid())
  campusId String @map("campus_id")
  feeGroupId String @map("fee_group_id")
  classId String @map("class_id")   // Class row == one section
  academicYear Int @map("academic_year")
  @@unique([feeGroupId, classId, academicYear])
  @@map("fee_group_assignments")
}
model FeeDiscount {
  id String @id @default(uuid())
  campusId String @map("campus_id")
  name String
  code String
  type String                    // "PERCENT" | "FLAT"
  value Int                      // percent (0-100) or paisa
  categoryId String? @map("category_id")  // auto-apply to a Student Category
  assignments FeeDiscountAssignment[]
  @@unique([campusId, code])
  @@map("fee_discounts")
}
model FeeDiscountAssignment {
  id String @id @default(uuid())
  discountId String @map("discount_id")
  studentId String @map("student_id")
  @@unique([discountId, studentId])
  @@map("fee_discount_assignments")
}
model FeeCarryForward {
  id String @id @default(uuid())
  campusId String @map("campus_id")
  studentId String @map("student_id")
  fromAcademicYear Int @map("from_academic_year")
  toAcademicYear Int @map("to_academic_year")
  balance Int                    // paisa, may be negative (credit)
  note String?
  @@unique([studentId, toAcademicYear])
  @@map("fee_carry_forwards")
}
```

**Migration strategy — important.** Do **not** drop `FeeStructure`. Add the new tables alongside, then write a one-off backfill script that converts each existing `FeeStructure` into a FeeGroup ("Legacy — {class}") with one `FeeType` ("Monthly Tuition") priced at `monthlyFee`, plus a type per key in `oneTimeFeesJson`. Keep both readable for one release; flip the UI to the new model; remove `FeeStructure` only in a later cleanup once invoices reconcile.

**API** — one route per layer under `/api/fees/`: `types`, `groups`, `master`, `assignments`, `discounts`, `carry-forward`. All campus-scoped, CRUD. Plus `GET /api/fees/resolve?studentId=` returning the computed picture for one student: applicable group lines, discounts (explicit + category-derived), carry-forward balance, and the resulting payable total. **All amount maths lives in one shared helper** (`src/lib/fees/compute.ts`) used by both the API and invoice generation — never duplicate it in the UI.

**UI** — rebuild `src/components/fees/FeeStructuresTab.tsx` into sub-tabs mirroring the layers: Types · Groups · Master · Assign · Discounts · Carry Forward. Each is a table + `ModalFrame` create/edit. "Assign" is a class/section multi-select against a group.

**Edge cases** — percent discounts must cap at 100 and stack deterministically (define and document the order: flat first, then percent on the remainder, or the reverse — pick one and comment it); a student in two groups; changing a master amount must **not** retroactively alter already-issued invoices; carry-forward must be idempotent per `(student, toYear)`.

**Verify** — build a group with 3 types, assign to 2 sections, attach a 10% discount to one student, and confirm `resolve` returns the right payable for both a discounted and non-discounted student.

---

## Module 3 — Fee Collection, Fines & Defaulters

**Depends on:** Module 2.

**Data model** — extend `Payment` (or add `FeePayment` if the existing one is billing-specific — check `src/app/dashboard/billing`): needs `fineAmount Int @default(0)`, `discountAmount Int @default(0)`, `paymentMode String` (CASH/BANK/CHEQUE/SAFEPAY/MOBILE_WALLET), `receiptNo String @unique`, `collectedBy` (User relation), `note String?`.
```prisma
model FeeFineRule {
  id String @id @default(uuid())
  campusId String @map("campus_id")
  name String
  graceDays Int @default(0) @map("grace_days")
  type String        // "PERCENT" | "FLAT" | "PER_DAY"
  value Int
  @@map("fee_fine_rules")
}
```

**API** — `POST /api/fees/collect` (studentId, lines, discount, fine, mode, date → creates payment + updates invoice balance **in one transaction**); `GET /api/fees/defaulters?classId=&asOf=`; `GET /api/fees/statement?studentId=`; `GET /api/fees/reports/balance|transaction`.

**UI** — "Collect Fees" screen: pick class/section → student list with outstanding → collection form (date, amount, discount, fine, mode) with live balance. Printable receipt (thermal + A4) — reuse the existing PDF path (`src/lib/pdf.tsx`, S3 upload via `src/lib/storage/s3.ts`). Defaulter list with a "Send reminder" action wired to the **existing** WhatsApp/notification infra (`src/lib/whatsapp`, `src/lib/notifications/in-app.ts`, `ParentCommunication` model) — do not build a new messaging stack.

**Online payment** — surface unpaid invoices in the Student and Parent portals with a "Pay now" button routed through `src/lib/payments/gateway.ts` → SafePay. Reuse `/api/safepay/notification` for the webhook. **No Stripe/PayPal.**

**Edge cases** — partial payments; overpayment → credit carried forward; concurrent collection (wrap in a transaction and re-read the balance); refunds/reversals must be an explicit negative payment, never a delete.

**Verify** — collect a partial payment, confirm balance; overpay, confirm credit; run the defaulter report; pay once end-to-end through SafePay sandbox.

---

## Module 4 — Accounts Ledger

**Depends on:** Module 3 (fee income posts into it).

**Data model**
```prisma
model ChartOfAccount {
  id String @id @default(uuid())
  campusId String @map("campus_id")
  name String
  type String     // ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
  @@unique([campusId, name])
  @@map("chart_of_accounts")
}
model PaymentMethodRef { id … campusId … name String; isActive Boolean @default(true); @@map("payment_methods") }
model BankAccount { id … campusId … name String; accountNumber String?; bankName String?; openingBalance Int @default(0); @@map("bank_accounts") }
model LedgerEntry {
  id String @id @default(uuid())
  campusId String @map("campus_id")
  kind String            // "INCOME" | "EXPENSE"
  sourceName String @map("source_name")
  accountId String @map("account_id")
  paymentMethodId String? @map("payment_method_id")
  bankAccountId String? @map("bank_account_id")
  date DateTime
  amount Int
  note String?
  @@index([campusId, date])
  @@map("ledger_entries")
}
```

**API** — CRUD for each; `GET /api/accounts/profit?from=&to=` returning income total, expense total, net, and a per-account breakdown.

**UI** — "Accounts" tab: Chart of Account · Payment Methods · Bank Accounts · Income · Expense · Profit report (date range, grand totals). Reuse `StatCard` for the totals row.

**Edge cases** — deleting an account head with entries must be blocked; date-range reports must be inclusive of both endpoints and campus-scoped; fee collections should auto-post an INCOME entry (make this explicit and idempotent by storing the originating payment id).

---

## Module 5 — Admissions Upgrade (siblings + auto-credentials + documents)

**Good news:** `Student` already has `studentUserId`, `parentUserId`, and `admissionNo`. Much of the wiring exists.

**Data model** — add to `Student`: `siblingGroupId String? @map("sibling_group_id")` (simple shared UUID linking siblings; avoids a join table) and
```prisma
model StudentDocument {
  id String @id @default(uuid())
  studentId String @map("student_id")
  kind String        // BIRTH_CERTIFICATE | TRANSFER_CERTIFICATE | PHOTO | OTHER
  fileKey String @map("file_key")   // S3 key
  fileName String @map("file_name")
  uploadedAt DateTime @default(now()) @map("uploaded_at")
  @@map("student_documents")
}
model StudentTimelineEvent {
  id String @id @default(uuid())
  studentId String @map("student_id")
  kind String        // ADMITTED | PROMOTED | FEE_PAID | DOC_UPLOADED | NOTE
  title String
  detail String?
  actorId String? @map("actor_id")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([studentId, createdAt])
  @@map("student_timeline_events")
}
```

**Flow changes to `AdmissionForm`**
1. New first step: **Parent/Guardian** — either pick an existing parent (search by phone/email) or create one. Picking an existing parent auto-links the sibling group.
2. Existing student steps, plus Category/Group (Module 1), religion, and document uploads.
3. **On save**, in one transaction: create Student → create `User` (role `STUDENT`) → create-or-reuse `User` (role `PARENT`) → link both → generate credentials → write an `ADMITTED` timeline event.

**Credentials** — generate `username` + a temporary password, set `mustChangePassword: true` (the field already exists and `/first-login` already handles it). Return them once for display/print; hash with `bcryptjs` as in `src/app/actions/addTeacher.ts`. **Never** log or email plaintext passwords.

**File upload** — no generic upload endpoint exists today (only report-card PDFs). Build `POST /api/uploads/presign` returning a presigned S3 PUT URL using `src/lib/storage/s3.ts`; client uploads direct to S3 and posts back the key. Validate content-type and cap size.

**UI** — rebuild `StudentDetailModal` as a tabbed profile: Personal · Parents/Siblings · Fees · Documents · Timeline · Academic.

**Edge cases** — duplicate parent email (reuse, don't error); student without an email (username-only login); sibling added later must join the existing group; deleting a student must not delete a parent who still has other children.

---

## Module 6 — Admission Query (Lead CRM)

**Data model**
```prisma
model AdmissionQuery {
  id String @id @default(uuid())
  campusId String @map("campus_id")
  name String
  phone String
  email String?
  classInterestedId String? @map("class_interested_id")
  source String            // WALK_IN | PHONE | WEBSITE | REFERRAL | ADVERT
  status String @default("ACTIVE")   // ACTIVE | FOLLOW_UP | CONVERTED | LOST
  assignedToId String? @map("assigned_to_id")
  nextFollowUp DateTime? @map("next_follow_up")
  note String?
  convertedStudentId String? @unique @map("converted_student_id")
  followUps AdmissionQueryFollowUp[]
  @@index([campusId, status])
  @@map("admission_queries")
}
model AdmissionQueryFollowUp {
  id String @id @default(uuid())
  queryId String @map("query_id")
  date DateTime
  note String
  nextDate DateTime? @map("next_date")
  actorId String? @map("actor_id")
  @@map("admission_query_follow_ups")
}
```

**UI** — "Admission Queries" tab: filterable list (status, source, follow-up due), detail drawer with a follow-up timeline, and a **"Convert to student"** action that opens `AdmissionForm` prefilled and, on success, sets `status=CONVERTED` + `convertedStudentId`.

**Edge cases** — overdue follow-ups highlighted; converting twice must be blocked (`convertedStudentId` is unique); lost leads stay for reporting.

---

## Module 7 — Student Promote & Archive

**Good news:** `StudentClassHistory` already exists with `status` (ACTIVE/PROMOTED/TRANSFERRED/GRADUATED/DROPPED), `finalGrade`, `finalPercentage`, `promotedToClassId`, and a `@@unique([studentId, classId, academicYear])`. **Use it — do not add a new model.**

**API** — `POST /api/students/promote` accepting `{ fromClassId, toClassId, academicYear, results: [{ studentId, outcome: "PASS"|"FAIL", finalGrade?, finalPercentage? }] }`. In one transaction per batch: write/na update `StudentClassHistory` for the outgoing year, then move `Student.classId` for those who passed (failures stay/repeat), and write timeline events.

**UI** — "Promote Students" screen: pick year + class/section → roster with Pass/Fail toggles (bulk "mark all pass") → choose destination class → preview of what will change → confirm. Show a clear warning that **class change is only allowed via promotion**.

**Also** — "Disabled/Archived Students" list driven by `Student.status` (`active` → `inactive`/`graduated`), excluded from rosters, fee generation and attendance, with a restore action.

**Edge cases** — promoting into a class that doesn't exist for the next year (offer to create it); roll-number collisions in the destination (re-issue via the existing `/api/students/next-roll`); re-running a promotion must be idempotent (the unique constraint enforces this — catch and report, don't crash); outstanding fees should carry forward (Module 2's `FeeCarryForward`).

---

## Module 8 — Staff Records Depth

**Data model** — extend `User` (teacher/staff fields largely exist: `qualification`, `experience`, `joiningDate`, `subjectSpecialties`, `teachesAllSubjects`). Add:
```prisma
model StaffProfile {
  id String @id @default(uuid())
  userId String @unique @map("user_id")
  designation String?
  contractType String? @map("contract_type")   // PERMANENT | CONTRACT | PART_TIME
  basicSalary Int @default(0) @map("basic_salary")
  allowancesJson Json? @map("allowances_json")
  deductionsJson Json? @map("deductions_json")
  bankAccountName String? @map("bank_account_name")
  bankAccountNumber String? @map("bank_account_number")
  bankName String? @map("bank_name")
  socialLinksJson Json? @map("social_links_json")
  @@map("staff_profiles")
}
model StaffDocument { id … userId … kind String; fileKey String; fileName String; uploadedAt DateTime @default(now()); @@map("staff_documents") }
model StaffTimelineEvent { id … userId … kind String; title String; detail String?; createdAt DateTime @default(now()); @@map("staff_timeline_events") }
```

**UI** — extend `AddTeacherForm` and `TeacherDetailModal` (already tabbed-ish) with Payroll, Bank, Documents, Timeline sections. Reuse the presign upload from Module 5 and the `SpecialtyEditor` already built.

**Edge cases** — salary is money → `Int` paisa; bank details are sensitive (restrict to admin roles via `canManageOperations`, never expose in teacher-facing APIs).

---

## Module 9 — Leave Management

**Data model**
```prisma
model LeaveType { id … campusId … name String; defaultDays Int; @@unique([campusId, name]); @@map("leave_types") }
model LeaveAllocation {   // per role (or per user override)
  id … campusId … leaveTypeId String; role UserRole?; userId String?; days Int; academicYear Int
  @@map("leave_allocations")
}
model LeaveRequest {
  id … campusId … userId String; leaveTypeId String
  fromDate DateTime; toDate DateTime; days Int; reason String?
  status String @default("PENDING")   // PENDING | APPROVED | REJECTED | CANCELLED
  reviewedById String? ; reviewedAt DateTime?; reviewNote String?
  attachmentKey String?
  @@index([campusId, status]); @@map("leave_requests")
}
```

**API** — CRUD for types/allocations; `POST /api/leave/apply`; `PATCH /api/leave/:id/review`; `GET /api/leave/balance?userId=` computing remaining = allocation − approved days.

**UI** — Admin: Leave Type, Leave Define (per role), Approve queue. Teacher/staff side: Apply Leave showing remaining balance, plus their own request history.

**Edge cases** — overlapping requests; half-days (decide: either support a `0.5` via storing days as `Int` tenths, or explicitly disallow — document the choice); leave crossing academic years; approving must not exceed balance (warn, allow with override flag).

---

## Module 10 — Payroll

**Depends on:** Module 8 (salary fields), Module 9 (unpaid-leave deductions).

**Data model**
```prisma
model PayrollRun { id … campusId … month Int; year Int; status String @default("DRAFT"); generatedById String?; generatedAt DateTime?; @@unique([campusId, month, year]); @@map("payroll_runs") }
model PayrollLine {
  id … payrollRunId String; userId String
  basic Int; allowances Int; deductions Int; bonus Int; net Int
  breakdownJson Json?; status String @default("UNPAID")   // UNPAID | PAID
  paidAt DateTime?; paymentMethodId String?
  @@unique([payrollRunId, userId]); @@map("payroll_lines")
}
```

**API** — `POST /api/payroll/generate` (role + month + year → creates a DRAFT run with a line per staff, computed from `StaffProfile` + unpaid leave); `PATCH /api/payroll/lines` to mark paid; `GET /api/payroll/report?from=&to=`.

**UI** — search (role/month/year) → Generate Payroll → editable earnings/deductions grid with a summary row → mark paid → Payroll Report (printable). Paying a line should post an EXPENSE `LedgerEntry` (Module 4), idempotently.

**Edge cases** — regenerating an existing month must not duplicate (unique constraint); staff joining mid-month (pro-rate and document the rule); never delete a PAID run — supersede it.

---

## Module 11 — Roles & Permissions Matrix

**Important:** `UserRole` is a Prisma **enum** with 8 values. Adding ACCOUNTANT/LIBRARIAN/RECEPTIONIST requires an enum migration (`ALTER TYPE … ADD VALUE`), which **cannot run inside a transaction** — put each `ADD VALUE` in its own migration statement.

**Data model**
```prisma
model RolePermission {
  id String @id @default(uuid())
  schoolId String @map("school_id")
  role UserRole
  module String        // "students" | "fees" | "payroll" | …
  canView Boolean @default(false) @map("can_view")
  canAdd Boolean @default(false) @map("can_add")
  canEdit Boolean @default(false) @map("can_edit")
  canDelete Boolean @default(false) @map("can_delete")
  @@unique([schoolId, role, module])
  @@map("role_permissions")
}
```

**Enforcement — do it server-side.** Add `assertPermission(user, module, action)` to `src/lib/api/scope.ts` and call it in every route alongside `canManageOperations`. Client-side hiding is cosmetic only; **never** rely on it. Seed sensible defaults per role on school creation.

**UI** — "Role Permissions" grid: modules down, View/Add/Edit/Delete across, one tab per role. Hide nav items the role can't view (`RoleShell` `navItems` filtered by permission).

**Edge cases** — never let a school lock itself out (SUPER_ADMIN/APP_OWNER permissions are fixed and not editable); permission changes should take effect without re-login (read on each request, or bust a short cache).

---

## Module 12 — Academic Infrastructure (Rooms + Periods)

**Data model**
```prisma
model ClassRoom { id … campusId … roomNumber String; capacity Int; note String?; @@unique([campusId, roomNumber]); @@map("class_rooms") }
model PeriodDefinition {
  id … campusId … timeType String   // "CLASS" | "EXAM"
  periodNumber Int; startTime String; endTime String   // "HH:mm"
  @@unique([campusId, timeType, periodNumber]); @@map("period_definitions")
}
```
Add `roomId String?` to `TimetableSlot` (the model already has the right shape and a `[teacherId, dayOfWeek, periodNumber]` index).

**UI** — "Class Rooms" and "Class & Exam Time Setup" CRUD screens. Period definitions become the **row headers** of the timetable grid instead of hardcoded periods.

**Edge cases** — changing a period's times after a timetable exists (warn, don't silently shift); room capacity vs class size (warn only); overlapping period times must be rejected.

---

## Module 13 — Timetable & Exam Routine

**Depends on:** Module 12.

**Build on what exists** — `Timetable`/`TimetableSlot`, slot-level conflict detection in `src/app/api/timetable/[id]/route.ts` (returns 409 + `conflicts[]`), the teacher-wise conflict highlight in `TimetablePanel.tsx`, `src/lib/api/timetable-sync.ts` (`syncTimetableSlotsForSubjects`, `detectTeacherClashes`), and `TeacherConflictsBanner`. **Do not rebuild conflict detection.**

**Add**
- Room selection per slot (+ room double-booking check, same shape as the teacher check).
- Teacher-wise timetable view as a first-class screen (currently only a filter).
- **Exam routine / date sheet**: `ExamSchedule` model (`examId`, `subjectId`, `date`, `periodDefinitionId`, `roomId`) with its own conflict rules (a class can't sit two papers at once; a room can't host two exams).
- Print/PDF per routine (class-wise, teacher-wise, exam-wise) via the existing PDF path.
- Weekend/holiday awareness: `Weekend` (days off per campus) and `Holiday` (name, from, to) models; grey those out in the grid and exclude from attendance generation.

**Edge cases** — a slot whose subject is later deleted (cascade or null it, don't orphan); teacher removed from a subject mid-term (already handled by `syncTimetableSlotsForSubjects` — reuse it).

---

## Module 14 — Operations Suite (Transport · Dormitory · Library · Inventory)

Four related CRUD-heavy sub-modules. Build in this order; each is independently shippable.

**Transport**
```prisma
model TransportRoute { id … campusId … title String; fare Int; @@map("transport_routes") }
model Vehicle { id … campusId … number String; model String?; driverName String?; driverPhone String?; capacity Int?; @@map("vehicles") }
model RouteVehicle { id … routeId String; vehicleId String; @@map("route_vehicles") }
```
Add `transportRouteId String?` to `Student`. Route fare should feed a fee line (Module 2).

**Dormitory**
```prisma
model DormRoomType { id … campusId … name String; @@map("dorm_room_types") }
model DormRoom { id … campusId … roomTypeId String; number String; capacity Int; @@map("dorm_rooms") }
```
Add `dormRoomId String?` to `Student`. Report = occupancy per room with remaining beds.

**Library**
```prisma
model BookCategory { id … campusId … name String; @@map("book_categories") }
model Book { id … campusId … categoryId String?; title String; author String?; isbn String?; subject String?; copiesTotal Int; copiesAvailable Int; @@map("books") }
model LibraryMember { id … campusId … userId String; memberNo String; @@map("library_members") }
model BookIssue { id … bookId String; memberId String; issuedAt DateTime; dueAt DateTime; returnedAt DateTime?; fine Int @default(0); @@map("book_issues") }
```

**Inventory / POS**
```prisma
model ItemCategory { id … campusId … name String; @@map("item_categories") }
model Item { id … campusId … categoryId String?; name String; unit String?; @@map("items") }
model ItemStore { id … campusId … name String; @@map("item_stores") }
model Supplier { id … campusId … name String; phone String?; email String?; address String?; @@map("suppliers") }
model ItemStock { id … itemId String; storeId String; quantity Int; @@unique([itemId, storeId]); @@map("item_stock") }
model ItemTransaction {
  id … campusId … itemId String; storeId String; kind String   // RECEIVE | SELL | ISSUE | RETURN
  quantity Int; unitPrice Int?; supplierId String?; issuedToUserId String?; date DateTime; note String?
  @@map("item_transactions")
}
```

**Edge cases (all four)** — never let stock/copies go negative (enforce in a transaction, not just the UI); returning a book must restore `copiesAvailable`; deleting a route/room with assigned students must be blocked; item receipts should post EXPENSE and sales post INCOME to the ledger (Module 4).

---

## Module 15 — Front-Desk Logs, Certificates & ID Cards

**Front-desk logs** — four near-identical simple models, campus-scoped, each with a filterable list + create modal:
```prisma
model VisitorLog   { id … campusId … name String; phone String?; purpose String?; toMeet String?; inTime DateTime; outTime DateTime?; note String?; @@map("visitor_logs") }
model Complaint    { id … campusId … complainantName String; type String; phone String?; date DateTime; description String?; actionTaken String?; status String @default("OPEN"); @@map("complaints") }
model PostalRecord { id … campusId … direction String /* RECEIVE|DISPATCH */; fromName String?; toName String?; referenceNo String?; date DateTime; note String?; fileKey String?; @@map("postal_records") }
model PhoneCallLog { id … campusId … name String; phone String; direction String /* IN|OUT */; date DateTime; followUpDate DateTime?; note String?; @@map("phone_call_logs") }
```
Plus an "Admin Setup" screen for the small option lists these reference (source, purpose, complaint type, reference).

**Certificates & ID cards**
```prisma
model CertificateTemplate {
  id … campusId … kind String   // STUDENT_CERTIFICATE | ID_CARD
  name String; backgroundKey String?   // S3 key
  layoutJson Json    // positioned fields: {field, x, y, fontSize, …}
  pageSize String @default("A4")
  @@map("certificate_templates")
}
```
- Designer: upload a background, place fields (name, father name, class, roll, admission no, photo, DOB, validity) on a preview canvas, persist coordinates in `layoutJson`.
- Bulk generate by class/section → multi-page PDF via the existing `src/lib/pdf.tsx` + S3 path.

**Edge cases** — students without a photo (render a placeholder); very long names (auto-shrink or clip); bulk generating 500 students (stream/paginate — don't build the whole PDF in memory).

---

## Out of scope for these 15 (log as follow-ups)

- **Communication hub** (notice board, bulk SMS/email/WhatsApp with templates) — partially exists (`ParentCommunication`, `src/lib/whatsapp`, `NotificationTemplate`); needs a UI, not new plumbing.
- **Reports suite** (merit list, tabulation sheet, progress card, user log) — mostly views over data the modules above create; build after them.
- **i18n + RTL**, **backup/restore**, **video tutorial library**.
- **Stripe/PayPal** — explicitly excluded; SafePay is the gateway.

---

## Definition of done (every module)

1. Migration written **and applied via the direct port**, `prisma generate` run, dev server restarted.
2. `npx tsc --noEmit` clean; `npx eslint <touched files>` clean.
3. All writes gated by `canManageOperations` + (once Module 11 lands) `assertPermission`.
4. Every query campus-scoped via `scopedCampusWhere` — verify a second campus can't read the data.
5. Destructive actions behind `ConfirmAction`; referenced rows blocked from deletion with a clear 409.
6. Verified in-browser as **both** `campusadmin@demo.com` and `principal@demo.com` (`Admin@123`), since `shared-admin` renders in both.
7. Money stored as `Int` paisa; no floats.
8. New UI uses the existing motion/shadow vocabulary (§0) — no new design primitives.
