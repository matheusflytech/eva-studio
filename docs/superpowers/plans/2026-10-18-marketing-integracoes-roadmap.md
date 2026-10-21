# Roadmap — Marketing: conectar Google e Meta e cruzar investimento com negócios

> Documento-mãe (pesquisa + desenho). **Não é plano de implementação**: cada fase vira um plano próprio, com código e testes, na hora de executar. Nada aqui foi implementado, commitado ou aplicado no banco.
>
> Lido antes: `2026-10-19-dashboards-do-funil.md` (histórico de etapas `DealStageEvent`, contas puras em `funil-metricas.ts`, catálogo de fontes do dashboard) e `2026-10-19-api-crm-roadmap.md` (API v1, upsert por `externalId`, relógio pg_cron → `/api/internal/scheduler`).

## Objetivo de produto

No dashboard de negócios, responder em reais e por campanha/origem:

- **Quanto investi** (Meta Ads, Google Ads) no período.
- **Quanto isso gerou**: leads (contatos novos), negócios criados, negócios ganhos, receita ganha.
- **Quanto custou cada coisa**: custo por lead (CPL), custo por negócio, custo por venda (CAC), **ROAS** = receita ganha ÷ investimento.
- **De onde veio cada negócio** — mesmo sem conta de anúncio conectada (UTM, link de WhatsApp rastreado, anúncio de clique para WhatsApp, formulário de lead da Meta).

E fazer a **conexão em 1–2 cliques** por provedor: botão → tela de consentimento do Google/Meta → (só se houver mais de uma conta) marcar quais contas → pronto, primeiro dado aparece em minutos.

## Ponto de partida (o que o código já tem)

| Peça | Onde | Uso aqui |
|---|---|---|
| Cifra AES-256-GCM de segredos | `src/lib/server/crypto.ts` (`encryptSecret`/`decryptSecret`, `TOKEN_ENCRYPTION_KEY`) | Guardar access/refresh tokens. **Atenção:** sem a env ela grava texto puro (compat. legada) — ver decisão D3 |
| OAuth com `state` em cookie httpOnly | `src/app/api/instagram/oauth/start` + `callback` | Mesmo padrão para Google e Meta (nonce, 10 min, uso único) |
| Graph API da Meta | `src/lib/server/meta-graph.ts` (`GRAPH_VERSION = "v21.0"`) | Reaproveitar o cliente; **v21 é de out/2024 e está perto de expirar** — subir versão é pré-requisito |
| Webhook da Meta | `src/app/api/webhooks/meta/route.ts` | Ganha `leadgen` (Lead Ads) e leitura de `referral` (anúncio → DM/WhatsApp). Hoje **ninguém lê `referral`** |
| WhatsApp não oficial (Baileys) | `worker/index.js` (`messages.upsert`) | Ler `contextInfo.externalAdReply` (anúncio de clique p/ WhatsApp) — **spike** |
| WhatsApp oficial (Cloud API) | `MetaConnection` (dorme até ter app Meta) | Recebe `referral` com `ctwa_clid`/`source_id` oficialmente |
| Relógio a cada minuto | `/api/internal/scheduler` (pg_cron + worker, trava `tentarTravarRelogio`) | Ganha um passo `sincronizarMarketing()` com limite por batida |
| Contato | `Contact.source` (texto livre, padrão `"conversa"`) | Fica como está; a origem detalhada vai para tabela nova |
| Histórico de etapas | `DealStageEvent` (plano dos dashboards) | "Negócio chegou na etapa X" por campanha |
| Credenciais por organização | `Credential` (groq/resend) | **Não** reaproveitar: OAuth tem refresh, expiração, contas filhas — modelo próprio |
| Tela Integrações | `src/app/(app)/integracoes/page.tsx` | Ganha seção **Marketing** (conexão é por organização, não por agente) |

## Arquitetura em uma figura

```
[Google OAuth]──┐                         ┌──> AdDailyMetric (gasto/clique/impressão por dia e campanha)
[Meta Login ]──┼─> MarketingConnection ──>│
                │   (tokens cifrados)      └──> AdEntity (campanha/conjunto/anúncio: id → nome)
                │        ▲  relógio (scheduler) sincroniza
                │
Site (eva.js) ──┐
Link wa.me rastreado ─┤
Anúncio→WhatsApp/DM (referral, ctwa_clid) ─┼─> Touchpoint (origem de cada contato) ──> Deal herda origem
Lead Ads (leadgen) ───┤
API v1 / importação ──┘

Dashboard: junta AdDailyMetric × Touchpoint × Deal/DealStageEvent por campanha → CPL, CAC, ROAS
Volta (fase M5): negócio ganho → Google (conversão offline por gclid) e Meta (Conversions API)
```

