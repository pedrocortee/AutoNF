/**
 * Reads an A1 certificate (PFX/P12) for SEFAZ mutual TLS.
 *
 * Node's OpenSSL 3 rejects the legacy PFX encryption (RC2-40) many Brazilian A1 files still use,
 * so the PFX is opened with node-forge and handed to TLS as PEM key + certificate chain.
 */

import forge from "node-forge";

export interface A1Certificate {
  keyPem: string;
  /** Holder certificate first, then any chain certificates found in the file */
  certChainPem: string;
  subject: string;
  issuer: string;
  /** CNPJ/CPF of the holder (ICP-Brasil puts it in the CN as "NAME:CNPJ" and in the SAN) */
  holderDocument: string | null;
  validFrom: Date;
  validUntil: Date;
  thumbprint: string;
}

function names(attrs: forge.pki.CertificateField[]): string {
  return attrs.map((a) => `${a.shortName ?? a.name}=${a.value}`).join(", ");
}

/** ICP-Brasil OIDs inside subjectAltName otherName: 2.16.76.1.3.3 = CNPJ, 2.16.76.1.3.1 = CPF data. */
function documentFromCert(cert: forge.pki.Certificate): string | null {
  const cn = String(cert.subject.getField("CN")?.value ?? "");
  const fromCn = cn.match(/:(\d{14}|\d{11})$/);
  if (fromCn) return fromCn[1];

  const san = cert.getExtension("subjectAltName") as { value?: string } | null;
  if (san?.value) {
    const der = san.value;
    const cnpjOid = forge.asn1.oidToDer("2.16.76.1.3.3").getBytes();
    const i = der.indexOf(cnpjOid);
    if (i >= 0) {
      const m = der.slice(i + cnpjOid.length).match(/\d{14}/);
      if (m) return m[0];
    }
  }
  return null;
}

function keyMatches(cert: forge.pki.Certificate, key: forge.pki.rsa.PrivateKey): boolean {
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  return !!pub.n && pub.n.equals(key.n);
}

/** @param pfxBase64 PFX content in base64 (a data: URL prefix is tolerated) */
export function readA1Certificate(pfxBase64: string, password: string): A1Certificate {
  const clean = pfxBase64.startsWith("data:") ? (pfxBase64.split(",")[1] ?? "") : pfxBase64;
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(clean)), password);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/mac|password|invalid/i.test(msg)) throw new Error("Senha do certificado incorreta ou arquivo inválido");
    throw new Error(`Não foi possível abrir o certificado: ${msg}`);
  }

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const key = keyBags.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  if (!key || certs.length === 0) throw new Error("O arquivo não contém certificado e chave privada");

  const holder = certs.find((c) => keyMatches(c, key));
  if (!holder) throw new Error("Nenhum certificado do arquivo corresponde à chave privada");
  const chain = [holder, ...certs.filter((c) => c !== holder)];

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(holder)).getBytes();
  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certChainPem: chain.map((c) => forge.pki.certificateToPem(c)).join(""),
    subject: names(holder.subject.attributes),
    issuer: names(holder.issuer.attributes),
    holderDocument: documentFromCert(holder),
    validFrom: holder.validity.notBefore,
    validUntil: holder.validity.notAfter,
    thumbprint: forge.md.sha1.create().update(der).digest().toHex(),
  };
}
