# AutoNF — Plano de Execução

## O que é o AutoNF

SaaS de automação de emissão de Notas Fiscais de Serviço (NFS-e), com foco inicial no Rio Grande do Sul. O produto permite que empresas de serviços emitam NFS-e com certificado digital A1 diretamente pelas APIs das prefeituras, sem depender de software de desktop ou acesso manual ao portal municipal.

**Diferencial de posicionamento:** especialização em NFS-e (vs. concorrentes generalistas), certificado por usuário com criptografia AES-256-GCM, interface moderna e preço transparente sem taxa por emissão.

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui |
| Roteamento | Wouter |
| API layer | tRPC 11 (type-safety end-to-end) |
| Backend | Express 4 |
| ORM | Drizzle ORM |
| Banco | MySQL / TiDB |
| Auth | OAuth (Manus) |
| Criptografia | AES-256-GCM por usuário |
| Testes | Vitest (91 testes: 40 invoices, 18 NFS-e, 33 planos) |

---

## Estado Atual

### Concluído (Fases 1–10) — MVP pronto para primeiros usuários pagantes

- Schema completo: `invoices`, `invoice_history`, `companyConfigs`, `digitalCertificates`, `subscriptions`, `invoiceUsage`
- CRUD de NFS-e com filtros, busca, paginação e timeline de histórico
- Integração real com prefeituras RS: geração de XML RPS (ABRASF), assinatura digital, envio à API municipal
- Suporte a certificado A1 (PFX/P12) com criptografia AES-256-GCM e validação
- Sistema de 3 planos: Starter R$250 / Professional R$400 / Enterprise R$999
- Controle de limite de emissões mensais com bloqueio no backend e no frontend
- UI de planos com cards, upgrade/downgrade e `PlanUsageCard` integrado no dashboard
- Barra de progresso de consumo mensal + alertas em 80% (amarelo) e 100% (vermelho)
- Tratamento de erro correto no fluxo de criação de NF: exibe mensagem de limite e oferece link para upgrade via Sonner action
- Dashboard com métricas e landing page
- Estrutura de diretórios organizada: `client/`, `server/`, `drizzle/`, `scripts/`, `docs/`
- 91 testes passando (Vitest)

### Concluído (Fases 11–16)

- **Fase 11** — Gateway de pagamento Asaas: cobrança via Pix/boleto/cartão, webhook de ativação/suspensão de plano, proration, período de graça e histórico de faturas
- **Fase 12** — Cancelamento de NFS-e: XML ABRASF de cancelamento, envio à prefeitura com prazo, botão na UI e atualização de histórico
- **Fase 13** — Emissão assíncrona: BullMQ + Redis, jobs com retry 3× exponencial, idempotência por RPS, polling SSE no frontend e dead letter queue
- **Fase 14** — Fiscal completo + LGPD: alíquota ISS configurável por empresa, retenções (IRPJ/CSLL/COFINS/PIS/INSS) no formulário e no XML RPS, job diário de expiração de certificado com banner no Dashboard, política de privacidade com modal de consentimento no primeiro login e exclusão de conta com cascata de dados
- **Fase 15** — Webhooks: schema `webhookEndpoints`/`webhookDeliveries`, dispatcher HMAC-SHA256 com retry 3× backoff exponencial, eventos `invoice.created/processed/error/cancelled` disparados nos 3 pontos do sistema (router, worker, cancel), tRPC CRUD de endpoints + log de deliveries, aba "Webhooks" na página Settings com gestão de endpoints, toggle de activação, log de entregas e snippet de verificação de assinatura
- **Fase 16** — PDF + Notificações: geração de PDF da NFS-e com pdfkit + QR code de verificação, armazenamento em filesystem (`PDF_STORAGE_PATH`), endpoint `pdf.get` com geração on-demand para notas antigas, botão "Baixar PDF" na página de detalhe, `emailService.ts` via Nodemailer/Resend, email ao tomador com PDF anexo após emissão, email de erro ao prestador após DLQ, tabela `notificationPrefs`, aba "Notificações" nas configurações

### Próximo passo — Fase 16.5 (Migração de Auth) → depois Fase 17 (Produtividade e Catálogo)

---

## Estrutura do Projeto