---

## 1. Conexão em 1–2 cliques

### 1.1 Princípios
- **Por organização**, não por agente (anúncio é do negócio inteiro). Papel admin/dono para conectar/desconectar.
- **Um botão por provedor**: "Conectar Google" pede Ads + Analytics no mesmo consentimento; "Conectar Meta" pede anúncios + páginas/formulários no mesmo consentimento. Sem pedir developer token, ID de cliente, pixel ou nada técnico ao usuário.
- **Auto-seleção**: depois do consentimento, se a pessoa só tem 1 conta de anúncio / 1 propriedade GA4, conecta direto (1 clique). Se tem várias, uma tela com caixinhas **já marcadas** e "Conectar selecionadas" (2 cliques). Contas de gerente (MCC / Business Manager) aparecem agrupadas.
- **Primeiro dado em minutos**: ao conectar, enfileira sincronização imediata dos últimos 30 dias (backfill), mostrando "Importando… 12/30 dias".
- **Sem dado técnico na tela**, mas com "Ver detalhes" (IDs, escopos, última sincronização, erro) para suporte.
- Também CTA no próprio dashboard vazio: "Conecte seus anúncios para ver custo por lead".

### 1.2 Google (Ads + GA4; Business Profile depois)

**Fluxo:** OAuth 2.0 web server flow, `access_type=offline`, `prompt=consent` (garante `refresh_token`), `include_granted_scopes=true` (incremental: Business Profile pode ser pedido depois sem refazer). Rotas `GET /api/marketing/google/start` e `/callback`, mesmo padrão de cookie+nonce do Instagram.

**Escopos mínimos:**

| Escopo | Para quê | Classificação Google |
|---|---|---|
| `https://www.googleapis.com/auth/adwords` | Ler gasto/campanhas; na M5, enviar conversões offline | Sensível (verificação do app) |
| `https://www.googleapis.com/auth/analytics.readonly` | Listar propriedades GA4 e rodar relatórios | Sensível |
| `openid email` | Mostrar "conectado como fulano@" | Básico |
| `https://www.googleapis.com/auth/business.manage` | (Fase M6) Business Profile | Sensível + acesso à API por formulário |

Não existe escopo "somente leitura" do Google Ads: `adwords` é leitura e escrita. A Eva só lê até a M5 — dizer isso na tela de consentimento/termos.

**Depois do consentimento:**
- Ads: `customers:listAccessibleCustomers` → para cada um, GAQL em `customer_client` para descobrir contas sob MCC e moeda/fuso. Guardar `login-customer-id` quando o acesso vem via MCC.
- GA4: Admin API `accountSummaries.list` → propriedades.
- Header obrigatório em toda chamada Ads: `developer-token` (da Eva, em env `GOOGLE_ADS_DEVELOPER_TOKEN`) + `login-customer-id` quando aplicável.

### 1.3 Meta (Ads, Páginas/Lead Ads, Pixel/dataset)

**Fluxo recomendado:** **Facebook Login for Business** com `config_id` (configuração criada no painel do app). Duas opções de token:

| Opção | Token | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** Configuração "System-user access token" (integração de negócio) | Token de usuário de sistema do **portfólio do cliente**, não expira | Não quebra a cada 60 dias; não depende da pessoa continuar na empresa | O cliente precisa ser admin do portfólio empresarial; tela de consentimento um pouco mais longa |
| B Configuração "User access token" | Token de usuário longo (60 dias) | Mais simples p/ quem não tem portfólio | Expira; precisa reconectar; some se a pessoa sair |

Plano: A como padrão, B como alternativa automática quando o usuário não administra portfólio (avisar "reconecte em DD/MM" no dia 50).

**Permissões mínimas (por fase):**

| Permissão | Fase | Para quê |
|---|---|---|
| `ads_read` | M2 | Contas de anúncio, campanhas, insights (gasto) |
| `business_management` | M2 | Listar contas de anúncio/pixels via portfólio (necessário na opção A) |
| `pages_show_list`, `pages_read_engagement` | M4 | Escolher a Página dos formulários |
| `leads_retrieval`, `pages_manage_metadata` | M4 | Ler leads e inscrever a Página no webhook `leadgen` |
| `ads_management` | só se M5 exigir criar/configurar dataset pela Eva — **evitar**; CAPI usa o token do sistema com acesso ao dataset |

**Depois do consentimento:** `GET /me/adaccounts?fields=id,name,currency,timezone_name,account_status` (ou `/{business_id}/owned_ad_accounts` + `client_ad_accounts`), pixels/datasets por conta (`/act_{id}/adspixels`), páginas (`/me/accounts`, só M4). Mesma tela de seleção.

