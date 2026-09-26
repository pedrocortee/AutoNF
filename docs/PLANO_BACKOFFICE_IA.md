# AutoNF Entrada — Plano de Execução (Back-office com IA)

> **Criado em:** 26/09/2026 · **Horizonte:** 30 dias (até 26/10/2026) + roadmap de 90 dias
> **Relação com [AUTONF_PLANO.md](AUTONF_PLANO.md):** este plano **reordena** as prioridades do AutoNF.
> A emissão de NFS-e (Fases 1–16) vira base técnica e módulo extra; o foco comercial passa a ser
> o módulo de **entrada**: capturar, ler, validar e lançar documentos para escritórios de contabilidade.

---

## 1. A decisão em uma frase

Usar a base técnica do AutoNF (certificado A1, assinatura XML, filas, webhooks, cobrança, login)
para vender **automação de back-office com IA a escritórios de contabilidade**, com ticket alto
(setup + mensalidade), e deixar o SaaS de emissão barato para depois que houver caixa.

**Por quê:** o SaaS de emissão disputa com 10+ concorrentes entre R$38 e R$250/mês
([analise-mercado-e-precos.md](analise-mercado-e-precos.md)) e não fatura R$10k em 30 dias.
A automação de entrada tem retorno mensurável em horas de trabalho, ticket de R$10–15k e
precisa de **1 a 2 clientes** para bater a meta.

---

## 2. Meta dos 30 dias

| Métrica | Meta até 26/10/2026 |
|---|---|
| **Caixa recebido** | **≥ R$10.000** |
| Diagnósticos pagos vendidos | 3 a 5 (R$2.000 cada, abatíveis no projeto) |
| Projetos fechados | 1 a 2 (setup R$12.000, 50% na assinatura) |
| Conversas com decisores | 40 a 60 |
| Demo funcionando | até 02/10 |
| Captura automática SEFAZ (homologação) | até 16/10 |

**Caminhos que batem a meta (caixa, não contrato):**
- 3 diagnósticos (R$6k) + 50% de entrada de 1 setup (R$6k) = **R$12k**
- 5 diagnósticos (R$10k) = **R$10k**, mesmo sem nenhum projeto fechado ainda
- 1 setup à vista com desconto de fundador (R$10k) = **R$10k**

---

## 3. A oferta

### Público
**Escritórios de contabilidade com 3 a 30 funcionários** e mais de 50 empresas clientes.
Dor: horas de digitação e conferência de notas de entrada, cobrança de XML dos clientes, erros
de lançamento e falta de mão de obra. A reforma tributária (campos IBS/CBS obrigatórios desde
03/08/2026) aumentou o volume de conferência.

Público secundário (depois do 1º case): distribuidoras e atacados (pedidos em PDF/WhatsApp
redigitados no ERP).

### Promessa
> "Suas notas de entrada chegam, são conferidas e ficam prontas para importar no seu sistema
> contábil sem ninguém digitar. Você só revisa o que o sistema marcou como dúvida."

### O que entra no pacote
1. **Captura automática** das NF-e e CT-e emitidas contra o CNPJ de cada cliente do escritório (via certificado A1, Distribuição DF-e da SEFAZ)
2. **Upload em lote** (arrastar pasta ou ZIP) para o que não vem pela SEFAZ
3. **Leitura com IA** de PDFs: NFS-e municipais, boletos, extratos, recibos
4. **Validação automática:** CNPJ, totais, datas, duplicidade, linha digitável do boleto
5. **Fila de revisão:** só o que tiver baixa confiança ou regra quebrada vai para uma pessoa
6. **Exportação** no formato de importação do sistema contábil do escritório
7. **Painel de economia:** documentos processados, horas e reais economizados no mês
8. **Extra:** emissão de NFS-e (já pronta no AutoNF)

### Preços

| Item | Preço | Observação |
|---|---|---|
| **Diagnóstico pago** | R$2.000 | Mapeia o processo, calcula o retorno com os números do escritório e roda a demo em uma amostra real. Abatido do setup se fechar em 15 dias. |
| **Setup** | R$12.000 | Configuração, regras do escritório, exportação para o sistema contábil e treinamento. 50% na assinatura, 50% na entrega. |
| **Mensalidade** | R$2.500 | Até 30 CNPJs e 3.000 documentos/mês. Acima disso, R$50 por CNPJ adicional. Mínimo de 6 meses. |
| **Oferta de fundador** (3 primeiros) | 25% de desconto no setup | Em troca de case com números, depoimento e 2 indicações. |

