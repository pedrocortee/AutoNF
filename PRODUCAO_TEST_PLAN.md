# Plano de Testes para Produção — AutoNF

> **Propósito**: Este documento serve como roteiro completo de testes antes do deploy em produção.
> Execute os comandos na ordem indicada. Corrija todos os erros antes de prosseguir.

---

## Estado Atual (baseline verificado em 2026-05-25)

| Métrica | Valor |
|---|---|
| Arquivos de teste | 17 |
| Testes totais | 359 |
| Testes passando | 359 |
| TypeScript errors | 0 |
| Build status | ✓ client + server |

### Bugs já corrigidos nessa sessão
1. **`listAsaasPayments` não importada** em `server/routers.ts:54` — teria causado `ReferenceError` em runtime quando Asaas está configurado
2. **Tipo de retorno incompleto** em `syncSubscription` (branch sem `planName`) — causava erro TypeScript no cliente
3. **`data.planName` sem narrowing** em `client/src/pages/Plans.tsx:29` — erro TypeScript

---

## FASE 1 — Testes Automatizados

### 1.1 Rodar toda a suíte de testes

```bash
cd /Users/pedropires/Documents/Análise\ do\ vídeo\ TikTok\ fornecido

npm test
```

**Critério de pass**: `Tests X passed (X)` sem nenhuma falha. Se houver falha, analise o stack trace e corrija antes de continuar.

### 1.2 Verificação de tipos TypeScript (server + client)

```bash
npx tsc --noEmit
```

**Critério de pass**: `TypeScript: No errors found`

### 1.3 Build de produção

```bash
npm run build
```

**Critério de pass**: Sem erros no output. O aviso de chunk size (`> 500 kB`) é esperado e não bloqueia.

---

## FASE 2 — Verificação de Ambiente

### 2.1 Checklist de variáveis de ambiente obrigatórias

Verifique que o `.env` de produção contém todas as variáveis abaixo:

```bash
# Verificar se todas as vars estão definidas no arquivo de deploy
grep -E "^(DATABASE_URL|CLERK_SECRET_KEY|CLERK_WEBHOOK_SECRET|ENCRYPTION_KEY|PUBLIC_URL|NODE_ENV)" .env
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ SIM | MySQL connection string |
| `CLERK_SECRET_KEY` | ✅ SIM | Autenticação Clerk |
| `CLERK_WEBHOOK_SECRET` | ✅ SIM | Verificação de webhooks Clerk |
| `ENCRYPTION_KEY` | ✅ SIM | Chave AES-256 para certificados. Em produção DEVE ser string de 64 chars hex aleatórios |
| `PUBLIC_URL` | ✅ SIM | URL pública do servidor (ex: https://autonf.com.br) |
| `NODE_ENV` | ✅ SIM | Deve ser `production` |
| `ASAAS_API_KEY` | ✅ SIM | Chave da API Asaas (produção) |
| `ASAAS_ENV` | ✅ SIM | Deve ser `production` em produção |
| `REDIS_URL` | ✅ SIM | Redis para fila BullMQ |
| `NFSE_ENV` | ✅ SIM | Deve ser `producao` em produção |
| `RESEND_API_KEY` ou `SMTP_HOST` | ⚠️ Recomendado | Para envio de emails |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | ⚠️ Recomendado | Storage de PDFs (Cloudflare R2). Se ausente, usa filesystem local |
| `OWNER_OPEN_ID` | ⚠️ Opcional | Clerk ID do owner (role admin) |
| `EMAIL_FROM` | ⚠️ Opcional | Endereço From nos emails (default: noreply@autonf.com.br) |

### 2.2 Gerar ENCRYPTION_KEY segura para produção

```bash
# Gera 64 caracteres hex aleatórios (32 bytes)
openssl rand -hex 32
```

> ⚠️ **CRÍTICO**: Nunca mude a ENCRYPTION_KEY após os primeiros certificados serem cadastrados. Os dados criptografados (senhas dos certificados) ficarão ilegíveis.

### 2.3 Verificar conectividade com banco de dados

```bash
# Com DATABASE_URL configurado:
npm run db:push 2>&1 | tail -5
```

**Critério de pass**: Sem erros de conexão. Tabelas criadas/atualizadas.

### 2.4 Seed dos planos no banco de produção

```bash
npm run seed
```

**Critério de pass**: `✅ Plans seeded successfully!` — Verifica que os 4 planos (Gratuito, Starter, Professional, Enterprise) estão no banco.

> ⚠️ Este comando deleta e recria os planos. Não rodar se já existirem usuários com assinaturas ativas.

---

## FASE 3 — Testes de Integração com Serviços Externos

### 3.1 Verificar integração Clerk

**Pré-requisito**: `CLERK_SECRET_KEY` e `CLERK_WEBHOOK_SECRET` configurados.

```bash
# Inicia o servidor em modo dev para testar
npm run dev:server
```

Verificações:
- [ ] Acesso a `GET /health` retorna `{"ok":true}`
- [ ] `POST /api/webhooks/clerk` sem headers svix retorna `400`
- [ ] `POST /api/webhooks/clerk` com signature inválida retorna `400`

### 3.2 Verificar integração Asaas (sandbox)

**Pré-requisito**: `ASAAS_API_KEY` (sandbox key) configurada, `ASAAS_ENV=sandbox`.

```bash
# Teste de conectividade com Asaas sandbox
curl -s -H "access_token: $ASAAS_API_KEY" \
  https://sandbox.asaas.com/api/v3/customers?limit=1 | jq .