**App da Meta:** recomendação é um **app novo "Eva Marketing"** (tipo Business) no mesmo portfólio da Eva, separado do app de Instagram/WhatsApp — uma revisão reprovada de anúncios não trava os canais, e vice-versa. Decisão D1.

### 1.4 Onde guardar tokens

Modelos novos (SQL aditivo revisado, nunca `db:push`; aplicar só com ok do Alfredo):

```prisma
// Uma autorização OAuth de uma organização num provedor. Tokens cifrados com
// encryptSecret (src/lib/server/crypto.ts). Nunca saem do servidor.
model MarketingConnection {
  id               String    @id @default(uuid())
  orgId            String
  provider         String    // google | meta
  status           String    @default("active") // active | needs_reauth | revoked | error
  externalUserId   String    // sub do Google / user ou system user id da Meta
  externalLabel    String    @default("") // e-mail ou nome mostrado na tela
  scopes           String[]
  accessTokenEnc   String    @db.Text
  refreshTokenEnc  String?   @db.Text   // Google; Meta opção A não tem
  accessExpiresAt  DateTime?
  connectedById    String?   // Profile que conectou
  lastError        String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  accounts         MarketingAccount[]
  @@unique([orgId, provider, externalUserId])
  @@map("eva_studio_marketing_connections")
}

// Conta escolhida para sincronizar: conta do Google Ads, propriedade GA4,
// conta de anúncios da Meta, dataset/pixel, Página (Lead Ads).
model MarketingAccount {
  id               String    @id @default(uuid())
  orgId            String
  connectionId     String
  kind             String    // google_ads | ga4 | meta_ads | meta_dataset | meta_page | gbp_location
  externalId       String    // customer id sem hífen | properties/123 | act_123 | pixel id | page id
  loginCustomerId  String?   // MCC (Google)
  name             String
  currency         String    @default("BRL")
  timezone         String    @default("America/Sao_Paulo")
  enabled          Boolean   @default(true)
  backfillFrom     DateTime?
  syncedThrough    DateTime? // último dia completo sincronizado
  nextSyncAt       DateTime  @default(now())
  syncLockedUntil  DateTime?
  lastSyncError    String?
  connection MarketingConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  @@unique([orgId, kind, externalId])
  @@index([nextSyncAt])
  @@map("eva_studio_marketing_accounts")
}
```

Regras:
- `orgId` em toda consulta (isolamento, igual ao resto do CRM).
- Token só é decifrado dentro de `src/lib/server/marketing/*` e nunca volta para o cliente nem para log (mascarar em erro).
- Desconectar = revogar no provedor (Google `oauth2.googleapis.com/revoke`; Meta `DELETE /{user-id}/permissions`) + apagar tokens + `status=revoked`. **Métricas já importadas ficam** (são do cliente e alimentam o histórico); botão separado "apagar dados importados".
- Meta exige **callback de exclusão de dados** e de desautorização no app — implementar junto (apaga tokens da conexão).
- `invalid_grant` (Google) / erro 190 (Meta) → `needs_reauth`, faixa no dashboard "Reconectar Google" e aviso para os admins.

---

## 2. Métricas e frequência

### 2.1 O que puxar

**Meta Ads** — `GET /act_{id}/insights`, `level=campaign` e `level=ad` (ad é o que liga com `ctwa`/Lead Ads/`utm_content`), `time_increment=1`, `fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions,action_values` (de `actions` pegar `lead`, `onsite_conversion.messaging_conversation_started_7d`, `offsite_conversion.fb_pixel_lead`). Estrutura (nomes, status, objetivo) por `/act_{id}/campaigns` e `/ads` com `updated_since`. Volume grande → relatório assíncrono (`POST /insights` + `report_run_id`).

**Google Ads** — GAQL via `googleAds:searchStream`:
```sql
SELECT segments.date, campaign.id, campaign.name, campaign.status,
       campaign.advertising_channel_type,
       metrics.cost_micros, metrics.impressions, metrics.clicks,
       metrics.conversions, metrics.conversions_value
FROM campaign
WHERE segments.date BETWEEN '{de}' AND '{ate}'
```
Mais `ad_group` (mesmos campos) quando a conta tiver poucas campanhas. **gclid → campanha:** `click_view` (`click_view.gclid, campaign.id, ad_group.id, segments.date`) — só aceita **um dia por consulta** e só os **últimos 90 dias**; rodar uma vez por dia para o dia anterior, filtrando só gclids que a Eva de fato recebeu (evita baixar todos os cliques).

**GA4** (M6) — Data API `runReport`: `sessions`, `totalUsers`, `keyEvents` por `date, sessionSourceMedium, sessionCampaignName`. Serve para "visitas do site → leads da Eva" (taxa de conversão do site), não para gasto.

