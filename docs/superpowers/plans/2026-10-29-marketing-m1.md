# Marketing M1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saber de onde veio cada contato (site/widget, link de WhatsApp rastreado, anúncio da Meta, Hotmart, manual), congelar a origem no negócio, lançar custo à mão e mostrar CPL, CAC, ROAS e % com origem na aba Marketing.

**Spec:** `docs/superpowers/specs/2026-10-29-marketing-origem-design.md` (documento-mãe: `docs/superpowers/plans/2026-10-18-marketing-integracoes-roadmap.md`).

**Architecture:** Regras puras em `src/lib/marketing/touch.ts` (testadas). Um serviço `src/lib/server/marketing.ts` grava toques, liga `ref: CODE`, calcula a atribuição do negócio e monta o resumo. A captação entra num ponto só, o `syncContact` do motor (`flow-engine.ts`), que já roda em toda mensagem que chega de qualquer canal: recebe `input.touch` (widget, referral da Meta) e procura `ref: CODE` no texto. `createDeal` congela a origem; um toque gravado depois (mesma rodada da conversa) completa negócios recentes sem origem.

**Tech Stack:** Next.js (App Router, route handlers), Prisma 7 + Postgres (Supabase), Vitest.

## Ajuste em relação à spec

- **Origem do negócio numa tabela própria** (`eva_studio_deal_origins`: `dealId` PK, `touchpointId`, `firstTouchpointId`) em vez de duas colunas em `eva_studio_deals`. Motivo: o modelo `Deal` lê todas as colunas em todo `create/update/findUnique` sem `select`; coluna nova no schema antes do SQL aplicado derruba o quadro inteiro. O repo já segue essa regra (comentário em `Deal`: "Só relações, nenhuma coluna nova"). O efeito para quem usa é o mesmo.
- **Visita do site com código próprio**: o widget reescreve os links `wa.me` do site com `ref: CODE` de 8 letras, criado em `eva_studio_link_clicks` (linha com `code`, `linkId` nulo, UTMs em `raw`). A entrada de mensagem procura o código primeiro nos links, depois nas visitas.
- **Lead** = contato cujo primeiro toque cai no período, contado pela origem desse primeiro toque. **Negócio** = criado no período, pela origem congelada. **Venda/receita** = negócio ganho (`closedAt` no período, etapa `won`) + venda Hotmart aprovada no período que não pertence a um negócio já contado.

## Files

- Create `prisma/sql/2026-11-05-marketing.sql`; modify `prisma/schema.prisma` (4 modelos + relações).
- Create `src/lib/marketing/touch.ts` + `touch.test.ts` (regras puras).
- Create `src/lib/server/marketing.ts` + `marketing.test.ts` (gravar toque, `ref:`, atribuição, resumo).
- Modify `src/lib/server/crm.ts` (`createDeal` congela).
- Modify `src/lib/server/flow-engine.ts` (`AdvanceInput.touch`, chamada no `syncContact`).
- Create `src/app/w/[code]/route.ts` + `route.test.ts` (link rastreado).
- Modify `src/app/api/widget/[agentId]/script.js/route.ts`, `.../message/route.ts`; create `.../visit/route.ts`.
- Modify `src/app/api/webhooks/meta/route.ts` (referral).
- Modify `src/lib/server/hotmart/apply.ts`; create `scripts/backfill-hotmart-touches.mjs`.
- Modify `worker/index.js` (spike: só log).
- Create `src/app/api/marketing/{summary,spend,spend/[id],links,links/[id]}/route.ts`, `src/app/api/contacts/[id]/origin/route.ts`.
- Create `src/app/(app)/[contrato]/marketing/page.tsx`; modify `sidebar.tsx`, `rotas.ts`, `busca/grupos.ts`, `permissoes/catalogo.ts`.
- Modify `src/lib/report-query.ts`, `src/lib/server/report-sql.ts` (fonte `touchpoints`, campos de origem no negócio).
- Modify `src/app/privacy/page.tsx` (uma linha LGPD).

---

### Task 1: Regras puras

**Files:** Create `src/lib/marketing/touch.ts`, `src/lib/marketing/touch.test.ts`

- [ ] **Step 1: testes**

