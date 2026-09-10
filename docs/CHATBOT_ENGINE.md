# Motor de fluxo do Eva Studio — referência técnica

Documento de referência pra quem for implementar/estender chatbots no Eva Studio. Cobre exatamente como o
motor de conversa funciona hoje, block por bloco, canal por canal.

## 1. Visão geral — a máquina de estados

Cada conversa é identificada por `(agentId, channel, contactId)`:

- `agentId` — qual agente/bot
- `channel` — `playground` | `whatsapp_qr` | `whatsapp_meta` | `instagram`
- `contactId` — quem está falando (telefone/jid no WhatsApp, igsid no Instagram, um id gerado no Playground)

Essa tripla é única (`eva_studio_conversations`, `@@unique([agentId, channel, contactId])`). A linha guarda:

- `currentNodeId` — em qual bloco a conversa está **parada** esperando algo (ou `null` = não está parada em
  lugar nenhum, a próxima mensagem recomeça do zero)
- `variables` — JSON livre com tudo que já foi capturado (respostas do cliente, resultado de webhooks, etc.)
- `status` — `active` | `waiting_human` | `ended`
- `lastContactMessageAt` — última vez que o **contato** mandou algo de verdade (texto ou toque de botão). Só é
  usado pra calcular a janela de 24h da Meta (§6) — nos outros canais fica só registrado, sem efeito.

Toda mensagem que chega (de qualquer canal) vira uma chamada pra **uma função só**:
`advanceConversation({ agentId, channel, contactId, text?, optionId? })` em
`src/lib/server/flow-engine.ts`. Os adaptadores de canal (worker do WhatsApp, webhook da Meta, Playground) não
têm lógica de conversa nenhuma — só traduzem o formato de mensagem de cada canal pra essa chamada e de volta.

```
WhatsApp (Baileys) ─┐
WhatsApp (Meta)     ─┼──▶ advanceConversation() ──▶ Postgres (estado + fluxo salvo)
Playground          ─┘
```

## 2. Sem fluxo salvo = comportamento antigo

Se o agente nunca teve um fluxo salvo no Builder (`eva_studio_agent_flows` sem linha), `advanceConversation`
cai direto no modo antigo: manda a mensagem pro `outboundUrl` (seu n8n) e devolve a resposta, sem estado
nenhum. Isso existe pra não quebrar agentes que só usam Instruções/Diretrizes livres, sem desenhar nada no
Builder.

## 3. O que cada bloco faz de verdade (quando tem fluxo salvo)

| Bloco (`iconKey`) | Manda mensagem? | Para e espera resposta? | Comportamento |
|---|---|---|---|
| `start` | Não | Não | Só o ponto de entrada, anda pro próximo assim que a conversa (re)começa |
| `message` | Sim (`detail`, ou o modelo escolhido se fora da janela — §6) | Não | Manda o texto e já continua andando |
| `capture` | Sim (`detail`, + botões se tiver `options`) | **Sim** | Pergunta e para. Na próxima mensagem: resolve a resposta (ver §4) e continua |
| `condition` | Não | Não | Avalia `conditionExpression` (`==`,`!=`,`>`,`<`,`>=`,`<=` contra texto ou número, ou só `{var}` truthy), decide `true`/`false`, continua |
| `variable` | Não | Não | Sem `variableExpression`: só garante que a chave existe. Com `variableExpression`: interpola e, se virar uma soma/subtração simples de dois números, calcula — senão guarda o texto interpolado (cobre concatenação) |
| `webhook` | Não | Não | `POST` no `webhookUrl` com `{variables, contactId, agentId}`, guarda a resposta em `variableName`, continua |
| `agent` | Sim (resposta da IA) | **Sim, indefinidamente** | Delega pro `outboundUrl` do agente (mesmo contrato do n8n de sempre), manda a resposta, **fica "alugado" aqui** — todo próximo texto desse contato volta pra IA livre, não sai desse bloco sozinho |
| `human` | Sim (`detail`, opcional) | Sim (`waiting_human`) | Marca a conversa como esperando humano e **fica parada nesse bloco** (não perde a posição) — ver §9, Inbox humano |
| `wait` | Não | Sim (até o prazo) | Guarda `variables.__wait_until`, e ignora mensagens até o prazo passar (ver §8) |
| `end` | Sim (`detail`, opcional) | Não | Zera o estado, `status = "ended"` — a próxima mensagem desse contato recomeça o fluxo do zero |