**Google Business Profile** (M6) — Performance API: ligações, cliques no site, pedidos de rota por dia. Indicador de topo de funil local; não entra no ROAS.

### 2.2 Tabelas de métrica

```prisma
// Campanha / conjunto (ad set, ad group) / anúncio de qualquer provedor.
model AdEntity {
  id          String  @id @default(uuid())
  orgId       String
  accountId   String  // MarketingAccount
  level       String  // campaign | adset | ad
  externalId  String
  parentId    String? // externalId do nível de cima
  campaignId  String  // externalId da campanha (atalho p/ agrupar)
  name        String
  status      String  @default("")
  objective   String  @default("")
  updatedAt   DateTime @updatedAt
  @@unique([accountId, level, externalId])
  @@index([orgId, campaignId])
  @@map("eva_studio_ad_entities")
}

// Um dia de um campanha/anúncio. Dinheiro em micros da moeda da conta
// (Google já entrega assim; Meta vem em string decimal → converter).
model AdDailyMetric {
  orgId          String
  accountId      String
  level          String
  externalId     String
  date           DateTime @db.Date   // no fuso da conta
  spendMicros    BigInt   @default(0)
  impressions    Int      @default(0)
  clicks         Int      @default(0)
  platformLeads  Int      @default(0) // o que a plataforma diz (comparar com o CRM)
  platformConv   Float    @default(0)
  currency       String
  fetchedAt      DateTime @default(now())
  @@id([accountId, level, externalId, date])
  @@index([orgId, date])
  @@map("eva_studio_ad_daily_metrics")
}
```
Upsert sempre pela chave composta (reprocessar um dia sobrescreve, nunca duplica).

### 2.3 Frequência (no relógio de 1 minuto)

Passo novo no `/api/internal/scheduler`: `sincronizarMarketing({ maxContas: 3, orçamentoMs: 20_000 })`. Pega contas com `nextSyncAt <= now()` e `syncLockedUntil` vencido, trava por 5 min, sincroniza, agenda o próximo. Fica bem dentro do tempo de função da Vercel; conta grande continua na batida seguinte (checkpoint em `syncedThrough`).

| Janela | Frequência | Por quê |
|---|---|---|
| Hoje | a cada **60 min** (horário comercial), 3 h de madrugada | Gasto "de hoje" no painel sem estourar cota |
| D-1 a D-3 | 1×/dia (~04h, fuso da conta) | Plataformas consolidam gasto/conversões depois |
| D-4 a D-28 | 1×/semana (domingo) | Meta reatribui conversões (janela 7d clique/1d view); Google conversões atrasadas |
| Estrutura (nomes/status) | 1×/dia + quando aparecer id desconhecido | Nome novo de campanha aparece no painel |
| `click_view` (gclid) | 1×/dia para D-1 | Limite de 1 dia por consulta |
| Backfill ao conectar | 30 dias, em fatias de 7 dias | Primeiro gráfico em minutos; ofertar "importar 12 meses" depois |
| GA4 / GBP | 1×/dia | Baixa urgência |

**Cota estimada:** Google Ads ≈ 3–5 consultas por conta por hora útil ≈ 60–100 operações/conta/dia. Com acesso **Explorer** (2.880/dia em produção) cabem ~25–30 contas; **Basic** (15.000/dia) ~150; acima disso pedir **Standard**. Meta: limitada por conta de anúncio (pontuação de chamadas); o nível **Limited** do "Marketing API Access Tier" é apertado — tratar headers `x-business-use-case-usage`/`x-ad-account-usage` e recuar quando passar de 75%.

---

## 3. Atribuição: de onde veio cada contato/negócio

### 3.1 Modelo

```prisma
// Cada vez que se sabe de onde um contato veio (pode haver vários).
model Touchpoint {
  id          String   @id @default(uuid())
  orgId       String
  contactId   String
  at          DateTime @default(now())
  channel     String   // site | whatsapp_link | ctwa | ig_ad_dm | messenger_ad | meta_lead_form | api | manual
  provider    String?  // google | meta | outro
  // UTMs como vieram (normalizados em minúsculas, sem espaços nas pontas)
  utmSource     String?
  utmMedium     String?
  utmCampaign   String?
  utmContent    String?
  utmTerm       String?
  utmId         String?
  // Identificadores de clique
  gclid         String?
  gbraid        String?
  wbraid        String?
  fbclid        String?
  fbc           String?
  fbp           String?
  ctwaClid      String?
  // Ligação resolvida com a plataforma (preenchida na hora ou pelo resolvedor)
  adAccountId   String?
  campaignExtId String?
  adsetExtId    String?
  adExtId       String?
  landingUrl    String?  @db.Text
  referrer      String?  @db.Text
  raw         Json     @default("{}")  // payload original p/ reprocessar
  @@index([orgId, contactId, at])
  @@index([orgId, campaignExtId])
  @@index([gclid])
  @@map("eva_studio_touchpoints")
}
```
E no `Deal`: `touchpointId String?` (congelado na criação do negócio: **último toque pago do contato antes da criação**; se não houver pago, último toque). Assim mudar regra depois não reescreve o passado; o dashboard pode oferecer "primeiro toque" lendo a tabela.

