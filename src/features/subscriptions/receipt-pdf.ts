import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { formatPrice, proPricing, type DemoReceipt } from "./checkout";

type ReceiptAssets = { font: Uint8Array; logo: Uint8Array };
const dateLabel = (date: Date) => date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Colombo" });

/** Generate a local PDF from receipt fields only; card details are never part of this contract. */
export async function createReceiptPdf(receipt: DemoReceipt, assets: ReceiptAssets): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`LumaPath Pro demo receipt ${receipt.reference}`);
  pdf.setAuthor("LumaPath AI");
  pdf.setSubject("Demo membership activation. No payment collected; not a tax invoice.");
  pdf.setCreator("LumaPath checkout");
  pdf.setCreationDate(receipt.createdAt);
  pdf.setModificationDate(receipt.createdAt);

  const [font, bold, logo] = await Promise.all([
    pdf.embedFont(assets.font, { subset: true }),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedPng(assets.logo),
  ]);
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  const ink = rgb(0.19, 0.24, 0.21);
  const muted = rgb(0.42, 0.46, 0.43);
  const green = rgb(0.32, 0.46, 0.39);
  const pale = rgb(0.94, 0.96, 0.94);
  const border = rgb(0.86, 0.89, 0.86);
  const margin = 44;
  const right = width - margin;
  const pricing = proPricing[receipt.cycle];

  const text = (value: string, x: number, top: number, size = 10, face: PDFFont = font, color = ink) => {
    page.drawText(value, { x, y: height - top - size, size, font: face, color });
  };
  const rightText = (value: string, top: number, size = 10, face: PDFFont = font, color = ink) => text(value, right - face.widthOfTextAtSize(value, size), top, size, face, color);
  const line = (top: number) => page.drawLine({ start: { x: margin, y: height - top }, end: { x: right, y: height - top }, thickness: 0.7, color: border });
  const box = (top: number, boxHeight: number, color = pale) => page.drawRectangle({ x: margin, y: height - top - boxHeight, width: right - margin, height: boxHeight, color });

  // Browser shaping preserves names in scripts outside the bundled Latin font.
  // Ordinary receipt text stays searchable; unsupported names are embedded as sharp images.
  const characters = new Set(font.getCharacterSet());
  const supported = (value: string) => Array.from(value).every((character) => characters.has(character.codePointAt(0)!));
  let canvas: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | null = null;
  const browserContext = (size: number) => {
    canvas ??= document.createElement("canvas");
    context ??= canvas.getContext("2d");
    if (!context) throw new Error("Receipt text could not be rendered.");
    context.font = `${size * 3}px "Onest Variable", sans-serif`;
    return context;
  };
  const measure = (value: string, size: number) => supported(value) ? font.widthOfTextAtSize(value, size) : browserContext(size).measureText(value).width / 3;
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  async function billingText(value: string, top: number, size: number, maxLines = 4): Promise<number> {
    const maxWidth = right - margin;
    const clean = value.replace(/[\r\n\t]+/g, " ");
    const wrap = () => {
      const lines: string[] = [];
      let current = "";
      for (const word of clean.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (measure(next, size) <= maxWidth) { current = next; continue; }
        if (current) { lines.push(current); current = ""; }
        for (const { segment } of graphemes.segment(word)) {
          if (current && measure(current + segment, size) > maxWidth) { lines.push(current); current = ""; }
          current += segment;
        }
      }
      if (current) lines.push(current);
      return lines;
    };
    let lines = wrap();
    while (lines.length > maxLines && size > 6) { size -= 0.5; lines = wrap(); }
    for (const value of lines) {
      if (supported(value)) text(value, margin, top, size);
      else {
        const textWidth = measure(value, size);
        canvas!.width = Math.ceil(textWidth * 3) + 6;
        canvas!.height = Math.ceil(size * 1.8 * 3);
        const ctx = browserContext(size);
        ctx.fillStyle = "#313d36";
        ctx.textBaseline = "top";
        ctx.fillText(value, 0, 0);
        const image = await pdf.embedPng(canvas!.toDataURL("image/png"));
        page.drawImage(image, { x: margin, y: height - top - canvas!.height / 3, width: canvas!.width / 3, height: canvas!.height / 3 });
      }
      top += size * 1.6;
    }
    return top;
  }

  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: green });
  page.drawImage(logo, { x: margin, y: height - 80, width: 34, height: 34 });
  text("LumaPath AI", margin + 46, 50, 20, bold);
  text("Your learning. Your career. Your next chapter.", margin + 46, 76, 8, font, muted);
  text("Payment receipt", margin, 115, 30, bold);
  text("Pro membership activated", margin, 156, 11, font, green);
  rightText("DEMO TRANSACTION", 126, 8, bold, green);

  box(192, 65);
  text("ISSUED ON", margin + 16, 206, 8, bold, muted);
  text(dateLabel(receipt.createdAt), margin + 16, 225, 11);
  text("TRANSACTION REFERENCE", 329, 206, 8, bold, muted);
  text(receipt.reference, 329, 225, 11);

  text("BILLED TO", margin, 281, 8, bold, muted);
  let billingBottom = await billingText(receipt.name, 300, 12, 2);
  billingBottom = await billingText(receipt.email, billingBottom + 4, 10);
  billingBottom = await billingText(`${receipt.country} / ${receipt.postalCode}`, billingBottom + 4, 10, 2);
  const table = Math.max(392, billingBottom + 28);
  box(table, 32);
  text("DESCRIPTION", margin + 12, table + 10, 8, bold, muted);
  text("AMOUNT (USD)", right - 104, table + 10, 8, bold, muted);
  text("LumaPath Pro", margin + 12, table + 51, 13, bold);
  text(`${pricing.label} membership / 1 ${pricing.interval}`, margin + 12, table + 72, 10, font, muted);
  rightText(formatPrice(pricing.amount), table + 53, 12, bold);
  line(table + 103);
  text("Subtotal", margin, table + 119, 10, font, muted);
  rightText(formatPrice(pricing.amount), table + 119);
  text("Additional demo fees", margin, table + 142, 10, font, muted);
  rightText("$0.00", table + 142);
  line(table + 168);
  text("Demo total", margin, table + 182, 12, bold);
  rightText(formatPrice(pricing.amount), table + 182, 13, bold);
  box(table + 211, 47);
  text("Amount charged", margin + 16, table + 226, 12, bold, green);
  text("$0.00 USD", right - 104, table + 225, 16, bold, green);
  text("No payment was collected. This transaction activated demo Pro access.", margin, table + 281, 9, font, muted);
  text(`Illustrative next renewal: ${dateLabel(receipt.renewalAt)}`, margin, table + 301, 9, font, muted);
  line(778);
  text("DEMO RECEIPT / Not a tax invoice or proof of a real payment.", margin, 791, 8, font, muted);
  rightText("LumaPath AI / 1 of 1", 806, 8, font, muted);
  return pdf.save();
}

export async function downloadReceiptPdf(receipt: DemoReceipt): Promise<void> {
  const loadAsset = async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Receipt assets could not be loaded.");
    return new Uint8Array(await response.arrayBuffer());
  };
  const [font, logo] = await Promise.all([loadAsset("/fonts/receipt-regular.ttf"), loadAsset("/brand/icon-192.png"), document.fonts.ready]);
  const bytes = await createReceiptPdf(receipt, { font, logo });
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `lumapath-${receipt.reference.toLowerCase()}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
