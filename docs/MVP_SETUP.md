# AutoNF — Guia Completo de Setup e Deploy

> Este documento contém tudo que é necessário para montar o projeto do zero, rodar localmente e fazer deploy no Railway.

---

## Índice

1. [O que você vai precisar](#1-o-que-você-vai-precisar)
2. [Estrutura de arquivos a criar](#2-estrutura-de-arquivos-a-criar)
3. [package.json — dependências do projeto](#3-packagejson)
4. [tsconfig.json — configuração TypeScript](#4-tsconfigjson)
5. [vite.config.ts — bundler do frontend](#5-viteconfigts)
6. [Variáveis de ambiente (.env)](#6-variáveis-de-ambiente)
7. [Banco de dados — SQL de criação das tabelas](#7-banco-de-dados)
8. [Script de seed — planos iniciais](#8-script-de-seed)
9. [Como rodar localmente](#9-como-rodar-localmente)
10. [Deploy no Railway — passo a passo](#10-deploy-no-railway)
11. [Serviços externos necessários](#11-serviços-externos)
12. [Checklist final antes de ir ao ar](#12-checklist-final)

---

## 1. O que você vai precisar

### Instalado na sua máquina (para desenvolvimento local)

| Ferramenta | Para que serve | Como instalar |
|-----------|---------------|---------------|
| **Node.js 20+** | Rodar o backend e o frontend | nodejs.org |
| **npm** | Gerenciar pacotes (já vem com o Node) | — |
| **MySQL 8** | Banco de dados | mysql.com/downloads |
| **Redis 7** | Fila de processamento assíncrono | redis.io/download |
| **Git** | Versionar o código | git-scm.com |

### Contas em serviços externos (obrigatórias para produção)

| Serviço | Para que serve | Plano gratuito? |
|---------|---------------|-----------------|
| **Railway** | Hospedar o sistema | Sim ($5 crédito) |
| **GitHub** | Guardar o código | Sim |
| **Asaas** | Cobrar os clientes (Pix/boleto/cartão) | Sandbox grátis |
| **Resend** | Enviar emails | Sim (3.000/mês) |

---

## 2. Estrutura de arquivos a criar

Crie esta estrutura na sua máquina antes de qualquer coisa:

```
autonf/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── App.tsx
│   └── index.html
├── server/
│   ├── _core/
│   └── index.ts          ← CRIAR ESTE ARQUIVO
├── drizzle/
│   └── schema.ts
├── scripts/
│   └── seed-plans.mjs
├── docs/
├── .env                  ← CRIAR ESTE ARQUIVO
├── .env.example          ← CRIAR ESTE ARQUIVO
├── package.json          ← CRIAR ESTE ARQUIVO
├── tsconfig.json         ← CRIAR ESTE ARQUIVO
├── vite.config.ts        ← CRIAR ESTE ARQUIVO
├── drizzle.config.ts     ← CRIAR ESTE ARQUIVO
└── railway.json          ← CRIAR ESTE ARQUIVO
```

---

## 3. package.json

Crie o arquivo `package.json` na raiz do projeto com este conteúdo:

```json
{
  "name": "autonf",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "tsx watch server/index.ts",
    "dev:client": "vite",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "tsc -p tsconfig.server.json",
    "start": "node dist/server/index.js",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "seed": "node scripts/seed-plans.mjs",
    "test": "vitest run",
    "worker": "tsx server/_core/worker.ts"
  },
  "dependencies": {
    "@trpc/client": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "@trpc/server": "^11.0.0",
    "@tanstack/react-query": "^5.0.0",
    "bullmq": "^5.0.0",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "drizzle-orm": "^0.30.0",
    "express": "^4.18.3",
    "ioredis": "^5.3.2",
    "mysql2": "^3.9.0",
    "nodemailer": "^6.9.0",
    "node-forge": "^1.3.1",
    "pdfkit": "^0.15.0",
    "qrcode": "^1.5.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sonner": "^1.4.0",
    "wouter": "^3.0.0",
    "xml2js": "^0.6.2",
    "xmlbuilder2": "^3.1.1",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "@types/nodemailer": "^6.4.14",
    "@types/node-forge": "^1.3.10",
    "@types/pdfkit": "^0.13.4",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.18",
    "concurrently": "^8.2.2",
    "drizzle-kit": "^0.20.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vite": "^5.1.0",
    "vitest": "^1.3.0"
  }
}
```

Depois de criar, rode no terminal:

```bash
npm install
```

---

## 4. tsconfig.json

Crie `tsconfig.json` na raiz:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["client/src/**/*", "shared/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Crie também `tsconfig.server.json` na raiz:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist/server",
    "jsx": "preserve"
  },
  "include": ["server/**/*", "drizzle/**/*", "shared/**/*"],
  "exclude": ["node_modules", "dist", "client"]
}
```

---

## 5. vite.config.ts

Crie `vite.config.ts` na raiz:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/trpc": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
  },
});
```

---

## 6. Variáveis de Ambiente

### Para desenvolvimento local — crie o arquivo `.env` na raiz:

```env
# ─── Banco de dados ───────────────────────────────────────────────
DATABASE_URL=mysql://root:senha123@localhost:3306/autonf

# ─── Redis (fila de processamento) ───────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Criptografia (AES-256-GCM) ──────────────────────────────────
# Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=cole_aqui_uma_chave_de_64_caracteres_hexadecimais

# ─── Sessão de login ──────────────────────────────────────────────
# Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=cole_aqui_outro_valor_aleatorio_qualquer

# ─── Asaas (gateway de pagamento) ─────────────────────────────────
# Crie conta em asaas.com → API → Gerar chave de integração
ASAAS_API_KEY=sua_chave_do_asaas_aqui
ASAAS_ENV=sandbox   # troque para "production" quando for ao ar de verdade

# ─── Email (escolha uma das opções abaixo) ────────────────────────
# Opção 1: Resend (recomendado — crie conta em resend.com)
RESEND_API_KEY=re_sua_chave_do_resend

# Opção 2: SMTP próprio (ex: Gmail, Outlook)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=seuemail@gmail.com
# SMTP_PASS=sua_senha_de_app

EMAIL_FROM=noreply@seudominio.com.br

# ─── PDFs ─────────────────────────────────────────────────────────
PDF_STORAGE_PATH=./storage/pdfs

# ─── Servidor ─────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development

# ─── Dono do sistema (seu openId do OAuth — preencher depois) ─────
OWNER_OPEN_ID=

# ─── URL pública (necessário para QR code nos PDFs) ───────────────
PUBLIC_URL=http://localhost:3000
```

### Ponto de atenção: como gerar o ENCRYPTION_KEY

Abra o terminal e rode:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado e cole no `.env`. **Guarde este valor em lugar seguro** — se perder, não consegue descriptografar os certificados digitais salvos no banco.

---

## 7. Banco de Dados

### Opção A — Usando Drizzle (recomendado)

Crie o arquivo `drizzle.config.ts` na raiz:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "mysql2",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

Depois rode:

```bash
# Cria o banco e todas as tabelas automaticamente
npm run db:push
```

### Opção B — SQL direto (se preferir rodar no MySQL Workbench ou similar)

```sql
CREATE DATABASE autonf CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE autonf;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  loginMethod VARCHAR(64),
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  privacyConsentedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  clientName VARCHAR(255) NOT NULL,
  serviceDescription TEXT NOT NULL,
  value INT NOT NULL,
  competenceMonth VARCHAR(7) NOT NULL,
  status ENUM('Pendente','Processando','Processado','Erro','Cancelado') NOT NULL DEFAULT 'Pendente',
  nfseNumber VARCHAR(50),
  errorMessage TEXT,
  jobId VARCHAR(100),
  rpsIdempotencyKey VARCHAR(100) UNIQUE,
  pdfPath VARCHAR(500),
  retIRPJ INT DEFAULT 0,
  retCSLL INT DEFAULT 0,
  retCOFINS INT DEFAULT 0,
  retPIS INT DEFAULT 0,
  retINSS INT DEFAULT 0,
  retISS INT DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  processedAt TIMESTAMP NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE invoiceHistory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoiceId INT NOT NULL,
  fromStatus ENUM('Pendente','Processando','Processado','Erro','Criado','Cancelado') NOT NULL,
  toStatus ENUM('Pendente','Processando','Processado','Erro','Cancelado') NOT NULL,
  reason TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoiceId) REFERENCES invoices(id)
);

CREATE TABLE companyConfigs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  cnpj VARCHAR(14) NOT NULL,
  municipalRegistration VARCHAR(20) NOT NULL,
  companyName VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  municipality VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  issRate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE digitalCertificates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  certificateData TEXT NOT NULL,
  encryptedPassword TEXT NOT NULL,
  subject VARCHAR(255),
  issuer VARCHAR(255),
  validFrom TIMESTAMP NULL,
  validUntil TIMESTAMP NULL,
  isActive ENUM('true','false') NOT NULL DEFAULT 'true',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  pricePerMonth INT NOT NULL,
  maxInvoicesPerMonth INT NOT NULL,
  features TEXT,
  displayOrder INT DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  planId INT NOT NULL,
  status ENUM('active','paused','cancelled') NOT NULL DEFAULT 'active',
  startDate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  renewalDate TIMESTAMP NULL,
  cancellationDate TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (planId) REFERENCES plans(id)
);

CREATE TABLE invoiceUsage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  month VARCHAR(7) NOT NULL,
  invoiceCount INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE asaasCustomers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL UNIQUE,
  asaasCustomerId VARCHAR(100) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE billingInvoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  subscriptionId INT,
  asaasPaymentId VARCHAR(100),
  asaasSubscriptionId VARCHAR(100),
  planName VARCHAR(50) NOT NULL,
  amount INT NOT NULL,
  dueDate VARCHAR(10) NOT NULL,
  status ENUM('pending','confirmed','overdue','cancelled') NOT NULL DEFAULT 'pending',
  paymentMethod VARCHAR(50),
  paymentUrl TEXT,
  nfseEmitted ENUM('true','false') NOT NULL DEFAULT 'false',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE webhookEndpoints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(64) NOT NULL,
  events TEXT NOT NULL,
  description VARCHAR(255),
  isActive ENUM('true','false') NOT NULL DEFAULT 'true',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE webhookDeliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  webhookEndpointId INT NOT NULL,
  event VARCHAR(100) NOT NULL,
  payload TEXT NOT NULL,
  responseStatus INT,
  responseBody TEXT,
  attempts INT NOT NULL DEFAULT 1,
  success ENUM('true','false') NOT NULL DEFAULT 'false',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (webhookEndpointId) REFERENCES webhookEndpoints(id)
);

CREATE TABLE notificationPrefs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL UNIQUE,
  emailTomadorOnSuccess ENUM('true','false') NOT NULL DEFAULT 'true',
  emailPrestadorOnError ENUM('true','false') NOT NULL DEFAULT 'true',
  defaultTomadorEmail VARCHAR(320),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

---

## 8. Script de Seed — Planos Iniciais

Após criar o banco, rode o seed para inserir os 3 planos:

```bash
npm run seed
```

Isso insere automaticamente:

| Plano | Preço | Limite |
|-------|-------|--------|
| Starter | R$ 250/mês | 50 notas/mês |
| Professional | R$ 400/mês | 200 notas/mês |
| Enterprise | R$ 999/mês | Ilimitado |

---

## 9. Como rodar localmente

### Passo 1 — Instalar dependências

```bash
cd autonf
npm install
```

### Passo 2 — Configurar o .env

Copie o bloco da seção 6 deste documento e salve como `.env` na raiz.
Preencha pelo menos: `DATABASE_URL`, `REDIS_URL` e `ENCRYPTION_KEY`.

### Passo 3 — Subir o banco e o Redis

```bash
# MySQL — se estiver no Mac com Homebrew:
brew services start mysql

# Redis — se estiver no Mac com Homebrew:
brew services start redis
```

### Passo 4 — Criar as tabelas

```bash
npm run db:push
```

### Passo 5 — Popular os planos

```bash
npm run seed
```

### Passo 6 — Iniciar o sistema

```bash
# Inicia backend (porta 3000) + frontend (porta 5173) ao mesmo tempo
npm run dev

# Em outro terminal, iniciar o worker de filas:
npm run worker
```

### Passo 7 — Acessar

Abra o navegador em: **http://localhost:5173**

---

## 10. Deploy no Railway — Passo a Passo

### Passo 1 — Criar conta no Railway

Acesse **railway.app** e faça login com sua conta GitHub.

### Passo 2 — Subir o código no GitHub

```bash
# Na pasta do projeto:
git init
git add .
git commit -m "primeiro commit"
git branch -M main

# Crie um repositório no github.com (pode ser privado)
# Depois rode:
git remote add origin https://github.com/seu-usuario/autonf.git
git push -u origin main
```

### Passo 3 — Criar o projeto no Railway

1. No Railway, clique em **New Project**
2. Escolha **Deploy from GitHub repo**
3. Selecione o repositório `autonf`
4. O Railway vai detectar que é Node.js automaticamente

### Passo 4 — Adicionar MySQL

1. No painel do projeto, clique em **+ New**
2. Escolha **Database → MySQL**
3. O Railway cria o banco e gera a `DATABASE_URL` automaticamente
4. Clique na instância MySQL → **Variables** → copie o valor de `DATABASE_URL`

### Passo 5 — Adicionar Redis

1. Clique em **+ New** novamente
2. Escolha **Database → Redis**
3. O Railway cria e gera a `REDIS_URL` automaticamente

### Passo 6 — Configurar variáveis de ambiente

No painel do serviço Node.js (não do banco), vá em **Variables** e adicione:

```
DATABASE_URL          → (copiado do MySQL no passo 4)
REDIS_URL             → (copiado do Redis no passo 5)
ENCRYPTION_KEY        → (gere conforme seção 6)
SESSION_SECRET        → (gere conforme seção 6)
ASAAS_API_KEY         → (da sua conta Asaas)
ASAAS_ENV             → sandbox
RESEND_API_KEY        → (da sua conta Resend)
EMAIL_FROM            → noreply@seudominio.com.br
PDF_STORAGE_PATH      → /app/storage/pdfs
NODE_ENV              → production
PUBLIC_URL            → (o link que o Railway vai te dar, ex: autonf.up.railway.app)
```

### Passo 7 — Configurar o comando de start

No Railway, vá em **Settings → Deploy** e configure:

- **Build Command:** `npm run build`
- **Start Command:** `npm start`

### Passo 8 — Criar as tabelas no banco de produção

Após o deploy, no painel do Railway clique em **Shell** (terminal online) e rode:

```bash
npm run db:push
npm run seed
```

### Passo 9 — Acessar o sistema

O Railway vai te dar um link público no formato:

```
https://autonf-production.up.railway.app
```

Esse é o endereço do seu sistema no ar.

### Passo 10 — Conectar domínio próprio (opcional)

Em **Settings → Domains**, você pode adicionar um domínio como `app.autonf.com.br`. Precisa ter o domínio registrado e apontar o DNS conforme as instruções do Railway.

---

## 11. Serviços Externos

### Asaas (pagamentos)

1. Crie conta em **asaas.com**
2. Acesse: **Integrações → API**
3. Gere a chave de API
4. Cole em `ASAAS_API_KEY` no `.env`
5. Para receber webhooks do Asaas (confirmação de pagamento), configure no painel do Asaas:
   - URL: `https://seudominio.com.br/api/asaas/webhook`
   - Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`

### Resend (emails)

1. Crie conta em **resend.com**
2. Vá em **API Keys → Create API Key**
3. Cole em `RESEND_API_KEY` no `.env`
4. Adicione e verifique seu domínio em **Domains** (para enviar de `@seudominio.com.br`)

### Autenticação (importante)

O projeto foi construído originalmente usando o sistema OAuth da plataforma **Manus**. Para rodar fora do Manus, a autenticação precisa ser trocada. As opções são:

| Opção | Dificuldade | Como |
|-------|-------------|------|
| **Manus** | Fácil (já está integrado) | Hospedar na plataforma Manus |
| **Auth.js / NextAuth** | Média | Substituir o middleware de auth |
| **Login simples com JWT** | Fácil | Criar rota de login com email+senha |
| **Clerk** | Fácil | SDK pronto, 10.000 usuários grátis |

**Recomendação para começar:** usar o Clerk (clerk.com) — tem SDK para Express e React, é grátis para até 10.000 usuários, e a integração é simples.

---

## 12. Checklist Final

Antes de considerar o sistema pronto para uso real:

### Infraestrutura
- [ ] Railway rodando com Node.js + MySQL + Redis
- [ ] Variáveis de ambiente todas preenchidas
- [ ] `npm run db:push` executado em produção
- [ ] `npm run seed` executado (planos criados)
- [ ] Domínio próprio configurado (opcional mas recomendado)

### Pagamentos
- [ ] Conta Asaas criada
- [ ] API Key configurada
- [ ] Webhook do Asaas apontando para a URL correta
- [ ] Teste de cobrança via sandbox realizado

### Email
- [ ] Conta Resend criada
- [ ] Domínio verificado no Resend
- [ ] Teste de envio de email realizado

### Autenticação
- [ ] Sistema de login definido e integrado
- [ ] Fluxo de primeiro acesso (aceite de privacidade LGPD) testado

### Fiscal
- [ ] Dados da empresa configurados nas Settings
- [ ] Certificado digital A1 (.pfx ou .p12) carregado
- [ ] Alíquota ISS configurada para o município
- [ ] Teste de emissão no ambiente de homologação da prefeitura

### Segurança
- [ ] `ENCRYPTION_KEY` guardada em local seguro (sem ela, certificados ficam inacessíveis)
- [ ] `.env` no `.gitignore` (nunca subir para o GitHub)
- [ ] `NODE_ENV=production` em produção

---

## Resumo Rápido

```
1. npm install
2. Configurar .env
3. npm run db:push
4. npm run seed
5. npm run dev          → desenvolvimento local
   npm run worker       → worker de filas (terminal separado)

6. git push → Railway faz deploy automático
```

**Suporte técnico:** consultar docs em `/docs/AUTONF_PLANO.md` para contexto do projeto.
