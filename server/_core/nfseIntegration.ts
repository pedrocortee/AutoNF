/**
 * NFS-e Integration Module for Rio Grande do Sul
 * Handles communication with municipal NFS-e APIs
 */

import axios, { AxiosInstance } from "axios";
import {
  generateCancelamentoXML,
  validateCancelamentoData,
  getCancelEndpoint,
  parseCancelamentoResponse,
  isWithinCancellationDeadline,
  type CancelamentoData,
  type CancelamentoResult,
  type CancelamentoMotivo,
} from "./cancelamentoGenerator";
import { signXMLWithCertificate } from "./xmlSigner";

export interface NFSeConfig {
  municipalityCode: string; // IBGE municipality code
  endpoint: string; // API endpoint URL
  environment: "homologacao" | "producao"; // Environment
  timeout?: number; // Request timeout in ms
}

export interface SubmitRPSRequest {
  rpsXml: string; // Signed RPS XML
  cnpj: string; // Provider CNPJ
  inscriptionMunicipal: string; // Municipal registration
}

export interface SubmitRPSResponse {
  success: boolean;
  nfseNumber?: string; // NFS-e number if successful
  rpsNumber?: string; // RPS number
  protocolNumber?: string; // Protocol number for tracking
  issueDate?: string; // Issue date
  error?: string; // Error message if failed
  errorCode?: string; // Error code
  details?: any; // Additional details from API
}

/**
 * NFS-e API Client for Rio Grande do Sul
 */
export class NFSeClient {
  private client: AxiosInstance;
  private config: NFSeConfig;

