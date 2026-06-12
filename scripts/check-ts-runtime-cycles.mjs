import { existsSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = [
  "apps/desktop/src",
  "packages/ui/src",
  "packages/codex-protocol/src",
];
const extensions = [".ts", ".tsx"];

function toPosix(path) {
  return path.split(sep).join("/");
}

function repoPath(path) {
  return toPosix(relative(root, path));
}

function collectSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(path));
    } else if (extensions.includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

function allNamedSpecifiersAreTypeOnly(namedBindings) {
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return false;
  return namedBindings.elements.length > 0 && namedBindings.elements.every((element) => element.isTypeOnly);
}

function isTypeOnlyImport(node) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name || !clause.namedBindings) return false;
  return allNamedSpecifiersAreTypeOnly(clause.namedBindings);
}

function isTypeOnlyExport(node) {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  return Boolean(clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly));
}

function runtimeModuleSpecifiers(sourceFile) {
  const specifiers = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (!isTypeOnlyImport(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (!isTypeOnlyExport(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (ts.isStringLiteral(expression)) specifiers.push(expression.text);
      return;
    }
    if (ts.isCallExpression(node)) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isStringLiteralLike(firstArg)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          specifiers.push(firstArg.text);
        } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
          specifiers.push(firstArg.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return specifiers;
}

function sourceCandidate(path) {
  const candidates = [];
  if (extensions.includes(extname(path))) candidates.push(path);
  for (const extension of extensions) candidates.push(`${path}${extension}`);
  for (const extension of extensions) candidates.push(resolve(path, `index${extension}`));
  return candidates.find((candidate) => existsSync(candidate));
}

function resolveInternalSpecifier(fromFile, specifier) {
  if (specifier.startsWith(".")) {
    return sourceCandidate(resolve(dirname(fromFile), specifier));
  }
  if (specifier === "@hicodex/ui") {
    return sourceCandidate(resolve(root, "packages/ui/src/index"));
  }
  if (specifier.startsWith("@hicodex/ui/")) {
    return sourceCandidate(resolve(root, "packages/ui/src", specifier.slice("@hicodex/ui/".length)));
  }
  if (specifier === "@hicodex/codex-protocol") {
    return sourceCandidate(resolve(root, "packages/codex-protocol/src/index"));
  }
  if (specifier.startsWith("@hicodex/codex-protocol/")) {
    return sourceCandidate(resolve(root, "packages/codex-protocol/src", specifier.slice("@hicodex/codex-protocol/".length)));
  }
  return undefined;
}

const sourceFiles = sourceRoots.flatMap((dir) => collectSourceFiles(resolve(root, dir)));
const sourceSet = new Set(sourceFiles.map(repoPath));
const graph = new Map();

for (const file of sourceFiles) {
  const text = ts.sys.readFile(file);
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const deps = [];
  for (const specifier of runtimeModuleSpecifiers(sourceFile)) {
    const resolved = resolveInternalSpecifier(file, specifier);
    if (!resolved) continue;
    const dep = repoPath(resolved);
    if (sourceSet.has(dep)) deps.push(dep);
  }
  graph.set(repoPath(file), Array.from(new Set(deps)).sort());
}

function canonicalCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  let best = nodes;
  for (let index = 1; index < nodes.length; index += 1) {
    const rotated = nodes.slice(index).concat(nodes.slice(0, index));
    if (rotated.join("\0") < best.join("\0")) best = rotated;
  }
  return best.join("\0");
}

const cycles = [];
const cycleKeys = new Set();
const visiting = new Set();
const visited = new Set();
const stack = [];

function visit(node) {
  if (visited.has(node)) return;
  if (visiting.has(node)) return;
  visiting.add(node);
  stack.push(node);
  for (const dep of graph.get(node) ?? []) {
    const activeIndex = stack.indexOf(dep);
    if (activeIndex !== -1) {
      const cycle = stack.slice(activeIndex).concat(dep);
      const key = canonicalCycle(cycle);
      if (!cycleKeys.has(key)) {
        cycleKeys.add(key);
        cycles.push(cycle);
      }
      continue;
    }
    visit(dep);
  }
  stack.pop();
  visiting.delete(node);
  visited.add(node);
}

for (const node of [...graph.keys()].sort()) {
  visit(node);
}

if (cycles.length > 0) {
  console.error(`Runtime TypeScript import cycles detected: ${cycles.length}`);
  for (const [index, cycle] of cycles.slice(0, 20).entries()) {
    console.error(`${index + 1}. ${cycle.join(" -> ")}`);
  }
  if (cycles.length > 20) {
    console.error(`... ${cycles.length - 20} more cycles omitted`);
  }
  process.exit(1);
}

console.log(`Checked ${sourceFiles.length} TypeScript source files; no runtime import cycles found.`);
