# eSkooly.com — Competitor Intelligence Brief

Sources explored: `https://eskooly.com/` (homepage + feature pages: fees-structure, classes-subjects, fees-management, timetable-management, admissions-sims, accounts, employee-management), `https://eskooly.com/tutorials.php` (video tutorials), `https://knowledgebase.eskooly.com` (help-center), and `https://pro.eskooly.com/docs/` (full internal admin documentation with nested left navigation — the richest source; field-level details below).

## 1. What eSkooly Is

Free, PHP/Laravel-based school ERP/SIS (also sells paid Pro/Desktop/LMS versions). Target: schools, colleges, academies, tuition centers. USPs: "100% free forever", unlimited free SMS/WhatsApp, live classes built-in, card-scanning attendance, multilingual + RTL, themed branding on all printables. **Key selling hooks: everything auto-generates credentials, challans, ID cards, report cards, certificates** — setup once, outputs everywhere.

Product lines: eSkooly Basic Free (cloud), Mobile Apps (Android live, iOS soon), Desktop Paid, Pro Self-Hosted (Codecanyon PHP app, installable, multilingual incl. RTL Arabic), LMS Paid, Integrations (SMS gateways/WhatsApp), Cloud Services.

## 2. Onboarding / Demo Videos

Video library is a **"Browse by Module"** series — short (<2 min) screen-recording walkthroughs, one video per setup topic. Public playlist (tutorials.php):

1. How to get started with eSkooly (1:12) — create school account
2. How to set up your institution profile (0:50) — logo + branding for printables
3. How to set up time zone and currency (0:43)
4. How to change placement, theme and language (0:57) — LTR/RTL sidebar, header/sidebar backgrounds, translations
5. How to set up Android SMS gateway app (1:43) — free SMS sending

Also a full tutorial series playlist on YouTube (PLyb4PIpVVpZVlGAQwVTp-Tcyvq9upqK-C) covering the admin panel module-by-module.

**Pattern to copy: 30–90 second narrated screen recordings, one per setup task, embedded in-app/on help site.** They have no interactive guided tour — a 5-step wizard (like our CreateClassWizard) is ahead of them.

## 3. Student Onboarding / Admissions

Path: **Student Information → Student Admission**. Flow:

1. **Add Parents first** — parent info + **relation to student** (guardian type: Father/Mother/Guardian) + **sibling link** (sibling auto-links to same parent)
2. **Student form** — class, section, name, roll, gender, DOB, religion, blood group, category (General/Scholarship/OBC-type), group, previous school/history, transport + dormitory details, documents (birth certificate, transfer certificate, photo)
3. On save → **auto-creates login credentials** (username + password) for student AND parent → they can log in instantly
4. **Bulk import** — Excel/CSV with "Download Sample File" template first; import selects class + section
5. **Admission Query** module (CRM): track prospective-parent inquiries — source, follow-ups, active/inactive — before they're even students

Student detail page is a **tabbed profile**: Personal Info / Parents / Fees / Documents / **Timeline** (log of every action) / Academic performance. **Student Promote** module: select year+class → mark pass/fail → promote to next class in next session (class change is only allowed via promotion — enrollment locked to session).

## 4. Teacher / Staff Onboarding

Path: **Human Resource → Staff List → Add Staff**. Single big form with sections:

- **Basic info** — name, email, phone, DOB, gender, religion, blood group, role, designation, qualifications, joining date, contract details
- **Payroll** — salary, allowances, deductions, bonus (per staff, used by payroll module)
- **Bank info** — account name, number, bank
- **Social links + Documents** — CV, ID proofs, certificates (uploads)
- Staff profile also has **Timeline** tab
- **Leave** module separate: Leave Type (name + days) → Leave Define (per role: type + days) → Apply Leave (remaining days shown) → Approve Leave Request
- **Payroll**: search role+month+year → Generate Payroll (earnings, deductions, summary) → Payroll Report
- 6 default roles (SuperAdmin, Admin, Teacher, Accountant, Librarian, Receptionist) with **module-level View/Add/Edit/Delete permission matrix** per role