Regra única num lugar só (`src/lib/server/marketing/atribuicao.ts`, função pura testada), igual ao padrão do `funil-metricas.ts`.

### 3.2 Fontes de origem (por ordem de valor × esforço)

1. **Anúncio de clique para WhatsApp (CTWA)** — o mais importante para cliente brasileiro.
   - Cloud API oficial: a 1ª mensagem traz `messages[].referral` com `source_id` (id do anúncio), `source_type`, `source_url`, `headline`, `ctwa_clid`. Ler no `webhooks/meta`.
   - Baileys (`worker/index.js`): a 1ª mensagem vinda de anúncio traz `contextInfo.externalAdReply` (`sourceId`, `sourceUrl`, `sourceType`, e em versões recentes `ctwaClid`) e `contextInfo.conversionSource`/`conversionData`. **Spike S1**: capturar o proto real de um clique em anúncio de teste antes de prometer. O worker repassa esses campos no `POST /api/conversations/message`.
   - `source_id` = id do anúncio → campanha via `AdEntity` (ou consulta pontual `GET /{ad_id}?fields=campaign_id,adset_id`).
2. **Anúncio → DM do Instagram / Messenger** — o webhook de mensagens traz `referral` (`ad_id`, `source: "ADS"`, `ref`). Ler no mesmo `webhooks/meta`.
3. **Meta Lead Ads (formulário instantâneo)** — webhook `leadgen` (`leadgen_id`, `ad_id`, `adgroup_id`, `form_id`, `page_id`) → `GET /{leadgen_id}` → **upsert de contato + negócio** no funil escolhido, com toque `meta_lead_form`. Atribuição perfeita e o maior "uau" do produto (fase M4).
4. **Site (snippet `eva.js`)** — script de 2 KB que o cliente cola (ou que já vem no widget da Eva): na chegada lê `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, cookies `_fbp`/`_fbc`, `document.referrer` e landing page; guarda em cookie primário de 90 dias (primeiro e último toque); anexa ao **widget**, aos **formulários** (campos ocultos preenchidos sozinhos) e aos **links de WhatsApp** da página (reescreve `wa.me` para levar o código, item 5).
5. **Link de WhatsApp rastreado** (para quem anuncia no Google com botão de WhatsApp, onde não existe `ctwa_clid`): a Eva gera `https://<dominio-eva>/w/<codigo>` por campanha/origem; o redirecionamento grava o clique (com `gclid` se vier) e abre `wa.me/<numero>?text=Olá! (ref: K7F3)`. Na 1ª mensagem do contato o motor reconhece `ref: K7F3` e cria o toque. Tela: "Criar link rastreado" com UTMs pré-preenchidas.
6. **API v1 / importação** — `PUT /contacts/upsert` aceita objeto `attribution` com os mesmos campos (encaixa na API-1 do roadmap da API).
7. **Manual** — campo "Origem" no contato/negócio (lista: Indicação, Evento, Orgânico, Outro) para venda offline.

### 3.3 Ligar origem à campanha (resolvedor)

Ordem: id explícito (`ad_id`/`source_id`/Lead Ads) → `gclid` via `click_view` → `utm_id` = id da campanha → `utm_campaign` igual ao **nome** da campanha (normalizado) → sem campanha (fica só a origem). A tela de conexão mostra **templates de URL para copiar**:
- Meta (parâmetros de URL do anúncio): `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_content={{ad.id}}`
- Google: confirmar **auto-tagging ligado** (gclid) e sugerir `{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}`.

Mostrar no painel, sempre: **"% dos negócios com origem conhecida"** — sem isso o ROAS engana.

---

## 4. Dashboard (encaixe no catálogo de fontes)

Fontes novas no grupo **"Marketing"** de `src/lib/analytics-catalog.ts` (mesmo padrão do plano do funil; contas puras em `src/lib/marketing-metricas.ts`):

