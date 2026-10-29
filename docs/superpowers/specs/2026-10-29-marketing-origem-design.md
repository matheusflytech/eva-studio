# Marketing M1 — origem de cada contato, custo à mão e aba Marketing

> Documento-mãe: `docs/superpowers/plans/2026-10-18-marketing-integracoes-roadmap.md`
> (seções 3 e 4). Esta spec é a fase **M1** de lá, com dois ajustes do usuário
> em 29/10: custo lançado à mão (antes de conectar Meta/Google Ads) e origem
> vinda das vendas da Hotmart.

## Objetivo

Responder, por origem e por campanha, sem conta de anúncio conectada:
**quantos leads, negócios, vendas e quanto de receita** cada origem trouxe,
**quanto custou** (valor lançado à mão), e daí **custo por lead, custo por
venda (CAC) e ROAS**. Sempre mostrar **"% dos negócios com origem
conhecida"**, senão o ROAS engana.

## Decisões (29/10)

- Origens da M1: **site + widget**, **link de WhatsApp rastreado**,
  **anúncio → WhatsApp/Instagram** (referral) e **vendas da Hotmart** (src/sck).
- Custo: **lançado à mão** (campanha, período, valor). Meta/Google Ads
  conectados (M2/M3) preenchem a mesma conta depois.
- Atribuição: **último toque pago antes da criação do negócio**; sem toque
  pago, o último toque. Congelado no negócio (mudar a regra não reescreve o
  passado). O painel também mostra o primeiro toque.

## Modelo de dados (SQL aditivo, só com OK)

1. `eva_studio_touchpoints` — um por vez que se sabe de onde o contato veio:
   `orgId, contactId, at, channel` (`site | whatsapp_link | ad_whatsapp |
   ad_instagram | ad_messenger | hotmart | manual`), `paid` (bool),
   `utmSource, utmMedium, utmCampaign, utmContent, utmTerm, utmId` (minúsculas,
   sem espaço nas pontas), `gclid, gbraid, wbraid, fbclid, fbc, fbp, ctwaClid`,
   `adId, linkId, landingUrl, referrer, raw` (JSON). Índices `(orgId,
   contactId, at)` e `(orgId, utmSource, utmCampaign)`.
2. `eva_studio_tracked_links` — `orgId, code` (único, 6 letras sem
   ambíguas), `name`, `agentId` (número do WhatsApp do agente) ou `phone`,
   `message` (texto inicial), `utm*`, `clicks`, `archivedAt`.
3. `eva_studio_link_clicks` — `linkId, at, gclid, fbclid, referrer, ipHash`
   (sem IP puro), `matchedContactId`.
4. `eva_studio_marketing_spend` — custo à mão: `orgId, source` (utm_source
   normalizado, ex. `facebook`, `google`, `instagram`), `campaign` (utm_campaign
   normalizado, vazio = a fonte toda), `from, to` (datas), `amountCents`,
   `note`, `createdBy`.
5. `eva_studio_deals.touchpointId` (nulo) e `firstTouchpointId` (nulo).

Apagar contato apaga os toques (cascade). RLS ligado como as outras.

## Regras puras (`src/lib/marketing/`, testadas)

- `normalizeUtm(params)`: minúsculas, trim, vazio→null, tamanho máximo 200.
- `isPaid(t)`: tem `gclid/gbraid/wbraid/fbclid/ctwaClid/adId`, ou
  `utm_medium` em `cpc, ppc, paid, paid_social, paidsocial, ads, display,
  cpm`; Hotmart com `src` de anúncio idem pela mesma regra.
- `pickTouchpoint(touches, dealCreatedAt)`: último pago com `at <=
  criação`; senão último; senão null. `firstTouch(touches)`.
- `spendFor(spends, source, campaign, de, ate)`: rateia por dia quando o
  período do lançamento cruza a janela do painel.

## Captação

1. **Site + widget.** O `script.js` do widget (`src/app/api/widget/[agentId]/script.js/route.ts`)
   lê `utm_*`, `gclid/gbraid/wbraid/fbclid`, cookies `_fbp/_fbc`, `referrer`
   e página de entrada; guarda em `localStorage` (primeiro e último toque, 90
   dias) e manda junto na 1ª mensagem (`/api/widget/[agentId]/message`), que
   grava o toque `site`. O script também reescreve os links `wa.me` da página
   para levar o código do toque (mesmo mecanismo do item 2), assim quem sai do
   site para o WhatsApp não perde a origem.
