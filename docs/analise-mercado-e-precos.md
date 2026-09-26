# Análise de Mercado e Estratégia de Preços — AutoNF

> Gerado em: 2026-05-24

---

## 1. O Produto

**AutoNF** é um SaaS de emissão de NFS-e (Nota Fiscal de Serviços Eletrônica) para prestadores de serviço PF e PJ no Brasil.

Diferenciais centrais:
- Upload e gerenciamento de certificado digital A1
- Emissão automática via API das prefeituras
- Retenção automática de 6 impostos: IRPJ, CSLL, COFINS, PIS, INSS, ISS
- Integração nativa com Asaas (pagamentos e assinaturas)
- Webhook para notificações pós-emissão
- Plano gratuito (3 notas/mês)

---

## 2. Tamanho do Mercado

| Indicador | Número |
|-----------|--------|
| Empresas ativas com CNPJ no Brasil | 21,6 milhões |
| MEIs ativos | 15,7 milhões |
| PJ prestadoras de serviço (estimativa) | 2,5–3 milhões |
| TAM (potenciais emissores de NFS-e) | 4–6 milhões |
| SAM (buscam automação via software) | 500k–1,5 milhão |
| SOM realista para AutoNF (3 anos) | 10k–50k pagantes |
| Mercado SaaS NFS-e (ARR agregado estimado) | R$ 300–900M/ano |

**Gatilho de crescimento:** A NFS-e em padrão nacional se tornou obrigatória em janeiro de 2026 (Lei Complementar 214/2025). MEIs entram na obrigatoriedade em 2027. Isso gera demanda orgânica crescente agora.

---

## 3. Mapeamento de Concorrentes

### 3.1 Diretos ao Usuário Final (maior ameaça)

| Player | Entrada paga | Notas | Intermediário | Notas | Topo | Notas | Freemium |
|--------|-------------|-------|--------------|-------|------|-------|----------|
| AquiNotas | R$ 39,90 | 100 | R$ 84,90 | ∞ | — | — | Não |
| SafeNota | R$ 38 | variável | — | — | — | — | Não |
| TransmiteNota | R$ 49,90 | 50 | R$ 79,90 | 200 | R$ 129,90 | 500 | Não |
| Spedy | R$ 74 | 150 | R$ 157 | 600 | R$ 207 | 2.000 | Não |
| Focus NFe | R$ 89,90 | 100 | R$ 113,90 | 300 | R$ 548 | 4.000 | 30d trial |
| eNotas | R$ 137 | 50 | R$ 247 | 500 | R$ 347 | ∞ | Não |
| NFe.io | R$ 90 | 100 | R$ 190 | 250 | R$ 375 | 1.000 | Não |
| Notaas | R$ 99 | 500 | R$ 249 | 2.000 | R$ 749 | 10.000 | Sim (50 notas) |

### 3.2 Infraestrutura/API (concorrentes indiretos)

| Player | Modelo | Receita estimada | Status |
|--------|--------|-----------------|--------|
| Plugnotas (TecnoSpeed) | API p/ software houses | US$ 8,3M (~R$ 42M) | Crescimento 25% CAGR |
| Focus NFe | API + painel | Não divulgado | Ativo |
| NFe.io | API + painel | Não divulgado | Ativo |
| Nuvem Fiscal | API p/ devs | — | ⚠️ Encerrando jul/2026 |

### 3.3 ERPs com módulo NFS-e (referência de mercado)

| Player | Receita | Clientes | Preço entrada |
|--------|---------|----------|--------------|
| Omie | R$ 600M ARR | 180 mil | R$ 99+/mês |
| Conta Azul | ~R$ 400M (adquirida por R$ 2B pela Visma em 2025) | ~100 mil | R$ 159,90/mês |
| Nibo | Não divulgado | — | R$ 166/mês |

### 3.4 Spedy — Concorrente Mais Próximo

- 7.000+ empresas atendidas
- 40+ milhões de notas emitidas
- R$ 5 bilhões em volume processado
- 70+ integrações (Hotmart, Kiwify, Shopify, Stripe, Asaas, Mercado Pago)
- Cancelamento automático por estorno
- Co-produção com split percentual automático
- Rating 4.9 estrelas

### 3.5 eNotas — Concorrente no Segmento Digital

- Integração oficial com Hotmart (parceria)
- Clientes: Fluency Academy, Me Poupe, Whindersson Nunes
- Sem plano gratuito
- Cobre apenas ~500 municípios (AutoNF precisa crescer aqui)

---

## 4. Planos Atuais do AutoNF vs. Mercado

### Situação atual (seed-plans.mjs)

| Plano | Preço/mês | Notas/mês |
|-------|-----------|-----------|
| Gratuito | R$ 0 | 3 |
| Starter | R$ 250 | 50 |
| Professional | R$ 400 | 200 |
| Enterprise | R$ 999 | Ilimitadas |

### Diagnóstico

**Gratuito (3 notas) — Muito restritivo**
Com 3 notas/mês o usuário não consegue avaliar o produto de verdade. O Notaas oferece 50 notas free; a maioria dos concorrentes tem 30 dias de trial irrestrito. 3 notas frustra em vez de converter.

**Starter (R$ 250, 50 notas) — 2–6x mais caro que o mercado**
AquiNotas: R$ 39,90 por 100 notas. TransmiteNota: R$ 49,90 pelas mesmas 50 notas. Spedy: R$ 74 por 150 notas. Nenhum freelancer ou MEI paga R$ 250 tendo essas alternativas.

**Professional (R$ 400, 200 notas) — 2–3x fora do mercado**
NFe.io cobra R$ 265 por 500 notas (2,5x mais volume por preço menor). TransmiteNota cobra R$ 79,90 pelas mesmas 200 notas.

