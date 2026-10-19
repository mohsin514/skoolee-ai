/**
 * Front Desk (auth redesign) foundation: pure helpers, shared copy and the
 * structural guarantees the shared auth components rely on.
 *   node --import tsx --test tests/design-system/auth-foundation.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isValidElement } from "react";
import { FIXED_GAZE, caretRatio, gazeVector, resolveMood, type MascotState } from "../../src/lib/auth/mascot-mood";
import { inboxProvidersFor, inboxUrl } from "../../src/lib/auth/inbox-provider";
import { suggestEmailDomain } from "../../src/lib/auth/email-typo";
import { greetingBucket } from "../../src/lib/auth/greeting";
import { clearRegisterDraft, saveRegisterDraft, stashAuthEmail, takeAuthEmail, takeRegisterDraft, type RegisterDraft } from "../../src/lib/auth/auth-handoff";
import { fillNodes, fillText } from "../../src/lib/auth/fill-nodes";
import { authCopy } from "../../src/lib/auth/auth-copy";
import { RESET_LINK_TTL_MS, RETRY_SUGGESTION_MS, VERIFICATION_TTL } from "../../src/lib/auth/link-expiry";
import { AUTH_EMAIL_SUBJECTS } from "../../src/lib/auth/email-subjects";

const base: MascotState = { focus: "none", capsLock: false, error: false, success: false, waiting: false, thinking: false, celebrate: false };
const mood = (patch: Partial<MascotState>) => resolveMood({ ...base, ...patch });

test("resolveMood: full priority matrix", () => {
  assert.equal(mood({}), "idle");
  assert.equal(mood({ focus: "field" }), "attentive");
  assert.equal(mood({ focus: "control" }), "attentive");
  assert.equal(mood({ focus: "secret" }), "shy");
  assert.equal(mood({ focus: "secret-revealed" }), "peek");
  assert.equal(mood({ thinking: true }), "thinking");
  assert.equal(mood({ thinking: true, focus: "field" }), "thinking");
  assert.equal(mood({ thinking: true, focus: "secret" }), "shy");
  // Caps Lock during a secret field gives wide; elsewhere it is not stated in text, so no pose.
  assert.equal(mood({ focus: "secret", capsLock: true }), "wide");
  assert.equal(mood({ focus: "secret-revealed", capsLock: true }), "wide");
  assert.equal(mood({ focus: "field", capsLock: true }), "attentive");
  assert.equal(mood({ focus: "secret", capsLock: true, error: true }), "concerned");
  assert.equal(mood({ error: true, focus: "secret-revealed" }), "concerned");
  // waiting beats error
  assert.equal(mood({ waiting: true, error: true }), "waiting");
  assert.equal(mood({ success: true, waiting: true, error: true }), "happy");
  // celebrate beats everything
  const everything: Partial<MascotState> = { focus: "secret", capsLock: true, error: true, success: true, waiting: true, thinking: true, celebrate: true };
  assert.equal(mood(everything), "celebrate");
});

test("FIXED_GAZE: shy straight ahead, wide looks up and away from the password", () => {
  assert.deepEqual(FIXED_GAZE.shy, { x: 0, y: 0 });
  assert.deepEqual(FIXED_GAZE.idle, { x: 0, y: 0 });
  assert.ok((FIXED_GAZE.wide?.y ?? 0) < 0);
  assert.deepEqual(FIXED_GAZE.thinking, { x: -0.6, y: -0.7 });
  assert.deepEqual(FIXED_GAZE.happy, FIXED_GAZE.celebrate);
  assert.equal(FIXED_GAZE.attentive, undefined);
  assert.equal(FIXED_GAZE.peek, undefined);
});

test("caretRatio: clamps, and falls back to the end when selectionStart is null", () => {
  assert.equal(caretRatio(0, 10), 0);
  assert.equal(caretRatio(12, 24), 0.5);
  assert.equal(caretRatio(null, 12), 0.5);
  assert.equal(caretRatio(null, 48), 1);
  assert.equal(caretRatio(500, 10), 1);
  assert.equal(caretRatio(-4, 10), 0);
  assert.equal(caretRatio(null, 0), 0);
});

test("gazeVector: proportional inside reach, unit length beyond it, RTL-symmetric", () => {
  assert.deepEqual(gazeVector({ x: 0, y: 0 }, { x: 0, y: 0 }), { x: 0, y: 0 });
  assert.deepEqual(gazeVector({ x: 0, y: 0 }, { x: 120, y: 0 }), { x: 0.5, y: 0 });
  assert.deepEqual(gazeVector({ x: 0, y: 0 }, { x: 0, y: 960 }), { x: 0, y: 1 });
  const far = gazeVector({ x: 0, y: 0 }, { x: 3000, y: 4000 });
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 1e-9);
  for (const target of [{ x: 40, y: 90 }, { x: 600, y: -20 }, { x: 13, y: 7 }]) {
    const ltr = gazeVector({ x: 500, y: 100 }, { x: 500 + target.x, y: 100 + target.y });
    const rtl = gazeVector({ x: 500, y: 100 }, { x: 500 - target.x, y: 100 + target.y });
    assert.ok(Math.abs(ltr.x + rtl.x) < 1e-9, "x mirrors");
    assert.equal(ltr.y, rtl.y);
    assert.ok(Math.abs(ltr.x) <= 1 && Math.abs(ltr.y) <= 1);
  }
});

test("inboxProvidersFor: provider map, school domains and invalid input", () => {
  assert.deepEqual(inboxProvidersFor("a@gmail.com"), ["gmail"]);
  assert.deepEqual(inboxProvidersFor("A@GoogleMail.com"), ["gmail"]);
  for (const domain of ["outlook.com", "outlook.sa", "hotmail.co.uk", "live.com", "msn.com"]) assert.deepEqual(inboxProvidersFor(`x@${domain}`), ["outlook"], domain);
  for (const domain of ["yahoo.com", "yahoo.co.uk", "ymail.com"]) assert.deepEqual(inboxProvidersFor(`x@${domain}`), ["yahoo"], domain);
  for (const domain of ["icloud.com", "me.com", "mac.com"]) assert.deepEqual(inboxProvidersFor(`x@${domain}`), ["icloud"], domain);
  for (const domain of ["horizon.edu", "school.edu.pk", "example.test", "beaconhouse.net"]) assert.deepEqual(inboxProvidersFor(`x@${domain}`), ["gmail", "microsoft365"], domain);
  for (const invalid of ["", "nope", "a@b", "a b@c.com", "@x.com"]) assert.deepEqual(inboxProvidersFor(invalid), [], invalid);
});

test("inboxUrl never carries the address or its local part", () => {
  const samples = [
    "principal@horizon.edu", "amina.khan@gmail.com", "bursar+fees@school.edu.pk", "it-admin@beaconhouse.net", "head.teacher@outlook.com",
    "o'neil@hotmail.co.uk", "zara@live.com", "accounts@msn.com", "omar@yahoo.com", "sana@ymail.com",
    "fatima@icloud.com", "ali@me.com", "registrar@mac.com", "reception@example.test", "xavier@googlemail.com",
    "noor.ul.ain@school.sa", "hrdesk@group.ae", "teacher7@kw.edu.kw", "admin@synthetic.invalid", "dean@university.ac.uk",
  ];
  for (const email of samples) {
    const local = email.slice(0, email.indexOf("@")).toLowerCase();
    for (const provider of inboxProvidersFor(email)) {
      const url = inboxUrl(provider);
      assert.ok(url.startsWith("https://"), url);
      assert.ok(!url.includes("@"), `${provider} url contains @`);
      assert.ok(!url.toLowerCase().includes(local), `${provider} url contains ${local}`);
    }
  }
  assert.equal(inboxUrl("gmail"), "https://mail.google.com/mail/u/0/#search/in%3Aanywhere+SkooleeAI");
});

test("suggestEmailDomain: fixes common slips, never touches real or test domains", () => {
  const positives: Record<string, string> = {
    "name@gmial.com": "name@gmail.com",
    "name@gmai.com": "name@gmail.com",
    "name@gamil.com": "name@gmail.com",
    "name@hotmial.com": "name@hotmail.com",
    "name@outlok.com": "name@outlook.com",
    "name@yahooo.com": "name@yahoo.com",
    "name@gmail.con": "name@gmail.com",
    "name@gmail.cmo": "name@gmail.com",
    "Name.Surname@GMIAL.COM": "Name.Surname@gmail.com",
  };
  for (const [input, expected] of Object.entries(positives)) assert.equal(suggestEmailDomain(input), expected, input);
  const nulls = [
    "office@example.test", "office@example.invalid", "x@synthetic.invalid", "principal@horizon.edu", "bursar@school.edu.pk",
    "name@gmail.com", "a@a.co", "name@co.uk", "name@gmail.co", "name@mail.com", "name@ymail.com", "name@yahoo.ca", "name@hotmail.co.uk",
    "", "plain", "a@b", "a b@gmial.com", "@gmial.com",
  ];
  for (const input of nulls) assert.equal(suggestEmailDomain(input), null, input);
});

test("greetingBucket: boundaries", () => {
  const at = (h: number, m: number) => new Date(2026, 9, 19, h, m);
  assert.equal(greetingBucket(at(4, 59)), "late");
  assert.equal(greetingBucket(at(5, 0)), "morning");
  assert.equal(greetingBucket(at(11, 59)), "morning");
  assert.equal(greetingBucket(at(12, 0)), "afternoon");
  assert.equal(greetingBucket(at(16, 59)), "afternoon");
  assert.equal(greetingBucket(at(17, 0)), "evening");
  assert.equal(greetingBucket(at(22, 59)), "evening");
  assert.equal(greetingBucket(at(23, 0)), "late");
  assert.equal(greetingBucket(at(0, 0)), "late");
});

class MemoryStorage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
}

function withStorage<T>(storage: unknown, run: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get: () => { if (storage instanceof Error) throw storage; return storage; } });
  try { return run(); } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  }
}

test("auth-handoff: email is read once, only when it looks like an email", () => {
  const store = new MemoryStorage();
  withStorage(store, () => {
    stashAuthEmail("  principal@horizon.edu ");
    assert.equal(store.getItem("skoolee-auth-email"), "principal@horizon.edu");
    assert.equal(takeAuthEmail(), "principal@horizon.edu");
    assert.equal(takeAuthEmail(), null);
    stashAuthEmail("not an email");
    assert.equal(takeAuthEmail(), null);
    store.setItem("skoolee-auth-email", "<script>");
    assert.equal(takeAuthEmail(), null);
    assert.equal(store.getItem("skoolee-auth-email"), null);
  });
});

test("auth-handoff: blocked or throwing storage returns null and never throws", () => {
  const throwing = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  for (const storage of [throwing, new Error("access denied"), undefined]) {
    withStorage(storage, () => {
      assert.doesNotThrow(() => stashAuthEmail("a@b.co"));
      assert.equal(takeAuthEmail(), null);
      assert.doesNotThrow(() => saveRegisterDraft({ type: "school_group", name: "A" }));
      assert.equal(takeRegisterDraft(), null);
      assert.doesNotThrow(() => clearRegisterDraft());
    });
  }
});

test("auth-handoff: register drafts are validated, read once and never hold passwords", () => {
  const store = new MemoryStorage();
  withStorage(store, () => {
    const hostile = {
      type: "single_campus", name: "Amina", email: "a@b.co", phone: "+92 300", schoolName: "Horizon", country: "PK",
      regIdMode: "auto", regId: "SHOULD-NOT-SURVIVE", password: "hunter22", confirmPassword: "hunter22", newPassword: "x", token: "t",
    } as unknown as RegisterDraft;
    saveRegisterDraft(hostile);
    const raw = store.getItem("skoolee-register-draft") ?? "";
    assert.ok(raw.length > 0);
    assert.doesNotMatch(raw, /password|hunter22|token/i);
    assert.doesNotMatch(raw, /SHOULD-NOT-SURVIVE/, "regId is kept only in manual mode");
    const draft = takeRegisterDraft();
    assert.deepEqual(draft, { type: "single_campus", name: "Amina", email: "a@b.co", phone: "+92 300", schoolName: "Horizon", country: "PK", regIdMode: "auto" });
    assert.equal(takeRegisterDraft(), null, "read once");

    saveRegisterDraft({ type: "school_group", regIdMode: "manual", regId: "HGS-1" });
    assert.deepEqual(takeRegisterDraft(), { type: "school_group", regIdMode: "manual", regId: "HGS-1" });

    store.setItem("skoolee-register-draft", JSON.stringify({ type: "university", name: "x" }));
    assert.equal(takeRegisterDraft(), null, "unknown type is rejected");
    store.setItem("skoolee-register-draft", "{not json");
    assert.equal(takeRegisterDraft(), null);
    saveRegisterDraft({ type: "school_group", name: "A" });
    clearRegisterDraft();
    assert.equal(store.getItem("skoolee-register-draft"), null);
  });
});

test("fillNodes / fillText keep the translator's word order", () => {
  const out = fillNodes("…setting up {0}.", "NODE");
  assert.equal(out.length, 3);
  assert.equal(out[0], "…setting up ");
  assert.ok(isValidElement(out[1]));
  assert.equal(out[2], ".");
  assert.equal(fillNodes("{0}", "x").length, 1);
  assert.equal(fillText("Try again in {0}s", 12), "Try again in 12s");
  assert.equal(fillText("{1} · {0}", "a", "b"), "b · a");
});

test("auth-copy: en, ar and ur carry every key, non-empty, with the same slots", () => {
  const flatten = (value: unknown, prefix = ""): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof child === "string") out[path] = child;
      else Object.assign(out, flatten(child, path));
    }
    return out;
  };
  const en = flatten(authCopy.en);
  for (const lang of ["ar", "ur"] as const) {
    const other = flatten(authCopy[lang]);
    assert.deepEqual(Object.keys(other).sort(), Object.keys(en).sort(), lang);
    for (const [key, text] of Object.entries(other)) {
      assert.ok(text.trim().length > 0, `${lang}.${key} empty`);
      assert.deepEqual(text.match(/\{\d\}/g) ?? [], en[key].match(/\{\d\}/g) ?? [], `${lang}.${key} slots`);
    }
  }
  // Truthfulness: lifetimes quoted in copy match the mirrored backend values.
  assert.equal(RESET_LINK_TTL_MS, 3_600_000);
  assert.equal(VERIFICATION_TTL, "24h");
  assert.equal(RETRY_SUGGESTION_MS, 300_000);
  assert.match(authCopy.en.mail.tipResetExpiry, /1 hour/);
  assert.match(authCopy.en.mail.tipVerifyExpiry, /24 hours/);
  assert.match(authCopy.en.claims.resetExpiry.title, /1 hour/);
  assert.doesNotMatch(JSON.stringify(authCopy), /only the newest|newest link/i);
});

test("mirrored backend constants still match their sources of truth", () => {
  assert.match(readFileSync("src/app/actions/auth/reset.ts", "utf8"), /3600_000|RESET_LINK_TTL_MS/);
  assert.match(readFileSync("src/lib/auth/verification.ts", "utf8"), /TTL\s*=\s*(?:"24h"|VERIFICATION_TTL)/);
  const email = readFileSync("src/lib/email.ts", "utf8");
  for (const subject of Object.values(AUTH_EMAIL_SUBJECTS)) {
    const key = subject === AUTH_EMAIL_SUBJECTS.reset ? "AUTH_EMAIL_SUBJECTS.reset" : "AUTH_EMAIL_SUBJECTS.verify";
    assert.ok(email.includes(`"${subject}"`) || email.includes(key), subject);
  }
});

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) files(file, out);
    else if (/\.tsx?$/.test(file)) out.push(file);
  }
  return out;
}

const FRONT_DESK = [
  "AuthShell.tsx", "AuthTopBar.tsx", "AuthCover.tsx", "AuthColophon.tsx", "AuthMascot.tsx", "use-mascot-watch.ts", "AuthGreeting.tsx",
  "InkRule.tsx", "WaxSeal.tsx", "SealedEnvelope.tsx", "MailHandoff.tsx", "VerificationResend.tsx", "CountdownRing.tsx",
  "RequirementChecklist.tsx", "CampusDiorama.tsx", "InstitutionPreview.tsx", "EmailTypoHint.tsx", "use-countdown.ts", "use-verification-resend.ts",
  "FieldGroup.tsx", "use-step-morph.ts",
].map((name) => `src/components/auth/${name}`);

/** Every `@media …` block opened by `opener` in `css`, each cut at its own matching closing brace. */
function mediaBlocks(css: string, opener: string): string[] {
  const blocks: string[] = [];
  for (let start = css.indexOf(opener); start >= 0; start = css.indexOf(opener, start + opener.length)) {
    const open = css.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    blocks.push(css.slice(start, end + 1));
  }
  return blocks;
}