```

**Critério de pass**: Retorna JSON com `data` array (mesmo que vazio).

### 3.3 Verificar registro automático de webhook no Asaas

Com `PUBLIC_URL` apontando para um endereço público (não localhost), o servidor registra o webhook automaticamente ao subir. Verifique nos logs:

```
[asaas-webhook] registered webhook → https://seudominio.com/api/webhooks/asaas
```

ou

```
[asaas-webhook] webhook already active → https://seudominio.com/api/webhooks/asaas
```

### 3.4 Verificar email (se configurado)

```bash
# Via tRPC diretamente com curl (requer server rodando e usuário autenticado)
# OU via interface Settings → Notificações → "Enviar email de teste"
```

**Critério de pass**: Email de teste chega na caixa de entrada.

### 3.5 Verificar Redis / BullMQ

```bash
# Verificar se Redis está acessível
redis-cli -u "$REDIS_URL" ping
```

**Critério de pass**: `PONG`

---

## FASE 4 — Testes Funcionais do Fluxo Completo

Execute com o servidor rodando (`npm run dev` ou produção).

### 4.1 Fluxo de autenticação

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Acessa `/` sem estar logado | Página Home com botão de login |
| 2 | Clica em "Entrar" | Redireciona para Clerk (sign-in) |
| 3 | Faz login com email/Google | Redireciona de volta, usuário criado no banco |
| 4 | Modal de privacidade aparece | Aceita → `privacyConsentedAt` salvo no banco |
| 5 | Acessa `/dashboard` | Dashboard carrega com sidebar |
| 6 | Clica "Sair" | Deslogado, redireciona para `/` |

### 4.2 Fluxo Plano Gratuito

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Acessa `/plans` | 4 planos listados (Gratuito, Starter, Professional, Enterprise) |
| 2 | Clica "Começar Grátis" (Plano Gratuito) | `directActivation: true` → toast "Plano ativado!" → redireciona `/dashboard` |
| 3 | Dashboard mostra uso: "0 / 3 notas" | Card de uso correto |
| 4 | Cria 3 notas fiscais | Todas criadas com status Pendente |
| 5 | Tenta criar 4ª nota | Toast de erro "Limite de emissoes atingido" com botão "Ver Planos" |
| 6 | Notas gratuitas têm badge "expira em Xd" | `expiresAt` ≈ hoje + 7 dias |

### 4.3 Fluxo Plano Pago — sem Asaas configurado (dev mode)

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Clica "Assinar agora" no plano Starter | `directActivation: true` → toast "Plano ativado!" → redireciona `/dashboard` |
| 2 | Verificar `plans.getSubscription` | Retorna assinatura com `status: "active"`, `planId` correto |
| 3 | Verificar uso 0/50 | Card mostra limite correto |

### 4.4 Fluxo Plano Pago — com Asaas configurado (sandbox)

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Clica "Assinar agora" no plano Starter | Abre nova aba com URL do Asaas. Banner "Aguardando confirmação do pagamento..." |
| 2 | Completa pagamento no Asaas sandbox | (Simular via Asaas sandbox UI ou aguardar webhook) |
| 3 | Webhook `PAYMENT_CONFIRMED` chega | Subscription ativada no banco, billing invoice → `status: confirmed` |
| 4 | Polling `syncSubscription` confirma | Toast "Plano Starter ativado com sucesso!" → redireciona `/dashboard` |
| 5 | OU: Clica "Já paguei" manualmente | Mesmo resultado se pagamento já confirmado |

### 4.5 Fluxo de Emissão de Nota Fiscal (NFS-e)

**Pré-requisito**: Usuário com plano ativo, empresa e certificado configurados.

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Dashboard → "Nova Nota Fiscal" | Modal abre |
| 2 | Preenche campos obrigatórios e clica "Criar" | Nota criada com status `Pendente` |
| 3 | Sistema enfileira via BullMQ automaticamente | Status → `Processando` |
| 4 | Worker processa (Porto Alegre: SEFIN Nacional; outros: ABRASF/SOAP) | Status → `Processado` ou `Erro` |
| 5 | Se `Processado`: webhook `invoice.processed` disparado | Endereços configurados recebem POST |
| 6 | Se `Processado`: email para tomador enviado (se configurado) | Email com PDF em anexo |
| 7 | Se `Erro` após 3 tentativas: webhook `invoice.error` disparado | Email de erro para prestador |
| 8 | Dashboard atualiza status em tempo real (polling 2s) | Badge correto aparece |

### 4.6 Fluxo de Download de PDF

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Acessa detalhe de nota `Processado` | Botão "Baixar PDF" visível |
| 2 | Clica "Baixar PDF" | PDF gerado (ou recuperado do storage) e download iniciado |
| 3 | PDF tem nome `nfse-{nfseNumber}.pdf` | Nome correto |
| 4 | Tenta download de nota `Pendente` | Erro "PDF disponível apenas para notas processadas" |

### 4.7 Fluxo de Cancelamento de NFS-e

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Acessa detalhe de nota `Processado` com `nfseNumber` | Botão "Cancelar NFS-e" visível |
| 2 | Seleciona motivo e confirma | Enviado para API municipal |
| 3 | Dentro do prazo (dependente do município) | `status → Cancelado`, webhook `invoice.cancelled` |
| 4 | Fora do prazo | Erro "Prazo de cancelamento expirado" |
| 5 | Nota sem `nfseNumber` | Erro "Número da NFS-e não encontrado" |

### 4.8 Fluxo de Configurações

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Settings → Empresa → Preenche CNPJ (14 dígitos) | Salva sem erro |
| 2 | CNPJ com 13 dígitos | Erro de validação |
| 3 | Estado com minúsculo (ex: "rs") | Erro de validação |
| 4 | ISS Rate fora do range 2-5 | Erro de validação |
| 5 | Certificado → Upload .pfx com senha correta | "Certificado enviado!" |
| 6 | Certificado → Upload com senha errada | Erro "Certificate validation failed" |
| 7 | Certificado expirado | Erro de validação |

### 4.9 Fluxo de Cancelamento de Assinatura

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Billing → Clica "Cancelar assinatura" | Confirmação aparece |
| 2 | Confirma cancelamento | `subscription.status → cancelled` |
| 3 | Se Asaas configurado | `cancelAsaasSubscription` chamado (com fallback em caso de erro) |
| 4 | Tenta criar nova nota | Erro "Nenhum plano ativo" |
| 5 | Pode assinar novamente | Novo ciclo começa |

### 4.10 Fluxo de Webhooks de Saída

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Settings → Webhooks → Criar endpoint | URL + eventos selecionados → `secret` retornado |
| 2 | Cria nota fiscal | `invoice.created` enviado para endpoint |
| 3 | Nota processada | `invoice.processed` enviado |
| 4 | Nota com erro | `invoice.error` enviado |
| 5 | Endpoint offline → 3 retries | Marcado como falha após 3 tentativas |
| 6 | Settings → Webhooks → Entregas | Log de tentativas visível |

### 4.11 Fluxo de Exclusão de Conta

| # | Ação | Resultado Esperado |
|---|---|---|
| 1 | Settings → Conta → "Excluir conta" | Dialog de confirmação |
| 2 | Digita "CONFIRMAR" e clica | Todos os dados deletados em cascata |
| 3 | Redirecionado para `/` | Usuário não existe mais no banco |

---

## FASE 5 — Verificações de Segurança

```bash
# TypeScript sem erros (já validado na Fase 1)
npx tsc --noEmit

