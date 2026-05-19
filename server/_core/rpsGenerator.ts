/**
 * RPS (Recibo Provisório de Serviço) XML Generator
 * Generates XML according to ABRASF standard for NFS-e submission
 */

export interface RPSData {
  // RPS Info
  rpsNumber: string;
  seriesNumber: string;
  rpsType: "RPS" | "RPS-M" | "RPS-C"; // RPS, RPS-M (Mês), RPS-C (Cancelamento)

  // Service Provider (Prestador)
  providerCNPJ: string;
  providerInscriptionMunicipal: string;

  // Service Taker (Tomador)
  takerName: string;
  takerCPFCNPJ: string;
  takerInscriptionMunicipal?: string;
  takerAddress?: string;
  takerCity?: string;
  takerState?: string;
  takerZipCode?: string;

  // Service Details
  serviceDescription: string;
  serviceValue: number; // in cents (e.g., 10000 = R$ 100.00)
  deductionValue?: number; // in cents
  discountValue?: number; // in cents
  otherChargesValue?: number; // in cents

  // Tax retentions (all in cents, per ABRASF standard)
  issRate?: number;   // percentage, e.g. 5.00
  retISS?: number;    // ISS retention in cents
  retIRPJ?: number;   // IRPJ retention in cents
  retCSLL?: number;   // CSLL retention in cents
  retCOFINS?: number; // COFINS retention in cents
  retPIS?: number;    // PIS retention in cents
  retINSS?: number;   // INSS retention in cents

  // Dates
  competenceMonth: string; // YYYY-MM format
  rpsDate: string; // YYYY-MM-DD format
}

/**
 * Generate RPS XML according to ABRASF standard
 * @param data RPS data
 * @returns XML string
 */
