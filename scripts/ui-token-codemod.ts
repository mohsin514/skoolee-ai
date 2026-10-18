/**
 * Moves hand-typed styling onto the design-system tokens.
 *
 *   npx tsx scripts/ui-token-codemod.ts [--check] [paths…]
 *
 * - Hex literals in utility classes (`text-[#8127cf]/40`) become the token
 *   that holds the same colour (`text-primary/40`).
 * - Pixel font sizes below the type scale (`text-[9px]`) become scale steps
 *   (`text-2xs`); the floor is 10px for counters, 11px for any words.
 * - `font-black` (900, which Plus Jakarta Sans does not have) becomes 700, or
 *   800 on display sizes; uppercase eyebrows become 600 with one tracking.
 * - Toasts import the shared wrapper instead of Sonner.
 *
 * Only string literals and template chunks are touched, token by token, so
 * copy, comments and logic are never rewritten. `--check` lists what would
 * change and exits 1, for use after merges.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export const HEX_TOKENS: Record<string, string> = {
  "8127cf": "primary",
  "6a1fb0": "brand-700", "7020b9": "brand-700", "6f1fb8": "brand-700",
  "4f1487": "brand-800", "3d0f6b": "brand-900",
  "9c48ea": "brand-400",
  "b876f0": "brand-300", "b073f0": "brand-300", "b06bea": "brand-300",
  "e9d5ff": "brand-200", "e4c9f7": "brand-200", "e3d5f0": "brand-200",
  "f3eeff": "brand-100", "f3ecfa": "brand-100", "f0e0f8": "brand-100", "efe7f5": "brand-100", "f3eafa": "brand-100",
  "fbf0fe": "brand-50", "faf5ff": "brand-50", "fff7fe": "brand-50",
  "1f1a23": "ink-strong", "1d1b20": "ink-strong",
  "4d4354": "ink", "615668": "ink-muted", "6a5b71": "ink-muted", "635a6b": "ink-muted", "746c7a": "ink-subtle", "918a95": "ink-faint",
  "cfc2d6": "edge",
  "e8e0ec": "border-subtle", "e8e0ed": "border-subtle", "e8dced": "border-subtle", "e7dcef": "border-subtle", "eadfed": "border-subtle", "ece3f3": "border-subtle", "e4dced": "border-subtle",
  "f3f4f9": "muted",
  "faf7fc": "surface-subtle", "f9f7fb": "surface-subtle", "fdfcfe": "surface-subtle", "fafaff": "surface-subtle", "fcfaff": "surface-subtle", "faf7fd": "surface-subtle",
  "f6f2fa": "surface-sunken", "f6f2f8": "surface-sunken",
  "d8cfe5": "field-border",
  "b10e6b": "berry",
  "0f766e": "teal-700", "0d9488": "teal-600", "ccfbf1": "teal-100",
  "f59e0b": "amber-500", "d97706": "amber-600", "b45309": "amber-700", "fef3c7": "amber-100",
  "be123c": "rose-700", "f43f5e": "rose-500", "fff1f2": "rose-50",
  "10b981": "emerald-500", "047857": "emerald-700",
  "f0abfc": "fuchsia-300",
};

const SIZE_TOKENS: Record<string, string> = {
  "6px": "3xs", "7px": "3xs", "8px": "3xs",
  "9px": "2xs", "10px": "2xs", "11px": "2xs", "11.5px": "2xs",
  "12px": "xs", "12.5px": "xs",
  "14px": "sm",
  "14.5px": "md", "15px": "md",
};

const WIDE_TRACKING = new Set(["tracking-widest", "tracking-[0.2em]", "tracking-[0.18em]", "tracking-[0.14em]", "tracking-[0.12em]", "tracking-[0.16em]", "tracking-[0.15em]", "tracking-[0.25em]", "tracking-[0.3em]"]);
const DISPLAY = /^text-(?:3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[(?:1\.[89]\d*|[2-9](?:\.\d+)?)rem\]|\[(?:2[8-9]|[3-9]\d)px\])$/;

function splitVariant(token: string): [string, string] {
  // The utility follows the last ":" that is not inside an arbitrary [..].
  let depth = 0;
  for (let i = token.length - 1; i >= 0; i--) {
    const ch = token[i];
    if (ch === "]") depth++;
    else if (ch === "[") depth--;
    else if (ch === ":" && depth === 0) return [token.slice(0, i + 1), token.slice(i + 1)];
  }
  return ["", token];
}

export function transformClasses(text: string): string {
  if (!/(?:-\[#|text-\[|font-(?:black|extrabold|bold)|tracking-|shadow-\[)/.test(text)) return text;
  const tokens = text.split(/(\s+)/);
  const utilities = tokens.filter((t) => t.trim()).map((t) => splitVariant(t)[1]);
  const uppercase = utilities.includes("uppercase");
  const display = utilities.some((u) => DISPLAY.test(u));

  return tokens.map((token) => {
    if (!token.trim()) return token;
    const [variant, rawUtility] = splitVariant(token);
    const important = rawUtility.startsWith("!") ? "!" : "";
    let utility = important ? rawUtility.slice(1) : rawUtility;

    const hex = /^(-?[a-z][a-z-]*?)-\[#([0-9a-fA-F]{6})\](\/.+)?$/.exec(utility);
    if (hex) {
      const name = HEX_TOKENS[hex[2].toLowerCase()];
      if (name) utility = `${hex[1]}-${name}${hex[3] ?? ""}`;
    }

    const size = /^text-\[(\d+(?:\.\d+)?px)\]$/.exec(utility);
    if (size && SIZE_TOKENS[size[1]]) utility = `text-${SIZE_TOKENS[size[1]]}`;

    if (utility === "font-black") utility = uppercase ? "font-semibold" : display ? "font-extrabold" : "font-bold";
    else if (utility === "font-extrabold" && uppercase) utility = "font-semibold";
    else if (utility === "font-bold" && uppercase) utility = "font-semibold";

    if (uppercase && WIDE_TRACKING.has(utility)) utility = "tracking-wider";

    // Shadows are soft purple, never black or charcoal.
    if (/^shadow-\[/.test(utility)) utility = utility.replace(/rgba?\((?:31,26,35|0,0,0)(,[\d.]+)?\)/g, (_m, a) => `rgba(120,70,180${a ?? ",0.2"})`).replace(/rgba?\((?:31_26_35|0_0_0)(_?\/_?[\d.]+)?\)/g, (_m, a) => `rgb(120_70_180${a ?? "/0.2"})`);

    return `${variant}${important}${utility}`;
  }).join("");
}

const SONNER_IMPORT = /import\s*\{\s*toast\s*\}\s*from\s*["']sonner["'];?/g;
const OWNERS = new Set(["src/components/ui/toast.ts", "src/components/ui/app-toaster.tsx"]);
const SKIP = /src\/lib\/locale\/(?:ui|workflow-ui|navigation-ui|design-system-ui)-messages\.ts$/;
/** Files the codemod (and the check:ui gate) cover. */
export const isTokenized = (file: string) => /\.tsx?$/.test(file) && !file.endsWith(".d.ts") && !SKIP.test(file);

