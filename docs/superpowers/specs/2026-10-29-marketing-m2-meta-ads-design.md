# Marketing M2 — gasto da Meta Ads sem digitar

> Documento-mãe: `docs/superpowers/plans/2026-10-18-marketing-integracoes-roadmap.md` (seções 1.3, 1.4, 2.1, M2).
> Depende da M1 (`docs/superpowers/specs/2026-10-29-marketing-origem-design.md`).

## Objetivo

O investimento da aba Marketing vem sozinho da Meta Ads: o contrato conecta a
conta de anúncios uma vez e a Eva lê o gasto por dia, campanha e anúncio. O
lançamento à mão continua só como reserva (Google até a M3, evento,
influenciador). Só leitura: a Eva nunca escreve na Meta.

## Decisões (29/10, padrões do roadmap; o usuário não escolheu outra coisa)

- **App da Meta configurável.** `META_ADS_APP_ID` / `META_ADS_APP_SECRET` /
  `META_ADS_CONFIG_ID`; sem eles, usa `META_APP_ID` / `META_APP_SECRET` (o app
  atual). Trocar de app depois é só trocar as variáveis.
- **Facebook Login for Business com `config_id`.** A configuração do painel
  decide o token: usuário de sistema (não expira, opção A) ou usuário (60 dias,
  opção B). A Eva lê o tipo pelo `debug_token` e, no token de usuário, troca
  pelo de 60 dias e avisa "reconecte" quando faltar 10 dias. Sem `config_id`,
  pede `ads_read,business_management` no login comum.
- **Testes contra Meta falsa** (`META_GRAPH_URL`), como o teste da Hotmart. O
  teste com conta real fica para quando o app tiver `ads_read`.
- **Versão da Graph não sobe nesta fase** (v21 é a do app inteiro; subir é
  tarefa própria porque mexe em Instagram/WhatsApp).

## Modelo de dados (SQL aditivo, só com OK)

1. `eva_studio_marketing_connections` — `orgId, provider ('meta'), status
   (active|needs_reauth|revoked|error), externalUserId, externalLabel,
   tokenType (system_user|user), secrets (token cifrado), expiresAt, lastError,
   connectedById`. Único `(orgId, provider, externalUserId)`.
2. `eva_studio_marketing_accounts` — `orgId, connectionId (cascade), kind
   ('meta_ads'), externalId ('act_123'), name, currency, timezone, enabled
   (false até a pessoa ligar), syncedThrough, nextSyncAt, syncLockedUntil,
   lastSyncError`. Único `(orgId, kind, externalId)`.
3. `eva_studio_ad_daily_metrics` — um dia de um anúncio: `orgId, accountId,
   date, campaignId, campaignName, adsetId, adsetName, adId, adName,
   spendCents (moeda da conta), currency, impressions, clicks, leads,
   conversations`. Único `(accountId, date, adId)`. Nome da campanha/anúncio
   mora aqui (sem tabela de estrutura: só o gasto importa nesta fase).

Desconectar não apaga métricas (são do cliente); botão separado apaga.

## Sincronização

- `GET /act_{id}/insights?level=ad&time_increment=1&time_range=...` com
  `campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,
  impressions,clicks,actions`, paginado. Leads = `lead` +
  `onsite_conversion.lead_grouped`; conversas =
  `onsite_conversion.messaging_conversation_started_7d`.
- Primeira vez: últimos 30 dias. Depois: de `syncedThrough - 2` (a Meta
  corrige o gasto dos últimos dias) até hoje. A cada 6 h pelo relógio
  (`/api/internal/scheduler`), ou "Sincronizar agora".
- Erro 190 (token inválido) → conexão `needs_reauth`, faixa na aba.

## Casamento com a origem

Na aba, a linha de cada campanha da Meta é `facebook` + nome da campanha
normalizado (o mesmo `normalizeUtm` das UTMs). Um toque cai nessa linha quando:
1. `adId` do toque (anúncio que abre WhatsApp/Instagram) é de um anúncio
   importado; ou
2. `utm_id` do toque é o id de uma campanha importada; ou
3. `utm_source` + `utm_campaign` já batem por nome (regra da M1).

## Tela

Seção "Meta Ads" na aba Marketing: conectar, contas (ligar/desligar),
última sincronização/erro, "Sincronizar agora", desconectar, apagar dados
importados. "Investimento" vira "Outros investimentos", com o formulário atrás
de "Lançar à mão".

## Exigências da Meta

Callbacks de desautorização e de exclusão de dados (`signed_request` assinado
com o segredo do app): apagam o token da conexão daquele usuário.

## Fora da M2

App Review (o usuário faz no painel da Meta), Google Ads (M3), Lead Ads (M4),
devolver conversões (M5), moedas diferentes de BRL somadas no total (a aba
mostra só contas em BRL; outra moeda fica listada com aviso).