### Calculadora de retorno (usar no diagnóstico)
```
Horas por mês = documentos/mês × minutos por documento ÷ 60
Custo atual   = horas por mês × custo-hora (salário + encargos ÷ 176)
Economia      = custo atual × % automatizado (conservador: 60%)
Payback       = setup ÷ (economia − mensalidade)

Exemplo: 2.500 docs × 3 min = 125 h/mês × R$35/h = R$4.375/mês
         × 60% = R$2.625 economizados … mensalidade R$2.500 → ajustar
         Com 5.000 docs: R$5.250 − R$2.500 = R$2.750/mês → payback ~4,4 meses
```
> **Atenção:** a conta só fecha para escritórios com volume. Qualificar pelo volume **antes** do
> diagnóstico: mínimo de ~3.000 documentos/mês ou 3 pessoas dedicadas a lançamento. Para
> escritórios menores, oferecer o plano autoatendimento (ver Fase F).

---

## 4. O que o AutoNF já tem e o que falta

### Reaproveitável sem mudança

| Peça | Arquivo | Uso no módulo de entrada |
|---|---|---|
| Criptografia AES-256-GCM | [server/_core/crypto.ts](../server/_core/crypto.ts) | Guardar certificados dos clientes do escritório |
| Validação de certificado A1 | [server/_core/certificateValidator.ts](../server/_core/certificateValidator.ts) | Upload do certificado de cada CNPJ |
| Alerta de vencimento | [server/_core/certExpiryJob.ts](../server/_core/certExpiryJob.ts) | Aviso antes de a captura parar |
| Assinatura XML | [server/_core/xmlSigner.ts](../server/_core/xmlSigner.ts) | Eventos de manifestação do destinatário |
| Filas BullMQ + Redis | [server/_core/queue.ts](../server/_core/queue.ts), [worker.ts](../server/_core/worker.ts) | Nova fila `inbound-docs` e `dfe-sync` |
| Webhooks HMAC | [server/_core/webhookDispatcher.ts](../server/_core/webhookDispatcher.ts) | Eventos `document.approved`, `document.exported` |
| Storage R2 | [server/_core/storage.ts](../server/_core/storage.ts) | Guardar XMLs e PDFs recebidos |
| Cobrança Asaas | [server/_core/asaas.ts](../server/_core/asaas.ts) | Cobrar mensalidade (setup vai por link avulso) |
| E-mail | [server/_core/emailService.ts](../server/_core/emailService.ts) | Resumo diário da fila de revisão |
| Login Clerk, tRPC, UI shadcn | — | Casca do produto |

### Gaps que bloqueiam a venda para escritórios

| # | Gap | Por que bloqueia | Onde |
|---|---|---|---|
| G1 | **Uma empresa e um certificado por usuário** | `companyConfigs` e `digitalCertificates` são ligados a `userId`. O escritório precisa de dezenas de CNPJs. | [drizzle/schema.ts](../drizzle/schema.ts) |
| G2 | Não existe entidade de documento recebido | `invoices` modela nota **emitida** | schema |
| G3 | Nenhuma integração com IA | Leitura de PDFs | novo |
| G4 | Nenhuma exportação para sistema contábil | É o que o escritório usa no dia a dia | novo |
| G5 | `routers.ts` e `db.ts` já passam de 800 linhas | Regra do projeto: arquivos < 500 linhas | separar por domínio |

---

## 5. Arquitetura do módulo de entrada

```
 ENTRADAS                          PROCESSAMENTO (fila inbound-docs)              SAÍDAS
 ─────────                         ─────────────────────────────────              ──────
 SEFAZ Distribuição DF-e ─┐
   (NF-e, CT-e via A1)     │       1. dedup (sha256 + chave de acesso)
 ADN NFS-e Nacional ──────┤       2. classificar tipo
   (a confirmar)           ├──►   3. extrair                                ┌──► exportação (CSV/XLSX
 Upload / ZIP ────────────┤          ├─ XML  → parser determinístico         │     + layout do sistema
 E-mail dedicado (Fase E) ─┘          └─ PDF  → IA com schema fixo (zod)     │     contábil)
                                    4. validar (regras + regras do cliente)  ├──► webhook para ERP
                                    5. calcular confiança                    │
                                         ├─ alta  → aprovado automático ─────┤
                                         └─ baixa → fila de revisão ─────────┘──► painel de economia
```