export function generateRPSXML(data: RPSData): string {
  const valueInReais = (data.serviceValue / 100).toFixed(2);
  const deductionInReais = (data.deductionValue || 0) / 100;
  const discountInReais = (data.discountValue || 0) / 100;
  const otherChargesInReais = (data.otherChargesValue || 0) / 100;

  const retISS = (data.retISS || 0) / 100;
  const retIRPJ = (data.retIRPJ || 0) / 100;
  const retCSLL = (data.retCSLL || 0) / 100;
  const retCOFINS = (data.retCOFINS || 0) / 100;
  const retPIS = (data.retPIS || 0) / 100;
  const retINSS = (data.retINSS || 0) / 100;
  const issRate = (data.issRate || 0).toFixed(2);

  // Calculate net value (service - deductions - discount - retentions)
  const totalRetentions =
    (data.retIRPJ || 0) + (data.retCSLL || 0) + (data.retCOFINS || 0) +
    (data.retPIS || 0) + (data.retINSS || 0) + (data.retISS || 0);
  const netValue =
    data.serviceValue - (data.deductionValue || 0) - (data.discountValue || 0) +
    (data.otherChargesValue || 0) - totalRetentions;
  const netValueInReais = (netValue / 100).toFixed(2);

  // Generate unique RPS ID
  const rpsId = `${data.seriesNumber}${data.rpsNumber.padStart(12, "0")}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Rps xmlns="http://www.abrasf.org.br/nfse">
  <InfRps Id="Rps_${rpsId}">
    <Identificacao>
      <Numero>${data.rpsNumber}</Numero>
      <Serie>${data.seriesNumber}</Serie>
      <Tipo>${data.rpsType === "RPS" ? "1" : data.rpsType === "RPS-M" ? "2" : "3"}</Tipo>
    </Identificacao>
    <DataEmissao>${data.rpsDate}T00:00:00</DataEmissao>
    <Status>1</Status>
    <Servico>
      <Valores>
        <ValorServicos>${valueInReais}</ValorServicos>
        ${data.deductionValue ? `<ValorDeducoes>${deductionInReais.toFixed(2)}</ValorDeducoes>` : ""}
        ${data.discountValue ? `<ValorDesconto>${discountInReais.toFixed(2)}</ValorDesconto>` : ""}
        ${data.otherChargesValue ? `<ValorOutrasRetencoes>${otherChargesInReais.toFixed(2)}</ValorOutrasRetencoes>` : ""}
        ${data.retIRPJ ? `<ValorIr>${retIRPJ.toFixed(2)}</ValorIr>` : ""}
        ${data.retCSLL ? `<ValorCsll>${retCSLL.toFixed(2)}</ValorCsll>` : ""}
        ${data.retCOFINS ? `<ValorCofins>${retCOFINS.toFixed(2)}</ValorCofins>` : ""}
        ${data.retPIS ? `<ValorPis>${retPIS.toFixed(2)}</ValorPis>` : ""}
        ${data.retINSS ? `<ValorInss>${retINSS.toFixed(2)}</ValorInss>` : ""}
        <ValorLiquidoNfse>${netValueInReais}</ValorLiquidoNfse>
        <Aliquota>${issRate}</Aliquota>
        <ValorIssqn>${retISS.toFixed(2)}</ValorIssqn>
        <Descontos>0</Descontos>
      </Valores>
      <ItemListaServico>99.99</ItemListaServico>
      <Descricao>${escapeXML(data.serviceDescription)}</Descricao>
      <CodigoMunicipio>4314902</CodigoMunicipio>
    </Servico>
    <Prestador>
      <CpfCnpj>
        <Cnpj>${data.providerCNPJ}</Cnpj>
      </CpfCnpj>
      <InscricaoMunicipal>${data.providerInscriptionMunicipal}</InscricaoMunicipal>
    </Prestador>
    <Tomador>
      <IdentificacaoTomador>
        <CpfCnpj>
          ${data.takerCPFCNPJ.length === 11 ? `<Cpf>${data.takerCPFCNPJ}</Cpf>` : `<Cnpj>${data.takerCPFCNPJ}</Cnpj>`}
        </CpfCnpj>
        ${data.takerInscriptionMunicipal ? `<InscricaoMunicipal>${data.takerInscriptionMunicipal}</InscricaoMunicipal>` : ""}
      </IdentificacaoTomador>
      <RazaoSocial>${escapeXML(data.takerName)}</RazaoSocial>
      ${
        data.takerAddress
          ? `<Endereco>
        <Endereco>${escapeXML(data.takerAddress)}</Endereco>
        ${data.takerCity ? `<Numero>1</Numero>` : ""}
        ${data.takerCity ? `<Complemento></Complemento>` : ""}
        ${data.takerCity ? `<Bairro>Centro</Bairro>` : ""}
        ${data.takerCity ? `<Cidade>${data.takerCity}</Cidade>` : ""}
        ${data.takerState ? `<Uf>${data.takerState}</Uf>` : ""}
        ${data.takerZipCode ? `<Cep>${data.takerZipCode}</Cep>` : ""}
      </Endereco>`
          : ""
      }
    </Tomador>
    <Intermediario>
      <IdentificacaoIntermediario>
        <CpfCnpj>
          <Cnpj>00000000000000</Cnpj>
        </CpfCnpj>
      </IdentificacaoIntermediario>
    </Intermediario>
    <ConstructorData>
      <Endereco>
        <Endereco>Rua Exemplo</Endereco>
        <Numero>1</Numero>
        <Bairro>Centro</Bairro>
        <Cidade>4314902</Cidade>
        <Uf>RS</Uf>
        <Cep>90000000</Cep>
      </Endereco>
    </ConstructorData>
    <RegimeEspecialTributario>0</RegimeEspecialTributario>
    <OptanteSimplesNacional>2</OptanteSimplesNacional>
    <IncentivoFiscalCultura>2</IncentivoFiscalCultura>
  </InfRps>
</Rps>`;

  return xml;
}

/**
 * Escape special XML characters
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Validate RPS data before generating XML
 */
export function validateRPSData(data: RPSData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate CNPJ format (14 digits)
  if (!/^\d{14}$/.test(data.providerCNPJ)) {
    errors.push("Provider CNPJ must have 14 digits");
  }

  // Validate RPS number (1-999999999999)
  if (!/^\d{1,12}$/.test(data.rpsNumber)) {
    errors.push("RPS number must be between 1 and 999999999999");
  }

  // Validate series number
  if (!/^\d{1,5}$/.test(data.seriesNumber)) {
    errors.push("Series number must be between 1 and 99999");
  }

  // Validate service value (must be positive)
  if (data.serviceValue <= 0) {
    errors.push("Service value must be greater than 0");
  }

  // Validate competence month format (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(data.competenceMonth)) {
    errors.push("Competence month must be in YYYY-MM format");
  }

  // Validate RPS date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.rpsDate)) {
    errors.push("RPS date must be in YYYY-MM-DD format");
  }

  // Validate taker CPF/CNPJ (11 or 14 digits)
  if (!/^\d{11}$|^\d{14}$/.test(data.takerCPFCNPJ)) {
    errors.push("Taker CPF/CNPJ must have 11 or 14 digits");
  }

  // Validate service description is not empty
  if (!data.serviceDescription || data.serviceDescription.trim().length === 0) {
    errors.push("Service description cannot be empty");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