2. **Link de WhatsApp rastreado.** Rota pública `GET /w/[code]`: grava o
   clique (limite de taxa por IP), redireciona para
   `wa.me/<numero>?text=<mensagem> (ref: CODE)`. Na entrada de mensagem
   (WhatsApp QR e oficial), se o texto da 1ª mensagem do contato tiver
   `ref: CODE` de um link do contrato, grava o toque `whatsapp_link` com as
   UTMs do link e liga o último clique sem contato. O `ref:` não é removido
   da mensagem (o histórico mostra o que o cliente mandou).
3. **Anúncio → WhatsApp/Instagram/Messenger.** No `webhooks/meta`: ler
   `referral` (`source_id`/`ad_id`, `source_type`, `source_url`, `headline`,
   `ctwa_clid`, `ref`) da 1ª mensagem e gravar toque pago `ad_*`. No worker
   Baileys: **spike** — logar `contextInfo.externalAdReply` e
   `conversionSource` de um clique real; só gravar toque depois de ver o
   formato. Hoje ninguém lê `referral`.
4. **Hotmart.** `applyEvent` (F1) grava toque `hotmart` com `utmSource = src`,
   `utmCampaign = sck` quando a venda tem `src/sck` e o contato ainda não tem
   toque desse par. Script único para as vendas já na tabela `eva_studio_sales`.
5. **Manual.** No contato e no negócio, "Origem" editável (lista: Indicação,
   Evento, Orgânico, Outro + campanha livre) grava toque `manual`.

**Negócio novo:** `createDeal` calcula `touchpointId`/`firstTouchpointId`
pelos toques do contato principal. Contato sem toque fica sem origem
(entra no "% sem origem").

## Aba Marketing (`/[contrato]/marketing`)

Item novo na barra lateral (permissão nova `marketing.ver` / `marketing.editar`
no catálogo de permissões; admin tem as duas).

1. **Resumo** do período (filtro de datas igual ao Dashboard): investimento,
   leads, negócios, vendas, receita, CPL, CAC, ROAS, % com origem conhecida.
2. **Por origem e campanha** (tabela): fonte, campanha, investimento, leads,
   negócios, ganhos, receita, CPL, CAC, ROAS. Clique abre os contatos/negócios.
   Receita = negócios ganhos no período com aquela origem + vendas da Hotmart
   aprovadas no período ligadas ao contato.
3. **Investimento** — lançar/editar/apagar: fonte, campanha (sugestões das
   UTMs já vistas), período, valor.
4. **Links rastreados** — criar (nome, número/agente, mensagem, UTMs),
   copiar, ver cliques e contatos, arquivar.
5. **Instalar no site** — o snippet do widget já leva a captura; texto curto
   com os modelos de URL para Meta (`utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_content={{ad.id}}`)
   e Google (`utm_source=google&utm_medium=cpc&utm_campaign={campaignid}`).

**Relatórios/Dashboard:** fontes novas no construtor (`report-query.ts` +
`report-sql.ts`): `touchpoints` (cada toque) e campos de origem no negócio
(`origin_channel`, `origin_source`, `origin_campaign`, `origin_paid`), para
montar cartões por origem como os de Vendas.

## Fora da M1

Conectar Meta/Google Ads (M2/M3), Lead Ads (M4), devolver conversões (M5),
GA4 (M6), campanhas de e-mail e disparos (fase própria depois), formulários
do site (a Eva não tem formulário hoje).

## Riscos e cuidados

- **Privacidade (LGPD):** identificadores de clique e página de entrada são
  dados pessoais; IP só como hash; a política em `/privacy` ganha uma linha
  sobre origem de marketing. Nada é enviado para fora (só lemos).
- Baileys pode não trazer o id do anúncio (spike antes de prometer).
- `ref: CODE` visível na mensagem do cliente: é o preço de rastrear WhatsApp
  sem anúncio; o texto padrão deixa isso discreto.
- Custo à mão casa com UTM por nome: campanha com nome diferente entre
  lançamento e link não junta. A tela sugere os nomes já vistos.

## Testes

- Unitários das regras puras (normalizar, pago, escolha do toque, rateio).
- Rota `/w/[code]`: código desconhecido 404, clique gravado, redireciono certo.
- Entrada com `ref:` liga o toque; `referral` da Meta grava toque pago.
- `createDeal` congela o toque certo.
- Localhost no contrato de teste `2fa233e2`: link → mensagem simulada →
  negócio → ganho → aparece na aba Marketing com custo e ROAS. Apagar os
  dados `[TESTE CLAUDE]` no fim.
