import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { isTokenized, transformSource } from '../../scripts/ui-token-codemod';

// Application controls have no per-route migration exemptions. Specialized native
// inputs below retain their browser contracts; ordinary controls belong in ui/.
// Prevent newly added screens from silently bypassing the shared field system.
test('application forms use shared fields; specialized native controls remain explicit', () => {
  const violations: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) { if (file !== 'src/components/ui') walk(file); continue; }
      if (!file.endsWith('.tsx')) continue;
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          if (tag === 'button' || tag === 'motion.button') violations.push(`${file}: native action ${tag}`);
          if (tag === 'select' || tag === 'textarea') violations.push(`${file}: native ${tag}`);
          if (tag === 'input') {
            const type = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === 'type');
            const value = type && ts.isJsxAttribute(type) && type.initializer && ts.isStringLiteral(type.initializer) ? type.initializer.text : '';
            // File/range/radio and visually hidden switch inputs retain their native contracts.
            const specialized = ['file', 'range', 'radio', 'hidden', 'color'].includes(value)
              || (value === 'checkbox' && /sr-only|peer|hidden/.test(node.attributes.getText(source)));
            if (!specialized) violations.push(`${file}: native input ${value}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  walk('src');
  assert.deepEqual(violations, []);
});

// Focus indicators come from one token in globals.css (--focus-color, --field-focus-*).
// Screen-level focus ring/outline/border/shadow utilities fork it (double or off-hue
// rings), so they are banned everywhere, shared primitives included. Use the
// `focus-on-dark` / `focus-inset` utilities to adapt the shared indicator instead.
// `!?` and the optional bare `-` also catch `focus:!border-…` and `focus:ring-${tone}`.
const FOCUS_UTILITY = /(?<=^|\s)(?:[a-z0-9-]+(?:-\[[^\]\s]+\])?:)*(?:focus|focus-visible|focus-within):!?(?:ring|outline|border|shadow)(?:-[^\s"'`}]*)?(?=\s|$)/g;
const RETIRED_FOCUS_HEX = /#aa8bc4|170\s+139\s+196|170\s*,\s*139\s*,\s*196/i;

function sourceFiles(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(file, out);
    else if (/\.tsx?$/.test(file)) out.push(file);
  }
  return out;
}