### Princípios
- **XML nunca passa por IA.** NF-e, CT-e e NFS-e nacional são lidas por parser: 100% de precisão e custo zero.
- **IA só para PDF/imagem**, sempre com schema de saída fixo e validado com zod. O que não passa na validação vai para revisão, nunca é "corrigido" em silêncio.
- **Tudo auditável:** cada documento guarda original, dados extraídos, método, confiança, quem revisou e quando.
- **Regras vêm do cliente:** o escritório cadastra "fornecedor X → conta Y". O sistema não precisa saber contabilidade.

### Modelo de dados (Drizzle / MySQL)

```ts
// Fase B — multi-empresa (resolve G1; antecipa a Fase 20 do AUTONF_PLANO)
companies            { id, ownerUserId, cnpj, name, municipality, state, active, createdAt }
// companyConfigs e digitalCertificates ganham companyId (migração não destrutiva: preencher a
// partir de userId, manter userId até a Fase F)

// Fase A — documentos recebidos (resolve G2)
inboundDocuments     { id, companyId, source: upload|sefaz_dfe|adn_nfse|email,
                       docType: nfe|cte|nfse|boleto|extrato|recibo|outro,
                       status: recebido|extraindo|revisao|aprovado|exportado|erro|descartado,
                       storageKey, sha256, accessKey (44 díg., unique por empresa),
                       issuerCnpj, issuerName, recipientCnpj, issueDate, dueDate, totalCents,
                       extracted (json), confidence (decimal), issues (json),
                       method: xml|pdf_text|llm, llmCostMicros, reviewedBy, reviewedAt,
                       exportedAt, createdAt, updatedAt }
inboundDocumentEvents{ id, documentId, fromStatus, toStatus, actor, note, createdAt }

// Fase B — regras do escritório
mappingRules         { id, ownerUserId, companyId (null = todas), matchType: issuer_cnpj|keyword|ncm|cfop,
                       matchValue, targetAccount, costCenter, historyTemplate, priority }

// Fase C — captura SEFAZ
dfeSyncState         { id, companyId, service: nfe|cte|nfse, lastNsu, maxNsu,
                       lastSyncAt, nextAllowedAt, lastStatusCode }

// Fase D — painel de economia
savingsSettings      { ownerUserId, hourlyCostCents, minutesPerDoc (json por docType) }
```

### Arquivos novos (todos < 500 linhas)

```
server/_core/inbound/
  ingest.ts            recebe arquivo, calcula sha256, deduplica, grava no R2, enfileira
  classifier.ts        identifica o tipo (XML por namespace; PDF por IA barata)
  xml/nfeParser.ts     NF-e 4.00 → objeto normalizado (reusa xml2js já instalado)
  xml/cteParser.ts     CT-e 4.00
  xml/nfseParser.ts    NFS-e padrão nacional
  llmExtractor.ts      PDF → Claude API (PDF nativo) → JSON validado por zod
  schemas.ts           schemas zod por docType (fonte única para IA, validação e UI)
  validators.ts        CNPJ (dígito verificador), soma de itens = total, datas, duplicidade,
                       linha digitável de boleto (módulo 10/11), destinatário = empresa
  confidence.ts        combina confiança da extração + regras quebradas → aprovado ou revisão
  rules.ts             aplica mappingRules (conta, centro de custo, histórico)
  exporter.ts          CSV/XLSX genérico + adaptadores por sistema contábil
  exporters/dominio.ts layout de importação do sistema contábil do 1º cliente (Fase D)
server/_core/sefaz/
  dfeDistribution.ts   NFeDistribuicaoDFe (SOAP + mTLS com o A1), paginação por NSU
  manifestacao.ts      evento 210210 (Ciência da Operação) para liberar o XML completo
server/routers/
  inbound.ts           list, get, upload, approve, reject, reprocess, export
  companies.ts         CRUD de empresas do escritório + certificado por empresa
  rules.ts, savings.ts
client/src/pages/
  Inbox.tsx            lista com filtros por empresa, tipo e status + contadores
  DocumentReview.tsx   original (PDF/XML) de um lado, campos editáveis do outro, atalhos de teclado
  Companies.tsx        empresas do escritório, status do certificado e da captura
  Rules.tsx            regras de lançamento
  Savings.tsx          painel de economia (base da renovação da mensalidade)
tests/inbound/         testes Vitest + fixtures anonimizadas (XMLs e PDFs fictícios)
```