```
.
├── client/src/
│   ├── App.tsx
│   ├── components/
│   │   ├── DashboardLayout.tsx
│   │   └── PlanUsageCard.tsx
│   └── pages/
│       ├── Dashboard.tsx
│       ├── Documentation.tsx
│       ├── Home.tsx
│       ├── InvoiceDetail.tsx
│       ├── Plans.tsx
│       └── Settings.tsx
├── server/
│   ├── _core/
│   │   ├── certificateValidator.ts
│   │   ├── crypto.ts
│   │   ├── nfseIntegration.ts
│   │   ├── rpsGenerator.ts
│   │   └── xmlSigner.ts
│   ├── db.ts
│   └── routers.ts
├── drizzle/
│   └── schema.ts
├── scripts/
│   └── seed-plans.mjs
├── docs/
│   ├── AUTONF_PLANO.md
│   ├── Análise de Mercado - AutoNF.md
│   └── todo.md
├── assets/
└── *.test.ts        ← testes na raiz (importam de ./server/_core/...)
```

---

## Gaps Mapeados (Análise Completa)

### Críticos (bloqueiam operação ou receita)

1. **Gateway de pagamento ausente** — planos existem sem cobrança real (Stripe, Asaas ou Pagar.me)
2. **Cancelamento de NFS-e não implementado** — operação fiscal obrigatória; cada prefeitura tem endpoint e prazo diferente
3. **Emissão assíncrona ausente** — prefeituras têm latência alta; emissão síncrona causa timeouts e UX ruim

### Alta prioridade (compliance ou diferencial)

4. **LGPD** — armazena CNPJ, certificado digital, dados de tomadores; exige política de privacidade, direito ao esquecimento, consentimento
5. **Retenção de impostos** — IRPJ, CSLL, COFINS, PIS, INSS obrigatórios em muitos casos para PJ; configurável por tomador
6. **Alíquota ISS configurável por município** — cada cidade tem taxa entre 2% e 5%; hoje hardcoded
7. **Alerta de expiração do certificado digital** — certificados A1 vencem em 1–3 anos; sem alerta, emissões param silenciosamente

### Média prioridade (crescimento do produto)

8. **Multi-CNPJ por conta** — contadores e grupos empresariais gerenciam múltiplas empresas
9. **API pública REST** — todos os concorrentes têm; transforma o produto de interface em plataforma
10. **Webhooks** — maior diferencial B2B, já mapeado na análise de mercado
11. **Catálogo de serviços e tomadores** — elimina repetição manual para NFs recorrentes
12. **Exportação CSV/Excel** — obrigatório para auditoria contábil; importação em lote é diferencial
13. **PDF da NFS-e com QR code** — baixo esforço, alto valor percebido
14. **Notificações por email** — completa o ciclo de emissão; envio do PDF ao tomador

### Operação e confiabilidade

15. **Error tracking** (Sentry ou similar) — sem ele, falhas na integração com prefeitura são invisíveis
16. **Idempotência nas emissões** — duplo clique ou retry pode gerar NF duplicada
17. **Estratégia de migrations** — dados fiscais são imutáveis por lei; migrations destrutivas são risco real

---

## Plano de Execução

### ✅ Fase 10 — Estabilização (concluída)
**Objetivo:** produto funcional sem bugs e com o core de planos integrado

| # | Tarefa | Status |
|---|--------|--------|
| 10.1 | Corrigir tratamento de erro no fluxo de criação de NF (mensagem de limite + link para upgrade) | ✅ |
| 10.2 | Implementar painel de uso do plano no dashboard (`PlanUsageCard`) | ✅ |
| 10.3 | Barra de progresso de consumo mensal | ✅ |
| 10.4 | Integrar verificação de limite no fluxo de criação de NF (backend + frontend) | ✅ |
| 10.5 | Alerta de uso em 80% (banner amarelo) e 100% (banner vermelho + botão upgrade) | ✅ |
| 10.6 | Testes end-to-end de planos (10 novos testes: Starter, Professional, Enterprise, sem plano, UI state) | ✅ |

**Entregável:** MVP real, pronto para primeiros usuários pagantes (cobrança manual enquanto gateway não existe)

---

### Fase 11 — Gateway de Pagamento
**Objetivo:** SaaS com cobrança automatizada