export function transformSource(file: string, source: string): string {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    let start = -1, end = -1;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { start = node.getStart(ast) + 1; end = node.end - 1; }
    else if (ts.isTemplateHead(node)) { start = node.getStart(ast) + 1; end = node.end - 2; }
    else if (ts.isTemplateMiddle(node)) { start = node.getStart(ast) + 1; end = node.end - 2; }
    else if (ts.isTemplateTail(node)) { start = node.getStart(ast) + 1; end = node.end - 1; }
    if (start >= 0 && end >= start) {
      // Import specifiers are module names, not classes.
      if (!(node.parent && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)))) {
        const raw = source.slice(start, end);
        const next = transformClasses(raw);
        if (next !== raw) edits.push({ start, end, text: next });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  let out = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  if (!OWNERS.has(file)) out = out.replace(SONNER_IMPORT, 'import { toast } from "@/components/ui/toast";');
  return out;
}

function walk(path: string, out: string[] = []) {
  if (statSync(path).isFile()) { out.push(path); return out; }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

if (process.argv[1] && /ui-token-codemod\.ts$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const roots = args.filter((a) => !a.startsWith("--"));
  const files = (roots.length ? roots : ["src"]).flatMap((root) => walk(root)).filter(isTokenized);
  const changed: string[] = [];
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const after = transformSource(file, before);
    if (after === before) continue;
    changed.push(file);
    if (!check) writeFileSync(file, after);
  }
  console.log(`${check ? "Would change" : "Changed"} ${changed.length} file(s)`);
  if (check && changed.length) { console.log(changed.join("\n")); process.exit(1); }
}