### IA
- **Modelo:** `claude-opus-5` por padrão, trocável pela variável `INBOUND_LLM_MODEL` (ex.: `claude-sonnet-5`, mais barato). O PDF vai direto para a API (suporte nativo a PDF), sem OCR intermediário. A classificação é feita por conteúdo, sem IA.
- **Fallback:** se o modelo recusar um documento, a API refaz a chamada em outro modelo automaticamente (`fallbacks: "default"`).
- **Saída estruturada** com o schema zod convertido para JSON Schema; rejeitar e mandar para revisão qualquer resposta que não valide.
- **Custo:** registrar `llmCostMicros` por documento. Estimativa com `claude-opus-5` para um PDF de 1 página: ~US$0,02–0,04 (~R$0,10–0,25); medir com documentos reais e, se passar da meta, testar `claude-sonnet-5` comparando a taxa de aprovação automática. Só PDFs passam pela IA, então o custo mensal por escritório fica pequeno frente à mensalidade.
- **Aprender com correções:** guardar as correções da revisão e usá-las como exemplos no prompt por emissor (Fase D).
- **LGPD:** documentos vão para a API da Anthropic; incluir no contrato e na política de privacidade. Nenhum dado é usado para treinamento pela API comercial, mas o escritório precisa saber e concordar.

### Variáveis de ambiente novas
`ANTHROPIC_API_KEY`, `INBOUND_LLM_MODEL`, `INBOUND_MAX_FILE_MB`, `INBOUND_MAX_UPLOAD_MB`, `INBOUND_CONCURRENCY`, `INBOUND_STORAGE_PATH` (documentadas no `.env.example`); `SEFAZ_DFE_ENV` entra na Fase C

---

## 6. Roadmap técnico

> Esforços para uma pessoa com o Claude Code. A ordem importa: **demo antes de tudo**, porque é ela
> que vende os diagnósticos.

### Fase 0 — Preparação (26–27/09) · 0,5 dia
| # | Tarefa | Pronto quando |
|---|---|---|
| 0.1 | Revisar e commitar as 14 alterações pendentes na `main` e dar push (hoje: 4 commits à frente de `origin/main`) | `git status` limpo |
| 0.2 | Criar a branch `feat/entrada-ia` | branch no remoto |
| 0.3 | Confirmar que o deploy atual do Railway sobe e passa em `/health` | URL respondendo |
| 0.4 | `npm run build && npm test` como baseline (359 testes) | tudo verde |
| 0.5 | Gerar fixtures fictícias: 5 NF-e XML, 2 CT-e, 3 NFS-e PDF de prefeituras diferentes, 3 boletos, 1 extrato | pasta `tests/inbound/fixtures` |

### Fase A — Demo vendável (28/09–02/10) · 4 dias
**Objetivo:** mostrar ao vivo o documento entrando e saindo pronto para importar.
| # | Tarefa | Esforço | Status (26/09) |
|---|---|---|---|
| A.1 | Tabelas `inboundDocuments` e `inboundDocumentEvents` + migração | 2h | ✅ criadas no banco local; falta aplicar em produção |
| A.2 | `ingest.ts` + upload em lote (arquivos e ZIP) + fila `inbound-docs` | 4h | ✅ |
| A.3 | `xml/nfeParser.ts` + `xml/nfseParser.ts` com testes | 4h | ✅ (CT-e vai para erro com aviso; parser na Fase C) |
| A.4 | `schemas.ts` + `llmExtractor.ts` para NFS-e PDF e boleto | 6h | ✅ testado com a API real (NFS-e em PDF/PNG/JPEG e boletos) |
| A.5 | `validators.ts` + `confidence.ts` com testes | 4h | ✅ inclui CNPJ alfanumérico e linha digitável |
| A.6 | Telas `Inbox.tsx` e `DocumentReview.tsx` | 6h | ✅ testado logado no navegador (upload, revisão, correção, aprovação, exportação) |
| A.7 | Exportação CSV/XLSX genérica | 2h | ✅ CSV (abre no Excel pt-BR); XLSX não é necessário por ora |
| A.8 | Roteiro de demo de 5 minutos + vídeo gravado de 2 minutos | 2h | ⏳ pendente |