```ts
import { describe, expect, it } from "vitest";
import { extractRef, firstTouch, isPaid, newCode, normalizeUtm, pickTouchpoint, spendFor, touchFromMetaReferral, waUrl } from "./touch";

describe("normalizeUtm", () => {
  it("minúsculas, trim, vazio vira null, corta em 200", () => {
    expect(normalizeUtm("  Facebook ")).toBe("facebook");
    expect(normalizeUtm("   ")).toBeNull();
    expect(normalizeUtm(3)).toBeNull();
    expect(normalizeUtm("a".repeat(300))?.length).toBe(200);
  });
});

describe("isPaid", () => {
  it("id de clique ou de anúncio é pago", () => {
    expect(isPaid({ gclid: "x" })).toBe(true);
    expect(isPaid({ ctwaClid: "x" })).toBe(true);
    expect(isPaid({ adId: "1" })).toBe(true);
  });
  it("utm_medium pago", () => {
    expect(isPaid({ utmMedium: "cpc" })).toBe(true);
    expect(isPaid({ utmMedium: "paid_social" })).toBe(true);
    expect(isPaid({ utmMedium: "email" })).toBe(false);
    expect(isPaid({})).toBe(false);
  });
});

describe("pickTouchpoint", () => {
  const t = (id: string, at: string, paid: boolean) => ({ id, at: new Date(at), paid });
  const criado = new Date("2026-10-10T12:00:00Z");
  it("último pago antes da criação", () => {
    expect(pickTouchpoint([t("a", "2026-10-01", true), t("b", "2026-10-05", false), t("c", "2026-10-11", true)], criado)).toBe("a");
  });
  it("sem pago, o último antes da criação", () => {
    expect(pickTouchpoint([t("a", "2026-10-01", false), t("b", "2026-10-05", false)], criado)).toBe("b");
  });
  it("nada antes da criação: null", () => {
    expect(pickTouchpoint([t("a", "2026-10-11", true)], criado)).toBeNull();
  });
  it("firstTouch é o mais antigo", () => {
    expect(firstTouch([t("b", "2026-10-05", false), t("a", "2026-10-01", true)])).toBe("a");
    expect(firstTouch([])).toBeNull();
  });
});

describe("spendFor", () => {
  const s = { source: "facebook", campaign: "bf", from: "2026-10-01", to: "2026-10-10", amountCents: 1000 };
  it("janela cobre tudo", () => expect(spendFor([s], "facebook", "bf", "2026-09-01", "2026-10-31")).toBe(1000));
  it("rateia por dia", () => expect(spendFor([s], "facebook", "bf", "2026-10-06", "2026-10-31")).toBe(500));
  it("fora da janela ou de outra campanha: 0", () => {
    expect(spendFor([s], "facebook", "bf", "2026-11-01", "2026-11-30")).toBe(0);
    expect(spendFor([s], "facebook", "", "2026-10-01", "2026-10-31")).toBe(0);
  });
});

describe("ref e links", () => {
  it("acha o código no texto", () => {
    expect(extractRef("Olá! Quero saber mais (ref: ABC234)")).toBe("ABC234");
    expect(extractRef("ref:abcd2345 oi")).toBe("ABCD2345");
    expect(extractRef("sem código")).toBeNull();
  });
  it("código novo só com letras não ambíguas", () => {
    expect(newCode(6)).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });
  it("monta o wa.me com a mensagem e o código", () => {
    expect(waUrl("55 (11) 99999-0000", "Oi", "ABC234")).toBe("https://wa.me/5511999990000?text=Oi%20(ref%3A%20ABC234)");
  });
});

describe("touchFromMetaReferral", () => {
  it("anúncio que leva ao WhatsApp é pago", () => {
    const t = touchFromMetaReferral("whatsapp_meta", { source_id: "123", source_type: "ad", source_url: "https://fb.me/x", ctwa_clid: "C" });
    expect(t).toMatchObject({ channel: "ad_whatsapp", adId: "123", ctwaClid: "C", utmSource: "facebook", paid: true });
  });
  it("Messenger/Instagram com ad_id", () => {
    expect(touchFromMetaReferral("instagram", { ad_id: "9", source: "ADS" })).toMatchObject({ channel: "ad_instagram", adId: "9", utmSource: "instagram" });
    expect(touchFromMetaReferral("messenger", { ad_id: "9" })).toMatchObject({ channel: "ad_messenger" });
  });
  it("sem anúncio, nada", () => expect(touchFromMetaReferral("instagram", undefined)).toBeNull());
});
```

- [ ] **Step 2:** `rtk vitest run src/lib/marketing` → FAIL (módulo não existe).
- [ ] **Step 3: implementação** — `src/lib/marketing/touch.ts` com: `TOUCH_CHANNELS`, `TouchInput` (todos os campos opcionais da spec + `channel`, `at`, `paid`, `raw`), `normalizeUtm`, `cleanTouch` (normaliza UTMs; outros textos trim + corte 500), `isPaid`, `pickTouchpoint`, `firstTouch`, `spendFor` (dias inclusivos, `Math.round`), `CODE_ALPHABET`, `newCode(len)`, `extractRef` (`/\bref:\s*([A-Z2-9]{6,8})\b/i`), `waUrl(phone, message, code)` (só dígitos; texto `"<mensagem> (ref: CODE)"` com `encodeURIComponent`), `touchFromMetaReferral(channel, referral)`.
- [ ] **Step 4:** `rtk vitest run src/lib/marketing` → PASS.
- [ ] **Step 5:** commit `feat(marketing): regras puras de origem`.

