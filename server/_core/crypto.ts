import crypto from "crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

// Get or create a stable encryption key from environment
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.ENCRYPTION_KEY;
  if (!keyEnv) {
    console.warn("[Crypto] ENCRYPTION_KEY not set, using default key. This is NOT secure for production!");
    // Generate a default key from a combination of secrets
    const combined = `${process.env.JWT_SECRET || "default"}:${process.env.DATABASE_URL || "default"}`;
    return crypto.createHash("sha256").update(combined).digest();
  }
  
  // If key is hex-encoded, decode it
  if (keyEnv.length === 64) {
    return Buffer.from(keyEnv, "hex");
  }
  
  // Otherwise, hash it to get a 256-bit key
  return crypto.createHash("sha256").update(keyEnv).digest();
}

/**
 * Encrypt data using AES-256-GCM
 * Returns: iv:authTag:encryptedData (all base64 encoded)
 */
export function encryptData(data: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Return as: base64(iv):base64(authTag):base64(encrypted)
    return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
  } catch (error) {
    console.error("[Crypto] Encryption failed:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt data encrypted with encryptData
 */
export function decryptData(encrypted: string): string {
  try {
    const [ivB64, authTagB64, encryptedHex] = encrypted.split(":");

    if (!ivB64 || !authTagB64 || !encryptedHex) {
      throw new Error("Invalid encrypted data format");
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("[Crypto] Decryption failed:", error);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Hash data using SHA-256
 */
export function hashData(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
