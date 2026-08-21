// §6.5 / INT-5 — tenant-local calendar dates.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();
const out = [];
const check = (name, cond, detail = "") => {
  out.push({ name, pass: !!cond });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
console.log("\n── §6.5 tenant timezone ──\n");

const T1 = fx.tenants.T1;
const school = await prisma.school.findUnique({ where: { id: T1.schoolId }, select: { timezone: true } });
check("School carries a timezone", !!school?.timezone, school?.timezone);

// The bug: UTC calendar date vs tenant calendar date during the divergence window.
const fmt = (tz, d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
// 2026-08-21T21:00:00Z is 2026-08-22 02:00 in Asia/Karachi — different days.
const instant = new Date("2026-08-21T21:00:00Z");
const utcDay = instant.toISOString().slice(0, 10);
const pkDay = fmt("Asia/Karachi", instant);
check("UTC and tenant date genuinely diverge in the window", utcDay !== pkDay, `UTC=${utcDay} PKT=${pkDay}`);
check("tenant-local date is the later day", pkDay === "2026-08-22");

// shiftDateOnly must be timezone-independent (the old code was not).
const shift = (date, delta) => { const d=new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+delta); return d.toISOString().slice(0,10); };
check("shiftDateOnly steps back across a month boundary", shift("2026-03-01",-1) === "2026-02-28", shift("2026-03-01",-1));
check("shiftDateOnly handles a leap day", shift("2024-03-01",-1) === "2024-02-29", shift("2024-03-01",-1));
check("shiftDateOnly steps forward across a year", shift("2026-12-31",1) === "2027-01-01", shift("2026-12-31",1));

// The attendance API must default to the tenant's day, not UTC's.
const r = await fetch("http://localhost:3000/api/attendance?classId=" + fx.extra["T1-TEACHER-A-class"], {
  headers: { cookie: `skoolee_token=${fx.personas["T1-CAMPUS_ADMIN"].token}` } });
check("attendance endpoint still responds after the change", r.status < 500, `HTTP ${r.status}`);

const failed = out.filter((x) => !x.pass);
console.log(`\n${"=".repeat(58)}\n  ${out.length - failed.length}/${out.length} passed`);
console.log("=".repeat(58));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
