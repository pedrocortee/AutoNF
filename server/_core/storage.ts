import fs from "fs";
import path from "path";

const STORAGE_PATH = process.env.PDF_STORAGE_PATH || path.join(process.cwd(), "storage", "pdfs");

function ensureDir(): void {
  if (!fs.existsSync(STORAGE_PATH)) {
    fs.mkdirSync(STORAGE_PATH, { recursive: true });
  }
}

export function savePDF(invoiceId: number, buffer: Buffer): string {
  ensureDir();
  const filename = `invoice-${invoiceId}.pdf`;
  const fullPath = path.join(STORAGE_PATH, filename);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}

export function readPDF(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

export function deletePDF(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore if file doesn't exist
  }
}
