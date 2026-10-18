# Roadmap — To-dos Eva Studio (out/2026)

> Documento-mãe. Cada fase vira um plano de implementação próprio (`docs/superpowers/plans/AAAA-MM-DD-fase-N-*.md`), escrito na hora de executar, com código e testes. A Fase 0+1 já está detalhada em `2026-10-18-fase-0-1-testes-e-gatilhos.md`.

**Base do código:** `main` @ `736db9e` (13/10/2026).
**Responsável:** Alfredo.

---

## 1. Decisões já tomadas

| Tema | Decisão |
|---|---|
| CRM da prospecção | CRM da própria Eva Studio (Company/Contact/Deal), não o Beeno |
| Fonte de empresas | Dados abertos do CNPJ (Receita Federal), filtrados por CNAE |
| Alcance da prospecção | Captar + enriquecer (site, stack, CRM) + pontuar. Abordagem continua **manual** |
| LinkedIn | Sem raspagem (proibida pelos termos do LinkedIn, caso hiQ terminou com indenização e destruição dos dados). Só o campo `linkedinUrl`, preenchido à mão |
| Testes | Vitest para lógica pura e rotas (Prisma simulado). Nunca testar contra o banco de produção. Teste ponta a ponta à mão com conta de teste, com roteiro escrito |

## 2. Viabilidade item a item

| # | To-do | Dá pra fazer? | Limite real | Esforço |
|---|---|---|---|---|
| 1 | Resposta automática a story (+ reação, filtro por palavra, story específico, contagem) | **Sim** | Resposta a story chega em `messages` com `reply_to.story.id`. **Reação com emoji não tem evento próprio documentado**: na prática chega como texto=emoji com `reply_to.story` — validar na conta de teste antes de prometer. Resposta com GIF/sticker **não gera webhook**. Story some em 24h: gatilho de "story específico" vira órfão depois disso | M |
| 2 | Agradecimento a menção em story | **Sim** | Chega como anexo `story_mention` em `messages`. Só menção em **story** dispara (marcação em post não). Hoje esse evento cai no fluxo como "[Anexo não suportado]" — bug a corrigir junto | P |
| 3 | Gatilho por palavra-chave na DM (IG + WhatsApp, exata/parcial, várias palavras, fluxo padrão se nada casar) | **Sim** | Nenhum, é lógica nossa. Entra no motor, então vale para todos os canais de uma vez (IG, WhatsApp oficial, WhatsApp QR, Messenger, Telegram, widget, Playground) | M |
| 4 | Campos reais de lead (nome/e-mail/telefone no lead, validação, nova tentativa, campos livres, página Leads e `/api/v1/leads`) | **Sim** | Hoje "lead" = conversa do canal `website`. O dado capturado já vai pro Contact (`syncContactFromConversation`), mas sem validação, e a página/API de Leads não mostram o Contact. Exige decidir: **Lead passa a ser o Contact** (recomendado) | G |
| 5 | Peças restantes do ManyChat | **Sim, por partes** | Ver Fase 3 — já existem etiquetas e sequências; faltam IA devolver controle, Esperar em todos os canais, botões no IG/Messenger, lista no WhatsApp (>3 opções), link com rastreio | G |
| 6 | WhatsApp: disparo agendado + criar template na Meta com acompanhamento | **Sim** | Disparo agendado **já existe** (`Broadcast.scheduledAt` + relógio). Falta conferir contagem dobrada no WhatsApp QR. Criar template: `POST /{WABA}/message_templates`, revisão até 24h, status por webhook `message_template_status_update` | M |
| 7 | Prospecção de empresários fora de tecnologia (loteadoras, logística, cobrança, vendas, atendimento em massa) com sinais de CRM/stack no site | **Sim, com ressalvas** | Base CNPJ tem ~100 GB zipados: o filtro roda **fora da Vercel** (script local ou worker). Base não traz site — o site sai do domínio do e-mail cadastrado ou de busca paga (Google Places). Dado de sócio é dado pessoal (LGPD: legítimo interesse documentado + opt-out) | G |

P = até 1 dia · M = 2–4 dias · G = 1 semana+

## 3. Fases e ordem

A ordem segue dependência técnica e valor: primeiro a rede de testes, depois o motor de gatilhos (base de 1, 2 e 3), depois lead (que os gatilhos alimentam).