| # | Tarefa | Esforço |
|---|--------|---------|
| 11.1 | Integrar Asaas (foco BR, suporte a boleto + cartão + Pix) | 2d |
| 11.2 | Webhook do Asaas para ativar/suspender plano automaticamente | 1d |
| 11.3 | Proration em upgrades/downgrades | 1d |
| 11.4 | Período de graça (3 dias) para inadimplência | 4h |
| 11.5 | Emissão automática de NFS-e do próprio SaaS para o cliente | 1d |
| 11.6 | Tela de histórico de faturas no painel do cliente | 4h |

**Decisão de produto:** Asaas é recomendado sobre Stripe pela integração nativa com Pix e boleto, e pelo suporte a emissão de NFS-e como feature do próprio Asaas.

---

### Fase 12 — Cancelamento de NFS-e
**Objetivo:** operação fiscal obrigatória

| # | Tarefa | Esforço |
|---|--------|---------|
| 12.1 | Mapear endpoints de cancelamento por município (Porto Alegre, Caxias, Novo Hamburgo) | 4h |
| 12.2 | Implementar geração de XML de cancelamento (padrão ABRASF) | 4h |
| 12.3 | Assinatura e envio à prefeitura com tratamento de prazo | 4h |
| 12.4 | UI: botão "Cancelar NF" na página de detalhe com confirmação | 2h |
| 12.5 | Atualizar histórico e status após cancelamento | 2h |
| 12.6 | Testes de integração de cancelamento | 3h |

---

### Fase 13 — Emissão Assíncrona
**Objetivo:** confiabilidade e UX na integração com prefeituras

| # | Tarefa | Esforço |
|---|--------|---------|
| 13.1 | Instalar e configurar BullMQ + Redis | 4h |
| 13.2 | Converter emissão para job assíncrono com status `processando` | 1d |
| 13.3 | Worker de processamento com retry automático (3x, backoff exponencial) | 1d |
| 13.4 | Idempotência: chave única por RPS antes de enviar à prefeitura | 4h |
| 13.5 | Polling no frontend (ou SSE) para atualizar status em tempo real | 4h |
| 13.6 | Dead letter queue para jobs que falham após 3 tentativas | 4h |

---

### Fase 14 — Fiscal e Compliance
**Objetivo:** corretude fiscal e conformidade legal

| # | Tarefa | Esforço |
|---|--------|---------|
| 14.1 | Configuração de alíquota ISS por município na tela de settings | 4h |
| 14.2 | Implementar campos de retenção (IRPJ, CSLL, COFINS, PIS, INSS) no formulário de NF | 1d |
| 14.3 | Calcular e incluir retenções no XML RPS conforme ABRASF | 1d |
| 14.4 | Job diário para verificar expiração de certificados digitais | 4h |
| 14.5 | Alerta de expiração: email 30/15/7/1 dias antes + banner no dashboard | 4h |
| 14.6 | Política de privacidade + consentimento (LGPD) | 1d |
| 14.7 | Endpoint de exclusão de conta + dados (LGPD art. 18) | 4h |

---

### Fase 15 — Webhooks
**Objetivo:** diferencial competitivo B2B

| # | Tarefa | Esforço |
|---|--------|---------|
| 15.1 | Schema: tabela `webhookEndpoints` (url, secret, eventos, ativo) | 2h |
| 15.2 | UI para cadastrar e gerenciar endpoints na tela de settings | 4h |
| 15.3 | Dispatcher: assinar payload com HMAC-SHA256, enviar, registrar resultado | 1d |
| 15.4 | Retry automático de webhooks com falha (3x, backoff) | 4h |
| 15.5 | Log de entregas com payload + resposta + status HTTP | 4h |
| 15.6 | Eventos: `invoice.created`, `invoice.processed`, `invoice.error`, `invoice.cancelled` | 2h |
| 15.7 | Documentação dos eventos e exemplos de payload | 4h |

---

### Fase 16 — PDF e Notificações
**Objetivo:** ciclo de emissão completo para o tomador

| # | Tarefa | Esforço |
|---|--------|---------|
| 16.1 | Gerar PDF da NFS-e com dados da nota + QR code de verificação | 1d |
| 16.2 | Armazenar PDF no storage (S3 ou Supabase Storage) | 4h |
| 16.3 | Botão "Baixar PDF" na página de detalhe | 2h |
| 16.4 | Integrar Resend (ou Nodemailer) para envio de email | 4h |
| 16.5 | Email automático ao tomador com PDF anexo após emissão | 4h |
| 16.6 | Email de erro/rejeição para o prestador | 2h |
| 16.7 | Preferências de notificação na tela de settings | 3h |

