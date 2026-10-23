/**
 * Enumerates every write handler (POST/PUT/PATCH/DELETE exports of src/app/api/**\/route.ts) and every
 * exported server action, with the TypeScript compiler API. Used by check-capabilities.ts so a new
 * write surface cannot ship without a registry entry, an exclusion or a reviewed baseline entry.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

export interface WriteHandler { method: string; route: string; file: string }
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name === "route.ts" || name === "route.tsx") out.push(path);
  }
  return out;
}

function exportedNames(source: ts.SourceFile): string[] {
  const names: string[] = [];
  const exported = (node: ts.Node) => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  source.forEachChild(node => {
    if (ts.isFunctionDeclaration(node) && node.name && exported(node)) names.push(node.name.text);
    if (ts.isVariableStatement(node) && exported(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) for (const element of node.exportClause.elements) names.push(element.name.text);
  });
  return names;
}

/** "/api/library/desk/[id]" style: dynamic segments become ":p" so inventory spellings compare equal. */
export function normaliseRoute(route: string): string {
  const path = route.replace(/^src\/app/, "").replace(/\/route\.tsx?(:\d+)?$/, "").replace(/[?#].*$/, "").replace(/:\d+$/, "");
  return path.split("/").map(part => /^\[.*\]$|^:\w+$|^\{.*\}$/.test(part) ? ":p" : part).join("/").replace(/\/+$/, "");
}

export function scanWriteHandlers(root = process.cwd()): WriteHandler[] {
  const handlers: WriteHandler[] = [];
  for (const file of walk(join(root, "src/app/api"))) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const rel = relative(root, file).split(sep).join("/");
    for (const name of exportedNames(source)) if (WRITE_METHODS.has(name)) handlers.push({ method: name, route: normaliseRoute(rel), file: rel });
  }
  return handlers.sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
}
