// §3 — Authentication, Session & Licence (P0)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { SignJWT, decodeJwt } from "jose";
const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");
const out = [];
const check = (id, name, cond, detail = "") => {
  out.push({ id, name, pass: !!cond, detail });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${id.padEnd(10)} ${name}${detail ? "  — " + detail : ""}`);
};
const get = (path, token) => fetch(`${BASE}/api${path}`, { headers: token ? { cookie: `skoolee_token=${token}` } : {} });

const t1Admin = fx.personas["T1-CAMPUS_ADMIN"];
const T1 = fx.tenants.T1, T2 = fx.tenants.T2;
console.log("\n── §3 Authentication, Session & Licence ──\n");

// AUTH-1.4 — forge role=APP_OWNER by re-signing with a WRONG key.
const claims = decodeJwt(t1Admin.token);
const forgedWrongKey = await new SignJWT({ ...claims, role: "APP_OWNER" })
  .setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d")
  .sign(new TextEncoder().encode("attacker-guessed-secret"));
let r = await get("/owner/schools", forgedWrongKey);
check("AUTH-1.4", "JWT signed with wrong key rejected", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

// AUTH-1.4b — payload edited, signature left untouched (classic tamper).
const [h, p, sig] = t1Admin.token.split(".");
const tamperedPayload = Buffer.from(JSON.stringify({ ...claims, role: "APP_OWNER" }))
  .toString("base64url");
r = await get("/owner/schools", `${h}.${tamperedPayload}.${sig}`);
check("AUTH-1.4", "tampered payload with original signature rejected", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

// AUTH-1.5 — schoolId claim swapped to T2 (requires the real signing key).
const forgedSchool = await new SignJWT({ ...claims, schoolId: T2.schoolId })
  .setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d").sign(SECRET);
r = await get("/students", forgedSchool);
const body = await r.text();
check("AUTH-1.5", "schoolId claim swap does not expose T2 data",
  !body.includes(fx.extra["T2-student-1"]), `HTTP ${r.status}`);

// AUTH-1.6 — expired token.
const expired = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" })
  .setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(SECRET);
r = await get("/students", expired);
check("AUTH-1.6", "expired token rejected", r.status === 401, `HTTP ${r.status}`);

// AUTH-1.10 — alg=none downgrade.
const noneTok = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
  + "." + Buffer.from(JSON.stringify({ ...claims, role: "APP_OWNER" })).toString("base64url") + ".";
r = await get("/owner/schools", noneTok);
check("AUTH-1.4", "alg=none downgrade rejected", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

// AUTH-1.8 — deactivated user holding a still-valid token.
const disabled = fx.personas["T1-TEACHER-DISABLED"];
const disabledTok = await new SignJWT({
  userId: disabled.userId, email: disabled.email, role: disabled.role,
  schoolId: disabled.schoolId, campusId: disabled.campusId,
  schoolSlug: T1.slug, schoolStatus: "ACTIVE", onboardingComplete: true,
}).setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d").sign(SECRET);
r = await get("/students", disabledTok);
check("AUTH-1.8", "deactivated user with a valid token is refused",
  r.status === 401 || r.status === 403, `HTTP ${r.status}`);

// AUTH-1.2 / AUTH-3.1 — no user enumeration on login.
const bad1 = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: t1Admin.email, password: "WrongPassword#1" }) });
const bad2 = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "nobody-here@example.invalid", password: "WrongPassword#1" }) });
const b1 = await bad1.text(), b2 = await bad2.text();
check("AUTH-1.2", "known vs unknown email give identical response",
  bad1.status === bad2.status && b1 === b2, `${bad1.status}/${bad2.status}`);

// AUTH-5.1 / 5.2 — suspended school (T4) blocked at the API layer.
const t4 = fx.personas["T4-SUPER_ADMIN"];
if (t4?.token) {
  r = await get("/students", t4.token);
  check("AUTH-5.2", "suspended school blocked at API layer (not just UI)",
    r.status === 402 || r.status === 403, `HTTP ${r.status}`);
}

// AUTH-1.12 — cookie flags.
const fresh = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: t1Admin.email, password: fx.password }) });
const setCookie = fresh.headers.get("set-cookie") || "";
check("AUTH-1.12", "cookie HttpOnly", /HttpOnly/i.test(setCookie));
check("AUTH-1.12", "cookie SameSite=Lax", /SameSite=Lax/i.test(setCookie));
check("AUTH-1.12", "cookie Path=/", /Path=\//i.test(setCookie));
check("AUTH-1.12", "cookie Max-Age set", /Max-Age=\d+/i.test(setCookie));

// AUTH-4.2 — unauthenticated API access.
r = await get("/students", null);
check("AUTH-1.x", "unauthenticated request refused", r.status === 401, `HTTP ${r.status}`);

const failed = out.filter((x) => !x.pass);
console.log(`\n${"=".repeat(62)}\n  ${out.length - failed.length}/${out.length} passed`);
if (failed.length) { console.log("\n  FAILURES:"); failed.forEach((f) => console.log(`   ${f.id} ${f.name} ${f.detail}`)); }
console.log("=".repeat(62));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