| Chave | Tipo | Conta |
|---|---|---|
| `investimento` | número (R$) | Σ `spendMicros` no período |
| `leadsPagos` | número | contatos com toque pago criado no período |
| `custoPorLead` | número (R$) | investimento ÷ leads pagos |
| `custoPorNegocio` | número (R$) | investimento ÷ negócios criados com origem paga |
| `custoPorVenda` (CAC) | número (R$) | investimento ÷ negócios ganhos (fechados no período) com origem paga |
| `roas` | número (x) | receita ganha atribuída ÷ investimento |
| `campanhasTabela` | tabela | por campanha: gasto, cliques, leads (CRM), leads (plataforma), negócios, ganhos, receita, CPL, CAC, ROAS |
| `negociosPorOrigem` | quebra | canal/origem de todos os negócios (funciona **sem** anúncio conectado) |
| `investimentoXLeads` | série | gasto por dia × leads por dia |
| `funilPorCampanha` | funil | conversão etapa a etapa filtrada por campanha (usa `DealStageEvent`) |

Botão **"Painel de marketing"** (igual ao "Painel do funil") monta tudo. Filtros: período, provedor, campanha, funil.

Cuidados de conta:
- **Coorte vs. período**: CAC e ROAS usam negócios **ganhos no período** com receita, mas o gasto pode ter sido antes. Mostrar as duas leituras: "no período" (padrão) e "por coorte de criação" (avançado).
- **Moeda**: conta de anúncio em USD e negócio em BRL → não converter na v1; mostrar aviso e excluir do ROAS (decisão D4).
- **Fuso**: datas de métrica no fuso da conta; negócios no fuso da organização.
- Comparar "leads segundo a Meta" × "leads no CRM" lado a lado — é exatamente a dor que o cliente tem.

---

## 5. Devolver conversões para as plataformas (fase M5)

Fechar o ciclo faz o algoritmo de lance otimizar para **venda**, não para clique — argumento de venda forte.

- **Google Ads:** `ConversionUploadService.UploadClickConversions` com `gclid` (ou `gbraid`/`wbraid`), `conversion_action` (a Eva cria uma ação tipo `UPLOAD_CLICKS` "Eva — Negócio ganho" pela API, com ok do usuário), `conversion_date_time`, `conversion_value`. Sem gclid: **Enhanced Conversions for Leads** (e-mail/telefone com SHA-256). Prazo: até 90 dias após o clique.
- **Meta Conversions API:** `POST /{dataset_id}/events`.
  - CTWA: `action_source: "business_messaging"`, `messaging_channel: "whatsapp"`, `user_data.ctwa_clid` + id da WABA. **Exige WhatsApp oficial (WABA)** — número via Baileys não tem WABA (risco R2).
  - Lead Ads / CRM: `action_source: "system_generated"` com `lead_id`, eventos por etapa do funil (Lead qualificado, Negócio ganho).
  - Site: `action_source: "website"` com `fbc`/`fbp`, `event_id` para deduplicar com o Pixel.
  - Dados pessoais sempre em SHA-256 normalizado (telefone sem `+`, e-mail minúsculo).
- Disparo: ao mover negócio para etapa marcada "conta como conversão" (configurável por funil) e ao ganhar — gancho no mesmo `registrarMudancaDeEtapa`, gravando numa **fila** (`ConversionUpload`: provider, dealId, evento, status, tentativas, erro) processada pelo relógio, com retry exponencial. Nunca chamar API externa dentro do movimento do negócio.

---

## 6. Revisão, limites e burocracia de cada API (caminho crítico)

Começar **já**, em paralelo ao código — é o que mais demora.

### Google
| Item | O que é | Prazo / limite |
|---|---|---|
| Projeto Google Cloud + tela de consentimento OAuth | Nome, logo, domínio verificado (Search Console), política de privacidade e termos públicos | — |
| **Verificação do app** (escopos sensíveis `adwords`, `analytics.readonly`) | Vídeo mostrando o uso de cada escopo + justificativa | Dias a poucas semanas. Antes disso: tela "app não verificado" e **até 100 usuários** |
| ⚠️ Status "Testing" do app | Refresh token **expira em 7 dias** | Publicar em "In production" (mesmo não verificado) antes de qualquer cliente real |
| Conta de administrador (MCC) da Eva + **developer token** | Formulário no Centro de API do MCC, descrevendo a ferramenta (documento de design) | **Explorer**: 2.880 op/dia em produção (sai rápido); **Basic**: 15.000 op/dia (análise de alguns dias úteis); **Standard**: ilimitado (≈10 dias úteis, para quem tem muitos clientes). Há relatos de fila de análise em 2026 |
| Versão da API | Lançamentos mensais, 4 majors/ano, cada major vive ~1 ano (v26 em out/2026) | Fixar versão em uma constante e ter alerta de sunset |
| GA4 Data API | Cota por propriedade (tokens/dia e /hora) | Folgada para 1×/dia |
| Business Profile API | Acesso por **formulário de solicitação**; cota 0 até aprovar | Semanas; por isso fica na M6 |

