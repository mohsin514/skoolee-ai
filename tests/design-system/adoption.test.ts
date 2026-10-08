import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

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