test("grep guard: no infinite framer loops on the auth front door", () => {
  const targets = [
    ...files("src/components/auth"),
    "src/app/page.tsx", "src/app/(auth)/login/page.tsx", "src/app/(auth)/register/page.tsx",
    "src/app/(auth)/forgot-password/page.tsx", "src/app/(auth)/verify-success/page.tsx", "src/components/SplashScreen.tsx",
  ].filter((file) => existsSync(file));
  for (const file of targets) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /repeat\s*:\s*Infinity/, file);
    assert.doesNotMatch(text, /Number\.POSITIVE_INFINITY/, file);
  }
});

test("shared Front Desk components: no fetch on mount, no recovery-fixture-hostile imports, no live regions", () => {
  for (const file of FRONT_DESK) {
    assert.ok(existsSync(file), `${file} exists`);
    const text = readFileSync(file, "utf8");
    assert.match(text, /^"use client";/, `${file} is a client module`);
    assert.doesNotMatch(text, /usePathname|router\.replace|router\.prefetch|next\/image|@\/app\/actions/, file);
    assert.doesNotMatch(text, /aria-live|role="status"|role="alert"/, file);
    if (!file.endsWith("use-verification-resend.ts")) assert.doesNotMatch(text, /\bfetch\(/, `${file} must not fetch`);
    assert.doesNotMatch(text, /process\.env/, `${file} must not read process.env (fixtures bundle it for the browser)`);
  }
  // The single shared fetch fires from send(), never from an effect.
  const resend = readFileSync("src/components/auth/use-verification-resend.ts", "utf8");
  assert.doesNotMatch(resend, /useEffect/);
  assert.match(resend, /fetch\("\/api\/auth\/verify\/resend", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ email \}\) \}\)/);
});