**Verificado em 26/09:** 402 testes passando (359 antigos + 43 novos); teste de ponta a ponta no banco local
(NF-e aprovada sozinha, NF-e de outro CNPJ em revisão, cópia descartada como duplicada, extensão inválida
rejeitada, CSV correto); servidor sobe e as rotas novas exigem login.

**Testes com IA real e navegador (26/09):**

| Documento | `claude-opus-5` | `claude-sonnet-5` |
|---|---|---|
| NFS-e PDF | aprovado, campos corretos | aprovado, campos corretos |
| NFS-e imagem | aprovado, campos corretos | aprovado, campos corretos |
| Boleto correto | aprovado | revisão (inseguro na linha digitável) |
| Boleto com dígito errado | revisão (erro detectado) | revisão (erro detectado) |
| Custo por documento | US$ 0,028 (~R$ 0,15) | US$ 0,011 (~R$ 0,06) |

Decisão: manter `claude-opus-5` como padrão (menos revisão manual vale mais que ~R$ 0,10/doc).
O teste achou e corrigiu: (1) dúvida em campo descritivo (nome do banco) travava a aprovação;
(2) a mesma NFS-e enviada como PDF e como imagem era aprovada duas vezes — agora vai para revisão
como "possível duplicado" (mesmo tipo, emitente, data, valor e número compatível).

**Pronto quando:** subir 15 documentos misturados → os XMLs são aprovados sozinhos, os PDFs são extraídos, 1 boleto com linha digitável errada cai na revisão, e a planilha exportada abre certinha.

### Fase B — Multi-empresa e regras (03–09/10) · 4 dias
**Objetivo:** o escritório consegue cadastrar os clientes dele (resolve G1).
| # | Tarefa | Esforço |
|---|---|---|
| B.1 | Tabela `companies` + `companyId` em `companyConfigs`, `digitalCertificates` e `invoices` (migração não destrutiva) | 1d |
| B.2 | Certificado A1 por empresa (reusa `crypto.ts` e `certificateValidator.ts`) | 4h |
| B.3 | Seletor de empresa no header + filtro por empresa em todas as consultas | 4h |
| B.4 | `mappingRules` + `rules.ts` + tela `Rules.tsx` | 1d |
| B.5 | Separar `routers.ts` e `db.ts` por domínio (resolve G5) | 4h |
| B.6 | Testes de regressão da emissão de NFS-e depois da migração | 4h |

**Pronto quando:** um usuário com 3 empresas vê os documentos de cada uma separados, e uma regra "fornecedor X → conta Y" é aplicada na exportação.

### Fase C — Captura automática SEFAZ (10–16/10) · 4 dias
**Objetivo:** as notas aparecem sozinhas. É o maior diferencial de venda.
| # | Tarefa | Esforço |
|---|---|---|
| C.1 | `dfeDistribution.ts`: consulta `NFeDistribuicaoDFe` por NSU com mTLS usando o A1 da empresa | 1d |
| C.2 | Tratar resumos (`resNFe`) e XML completo (`procNFe`); descompactar `docZip` (base64 + gzip) | 4h |
| C.3 | `manifestacao.ts`: evento Ciência da Operação (210210) para liberar o XML completo | 4h |
| C.4 | Job agendado `dfe-sync` por empresa, respeitando `nextAllowedAt` | 4h |
| C.5 | Mesmo fluxo para CT-e (`CTeDistribuicaoDFe`) | 4h |
| C.6 | Investigar a distribuição de documentos do ADN (NFS-e Nacional) para contribuintes | 4h (pesquisa) |
| C.7 | Tela `Companies.tsx` com status da captura e do certificado | 2h |

**Cuidados obrigatórios:**
- **Consumo indevido:** a SEFAZ bloqueia quem consulta demais. Quando a resposta indicar que não há documentos novos, esperar pelo menos 1 hora antes da próxima consulta para aquele CNPJ. Guardar `lastStatusCode` e respeitar sempre.
- **Homologação primeiro:** certificado de teste e ambiente de homologação antes de qualquer CNPJ real.
- **Procuração:** o escritório precisa de autorização formal de cada cliente para usar o certificado dele. Colocar no contrato e no onboarding.

**Pronto quando:** em homologação, uma NF-e emitida contra o CNPJ de teste aparece na Inbox sem upload manual.

