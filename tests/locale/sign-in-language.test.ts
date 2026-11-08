import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextResponse as NextResponseType } from "next/server";
import type { Language } from "../../src/lib/locale/package";

Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });

type UpdateArgs = { where: Record<string, unknown>; data: Record<string, unknown> };
const writes: UpdateArgs[] = [];
let failWrites = false;
(globalThis as { prisma?: unknown }).prisma = {
  user: {
    async updateMany(args: UpdateArgs) {
      if (failWrites) throw new Error("db down");
      writes.push(args);
      return { count: 1 };
    },
  },
};

let mod: typeof import("../../src/lib/locale/sign-in-language");
let NextResponse: typeof NextResponseType;
before(async () => {
  mod = await import("../../src/lib/locale/sign-in-language");
  ({ NextResponse } = await import("next/server"));
});
beforeEach(() => { writes.length = 0; failWrites = false; });

describe("decideSignInLanguage matrix", () => {
  const rows: [string, Language | null, Parameters<typeof mod.decideSignInLanguage>[1], { save: Language | null; cookie: Language | null }][] = [
    ["explicit, saved null → save + cookie", null, { language: "ur", languageSource: "explicit" }, { save: "ur", cookie: "ur" }],
    ["explicit, saved other → overwrite + cookie", "ar", { language: "en", languageSource: "explicit" }, { save: "en", cookie: "en" }],
    ["explicit, saved same → no write, cookie", "ar", { language: "ar", languageSource: "explicit" }, { save: null, cookie: "ar" }],
    ["saved, cookie source → no write, cookie = saved", "ar", { language: "en", languageSource: "cookie" }, { save: null, cookie: "ar" }],
    ["saved, nothing sent → no write, cookie = saved", "ar", {}, { save: null, cookie: "ar" }],
    ["AC9a cookie source, saved null → no write, cookie untouched", null, { language: "ar", languageSource: "cookie" }, { save: null, cookie: null }],
    ["nothing, saved null → no-op", null, {}, { save: null, cookie: null }],
    ["explicit without language → treated as nothing", null, { languageSource: "explicit" }, { save: null, cookie: null }],
    ["language without source → never saved", null, { language: "ur" }, { save: null, cookie: null }],
  ];
  for (const [name, saved, input, expected] of rows) it(name, () => assert.deepEqual(mod.decideSignInLanguage(saved, input), expected));
});

describe("signInLanguageSchema tolerance (AC9)", () => {
  it("drops invalid values instead of failing", () => {
    assert.deepEqual(mod.signInLanguageSchema.parse({ language: "fr", languageSource: "sneaky" }), { language: undefined, languageSource: undefined });
    assert.deepEqual(mod.signInLanguageSchema.parse({ language: 7, languageSource: null }), { language: undefined, languageSource: undefined });
    assert.deepEqual(mod.signInLanguageSchema.parse({ language: "ar", languageSource: "explicit", email: "x" }), { language: "ar", languageSource: "explicit" });
    assert.deepEqual(mod.signInLanguageSchema.parse({}), {});
  });
});

describe("applySignInLanguage", () => {
  const user = (preferredLanguage: string | null) => ({ id: "u1", schoolId: "s1", preferredLanguage });
  const langCookie = (res: NextResponseType) => res.cookies.get("skoolee-lang");

  it("explicit choice writes the DB scoped to the user's school and sets the cookie", async () => {
    const res = NextResponse.json({ success: true });
    await mod.applySignInLanguage(user(null), { email: "a@b.c", language: "ur", languageSource: "explicit" }, res);
    assert.deepEqual(writes, [{ where: { id: "u1", schoolId: "s1" }, data: { preferredLanguage: "ur" } }]);
    assert.equal(langCookie(res)?.value, "ur");
    assert.equal(langCookie(res)?.httpOnly, false);
    assert.equal(langCookie(res)?.path, "/");
  });

  it("AC4 saved preference on a fresh browser → no write, cookie = saved", async () => {
    const res = NextResponse.json({ success: true });
    await mod.applySignInLanguage(user("ar"), {}, res);
    assert.equal(writes.length, 0);
    assert.equal(langCookie(res)?.value, "ar");
  });

  it("AC9a cookie-sourced language with saved null → no write, no Set-Cookie", async () => {
    const res = NextResponse.json({ success: true });
    await mod.applySignInLanguage(user(null), { language: "ar", languageSource: "cookie" }, res);
    assert.equal(writes.length, 0);
    assert.equal(langCookie(res), undefined);
    assert.deepEqual(res.headers.getSetCookie(), []);
  });

  it("a bad stored value is treated as null", async () => {
    const res = NextResponse.json({ success: true });
    await mod.applySignInLanguage(user("fr"), {}, res);
    assert.equal(writes.length, 0);
    assert.equal(langCookie(res), undefined);
  });

  it("invalid body values never throw and never write", async () => {
    for (const body of [null, "x", 42, { language: "<b>", languageSource: "explicit" }, { language: "ar", languageSource: "EXPLICIT" }]) {
      const res = NextResponse.json({ success: true });
      await mod.applySignInLanguage(user(null), body, res);
      assert.equal(langCookie(res), undefined);
    }
    assert.equal(writes.length, 0);
  });

  it("DB failure is logged with the reason only and the cookie is still set", async () => {
    failWrites = true;
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    try {
      const res = NextResponse.json({ success: true });
      await mod.applySignInLanguage(user("ar"), { language: "en", languageSource: "explicit" }, res);
      assert.equal(langCookie(res)?.value, "en");
    } finally { console.warn = original; }
    assert.deepEqual(warnings, [["[auth/language]", { userId: "u1", reason: "save_failed" }]]);
  });
});