### Meta
| Item | O que é | Prazo / limite |
|---|---|---|
| **Verificação do negócio** (portfólio da Eva) | CNPJ, domínio, documentos | Dias; pré-requisito para acesso avançado |
| App novo tipo Business + Facebook Login for Business (`config_id`) | Configuração com as permissões da fase | — |
| **App Review** de `ads_read`, `business_management` (M2) e `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement` (M4) | Acesso avançado para usar com contas **de outros negócios**; screencast + instruções de teste por permissão | ~1–3 semanas por rodada; reprovação comum por screencast incompleto |
| **Marketing API Access Tier** (antigo "Ads Management Standard Access"; desde 04/05/2026 níveis **Limited** e **Full**) | Full exige **500 chamadas à Marketing API nos últimos 15 dias** e **taxa de erro < 15%** nas últimas 500 chamadas | Limited é muito restrito (feito para desenvolvimento) → plano: usar contas próprias/parceiras em Limited para gerar as 500 chamadas e pedir Full antes de abrir para clientes |
| Versão da Graph | `meta-graph.ts` usa **v21.0** (out/2024) — versões vivem ~2 anos | Subir para a versão vigente **antes** da M2 (afeta Instagram/WhatsApp também; testar) |
| Exclusão de dados / desautorização | Callbacks obrigatórios no app | Implementar na M2 |

---

## 7. Fases

| Fase | Entrega | Depende de | Esforço (dev) |
|---|---|---|---|
| **M0 — Burocracia** (começar hoje) | Google: Cloud project, consentimento, domínio, política, MCC, pedido de developer token (Explorer) e de verificação. Meta: verificação do negócio, app "Eva Marketing", config do Login for Business. Páginas públicas de privacidade/termos/exclusão de dados. | Alfredo (contas e documentos da empresa) | 1–2 dias de dev + espera |
| **M1 — Origem sem anúncio conectado** | `Touchpoint` + `Deal.touchpointId`; leitura de `referral` (WhatsApp Cloud, IG, Messenger) no webhook; spike + leitura `externalAdReply` no Baileys; snippet `eva.js` + widget; link de WhatsApp rastreado; `attribution` na API; campo manual; fonte `negociosPorOrigem` e "% com origem conhecida" | Nada externo — **entrega valor já** | 1,5–2 semanas |
| **M2 — Meta Ads** | Conectar Meta (opção A/B), seleção de contas, sincronização de insights/estrutura, `AdEntity`/`AdDailyMetric`, painel CPL/CAC/ROAS por campanha, resolvedor por `ad_id`/`utm_id`/nome, desconectar/exclusão de dados, versão da Graph atualizada | M0 Meta (App Review + Access Tier) para clientes; dev em Limited com conta própria | 2 semanas |
| **M3 — Google Ads** | Conectar Google, MCC/`login-customer-id`, GAQL diário, `click_view` para gclid, mesmas fontes do painel | M0 Google (developer token ≥ Explorer, app publicado) | 1,5 semana |
| **M4 — Meta Lead Ads** | Webhook `leadgen` → contato + negócio automático no funil escolhido, mapeamento de campos do formulário para campos do CRM, toque `meta_lead_form` | M2 + App Review das permissões de página | 1 semana |
| **M5 — Devolver conversões** | Fila `ConversionUpload`; Google conversão offline/enhanced; Meta CAPI (system_generated/website; business_messaging só com WABA); config "etapa que conta como conversão" | M2/M3; consentimento LGPD revisado | 1,5 semana |
| **M6 — GA4 e Business Profile** | Sessões/conversões do site por origem; ligações/rotas do perfil local; cartões de topo de funil | Verificação Google; formulário GBP | 1 semana |

Ordem sugerida: **M0 hoje → M1 (enquanto espera revisões) → M2 → M4 → M3 → M5 → M6**. Meta antes de Google porque o cliente típico da Eva vende por WhatsApp/Instagram (CTWA e Lead Ads), e o Lead Ads é o recurso de maior impacto percebido. Se o Alfredo tiver cliente-âncora em Google, trocar M3 com M4.

Cada fase segue as regras da casa: branch local, schema só aditivo por SQL revisado, aplicar em produção (`hregdcwbfpxvcmicojds`) só com ok explícito, sem push/PR até o Alfredo pedir.

---