test("no class names live in src/lib/auth (the login fixture never scans src/lib)", () => {
  for (const name of ["mascot-mood", "inbox-provider", "email-typo", "auth-handoff", "greeting", "link-expiry", "email-subjects", "auth-copy", "fill-nodes"]) {
    const text = readFileSync(`src/lib/auth/${name}.ts`, "utf8");
    assert.doesNotMatch(text, /className|\bsk-[a-z]/, name);
  }
});

test("globals.css: mascot block unlayered, every Front Desk motion has an off-switch, forced colors covered", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const depthAt = (needle: string) => {
    const index = css.indexOf(needle);
    assert.ok(index >= 0, `missing ${needle}`);
    let depth = 0;
    for (let i = 0; i < index; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    return depth;
  };
  for (const rule of ['.sk-mascot [data-part="eye"]', '.sk-mascot [data-part="pupil"] {', '.sk-mascot[data-mood="shy"]', "@keyframes sk-cap-toss"]) {
    assert.equal(depthAt(rule), 0, `${rule} must be unlayered`);
  }
  for (const token of ["--mascot-ring", "--mascot-lid", "--mascot-lash", "--duration-gaze", "--duration-blink", "--duration-mood", "--duration-ceremony", "--ease-spring-soft"]) {
    assert.match(css, new RegExp(`${token}\\s*:`), token);
  }
  const front = css.slice(css.indexOf("Auth · Front Desk"));
  // The union of every reduced-motion block after the Front Desk header (the
  // off-switches live in more than one: the Front Desk block, the signup
  // View Transition block, the setup Charter Desk block…). Reading only the
  // last one broke as soon as a later section added its own.
  const reduce = mediaBlocks(front, "@media (prefers-reduced-motion: reduce)").join("\n");
  assert.ok(reduce.length > 0, "at least one reduced-motion block after the Front Desk header");
  for (const selector of [".sk-mascot [data-part]", ".sk-ink-draw", ".sk-seal-press", ".sk-attention", '.sk-tick [data-part="check"]', '.sk-countdown-ring [data-part="value"]', ".sk-diorama [data-node]"]) {
    assert.ok(reduce.includes(selector), `reduced-motion block covers ${selector}`);
  }
  assert.match(front, /@media \(forced-colors: active\)[\s\S]*\.sk-auth-cover \{ background: Canvas/);
  // The countdown ring is transition-only: it must never gain an animation.
  const ring = front.match(/\.sk-countdown-ring[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(ring.length > 0);
  for (const rule of ring) assert.doesNotMatch(rule, /animation/, rule);
  // No new rule targets the pinned login field group. The one exception is
  // register's phone country-code picker, scoped to `select.sk-dial-code`,
  // which the login page never renders.
  assert.doesNotMatch(front.replaceAll(".sk-input-group > select.sk-dial-code", ""), /\.sk-input-group/);
});