### Fase 0 — Base de testes e ambiente (pré-requisito)
- Vitest com stub de `server-only` e alias `@/`; script `npm test`.
- Testes de caracterização do que já existe e será mexido (`matchCommentAutomation`).
- **Decisão pendente:** banco de staging. Hoje `db:push` aplica direto no Supabase de produção (compartilhado com o Beeno). Recomendação: projeto Supabase separado de staging ou branch do Supabase para testar mudanças de schema antes. Até lá, toda mudança de schema da fase é **só aditiva** (tabela/coluna nova, nada removido nem renomeado).
- Detalhado em `2026-10-18-fase-0-1-testes-e-gatilhos.md`.

### Fase 1 — Gatilhos (to-dos 1, 2 e 3)
Um modelo só, `AgentTrigger`, com três tipos: `dm_keyword`, `story_reply`, `story_mention`.
- Casamento numa função pura testada (`matchTrigger`): exata/parcial, várias palavras, sem acento/maiúscula, story específico ou qualquer, reação com emoji liga/desliga, prioridade por especificidade.
- Ação do gatilho: mensagem de resposta (com cupom/link no texto) e/ou pular para um bloco do fluxo.
- Motor: gatilho é avaliado em `advanceConversation` antes de retomar o bloco parado. Não interrompe um bloco de Captura (não sequestra a resposta do cliente), mas tira a conversa de IA/Esperar/encerrada. Nada casou → fluxo padrão.
- Webhook do Instagram: lê `reply_to.story` e `story_mention`; para de mandar "[Anexo não suportado]" pro fluxo.
- Conexão do Instagram passa a **assinar os eventos sozinha** (`subscribed_apps`) — hoje é manual no painel.
- Contagem de disparos por gatilho (`triggerCount`, `lastTriggeredAt`).
- Tela de gatilhos no agente, com escolha do story ativo (lista via API) ou ID manual.
- **Spike obrigatório no início** (conta IG de teste): confirmar o formato real da reação a story, se `GET /{ig-user-id}/stories` funciona com token do Instagram Login, e se o envio com esse token funciona em `graph.facebook.com` (código atual) ou só em `graph.instagram.com`. A versão da Graph usada no código é **v21.0** (lançada em out/2024, perto do fim do suporte de 2 anos) — conferir e subir junto se precisar.

### Fase 2 — Lead de verdade (to-do 4)
- **Lead = Contact** (com origem: canal, agente, gatilho que trouxe). Página Leads e `/api/v1/leads` passam a listar Contact de todos os canais, mantendo os campos atuais da API (`fields`, `stage`) por compatibilidade.
- Bloco Captura ganha "tipo do campo": nome, e-mail, telefone, campo personalizado (usa `CustomField` que já existe), texto livre.
- Validação por tipo (e-mail, telefone BR/E.164, regex opcional), mensagem de erro configurável, número máximo de tentativas e saída "não respondeu certo" no bloco.
- Campo opcional: botão/palavra "pular".
- `POST /api/v1/leads` e `POST /api/leads` passam a criar/atualizar o Contact (hoje não criam).
- Testes: validadores (puro), mapeamento captura→Contact, contrato da API v1 (antes/depois).

### Fase 3 — Peças do ManyChat (to-do 5), em ordem de prioridade
1. **IA devolve o controle ao fluxo** — ferramenta `concluir_atendimento` no Agente de IA + porta de saída "concluído" no bloco. Hoje a conversa fica presa na IA para sempre. (Alto valor, destrava 2 e os gatilhos.)
2. **Sequência com atraso em todos os canais** — o bloco Esperar só acorda sozinho no WhatsApp QR. Mover a retomada para o relógio central (`/api/internal/scheduler`), valendo para Meta, IG, Messenger, Telegram. Respeitar janela de 24h (template no WhatsApp oficial; IG/Messenger fora da janela não envia).
3. **Respostas rápidas** — IG `quick_replies` (até 13, título 20 car.) e postback; Messenger idem; WhatsApp oficial com **lista** quando há mais de 3 opções (hoje corta na 3ª).
4. **Botão de link com rastreio** — rota `/r/[token]` (302) + modelo de clique por contato; WhatsApp `cta_url`, IG button template `web_url`. Clique pode aplicar etiqueta/avançar fluxo.
5. **Etiquetas no contato** — já existe (bloco `crm-tag`, ferramenta de IA). Só revisar se a UI do fluxo deixa claro.

