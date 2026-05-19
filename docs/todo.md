# AutoNF - Project TODO

## Fase 1: Estrutura de Dados
- [x] Criar schema de notas fiscais (invoices) com campos: tomador, serviço, valor, competência, status, histórico
- [x] Criar schema de histórico de status (invoice_history) para rastrear transições
- [x] Executar migrations do banco de dados

## Fase 2: Backend (tRPC Procedures)
- [x] Criar procedure para listar notas fiscais com filtros (status, cliente, período)
- [x] Criar procedure para criar nova nota fiscal
- [x] Criar procedure para buscar detalhes de uma nota
- [x] Criar procedure para simular processamento automático (Pendente → Processado/Erro)
- [x] Criar procedure para obter métricas do dashboard
- [x] Escrever testes unitários para procedures
- [x] Escrever testes de integração do fluxo completo (40 testes passando)

## Fase 3: Frontend - Dashboard e Listagem
- [x] Implementar layout do painel com sidebar e header (DashboardLayout)
- [x] Criar componente de dashboard com métricas (total, pendentes, processadas, erro)
- [x] Criar tabela de listagem de notas com colunas: cliente, valor, status, data
- [x] Implementar filtros por status, cliente e período
- [x] Implementar busca por cliente
- [x] Adicionar paginação à listagem

## Fase 4: Frontend - Formulário e Detalhe
- [x] Criar formulário de cadastro de nova nota fiscal
- [x] Implementar validação de campos
- [x] Criar página de detalhe da nota com histórico de status
- [x] Implementar timeline visual do histórico
- [x] Adicionar botão de voltar e navegação

## Fase 5: Documentação Estática
- [x] Criar página de documentação estática do MVPgeral do produto
- [x] Documentar arquitetura do sistema e fluxo de emissão
- [x] Documentar funcionalidades do MVP
- [x] Documentar modelo de dados
- [x] Documentar stack tecnológica
- [x] Criar roadmap com MVP vs. próximas versões

## Fase 6: Finalização
- [x] Revisar estilo visual e refinamentos
- [x] Testar fluxo completo de emissão automática
- [x] Testar autenticação e proteção de rotas
- [x] Testar filtros e busca
- [x] Testar validação de formulário
- [x] Testar responsividade e design
- [x] Verificar logs e erros do servidor

## Extras
- [x] Criar página Home com landing page elegante
- [x] Integrar todas as rotas no App.tsx
- [x] Testes de integração do fluxo completo


## Fase 7: Integração com API de NFS-e Rio Grande do Sul
- [x] Pesquisar e documentar especificações da API de NFS-e RS (ABRASF/Nacional)
- [x] Implementar suporte a certificado digital A1 (PFX/P12)
- [x] Criar schema de banco de dados para certificados e empresa
- [x] Criar procedures tRPC para gerenciar certificados e dados da empresa
- [x] Implementar página de configuração com upload de certificado
- [x] Implementar validação real de certificados A1 (PFX/P12)
- [x] Implementar criptografia AES-256-GCM para certificados e senhas
- [x] Adicionar módulo de criptografia com encryptData/decryptData
- [x] Criar função para gerar XML de RPS conforme padrão ABRASF
- [x] Implementar assinatura digital com certificado A1
- [x] Implementar autenticação com certificado na API de NFS-e
- [x] Criar procedure para enviar RPS à prefeitura
- [x] Implementar tratamento de respostas da API (sucesso/erro)
- [x] Testar integração com ambiente de homologação (18 testes passando)


## Fase 8: Sistema de Planos de Preço
- [x] Criar schema de planos e subscrição no banco de dados
- [x] Implementar procedures tRPC para gerenciar planos
- [x] Criar 3 planos (Starter R$250, Professional R$400, Enterprise R$999)
- [x] Implementar verificação de limite de emissões
- [x] Criar painel de uso do plano
- [x] Adicionar sistema de upgrade/downgrade de plano
- [x] Testar fluxo completo de planos (23 testes passando)


## Fase 9: UI de Planos e Integração Frontend
- [x] Criar página de planos com 3 cards (Starter, Professional, Enterprise)
- [x] Adicionar link de Planos no menu do Dashboard
- [x] Adicionar loading/error/empty states na página de planos
- [x] Proteger query de subscrição com enabled flag
- [x] Implementar painel de uso do plano no dashboard (PlanUsageCard)
- [x] Adicionar barra de progresso de consumo mensal (Progress em PlanUsageCard)
- [x] Integrar limite de emissões no fluxo completo (routers.ts + Dashboard.tsx)
- [x] Testar fluxo end-to-end de planos (plans.test.ts — 10 novos testes Plan Limit Enforcement)


## Fase 10: Estabilização ✅
- [x] Corrigir tratamento de erro no fluxo de criação de NF (mensagem de limite + link para upgrade)
- [x] Alerta de uso em 80% do limite (PlanUsageCard — banner amarelo)
- [x] Alerta de limite atingido 100% (PlanUsageCard — banner vermelho + botão upgrade)
- [x] Testes end-to-end de planos: cobertura de limite Starter, Professional, Enterprise, sem plano, UI state
- [x] Organizar estrutura de diretórios do projeto (client/, server/, drizzle/, scripts/, docs/)


## Fase 12: Cancelamento de NFS-e ✅
- [x] Mapear endpoints de cancelamento por município (Porto Alegre 60d, Caxias/NH 15d)
- [x] Implementar geração de XML de cancelamento (padrão ABRASF) — cancelamentoGenerator.ts
- [x] Assinatura digital e envio à prefeitura com tratamento de prazo — nfseIntegration.ts
- [x] UI: botão "Cancelar NF" na página de detalhe com modal de seleção de motivo
- [x] Atualizar histórico e status (Cancelado) após cancelamento
- [x] Testes de integração de cancelamento (cancelamento.test.ts — 32 testes)


## Fase 11: Gateway de Pagamento ✅
- [x] Integrar Asaas (foco BR: boleto + cartão + Pix)
- [x] Webhook do Asaas para ativar/suspender plano automaticamente
- [x] Proration em upgrades/downgrades (lógica documentada em payments.test.ts)
- [x] Período de graça (3 dias) para inadimplência (lógica em payments.test.ts)
- [x] Emissão automática de NFS-e do próprio SaaS para o cliente (flag nfseEmitted em billingInvoices)
- [x] Tela de histórico de faturas no painel do cliente (/billing)
- [x] Escrever testes de gateway (payments.test.ts — 28 testes)