## 5. Classes, Sections, Subjects, Timetable, Calendar

### Setup chain (Academics menu):

- **Class** — name + sections (multi-select on the class form)
- **Sections** — standalone list (Section A/B/C)
- **Class Room** — room number + capacity (used by timetable + exam schedule)
- **Subject** — name + **subject code** + **theory/practical type toggle**
- **Assign Subject** — per class+section, assign subjects with course teacher
- **Assign Class Teacher** — class + section + teacher (separate from subject assignment)
- **Class & Exam Time Setup** — time type (class/exam), period, start/end time → drives timetable grid
- **Class Routine (timetable)** — select class+section → weekly grid (days × periods) → click a cell → pick subject + teacher + room. **Teacher-wise view** auto-generated. Conflict-free (no double-booking). Print per routine.
- **Weekend** (System Setting) — which days are off → **Holiday** (calendar shows them) → **Event** (title, start/end date, shown in calendar)
- Academic Year + **Session** management (session = current academic term the school runs on)

### Calendar pieces: Holiday + Events render on the dashboard calendar; weekends drive attendance/timetable generation.

## 6. Fee Structure & Fee Management

Key money module — **two layers: structure setup, then collection.**

### A. Fee Structure setup (Fees Collection menu):

1. **Fees Type** — name + **fees code** (monthly tuition, exam fee, lab charges, annual fund, transport) — the *fee head*
2. **Fees Group** — name (a *package* of fee types, e.g. "Monthly Package") — group contains multiple types
3. **Fees Master** — **the pricing row**: select Fees Group + Fees Type + **date** + **amount**. Class-agnostic
4. **Assign (from Fees Master)** — assign the fee group to specific **classes/sections** (how different classes get different amounts)
5. **Fees Discount** — name, **discount code**, **type (percentage or flat)**, amount → then **Assign Discount** to students (sibling discount, staff-child, merit-based)
6. **Fees Carry Forward** — carry previous-session balance into the new session (class+section → list of balances → add balance)

### B. Fee collection & operation:

- **Collect Fees** — search class/section → student list with unpaid fees → **Add Fees** form: **date, amount, discount group, discount, fine, payment mode** → balance auto-computed
- **Search Fees Payment** — by payment id → view details → **print slip** (thermal/A4)
- **Fees Statement** (student panel too) — per student: paid, discount applied, due
- **Balance Fees Report** — per section with **grand totals** of amount / discount / fine / paid / balance
- **Transaction Report** — date-range: fees collected + income + expenses with grand totals
- **Student Fine Report**, defaulter highlighting + SMS reminders
- **Online payment**: PayPal + Stripe gateways enabled in System Settings → students/parents pay unpaid fees online from their portal

### C. Accounts (non-fee money):

- **Chart of Account** — account head + type (assets/liabilities/equity/income/expense)
- **Payment Method** list, **Bank Account** (name + opening balance)
- **Income** / **Expense** — source name + account head + payment method + date + amount
- **Profit** report (income − expense over date range)
- **Inventory/POS**: Item Category → Item List → Item Store → Supplier → Item Receive (qty × unit price, paid/due) → Item Sell → Issue Item — with purchase/sell receipts

## 7. Complete Nested Left Navigation Map (admin)