### Fase 4 — WhatsApp (to-do 6)
- **Disparo agendado:** já funciona via `scheduledAt` + relógio (pg_cron → `/api/internal/scheduler`). Recomendação: **não** mover o agendamento para o worker do Baileys — o relógio central já cobre os dois canais; o worker continua só como entregador (fila `OutboundQueueItem`). Tarefas: conferir/corrigir contagem dobrada de `sentCount` no WhatsApp QR (`runBroadcast` + `bumpBroadcast`), travar item da fila com `FOR UPDATE SKIP LOCKED`, testar agendamento ponta a ponta.
- **Cadastro de modelo na Meta:** rota `POST /api/agents/[agentId]/meta-templates` → `POST /{WABA}/message_templates` (categoria, idioma, header/body/footer/botões, exemplos de variáveis). Tela de criação em Aprovações.
- **Acompanhamento:** tratar `message_template_status_update` e `template_category_update` no webhook (`whatsapp_business_account`), gravar status/motivo no `MessageTemplate` local, e manter a consulta ao vivo atual como reserva.
- Testes: montagem do payload do template (puro, vários formatos de variável), parser do webhook de status, contagem do disparo.

### Fase 5 — Prospecção no CRM (pedido do Lucas)
Pipeline: **base CNPJ → filtro → enriquecimento → pontuação → CRM**.
1. **Filtro (fora da Vercel):** script Node em streaming sobre os arquivos `Estabelecimentos` da Receita (CSV `;`, latin-1, sem cabeçalho). Filtro: situação ativa, CNAE da lista abaixo, UF/cidade configuráveis, sem MEI. Saída: tabela `eva_studio_prospects` (CNPJ, razão, fantasia, CNAE, porte, cidade/UF, telefone, e-mail, data de abertura). Roda local ou no worker, mensal.
2. **CNAEs iniciais** (conferir na tabela CONCLA antes de rodar):
   - Loteadoras: 6810-2/03 (loteamento de imóveis próprios), 4110-7/00 (incorporação)
   - Logística: 4930-2/01, 4930-2/02 (transporte rodoviário de carga), 5211-7/99 (depósitos), 5250-8/03 (agenciamento de cargas), 5250-8/05 (operador multimodal), 5320-2/02 (entrega rápida)
   - Cobrança: 8291-1/00
   - Atendimento em massa: 8220-2/00 (teleatendimento)
   - Vendas: 4619-2/00 (representantes comerciais), 7490-1/04 (intermediação de negócios) — **"vendas" é amplo, definir com o Lucas**
3. **Site:** domínio do e-mail cadastrado no CNPJ quando não for genérico (gmail, hotmail, uol, bol, yahoo, outlook…). Sem e-mail corporativo → opcional Google Places (pago, termos não deixam guardar além do `place_id`).
4. **Sinais no site** (fetch da home via `safeFetch`, sem navegador): CRM/marketing (HubSpot, RD Station, Pipedrive, Kommo/amoCRM), chat/atendimento (Zendesk, Zopim, JivoChat, Tawk, Octadesk, Zenvia, Huggy, Movidesk, Blip, Leadster), link de WhatsApp (`wa.me`, `api.whatsapp.com`), formulário, pixel. Assinaturas no anexo A. Regras próprias para Kommo, Octadesk, Movidesk e Blip (o fork aberto do Wappalyzer não cobre).
5. **Pontuação** (configurável): fit de setor + porte + tem WhatsApp no site + tem chat/CRM concorrente (sinal de dor de atendimento) + sem nada (sinal de pouca maturidade digital = alvo do Lucas: "não mexe com tecnologia").
6. **CRM:** cria Company (CNPJ, setor, site, cidade/UF), Contact quando houver contato corporativo, Deal no funil "Prospecção" etapa "Novo", com os sinais em campos personalizados. Deduplica por CNPJ.
7. **LGPD:** só dado de empresa por padrão; sócio (QSA) só se ligado explicitamente; registro da fonte em cada lead; botão de excluir/opt-out; documento de legítimo interesse. Sem disparo automático (WhatsApp exige opt-in para iniciar conversa).
- Testes: parser da linha do CSV (latin-1, campos), filtro por CNAE, detector de stack com HTML de exemplo de cada ferramenta, pontuação, dedup por CNPJ.

