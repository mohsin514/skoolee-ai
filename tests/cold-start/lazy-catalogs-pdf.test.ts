// SKAI-1979: the ar/ur UI catalogs (ui-messages, ~3.3 MB built) and the PDF engine (@react-pdf, pdfkit, fontkit) used
// to load at module init of /api/auth/tour (every landing), the admin layout, and every route that reaches
// fees/collect-command (fee collection, corrections, the AI Workflows finance registry). These tests walk each entry's
// static (value) import graph and keep both behind dynamic imports.
//   node --import tsx --test tests/cold-start/lazy-catalogs-pdf.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const CATALOGS = "src/lib/locale/ui-messages.ts";
const PDF = "src/lib/locale/invoice-pdf.tsx";

/** Static value imports and re-exports; `import type`/`export type` and `import()` are skipped. */
function staticSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/^\s*(import|export)\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/gm)) out.push(match[3]);
  for (const match of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(match[1]);
  return out;
}

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(ROOT, "src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

function staticGraph(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [join(ROOT, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of staticSpecifiers(readFileSync(file, "utf8"))) {
      const local = resolveLocal(file, specifier);
      if (local) queue.push(local);
      else if (!specifier.startsWith(".") && !specifier.startsWith("@/")) packages.add(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]);
    }
  }
  return { files: new Set([...files].map(file => relative(ROOT, file))), packages };
}

for (const entry of ["src/app/api/auth/tour/route.ts", "src/app/admin/layout.tsx"]) {
  test(`${entry} does not statically load the ar/ur catalogs`, () => {
    assert.ok(!staticGraph(entry).files.has(CATALOGS), `${entry} statically reaches ${CATALOGS}`);
  });
}

for (const entry of [
  "src/lib/fees/collect-command.ts",
  "src/lib/ai-workflows/registry/domains/finance/money.ts",
  "src/app/api/fees/collect/route.ts",
  "src/app/api/corrections/route.ts",
]) {
  test(`${entry} does not statically load the PDF engine or the catalogs`, () => {
    const { files, packages } = staticGraph(entry);
    assert.ok(!files.has(PDF), `${entry} statically reaches ${PDF}`);
    assert.ok(!files.has(CATALOGS), `${entry} statically reaches ${CATALOGS}`);
    assert.ok(!packages.has("@react-pdf/renderer"), `${entry} statically reaches @react-pdf/renderer`);
  });
}

test("the receipt PDF still loads its renderer, outside the transaction", () => {
  const source = readFileSync(join(ROOT, "src/lib/fees/receipt.ts"), "utf8");
  const body = source.slice(source.indexOf("export async function immutablePaymentPdf"));
  const lazy = body.indexOf('await import("@/lib/locale/invoice-pdf")');
  assert.ok(lazy > 0, "immutablePaymentPdf must import the renderer");
  assert.ok(lazy < body.indexOf("versionTransaction("), "the renderer loads before the transaction opens");
});
