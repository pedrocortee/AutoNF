/**
 * Debug: testa a descriptografia do certificado armazenado no banco.
 * source .env && node scripts/debug-crypto.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mysql = require("mysql2/promise");
const crypto = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;
const ENCRYPTION_KEY_ENV = process.env.ENCRYPTION_KEY;

function getEncryptionKey() {
  if (!ENCRYPTION_KEY_ENV) {
    const combined = (process.env.JWT_SECRET || "default") + ":" + (DATABASE_URL || "default");
    return crypto.createHash("sha256").update(combined).digest();
  }
  if (ENCRYPTION_KEY_ENV.length === 64) return Buffer.from(ENCRYPTION_KEY_ENV, "hex");
  return crypto.createHash("sha256").update(ENCRYPTION_KEY_ENV).digest();
}

function decryptData(encrypted) {
  const parts = encrypted.split(":");
  if (parts.length < 3) throw new Error(`Formato inválido — ${parts.length} partes (esperado 3)`);
  const [ivB64, authTagB64, ...rest] = parts;
  const encryptedHex = rest.join(":"); // caso haja : no hex (não deveria)
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let dec = decipher.update(encryptedHex, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

async function main() {
  console.log("ENCRYPTION_KEY length:", ENCRYPTION_KEY_ENV?.length ?? "NOT SET");
  console.log("Key buffer (first 4 bytes hex):", getEncryptionKey().toString("hex").slice(0, 8));

  const conn = await mysql.createConnection(DATABASE_URL);
  const [rows] = await conn.execute(
    "SELECT id, encryptedPassword, certificateData FROM digitalCertificates WHERE isActive='true' LIMIT 1"
  );
  await conn.end();

  if (rows.length === 0) {
    console.error("Nenhum certificado ativo no banco.");
    return;
  }

  const cert = rows[0];
  console.log("\nCert id:", cert.id);
  console.log("encryptedPassword parts:", cert.encryptedPassword.split(":").length);
  console.log("encryptedPassword preview:", cert.encryptedPassword.slice(0, 60));
  console.log("certificateData parts:", cert.certificateData.split(":").length);

  console.log("\n--- Tentativa de descriptografar encryptedPassword ---");
  try {
    const pwd = decryptData(cert.encryptedPassword);
    console.log("✓ OK — valor:", pwd);
  } catch (e) {
    console.log("✗ FALHOU:", e.message);
  }

  console.log("\n--- Tentativa de descriptografar certificateData ---");
  try {
    const cd = decryptData(cert.certificateData);
    console.log("✓ OK — tamanho:", cd.length, "primeiros 20 chars:", cd.slice(0, 20));
  } catch (e) {
    console.log("✗ FALHOU:", e.message);
  }
}

main().catch(console.error);