---

### Fase 16.5 — Migração de Autenticação (OAuth Manus → Clerk)
**Objetivo:** tornar o sistema independente da plataforma Manus e deployável em qualquer infraestrutura

**Contexto:** o projeto foi construído dentro do ambiente Manus, que fornece OAuth próprio. Para rodar em produção no Railway (ou qualquer outro servidor), é necessário substituir esse mecanismo por um sistema de autenticação autônomo. O Clerk foi escolhido por ter SDK pronto para Express + React, plano gratuito até 10.000 usuários, e integração em menos de 1 dia.

| # | Tarefa | Esforço |
|---|--------|---------|
| 16.5.1 | Criar conta no Clerk (clerk.com) e configurar aplicação | 1h |
| 16.5.2 | Instalar `@clerk/express` no backend e substituir middleware de sessão atual | 4h |
| 16.5.3 | Instalar `@clerk/react` no frontend e substituir fluxo de login/logout nas páginas | 4h |
| 16.5.4 | Migrar `ctx.user` no tRPC para usar o userId do Clerk em vez do `openId` do Manus | 2h |
| 16.5.5 | Remover dependências e variáveis de ambiente específicas do Manus | 1h |
| 16.5.6 | Configurar variáveis `CLERK_SECRET_KEY` e `VITE_CLERK_PUBLISHABLE_KEY` no Railway | 1h |
| 16.5.7 | Testar fluxo completo: cadastro, login, sessão persistente, logout | 2h |
| 16.5.8 | Validar que modal de consentimento LGPD continua disparando no primeiro login | 1h |

**Esforço total estimado:** 1–2 dias

**Decisão de produto:** Clerk foi escolhido sobre Auth.js e login manual por ter a melhor relação entre velocidade de integração e confiabilidade em produção. Oferece login por email, Google e GitHub sem configuração adicional. O custo zero no plano gratuito elimina risco financeiro para o MVP.

**Impacto no schema:** nenhum — o campo `openId` da tabela `users` passa a armazenar o `userId` do Clerk (formato `user_2abc...`) em vez do openId do Manus. Mesma coluna, valor diferente. Zero migrations necessárias.

---

### Fase 17 — Produtividade e Catálogo
**Objetivo:** reduzir atrito para NFs recorrentes

| # | Tarefa | Esforço |
|---|--------|---------|
| 17.1 | Schema e CRUD de tomadores (clientes cadastrados) | 1d |
| 17.2 | Autocomplete de tomador no formulário de NF | 4h |
| 17.3 | Schema e CRUD de catálogo de serviços | 1d |
| 17.4 | Seleção de serviço pré-preenchendo código, descrição e valor padrão | 4h |
| 17.5 | Exportação CSV de NFs por período | 4h |
| 17.6 | Importação em lote via planilha CSV | 1d |

---

### Fase 18 — API Pública
**Objetivo:** plataforma para integradores e ERPs

| # | Tarefa | Esforço |
|---|--------|---------|
| 18.1 | Geração e gestão de API keys por conta | 4h |
| 18.2 | Middleware de autenticação por API key | 2h |
| 18.3 | Rate limiting por key (ex: 100 req/min no Starter) | 4h |
| 18.4 | Endpoints REST: `POST /v1/invoices`, `GET /v1/invoices/:id`, `DELETE /v1/invoices/:id` | 1d |
| 18.5 | Documentação pública (OpenAPI / Swagger ou Mintlify) | 1d |
| 18.6 | Sandbox de homologação para integradores | 1d |

---

### Fase 19 — Observabilidade e Operação
**Objetivo:** visibilidade para operar o produto em produção

| # | Tarefa | Esforço |
|---|--------|---------|
| 19.1 | Integrar Sentry (frontend + backend) | 4h |
| 19.2 | Logs estruturados (winston ou pino) com contexto de usuário/empresa | 4h |
| 19.3 | Dashboard interno de saúde das integrações por município | 1d |
| 19.4 | Alertas de taxa de erro > 5% nas emissões | 4h |
| 19.5 | Estratégia de migrations segura (CI que valida antes de aplicar) | 4h |

