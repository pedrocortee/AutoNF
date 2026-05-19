/**
 * NFS-e Cancellation XML Generator
 * Generates cancellation requests per ABRASF standard
 */

export type CancelamentoMotivo =
  | "1" // Erro na emissão
  | "2" // Serviço não prestado
  | "3" // Duplicidade da nota
  | "4"; // Outro

export const CANCELAMENTO_MOTIVOS: Record<CancelamentoMotivo, string> = {
  "1": "Erro na emissão",
  "2": "Serviço não prestado",
  "3": "Duplicidade da nota",
  "4": "Outro",
};

export interface CancelamentoData {
  nfseNumber: string;
  providerCNPJ: string;
  providerInscricaoMunicipal: string;
  municipalityCode: string;
  motivo: CancelamentoMotivo;
}

export interface CancelamentoResult {
  success: boolean;
  nfseNumber?: string;
  protocolNumber?: string;
  cancellationDate?: string;
  error?: string;
  errorCode?: string;
  details?: unknown;
}

/**
 * Generate ABRASF-compliant cancellation XML for NFS-e
 */
export function generateCancelamentoXML(data: CancelamentoData): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<CancelarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Pedido>
    <InfPedidoCancelamento Id="PCC_${data.nfseNumber}">
      <IdentificacaoNfse>
        <Numero>${data.nfseNumber}</Numero>
        <CpfCnpj>
          <Cnpj>${data.providerCNPJ}</Cnpj>
        </CpfCnpj>
        <InscricaoMunicipal>${data.providerInscricaoMunicipal}</InscricaoMunicipal>
        <CodigoMunicipio>${data.municipalityCode}</CodigoMunicipio>
      </IdentificacaoNfse>
      <CodigoCancelamento>${data.motivo}</CodigoCancelamento>
    </InfPedidoCancelamento>
  </Pedido>
</CancelarNfseEnvio>`;
}

/**
 * Validate cancellation data before generating XML
 */
export function validateCancelamentoData(data: CancelamentoData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.nfseNumber || !/^\d{1,15}$/.test(data.nfseNumber)) {
    errors.push("Número da NFS-e deve conter apenas dígitos (máximo 15)");
  }

  if (!data.providerCNPJ || !/^\d{14}$/.test(data.providerCNPJ)) {
    errors.push("CNPJ do prestador deve ter exatamente 14 dígitos");
  }

  if (!data.providerInscricaoMunicipal || data.providerInscricaoMunicipal.trim().length === 0) {
    errors.push("Inscrição Municipal é obrigatória");
  }

  if (!data.municipalityCode || !/^\d{7}$/.test(data.municipalityCode)) {
    errors.push("Código do município IBGE deve ter 7 dígitos");
  }

  if (!["1", "2", "3", "4"].includes(data.motivo)) {
    errors.push("Código de cancelamento inválido (use 1, 2, 3 ou 4)");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Municipality cancellation endpoint map (RS)
 */
const CANCEL_ENDPOINTS: Record<string, Record<"homologacao" | "producao", string>> = {
  // Porto Alegre
  "4314902": {
    homologacao: "https://nfse-hom.abaco.com.br/api/nfse/cancelar",
    producao: "https://nfse.abaco.com.br/api/nfse/cancelar",
  },
  // Caxias do Sul
  "4305108": {
    homologacao: "https://nfse-hom.abaco.com.br/api/nfse/cancelar",
    producao: "https://nfse.abaco.com.br/api/nfse/cancelar",
  },
  // Novo Hamburgo
  "4313409": {
    homologacao: "https://nfse-hom.abaco.com.br/api/nfse/cancelar",
    producao: "https://nfse.abaco.com.br/api/nfse/cancelar",
  },
};

/**
 * Cancellation deadline per municipality (calendar days after emission)
 * Most RS municipalities follow the 15-day rule, Porto Alegre allows 60 days.
 */
export const CANCELLATION_DEADLINE_DAYS: Record<string, number> = {
  "4314902": 60, // Porto Alegre: 60 days
  "4305108": 15, // Caxias do Sul: 15 days
  "4313409": 15, // Novo Hamburgo: 15 days
};

export function getCancelEndpoint(
  municipalityCode: string,
  environment: "homologacao" | "producao" = "homologacao"
): string {
  const ep = CANCEL_ENDPOINTS[municipalityCode]?.[environment];
  if (!ep) {
    throw new Error(`Nenhum endpoint de cancelamento configurado para o município ${municipalityCode}`);
  }
  return ep;
}

/**
 * Check if a NFS-e is still within the cancellation deadline
 */
export function isWithinCancellationDeadline(
  processedAt: Date,
  municipalityCode: string
): { within: boolean; deadlineDays: number; daysElapsed: number } {
  const deadlineDays = CANCELLATION_DEADLINE_DAYS[municipalityCode] ?? 15;
  const now = new Date();
  const diffMs = now.getTime() - processedAt.getTime();
  const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return {
    within: daysElapsed <= deadlineDays,
    deadlineDays,
    daysElapsed,
  };
}

/**
 * Parse cancellation response XML from municipality API
 */
export function parseCancelamentoResponse(responseData: unknown): CancelamentoResult {
  if (typeof responseData === "string") {
    const errorMatch = responseData.match(/<Erro>([^<]+)<\/Erro>/);
    const codigoMatch = responseData.match(/<Codigo>([^<]+)<\/Codigo>/);
    const mensagemMatch = responseData.match(/<Mensagem>([^<]+)<\/Mensagem>/);
    const protocolMatch = responseData.match(/<Protocolo>([^<]+)<\/Protocolo>/);
    const dateMatch = responseData.match(/<DataCancelamento>([^<]+)<\/DataCancelamento>/);
    const nfseMatch = responseData.match(/<Numero>(\d+)<\/Numero>/);

    if (errorMatch || mensagemMatch) {
      return {
        success: false,
        error: mensagemMatch?.[1] ?? errorMatch?.[1] ?? "Erro desconhecido",
        errorCode: codigoMatch?.[1] ?? "API_ERROR",
        details: responseData,
      };
    }

    return {
      success: true,
      nfseNumber: nfseMatch?.[1],
      protocolNumber: protocolMatch?.[1],
      cancellationDate: dateMatch?.[1],
      details: responseData,
    };
  }

  if (typeof responseData === "object" && responseData !== null) {
    const obj = responseData as Record<string, unknown>;
    if (obj.error) {
      return {
        success: false,
        error: String(obj.error),
        errorCode: "API_ERROR",
        details: obj,
      };
    }
    return {
      success: true,
      nfseNumber: obj.nfseNumber as string | undefined,
      protocolNumber: obj.protocolNumber as string | undefined,
      cancellationDate: obj.cancellationDate as string | undefined,
      details: obj,
    };
  }

  return { success: false, error: "Resposta inválida da API", errorCode: "INVALID_RESPONSE" };
}
