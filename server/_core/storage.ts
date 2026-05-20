import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const USE_R2 = !!(
  process.env.R2_ENDPOINT &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
);

const s3 = USE_R2
  ? new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

const BUCKET = process.env.R2_BUCKET_NAME ?? "";
const LOCAL_PATH = process.env.PDF_STORAGE_PATH ?? path.join(process.cwd(), "storage", "pdfs");

function ensureDir(): void {
  if (!fs.existsSync(LOCAL_PATH)) fs.mkdirSync(LOCAL_PATH, { recursive: true });
}

function keyFromPath(filePath: string): string {
  return path.basename(filePath);
}

export async function savePDF(invoiceId: number, buffer: Buffer): Promise<string> {
  const key = `invoice-${invoiceId}.pdf`;
  if (USE_R2 && s3) {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: "application/pdf" }));
    return key;
  }
  ensureDir();
  const fullPath = path.join(LOCAL_PATH, key);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}

export async function readPDF(filePath: string): Promise<Buffer | null> {
  if (USE_R2 && s3) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: keyFromPath(filePath) }));
      const chunks: Uint8Array[] = [];
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

export async function deletePDF(filePath: string): Promise<void> {
  if (USE_R2 && s3) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyFromPath(filePath) }));
    } catch { /* ignore */ }
    return;
  }
  try {
    fs.unlinkSync(filePath);
  } catch { /* ignore */ }
}
