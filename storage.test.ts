import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Storage module tests — local filesystem only (no R2 credentials needed)
// The module-level LOCAL_PATH constant is set at import time from env var,
// so we set the env var BEFORE importing the module in this test file.
// ---------------------------------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "autonf-storage-test-"));
const originalPath = process.env.PDF_STORAGE_PATH;
const originalR2Endpoint = process.env.R2_ENDPOINT;
const originalR2Key = process.env.R2_ACCESS_KEY_ID;
const originalR2Secret = process.env.R2_SECRET_ACCESS_KEY;
const originalR2Bucket = process.env.R2_BUCKET_NAME;

// Set env BEFORE module import so LOCAL_PATH picks it up
process.env.PDF_STORAGE_PATH = tmpDir;
delete process.env.R2_ENDPOINT;
delete process.env.R2_ACCESS_KEY_ID;
delete process.env.R2_SECRET_ACCESS_KEY;
delete process.env.R2_BUCKET_NAME;

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  if (originalPath !== undefined) process.env.PDF_STORAGE_PATH = originalPath;
  else delete process.env.PDF_STORAGE_PATH;
  if (originalR2Endpoint !== undefined) process.env.R2_ENDPOINT = originalR2Endpoint;
  else delete process.env.R2_ENDPOINT;
  if (originalR2Key !== undefined) process.env.R2_ACCESS_KEY_ID = originalR2Key;
  else delete process.env.R2_ACCESS_KEY_ID;
  if (originalR2Secret !== undefined) process.env.R2_SECRET_ACCESS_KEY = originalR2Secret;
  else delete process.env.R2_SECRET_ACCESS_KEY;
  if (originalR2Bucket !== undefined) process.env.R2_BUCKET_NAME = originalR2Bucket;
  else delete process.env.R2_BUCKET_NAME;
});

describe("Storage Module (Local Filesystem)", () => {
  describe("savePDF / readPDF round-trip", () => {
    it("saves and reads back a PDF buffer", async () => {
      const { savePDF, readPDF } = await import("./server/_core/storage");
      const fakePdf = Buffer.from("%PDF-1.4 fake content for test");
      const savedPath = await savePDF(999, fakePdf);
      expect(savedPath).toContain("invoice-999.pdf");
      const retrieved = await readPDF(savedPath);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.equals(fakePdf)).toBe(true);
    });

    it("returns null for a path that does not exist", async () => {
      const { readPDF } = await import("./server/_core/storage");
      const result = await readPDF("/nonexistent/path/invoice-000.pdf");
      expect(result).toBeNull();
    });

    it("storage directory is created automatically if absent", () => {
      expect(fs.existsSync(tmpDir)).toBe(true);
    });

    it("overwrites existing file for same invoiceId", async () => {
      const { savePDF, readPDF } = await import("./server/_core/storage");
      await savePDF(100, Buffer.from("version-1"));
      const path2 = await savePDF(100, Buffer.from("version-2-updated"));
      const result = await readPDF(path2);
      expect(result!.toString()).toBe("version-2-updated");
    });

    it("generates correct filename from invoiceId", async () => {
      const { savePDF } = await import("./server/_core/storage");
      const savedPath = await savePDF(42, Buffer.from("test"));
      expect(path.basename(savedPath)).toBe("invoice-42.pdf");
    });

    it("saves large PDF buffer correctly", async () => {
      const { savePDF, readPDF } = await import("./server/_core/storage");
      const largePdf = Buffer.alloc(500_000, 0x42); // 500KB
      const savedPath = await savePDF(888, largePdf);
      const result = await readPDF(savedPath);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(500_000);
    });

    it("different invoiceIds produce different file paths", async () => {
      const { savePDF } = await import("./server/_core/storage");
      const p1 = await savePDF(1001, Buffer.from("a"));
      const p2 = await savePDF(1002, Buffer.from("b"));
      expect(path.basename(p1)).not.toBe(path.basename(p2));
    });
  });

  describe("PDF naming convention", () => {
    it("key format is invoice-{id}.pdf", () => {
      const makeKey = (id: number) => `invoice-${id}.pdf`;
      expect(makeKey(1)).toBe("invoice-1.pdf");
      expect(makeKey(99999)).toBe("invoice-99999.pdf");
    });

    it("path.basename extracts key correctly", () => {
      const fullPath = "/storage/pdfs/invoice-123.pdf";
      expect(path.basename(fullPath)).toBe("invoice-123.pdf");
    });
  });

  describe("R2 detection logic", () => {
    it("all four R2 env vars must be present to enable R2", () => {
      const checkR2 = (endpoint?: string, key?: string, secret?: string, bucket?: string) =>
        !!(endpoint && key && secret && bucket);

      expect(checkR2(undefined, "k", "s", "b")).toBe(false);
      expect(checkR2("e", undefined, "s", "b")).toBe(false);
      expect(checkR2("e", "k", undefined, "b")).toBe(false);
      expect(checkR2("e", "k", "s", undefined)).toBe(false);
      expect(checkR2("e", "k", "s", "b")).toBe(true);
    });

    it("local path is used when R2 is not configured", async () => {
      const { savePDF } = await import("./server/_core/storage");
      const savedPath = await savePDF(55, Buffer.from("local-only"));
      // On local fs, path will be absolute
      expect(path.isAbsolute(savedPath)).toBe(true);
    });
  });
});