## 4. Como o menu com botões resolve a resposta

O bloco `capture` pode ter `options: {id, label}[]` (editado no Inspector, seção "Botões"). Quando tem opções:

1. O motor manda a pergunta **com os botões** (`OutboundMessage.options`)
2. O canal manda isso como mensagem interativa de verdade (WhatsApp) ou como chips clicáveis (Playground)
3. Na resposta, o motor tenta, nessa ordem:
   - `optionId` explícito (o cliente tocou o botão)
   - o **número** da opção, se a pessoa digitou (`"2"` → segunda opção) — plano B pro WhatsApp via QR, onde
     botão nativo às vezes não renderiza dependendo da versão do app do destinatário
   - o **texto do rótulo**, comparado sem acento/maiúscula
4. Se nada bateu, **repete a pergunta** em vez de travar a conversa ou seguir por um caminho errado
5. Cada opção vira uma **saída própria** no canvas (não precisa de bloco Condição depois) — arraste do handle
   daquela opção pro próximo bloco

## 5. Contrato de cada canal

### Playground
`POST /api/conversations/message` direto do navegador, autenticado pelo cookie de sessão normal (o usuário
logado só pode mexer nos próprios agentes — checado via `requireOrgId()`).

### WhatsApp via QR code (Baileys)
O worker (`worker/index.js`, roda fora da Vercel) recebe a mensagem do WhatsApp, chama
`POST /api/conversations/message` com header `X-Internal-Secret` (variável `INTERNAL_API_SECRET`, igual nos
dois lados), manda as respostas de volta pelo socket do Baileys. Botão nativo é tentado primeiro
(`sock.sendMessage(..., {buttons: [...]})`), com o texto numerado como plano B sempre junto (ver §4).

### WhatsApp oficial (Meta Cloud API)
`src/app/api/webhooks/meta/route.ts` — mesma ideia, mas chama `advanceConversation` **direto** (é o mesmo
processo Next.js, não precisa do segredo interno). Só funciona depois que existirem `META_APP_SECRET` e
`META_WEBHOOK_VERIFY_TOKEN` no ambiente — ver `worker/META_SETUP.md` e `docs/meta-business-runbook.html`.
Conexão por agente fica em `eva_studio_meta_connections` — via Embedded Signup real
(`src/components/agent-studio/meta-whatsapp-connect.tsx` + `src/app/api/agents/[agentId]/meta-connection/route.ts`,
que troca o `code` do widget por um token de verdade) quando `NEXT_PUBLIC_META_APP_ID`/`NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID`
existirem, ou inserção manual antes disso.

### Instagram (Instagram Messaging API)
Mesmo webhook (`src/app/api/webhooks/meta/route.ts`), payload diferente — a Meta manda `object: "instagram"` com
`entry[].messaging[]` (`sender.id` = igsid, `message.text`), em vez do formato de WhatsApp. Resolve a conexão por
`eva_studio_instagram_connections.igBusinessId` (= `entry.id`), chama `advanceConversation` com
`channel: "instagram"`, manda a resposta via `POST /{ig-business-id}/messages`. **Sem Embedded Signup próprio
ainda** — conexão manual (`src/components/agent-studio/instagram-connect.tsx`), com `igBusinessId` e
`pageAccessToken` obtidos no painel do app Meta (ver `docs/meta-business-runbook.html` §02). Instagram não tem
modelo de mensagem aprovado — fora da janela de 24h (mesma regra do §6, mas sem válvula de escape) simplesmente
não dá pra iniciar contato; o motor não marca `outsideWindow`/`requiresTemplate` pra esse canal porque não
haveria nada a fazer com essa informação.

## 6. Janela de 24h e modelos de mensagem (canal Meta)

Regra oficial do WhatsApp Business (Meta): o negócio só pode mandar **texto livre** em resposta enquanto a
"janela de atendimento ao cliente" estiver aberta — até 24h depois da última mensagem (ou toque de botão) que o
**contato** mandou. Fora dela, só é permitido mandar uma **mensagem de modelo** já aprovada no Meta Business
Manager. Isso só existe de verdade pro canal `whatsapp_meta` — WhatsApp via QR (Baileys) e Playground não são a
API oficial, então essa regra não se aplica a eles (o motor nunca marca `outsideWindow` pra esses canais).