### Task 2: SQL e schema

**Files:** Create `prisma/sql/2026-11-05-marketing.sql`; modify `prisma/schema.prisma`.

- [ ] **Step 1:** SQL aditivo numa transação, padrão de `2026-11-04-google-calendar.sql`:
  - `eva_studio_touchpoints` (`id, orgId FK org cascade, contactId FK contact cascade, at, channel, paid, utmSource..utmId, gclid, gbraid, wbraid, fbclid, fbc, fbp, ctwaClid, adId, linkId, landingUrl, referrer, raw JSONB, createdAt`), índices `(orgId, contactId, at)` e `(orgId, utmSource, utmCampaign)`.
  - `eva_studio_tracked_links` (`id, orgId FK, code UNIQUE, name, agentId NULL, phone, message, utm*, clicks INT 0, archivedAt, createdAt, updatedAt`), índice `(orgId)`.
  - `eva_studio_link_clicks` (`id, orgId FK, linkId NULL FK links cascade, code UNIQUE NULL, at, gclid, fbclid, referrer, ipHash, raw JSONB, matchedContactId NULL`), índice `(linkId, at)`.
  - `eva_studio_marketing_spend` (`id, orgId FK, source, campaign '' , from DATE, to DATE, amountCents INT, note, createdBy, createdAt, updatedAt`), índice `(orgId, source, campaign)`.
  - `eva_studio_deal_origins` (`dealId PK FK deals cascade, orgId, touchpointId NULL FK touchpoints SET NULL, firstTouchpointId NULL FK SET NULL, createdAt`), índice `(orgId)`.
  - `ENABLE ROW LEVEL SECURITY` nas cinco.
- [ ] **Step 2:** modelos `Touchpoint`, `TrackedLink`, `LinkClick`, `MarketingSpend`, `DealOrigin` no `schema.prisma` + relações (`Organization`, `Contact.touchpoints`, `Deal.origin`). `rtk npx prisma generate`.
- [ ] **Step 3:** **Mostrar o SQL ao usuário e esperar OK explícito antes de rodar** (banco de produção).
- [ ] **Step 4:** commit `feat(marketing): tabelas de origem, links, cliques, custo`.

### Task 3: Serviço de marketing + createDeal

**Files:** Create `src/lib/server/marketing.ts`, `marketing.test.ts`; modify `src/lib/server/crm.ts`.

- [ ] **Step 1: testes** (prisma mockado como em `crm.stage-events.test.ts`):
  - `recordTouch` não duplica o mesmo toque (mesmo canal + chave) em 24 h;
  - `recordInboundTouches` com `ref: CODE` de link do contrato grava `whatsapp_link` com as UTMs do link e liga o último clique sem contato; código de outro contrato não grava;
  - `dealAttribution` escolhe último pago ≤ criação e o primeiro toque;
  - `createDeal` grava `DealOrigin` quando o contato tem toque, e não falha se a tabela der erro.
- [ ] **Step 2:** FAIL. **Step 3:** implementar:

```ts
export async function recordTouch(orgId: string, contactId: string, input: TouchInput): Promise<string | null>
export async function recordInboundTouches(a: { orgId: string; contactId: string; text?: string; touch?: TouchInput; at: Date }): Promise<void>
export async function dealAttribution(contactId: string, createdAt: Date): Promise<{ touchpointId: string | null; firstTouchpointId: string | null }>
export async function attachRecentDeals(orgId: string, contactId: string, since: Date): Promise<void> // negócios do contato sem origem criados depois de `since`
export async function marketingSummary(orgId: string, de: string, ate: string): Promise<MarketingSummary>
```

  Em `createDeal`, depois do `prisma.deal.create`: se `input.contactId`, `dealAttribution` e `prisma.dealOrigin.create`, tudo em `try/catch` (origem nunca derruba a criação).
- [ ] **Step 4:** PASS. **Step 5:** commit.

### Task 4: Captação — motor, widget, link rastreado, Meta, Hotmart, Baileys