## 4. Achados de segurança/bugs (já vistos, recomendo encaixar)
Entram na Fase 0/1 por serem pequenos e por tocarem as mesmas áreas:
- `getCredentialSecret` e `mcpServer.findUnique` sem filtro de organização (`credentials.ts:7`, `flow-engine.ts:502`) — fluxo de um cliente pode apontar para credencial de outro.
- Webhook do TikTok recebe o `INTERNAL_API_SECRET` mestre na URL.
- Sem deduplicação por `externalId` no WhatsApp QR, Telegram e TikTok; sem trava por conversa.
- Fila do worker sem `SKIP LOCKED` (vai para a Fase 4).
- Automação de comentário: `sendPrivateCommentReply` não confere `res.ok`, `catch {}` engole erro, conta disparo mesmo com falha (vai para a Fase 1).
- `segments.ts:36`: `channel` listado como campo de texto, mas Contact não tem essa coluna.

## 5. Como vamos testar (todas as fases)
1. **Teste automático antes do código** (TDD) para toda regra de decisão: casamento de gatilho, classificação de evento da Meta, validação de campo, payload de template, detector de stack.
2. **Fixtures reais**: payloads de webhook copiados da conta de teste vão para `src/test/fixtures/meta/*.json`.
3. **Playground** do próprio app (canal `builder_preview`, mesmo motor) para gatilho de DM e captura, sem depender da Meta.
4. **Ponta a ponta** com conta de teste (IG Business + número WhatsApp de teste do app Meta em modo desenvolvimento), seguindo o roteiro de cada plano.
5. `npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run build` verdes antes de cada PR.

## 6. Pendências que dependem de vocês
- [ ] Banco de staging (Supabase separado ou branch) — sim/não.
- [ ] Conta Instagram Business de teste ligada ao app Meta (modo desenvolvimento) e um número de teste do WhatsApp Cloud.
- [ ] Acesso de push no `matheusflytech/eva-studio` pela conta `developersbeeno` ou fluxo de PR com aprovação do Matheus.
- [ ] Lista final de CNAEs para "vendas" e UFs/cidades alvo da prospecção.
- [ ] Orçamento para Google Places (opcional, só se o domínio do e-mail não bastar).

---

## Anexo A — Assinaturas de stack (origem: fork aberto do Wappalyzer `enthec/webappanalyzer` = W; conhecimento próprio a validar = K)

| Ferramenta | Script / domínio no HTML | Global JS |
|---|---|---|
| HubSpot (W) | `js.hs-scripts.com` | `_hsq` |
| HubSpot Chat (W) | `js.usemessages.com` | `HubSpotConversations` |
| RD Station (W) | `d335luupugsy2.cloudfront.net/js/loader-scripts/` | `RDStation` |
| Pipedrive (W/K) | `leadbooster-chat.pipedrive.com`, `webforms.pipedrive.com` | `LeadBooster` |
| Kommo/amoCRM (K) | `gso.kommo.com`, `amocrm.ru` | `amoSocialButton` |
| Zendesk (W) | `static.zdassets.com` | `zE` |
| Zendesk Chat (W) | `v2.zopim.com` | — |
| Blip (K) | `blip-chat-widget`, `blipchat` | `BlipChat` |
| Leadster (W) | — | `neurolead` |
| JivoChat (W) | `jivosite.com` | `jivo_api` |
| Tawk.to (W) | `embed.tawk.to` | `Tawk_API` |
| Octadesk (K) | `cdn.octadesk.com`, `chat.octadesk.com` | `octadesk` |
| Zenvia (W) | `static.zenvia.com` | `ZenviaChat` |
| Huggy (W) | `huggy.io` | `Huggy` |
| Movidesk (K) | `chat.movidesk.com` | `movideskLogin` |
| WhatsApp | `wa.me/`, `api.whatsapp.com/send` | — |

## Anexo B — Fontes
- Webhooks IG (story reply/mention, `message_reactions`, `subscribed_apps`): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/webhooks
- Stories do usuário: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/stories
- Quick replies IG: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/quick-replies
- Templates WhatsApp: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- Webhook de status de template: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update/
- Interativos WhatsApp (lista, CTA URL): https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-list-messages
- Dados abertos CNPJ: https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/cadastros/consultas/dados-publicos-cnpj
- ANPD, legítimo interesse (guia 2024): https://www.gov.br/anpd/pt-br
