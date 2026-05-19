import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Button variant="ghost" onClick={() => navigate(-1 as any)} className="mb-6 text-slate-600">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Política de Privacidade</h1>
        <p className="text-sm text-slate-500 mb-8">Última atualização: maio de 2026</p>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-900">1. Quem somos</h2>
            <p>
              O AutoNF é um serviço SaaS de automação de emissão de Notas Fiscais de Serviço (NFS-e)
              operado de acordo com a legislação brasileira, incluindo a Lei Geral de Proteção de Dados
              (LGPD — Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">2. Dados coletados</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Dados de identificação: nome, e-mail, CNPJ da empresa</li>
              <li>Dados fiscais: inscrição municipal, endereço, descrições de serviços e valores de NFs</li>
              <li>Certificado digital A1 (armazenado criptografado com AES-256-GCM)</li>
              <li>Dados de pagamento: gerenciados pelo Asaas; não armazenamos dados de cartão</li>
              <li>Dados de acesso: logs de autenticação e uso da plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">3. Finalidade do tratamento</h2>
            <p>Os dados são usados exclusivamente para:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Emissão de NFS-e junto às prefeituras municipais</li>
              <li>Gestão de assinatura e cobrança</li>
              <li>Suporte técnico e comunicações operacionais</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">4. Compartilhamento de dados</h2>
            <p>
              Compartilhamos dados apenas com terceiros necessários à operação do serviço: APIs das
              prefeituras municipais (para emissão das NFS-e) e Asaas (processamento de pagamentos).
              Não vendemos dados a terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">5. Seus direitos (LGPD art. 18)</h2>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Acesso:</strong> solicite uma cópia dos seus dados via suporte</li>
              <li><strong>Correção:</strong> atualize seus dados na tela de Configurações</li>
              <li><strong>Exclusão:</strong> exclua sua conta e todos os dados em Configurações › Conta</li>
              <li><strong>Portabilidade:</strong> solicite exportação dos seus dados via suporte</li>
              <li><strong>Revogação do consentimento:</strong> exclua sua conta a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">6. Retenção de dados</h2>
            <p>
              Dados fiscais (NFS-e emitidas) são mantidos pelo prazo mínimo legal de 5 anos conforme
              legislação tributária brasileira, mesmo após exclusão da conta. Demais dados são excluídos
              imediatamente ao solicitar a exclusão da conta.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">7. Segurança</h2>
            <p>
              Certificados digitais são criptografados com AES-256-GCM. Senhas nunca são armazenadas em
              texto plano. Todo tráfego ocorre via HTTPS/TLS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">8. Contato</h2>
            <p>
              Dúvidas sobre privacidade? Entre em contato pelo e-mail{" "}
              <a href="mailto:privacidade@autonf.com.br" className="text-blue-600 underline">
                privacidade@autonf.com.br
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
