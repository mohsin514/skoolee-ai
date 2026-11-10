// SKAI-1004: /login must not ship zod or react-hook-form. The page validates with
// the small `useLoginForm` hook; these tests keep it equal to `loginSchema` (which
// the server still applies) and keep the zod-backed locale module off the page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateLogin } from "../../src/components/auth/use-login-form";
import { loginSchema } from "../../src/lib/validators/schemas";

const staticImports = (src: string) => [...src.matchAll(/^import(?! type)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);

test("login validation matches loginSchema field by field", () => {
  const cases = [
    { email: "", password: "" },
    { email: "a@b.co", password: "x" },
    { email: "principal@institution.edu.pk", password: "" },
    { email: "not-an-email", password: "secret" },
    { email: "a..b@x.com", password: "s" },
    { email: ".a@x.com", password: "s" },
    { email: "a@x", password: "s" },
    { email: "first.last+tag@sub.example.org", password: "s" },
    { email: " a@b.co", password: "s" },
  ];
  for (const values of cases) {
    const ours = validateLogin(values);
    const parsed = loginSchema.safeParse(values);
    const theirs: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) theirs[String(issue.path[0])] ??= issue.message;
    assert.equal(ours.email?.message, theirs.email, `email ${JSON.stringify(values.email)}`);
    assert.equal(ours.password?.message, theirs.password, `password for ${JSON.stringify(values)}`);
  }
});

test("/login and the shared client modules it loads do not import zod or react-hook-form", () => {
  const files = [
    "src/app/(auth)/login/page.tsx",
    "src/components/auth/use-login-form.ts",
    "src/components/ui/input.tsx",
    "src/components/locale/LocaleProvider.tsx",
    "src/components/locale/AuthLocaleProvider.tsx",
    "src/lib/locale/language-cookie.ts",
    "src/lib/locale/package-core.ts",
  ];
  for (const file of files) {
    const imports = staticImports(readFileSync(file, "utf8"));
    for (const heavy of ["zod", "react-hook-form", "@hookform/resolvers/zod", "@/lib/validators/schemas", "@/lib/locale/package", "./package"]) {
      assert.ok(!imports.includes(heavy), `${file} statically imports ${heavy}`);
    }
  }
});