- [ ] `AdvanceInput.touch?: TouchInput`; em `avancarConversa` guarda `recebidaEm = new Date()` e no `syncContact`, quando `isInbound && contactId`, chama `recordInboundTouches({ orgId: agent.orgId, contactId, text: input.text, touch: input.touch, at: recebidaEm })` em `try/catch`.
- [ ] `GET /w/[code]` (`src/app/w/[code]/route.ts`): limite 30/min por IP+código (`checkRateLimit`); link desconhecido/arquivado → 404; grava `LinkClick` (`ipHash` = sha256 de `ip + code`), `clicks + 1`, 302 para `waUrl`. Teste com prisma mockado: 404, clique gravado, `Location` certo.
- [ ] Widget: `script.js` lê `utm_*`, `gclid/gbraid/wbraid/fbclid`, cookies `_fbp/_fbc`, `document.referrer`, `location.href`; guarda `{first,last}` em `localStorage` (90 dias); na 1ª mensagem da página manda `touch: last`. Links `a[href*="wa.me"], a[href*="api.whatsapp.com"]` com toque guardado: `POST /api/widget/[agentId]/visit` devolve `code` (8 letras, `LinkClick` com `raw`), reescreve `?text=` com `(ref: CODE)`. A rota `message` valida `body.touch` (objeto, strings ≤ 500) e passa como `touch: { ...cleanTouch(body.touch), channel: "site" }`.
- [ ] Meta: `referral` em `MetaMessage`, `MessengerEvent` (`referral`, `message.referral`, `postback.referral`) e `InstagramMessagingEvent`; passa `touch: touchFromMetaReferral(...) ?? undefined`.
- [ ] Hotmart: em `applyEvent`, depois de ter `contactId` e antes do negócio, se `n.sale.src || n.sale.sck` e o contato não tem toque `hotmart` com esse par: `recordTouch` (`utmSource = src`, `utmCampaign = sck`, `at = orderedAt ?? evento`). Script `scripts/backfill-hotmart-touches.mjs` (`--dry-run` padrão; `--apply` grava) para as vendas já na tabela. Rodar só com OK.
- [ ] Baileys (spike): em `worker/index.js`, se a mensagem tem `contextInfo.externalAdReply` ou `conversionSource`, `console.log("[spike-anuncio]", JSON.stringify({ externalAdReply, conversionSource, conversionData }))`. Não grava toque.
- [ ] Commit por item.

### Task 5: APIs, permissão e aba Marketing

- [ ] Catálogo: módulo `{ id: "marketing", nome: "Marketing", acoes: ["ver", "editar"] }`; `marketing:editar` em `EXTRAS_DO_PAPEL` de owner/admin (`marketing:ver` entra no pacote `read`). Ajustar testes de catálogo se listarem as permissões.
- [ ] Rotas: `GET /api/marketing/summary?de&ate` (ver); `GET/POST /api/marketing/spend`, `PATCH/DELETE /api/marketing/spend/[id]` (editar; validação: fonte obrigatória, datas `YYYY-MM-DD`, `from ≤ to`, valor > 0); `GET/POST /api/marketing/links`, `PATCH /api/marketing/links/[id]` (arquivar/renomear); `POST /api/contacts/[id]/origin` (`contatos:editar`, toque `manual`; com `dealId` também troca a origem do negócio).
- [ ] Tela `/[contrato]/marketing`: período (`SeletorDePeriodo` + URL), Resumo, Por origem e campanha (linha abre a lista de negócios), Investimento, Links rastreados, Instalar no site. Sidebar ("Dados"), `SECOES_DO_CONTRATO`, `PAGINAS` da busca.
- [ ] Ficha do contato e do negócio: campo "Origem" (Indicação, Evento, Orgânico, Outro + campanha) que chama a rota de origem.
- [ ] Commit.

### Task 6: Construtor de relatórios

- [ ] `report-query.ts`: dataset `touchpoints` (grupo "Vendas"; campos `channel, paid, source, medium, campaign, content, ad_id, link, contact_name, at`) e, em `deals`, `origin_channel, origin_source, origin_campaign, origin_paid`.
- [ ] `report-sql.ts`: `touchpoints` com `JOIN eva_studio_contacts`; `deals` com `LEFT JOIN eva_studio_deal_origins dor ON dor."dealId" = d.id LEFT JOIN eva_studio_touchpoints dtp ON dtp.id = dor."touchpointId"`.
- [ ] Rodar os testes do construtor (eles conferem que todo campo do catálogo tem SQL).
- [ ] Commit.

### Task 7: Verificação e entrega

- [ ] `rtk tsc`, `rtk vitest run` verdes; `graphify update .`.
- [ ] Linha sobre origem de marketing em `/privacy`.
- [ ] Localhost no contrato `2fa233e2` (dados `[TESTE CLAUDE]`): criar link → abrir `/w/CODE` → mensagem simulada com `ref:` → negócio → ganho → custo → aba mostra CPL, CAC, ROAS e %. Apagar tudo no fim. Não chamar `/api/internal/scheduler` (banco de produção).
- [ ] PR em `matheusflytech/eva-studio`; merge só com OK.
