import forge from "node-forge";

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validUntil: Date;
  serialNumber: string;
  thumbprint: string;
}

/**
 * Validate and extract information from a PFX/P12 certificate
 * @param certificateData Base64-encoded PFX/P12 file content
 * @param password Certificate password
 * @returns Certificate information if valid
 * @throws Error if certificate is invalid or password is incorrect
 */
export function validateCertificate(
  certificateData: string,
  password: string
): CertificateInfo {
  try {
    // Remove data URL prefix if present
    let cleanData = certificateData;
    if (certificateData.startsWith("data:")) {
      cleanData = certificateData.split(",")[1] || certificateData;
    }

    // Convert base64 to binary
    const binaryData = forge.util.decode64(cleanData);

    // Parse PKCS#12 (PFX) file
    const p12Asn1 = forge.asn1.fromDer(binaryData);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    // Get certificate bags
    if (!p12.getBags || typeof p12.getBags !== "function") {
      throw new Error("Invalid PKCS#12 structure");
    }

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    if (!certBags || !certBags[forge.pki.oids.certBag]) {
      throw new Error("No certificates found in PKCS#12 file");
    }

    // Get the first certificate
    const certBagArray = certBags[forge.pki.oids.certBag];
    if (!certBagArray || !Array.isArray(certBagArray) || certBagArray.length === 0) {
      throw new Error("No valid certificate found in PKCS#12 file");
    }
    const certBag = certBagArray[0];
    if (!certBag || !certBag.cert) {
      throw new Error("No valid certificate found in PKCS#12 file");
    }

    const cert = certBag.cert;

    // Validate certificate is not expired
    const now = new Date();
    if (cert.validity.notAfter < now) {
      throw new Error(`Certificate expired on ${cert.validity.notAfter.toISOString()}`);
    }

    if (cert.validity.notBefore > now) {
      throw new Error(`Certificate not yet valid (valid from ${cert.validity.notBefore.toISOString()})`);
    }

    // Extract subject and issuer
    const subject = cert.subject.attributes
      .map((attr: any) => `${attr.name}=${attr.value}`)
      .join(", ");

    const issuer = cert.issuer.attributes
      .map((attr: any) => `${attr.name}=${attr.value}`)
      .join(", ");

    // Calculate thumbprint (SHA-1 of DER-encoded certificate)
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const thumbprint = forge.md.sha1.create().update(certDer).digest().toHex();

    return {
      subject,
      issuer,
      validFrom: cert.validity.notBefore,
      validUntil: cert.validity.notAfter,
      serialNumber: cert.serialNumber,
      thumbprint,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Certificate validation failed: ${error.message}`);
    }
    throw new Error("Certificate validation failed: Unknown error");
  }
}

/**
 * Check if a certificate is valid (not expired and well-formed)
 */
export function isCertificateValid(certificateInfo: CertificateInfo): boolean {
  const now = new Date();
  return certificateInfo.validFrom <= now && now <= certificateInfo.validUntil;
}
