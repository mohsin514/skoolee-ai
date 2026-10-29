# SKAI-1145 — Personal data breach runbook (72-hour clock)

> **⚠️ NEEDS COUNSEL REVIEW.** This runbook is an operational draft, not legal advice. Notice deadlines and regulator contacts below are mostly unverified ([U]). Counsel must confirm each country row before the runbook is relied on for a real incident.

Status: draft, 29 October 2026. Owner: Mohsin Ali.
Builds on: `docs/research/2026-10/SKAI-1101-ksa-data-residency-decision.md` (§6 follow-up "breach runbook with a 72-hour SDAIA path") and `docs/research/2026-10/SKAI-1105-gcc-data-law-matrix.md` (§3 item 3; breach-notice row).
Related: `docs/recovery/RUNBOOK.md` (technical recovery; this runbook covers the legal notice path), KSA DPA addendum (SKAI-1144), DPA template (SKAI-1158).

**Confidence legend.** [V] verified in a cited source. [U] unverified; confirm before relying on it.

## 1. Roles

Skoolee is usually the **processor**; the school is the **controller** and normally files the regulator notice. Skoolee must tell the school fast enough for it to meet its deadline (DPA: within 24 hours of confirming a breach).

| Role | Who | Backup |
|---|---|---|
| Incident lead | Engineering lead on call | Founder |
| Privacy lead (owns this runbook, notices) | Mohsin Ali | Counsel |
| Communications (schools, guardians) | Customer success lead | Founder |
| Counsel | External GCC counsel [U — not yet appointed] | — |

Fill in names and phone numbers in the private on-call sheet, not in this repo.

## 2. The clock

**T0 = the moment Skoolee becomes aware** that a personal data breach has likely happened (not when it is fully understood). Write T0 in the incident log immediately.

| Time from T0 | Action | Owner |
|---|---|---|
| 0–1 h | Open incident channel and log. Record T0. Contain (revoke keys, disable feature flag, block route, rotate secrets). Preserve evidence (logs, DB snapshots) — do not delete anything. | Incident lead |
| ≤ 4 h | First triage: what data, which schools (`school_id`), which countries, how many people, is it ongoing? Classify severity (§3). | Incident lead + privacy lead |
| ≤ 8 h | Brief counsel. Decide whether the breach is notifiable in each affected country (§4). | Privacy lead |
| ≤ 24 h | **Notify every affected school** (controller) in writing with the facts known so far (§5 template). Offer to help draft their regulator notice. | Privacy lead + comms |
| ≤ 48 h | Draft regulator notices (with school) and data-subject notices if harm is likely. | Privacy lead + counsel |
| **≤ 72 h** | **Regulator notice filed** in every country where 72 hours applies (KSA, Bahrain, Oman, Kuwait — all [U]). If facts are incomplete, file what is known and say a follow-up will come. | School (controller), supported by Skoolee |
| After 72 h | Follow-up notices; data-subject notices where required; post-incident review within 10 working days. | Privacy lead |

If Skoolee is ever the **controller** (e.g. our own staff or marketing data), Skoolee files the regulator notice itself on the same clock.

## 3. Severity

| Level | Example | Notify regulator? |
|---|---|---|
| S1 — Critical | Cross-tenant data exposure; health/welfare data of minors exposed; credentials dumped | Yes, assume notifiable |
| S2 — High | Single school's contact data exposed to an outsider; AI provider received un-pseudonymised names | Likely; counsel decides |
| S3 — Low | Encrypted data lost with key safe; internal misdirected email quickly recalled | Usually no; record the decision |

Every breach, notifiable or not, is recorded in the breach register (§7).

## 4. Regulator contact table

All rows are [U] unless marked. Counsel must confirm the deadline, the channel and whether data subjects must also be told. Fill in the "Channel" column with the official portal or email once confirmed.

| Country | Law | Regulator | Deadline to regulator | Tell data subjects? | Channel | Status in our plan |
|---|---|---|---|---|---|---|
| Pakistan | No comprehensive data-protection statute in force [U]; PECA 2016 [U] | — (PTA / FIA for cybercrime [U]) | None statutory [U] | Contractual only [U] | — | Home market |
| UAE (federal) | Decree-Law 45/2021 [V] | UAE Data Office [V] | "Promptly"; exact timing in executive regulations [U] | If harm likely [U] | | Dubai pilot |
| KSA | PDPL, Royal Decree M/19 [V] | SDAIA [V] | **72 hours** [U] | If harm likely [U] | National data governance platform [U] | Pilot (discovery) |
| Qatar | Law 13/2016 [V] | NCSA [U] | Not fixed; notify if serious harm [U] | If serious harm [U] | | Deferred |
| Bahrain | Law 30/2018 [V] | Personal Data Protection Authority [V] | 72 hours reported [U] | [U] | | Deferred |
| Oman | Royal Decree 6/2022 [V] | Ministry of Transport, Communications and IT [U] | 72 hours reported [U] | [U] | | Deferred |
| Kuwait | CITRA Data Privacy Protection Regulation [U] | CITRA [U] | 72 hours reported [U] | [U] | | Deferred |

**Rule of thumb until counsel confirms:** treat **72 hours from T0** as the deadline in every country.

Sub-processor incidents: if Supabase, Vercel, OpenAI, Meta/WhatsApp or an email/SMS provider tells us about a breach, T0 is when **we** receive their notice. Ask them for scope by tenant immediately.

## 5. Notice templates

### 5.1 To the school (controller) — within 24 hours

> **Subject:** Skoolee AI — personal data incident affecting [School name] — [Incident ID]
>
> On [date, time, timezone] we became aware of [short description]. The data involved is [categories] for approximately [N] [students/guardians/staff]. The incident [is contained / is still being contained]. We have [actions taken]. We do not yet know [open questions] and will update you by [time].
>
> Depending on your country, you may need to notify [regulator] within 72 hours of this notice. We can help you draft that notice. Your contact for this incident is [name, phone].

### 5.2 Regulator notice — fields to prepare

Controller and processor details; DPO or contact; T0 and how discovered; nature of the breach; categories and approximate number of data subjects and records; likely consequences; measures taken and proposed; whether data subjects have been or will be told; cross-border aspects (hosting region us-east-1, see SKAI-1146). [U: confirm each regulator's required fields.]

### 5.3 Data subjects (guardians, staff) — plain language, EN / AR / UR

What happened, what data, what we have done, what they should do (e.g. watch for phishing), who to contact. Send through the school's normal channel unless the school asks us to send it.

## 6. Technical checklist

- Find the scope by `school_id` (tenant guard logs, audit trail).
- Rotate affected secrets in Vercel and GitHub Environment secrets; never paste secrets into the incident channel.
- If AI traffic is involved, switch the AI feature flag off for affected schools and check the pseudonymisation logs.
- Follow `docs/recovery/RUNBOOK.md` for any data restore. Do not reset or `db push` a production database during an incident.

## 7. Breach register

Keep one row per incident (private store, not this repo): Incident ID; T0; discovered by; severity; schools; countries; data categories; people affected; regulator(s) notified and when; data subjects notified and when; root cause; fix; review date.

## 8. Rehearsal

Run a tabletop exercise against this runbook before the first KSA paid pilot, then every 6 months. Record the timings achieved against the 72-hour clock.

## 9. Open questions for counsel

1. Confirm each country's deadline, channel and data-subject notice rule (§4). [U]
2. Pakistan: is any breach notice required by law or sector regulator for schools? [U]
3. UAE: status of the PDPL executive regulations and their breach timing. [U]
4. Does an AI provider receiving pseudonymised data count as a breach if pseudonymisation failed for one record? [U]
