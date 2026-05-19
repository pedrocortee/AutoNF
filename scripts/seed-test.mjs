/**
 * Seed de dados de teste para AutoNF.
 *
 * O que cria:
 *  - Empresa com CNPJ válido (11222333000181) e Inscrição Municipal fictícia
 *  - Certificado A1 auto-assinado (PFX) — exercita todo o código local
 *  - Planos (Starter, Pro, Enterprise) se ainda não existirem
 *  - Assinatura Starter para o usuário
 *  - Invoice de R$ 1.000,00 pronta para despachar
 *
 * Uso:
 *   source .env && npx tsx scripts/seed-test.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const forge = require("node-forge");
import mysql from "mysql2/promise";
import crypto from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
const ENCRYPTION_KEY_ENV = process.env.ENCRYPTION_KEY;

if (!DATABASE_URL) {
  console.error("DATABASE_URL não configurado. Rode: source .env && npx tsx scripts/seed-test.mjs");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Crypto (replica fiel de server/_core/crypto.ts)
// ---------------------------------------------------------------------------

function getEncryptionKey() {
  if (!ENCRYPTION_KEY_ENV) {
    const combined = `${process.env.JWT_SECRET || "default"}:${DATABASE_URL}`;
    return crypto.createHash("sha256").update(combined).digest();
  }
  if (ENCRYPTION_KEY_ENV.length === 64) return Buffer.from(ENCRYPTION_KEY_ENV, "hex");
  return crypto.createHash("sha256").update(ENCRYPTION_KEY_ENV).digest();
}

function encryptData(data) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

// ---------------------------------------------------------------------------
// Geração do certificado A1 auto-assinado
// ---------------------------------------------------------------------------

function generateSelfSignedPFX(password) {
  console.log("  Gerando chave RSA 2048 bits (pode demorar alguns segundos)...");
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";

  const now = new Date();
  const oneYear = new Date(now);
  oneYear.setFullYear(oneYear.getFullYear() + 1);
  cert.validity.notBefore = now;
  cert.validity.notAfter = oneYear;

  const attrs = [
    { name: "commonName", value: "AutoNF Teste LTDA:11222333000181" },
    { name: "organizationName", value: "AutoNF Teste LTDA" },
    { name: "organizationalUnitName", value: "Certificado de Teste" },
    { name: "countryName", value: "BR" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", keyCertSign: true, digitalSignature: true, nonRepudiation: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: "3des",
  });
  const pfxDer = forge.asn1.toDer(p12Asn1);
  const pfxBase64 = forge.util.encode64(pfxDer.getBytes());

  const subject = attrs.map((a) => `${a.name}=${a.value}`).join(", ");
  return { pfxBase64, subject, validFrom: now, validUntil: oneYear };
}

// ---------------------------------------------------------------------------
// CNPJ helpers
// ---------------------------------------------------------------------------

// 11.222.333/0001-81 — dígitos validados manualmente
const COMPANY_CNPJ = "11222333000181";
// 12.345.678/0001-95 — dígitos validados manualmente
const TAKER_CNPJ = "12345678000195";
const CERT_PASSWORD = "AutoNF@Teste123";

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("✓ Conectado ao banco\n");

  // ── Usuário ──────────────────────────────────────────────────────────────
  const [userRows] = await conn.execute("SELECT id, email FROM users LIMIT 1");
  if (userRows.length === 0) {
    console.error("Nenhum usuário encontrado. Acesse http://localhost:5173 e faça login primeiro.");
    await conn.end();
    process.exit(1);
  }
  const userId = userRows[0].id;
  console.log(`Usuário: ${userRows[0].email} (id=${userId})\n`);

  // ── Planos ───────────────────────────────────────────────────────────────
  const [existingPlans] = await conn.execute("SELECT COUNT(*) AS n FROM plans");
  if (existingPlans[0].n === 0) {
    console.log("Inserindo planos...");
    for (const plan of [
      { name: "Starter",      pricePerMonth: 25000,  maxInvoicesPerMonth: 50,     displayOrder: 1 },
      { name: "Professional", pricePerMonth: 40000,  maxInvoicesPerMonth: 200,    displayOrder: 2 },
      { name: "Enterprise",   pricePerMonth: 99900,  maxInvoicesPerMonth: 999999, displayOrder: 3 },
    ]) {
      await conn.execute(
        "INSERT INTO plans (name, pricePerMonth, maxInvoicesPerMonth, displayOrder) VALUES (?, ?, ?, ?)",
        [plan.name, plan.pricePerMonth, plan.maxInvoicesPerMonth, plan.displayOrder]
      );
      console.log(`  ✓ Plano ${plan.name}`);
    }
  } else {
    console.log("✓ Planos já existem");
  }

  // ── Assinatura ───────────────────────────────────────────────────────────
  const [activeSub] = await conn.execute(
    "SELECT id FROM subscriptions WHERE userId=? AND status='active' LIMIT 1",
    [userId]
  );
  if (activeSub.length === 0) {
    const [starterPlan] = await conn.execute("SELECT id FROM plans WHERE name='Starter' LIMIT 1");
    if (starterPlan.length > 0) {
      const renewal = new Date();
      renewal.setMonth(renewal.getMonth() + 1);
      await conn.execute(
        "INSERT INTO subscriptions (userId, planId, status, startDate, renewalDate) VALUES (?, ?, 'active', NOW(), ?)",
        [userId, starterPlan[0].id, renewal]
      );
      console.log("✓ Assinatura Starter criada");
    }
  } else {
    console.log("✓ Assinatura já existe");
  }

  // ── Empresa ──────────────────────────────────────────────────────────────
  await conn.execute(
    `INSERT INTO companyConfigs
       (userId, cnpj, municipalRegistration, companyName, address, municipality, state, issRate, cTribNac)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cnpj=VALUES(cnpj), municipalRegistration=VALUES(municipalRegistration),
       companyName=VALUES(companyName), address=VALUES(address),
       municipality=VALUES(municipality), state=VALUES(state),
       issRate=VALUES(issRate), cTribNac=VALUES(cTribNac)`,
    [
      userId,
      COMPANY_CNPJ,
      "12345678",
      "AutoNF Teste LTDA",
      "Rua Sete de Setembro, 1000 — Centro",
      "Porto Alegre",
      "RS",
      "5.00",
      "0107",
    ]
  );
  console.log(`✓ Empresa configurada (CNPJ ${COMPANY_CNPJ}, município Porto Alegre)`);

  // ── Certificado A1 auto-assinado ─────────────────────────────────────────
  console.log("\nGerando certificado A1 auto-assinado...");
  const { pfxBase64, subject, validFrom, validUntil } = generateSelfSignedPFX(CERT_PASSWORD);
  const encryptedCert = encryptData(pfxBase64);
  const encryptedPass = encryptData(CERT_PASSWORD);

  // Desativa certificados anteriores
  await conn.execute(
    "UPDATE digitalCertificates SET isActive='false' WHERE userId=?",
    [userId]
  );

  await conn.execute(
    `INSERT INTO digitalCertificates
       (userId, filename, certificateData, encryptedPassword, subject, issuer, validFrom, validUntil, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'true')`,
    [userId, "teste-autoassinado.pfx", encryptedCert, encryptedPass, subject, subject, validFrom, validUntil]
  );
  console.log("✓ Certificado A1 (auto-assinado) inserido e ativado");
  console.log(`  Senha do cert: ${CERT_PASSWORD}`);
  console.log(`  Válido até:    ${validUntil.toLocaleDateString("pt-BR")}`);

  // ── Invoice de teste ─────────────────────────────────────────────────────
  const competenceMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const valueInCents = 100000; // R$ 1.000,00
  const retISS = Math.round(valueInCents * 0.05); // 5% ISS

  await conn.execute(
    `INSERT INTO invoices
       (userId, clientName, serviceDescription, value, competenceMonth, status,
        takerCPFCNPJ, takerType, retIRPJ, retCSLL, retCOFINS, retPIS, retINSS, retISS)
     VALUES (?, ?, ?, ?, ?, 'Pendente', ?, 'CNPJ', 0, 0, 0, 0, 0, ?)`,
    [
      userId,
      "Cliente Exemplo LTDA",
      "Desenvolvimento de software e consultoria em TI — teste de integração NFS-e em homologação",
      valueInCents,
      competenceMonth,
      TAKER_CNPJ,
      retISS,
    ]
  );
  console.log(`✓ Invoice de teste criada (R$ 1.000,00 — ${competenceMonth})`);
  console.log(`  Tomador CNPJ: ${TAKER_CNPJ}`);

  await conn.end();

  console.log(`
═══════════════════════════════════════════════════════════
  Seed concluído! O servidor já deve estar rodando.

  Acesse: http://localhost:5173

  1. SETTINGS → verifique empresa e certificado
  2. DASHBOARD → clique em "Processar" na invoice pendente

  O que vai acontecer:
  ✓ Certificado parseado corretamente
  ✓ DPS XML gerado com os dados da empresa
  ✓ XML assinado com RSA-SHA256 + C14N (xml-crypto)
  ✓ JWT RS256 gerado com a chave privada do cert
  ✗ SEFIN Nacional vai rejeitar com 401 (cert auto-assinado
    não é ICP-Brasil — comportamento esperado)

  Isso confirma que o código está correto e o único bloqueio
  é o certificado ICP-Brasil real.
═══════════════════════════════════════════════════════════
`);
}

main().catch((err) => {
  console.error("Erro no seed:", err.message);
  process.exit(1);
});