**Como o motor decide se a janela tá aberta** (`isOutsideWindow` em `flow-engine.ts`): uma mensagem/toque de
verdade do contato *sempre* reabre a janela — então enquanto `advanceConversation` está respondendo a um evento
genuíno (`text` ou `optionId` preenchido), `outsideWindow` é sempre `false`. Só fica `true` quando o motor é
acordado **sem** nada vindo do contato — hoje, isso só acontece na retomada automática de um bloco `wait`
vencido (§8) — e o último `lastContactMessageAt` já passou de 24h.

**Modelos de mensagem** (`eva_studio_message_templates`, CRUD na aba do agente em "Modelos de mensagem"):

- `bodyText` — o texto com `{variavel}` (mesma sintaxe do resto do motor), usado só pra pré-visualização e pra
  montar `variableOrder` automaticamente (a ordem das variáveis no texto, extraída ao salvar)
- `metaTemplateName` / `metaLanguageCode` — precisam ser **idênticos** ao que foi registrado de verdade no Meta
  Business Manager. A Meta usa parâmetros posicionais (`{{1}}`, `{{2}}`...) no template aprovado — não tem como
  validar isso automaticamente sem chamar a API de gerenciamento de templates da Meta (que exige acesso mais
  avançado), então a responsabilidade de manter a mesma ordem é de quem cadastra

No bloco `message`, o campo "Modelo fora da janela de 24h" guarda um `templateId` opcional. Em
`resolveOutboundMessage`:

1. Janela aberta (ou canal ≠ `whatsapp_meta`) → manda `detail` normal, sem nenhuma marcação
2. Janela fechada + bloco tem `templateId` + o modelo tem `metaTemplateName` → resolve pra
   `OutboundMessage.template = {name, languageCode, parameters}`, com `parameters` montado na ordem de
   `variableOrder` a partir dos valores atuais das variáveis da conversa
3. Janela fechada + sem modelo (ou modelo sem `metaTemplateName`) → ainda manda o texto livre, mas marca
   `requiresTemplate: true`

Quem manda de verdade decide o que fazer com isso: `sendMetaMessage` (`src/app/api/webhooks/meta/route.ts`) usa
`type: "template"` da Graph API quando vem `template`, e **nem tenta enviar** quando vem `requiresTemplate`
(evita gastar chamada sabendo que a Meta rejeita). A página "Conversas" mostra um badge "Dentro da janela ·
Xh restantes" / "Fora da janela — precisa de modelo" por conversa, calculado a partir de `lastContactMessageAt`.

## 7. Extensões ainda não implementadas

- **Retomar depois do `agent`**: hoje quem cai no bloco Agente de IA fica lá pra sempre (a IA assume). Se quiser
  que a IA "devolva" o controle pro fluxo em algum momento (ex: quando detectar uma palavra-chave), precisa de
  um sinal de saída — o jeito mais simples é o seu n8n devolver um campo extra tipo `{reply, done: true}` e o
  motor ler isso pra sair do bloco.
- **Disparo agendado**: hoje um disparo (§10) manda tudo na hora que o botão é clicado. Agendar pra um horário
  futuro (campanha, lembrete recorrente) precisa de um cron de verdade — não existe hoje na Vercel.
- **Auto-submissão de template pra Meta**: hoje quem cadastra um `MessageTemplate` no Eva Studio já tem que ter
  registrado o mesmo texto manualmente no Meta Business Manager antes. Uma API própria pra criar o template
  direto na Meta (e sincronizar o status de aprovação) fecharia esse ciclo manual.
- **Confirmação de match de posicional**: nada valida que a ordem de `variableOrder` bate com os `{{1}}`,
  `{{2}}`... do template de verdade aprovado na Meta — depende de quem cadastrou ter feito certo.

`variable` mais rico, `condition` com mais operadores, inbox de humano e disparo em massa — que estavam listados
aqui antes — já foram implementados; ver §3, §9 e §10.

## 8. Nota sobre o bloco "Esperar"

Sem uma automação externa, o motor só roda quando alguém manda mensagem — não existe um "despertador" próprio.
Dois jeitos como isso foi resolvido:

- **Padrão simples** (Meta, Playground): a espera só é verificada quando a *próxima* mensagem chega — se o
  prazo não passou, essa mensagem é ignorada silenciosamente.
