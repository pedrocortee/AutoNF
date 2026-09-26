import { describe, it, expect, afterEach } from "vitest";
import { encryptData, decryptData, hashData } from "./server/_core/crypto";

// Helper: valid 64-char hex key (keys of exactly 64 chars go through hex decode path)
const hexKey = (prefix: string) => (prefix.repeat(64)).slice(0, 64).replace(/[^0-9a-f]/gi, "0");

// Helper: short key (goes through SHA-256 hash path, not hex decode)
const shortKey = (s: string) => s; // anything that's not exactly 64 chars

describe("Crypto Module", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  describe("encryptData / decryptData round-trip", () => {
    it("encrypts and decrypts a simple string", () => {
      process.env.ENCRYPTION_KEY = "test-key-simple"; // non-64-char → hash path
      const plain = "senha-do-certificado-123";
      expect(decryptData(encryptData(plain))).toBe(plain);
    });

    it("encrypts and decrypts a long string", () => {
      process.env.ENCRYPTION_KEY = "test-key-long-payload";
      const plain = "x".repeat(10000);
      expect(decryptData(encryptData(plain))).toBe(plain);
    });

    it("encrypts and decrypts special characters", () => {
      process.env.ENCRYPTION_KEY = "test-key-special-chars";
      const plain = "!@#$%^&*()_+-=[]{}|;':\",./<>?áéíóúçÃÕ";
      expect(decryptData(encryptData(plain))).toBe(plain);
    });

    it("produces different ciphertext for same plaintext (random IV)", () => {
      process.env.ENCRYPTION_KEY = "test-key-random-iv";
      const plain = "senha-teste";
      const enc1 = encryptData(plain);
      const enc2 = encryptData(plain);
      expect(enc1).not.toBe(enc2);
      expect(decryptData(enc1)).toBe(plain);
      expect(decryptData(enc2)).toBe(plain);
    });

    it("encrypted format contains exactly 3 parts separated by ':'", () => {
      process.env.ENCRYPTION_KEY = "test-key-format-check";
      const encrypted = encryptData("test");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]!.length).toBeGreaterThan(0);
      expect(parts[1]!.length).toBeGreaterThan(0);
      expect(parts[2]!.length).toBeGreaterThan(0);
    });

    it("decryption fails on tampered ciphertext (auth tag mismatch)", () => {
      process.env.ENCRYPTION_KEY = "test-key-tamper-check";
      const encrypted = encryptData("secret");
      const [iv, tag, cipher] = encrypted.split(":");
      // Replace ciphertext with zeros — auth tag won't match
      const tampered = `${iv}:${tag}:${"00".repeat(cipher!.length / 2)}`;
      expect(() => decryptData(tampered)).toThrow();
    });

    it("decryption fails with wrong key", () => {
      process.env.ENCRYPTION_KEY = "test-key-wrong-key-one";
      const encrypted = encryptData("secret");
      process.env.ENCRYPTION_KEY = "test-key-wrong-key-two"; // different key
      expect(() => decryptData(encrypted)).toThrow();
    });

    it("decryption fails on invalid format (missing parts)", () => {
      process.env.ENCRYPTION_KEY = "test-key-invalid-format";
      expect(() => decryptData("invalid-no-colons")).toThrow();
      expect(() => decryptData("only:two")).toThrow();
    });

    it("works without ENCRYPTION_KEY set (fallback key)", () => {
      delete process.env.ENCRYPTION_KEY;
      const plain = "fallback-test";
      expect(decryptData(encryptData(plain))).toBe(plain);
    });

    it("works with valid 64-char hex key (raw hex decode path)", () => {
      // Only 0-9 and a-f chars — valid hex
      process.env.ENCRYPTION_KEY = "a1b2c3d4e5f60718293a4b5c6d7e8f90" + "a1b2c3d4e5f60718293a4b5c6d7e8f90"; // 64 hex chars
      const plain = "hex-key-test";
      expect(decryptData(encryptData(plain))).toBe(plain);
    });

    it("works with arbitrary-length key (SHA-256 hash path)", () => {
      process.env.ENCRYPTION_KEY = "short"; // not 64 chars → goes through hash
      const plain = "short-key-test";
      expect(decryptData(encryptData(plain))).toBe(plain);
    });
  });

  describe("hashData", () => {
    it("returns consistent SHA-256 hex for the same input", () => {
      const hash1 = hashData("hello");
      const hash2 = hashData("hello");
      expect(hash1).toBe(hash2);
    });

    it("returns different hashes for different inputs", () => {
      expect(hashData("hello")).not.toBe(hashData("world"));
    });

    it("returns a 64-character hex string (SHA-256)", () => {
      const hash = hashData("test");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("known SHA-256 value for empty string", () => {
      const hash = hashData("");
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });
  });
});