```
Dashboard (student/teacher/staff counts, income vs expense, today's updates)
Admin Section → Admission Query, Visitor Book, Complaint, Postal Receive/Dispatch, Phone Call Log,
  Admin Setup (source/purpose/complaint-type/reference), Student Certificate, Generate Certificate,
  Student ID Card, Generate ID Card
System Setting → General Setting, Email Setting, Payment Method (PayPal/Stripe), Role Permission,
  Base Setup (gender/religion/blood group), Academic Year, Session, Holiday, SMS Settings,
  Weekend, Language Settings, Backup, Update System
Dormitory → Rooms, List, Room Type, Student Report
Transport → Route (title+fare), Vehicle (no/model/driver), Assign Vehicle, Report
Inventory → Category, Item, Store, Supplier, Receive, Receive List, Sell, Issue Item
Library → Add Book (title/category/subject), Book List, Categories, Members, Issue/Return, Issued List
Communicate → Notice Board, Send Message, Send Email/SMS (group/individual/class), Log, Event
Homework → Add (class/section/subject/date/submission/marks), Evaluation Report
Academics → Class Routine, Assign Subject, Assign Class Teacher, Subject, Class, Sections,
  Class Room, Class & Exam Time Setup
Examination → Add Exam, Exam (per-class setup with marks distribution: written 70 + class test 20 +
  homework 10), Exam Schedule, Marks Register (absent checkbox), Exam Attendance, Marks Grade
  (grade+GPA+%range), Send Marks by SMS, Question Group, Question Bank, Online Exam
Leave → Approve, Apply, Define, Type
Human Resource → Staff List, Staff Attendance, Attendance Report, Payroll, Payroll Report
Accounts → Profit, Income, Expense, Search, Chart of Account, Payment Method, Bank Account
Fees Collection → Collect Fees, Search Payment, Search Due, Fees Master, Fees Group, Fees Type,
  Fees Discount, Fees Carry Forward
Teacher → Upload Content (assignment/study material/syllabus/other downloads)
Student Information → Student Admission, Student List, Attendance, Attendance Report,
  Student Category, Student Group, Student Promote, Disabled Students
Reports → Student Report, Guardian Report, Student History, Login Report, Fees Statement,
  Balance Fees, Transaction, Class Report, Class Routine, Exam Routine, Teacher Class Routine,
  Merit List, Online Exam, Mark Sheet, Tabulation Sheet, Progress Card, Student Fine, User Log
Student Panel → Profile, Fees (pay online), Class Routine, Homework, Download Center, Attendance,
  Examinations, Online Exam, Notice Board, Subjects, Teachers, Library, Transport, Dormitory
Parents Panel → My Children, Fees, Class Routine, Homework, Attendance, Exam Result, Notice Board,
  Subjects, Teachers, Transport, Dormitory
```

## 8. Gap Analysis — skoolee-ai vs eSkooly

**Have (ours):** classes/sections, subjects+teachers, syllabus topics, exams/cycles, report cards, attendance, students+guardian, bulk import, timetables, fees panel, AI insights, academic year.

**Missing / to build:**

1. **Sibling linking + parent portal instant credential generation** on admission (they auto-create student + parent logins)
2. **Admission Query / lead CRM** (source, follow-ups, active/inactive) — pre-enrollment pipeline
3. **Student Category + Student Group** (scholarship/transport eligibility tags driving discounts)
4. **Fees architecture as their 4-layer model**: Fee Type (head+code) → Fee Group (package) → **Fees Master (price rows assigned per class/section)** → Discounts (code, % or flat, assigned per student) + **Carry Forward** (session balances)
5. **Payment methods + Bank accounts + Chart of accounts** for the Accounts ledger (income/expense/profit with grand totals)
6. **Fine handling on collection** (date, amount, discount, fine, payment mode in one form)
7. **Defaulter lists with SMS/WhatsApp reminders** + **transaction/fees-statement reports**
8. **Class Rooms (number+capacity) + Class & Exam Time setup (periods + start/end)** feeding timetable + exam schedule cells
9. **Teacher-wise timetable view + exam routine/date sheet** + print per routine
10. **Staff module depth**: payroll (earnings/deductions/summary), leave types/define/apply/approve, job/offer letters, staff timeline
11. **Student Promote** (pass/fail → next session/class; class change only via promotion) + Disabled students archive
12. **Library, Dormitory, Transport (routes/fare/vehicles), Inventory/POS, Postal/Visitor/Complaint/Phone-call logs** — admin-section operations
13. **Role-based permission matrix** (View/Add/Edit/Delete per module per role) + 6 default roles incl. Accountant/Librarian/Receptionist
14. **Certificate + ID card designers** (background image upload, bulk generate by class/section)
15. **Online payment (Stripe/PayPal) on student/parent fee statements**
16. **Video tutorial library** — short module-based screen recordings + knowledge base
17. **Multilingual + RTL + theme placement**
18. **User log / audit trail** + backup management