- **Padrão ativo** (worker do WhatsApp via QR, que já fica ligado 24/7): a cada 15s
  (`resumeDueWaits` em `worker/index.js`) o worker pergunta ao banco quem tem prazo vencido e força a
  continuação sozinho, sem precisar de mensagem nova do contato. Esse é o único canal com essa automação hoje.

## 9. Inbox humano

Quando o motor entra num bloco `human`, a conversa fica `waiting_human` e parada **nesse mesmo bloco**
(`currentNodeId` aponta pra ele, não vira `null`) — é isso que permite retomar de onde parou depois.

- **Responder manualmente** — `POST /api/conversations/[id]/reply` (`src/app/api/conversations/[id]/reply/route.ts`).
  Não passa pelo motor: grava a mensagem com `role: "human"` (pra distinguir de `"bot"` na transcrição) e manda
  de verdade pro canal — direto via Graph API pro `whatsapp_meta`, ou enfileirada (ver abaixo) pro `whatsapp_qr`.
  Playground/prévia não têm destinatário real, só fica registrado.
- **Retomar o bot** — `POST /api/conversations/[id]/resume` (`.../resume/route.ts`). Sai de `waiting_human` e
  pula pro nó seguinte ao bloco `human` (`nextNodeId`, exportado de `flow-engine.ts`) — sem saída conectada ali,
  a próxima mensagem do contato recomeça o fluxo do zero (mesmo comportamento de "conversa nova").
- **Fila de saída pro WhatsApp via QR** — o app principal (serverless) não segura o socket do Baileys, então
  respostas manuais nesse canal viram uma linha em `eva_studio_outbound_queue`; o worker drena isso por polling
  (`drainOutboundQueue` em `worker/index.js`, a cada 4s) e manda de verdade pelo socket já aberto.

UI: página "Conversas" (`src/app/(app)/conversas/page.tsx`) mostra a caixa de resposta e o botão "Retomar bot"
só quando a conversa selecionada está `waiting_human`, e rotula as mensagens `role: "human"` como "Atendente".

## 10. Disparos (mensagem ativa)

Mandar mensagem sem esperar o contato escrever primeiro — campanha, lembrete, aviso. Um envio único por
clique (sem agendamento ainda, ver §7), pra uma lista de contatos digitada na hora.

`POST /api/agents/[agentId]/broadcasts` (`src/app/api/agents/[agentId]/broadcasts/route.ts`) cria uma linha em
`eva_studio_broadcasts` (contador de enviados/falhados) e:

- **`whatsapp_meta`**: síncrono, na própria função serverless — chama a Graph API com `type: "template"` pra
  cada contato (capado em 200 destinatários por disparo). **Sempre exige um `MessageTemplate`** — um disparo é
  por definição fora da janela de 24h pra praticamente todo mundo da lista, então texto livre não seria aceito
  pela Meta mesmo; os valores das variáveis do template são os mesmos pra todos os contatos do disparo (não tem
  dado por contato pra personalizar além disso hoje).
- **`whatsapp_qr`**: texto livre (sem restrição de janela, não é a API oficial) — cada contato vira uma linha em
  `eva_studio_outbound_queue` com o `broadcastId` marcado; o worker drena e, a cada envio, atualiza
  `sentCount`/`failedCount` do disparo (`bumpBroadcast` em `worker/index.js`), fechando (`status: "done"`)
  quando todo mundo foi processado.

UI: página "Disparos" (`src/app/(app)/disparos/page.tsx`) — formulário + histórico com progresso em tempo real
(polling a cada 4s).

## 11. Automações de comentário do Instagram

Igual o recurso de comentário do ManyChat: alguém comenta uma palavra-chave (ou qualquer comentário) num
post/reel, o Eva Studio responde publicamente (opcional) e manda uma DM — que a partir daí entra no canal
`instagram` normal (§5) e cai no fluxo do Builder como qualquer conversa nova.

**Modelo** (`eva_studio_comment_automations`, `CommentAutomation`): `mediaId` (vazio = qualquer post),
`keyword` (vazio = qualquer comentário; senão lista separada por vírgula, substring case-insensitive),
`publicReply` (opcional), `dmMessage`, `active`, `triggerCount`.

