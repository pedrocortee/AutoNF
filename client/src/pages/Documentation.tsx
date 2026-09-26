import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, Zap, ShieldCheck, RefreshCw, AlertTriangle, XCircle } from "lucide-react";

export default function Documentation() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">
              NF
            </div>
            <span className="font-semibold text-lg text-slate-900">AutoNF Docs</span>
          </div>
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16">
        {/* Hero */}
        <section className="space-y-4">
          <h1 className="text-5xl font-bold text-slate-900">AutoNF MVP</h1>
          <p className="text-xl text-slate-600 max-w-2xl">
            Documentação completa do sistema de emissão automática de notas fiscais. Este documento descreve a arquitetura, funcionalidades e roadmap do MVP.
          </p>
        </section>

        {/* Table of Contents */}
        <nav className="bg-white rounded-lg border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Índice</h2>
          <ul className="space-y-3 text-slate-700">
            <li><a href="#visao-geral" className="text-blue-600 hover:text-blue-700">1. Visão Geral do Produto</a></li>
            <li><a href="#proposta-valor" className="text-blue-600 hover:text-blue-700">2. Proposta de Valor</a></li>
            <li><a href="#arquitetura" className="text-blue-600 hover:text-blue-700">3. Arquitetura do Sistema</a></li>
            <li><a href="#funcionalidades" className="text-blue-600 hover:text-blue-700">4. Funcionalidades do MVP</a></li>
            <li><a href="#modelo-dados" className="text-blue-600 hover:text-blue-700">5. Modelo de Dados</a></li>
            <li><a href="#stack" className="text-blue-600 hover:text-blue-700">6. Stack Tecnológica</a></li>
            <li><a href="#roadmap" className="text-blue-600 hover:text-blue-700">7. Roadmap Futuro</a></li>
            <li><a href="#webhooks" className="text-blue-600 hover:text-blue-700">8. Webhooks — Integre o AutoNF com seu negócio</a></li>
          </ul>
        </nav>

        {/* Section 1 */}
        <section id="visao-geral" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">1. Visão Geral do Produto</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <p className="text-slate-700 leading-relaxed">
            <strong>AutoNF</strong> é uma plataforma SaaS para emissão automática de Notas Fiscais de Serviço Eletrônicas (NFS-e). O sistema integra diretamente com as APIs das prefeituras, gerencia certificados digitais A1, controla planos e assinaturas, e notifica sistemas externos via webhooks — tudo em um painel unificado.
          </p>
          <p className="text-slate-700 leading-relaxed">
            O AutoNF foi construído para prestadores de serviço que precisam emitir NFS-e com frequência e querem automatizar o processo: desde a criação da nota até o envio do PDF ao cliente, passando pela emissão na prefeitura e o cancelamento quando necessário.
          </p>
        </section>

        {/* Section 2 */}
        <section id="proposta-valor" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">2. Proposta de Valor</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Emissão Real via API da Prefeitura</h3>
              <p className="text-slate-700">Crie notas fiscais e envie diretamente para a prefeitura com seu certificado digital A1. O processamento é assíncrono — você não precisa aguardar na tela, o sistema avisa quando terminar.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Cancelamento com Prazo Automático</h3>
              <p className="text-slate-700">Cancele notas diretamente na prefeitura informando o motivo. O sistema verifica automaticamente o prazo legal de cancelamento de cada município antes de permitir a operação.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Planos com Controle de Uso</h3>
              <p className="text-slate-700">Escolha o plano adequado ao seu volume de emissões. O sistema bloqueia automaticamente quando o limite mensal é atingido e exibe o consumo em tempo real no dashboard.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Notificações e Webhooks</h3>
              <p className="text-slate-700">Envie o PDF da nota por e-mail ao tomador automaticamente após a emissão. Integre com seu ERP ou qualquer sistema via webhooks em tempo real.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Dashboard e Histórico Completo</h3>
              <p className="text-slate-700">Visualize métricas em tempo real, filtre notas por status, cliente ou período, e acompanhe cada transição de status com timestamp exato em uma timeline visual.</p>
            </div>
          </div>
        </section>

        {/* Section 3 */}
        <section id="arquitetura" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">3. Arquitetura do Sistema</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <p className="text-slate-700 leading-relaxed">
            O AutoNF segue uma arquitetura moderna com separação clara entre frontend e backend, utilizando tRPC para comunicação type-safe.
          </p>
          <div className="bg-slate-900 rounded-lg p-8 text-slate-100 font-mono text-sm overflow-x-auto">
            <pre>{`Fluxo de Emissão de NFS-e:

1. Usuário preenche o formulário e cria a nota
   ↓
2. Backend valida plano e limite de uso mensal
   ↓
3. Nota criada com status "Pendente" + webhook invoice.created disparado
   ↓
4. Usuário clica em "Enviar para Prefeitura"
   ↓
5. Job enfileirado no BullMQ (processamento assíncrono)
   Nota passa para status "Processando"
   ↓
6. Worker executa: assina XML com certificado A1 + envia à API da prefeitura
   ├── Sucesso → status "Processado", NFS-e number salvo, PDF gerado
   │             webhook invoice.processed + e-mail ao tomador
   └── Erro    → status "Erro", mensagem salva
                 webhook invoice.error + e-mail de alerta ao prestador
   ↓
7. Frontend atualiza via polling até receber resultado final`}</pre>
          </div>
          <p className="text-slate-700 leading-relaxed">
            <strong>Estados da Nota Fiscal:</strong>
          </p>
          <ul className="space-y-2 text-slate-700">
            <li><strong>Pendente:</strong> Nota criada, aguardando ser enviada à prefeitura</li>
            <li><strong>Processando:</strong> Job enfileirado, aguardando resposta da prefeitura</li>
            <li><strong>Processado:</strong> NFS-e emitida com sucesso — número e PDF disponíveis</li>
            <li><strong>Erro:</strong> Falha na comunicação com a prefeitura após tentativas</li>
            <li><strong>Cancelado:</strong> NFS-e cancelada na prefeitura com protocolo registrado</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section id="funcionalidades" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">4. Funcionalidades</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Notas Fiscais (NFS-e)</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>Criação com cliente, serviço, valor, competência, retenções (IRPJ, CSLL, COFINS, PIS, INSS) e CPF/CNPJ do tomador</li>
                <li>Cálculo automático do ISS com base na alíquota configurada</li>
                <li>Envio assíncrono à API da prefeitura com assinatura XML via certificado A1</li>
                <li>Cancelamento com verificação automática do prazo legal por município</li>
                <li>Download do PDF da NFS-e emitida</li>
                <li>Filtros por status, cliente e mês de competência</li>
                <li>Timeline completa de histórico de cada nota</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Planos e Assinaturas</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>4 planos: Gratuito (3 notas no total da conta), Starter, Professional e Enterprise</li>
                <li>Controle de uso mensal com bloqueio ao atingir o limite</li>
                <li>Upgrade e downgrade imediatos</li>
                <li>Plano Gratuito ativa diretamente; planos pagos redirecionam ao checkout do Asaas</li>
                <li>Cancelamento de assinatura com cancelamento automático no Asaas</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Certificado Digital</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>Upload de certificado A1 (.pfx / .p12)</li>
                <li>Validação automática de integridade e datas</li>
                <li>Senha criptografada antes de ser armazenada</li>
                <li>Alerta automático quando o certificado expira em até 30 dias</li>
                <li>Histórico de certificados enviados</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Configurações da Empresa</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>CNPJ, inscrição municipal, razão social, endereço, município e estado</li>
                <li>Alíquota ISS por município (2% a 5%)</li>
                <li>Código de serviço LC 116/2003</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Notificações por E-mail</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>Envio automático do PDF da NFS-e ao tomador após emissão</li>
                <li>Alerta ao prestador quando uma nota falha após todas as tentativas</li>
                <li>E-mail padrão do tomador configurável</li>
                <li>Suporte a SMTP próprio ou Resend como provedor</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Autenticação e Conta</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>Autenticação via Clerk (login, cadastro, sessão segura)</li>
                <li>Sincronização automática de nome e e-mail via webhook do Clerk</li>
                <li>Consentimento de privacidade (LGPD)</li>
                <li>Exclusão de conta com remoção de todos os dados</li>
                <li>Modo claro e escuro configurável em Configurações → Conta</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 5 */}
        <section id="modelo-dados" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">5. Modelo de Dados</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <p className="text-slate-700 leading-relaxed">
            O banco de dados foi projetado com normalização adequada para suportar o fluxo de emissão e histórico completo.
          </p>
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Tabela: invoices</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-900">Campo</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900">Tipo</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">id</td>
                    <td className="py-2 px-3 text-slate-700">INT</td>
                    <td className="py-2 px-3 text-slate-700">Chave primária</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">userId</td>
                    <td className="py-2 px-3 text-slate-700">INT</td>
                    <td className="py-2 px-3 text-slate-700">Referência ao usuário</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">clientName</td>
                    <td className="py-2 px-3 text-slate-700">VARCHAR(255)</td>
                    <td className="py-2 px-3 text-slate-700">Nome do tomador/cliente</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">serviceDescription</td>
                    <td className="py-2 px-3 text-slate-700">TEXT</td>
                    <td className="py-2 px-3 text-slate-700">Descrição do serviço</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">value</td>
                    <td className="py-2 px-3 text-slate-700">INT</td>
                    <td className="py-2 px-3 text-slate-700">Valor em centavos</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">competenceMonth</td>
                    <td className="py-2 px-3 text-slate-700">VARCHAR(7)</td>
                    <td className="py-2 px-3 text-slate-700">Mês de competência (YYYY-MM)</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">status</td>
                    <td className="py-2 px-3 text-slate-700">ENUM</td>
                    <td className="py-2 px-3 text-slate-700">Pendente, Processado, Erro</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">errorMessage</td>
                    <td className="py-2 px-3 text-slate-700">TEXT</td>
                    <td className="py-2 px-3 text-slate-700">Mensagem de erro (se aplicável)</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">createdAt</td>
                    <td className="py-2 px-3 text-slate-700">TIMESTAMP</td>
                    <td className="py-2 px-3 text-slate-700">Data de criação</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-slate-700">processedAt</td>
                    <td className="py-2 px-3 text-slate-700">TIMESTAMP</td>
                    <td className="py-2 px-3 text-slate-700">Data de processamento</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Tabela: invoiceHistory</h3>
            <p className="text-slate-700 mb-4">Rastreia todas as transições de status:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-900">Campo</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900">Tipo</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">id</td>
                    <td className="py-2 px-3 text-slate-700">INT</td>
                    <td className="py-2 px-3 text-slate-700">Chave primária</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">invoiceId</td>
                    <td className="py-2 px-3 text-slate-700">INT</td>
                    <td className="py-2 px-3 text-slate-700">Referência à nota fiscal</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">fromStatus</td>
                    <td className="py-2 px-3 text-slate-700">ENUM</td>
                    <td className="py-2 px-3 text-slate-700">Status anterior</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">toStatus</td>
                    <td className="py-2 px-3 text-slate-700">ENUM</td>
                    <td className="py-2 px-3 text-slate-700">Novo status</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-700">reason</td>
                    <td className="py-2 px-3 text-slate-700">TEXT</td>
                    <td className="py-2 px-3 text-slate-700">Motivo da transição</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-slate-700">createdAt</td>
                    <td className="py-2 px-3 text-slate-700">TIMESTAMP</td>
                    <td className="py-2 px-3 text-slate-700">Data da transição</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Section 6 */}
        <section id="stack" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">6. Stack Tecnológica</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Frontend</h3>
              <ul className="space-y-2 text-slate-700">
                <li><strong>React 19:</strong> UI library moderna</li>
                <li><strong>TypeScript:</strong> Type safety</li>
                <li><strong>Tailwind CSS 4:</strong> Styling elegante</li>
                <li><strong>shadcn/ui:</strong> Componentes premium</li>
                <li><strong>tRPC:</strong> Type-safe API calls</li>
                <li><strong>Wouter:</strong> Roteamento leve</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Backend</h3>
              <ul className="space-y-2 text-slate-700">
                <li><strong>Express 4:</strong> Web framework</li>
                <li><strong>tRPC 11:</strong> RPC framework type-safe</li>
                <li><strong>Drizzle ORM:</strong> Queries type-safe</li>
                <li><strong>MySQL:</strong> Banco de dados relacional</li>
                <li><strong>BullMQ:</strong> Fila de jobs para emissão assíncrona</li>
                <li><strong>Clerk:</strong> Autenticação e gerenciamento de usuários</li>
                <li><strong>Asaas:</strong> Gateway de pagamento brasileiro</li>
                <li><strong>Zod:</strong> Validação de schemas</li>
                <li><strong>SMTP / Resend:</strong> Envio de e-mails</li>
              </ul>
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-3">Decisões de Design</h3>
            <ul className="space-y-2 text-slate-700">
              <li>✓ <strong>tRPC:</strong> Elimina REST API manual e garante type safety end-to-end</li>
              <li>✓ <strong>BullMQ:</strong> Emissão assíncrona evita timeout na requisição HTTP ao enviar à prefeitura</li>
              <li>✓ <strong>Drizzle ORM:</strong> Queries type-safe com excelente DX</li>
              <li>✓ <strong>Clerk:</strong> Autenticação robusta sem gerenciar senhas ou sessões manualmente</li>
              <li>✓ <strong>Asaas:</strong> Gateway de pagamento nativo BR com suporte a boleto, Pix e cartão</li>
            </ul>
          </div>
        </section>

        {/* Section 7 */}
        <section id="roadmap" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">7. Roadmap</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <div className="bg-green-50 rounded-lg border border-green-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">✓ Entregue (versão atual)</h3>
            <ul className="space-y-2 text-slate-700">
              <li>✓ Emissão real de NFS-e via API das prefeituras (Porto Alegre, Caxias do Sul, Novo Hamburgo)</li>
              <li>✓ Cancelamento de NFS-e com verificação de prazo legal por município</li>
              <li>✓ Processamento assíncrono com BullMQ e polling de status</li>
              <li>✓ Certificado digital A1 com validação, criptografia e alerta de expiração</li>
              <li>✓ Planos e assinaturas com controle de uso mensal</li>
              <li>✓ Pagamentos via Asaas (boleto, Pix, cartão)</li>
              <li>✓ PDF da NFS-e gerado e disponível para download</li>
              <li>✓ Notificações por e-mail ao tomador e ao prestador</li>
              <li>✓ Webhooks com assinatura HMAC-SHA256 e retry automático</li>
              <li>✓ Dashboard com métricas, filtros e histórico completo</li>
              <li>✓ Autenticação via Clerk com sincronização de perfil</li>
              <li>✓ Modo claro e escuro</li>
            </ul>
          </div>
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">📋 Próximas versões</h3>
            <ul className="space-y-2 text-slate-700">
              <li>Expansão para mais municípios (São Paulo, Rio de Janeiro, Belo Horizonte)</li>
              <li>Suporte a múltiplas empresas/CNPJ por conta</li>
              <li>Exportação de dados (CSV, Excel) para contabilidade</li>
              <li>Dashboard avançado com analytics e gráficos de faturamento</li>
              <li>API pública REST para integração direta sem webhooks</li>
              <li>Integração nativa com escritórios de contabilidade</li>
              <li>Aplicativo mobile</li>
            </ul>
          </div>
        </section>

        {/* Section 8 — Webhooks */}
        <section id="webhooks" className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">8. Webhooks — Integre o AutoNF com seu negócio</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>

          {/* O que é */}
          <div className="bg-white rounded-lg border border-slate-200 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">O que é um Webhook?</h3>
            </div>
            <p className="text-slate-700 leading-relaxed mb-4">
              Imagine que você contratou um funcionário para emitir notas fiscais. Toda vez que ele termina uma nota, em vez de você ficar perguntando <em>"terminou? terminou?"</em>, ele te manda uma mensagem automática avisando: <strong>"Pronto, nota emitida."</strong>
            </p>
            <p className="text-slate-700 leading-relaxed mb-4">
              Webhook é exatamente isso — o AutoNF avisa automaticamente o sistema que você quiser (ERP, WhatsApp, planilha, sistema financeiro) no momento em que algo acontece, sem você precisar entrar no painel para verificar.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mt-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">Sem webhook, seu processo é assim:</p>
              <div className="flex items-center gap-2 flex-wrap text-sm text-slate-600 mb-4">
                <span className="bg-slate-200 px-2 py-1 rounded">Nota emitida</span>
                <span>→</span>
                <span className="bg-slate-200 px-2 py-1 rounded">Você entra no AutoNF</span>
                <span>→</span>
                <span className="bg-slate-200 px-2 py-1 rounded">Atualiza manualmente</span>
                <span>→</span>
                <span className="bg-slate-200 px-2 py-1 rounded">Avisa o cliente</span>
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-3">Com webhook, tudo acontece sozinho:</p>
              <div className="flex items-center gap-2 flex-wrap text-sm text-slate-600">
                <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-medium">Nota emitida</span>
                <span>→</span>
                <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-medium">AutoNF avisa seu sistema</span>
                <span>→</span>
                <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-medium">Tudo atualizado automaticamente</span>
              </div>
            </div>
          </div>

          {/* Eventos */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Eventos disponíveis</h3>
            <p className="text-slate-600 mb-5">O AutoNF envia um aviso automático em 4 momentos diferentes da vida de uma nota fiscal:</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-blue-600" />
                  </div>
                  <code className="text-sm font-mono font-semibold text-slate-800">invoice.created</code>
                </div>
                <p className="text-sm text-slate-600">Disparado quando uma nova nota fiscal é criada no sistema, antes de ser enviada à prefeitura.</p>
                <p className="text-xs text-slate-400 mt-2 font-medium">Útil para: iniciar cobrança, registrar no ERP</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-green-600" />
                  </div>
                  <code className="text-sm font-mono font-semibold text-slate-800">invoice.processed</code>
                </div>
                <p className="text-sm text-slate-600">Disparado quando a nota é emitida com sucesso pela prefeitura e o número da NFS-e é gerado.</p>
                <p className="text-xs text-slate-400 mt-2 font-medium">Útil para: enviar PDF ao cliente, liberar pagamento</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <code className="text-sm font-mono font-semibold text-slate-800">invoice.error</code>
                </div>
                <p className="text-sm text-slate-600">Disparado quando a nota falha após todas as tentativas de reenvio automático.</p>
                <p className="text-xs text-slate-400 mt-2 font-medium">Útil para: alerta no WhatsApp, Slack, e-mail de emergência</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                    <XCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <code className="text-sm font-mono font-semibold text-slate-800">invoice.cancelled</code>
                </div>
                <p className="text-sm text-slate-600">Disparado quando uma nota processada é cancelada na prefeitura com o número de protocolo.</p>
                <p className="text-xs text-slate-400 mt-2 font-medium">Útil para: estorno automático, novo ciclo de faturamento</p>
              </div>
            </div>
          </div>

          {/* Casos de uso */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Como usar no seu negócio</h3>
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <p className="font-semibold text-slate-900 mb-1">"Quero que meu cliente receba o PDF da nota automaticamente"</p>
                <p className="text-sm text-slate-600">Configure um webhook para <code className="bg-slate-100 px-1 rounded text-xs">invoice.processed</code>. Quando a nota sair, seu sistema recebe o aviso e dispara o e-mail com o PDF para o cliente — sem você fazer nada.</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <p className="font-semibold text-slate-900 mb-1">"Quero saber imediatamente se uma nota deu erro"</p>
                <p className="text-sm text-slate-600">Configure um webhook para <code className="bg-slate-100 px-1 rounded text-xs">invoice.error</code> apontando para o Zapier ou Make. O Zapier envia uma mensagem no WhatsApp ou Slack na hora. Você resolve antes do cliente reclamar.</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <p className="font-semibold text-slate-900 mb-1">"Só libero o pagamento ao meu fornecedor após a nota ser emitida"</p>
                <p className="text-sm text-slate-600">Configure <code className="bg-slate-100 px-1 rounded text-xs">invoice.processed</code> no seu sistema financeiro. Quando o AutoNF confirmar a emissão, o sistema libera o pagamento automaticamente — sem aprovação manual.</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <p className="font-semibold text-slate-900 mb-1">"Preciso que meu contador tenha tudo registrado em tempo real"</p>
                <p className="text-sm text-slate-600">Cada evento vai automaticamente para o sistema do contador com data e hora exatas. Sem e-mail, sem planilha, sem esquecimento.</p>
              </div>
            </div>
          </div>

          {/* Como configurar */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Como configurar em 3 passos</h3>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">1</div>
                <div>
                  <p className="font-medium text-slate-900">Obtenha o endereço do seu sistema</p>
                  <p className="text-sm text-slate-600 mt-0.5">Pode ser o endereço do seu ERP, um fluxo do Zapier/Make, ou qualquer URL que aceite requisições HTTP. Exemplo: <code className="bg-white px-1 rounded text-xs border border-indigo-200">https://meusite.com.br/webhooks/autonf</code></p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">2</div>
                <div>
                  <p className="font-medium text-slate-900">Acesse Configurações → Webhooks no AutoNF</p>
                  <p className="text-sm text-slate-600 mt-0.5">Cole o endereço, escolha quais eventos quer receber e clique em "Criar endpoint". Guarde a chave secreta que aparecer — ela não é exibida novamente.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">3</div>
                <div>
                  <p className="font-medium text-slate-900">Pronto — o AutoNF avisa automaticamente</p>
                  <p className="text-sm text-slate-600 mt-0.5">A partir de agora, toda vez que o evento ocorrer, o AutoNF envia um aviso em tempo real para o endereço cadastrado. Você acompanha o histórico de entregas diretamente na tela de Webhooks.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Retry */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <RefreshCw className="w-5 h-5 text-slate-500" />
              <h3 className="font-semibold text-slate-900">Reenvio automático em caso de falha</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Se o seu sistema estiver fora do ar no momento do evento, o AutoNF tenta reenviar automaticamente até <strong>3 vezes</strong>, com intervalo crescente entre as tentativas. Se todas falharem, o evento fica registrado no histórico de entregas como falha, e você pode acompanhar o motivo diretamente na tela de Webhooks.
            </p>
          </div>

          {/* Para desenvolvedores */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Para desenvolvedores — verificando a autenticidade</h3>
            <p className="text-slate-600 mb-4 text-sm">Cada requisição enviada pelo AutoNF inclui um header de assinatura. Valide-o no seu servidor para garantir que o evento veio realmente do AutoNF e não de terceiros.</p>
            <div className="bg-slate-900 rounded-lg p-6 text-slate-100 font-mono text-sm overflow-x-auto">
              <pre>{`// Header enviado em cada requisição:
X-AutoNF-Signature: sha256=<hmac>
X-AutoNF-Event: invoice.processed
X-AutoNF-Delivery: 42

// Exemplo de payload:
{
  "event": "invoice.processed",
  "timestamp": "2026-05-23T14:30:00.000Z",
  "data": {
    "invoiceId": 123,
    "nfseNumber": "NF-00189",
    "clientName": "Empresa ABC Ltda",
    "value": 500000
  }
}

// Verificação da assinatura (Node.js):
const sig = crypto
  .createHmac('sha256', SEU_SEGREDO)
  .update(rawBody)
  .digest('hex');

if (\`sha256=\${sig}\` !== req.headers['x-autonf-signature']) {
  return res.status(401).end(); // Requisição inválida
}`}</pre>
            </div>
          </div>
        </section>

        {/* Footer */}
        <section className="border-t border-slate-200 pt-12 text-center text-slate-600">
          <p>AutoNF © 2026 - MVP de Sistema de Emissão Automática de Notas Fiscais</p>
          <p className="mt-2 text-sm">Documentação versão 1.0</p>
        </section>
      </div>
    </div>
  );
}
