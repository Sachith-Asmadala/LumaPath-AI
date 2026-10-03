import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Public fixtures contain fictional information only. Regenerate with npm run demo:assets.
const sources = [
  "cvs/devops-starter", "cvs/devops-internship",
  "learning/linux-foundations", "learning/docker-networking-lab", "learning/cicd-release-guide",
];
for (const source of sources) {
  const base = fileURLToPath(new URL(`../public/demo/${source}`, import.meta.url));
  const content = await readFile(`${base}.txt`, "utf8");
  const pdf = await PDFDocument.create();
  pdf.setTitle(content.split("\n")[0]);
  pdf.setAuthor("LumaPath Demo Library");
  pdf.setCreationDate(new Date("2026-10-02T03:30:00Z"));
  pdf.setModificationDate(new Date("2026-10-02T03:30:00Z"));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page, y;
  const newPage = () => {
    page = pdf.addPage([595, 842]);
    page.drawRectangle({ x: 44, y: 782, width: 507, height: 3, color: rgb(.1, .48, .48) });
    page.drawText("LUMAPATH / SAMPLE DEMO DOCUMENT", { x: 44, y: 798, size: 9, font: bold, color: rgb(.1, .38, .4) });
    page.drawText("Fictional learning material and credentials for demonstration.", { x: 44, y: 30, size: 8, font, color: rgb(.4, .45, .5) });
    y = 760;
  };
  newPage();
  for (const [index, line] of content.split("\n").entries()) {
    if (!line.trim()) { y -= 12; continue; }
    const heading = index === 0 || (line.length < 45 && !line.includes("|") && !line.includes("@"));
    const face = heading ? bold : font;
    const size = index === 0 ? 17 : heading ? 11 : 10;
    const words = line.split(/\s+/);
    let wrapped = "";
    for (const word of words) {
      const candidate = wrapped ? `${wrapped} ${word}` : word;
      if (wrapped && face.widthOfTextAtSize(candidate, size) > 507) {
        if (y < 60) newPage();
        page.drawText(wrapped, { x: 44, y, size, font: face, color: rgb(.12, .17, .22) });
        y -= 15;
        wrapped = word;
      } else wrapped = candidate;
    }
    if (y < 60) newPage();
    page.drawText(wrapped, { x: 44, y, size, font: face, color: rgb(.12, .17, .22) });
    y -= heading ? 21 : 15;
  }
  await writeFile(`${base}.pdf`, await pdf.save());
}