---

### Fase 20 — Multi-CNPJ (contadores e grupos)
**Objetivo:** aumentar ARPU e atrair contadores

| # | Tarefa | Esforço |
|---|--------|---------|
| 20.1 | Refatorar schema para suportar múltiplas empresas por conta | 2d |
| 20.2 | Seletor de empresa ativo no header do dashboard | 4h |
| 20.3 | Isolamento de dados por empresa (invoices, configs, certificados) | 1d |
| 20.4 | Ajustar billing: cobrar por empresa adicional ou por volume total | 4h |
| 20.5 | Testes de regressão completos após refatoração | 1d |

---

## Roadmap Resumido

```
✅ Mai 2026      Fase 10  Estabilização + UI de planos + 91 testes
✅ Jun 2026      Fase 11  Gateway de pagamento (Asaas)
✅ Jun 2026      Fase 12  Cancelamento de NFS-e
✅ Jul 2026      Fase 13  Emissão assíncrona + filas
✅ Jul/Ago 2026  Fase 14  Fiscal completo + LGPD
✅ Ago 2026      Fase 15  Webhooks
✅ Ago/Set 2026  Fase 16   PDF + Notificações por email
   Set 2026      Fase 16.5 Migração de auth (Manus → Clerk) — bloqueador de deploy
   Set 2026      Fase 17   Catálogo de serviços e tomadores
   Out 2026      Fase 18  API pública
   Out 2026      Fase 19  Observabilidade
   Nov 2026      Fase 20  Multi-CNPJ
   Dez 2026      Fase 21  Expansão de municípios (outros estados)
   Jan 2027      Fase 22  Integrações contábeis (Conta Azul, Omie)
   Fev 2027      Fase 23  Programa de revendedores / white-label
   Mar 2027      Fase 24  Inteligência e automação (IA fiscal)
   Abr 2027      Fase 25  Mobile e PWA
```

---

### Fase 21 — Expansão de Municípios
**Objetivo:** aumentar TAM e tornar o produto viável fora do RS

| # | Tarefa | Esforço |
|---|--------|---------|
| 21.1 | Auditar e documentar variações do padrão ABRASF por município RS (Santa Maria, Pelotas, Canoas, São Leopoldo) | 1d |
| 21.2 | Integrar 4 novos municípios RS com maior volume de emissões | 3d |
| 21.3 | Framework genérico de adaptadores por município (plugin por cidade) | 2d |
| 21.4 | Integração São Paulo (ABRASF v2) e Belo Horizonte | 3d |
| 21.5 | Dashboard interno de status e latência das integrações por município | 4h |
| 21.6 | Teste de homologação automatizado por ambiente de sandbox das prefeituras | 1d |

**Decisão de produto:** priorizar municípios pelo cruzamento de volume de emissões e facilidade da API municipal. SP e BH desbloqueiam 40%+ do mercado nacional.

---

### Fase 22 — Integrações Contábeis
**Objetivo:** reduzir churn ao embutir o AutoNF no fluxo contábil existente

| # | Tarefa | Esforço |
|---|--------|---------|
| 22.1 | Integração bidirecional com Conta Azul (sync de NFs emitidas) | 2d |
| 22.2 | Integração com Omie (importar tomadores, exportar notas) | 2d |
| 22.3 | Exportação no formato SPED Serviços (arquivo EFD ISSQN) | 1d |
| 22.4 | Exportação no formato requerido pela Receita Federal (DCTF-Web) | 1d |
| 22.5 | Tela de integrações no painel com status de sync e logs de erros | 4h |
| 22.6 | Webhook reverso: receber NFs do ERP e emitir automaticamente | 1d |

---

### Fase 23 — Programa de Revendedores / White-label
**Objetivo:** crescimento via canal indireto (escritórios contábeis e ERPs)

| # | Tarefa | Esforço |
|---|--------|---------|
| 23.1 | Schema: tabela `resellers` com comissão, status e configuração de marca | 4h |
| 23.2 | Portal do revendedor: gestão de clientes, convites e suspensão | 2d |
| 23.3 | White-label: logo, cor primária e domínio customizado por revendedor | 2d |
| 23.4 | Billing de revendedor: comissão percentual ou markup fixo por cliente | 1d |
| 23.5 | Dashboard consolidado: visão de todos os CNPJs gerenciados + KPIs | 1d |
| 23.6 | Contrato digital e aceite de termos de revendedor no onboarding | 4h |

