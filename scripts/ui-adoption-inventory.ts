import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import ts from 'typescript';

const files: string[] = [];
function walk(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.tsx?$/.test(file)) files.push(file);
  }
}
walk('src');
const records = new Map<string, { dependencies: string[]; controls: Record<string, number>; nativeControls: { tag: string; line: number; type?: string }[] }>();
function resolveLocal(file: string, specifier: string) {
  if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return;
  const base = specifier.startsWith('@/') ? `src/${specifier.slice(2)}` : posix.normalize(join(dirname(file), specifier));
  return [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find(path => existsSync(path) && /\.tsx?$/.test(path));
}
for (const file of files.sort()) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const dependencies = new Set<string>();
  const controls: Record<string, number> = {};
  const nativeControls: { tag: string; line: number; type?: string }[] = [];
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const dependency = resolveLocal(file, node.moduleSpecifier.text);
      if (dependency) dependencies.add(dependency);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const dependency = resolveLocal(file, node.arguments[0].text);
      if (dependency) dependencies.add(dependency);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (/Button$|Input$|Select$|Textarea$|Checkbox$|FieldAction$|Modal$|ModalSurface$|Dialog$|Table$|Card$|Toaster$/.test(tag)) controls[tag] = (controls[tag] || 0) + 1;
      if (/^(button|motion\.button|input|select|textarea)$/.test(tag)) {
        const attr = node.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText(source) === 'type');
        const type = attr && ts.isJsxAttribute(attr) && attr.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : undefined;
        nativeControls.push({ tag, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, ...(type ? { type } : {}) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  records.set(file, { dependencies: [...dependencies].sort(), controls, nativeControls });
}
function closure(file: string, seen = new Set<string>()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const dependency of records.get(file)?.dependencies || []) closure(dependency, seen);
  return seen;
}
const routeFiles = files.filter(file => /^src\/app\/.+\/(page|layout|loading|error|not-found)\.tsx$/.test(file) || /^src\/app\/(page|layout|loading|error|not-found)\.tsx$/.test(file));
const routes = routeFiles.map(file => ({ source: file, kind: file.split('/').at(-1)!.replace('.tsx', ''), uiDependencies: [...closure(file)].filter(path => path.startsWith('src/components/')).sort(), directControls: records.get(file)?.controls || {} }));
const output = {
  generatedAt: new Date().toISOString(),
  note: 'Static coverage only. Every route/boundary and source control is inventoried; import reachability does not certify runtime roles, localization, data states or accessibility.',
  counts: { sourceFiles: files.length, ...Object.fromEntries(['page', 'layout', 'loading', 'error', 'not-found'].map(kind => [kind, routes.filter(route => route.kind === kind).length])) },
  routes,
  components: [...records].filter(([file]) => file.endsWith('.tsx')).map(([source, record]) => ({ source, controls: record.controls, nativeControls: record.nativeControls })),
};
const target = process.argv[2] || 'test-results/design-system/source-coverage.json';
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: target, ...output.counts }));