### Fase D — Exportação real e painel de economia (17–23/10) · 4 dias
**Objetivo:** o 1º cliente usa no dia a dia, e o valor fica visível.
| # | Tarefa | Esforço |
|---|---|---|
| D.1 | Levantar o layout de importação do sistema contábil do 1º cliente (Domínio, Questor, Alterdata, Fortes ou outro) com um arquivo real de exemplo | 4h |
| D.2 | Adaptador em `exporters/` + teste com arquivo importado de verdade no sistema do cliente | 1d |
| D.3 | `savingsSettings` + tela `Savings.tsx` (documentos, horas e R$ economizados, taxa de aprovação automática) | 1d |
| D.4 | Resumo diário por e-mail: "X documentos processados, Y aguardando revisão" | 2h |
| D.5 | Exemplos de correção por emissor no prompt da IA | 4h |

### Fase E — Produção e operação (24–26/10 e contínuo) · 2 dias
| # | Tarefa | Esforço |
|---|---|---|
| E.1 | Error tracking (Sentry) — antecipa a Fase 19 | 2h |
| E.2 | Limites de upload, antivírus básico por tipo MIME, rate limit por conta | 4h |
| E.3 | Backup do banco e política de retenção dos arquivos (documentos fiscais: guardar por 5 anos) | 2h |
| E.4 | Termo de uso, DPA/LGPD e modelo de procuração para certificado | 4h |
| E.5 | Monitor do job `dfe-sync` (último sucesso por empresa) com alerta | 2h |

### Depois dos 30 dias (novembro–dezembro)
| Fase | O quê |
|---|---|
| **F** | Plano autoatendimento para escritórios pequenos (R$300–800/mês, sem setup) usando o mesmo produto |
| **G** | E-mail dedicado por empresa (`notas+cnpj@...`) para receber PDFs sem upload |
| **H** | Segundo adaptador contábil + API pública (Fase 18 do plano original) |
| **I** | Vertical distribuidoras: pedidos em PDF/WhatsApp → ERP |
| **J** | Conferência IBS/CBS nas notas recebidas (alerta de divergência) |

---

## 7. Trilha comercial (em paralelo à técnica)

### Semana 1 (26/09–02/10) — preparar e aquecer
- [ ] Lista de **60 escritórios** da região: Google Maps ("contabilidade" + cidade), LinkedIn, site do CRC-RS, associados do Sescon-RS
- [ ] Qualificar pelo tamanho: número de funcionários e de empresas atendidas (site, LinkedIn)
- [ ] **10 conversas de descoberta na rede pessoal** (contadores que você conhece, contadores dos seus conhecidos). Pergunta central: "quantas horas por semana sua equipe gasta lançando nota de entrada?"
- [ ] Roteiro do diagnóstico pago + planilha da calculadora de retorno (seção 3)
- [ ] Nova seção na landing do AutoNF: "Para escritórios de contabilidade" com o vídeo da demo e botão "Agendar diagnóstico"
- [ ] Proposta e contrato modelo (diagnóstico, setup, mensalidade, procuração, LGPD)

### Semana 2 (03–09/10) — abordar e vender diagnósticos
- [ ] **10 a 15 abordagens por dia** (LinkedIn + WhatsApp + ligação), sempre personalizadas
- [ ] Mensagem-base: *"Oi, [nome]. Montei um sistema que baixa as notas de entrada dos clientes do escritório direto da SEFAZ e deixa pronto para importar no [sistema contábil]. Posso te mostrar em 10 minutos com uma nota de verdade?"*
- [ ] Toda reunião termina com a proposta do diagnóstico pago
- [ ] **Meta: 3 diagnósticos vendidos**

### Semana 3 (10–16/10) — executar diagnósticos e propor
- [ ] Rodar a demo com **uma amostra real** de cada escritório (50 a 100 documentos)
- [ ] Entregar relatório: horas atuais, % automatizado na amostra, economia mensal e payback
- [ ] Proposta de setup ao final de cada diagnóstico, com a oferta de fundador
- [ ] **Meta: 1 a 2 propostas aceitas** e 50% de entrada recebidos

### Semana 4 (17–26/10) — entregar e gerar prova
- [ ] Onboarding do 1º cliente: empresas, certificados, regras, exportação
- [ ] Medir e registrar os números reais (antes x depois)
- [ ] Pedir 2 indicações e o depoimento
- [ ] Continuar as abordagens (o funil do mês 2 começa aqui)

