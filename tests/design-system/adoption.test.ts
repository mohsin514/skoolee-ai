import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

// Known field-adoption debt carried in from the `dev` branch (SKO-208 merge).
// These screens still use raw native controls and/or forked focus utilities and
// are tracked for migration onto the shared primitives as a follow-up. The guards
// below exempt exactly these paths so they keep blocking NEW regressions while the
// backlog is worked down; do not add to this list — migrate the screen instead.
const ADOPTION_DEBT = new Set<string>([
  'src/app/(auth)/protect-account/page.tsx',
  'src/app/account/security/page.tsx',
  'src/app/memberships/page.tsx',
  'src/app/parent/fees/page.tsx',
  'src/app/pupils/[id]/page.tsx',
  'src/app/student/fees/page.tsx',
  'src/components/academic/ReportCardPipeline.tsx',
  'src/components/fees/AccountsTab.tsx',
  'src/components/fees/FeePaymentsTab.tsx',
  'src/components/locale/CurrencySelect.tsx',
  'src/components/settings/LocaleSettingsPanel.tsx',
]);
const isDebt = (file: string) => ADOPTION_DEBT.has(file.split('\\').join('/'));

// Prevent newly added screens from silently bypassing the shared field system.
test('application forms use shared fields; specialized native controls remain explicit', () => {
  const violations: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) { if (file !== 'src/components/ui') walk(file); continue; }
      if (!file.endsWith('.tsx')) continue;
      if (isDebt(file)) continue;
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
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
    if (isDebt(file)) continue;
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
