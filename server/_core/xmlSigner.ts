/**
 * XML Digital Signature Module
 * Signs RPS XML with A1 certificate according to ABRASF standard
 */

import forge from "node-forge";

export interface SignatureOptions {
  certificateData: string; // Base64 encoded PFX/P12 certificate
  certificatePassword: string; // Certificate password
  xmlContent: string; // XML content to sign
}

export interface SignatureResult {
  signedXml: string;
  signature: string;
  certificateInfo: {
    subject: string;
    issuer: string;
    validFrom: Date;
    validUntil: Date;
  };
}

/**
 * Sign XML with A1 certificate
 * @param options Signature options
 * @returns Signed XML and signature details
 */
export function signXMLWithCertificate(options: SignatureOptions): SignatureResult {
  const { certificateData, certificatePassword, xmlContent } = options;

  try {
    // Strip data: URL prefix if the cert came from FileReader.readAsDataURL()
    let cleanData = certificateData;
    if (certificateData.startsWith("data:")) {
      cleanData = certificateData.split(",")[1] ?? certificateData;
    }

    // Decode base64 certificate
    const binaryData = forge.util.decode64(cleanData);

    // Parse PKCS#12
    const pkcs12Asn1 = forge.asn1.fromDer(binaryData);
    const pkcs12 = forge.pkcs12.pkcs12FromAsn1(pkcs12Asn1, certificatePassword);

    if (!pkcs12.getBags) {
      throw new Error("Invalid PKCS#12 structure");
    }

    const certBagOid = forge.pki.oids.certBag;
    const keyBagOid  = forge.pki.oids.pkcs8ShroudedKeyBag;
    const certBags   = pkcs12.getBags({ bagType: certBagOid });
    const keyBags    = pkcs12.getBags({ bagType: keyBagOid });

    const certificate = (certBags[certBagOid] ?? [])[0]?.cert;
    const privateKey  = (keyBags[keyBagOid]  ?? [])[0]?.key;

    if (!certificate || !privateKey) {
      throw new Error("Certificate or private key not found in PKCS#12");
    }

    if (!certificate || !privateKey) {
      throw new Error("Failed to extract certificate or private key");
    }

    // Extract certificate information
    const subject = certificate.subject.attributes
      .map((attr: any) => `${attr.name}=${attr.value}`)
      .join(", ");

    const issuer = certificate.issuer.attributes
      .map((attr: any) => `${attr.name}=${attr.value}`)
      .join(", ");

    // Create signature
    const md = forge.md.sha1.create();
    md.update(xmlContent, "utf8");

    const signature = privateKey.sign(md);
    const signatureBase64 = forge.util.encode64(signature);

    // Create signed XML with signature embedded
    const signedXml = embedSignatureInXML(xmlContent, signatureBase64, certificate);

    return {
      signedXml,
      signature: signatureBase64,
      certificateInfo: {
        subject,
        issuer,
        validFrom: certificate.validity.notBefore,
        validUntil: certificate.validity.notAfter,
      },
    };
  } catch (error) {
    throw new Error(`Failed to sign XML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Embed signature in XML according to ABRASF standard
 * @param xmlContent Original XML content
 * @param signature Base64 encoded signature
 * @param certificate X.509 certificate
 * @returns XML with embedded signature
 */
function embedSignatureInXML(xmlContent: string, signature: string, certificate: any): string {
  // Extract the root element name
  const rootMatch = xmlContent.match(/<(\w+)/);
  if (!rootMatch) {
    throw new Error("Invalid XML structure");
  }

  const rootElement = rootMatch[1];

  // Get certificate in PEM format
  const certPem = forge.pki.certificateToPem(certificate);
  const certBase64 = certPem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\n/g, "");

  // Create signature block
  const signatureBlock = `
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
      <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
      <Reference URI="">
        <Transforms>
          <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
          <Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
        </Transforms>
        <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
        <DigestValue>${forge.util.encode64(forge.md.sha1.create().update(xmlContent).digest().bytes())}</DigestValue>
      </Reference>
    </SignedInfo>
    <SignatureValue>${signature}</SignatureValue>
    <KeyInfo>
      <X509Data>
        <X509Certificate>${certBase64}</X509Certificate>
      </X509Data>
    </KeyInfo>
  </Signature>`;

  // Insert signature before closing root element
  const closingTag = `</${rootElement}>`;
  const signedXml = xmlContent.replace(closingTag, `${signatureBlock}\n${closingTag}`);

  return signedXml;
}

/**
 * Verify XML signature
 * @param signedXml Signed XML content
 * @param certificatePem Certificate in PEM format
 * @returns true if signature is valid
 */
export function verifyXMLSignature(signedXml: string, certificatePem: string): boolean {
  try {
    // Parse certificate
    const cert = forge.pki.certificateFromPem(certificatePem);

    // Extract signature from XML
    const signatureMatch = signedXml.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
    if (!signatureMatch) {
      throw new Error("No signature found in XML");
    }

    const signature = forge.util.decode64(signatureMatch[1]);

    // Extract original XML (remove signature)
    const originalXml = signedXml.replace(/<Signature[\s\S]*?<\/Signature>/g, "");

    // Verify signature
    const md = forge.md.sha1.create();
    md.update(originalXml, "utf8");

    return (cert.publicKey as any).verify(md.digest().bytes(), signature);
  } catch (error) {
    console.error("Failed to verify XML signature:", error);
    return false;
  }
}

/**
 * Extract signature from signed XML
 * @param signedXml Signed XML content
 * @returns Signature details or null if not found
 */
export function extractSignatureFromXML(
  signedXml: string
): {
  signature: string;
  certificate: string;
  digestValue: string;
} | null {
  try {
    const signatureMatch = signedXml.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
    const certificateMatch = signedXml.match(/<X509Certificate>([^<]+)<\/X509Certificate>/);
    const digestMatch = signedXml.match(/<DigestValue>([^<]+)<\/DigestValue>/);

    if (!signatureMatch || !certificateMatch || !digestMatch) {
      return null;
    }

    return {
      signature: signatureMatch[1],
      certificate: certificateMatch[1],
      digestValue: digestMatch[1],
    };
  } catch (error) {
    console.error("Failed to extract signature from XML:", error);
    return null;
  }
}