**Casamento** (`matchCommentAutomation` em `src/lib/server/comment-automation.ts`, a MESMA função usada tanto
pelo webhook de verdade quanto pelo simulador — garante que "o que o simulador mostra" é exatamente "o que vai
acontecer de verdade"): entre as automações ativas que batem, a mais específica vence — post + palavra-chave >
só post > só palavra-chave > gatilho genérico.

**Webhook de verdade** (`handleInstagramEntries` em `src/app/api/webhooks/meta/route.ts`): a Meta manda o
comentário via `entry[].changes[]` com `field: "comments"` (`value.id`, `value.text`, `value.from.id`,
`value.media.id`) — formato diferente de `entry[].messaging[]` (mensagens diretas), mesmo webhook. Ao bater:
`POST /{comment-id}/replies` (resposta pública, se tiver) e `POST /{comment-id}/private_replies` (a DM — único
endpoint que consegue iniciar uma conversa sem o contato ter mandado mensagem antes). Registra a transcrição
(o texto do comentário como "contact", a DM como "bot") e incrementa `triggerCount`. **Não deduplicado**: a Meta
pode reentregar o mesmo evento de webhook, o que teoricamente manda a mesma DM duas vezes num reenvio raro.

**Simulador** (`CommentSimulator` dentro de `comment-automations-editor.tsx`): sem conta Instagram conectada,
digita um comentário fictício e vê qual automação bateria (via
`POST /api/agents/[agentId]/comment-automations/simulate`, sem nenhum efeito colateral — não manda nada, não
grava nada) — e pode continuar digitando pra testar o fluxo depois da DM de verdade, porque a "continuação"
usa o mesmo `POST /api/conversations/message` do Playground (`channel: "builder_preview"`, contactId novo por
simulação), passando pelo motor real.

**Conexão** — duas formas: Instagram Login direto (`instagram-connect.tsx` monta a URL de autorização
`instagram.com/oauth/authorize` com `state=agentId`; callback em
`src/app/api/instagram/oauth/callback/route.ts` troca o `code` por token de longa duração via
`api.instagram.com`/`graph.instagram.com` — dorme até `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`/
`NEXT_PUBLIC_INSTAGRAM_APP_ID` existirem) ou cadastro manual como fallback.

## 12. Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | Modelos `Agent`, `AgentFlow`, `Conversation`, `Message`, `MessageTemplate`, `WhatsAppConnection`, `MetaConnection`, `InstagramConnection`, `OutboundQueueItem`, `Broadcast`, `CommentAutomation` |
| `src/lib/server/flow-engine.ts` | `advanceConversation` — o motor inteiro, único lugar com a lógica de conversa |
| `src/app/api/conversations/message/route.ts` | Entrada HTTP autenticada (sessão OU segredo interno) |
| `src/app/api/conversations/[id]/reply/route.ts`, `.../resume/route.ts` | Inbox humano — §9 |
| `src/app/api/agents/[agentId]/broadcasts/route.ts` | Disparos — §10 |
| `src/app/api/agents/[agentId]/meta-connection/route.ts`, `.../instagram-connection/route.ts` | Conexão por agente dos canais oficiais (formulário manual) |
| `src/app/api/instagram/oauth/callback/route.ts` | Callback do Instagram Login (OAuth) |
| `src/app/api/agents/[agentId]/comment-automations/` | CRUD + simulador das automações de comentário — §11 |
| `src/lib/server/comment-automation.ts` | `matchCommentAutomation` — lógica de casamento, compartilhada entre webhook e simulador |
| `src/app/api/analytics/overview/route.ts` | Dados reais do Dashboard/Insights (mensagens por dia, taxa de resposta, horário de pico) |
| `src/components/agent-studio/builder/flow-node.tsx` | Como cada bloco renderiza (inclui as saídas por opção) |
| `src/components/agent-studio/builder/node-inspector.tsx` | Edição de cada tipo de bloco, incluindo os botões e o seletor de modelo |
| `src/components/agent-studio/builder/variable-picker.tsx` | Seletor visual de `{variavel}` nos campos de texto do Inspector |
| `src/components/agent-studio/builder/auto-layout.ts`, `flow-templates.ts` | Organizar canvas (BFS) e galeria de modelos de fluxo |
| `src/components/agent-studio/message-templates-editor.tsx` | CRUD dos modelos de mensagem (aba do agente) |
| `worker/index.js` | Adaptador do canal WhatsApp via QR (Baileys) — inclui a fila de saída (§9, §10) |
| `src/app/api/webhooks/meta/route.ts` | Adaptador dos canais WhatsApp oficial e Instagram — envia texto, template ou nada, conforme §6 |
