import fs from "node:fs";
const messages = JSON.parse(fs.readFileSync("src/i18n/locales/en.json", "utf8"));
const token = /\{[a-zA-Z0-9_]+\}/g;
function pseudo(value) {
  const tokens = [];
  const protectedValue = String(value).replace(token, (match) => `@@${tokens.push(match) - 1}@@`);
  const expanded = protectedValue.replace(/[A-Za-z]/g, (char) => ({a:"à",e:"ë",i:"ï",o:"ö",u:"ü",A:"Å",E:"Ë",I:"Ï",O:"Ö",U:"Ü"}[char] ?? char));
  return `⟦${expanded} ${"~".repeat(Math.max(2, Math.ceil(expanded.length * 0.3)))}⟧`.replace(/@@(\d+)@@/g, (_, index) => tokens[Number(index)]);
}
let failures = 0;
for (const [key, value] of Object.entries(messages)) {
  const output = pseudo(value);
  const before = [...String(value).matchAll(token)].map((m) => m[0]).sort().join("|");
  const after = [...output.matchAll(token)].map((m) => m[0]).sort().join("|");
  if (before !== after || output.length <= String(value).length) {
    console.error(`pseudo-localization failed for ${key}`);
    failures += 1;
  }
}
if (failures) process.exit(1);
console.log(`pseudo-localization passed for ${Object.keys(messages).length} messages; placeholders preserved and strings expanded.`);
