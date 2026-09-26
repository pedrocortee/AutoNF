/**
 * Check-digit algorithms for Brazilian fiscal identifiers.
 * Pure functions, no I/O.
 */

/** Character value for mod-11 over alphanumeric identifiers: ASCII code − 48 ("0"→0 … "9"→9, "A"→17 … "Z"→42). */
function charValue(c: string): number {
  return c.charCodeAt(0) - 48;
}

/** Weighted mod-11 with weights cycling 2..maxWeight from the right. Returns the raw remainder. */
function mod11Remainder(body: string, maxWeight = 9): number {
  let sum = 0;
  let weight = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += charValue(body[i]) * weight;
    weight = weight === maxWeight ? 2 : weight + 1;
  }
  return sum % 11;
}

/** DV for CNPJ, CPF and chave de acesso: remainder < 2 → 0, else 11 − remainder. */
function dvStandard(body: string, maxWeight = 9): number {
  const r = mod11Remainder(body, maxWeight);
  return r < 2 ? 0 : 11 - r;
}

/** CNPJ, numeric or alphanumeric (IN RFB 2.229/2024). Input without punctuation, uppercase. */
export function isValidCnpj(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const dv1 = dvStandard(cnpj.slice(0, 12));
  const dv2 = dvStandard(cnpj.slice(0, 12) + dv1);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const dv1 = dvStandard(cpf.slice(0, 9), 11);
  const dv2 = dvStandard(cpf.slice(0, 9) + dv1, 11);
  return cpf.endsWith(`${dv1}${dv2}`);
}

export function isValidDocument(doc: string): boolean {
  return doc.length === 11 ? isValidCpf(doc) : isValidCnpj(doc);
}

/** Chave de acesso NF-e/CT-e (44 chars). DV is the last digit. */
export function isValidAccessKey44(key: string): boolean {
  if (key.length !== 44) return false;
  return dvStandard(key.slice(0, 43)) === Number(key[43]);
}

/** Issuer CNPJ embedded in a 44-char access key (positions 7–20). */
export function cnpjFromAccessKey(key: string): string {
  return key.slice(6, 20);
}

// ---------------------------------------------------------------------------
// Boleto (linha digitável)
// ---------------------------------------------------------------------------

function mod10(body: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    let p = Number(body[i]) * weight;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    sum += p;
    weight = weight === 2 ? 1 : 2;
  }
  const r = sum % 10;
  return r === 0 ? 0 : 10 - r;
}

/** Boleto bancário barcode DV: remainder-based, with 0/10/11 mapped to 1. */
function dvBarcode(body: string): number {
  const r = 11 - mod11Remainder(body);
  return r === 0 || r === 10 || r === 11 ? 1 : r;
}

/** Utility-bill (arrecadação) mod-11 DV: remainder 0 or 1 → 0, 10 → 1. */
function dvArrecadacaoMod11(body: string): number {
  const r = mod11Remainder(body);
  if (r === 0 || r === 1) return 0;
  if (r === 10) return 1;
  return 11 - r;
}

export interface BoletoInfo {
  valid: boolean;
  kind: "bancario" | "arrecadacao";
  amountCents: number | null;
  dueDate: string | null;
}

/**
 * Fator de vencimento. The counter reached 9999 on 21/02/2025 and restarted at 1000
 * on 22/02/2025 (FEBRABAN). Only the post-reset base is used — pre-2025 boletos are
 * not expected in current inbound flows. Factor 0 = no due date.
 */
function dueDateFromFactor(factor: number): string | null {
  if (factor === 0) return null;
  const base = Date.UTC(2025, 1, 22);
  const d = new Date(base + (factor - 1000) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function parseDigitableLine(raw: string): BoletoInfo | null {
  const line = raw.replace(/\D/g, "");

  if (line.length === 47) {
    const f1 = line.slice(0, 9), f2 = line.slice(10, 20), f3 = line.slice(21, 31);
    const fieldsOk =
      mod10(f1) === Number(line[9]) &&
      mod10(f2) === Number(line[20]) &&
      mod10(f3) === Number(line[31]);

    const barcode = line.slice(0, 4) + line[32] + line.slice(33, 47) + f1.slice(4) + f2 + f3;
    const barcodeOk = dvBarcode(barcode.slice(0, 4) + barcode.slice(5)) === Number(barcode[4]);

    const factor = Number(line.slice(33, 37));
    const amount = Number(line.slice(37, 47));
    return {
      valid: fieldsOk && barcodeOk,
      kind: "bancario",
      amountCents: amount > 0 ? amount : null,
      dueDate: dueDateFromFactor(factor),
    };
  }

  if (line.length === 48 && line[0] === "8") {
    const blocks = [0, 1, 2, 3].map((i) => line.slice(i * 12, i * 12 + 11));
    const dvs = [0, 1, 2, 3].map((i) => Number(line[i * 12 + 11]));
    const useMod10 = line[2] === "6" || line[2] === "7";
    const dvFn = useMod10 ? mod10 : dvArrecadacaoMod11;
    const blocksOk = blocks.every((b, i) => dvFn(b) === dvs[i]);

    const barcode = blocks.join("");
    const generalOk = dvFn(barcode.slice(0, 3) + barcode.slice(4)) === Number(barcode[3]);

    // Value is only meaningful when the identifier (3rd digit) is 6 or 8 (real value, not reference)
    const hasRealValue = line[2] === "6" || line[2] === "8";
    const amount = Number(barcode.slice(4, 15));
    return {
      valid: blocksOk && generalOk,
      kind: "arrecadacao",
      amountCents: hasRealValue && amount > 0 ? amount : null,
      dueDate: null,
    };
  }

  return null;
}
