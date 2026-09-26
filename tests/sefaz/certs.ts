/**
 * Throwaway PKI for tests: a fake CA, an ICP-Brasil-style company certificate ("NAME:CNPJ")
 * packed in a PFX, and a server certificate for a local mTLS endpoint. Nothing here is trusted
 * by SEFAZ — real homologation needs an ICP-Brasil A1.
 */

import crypto from "crypto";
import forge from "node-forge";

function keyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKey: forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs1", format: "pem" }).toString()),
    publicKey: forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }).toString()),
  };
}

function makeCert(opts: {
  cn: string;
  publicKey: forge.pki.PublicKey;
  signer: forge.pki.PrivateKey;
  issuer?: forge.pki.Certificate;
  ca?: boolean;
  serial: string;
  notAfter?: Date;
  altDns?: string;
}): forge.pki.Certificate {
  const cert = forge.pki.createCertificate();
  cert.publicKey = opts.publicKey;
  cert.serialNumber = opts.serial;
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = opts.notAfter ?? new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const subject = [{ name: "commonName", value: opts.cn }, { name: "countryName", value: "BR" }];
  cert.setSubject(subject);
  cert.setIssuer(opts.issuer ? opts.issuer.subject.attributes : subject);
  const exts: any[] = [{ name: "basicConstraints", cA: !!opts.ca }];
  if (opts.ca) exts.push({ name: "keyUsage", keyCertSign: true, cRLSign: true });
  else exts.push({ name: "keyUsage", digitalSignature: true, keyEncipherment: true }, { name: "extKeyUsage", serverAuth: true, clientAuth: true });
  if (opts.altDns) exts.push({ name: "subjectAltName", altNames: [{ type: 2, value: opts.altDns }, { type: 7, ip: "127.0.0.1" }] });
  cert.setExtensions(exts);
  cert.sign(opts.signer, forge.md.sha256.create());
  return cert;
}

export function makeTestPki(opts: { companyCn?: string; companyNotAfter?: Date; password?: string } = {}) {
  const password = opts.password ?? "senha-teste";
  const caKeys = keyPair();
  const ca = makeCert({ cn: "AC Teste AutoNF", publicKey: caKeys.publicKey, signer: caKeys.privateKey, ca: true, serial: "01" });

  const coKeys = keyPair();
  const company = makeCert({
    cn: opts.companyCn ?? "CLIENTE DO ESCRITORIO SA:98765432000198",
    publicKey: coKeys.publicKey,
    signer: caKeys.privateKey,
    issuer: ca,
    serial: "02",
    notAfter: opts.companyNotAfter,
  });
  // CA first on purpose: the reader must pick the certificate that matches the key
  const p12 = forge.pkcs12.toPkcs12Asn1(coKeys.privateKey, [ca, company], password, { algorithm: "3des" });
  const pfxBase64 = forge.util.encode64(forge.asn1.toDer(p12).getBytes());

  const srvKeys = keyPair();
  const server = makeCert({ cn: "localhost", publicKey: srvKeys.publicKey, signer: caKeys.privateKey, issuer: ca, serial: "03", altDns: "localhost" });

  return {
    password,
    pfxBase64,
    caPem: forge.pki.certificateToPem(ca),
    serverKeyPem: forge.pki.privateKeyToPem(srvKeys.privateKey),
    serverCertPem: forge.pki.certificateToPem(server),
  };
}