test('focus styling uses the shared token; no screen forks the focus ring', () => {
  const violations: string[] = [];
  for (const file of sourceFiles('src')) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        for (const match of node.text.matchAll(FOCUS_UTILITY)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          violations.push(`${file}:${line}: ${match[0]}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    text.split('\n').forEach((line, index) => {
      if (RETIRED_FOCUS_HEX.test(line)) violations.push(`${file}:${index + 1}: hardcoded retired focus colour`);
    });
  }
  assert.deepEqual(violations, []);

  const css = readFileSync('src/app/globals.css', 'utf8');
  for (const token of ['--focus-color', '--field-focus-border', '--field-focus-ring', '--field-error-ring']) {
    assert.match(css, new RegExp(`${token}\\s*:`), `globals.css must define ${token}`);
  }
});


test('Sonner visual configuration has one shared owner', () => {
  const owners = sourceFiles('src').filter(file => /<Toaster(?:\s|\/>)/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(owners, ['src/components/ui/app-toaster.tsx']);
});

// Styling reads the design tokens. Hex literals that have a token, pixel font
// sizes below the type scale, font-black (Plus Jakarta Sans has no 900) and
// direct Sonner imports are rewritten by the codemod; run it to fix:
//   npx tsx scripts/ui-token-codemod.ts <files>
test('styling uses design tokens, the type scale and the shared toast', () => {
  const violations = sourceFiles('src').filter(isTokenized).filter((file) => {
    const text = readFileSync(file, 'utf8');
    return transformSource(file, text) !== text;
  });
  assert.deepEqual(violations, []);
});

test('toasts go through the shared wrapper', () => {
  const direct = sourceFiles('src').filter((file) => !file.startsWith('src/components/ui/') && /from\s+["']sonner["']/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(direct, []);
});

// ─── Ratchets (§8.4, P9) ─────────────────────────────────────────────────────
// A ratchet is a count of legacy patterns in src/ that may only go down. The baseline was computed ONCE, while
// authoring, from the untouched tree (`git show af1c6a75:<path>`) and is read from ratchet-baseline.json: this
// test never runs git (npm run build runs check:ui). Each run prints the current counts so the baseline can be
// lowered after integration. Everything is relative to the working directory, so the same code produced the
// baseline when run inside an export of tree af1c6a75.

type RatchetId = 'window-dialogs' | 'raw-h1' | 'literal-toasts' | 'legacy-dialog-imports' | 'physical-direction';
type RatchetHit = { id: RatchetId; file: string; line: number; text: string };
const RATCHET_IDS: RatchetId[] = ['window-dialogs', 'raw-h1', 'literal-toasts', 'legacy-dialog-imports', 'physical-direction'];

const WINDOW_DIALOG = /\bwindow\.(confirm|prompt|alert)\s*\(/g;
const RAW_H1 = /<h1(?=[\s>/])/g;
const H1_ALLOWED = ['src/components/ui/', 'src/app/(auth)/', 'src/app/(public)/', 'src/app/onboarding/'];
const TOAST_METHODS = new Set(['success', 'error', 'warning', 'info']);
const LEGACY_DIALOGS = new Set(['ModalFrame', 'DialogContent']);
// A physical side utility with a length value: ml-4, -right-20, pr-[3px], left-1/2, sm:pl-6, rtl:!mr-2 …
const PHYSICAL = /(?<=^|\s)(?:[a-z0-9-]+(?:-\[[^\]\s]+\])?:)*!?-?(?:ml|mr|pl|pr|left|right)-(?:\d+(?:\.\d+)?|\d+\/\d+|px|full|auto|\[[^\]\s]+\])(?=\s|$)/g;

const isCommentLine = (line: string) => /^\s*(?:\/\/|\*|\/\*)/.test(line);
const posix = (file: string) => file.split('\\').join('/');

/** Every ratchet hit in the tree under ./src (current working directory). */
function ratchetHits(): RatchetHit[] {
  const hits: RatchetHit[] = [];
  for (const raw of sourceFiles('src')) {
    const file = posix(raw);
    const text = readFileSync(raw, 'utf8');
    const inUi = file.startsWith('src/components/ui/');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      if (isCommentLine(line)) return;
      if (!inUi) for (const match of line.matchAll(WINDOW_DIALOG)) hits.push({ id: 'window-dialogs', file, line: index + 1, text: match[0] });
      if (file.endsWith('.tsx') && !H1_ALLOWED.some((prefix) => file.startsWith(prefix))) {
        for (const match of line.matchAll(RAW_H1)) hits.push({ id: 'raw-h1', file, line: index + 1, text: match[0] });
      }
    });
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const declaresLegacyDialog = /\b(?:function|const|let|class)\s+(?:ModalFrame|DialogContent)\b/.test(text);
    const physicalScope = (file.startsWith('src/components/') || file.startsWith('src/app/')) && !inUi;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'toast'
        && TOAST_METHODS.has(node.expression.name.text)) {
        const first = node.arguments[0];
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first) || ts.isTemplateExpression(first))) {
          hits.push({ id: 'literal-toasts', file, line: lineOf(node), text: node.expression.getText(source) });
        }
      }
      if (!declaresLegacyDialog && ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const element of node.importClause.namedBindings.elements) {
          const imported = (element.propertyName ?? element.name).text;
          if (LEGACY_DIALOGS.has(imported)) hits.push({ id: 'legacy-dialog-imports', file, line: lineOf(node), text: imported });
        }
      }
      if (physicalScope && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) {
        for (const match of node.text.matchAll(PHYSICAL)) hits.push({ id: 'physical-direction', file, line: lineOf(node), text: match[0] });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return hits;
}

function ratchetCounts(hits: RatchetHit[]): Record<RatchetId, number> {
  const counts = Object.fromEntries(RATCHET_IDS.map((id) => [id, 0])) as Record<RatchetId, number>;
  for (const hit of hits) counts[hit.id] += 1;
  return counts;
}

test('ratchets: legacy patterns never grow past the af1c6a75 baseline', (t) => {
  const baseline = JSON.parse(readFileSync('tests/design-system/ratchet-baseline.json', 'utf8')) as { ratchets: Record<RatchetId, number> };
  const hits = ratchetHits();
  const counts = ratchetCounts(hits);
  // Printed on every run so the orchestrator can lower the baseline after integration.
  t.diagnostic(`ratchet counts ${JSON.stringify(counts)} (baseline ${JSON.stringify(baseline.ratchets)})`);
  if (process.env.RATCHET_PRINT === '1') console.log(JSON.stringify({ ratchets: counts }));
  const over: string[] = [];
  for (const id of RATCHET_IDS) {
    assert.equal(typeof baseline.ratchets[id], 'number', `ratchet-baseline.json has ${id}`);
    if (counts[id] > baseline.ratchets[id]) {
      const sample = hits.filter((hit) => hit.id === id).slice(0, 40).map((hit) => `  ${hit.file}:${hit.line} ${hit.text}`).join('\n');
      over.push(`${id}: ${counts[id]} > baseline ${baseline.ratchets[id]}. Use the shared primitive instead (PageHeader, ConfirmAction, Modal, toast helpers with t(), logical ms/me/ps/pe/start/end).\n${sample}`);
    }
  }
  assert.deepEqual(over, []);
});

// Hard rules (not ratchets).
const TOUR_ANCHOR = /^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$/;

test('every data-tour literal is a well-formed anchor, unique within its file', () => {
  const violations: string[] = [];
  for (const raw of sourceFiles('src')) {
    if (!raw.endsWith('.tsx')) continue;
    const file = posix(raw);
    const text = readFileSync(raw, 'utf8');
    if (!text.includes('data-tour')) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const seen = new Map<string, number>();
    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && node.name.getText(source) === 'data-tour' && node.initializer) {
        const init = node.initializer;
        const literal = ts.isStringLiteral(init) ? init
          : ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression)) ? init.expression
          : null;
        if (literal) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          if (!TOUR_ANCHOR.test(literal.text)) violations.push(`${file}:${line}: data-tour="${literal.text}" must match ${TOUR_ANCHOR}`);
          const first = seen.get(literal.text);
          if (first !== undefined) violations.push(`${file}:${line}: data-tour="${literal.text}" repeats line ${first}`);
          else seen.set(literal.text, line);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(violations, []);
});

test('navigation comes from the role registry; the retired layout shell is never imported', () => {
  assert.ok(existsSync('src/lib/navigation/role-nav.ts'), 'src/lib/navigation/role-nav.ts exists');
  const RETIRED = /from\s+["']@\/components\/layout\/(?:sidebar|header)["']|import\(\s*["']@\/components\/layout\/(?:sidebar|header)["']\s*\)/;
  const importers = sourceFiles('src').filter((file) => RETIRED.test(readFileSync(file, 'utf8'))).map(posix);
  assert.deepEqual(importers, []);
});
