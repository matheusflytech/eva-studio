# Marketing M2 (Meta Ads) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O gasto da Meta Ads entra sozinho na aba Marketing (CPL, CAC, ROAS sem digitar).

**Spec:** `docs/superpowers/specs/2026-10-29-marketing-m2-meta-ads-design.md`

**Architecture:** Regras puras em `src/lib/marketing/meta-ads.ts` (linha do insights → centavos/leads, janela de sincronização, `signed_request`). Cliente da Graph e sincronização em `src/lib/server/marketing/meta-ads.ts` (único lugar que decifra o token). OAuth em `/api/marketing/meta/{start,callback}`. O relógio chama `syncDueMetaAccounts`. `marketingSummary` soma o gasto importado e liga toques por `adId`/`utm_id`.

**Tech Stack:** Next.js route handlers, Prisma 7, fetch puro na Graph v21, Vitest com Meta falsa (`META_GRAPH_URL`).

### Task 1: Regras puras
- [ ] Testes em `src/lib/marketing/meta-ads.test.ts`: `parseInsightRow` (spend "12.34" → 1234; leads e conversas de `actions`; sem `ad_id` → null), `syncWindow` (primeira vez 30 dias; depois `syncedThrough - 2`), `parseSignedRequest` (assinatura certa devolve `user_id`; errada → null), `metaCampaignKey`.
- [ ] Implementar; `rtk vitest run src/lib/marketing` verde; commit.

### Task 2: SQL + schema
- [ ] `prisma/sql/2026-11-06-meta-ads.sql` (3 tabelas, RLS) + modelos `MarketingConnection`, `MarketingAccount`, `AdDailyMetric`; `prisma generate`.
- [ ] Mostrar o SQL ao usuário e esperar OK antes de rodar.

### Task 3: Servidor Meta
- [ ] `src/lib/server/marketing/meta-ads.ts`: `metaAdsApp()`, `loginUrl()`, `connectFromCode()` (troca code, `debug_token`, token longo se for de usuário, `/me`, `/me/adaccounts`, grava conexão + contas desligadas), `syncAccount()`, `syncDueMetaAccounts()`, `disconnect()`, `deleteImported()`. Erro 190 → `needs_reauth`.
- [ ] Teste com `fetch` falso: conexão grava token cifrado e contas; sincronização faz upsert por (conta, dia, anúncio) e pagina; 190 marca `needs_reauth`.
- [ ] Commit.

### Task 4: Rotas
- [ ] `GET /api/marketing/meta/start` e `/callback` (cookie httpOnly com state, uso único, `marketing:editar`).
- [ ] `GET/PATCH /api/marketing/meta` (status + contas; ligar/desligar conta), `POST /api/marketing/meta/sync`, `DELETE /api/marketing/meta` (desconectar; `?data=1` apaga métricas).
- [ ] `POST /api/marketing/meta/deauthorize` e `/data-deletion` (signed_request).
- [ ] Passo no relógio (`/api/internal/scheduler`) com orçamento de tempo.
- [ ] Commit.

### Task 5: Resumo e tela
- [ ] `marketingSummary`: gasto da Meta por `facebook` + campanha; toque com `adId`/`utmId` importado cai na linha da campanha. Teste.
- [ ] Aba: seção "Meta Ads"; "Outros investimentos" com formulário atrás de "Lançar à mão".
- [ ] Commit.

### Task 6: Verificação
- [ ] `rtk tsc`, `rtk vitest run`, `graphify update .`.
- [ ] Localhost com Meta falsa no contrato `2fa233e2`, dados `[TESTE CLAUDE]` apagados no fim.
- [ ] PR empilhado sobre o da M1.