# Verificar que .env não está no git
git status | grep ".env"

# Verificar headers de segurança (CORS)
curl -I -X OPTIONS https://seudominio.com/trpc/plans.list \
  -H "Origin: https://outro-site.com"
# Deve retornar Access-Control-Allow-Origin sem wildcard em produção
```

### 5.1 Checklist de segurança

- [ ] `ENCRYPTION_KEY` definida com valor aleatório de 64 chars hex (nunca vazio/default)
- [ ] `CLERK_WEBHOOK_SECRET` configurado (webhook Clerk verificado com svix)
- [ ] `.env` não commitado no git (checar `.gitignore`)
- [ ] `NODE_ENV=production` definido (CORS restrito ao `PUBLIC_URL`)
- [ ] Senhas de certificado nunca logadas (verificar que `console.log` não expõe `encryptedPassword`)
- [ ] Banco de dados com credenciais dedicadas (não root)
- [ ] Redis com senha (se exposto externamente)

---

## FASE 6 — Testes de Performance e Estabilidade

### 6.1 Health check

```bash
curl https://seudominio.com/health
# Resposta esperada: {"ok":true}
```

### 6.2 Limpeza de notas expiradas

```bash
# Verificar que o job de limpeza está funcionando (checar logs do servidor)
# A cada 24h, deleteExpiredInvoices() é chamado
# Deve logar: [cleanup] deleted X expired invoices
```

### 6.3 Verificar worker BullMQ

```bash
# Com Redis rodando, verificar que o worker processa jobs
# Criar uma nota e verificar nos logs do servidor:
[NFSeWorker] Job emit-rps-{id} completed for invoice {id}
# OU em caso de erro da prefeitura:
[NFSeWorker] Job emit-rps-{id} failed (attempt 1): ...
```

### 6.4 Teste de carga básico (opcional)

```bash
# Verificar que o servidor não cai com múltiplas requisições simultâneas
for i in {1..10}; do curl -s https://seudominio.com/health & done; wait
```

---

## FASE 7 — Checklist Final Pré-Deploy

Execute antes de cada deploy em produção:

```bash
# 1. Testes automatizados
npm test

