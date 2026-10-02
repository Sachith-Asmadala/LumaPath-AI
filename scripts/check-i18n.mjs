import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const locales = ["en", "si-LK", "ta-LK"];
const resources = Object.fromEntries(locales.map((locale) => [locale, JSON.parse(fs.readFileSync(path.join(root, "src/i18n/locales", `${locale}.json`), "utf8"))]));
const baseKeys = Object.keys(resources.en).sort();
const placeholderPattern = /\{([a-zA-Z0-9_]+)\}/g;
const placeholders = (value) => [...String(value).matchAll(placeholderPattern)].map((match) => match[1]).sort();
const failures = [];
for (const locale of locales.slice(1)) {
  const keys = Object.keys(resources[locale]).sort();
  const missing = baseKeys.filter((key) => !(key in resources[locale]));
  const extra = keys.filter((key) => !(key in resources.en));
  if (missing.length) failures.push(`${locale}: missing keys: ${missing.join(", ")}`);
  if (extra.length) failures.push(`${locale}: extra keys: ${extra.join(", ")}`);
  for (const key of baseKeys) {
    if (!(key in resources[locale])) continue;
    const expected = placeholders(resources.en[key]);
    const actual = placeholders(resources[locale][key]);
    if (expected.join("|") !== actual.join("|")) failures.push(`${locale}: placeholder mismatch for ${key}: expected ${expected.join(",")} got ${actual.join(",")}`);
    if (!String(resources[locale][key]).trim()) failures.push(`${locale}: empty value for ${key}`);
  }
}
const coreKeys = [
  "nav.overview", "nav.tasks", "nav.planner", "nav.focus", "nav.studyAssistant", "nav.documents", "nav.analytics",
  "tasks.title", "planner.title", "focus.title", "assistant.title", "documents.title", "analytics.title", "settings.languageTitle",
];
for (const locale of locales) for (const key of coreKeys) if (!(key in resources[locale])) failures.push(`${locale}: missing core key ${key}`);
const sinhalaCore = coreKeys.map((key) => resources["si-LK"][key]).join(" ");
const tamilCore = coreKeys.map((key) => resources["ta-LK"][key]).join(" ");
if (!/[\u0D80-\u0DFF]/u.test(sinhalaCore)) failures.push("si-LK: representative core strings contain no Sinhala script");
if (!/[\u0B80-\u0BFF]/u.test(tamilCore)) failures.push("ta-LK: representative core strings contain no Tamil script");

function walkFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, results);
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

for (const file of walkFiles(path.join(root, "src"))) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bt\(\s*["']([a-zA-Z0-9_.-]+)["']/g)) {
    const key = match[1];
    if (key.includes(".") && !(key in resources.en)) {
      failures.push(`${path.relative(root, file)}: literal message key is missing from English catalog: ${key}`);
    }
  }
}

if (failures.length) {
  console.error(`i18n contract failed (${failures.length} issue${failures.length === 1 ? "" : "s"})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`i18n contract passed: ${baseKeys.length} keys × ${locales.length} locales; placeholders aligned; literal source keys resolved; core-script fixtures present.`);