**Decisão de produto:** escritórios contábeis com 20+ clientes cada multiplicam MRR sem custo de aquisição. Pricing recomendado: repasse com desconto de 20% sobre tabela pública.

---

### Fase 24 — Inteligência e Automação (IA Fiscal)
**Objetivo:** produto premium com diferencial de IA no mercado de NFS-e

| # | Tarefa | Esforço |
|---|--------|---------|
| 24.1 | Sugestão automática de código de serviço LC 116 por descrição livre (embedding + classificador) | 2d |
| 24.2 | Detecção de anomalias: valor fora do padrão histórico ou tomador incomum | 1d |
| 24.3 | Previsão de ISS e retenções do mês baseada em padrão de emissões | 1d |
| 24.4 | Dashboard de BI: receita por tomador, sazonalidade, impostos retidos, top serviços | 2d |
| 24.5 | Agendamento de NFs recorrentes com ajuste automático de valor por índice (IPCA/IGP-M) | 1d |
| 24.6 | Relatório mensal automático via email (resumo fiscal + sugestões) | 4h |

---

### Fase 25 — Mobile e PWA
**Objetivo:** acesso em campo e mobilidade para prestadores de serviço

| # | Tarefa | Esforço |
|---|--------|---------|
| 25.1 | Converter frontend para PWA instalável (manifest, service worker, offline cache) | 1d |
| 25.2 | Push notifications nativas (emissão concluída, erro, alerta de certificado) | 4h |
| 25.3 | Fluxo de emissão rápida mobile-first (formulário reduzido, 3 campos mínimos) | 1d |
| 25.4 | Leitura de CNPJ por câmera (cartão de visita ou QR code) | 4h |
| 25.5 | Compartilhamento nativo do PDF da NFS-e via WhatsApp / email | 2h |
| 25.6 | Avaliar app nativo React Native (decisão baseada em adoção do PWA) | 4h |

---

## Matriz de Priorização Consolidada

| Fase | Item | Impacto | Esforço | Prioridade |
|------|------|---------|---------|-----------|
| ✅ 10 | Estabilização + Fase 9 completa | Crítico | Baixo | P0 |
| ✅ 11 | Gateway de pagamento | Crítico | Médio | P0 |
| ✅ 12 | Cancelamento de NFS-e | Crítico | Médio | P1 |
| ✅ 13 | Emissão assíncrona | Alto | Médio | P1 |
| ✅ 14 | Fiscal completo + LGPD | Alto | Médio | P1 |
| ✅ 15 | Webhooks | Alto | Médio | P2 |
| ✅ 16 | PDF + Email | Alto | Baixo | P2 |
| 17 | Catálogo/produtividade | Médio | Médio | P3 |
| 18 | API pública | Médio | Alto | P3 |
| 19 | Observabilidade | Médio | Baixo | P3 |
| 20 | Multi-CNPJ | Médio | Alto | P4 |
| 21 | Expansão de municípios | Alto | Alto | P4 |
| 22 | Integrações contábeis | Alto | Médio | P4 |
| 23 | White-label / revendedores | Alto | Alto | P5 |
| 24 | IA fiscal | Médio | Alto | P5 |
| 25 | Mobile / PWA | Médio | Médio | P5 |

---

## Decisões de Produto em Aberto

1. **Asaas vs. Stripe** — Asaas tem Pix nativo e emite NFS-e; Stripe tem melhor developer experience. Recomendação: Asaas para o mercado BR.
2. **Redis vs. alternativa para filas** — BullMQ exige Redis; alternativa é pg-boss (usa Postgres/MySQL já existente). Depende da infraestrutura disponível.
3. **Storage para PDFs** — Supabase Storage (simples de integrar) vs. S3 (mais controle). Avaliar custo por GB.
4. **Modelo de billing multi-CNPJ** — por empresa adicional (ex: +R$50/CNPJ/mês) vs. por volume total de NFs. Impacta posicionamento para contadores.
5. **Expansão de municípios** — definir critério para priorizar próximas cidades (volume de mercado, facilidade da API da prefeitura).