### Funil esperado
```
180 abordagens → ~50 respostas → ~20 reuniões → 3–5 diagnósticos → 1–2 projetos
```
Registrar tudo no CRM da Decisium Data (Notion) com os estágios Lead → Diagnóstico → Proposta → Fechado.

---

## 8. Cronograma integrado

| Data | Técnica | Comercial | Caixa esperado |
|---|---|---|---|
| 26–27/09 | Fase 0 | Lista de 60 escritórios | — |
| 28/09–02/10 | Fase A (demo) | 10 conversas na rede + roteiro + contrato | — |
| 03–09/10 | Fase B (multi-empresa) | 10–15 abordagens/dia | R$2–6k (diagnósticos) |
| 10–16/10 | Fase C (SEFAZ) | Diagnósticos + propostas | R$6–12k |
| 17–23/10 | Fase D (exportação + painel) | Onboarding do 1º cliente | +R$6k (entrada do setup) |
| 24–26/10 | Fase E (produção) | Case + indicações | **≥ R$10k** |

**Regra de prioridade:** se a semana apertar, o comercial vence. Uma demo boa o bastante com
reuniões marcadas vale mais que uma funcionalidade perfeita sem ninguém para ver.

---

## 9. Riscos e como lidar

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Ciclo de venda maior que 30 dias | Alta | Diagnóstico pago gera caixa antes do projeto; começar pela rede pessoal |
| IA erra campo em PDF | Média | Nada é aprovado sem validação; baixa confiança vai para revisão; XML nunca usa IA |
| Bloqueio da SEFAZ por consumo indevido | Média | Respeitar `nextAllowedAt`; homologação antes; 1 consulta por hora sem novidades |
| Uso de certificado de terceiros | Média | Procuração formal no contrato; certificado criptografado; log de uso |
| LGPD (dados fiscais de terceiros na IA) | Média | DPA no contrato, política de privacidade atualizada, retenção definida |
| Cada sistema contábil tem layout diferente | Alta | Vender para 1 sistema por vez; CSV/XLSX genérico enquanto o adaptador não existe |
| Migração multi-empresa quebra a emissão de NFS-e | Média | Migração não destrutiva + os 359 testes existentes como rede de segurança (B.6) |
| Conflito com o emprego na Panvel | Baixa | Conferir o contrato; trabalhar fora do horário; não usar código, dados ou ferramentas da empresa; não atender varejo farmacêutico |
| Dispersão de foco | Alta | licita-intel e decisium-os parados até o 1º cliente |

---

## 10. O que NÃO fazer nestes 30 dias

- Fases 17 (catálogo), 18 (API pública), 21 (novos municípios) e 25 (mobile) do plano original
- Anúncios pagos e SEO: canal de venda agora é direto
- Suporte a vários sistemas contábeis ao mesmo tempo
- Leitura de nota escrita à mão, fotos de celular ruins, contratos
- Baixar o preço para fechar: se o volume do escritório não justifica, é o cliente errado para o setup

---

## 11. Decisões pendentes (dono: Pedro)

- [ ] **Marca:** vender como "AutoNF", "Decisium Data" ou produto novo? *(Sugestão: empresa Decisium Data, produto AutoNF.)*
- [ ] **Cidade/região** da primeira lista de escritórios
- [ ] **Horas por semana** disponíveis e se existe sócio para a parte comercial
- [ ] **CNPJ** para emitir nota do setup (ME no Simples; o MEI não cobre esta atividade)
- [ ] **Certificado A1 de teste** para homologação da Fase C
- [ ] **Chave da API da Anthropic** para a Fase A

---

## 12. Próxima ação

**Fase 0 e quase toda a Fase A feitas** (branch `feat/entrada-ia`, commits locais — o push depende de
reautenticar o GitHub nesta máquina). Para fechar a Fase A:

1. Testar com documentos **reais** de um cliente (os testes usaram documentos fictícios gerados com layout realista)
2. Aplicar as tabelas no banco de produção (`npm run db:push`, conferindo o que ele vai alterar antes de confirmar)
3. Gravar o vídeo de 2 minutos da demo (A.8)
4. Reautenticar o GitHub e enviar a branch

Depois disso, Fase B (multi-empresa).