  constructor(config: NFSeConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.endpoint,
      timeout: config.timeout || 30000,
      headers: {
        "Content-Type": "application/xml",
        Accept: "application/xml",
      },
    });
  }

  /**
   * Submit RPS to NFS-e API
   * @param request RPS submission request
   * @returns Submission response
   */
  async submitRPS(request: SubmitRPSRequest): Promise<SubmitRPSResponse> {
    try {
      // Validate inputs
      if (!request.rpsXml || request.rpsXml.trim().length === 0) {
        return {
          success: false,
          error: "RPS XML is required",
          errorCode: "INVALID_INPUT",
        };
      }

      if (!request.cnpj || !/^\d{14}$/.test(request.cnpj)) {
        return {
          success: false,
          error: "Invalid CNPJ format",
          errorCode: "INVALID_CNPJ",
        };
      }

      // Submit RPS to API
      const response = await this.client.post("/nfse/enviar-rps", request.rpsXml, {
        headers: {
          "X-CNPJ": request.cnpj,
          "X-Inscricao-Municipal": request.inscriptionMunicipal,
        },
      });

      // Parse response
      return this.parseResponse(response.data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Query NFS-e status
   * @param nfseNumber NFS-e number
   * @param cnpj Provider CNPJ
   * @returns NFS-e details
   */
  async queryNFSeStatus(nfseNumber: string, cnpj: string): Promise<SubmitRPSResponse> {
    try {
      const response = await this.client.get(`/nfse/${nfseNumber}`, {
        headers: {
          "X-CNPJ": cnpj,
        },
      });

      return this.parseResponse(response.data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Cancel NFS-e (legacy — no certificate signing)
   */
  async cancelNFSe(nfseNumber: string, cnpj: string, reason: string): Promise<SubmitRPSResponse> {
    try {
      const cancelXml = this.generateCancelXml(nfseNumber, cnpj, reason);
      const response = await this.client.post("/nfse/cancelar", cancelXml, {
        headers: { "X-CNPJ": cnpj },
      });
      return this.parseResponse(response.data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Cancel NFS-e with digital certificate signing (ABRASF-compliant)
   */
  async cancelNFSeWithCertificate(params: {
    cancelData: CancelamentoData;
    certificateData: string;
    certificatePassword: string;
    environment?: "homologacao" | "producao";
  }): Promise<CancelamentoResult> {
    const { cancelData, certificateData, certificatePassword, environment = "homologacao" } = params;

    const validation = validateCancelamentoData(cancelData);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(", "), errorCode: "VALIDATION_ERROR" };
    }

    try {
      const cancelXml = generateCancelamentoXML(cancelData);

      const { signedXml } = signXMLWithCertificate({
        certificateData,
        certificatePassword,
        xmlContent: cancelXml,
      });

      const endpoint = getCancelEndpoint(cancelData.municipalityCode, environment);
      const response = await axios.post(endpoint, signedXml, {
        headers: {
          "Content-Type": "application/xml",
          Accept: "application/xml",
          "X-CNPJ": cancelData.providerCNPJ,
          "X-Inscricao-Municipal": cancelData.providerInscricaoMunicipal,
        },
        timeout: 30000,
      });

      return parseCancelamentoResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const parsed = parseCancelamentoResponse(error.response.data);
          return parsed.success ? parsed : {
            success: false,
            error: `API Error ${error.response.status}: ${error.response.statusText}`,
            errorCode: `HTTP_${error.response.status}`,
            details: error.response.data,
          };
        }
        return { success: false, error: "Sem resposta da API da prefeitura", errorCode: "NO_RESPONSE" };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  /**
   * Parse API response
   * @param responseData Response data from API
   * @returns Parsed response
   */
  private parseResponse(responseData: any): SubmitRPSResponse {
    try {
      // Handle XML response
      if (typeof responseData === "string") {
        // Simple XML parsing (in production, use xml2js or similar)
        const nfseMatch = responseData.match(/<Numero>(\d+)<\/Numero>/);
        const rpsMatch = responseData.match(/<RpsNumero>(\d+)<\/RpsNumero>/);
        const protocolMatch = responseData.match(/<Protocolo>([^<]+)<\/Protocolo>/);
        const dateMatch = responseData.match(/<DataEmissao>([^<]+)<\/DataEmissao>/);
        const errorMatch = responseData.match(/<Erro>([^<]+)<\/Erro>/);

        if (errorMatch) {
          return {
            success: false,
            error: errorMatch[1],
            errorCode: "API_ERROR",
            details: responseData,
          };
        }

        return {
          success: true,
          nfseNumber: nfseMatch ? nfseMatch[1] : undefined,
          rpsNumber: rpsMatch ? rpsMatch[1] : undefined,
          protocolNumber: protocolMatch ? protocolMatch[1] : undefined,
          issueDate: dateMatch ? dateMatch[1] : undefined,
          details: responseData,
        };
      }

      // Handle JSON response
      if (typeof responseData === "object") {
        if (responseData.error) {
          return {
            success: false,
            error: responseData.error.message || "Unknown error",
            errorCode: responseData.error.code || "API_ERROR",
            details: responseData,
          };
        }

        return {
          success: true,
          nfseNumber: responseData.nfseNumber,
          rpsNumber: responseData.rpsNumber,
          protocolNumber: responseData.protocolNumber,
          issueDate: responseData.issueDate,
          details: responseData,
        };
      }

      return {
        success: false,
        error: "Invalid response format",
        errorCode: "INVALID_RESPONSE",
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
        errorCode: "PARSE_ERROR",
      };
    }
  }

  /**
   * Handle API errors
   * @param error Error object
   * @returns Error response
   */
  private handleError(error: any): SubmitRPSResponse {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // API returned error response
        return {
          success: false,
          error: `API Error: ${error.response.status} ${error.response.statusText}`,
          errorCode: `HTTP_${error.response.status}`,
          details: error.response.data,
        };
      } else if (error.request) {
        // Request made but no response
        return {
          success: false,
          error: "No response from API",
          errorCode: "NO_RESPONSE",
        };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      errorCode: "UNKNOWN_ERROR",
    };
  }

  /**
   * Generate cancel XML
   * @param nfseNumber NFS-e number
   * @param cnpj Provider CNPJ
   * @param reason Cancellation reason
   * @returns Cancel XML
   */
  private generateCancelXml(nfseNumber: string, cnpj: string, reason: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<CancelamentoNfse xmlns="http://www.abrasf.org.br/nfse">
  <Pedido>
    <InfPedidoCancelamento Id="Cancelamento_${nfseNumber}">
      <IdentificacaoNfse>
        <Numero>${nfseNumber}</Numero>
        <CpfCnpj>
          <Cnpj>${cnpj}</Cnpj>
        </CpfCnpj>
      </IdentificacaoNfse>
      <DataPedido>${new Date().toISOString().split("T")[0]}</DataPedido>
      <Motivo>${reason}</Motivo>
    </InfPedidoCancelamento>
  </Pedido>
</CancelamentoNfse>`;
  }
}

export { isWithinCancellationDeadline, CANCELAMENTO_MOTIVOS } from "./cancelamentoGenerator";
export type { CancelamentoData, CancelamentoResult, CancelamentoMotivo };

/**
 * Get NFS-e client for a specific municipality
 */
export function getNFSeClient(
  municipalityCode: string,
  environment: "homologacao" | "producao" = "homologacao"
): NFSeClient {
  // Map of municipalities to their API endpoints
  const endpoints: Record<string, Record<string, string>> = {
    // Porto Alegre (4314902)
    "4314902": {
      homologacao: "https://nfse-hom.abaco.com.br/api",
      producao: "https://nfse.abaco.com.br/api",
    },
    // Caxias do Sul (4305108)
    "4305108": {
      homologacao: "https://nfse-hom.abaco.com.br/api",
      producao: "https://nfse.abaco.com.br/api",
    },
    // Novo Hamburgo (4314902)
    "4313409": {
      homologacao: "https://nfse-hom.abaco.com.br/api",
      producao: "https://nfse.abaco.com.br/api",
    },
  };

  const endpoint = endpoints[municipalityCode]?.[environment];
  if (!endpoint) {
    throw new Error(`No NFS-e endpoint configured for municipality ${municipalityCode}`);
  }

  return new NFSeClient({
    municipalityCode,
    endpoint,
    environment,
  });
}
