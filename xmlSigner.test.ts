import { describe, expect, it } from "vitest";
import { signXMLWithCertificate, extractSignatureFromXML, verifyXMLSignature } from "./server/_core/xmlSigner";

const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<Rps xmlns="http://www.abrasf.org.br/nfse">
  <InfRps Id="Rps_123456789012">
    <Identificacao>
      <Numero>1</Numero>
      <Serie>1</Serie>
      <Tipo>1</Tipo>
    </Identificacao>
  </InfRps>
</Rps>`;

describe("XML Signer", () => {
  describe("extractSignatureFromXML", () => {
    it("should return null for XML without signature", () => {
      const result = extractSignatureFromXML(sampleXML);
      expect(result).toBeNull();
    });

    it("should extract signature from signed XML", () => {
      const signedXml = `<?xml version="1.0"?>
<root>
  <content>Test</content>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignatureValue>dGVzdHNpZ25hdHVyZQ==</SignatureValue>
    <KeyInfo>
      <X509Data>
        <X509Certificate>dGVzdGNlcnQ=</X509Certificate>
      </X509Data>
    </KeyInfo>
    <DigestValue>dGVzdGRpZ2VzdA==</DigestValue>
  </Signature>
</root>`;

      const result = extractSignatureFromXML(signedXml);
      expect(result).not.toBeNull();
      expect(result?.signature).toBe("dGVzdHNpZ25hdHVyZQ==");
      expect(result?.certificate).toBe("dGVzdGNlcnQ=");
      expect(result?.digestValue).toBe("dGVzdGRpZ2VzdA==");
    });

    it("should return null if signature tag is missing", () => {
      const incompleteXml = `<?xml version="1.0"?>
<root>
  <content>Test</content>
  <KeyInfo>
    <X509Certificate>dGVzdGNlcnQ=</X509Certificate>
  </KeyInfo>
</root>`;

      const result = extractSignatureFromXML(incompleteXml);
      expect(result).toBeNull();
    });

    it("should return null if certificate tag is missing", () => {
      const incompleteXml = `<?xml version="1.0"?>
<root>
  <content>Test</content>
  <Signature>
    <SignatureValue>dGVzdHNpZ25hdHVyZQ==</SignatureValue>
    <DigestValue>dGVzdGRpZ2VzdA==</DigestValue>
  </Signature>
</root>`;

      const result = extractSignatureFromXML(incompleteXml);
      expect(result).toBeNull();
    });

    it("should return null if digest tag is missing", () => {
      const incompleteXml = `<?xml version="1.0"?>
<root>
  <content>Test</content>
  <Signature>
    <SignatureValue>dGVzdHNpZ25hdHVyZQ==</SignatureValue>
    <KeyInfo>
      <X509Certificate>dGVzdGNlcnQ=</X509Certificate>
    </KeyInfo>
  </Signature>
</root>`;

      const result = extractSignatureFromXML(incompleteXml);
      expect(result).toBeNull();
    });
  });

  describe("signXMLWithCertificate", () => {
    it("should throw error for invalid certificate data", () => {
      expect(() => {
        signXMLWithCertificate({
          certificateData: "invalid-base64",
          certificatePassword: "password",
          xmlContent: sampleXML,
        });
      }).toThrow();
    });

    it("should throw error for invalid XML", () => {
      expect(() => {
        signXMLWithCertificate({
          certificateData: "dGVzdA==", // Invalid certificate
          certificatePassword: "password",
          xmlContent: "not xml",
        });
      }).toThrow();
    });
  });

  describe("verifyXMLSignature", () => {
    it("should return false for XML without signature", () => {
      const result = verifyXMLSignature(sampleXML, "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----");
      expect(result).toBe(false);
    });

    it("should return false for invalid certificate", () => {
      const signedXml = `<?xml version="1.0"?>
<root>
  <Signature>
    <SignatureValue>dGVzdA==</SignatureValue>
  </Signature>
</root>`;

      const result = verifyXMLSignature(signedXml, "invalid-cert");
      expect(result).toBe(false);
    });
  });
});
