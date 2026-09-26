# Fluxo de Pagamento — AutoNF

Gateway: **Asaas** (sandbox e produção)  
Método: **Cartão de crédito** (recorrência mensal automática)

---

## Visão Geral

```
Usuário → Plans page → createCheckout (tRPC)
       → Asaas: cria customer + subscription
       → Asaas retorna paymentUrl (link de pagamento)
       → Usuário paga no site da Asaas
       → Confirmação via webhook (produção) ou syncSubscription polling (dev)
       → Plano ativado no banco + redirecionamento para /dashboard
```

---

## Etapas Detalhadas

### 1. Checkout (`payments.createCheckout`)

O frontend chama `trpc.payments.createCheckout.mutate({ planName })`.

O servidor:
1. Busca o plano no banco pelo nome
2. Busca ou cria o cliente na Asaas via `createAsaasCustomer()`
3. Cria a assinatura recorrente mensal via `createAsaasSubscription()` — `billingType: "CREDIT_CARD"` fixo
4. Salva `billing_invoice` no banco com status `"pending"`
5. Retorna `{ paymentUrl, directActivation: false }`

Para o **plano Gratuito** (`pricePerMonth === 0`): ativa diretamente sem chamar a Asaas e retorna `{ directActivation: true }`.

### 2. Pagamento pelo Usuário

O frontend abre a `paymentUrl` em nova aba (`window.open`).  
O usuário preenche os dados do cartão no ambiente seguro da Asaas e confirma.

### 3. Confirmação — Dois Caminhos

#### Caminho A: Webhook (produção e dev com túnel)

A Asaas envia `POST /api/webhooks/asaas` quando o pagamento é confirmado.

Eventos tratados:

| Evento Asaas | Ação no banco |
|---|---|
| `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | `billing_invoice.status = "confirmed"` → cria subscription ativa |
| `PAYMENT_OVERDUE` | `billing_invoice.status = "overdue"` |
| `PAYMENT_DELETED` / `SUBSCRIPTION_DELETED` | `billing_invoice.status = "cancelled"` → cancela subscription |

O webhook é **registrado automaticamente** no startup do servidor pela função `ensureAsaasWebhook(publicUrl)` — ela:
- Apaga webhooks antigos (URLs de túneis anteriores)
- Registra ou reativa o webhook apontando para `${PUBLIC_URL}/api/webhooks/asaas`
- É no-op se `PUBLIC_URL` for localhost

#### Caminho B: Polling `syncSubscription` (fallback dev / "Já paguei")

O frontend inicia polling a cada **5 segundos** após abrir a `paymentUrl`.

A cada tick, chama `trpc.payments.syncSubscription.mutate()`, que:
1. Busca a `billing_invoice` pendente do usuário
2. Consulta os pagamentos da assinatura direto na Asaas API
3. Se encontrar pagamento `CONFIRMED` ou `RECEIVED`:
   - Atualiza `billing_invoice` para `"confirmed"`
   - Cria subscription ativa no banco
   - Retorna `{ activated: true, planName }`
4. Frontend para o polling, exibe toast de sucesso, redireciona para `/dashboard`

O usuário também pode clicar **"Já paguei"** para acionar o sync manualmente.

---

## Variáveis de Ambiente Necessárias

```env
ASAAS_API_KEY=        # Chave da API Asaas (começa com $aact_)
ASAAS_ENV=            # "sandbox" (dev/homologação) ou "production"
PUBLIC_URL=           # URL pública do servidor (para registro do webhook)
```

### Em desenvolvimento (localhost)

Use o Cloudflare Tunnel para expor o servidor localmente:

```bash
cloudflared tunnel --url http://localhost:3000
```

Copie a URL gerada (ex: `https://xxx.trycloudflare.com`) e defina no `.env`:

```env
PUBLIC_URL=https://xxx.trycloudflare.com
ASAAS_ENV=sandbox
ASAAS_API_KEY=$aact_hmlg_...   # chave de homologação
```

Reinicie o servidor — o webhook será registrado automaticamente.

### Em produção (Railway / Render)

Defina as variáveis de ambiente no painel:

```env
PUBLIC_URL=https://autonf.com.br    # ou URL do Railway/Render
ASAAS_ENV=production
ASAAS_API_KEY=$aact_...             # chave de produção
```

O webhook é registrado no startup sem nenhuma ação manual.

---

## Estrutura do Banco

### `billing_invoices`

| Campo | Descrição |
|---|---|
| `userId` | ID do usuário (Clerk) |
| `planName` | Nome do plano |
| `status` | `pending` → `confirmed` / `overdue` / `cancelled` |
| `asaasCustomerId` | ID do cliente na Asaas |
| `asaasSubscriptionId` | ID da assinatura na Asaas |
| `asaasPaymentId` | ID do pagamento confirmado |
| `paymentMethod` | `CREDIT_CARD` |

### `subscriptions`

| Campo | Descrição |
|---|---|
| `userId` | ID do usuário |
| `planId` | FK para `plans` |
| `status` | `active` / `cancelled` |

Ao confirmar pagamento: cria nova subscription com `status = "active"` e cancela as anteriores.

---

## Diagrama de Sequência

```
Frontend          Servidor          Asaas           Banco
   |                  |                |               |
   |--createCheckout->|                |               |
   |                  |--createCustomer>|              |
   |                  |<-customerId----|               |
   |                  |--createSubscription>|          |
   |                  |<-{paymentUrl}--|               |
   |                  |--INSERT billing_invoice------->|
   |<-{paymentUrl}----|                |               |
   |                  |                |               |
   |--open paymentUrl (nova aba)       |               |
   |                  |                |               |
   |  [usuário paga na Asaas]          |               |
   |                  |                |               |
   |  Caminho A: Webhook               |               |
   |                  |<-PAYMENT_CONFIRMED (POST /api/webhooks/asaas)
   |                  |--UPDATE billing_invoice------->|
   |                  |--INSERT subscription---------->|
   |                  |                |               |
   |  Caminho B: Polling               |               |
   |--syncSubscription>|               |               |
   |                  |--GET /payments?subscription=-->|
   |                  |<-[{status:CONFIRMED}]--|       |
   |                  |--UPDATE billing_invoice------->|
   |                  |--INSERT subscription---------->|
   |<-{activated:true}|                |               |
   |--navigate /dashboard              |               |
```