**Enterprise (R$ 999, ilimitado) — Preço razoável, features erradas**
SSO/LDAP e Multi-tenant não fazem sentido para o público-alvo (PF, MEI, PJ pequena).

---

## 5. Recomendação de Repricing

| Plano | Preço atual | Preço sugerido | Notas atual | Notas sugeridas | Racional |
|-------|-------------|---------------|-------------|-----------------|---------|
| Gratuito | R$ 0 | R$ 0 | 3 | 10 | Permitir avaliação real |
| Básico (era Starter) | R$ 250 | R$ 59 | 50 | 50 | Abaixo do eNotas (R$ 137), acima do AquiNotas (R$ 39,90) |
| Pro (era Professional) | R$ 400 | R$ 129 | 200 | 200 | Alinhado ao Focus NFe; diferencial é Asaas + retenção |
| Business (era Enterprise) | R$ 999 | R$ 299 | ∞ | ∞ | Competitivo vs. Spedy Pro (R$ 207) e eNotas Pro (R$ 347) |

### Posicionamento de preço sugerido

```
R$ 0      →  R$ 59/mês  →  R$ 129/mês  →  R$ 299/mês
Gratuito      Básico          Pro           Business
10 notas    50 notas       200 notas      Ilimitadas

         Freelancer       PJ organizada    Escritório/SaaS
         autônomo         e-commerce       multi-cliente
```

### MRR Potencial (base hipotética de 1.000 clientes, distribuição freemium típica 70/20/8/2)

| Plano | Clientes | Preço | MRR |
|-------|----------|-------|-----|
| Gratuito | 700 | R$ 0 | R$ 0 |
| Básico | 200 | R$ 59 | R$ 11.800 |
| Pro | 80 | R$ 129 | R$ 10.320 |
| Business | 20 | R$ 299 | R$ 5.980 |
| **Total** | **1.000** | — | **R$ 28.100/mês** |

---

## 6. Estratégia de Preços — Penetração vs. Definitivo

### Conclusão: os R$ 59 / R$ 129 / R$ 299 são preços permanentes, não de penetração.

**Por que não cobrar barato e aumentar depois:**
- Clientes ancoram no preço inicial — resistem a qualquer aumento
- Preço baixo atrai público sensível a preço, que cancela na primeira alternativa
- Aumentar preço em SaaS é extremamente difícil e gera churn e reação negativa
- Os preços sugeridos já são competitivos com o mercado — não há razão para ir abaixo

**O que funciona como estratégia de lançamento:**

Desconto de fundador com prazo e limite claro:

```
Plano Básico — R$ 59/mês
Oferta de lançamento: R$ 39/mês para os primeiros 100 clientes.
Preço garantido para sempre enquanto mantiver a assinatura.
```

Benefícios desta abordagem:
- O preço real (R$ 59) fica visível desde o início — sem distorção de percepção de valor
- Early adopters são recompensados com exclusividade real
- Novos clientes após o limite pagam o preço cheio sem reclamação
- Quem entrou no desconto tem incentivo para não cancelar (perderia o benefício)

**Regras para aumento de preço futuro (se/quando necessário):**
- Grandfathering obrigatório: quem já assina mantém o preço atual para sempre
- Aumentar só para planos novos ou novos clientes
- Só aumentar quando adicionar features concretas que justifiquem o novo valor

---

## 7. Funcionalidades com Maior Gap vs. Concorrentes

### Alta Prioridade
1. **Emissão em lote via planilha (CSV/Excel)** — NFe.io, Spedy, eNotas têm; AutoNF não
2. **Integrações adicionais** — Spedy tem 70+; AutoNF tem Asaas; faltam Stripe, Mercado Pago, Hotmart, Kiwify
3. **Cancelamento automático por estorno/reembolso** — eNotas e Spedy fazem; AutoNF não
4. **Relatório de impostos retidos exportável** — AutoNF calcula mas não exporta por período

### Média Prioridade
5. **Importação retroativa** — regularizar notas de meses anteriores
6. **Dashboard financeiro simples** — resumo de receita a partir das notas emitidas
7. **Envio automático de XML/PDF ao tomador** — confirmar se já existe

### Diferenciação Competitiva
8. **Programa de parceiros/afiliados** — Spedy paga 20% recorrente para contadores
9. **Plano contador (multi-CNPJ a preço de atacado)** — canal de aquisição via escritórios contábeis
10. **Webhook com retry automático + HMAC** — maturidade técnica e segurança

---

## 8. Oportunidades Identificadas

1. **Migração da Nuvem Fiscal** — encerrando jul/2026; criar landing page de migração
2. **Onda regulatória 2026** — NFS-e obrigatória em padrão nacional; demanda orgânica agora
3. **MEIs em 2027** — 15,7 milhões de MEIs entrarão na obrigatoriedade; capturar com plano grátis
4. **Infoprodutores sem ERP** — Conta Azul (R$ 159+) é caro demais para quem emite 5 notas/mês
5. **Canal de contadores** — 1 contador traz dezenas de clientes; programa de parceiros multiplica base

---

## Pendências para Discussão

- [ ] Atualizar `scripts/seed-plans.mjs` com os novos preços e limites
- [ ] Definir nome final dos planos (Básico/Pro/Business ou outro)
- [ ] Decidir se vai ter desconto de fundador e qual o limite de clientes
- [ ] Avaliar adicionar plano anual com desconto (10–20%)
- [ ] Definir quais integrações priorizar além do Asaas
- [ ] Avaliar programa de afiliados/parceiros para contadores
