import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

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
          </ul>
        </nav>

        {/* Section 1 */}
        <section id="visao-geral" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">1. Visão Geral do Produto</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <p className="text-slate-700 leading-relaxed">
            <strong>AutoNF</strong> é um sistema web elegante e sofisticado para automação da emissão de notas fiscais de serviço. O MVP fornece um painel intuitivo onde usuários podem criar, gerenciar e acompanhar notas fiscais com processamento automático simulado.
          </p>
          <p className="text-slate-700 leading-relaxed">
            O sistema foi projetado com foco em experiência do usuário premium, oferecendo uma interface refinada com tipografia elegante, espaçamentos generosos e hierarquia visual clara. Cada elemento foi cuidadosamente pensado para transmitir sofisticação e qualidade.
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
              <h3 className="font-semibold text-slate-900 mb-2">Emissão Automática</h3>
              <p className="text-slate-700">Crie notas fiscais em segundos. O sistema simula o processamento automático, transitando de Pendente para Processado (ou Erro) sem intervenção manual.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Dashboard Inteligente</h3>
              <p className="text-slate-700">Visualize métricas em tempo real: total de notas, pendentes, processadas e com erro. Tenha controle total sobre seu fluxo de emissão.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Filtros e Busca Avançada</h3>
              <p className="text-slate-700">Encontre notas rapidamente por status, cliente ou período. Interface intuitiva para navegar entre centenas de notas sem esforço.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Histórico Completo</h3>
              <p className="text-slate-700">Acompanhe cada transição de status com timeline visual. Entenda exatamente o que aconteceu com cada nota fiscal.</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Segurança Integrada</h3>
              <p className="text-slate-700">Autenticação OAuth integrada. Dados protegidos e organizados por usuário. Apenas você acessa suas notas fiscais.</p>
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
            <pre>Fluxo de Emissão Automática:

1. Usuário cria nota fiscal no formulário
   ↓
2. Backend cria registro com status "Pendente"
   ↓
3. Histórico registra transição: Criado → Pendente
   ↓
4. Frontend aguarda 2 segundos (simulação)
   ↓
5. Processamento automático:
   - 90% de chance: Pendente → Processado ✓
   - 10% de chance: Pendente → Erro ✗
   ↓
6. Histórico registra transição final
   ↓
7. Frontend atualiza em tempo real</pre>
          </div>
          <p className="text-slate-700 leading-relaxed">
            <strong>Estados da Nota Fiscal:</strong>
          </p>
          <ul className="space-y-2 text-slate-700">
            <li><strong>Pendente:</strong> Nota criada, aguardando processamento automático</li>
            <li><strong>Processado:</strong> Nota emitida com sucesso (pronta para integração real com APIs)</li>
            <li><strong>Erro:</strong> Falha no processamento (simulado ou real em futuras versões)</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section id="funcionalidades" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">4. Funcionalidades do MVP</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Dashboard com Métricas</h3>
              <p className="text-slate-700 mb-3">Painel principal exibindo:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>Total de notas fiscais emitidas</li>
                <li>Quantidade de notas pendentes</li>
                <li>Quantidade de notas processadas</li>
                <li>Quantidade de notas com erro</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Listagem de Notas Fiscais</h3>
              <p className="text-slate-700 mb-3">Tabela com colunas:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>Cliente (Tomador)</li>
                <li>Descrição do Serviço</li>
                <li>Valor</li>
                <li>Competência (mês)</li>
                <li>Status com badge visual</li>
                <li>Data de criação</li>
                <li>Ação: Ver Detalhes</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Formulário de Cadastro</h3>
              <p className="text-slate-700 mb-3">Modal elegante para criar nova nota com campos:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>Cliente (Tomador) - obrigatório</li>
                <li>Descrição do Serviço - obrigatório</li>
                <li>Valor - obrigatório, validação de número positivo</li>
                <li>Competência - obrigatório, formato YYYY-MM</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Filtros e Busca</h3>
              <p className="text-slate-700 mb-3">Filtros avançados para encontrar notas:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>Filtro por Status (Pendente, Processado, Erro)</li>
                <li>Busca por Nome do Cliente</li>
                <li>Filtro por Competência (mês)</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Página de Detalhe</h3>
              <p className="text-slate-700 mb-3">Visualização completa de uma nota com:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>Informações completas da nota</li>
                <li>Status atual com badge visual</li>
                <li>Timeline visual do histórico de status</li>
                <li>Mensagem de erro (se aplicável)</li>
                <li>Data e hora de cada transição</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Autenticação Integrada</h3>
              <p className="text-slate-700 mb-3">Segurança em todos os níveis:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 ml-2">
                <li>OAuth integrado com Manus</li>
                <li>Todas as rotas do painel protegidas</li>
                <li>Dados isolados por usuário</li>
                <li>Logout seguro</li>
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
                <li><strong>tRPC 11:</strong> RPC framework</li>
                <li><strong>Drizzle ORM:</strong> Type-safe queries</li>
                <li><strong>MySQL/TiDB:</strong> Banco de dados</li>
                <li><strong>OAuth:</strong> Autenticação Manus</li>
                <li><strong>Zod:</strong> Validação de schemas</li>
              </ul>
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-3">Decisões de Design</h3>
            <ul className="space-y-2 text-slate-700">
              <li>✓ <strong>tRPC:</strong> Elimina necessidade de REST API manual e garante type safety end-to-end</li>
              <li>✓ <strong>Drizzle ORM:</strong> Queries type-safe com excelente DX</li>
              <li>✓ <strong>Tailwind CSS:</strong> Desenvolvimento rápido com design tokens consistentes</li>
              <li>✓ <strong>shadcn/ui:</strong> Componentes acessíveis e customizáveis</li>
              <li>✓ <strong>OAuth Manus:</strong> Autenticação segura sem gerenciar senhas</li>
            </ul>
          </div>
        </section>

        {/* Section 7 */}
        <section id="roadmap" className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">7. Roadmap Futuro</h2>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-blue-600 mt-4"></div>
          </div>
          <p className="text-slate-700 leading-relaxed">
            O MVP estabelece uma base sólida para expansão. Abaixo estão as funcionalidades planejadas para versões futuras:
          </p>
          <div className="bg-green-50 rounded-lg border border-green-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">✓ MVP (Versão Atual)</h3>
            <ul className="space-y-2 text-slate-700">
              <li>Dashboard com métricas</li>
              <li>Listagem de notas fiscais</li>
              <li>Formulário de cadastro</li>
              <li>Simulação de processamento automático</li>
              <li>Filtros e busca</li>
              <li>Página de detalhe com histórico</li>
              <li>Autenticação OAuth</li>
            </ul>
          </div>
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">📋 Próxima Versão (v1.1)</h3>
            <ul className="space-y-2 text-slate-700">
              <li>Integração real com APIs de prefeituras (São Paulo, Rio de Janeiro, etc.)</li>
              <li>Suporte a múltiplas empresas/CNPJ</li>
              <li>Relatórios em PDF</li>
              <li>Exportação de dados (CSV, Excel)</li>
            </ul>
          </div>
          <div className="bg-purple-50 rounded-lg border border-purple-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">🚀 Futuras Versões</h3>
            <p className="text-slate-700 mb-3">Após consolidar o MVP e a integração real com prefeituras, o roadmap inclui:</p>
            <ul className="space-y-2 text-slate-700">
              <li>API pública para integração de terceiros</li>
              <li>Suporte a outros tipos de documentos fiscais</li>
              <li>Dashboard avançado com analytics</li>
              <li>Aplicativo mobile</li>
              <li>Integração com contadores e escritórios</li>
            </ul>
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
