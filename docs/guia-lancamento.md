# Guia de Lançamento — AutoNF

> Atualizado em: 2026-05-24

---

## Ferramentas Instaladas (globais, disponíveis em todos os projetos)

Skills instaladas em `~/.claude/` via [ekinciio/saas-growth-marketing-skills](https://github.com/ekinciio/saas-growth-marketing-skills).

---

## Sequência Recomendada de Lançamento

### Fase 1 — Pré-lançamento (4–6 semanas antes)

**1. Auditar a landing page**
```
/landing-page-cro audit https://autonf.com.br
/saas-landing-builder review https://autonf.com.br
/geo-seo-auditor audit https://autonf.com.br
```

**2. Analisar concorrentes**
```
/competitor-intel analyze https://spedy.com.br
/competitor-intel analyze https://enotass.com.br
/competitor-intel analyze https://aquinotas.com.br
```

**3. Validar estratégia de preços**
```
/pricing-analyzer audit
```
> Usar os dados do arquivo `docs/analise-mercado-e-precos.md` como input.

**4. Mapear oportunidades de aquisição**
```
/reddit-opportunity-finder search "nota fiscal serviço freelancer"
/reddit-opportunity-finder search "NFS-e MEI emissão"
/reddit-opportunity-finder search "emitir nota fiscal autônomo"
```

**5. Monitorar menções de concorrentes**
```
/brand-mention-scanner scan "spedy"
/brand-mention-scanner scan "enotas"
/brand-mention-scanner scan "nota fiscal serviço"
```

---

### Fase 2 — Lançamento

**Gerar playbook completo de lançamento**
```
/launch-planner
```

**Auditoria completa de crescimento**
```
/growth-strategist
```

**Análise do funil PLG**
```
/plg-funnel-analyzer audit
```

**Otimizar onboarding**
```
/onboarding-optimizer audit
```

---

### Fase 3 — Pós-lançamento (primeiras 4 semanas)

**Monitorar saúde das métricas**
```
/subscription-metrics calculate
/metrics-analyst
```

**Diagnóstico de retenção**
```
/retention-playbook diagnose
```

**Analisar reviews e feedback**
```
/review-sentiment analyze
```

**Auditoria do app em crescimento**
```
/web-app-growth-engine audit https://autonf.com.br
```

---

## Canais de Distribuição para o AutoNF

Com base na pesquisa de mercado (ver `docs/analise-mercado-e-precos.md`):

### Canais Prioritários (escolher 2 e postar 3–5x/semana)
- **LinkedIn** — conteúdo sobre obrigatoriedade NFS-e 2026, dicas fiscais para freelancers
- **Instagram/TikTok** — demos rápidos do produto, dores do público (emitir nota é chato)
- **Reddit** — r/brasil, r/empreendedorismo, r/freelancers, r/programacao

### Canais de Aquisição Orgânica
- **Google** — SEO para "emitir NFS-e", "nota fiscal autônomo", "NFS-e MEI automático"
- **Product Hunt** — lançamento coordenado com comunidade
- **IndieHackers** — build in public, compartilhar métricas reais
- **Grupos do WhatsApp/Telegram** — comunidades de freelancers, designers, devs PJ

### Canal via Contadores (alto potencial)
- Abordar escritórios contábeis com proposta de parceria
- Oferecer desconto ou comissão (ver `/pricing-analyzer audit` para modelar)
- 1 contador pode trazer 20–50 clientes de uma vez

---

## Estratégia de Oferta de Lançamento

```
Plano Básico — R$ 59/mês
Oferta de fundador: R$ 39/mês para os primeiros 100 clientes.
Preço garantido para sempre enquanto mantiver a assinatura.
```

- Exibir contador de vagas na landing page (ex: "67 de 100 vagas restantes")
- Criar lista de espera antes do lançamento público
- E-mail de boas-vindas personalizado para cada fundador

---

## Diretórios para Cadastrar o AutoNF

Listings gratuitos que geram tráfego e backlinks:

- Product Hunt
- AlternativeTo (cadastrar como alternativa ao eNotas, Spedy, Conta Azul)
- G2 / Capterra
- Softonic BR
- Promobit
- AppSumo (avaliar deal de lançamento)
- StartupBase (comunidade BR)
- Pequenas Empresas & Grandes Negócios
- Sebrae digital (verificar programa de parceiros)

---

## Referências e Repositórios

- [ekinciio/saas-growth-marketing-skills](https://github.com/ekinciio/saas-growth-marketing-skills) — skills instaladas
- [Gingiris/gingiris-b2b-growth](https://github.com/Gingiris/gingiris-b2b-growth) — playbook PLG → $10M ARR
- [EdoStra/Marketing-for-Founders](https://github.com/EdoStra/Marketing-for-Founders) — primeiros 10 → 1.000 usuários
- [brandonhimpfen/awesome-saas](https://github.com/brandonhimpfen/awesome-saas) — ferramentas e recursos SaaS
- Análise de mercado detalhada: `docs/analise-mercado-e-precos.md`