# 2. TypeScript
npx tsc --noEmit

# 3. Build
npm run build

# 4. Verificar variáveis de ambiente obrigatórias
node -e "
const required = ['DATABASE_URL','CLERK_SECRET_KEY','CLERK_WEBHOOK_SECRET','ENCRYPTION_KEY','PUBLIC_URL','ASAAS_API_KEY','REDIS_URL'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) { console.error('MISSING:', missing); process.exit(1); }
console.log('All required env vars are set ✓');
" 2>&1
```

### Checklist de Deploy

- [ ] `npm test` → 0 falhas
- [ ] `npx tsc --noEmit` → 0 erros
- [ ] `npm run build` → sem erros
- [ ] Variáveis de ambiente verificadas
- [ ] `NFSE_ENV=producao` (não homologacao)
- [ ] `ASAAS_ENV=production` (não sandbox)
- [ ] `NODE_ENV=production`
- [ ] Banco de produção migrado (`npm run db:push`)
- [ ] Planos seedados (`npm run seed`) — SE primeiro deploy
- [ ] Redis acessível
- [ ] Clerk webhook URL atualizado para domínio de produção
- [ ] Asaas webhook registrado automaticamente ao subir o servidor (verificar logs)
- [ ] Health check respondendo: `GET /health → {"ok":true}`

---

## Arquitetura dos Testes (referência)

| Arquivo de Teste | Módulo Testado | Tipo | Testes |
|---|---|---|---|
| `invoices.test.ts` | Lógica de notas fiscais | Unit | 15 |
| `invoices.integration.test.ts` | Fluxo de notas + auth | Integration | 24 |
| `plans.test.ts` | Sistema de planos | Unit | 31 |
| `payments.test.ts` | Pagamentos + Asaas client | Unit | 27 |
| `cancelamento.test.ts` | Gerador de cancelamento NFS-e | Unit | 38 |
| `rpsGenerator.test.ts` | Gerador de RPS XML | Unit | 22 |
| `xmlSigner.test.ts` | Assinatura XML com certificado | Unit | 9 |
| `pdfGenerator.test.ts` | Geração de PDF | Unit | 22 |
| `nfseIntegration.test.ts` | Clientes NFS-e por município | Integration | 18 |
| `webhookDispatcher.test.ts` | Dispatcher de webhooks de saída | Unit | 9 |
| `crypto.test.ts` | Criptografia AES-256-GCM | Unit | 15 |
| `storage.test.ts` | Storage local/R2 | Unit | 11 |
| `emailService.test.ts` | Serviço de email | Unit | 9 |
| `asaasWebhook.test.ts` | Handler webhook Asaas | Unit | 21 |
| `subscriptionFlow.test.ts` | Máquina de estado de assinaturas | Unit | 29 |
| `worker.test.ts` | Worker BullMQ NFSe | Unit | 28 |
| `security.test.ts` | Validação de input + segurança | Unit | 31 |
| **TOTAL** | | | **359** |

---

## Cobertura de Funcionalidades

| Funcionalidade | Testes Unitários | Testes Funcionais |
|---|---|---|
| Autenticação Clerk | ✅ integration | ✅ Fase 4.1 |
| Plano Gratuito | ✅ subscriptionFlow | ✅ Fase 4.2 |
| Plano Pago (dev mode) | ✅ payments + subscriptionFlow | ✅ Fase 4.3 |
| Plano Pago (Asaas) | ✅ payments + asaasWebhook | ✅ Fase 4.4 |
| Webhook Asaas (inbound) | ✅ asaasWebhook | ✅ Fase 4.4 |
| Criação de nota fiscal | ✅ invoices + integration | ✅ Fase 4.5 |
| Emissão NFS-e (worker) | ✅ worker + nfseIntegration | ✅ Fase 4.5 |
| PDF download | ✅ pdfGenerator + storage | ✅ Fase 4.6 |
| Cancelamento NFS-e | ✅ cancelamento | ✅ Fase 4.7 |
| Configurações de empresa | ✅ security (validação) | ✅ Fase 4.8 |
| Upload de certificado | ✅ xmlSigner | ✅ Fase 4.8 |
| Cancelamento de assinatura | ✅ subscriptionFlow | ✅ Fase 4.9 |
| Webhooks de saída | ✅ webhookDispatcher | ✅ Fase 4.10 |
| Exclusão de conta | ✅ (cascade em db.ts) | ✅ Fase 4.11 |
| Crypto (certificados) | ✅ crypto | N/A |
| Storage (PDFs) | ✅ storage | N/A |
| Email service | ✅ emailService | ✅ Fase 3.4 |
| Limite de notas | ✅ plans + subscriptionFlow | ✅ Fase 4.2 |
| Segurança + validação | ✅ security | N/A |

---

## Comandos de Referência Rápida

```bash
# Tudo de uma vez (deve ser zero falhas)
npm test && npx tsc --noEmit && npm run build && echo "✅ PRONTO PARA PRODUÇÃO"

# Apenas testes unitários
npm test

# Apenas TypeScript
npx tsc --noEmit

# Apenas build
npm run build

# Seed de planos (banco limpo)
npm run seed

# Migração de schema
npm run db:push

# Subir em desenvolvimento
npm run dev

# Subir em produção (após build)
npm start
```
