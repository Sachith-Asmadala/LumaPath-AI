import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const roots = [path.join(root, "src"), path.join(root, "tests")].filter(fs.existsSync);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const importPatterns = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /^\s*import\s*["']([^"']+)["']/gm,
];

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (sourceExtensions.has(path.extname(entry.name))) output.push(full);
  }
  return output;
}

function candidates(base) {
  const ext = path.extname(base);
  const list = [base];
  if (!ext) {
    for (const suffix of [".ts", ".tsx", ".js", ".jsx", ".json", ".css"]) list.push(`${base}${suffix}`);
    for (const name of ["index.ts", "index.tsx", "index.js", "index.jsx"]) list.push(path.join(base, name));
  }
  return list;
}

function resolveLocal(file, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(srcRoot, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(file), specifier);
  else return true;
  return candidates(base).some((candidate) => fs.existsSync(candidate));
}

const failures = [];
let checked = 0;
for (const base of roots) {
  for (const file of walk(base)) {
    const text = fs.readFileSync(file, "utf8");
    const seen = new Set();
    for (const pattern of importPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text))) seen.add(match[1]);
    }
    for (const specifier of seen) {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) continue;
      checked += 1;
      if (!resolveLocal(file, specifier)) {
        failures.push(`${path.relative(root, file)} -> ${specifier}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Local import check failed (${failures.length} unresolved import${failures.length === 1 ? "" : "s"}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Local import check passed: ${checked} local imports resolved.`);