## 8. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | Revisões (Google verificação/developer token, Meta App Review/Access Tier) atrasam o lançamento semanas | M0 imediato; M1 não depende delas; beta fechado com ≤100 usuários Google e contas onde a Eva é admin |
| R2 | WhatsApp via Baileys: `ctwa_clid` pode não vir no proto; CAPI `business_messaging` exige WABA oficial; Baileys fere termos do WhatsApp | Spike S1; sem `ctwa_clid` ainda há `sourceId` (id do anúncio) para atribuir; para devolver conversão usar `system_generated`/telefone com hash; empurrar migração para Cloud API nos clientes que anunciam |
| R3 | Refresh token Google expira em 7 dias se o app ficar em "Testing" | Publicar em produção no M0; monitor de `needs_reauth` |
| R4 | `TOKEN_ENCRYPTION_KEY` ausente → `encryptSecret` grava texto puro | Ver D3 (recusar conectar sem a chave) |
| R5 | Cota Explorer/Limited estoura com muitos clientes | Backoff pelos headers de uso, sincronizar só contas habilitadas, pedir Basic/Full cedo |
| R6 | ROAS enganoso: pouca origem conhecida, coorte vs. período, moeda diferente, Meta reatribuindo 7 dias | "% com origem conhecida" visível, ressincronizar 28 dias, aviso de moeda, explicações nas fontes |
| R7 | `click_view` só 90 dias e 1 dia por consulta; cliques iOS vêm com `gbraid`/`wbraid` sem `click_view` | Resolver diariamente; fallback por UTM |
| R8 | LGPD: guardar identificadores de clique e enviar dados com hash para Google/Meta | Atualizar política e termos do cliente (base legal), hash sempre, opção de desligar a devolução de conversões por organização, apagar toques ao apagar contato |
| R9 | Graph v21 expirando quebra Instagram/WhatsApp, não só marketing | Subir versão como tarefa isolada antes da M2, com o spike do Instagram |
| R10 | Tempo de função da Vercel no relógio | Orçamento por batida, trava por conta, checkpoint em `syncedThrough` |
| R11 | Token de um vendedor que sai da empresa (Meta opção B) | Preferir opção A (usuário de sistema); aviso de reconexão |

## 9. Decisões para o Alfredo

- **D1** App da Meta: novo "Eva Marketing" (recomendado) ou reaproveitar o app atual?
- **D2** Primeiro provedor: Meta (recomendado) ou Google?
- **D3** Exigir `TOKEN_ENCRYPTION_KEY` para conectar marketing (recusar se faltar) em vez do comportamento atual de gravar texto puro? (Recomendado: sim — mas é mudança de comportamento, só com ok.)
- **D4** Moeda diferente da organização: excluir do ROAS com aviso (v1) ou converter por câmbio diário?
- **D5** Modelo de atribuição padrão: último toque pago antes do negócio (recomendado) ou primeiro toque?
- **D6** Domínio do link rastreado de WhatsApp (`/w/<codigo>`): domínio do app ou um curto próprio?
- **D7** Quem cuida da M0 (documentos da empresa, CNPJ, MCC, verificação do domínio)?

## 10. Spikes antes de codar

- **S1** Baileys: capturar mensagem real vinda de anúncio CTWA de teste e listar campos de `contextInfo` (`externalAdReply.sourceId/ctwaClid`, `conversionSource/Data`).
- **S2** Meta: Login for Business com "system-user access token" num portfólio de teste — confirmar que lista contas de anúncio e lê insights em nível Limited.
- **S3** Google: conta de teste do Ads + developer token em Test Account → GAQL e `click_view` funcionando.
- **S4** Medir chamadas reais por conta/dia para validar a estimativa de cota.

## Fontes consultadas (out/2026)
- Google Ads API — níveis de acesso e cotas: https://developers.google.com/google-ads/api/docs/access-levels
- Google Ads API — datas de sunset: https://developers.google.com/google-ads/api/docs/sunset-dates
- Ritmo de versões do Google Ads API (secundária): https://www.relevantaudience.com/google-ads-en/google-ads-api-two-releases-a-month-from-v26/
- Meta — Marketing API Access Tier (04/05/2026): https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/
- Meta — autorização e limites da Marketing API: https://developers.facebook.com/docs/marketing-api/get-started/authorization , https://developers.facebook.com/docs/marketing-api/overview/rate-limiting
- CTWA / `ctwa_clid` e CAPI business messaging (secundárias): https://whapi.cloud/blog/track-click-to-whatsapp-ctwa-clid , https://support.woztell.com/portal/en/kb/articles/wa-conversion-flow , https://github.com/evolution-foundation/evolution-api/issues/2645
- Itens não reconfirmados nesta pesquisa (conferir no momento da fase): escopos sensíveis Google e expiração de 7 dias em Testing, campos exatos de `externalAdReply` no Baileys 6.7, versão vigente da Graph API, formulário de acesso do Business Profile.
