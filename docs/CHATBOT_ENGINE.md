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
- **Auto-submissão de template pra Meta**: hoje quem cadastra um `MessageTemplate` no Eva Studio já tem que ter
  registrado o mesmo texto manualmente no Meta Business Manager antes. Uma API própria pra criar o template
  direto na Meta (e sincronizar o status de aprovação) fecharia esse ciclo manual.
- **Confirmação de match de posicional**: nada valida que a ordem de `variableOrder` bate com os `{{1}}`,
  `{{2}}`... do template de verdade aprovado na Meta — depende de quem cadastrou ter feito certo.

`variable` mais rico, `condition` com mais operadores, inbox de humano, disparo em massa e disparo agendado —
que estavam listados aqui antes — já foram implementados; ver §3, §9, §10 e §15.

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

## 12. Widget do site + Leads (CRM interno)

Canal `website` — chat embutível pra captar lead direto do site, sem depender de WhatsApp/Instagram. Pensado
pro uso interno da Beeno (centralizar leads em vez de planilha), mas funciona pra qualquer agente.

**Widget** (`Agent.widgetEnabled`, ligado/desligado em `POST /api/agents/[agentId]/widget`): o embed é uma
única linha (`<script src=".../api/widget/[agentId]/script.js">`) — `src/app/api/widget/[agentId]/script.js/route.ts`
gera o JS na hora, já com o nome do agente e a origem da API embutidos (sem chamada extra). Roda em **Shadow
DOM** pra não vazar/receber CSS do site hospedeiro, e não depende de nenhuma lib (nem React) — só JS puro,
pra poder ser colado em qualquer stack.

**Conversa proativa**: na primeira visita (sem `contactId` salvo no `localStorage`), o widget espera ~6s e
chama `POST /api/widget/[agentId]/message` **sem texto**. Isso já funciona sem nenhuma mudança no motor — pra
uma conversa nova (`parkedNode` nulo), `advanceConversation` sempre recomeça do "Início" independente de ter
vindo texto ou não, então a "puxada de assunto" é só o comportamento normal do fluxo, disparado sem esperar o
visitante escrever primeiro.

**Rota pública** (`api/widget/[agentId]/message/route.ts`): sem sessão nem `X-Internal-Secret` — a única
"chave" é o próprio `agentId` (igual todo widget embutível de mercado), por isso exige
`agent.widgetEnabled === true` antes de fazer qualquer coisa. CORS aberto (`Access-Control-Allow-Origin: *`),
já que roda em qualquer origem de terceiro.

**Leads = uma leitura de `Conversation`, não uma tabela nova**: `GET /api/leads` lista conversas
`channel: "website"` do org, com `variables` (o que os blocos de Captura do fluxo já pegaram — nome,
telefone, interesse...) e um `Conversation.leadStage` opcional (`novo` | `contatado` | `qualificado` |
`ganho` | `perdido`, editável via `PATCH /api/leads/[id]`, sem efeito nenhum no motor — é só organização da
página). UI em `src/app/(app)/leads/page.tsx`: lista + busca + filtro por estágio + exportar CSV (client-side,
sem passar pelo servidor).

**Desenhando o fluxo pro widget**: começa com `message`/`capture` (não `agent` direto) — o primeiro
`advanceConversation` chamado pelo widget manda `text: ""` se cair num bloco `agent`, o que é um input estranho
pro n8n do agente. Um fluxo típico: mensagem de boas-vindas → captura de nome → captura de telefone/e-mail →
captura de interesse → (opcional) webhook pro CRM externo, se tiver → Agente de IA ou encerramento.

## 13. CRM de contatos: ficha, etiquetas e segmentos

Antes disso, "contato" era só a string `Conversation.contactId` (telefone, igsid, id de visitante) e tudo que o
fluxo capturava ficava num JSON solto em `Conversation.variables`: servia pro motor interpolar `{nome}` e mais
nada. Não dava pra listar, filtrar, segmentar nem disparar pra quem respondeu tal coisa.

**`Contact`** é a ficha da pessoa. Nome, e-mail e telefone são colunas de verdade; o resto do que o fluxo
capturou vira `customFields`. A ligação é automática e sem configuração: no `finish()` do motor,
`syncContactFromConversation` (`src/lib/server/contacts.ts`) varre as variáveis da conversa e sobe pra coluna
certa tudo que bate com `CAPTURE_FIELD_MAP` — um dicionário de sinônimos comparados sem acento, sem separador e
em minúscula, então "Nome Completo", `nome_completo` e `nomecompleto` caem no mesmo lugar.

Duas decisões que valem saber:

- **Nunca apaga dado bom com vazio.** O fluxo pode rodar de novo e passar por uma captura que a pessoa pulou;
  sobrescrever um nome preenchido por string vazia seria perda de informação.
- **Falha do CRM não derruba a conversa.** `syncContact` roda dentro de try/catch e só registra no log: o pior
  caso é uma ficha desatualizada, nunca um bot mudo.

**`Tag`** é etiqueta, o jeito mais simples de segmentar — e o gatilho mais usado pra entrar numa sequência.
Aplicar etiqueta passa sempre por `applyTag()`, nunca por `prisma.contactTag.create` direto, porque é lá que
mora o auto-enrollment (§14). Reaplicar uma etiqueta que o contato já tem não re-dispara nada.

**`Segment`** é um público salvo por regras: `{ field, op, value }` combinadas por `all` (E) ou `any` (OU).
`field` pode ser coluna da ficha, `tag` (tem/não tem) ou `custom:<chave>` (dentro do JSON). A tradução pra
consulta vive em `src/lib/server/segments.ts` e devolve um `where` do Prisma — nunca SQL montado com string,
o que é o que mantém isso seguro mesmo com o usuário digitando o nome do campo livre. Regra inválida (etiqueta
apagada, campo que não existe mais) é descartada em silêncio em vez de quebrar a consulta.

**Opt-in** (`Contact.optIn`) é o que separa relacionamento de spam: disparo por etiqueta/segmento e sequência só
pegam quem está `true`. Lista manual não filtra, porque ali quem digitou assumiu a responsabilidade.

## 14. Sequências (drip) e auto-enrollment

`Sequence` é uma régua de mensagens com espera entre elas. `SequenceStep` guarda `delayMinutes` contado a
partir do passo anterior (ou da inscrição, no passo 1). `SequenceEnrollment` é a inscrição de um contato, e
`nextRunAt` é o relógio.

Como o contato entra:

| `trigger` | Quando |
|---|---|
| `tag` | Ganhou a etiqueta `triggerTagId` (via `applyTag`) |
| `segment` | Passou a bater com `triggerSegmentId` |
| `manual` | Só inscrição à mão, pela tela |

Etiqueta tem um momento exato de aplicação, então o auto-enrollment dela é **por evento** (dentro de `applyTag`).
Segmento não tem: o contato passa a bater com a regra quando um campo muda, quando o tempo passa, quando alguém
importa uma planilha — não existe evento pra assinar. Por isso o gatilho de segmento é **varredura**
(`enrollBySegments`), rodando junto do relógio, e só pegando quem ainda não tem inscrição na régua.

Duas travas que são a diferença entre follow-up e perseguição:

- **`stopOnReply`** (ligado por padrão): qualquer mensagem de verdade do contato tira ele da régua. O gancho
  está no mesmo `syncContact` do motor, então vale pra todo canal de uma vez.
- **`optIn`**: quem saiu da lista não recebe passo nenhum, e `optOutContact()` já para todas as inscrições
  ativas junto.

**Janela de 24h.** No `whatsapp_meta`, um passo que cair fora da janela precisa de `templateId`. Sem ele, a
inscrição para com `stoppedReason` legível ("fora da janela de 24h e o passo não tem modelo aprovado") em vez de
gastar uma chamada que a Meta recusaria de qualquer forma.

**Idempotência.** `processDueEnrollments` só avança `currentStep` depois que a entrega deu certo (ou foi pra
fila do worker). Falha de rede reagenda pra 15 minutos e tenta de novo, em vez de pular o passo silenciosamente.

## 15. Disparo segmentado, agendado e teste A/B

`Broadcast` ganhou `audience` (`manual` | `tags` | `segment`), `scheduledAt` e variantes.

- **Público.** `manual` guarda a lista em `manualRecipients`, o que permite agendar também um disparo de lista
  colada — senão "manual" seria o único público sem hora marcada, sem motivo bom. `tags`/`segment` resolvem os
  destinatários na hora de enviar, então um agendamento pega quem entrou no público depois de criado.
- **Agendamento.** Com `scheduledAt` no futuro o disparo nasce `scheduled` e quem entrega é o worker. **Não é
  cron da Vercel de propósito**: o plano grátis dá 2 cron jobs com frequência mínima de 1x por dia e nem garante
  o minuto, o que não serve pra campanha marcada pras 9h.
- **Teste A/B.** `BroadcastVariant` com sorteio ponderado por `weight`; cada destinatário recebe uma variante e
  o placar fica por variante. `replyCount` é alimentado por `registerBroadcastReply`, chamado pelo motor quando
  o contato responde: conta uma vez por entrega (quem responde cinco vezes não vira cinco pontos) e só dentro de
  7 dias, porque depois disso é conversa nova, não reação à campanha.

Pra existir placar de A/B também no canal oficial (que envia direto pela Graph API, sem passar pela fila),
`deliverToContact` grava um `OutboundQueueItem` com `status: "sent"` como registro de entrega. A tabela da fila
virou, na prática, o log de entrega de campanha.

**Instagram não aceita disparo** e isso é proposital: a Meta encerrou as message tags do Instagram e sobrou só
`HUMAN_AGENT`, proibida pra mensagem automatizada. Fora da janela de 24h não existe disparo legítimo por lá —
oferecer o botão seria vender erro 100.

## 16. Canal Telegram

O canal mais barato de ligar que existe: token do @BotFather, `setWebhook` e pronto. Sem App Review, sem
verificação de negócio, sem janela de 24h, sem modelo aprovado. Serve como canal de verdade e como o jeito mais
rápido de testar um fluxo em um aplicativo de mensagem real enquanto o WhatsApp oficial ainda está em análise.

Diferente do webhook da Meta (que é compartilhado e descobre o agente pelo `phone_number_id`), aqui é **um
webhook por agente** — a URL carrega o `agentId`, porque cada bot pertence a um agente só. A autenticidade vem
do `secret_token` registrado no `setWebhook`, que o Telegram devolve no header
`X-Telegram-Bot-Api-Secret-Token`; sem isso, quem descobrisse a URL conseguiria injetar conversa falsa no fluxo.

As opções do bloco de Captura viram teclado inline, e o `callback_data` do botão carrega o `optionId` — mesma
semântica dos outros canais, então o fluxo é idêntico entre eles.

## 17. Papéis e permissões (RBAC)

O app já isolava por organização, mas todo mundo de dentro podia tudo: um atendente contratado pra responder
conversa podia apagar agente, trocar webhook e disparar campanha.

`Profile.role` é `owner` | `admin` | `agent` | `viewer`, e cada rota declara a permissão que exige via
`requirePermission()` (`src/lib/server/permissions.ts`). Prisma não passa por RLS do Supabase, então a checagem
é no servidor — esconder botão no navegador é conveniência, não segurança.

Perfil criado antes do RBAC é tratado como `owner`, que é o que ele de fato era: migração sem quebrar quem já
usava o app. Duas travas impedem a organização ficar sem dono: ninguém se rebaixa sozinho, e não dá pra rebaixar
o último `owner`.

`Conversation.assignedToId` resolve o outro problema de time: sem atribuição, dois atendentes respondem a mesma
pessoa duas vezes — o que qualquer caixa de entrada compartilhada descobre no primeiro dia.

## 18. Multi-LLM no bloco de Agente de IA

O bloco nativo falava só com a Groq. Agora fala com sete provedores, em três formatos de API:

| Formato | Provedores | Observação |
|---|---|---|
| `openai-compat` | Groq, OpenAI, DeepSeek, OpenRouter, xAI | Mesmo corpo, só muda a URL base |
| `anthropic` | Anthropic (Claude) | `/v1/messages`, `system` é campo de primeiro nível |
| `google` | Gemini | `generateContent`, `functionDeclarations` |

O catálogo vive em `src/lib/llm-providers.ts`, **fora de `server-only`** de propósito: o Inspector do Builder
importa a mesma lista pra montar os seletores, então não existe a chance de a UI oferecer um modelo que o
servidor não conhece.

Detalhes que custaram atenção:

- **Tudo com `fetch` puro, sem SDK.** É o padrão já usado no resto do motor, e três SDKs somariam peso ao bundle
  serverless da Vercel — tamanho de função já foi motivo de corte de escopo neste projeto antes.
- **Anthropic não aceita `temperature`/`top_p`** na família 4.6+: mandar retorna 400. O adaptador simplesmente
  não envia.
- **Anthropic pode recusar com HTTP 200** (`stop_reason: "refusal"`). Sem checar isso antes de ler o conteúdo, a
  recusa apareceria como "resposta vazia" sem explicação. O bloco tem um seletor de esforço, com padrão **baixo**:
  numa resposta de chatbot o que importa é latência.
- **Gemini chama o lado do assistente de `model`**, não `assistant` — o histórico é convertido na entrada.
- **Trocar de provedor no Inspector limpa modelo e credencial**, porque nenhum dos dois é válido no outro.

Provedor vazio significa Groq, que era o único antes disso: fluxo publicado antes do multi-LLM continua rodando
sem migração.

## 19. Busca semântica (pgvector)

A base de conhecimento buscava por **palavra** (full-text do Postgres). Quem pergunta "vocês parcelam?" não
encontrava um documento que diz "aceitamos em até 12x", porque não há palavra em comum.

`KnowledgeChunk` guarda cada pedaço com o vetor do texto. A coluna é `Unsupported("vector(1536)")`: o Prisma não
tem tipo vector, então gravação e busca por distância são SQL cru em `src/lib/server/embeddings.ts`. O índice é
**HNSW com `vector_cosine_ops`**, criado à mão — e HNSW em vez de IVFFlat porque IVFFlat precisa ser treinado
sobre dados já existentes, e uma tabela vazia geraria um índice ruim.

Decisões:

- **Dimensão fixa em 1536** pra um índice servir a todos os provedores. Modelo que não é 1536 nativo recebe o
  pedido de dimensão reduzida (`dimensions` na OpenAI, `outputDimensionality` no Gemini).
- **Opcional por agente.** Sem provedor configurado, a busca é a de antes. Um upload nunca falha porque a chave
  de embedding não foi cadastrada — `indexDocument` devolve 0 e segue.
- **Cada chunk guarda o modelo que o gerou**, e a busca filtra por ele. Vetor de modelos diferentes não é
  comparável; sem esse filtro o ranking sairia sem sentido em vez de dar erro visível. Trocar o modelo reindexa
  tudo.
- **A busca é híbrida.** Vetor sozinho erra em nome próprio, código de produto e número — coisas que o full-text
  acerta de olhos fechados. Os dois rankings são fundidos por **RRF** (cada trecho ganha 1/(60+posição) em cada
  lista, e os pontos somam), que é o jeito padrão de juntar rankings de escalas diferentes sem ter que normalizar
  score de cosseno contra `ts_rank`, que não são comparáveis.

## 20. Ferramentas via MCP

MCP (Model Context Protocol) é o protocolo aberto que padroniza "aqui estão minhas ferramentas". Em vez de
configurar uma chamada HTTP por integração, o servidor se apresenta e o agente descobre sozinho o que dá pra
fazer.

`McpServer` é da **organização**, não do agente: o mesmo servidor costuma servir vários agentes, e cadastrar a
credencial uma vez é o ponto. O bloco `tool-mcp` conecta na porta roxa de um Agente de IA e aponta pra um
servidor; marcar ferramentas é opcional (nenhuma marcada = todas).

Um bloco MCP vira **N ferramentas**, diferente de todos os outros blocos, que viram uma. Por isso a montagem das
ferramentas em `runAiAgent` é imperativa em vez de um `map`.

Três sutilezas do transporte Streamable HTTP que quebram quem implementa de primeira, e que estão tratadas em
`src/lib/server/mcp-client.ts`:

1. **A resposta pode vir como JSON puro OU como SSE**, dependendo do servidor. Os dois precisam ser aceitos.
2. **O `initialize` pode devolver um `Mcp-Session-Id`** que tem que ser repetido em toda chamada seguinte — ou
   pode não devolver nada. Testado contra os dois casos reais: DeepWiki não usa sessão, Hugging Face usa.
3. **Nome de ferramenta é prefixado pelo índice do bloco** (`mcp_0_ask_question`), senão dois servidores que
   expõem uma ferramenta de mesmo nome colidiriam.

Tudo passa por `safeFetch`: a URL é digitada pelo usuário, e sem isso um servidor MCP apontado pra
169.254.169.254 leria metadados da nuvem. Efeito colateral aceito: `safeFetch` usa `redirect: "error"`, então um
servidor MCP que responde com redirect não funciona.

Servidor fora do ar **não derruba o turno**: o agente segue com as outras ferramentas e o erro fica no log.

## 21. Canal Messenger

O canal mais barato de adicionar, porque reaproveita tudo: mesma Graph API, mesmo webhook compartilhado
(`/api/webhooks/meta`), mesma verificação de assinatura. Muda só o `body.object` (`"page"`) e o envio, que é
`/me/messages` com `recipient.id` em vez do `to` do WhatsApp.

A conexão é descoberta pelo **id da Página**, mesmo papel do `phone_number_id` no WhatsApp e do `igBusinessId`
no Instagram.

Dois cuidados no adaptador:

- **`is_echo`** é a própria Página aparecendo no webhook ao enviar. Entrar no fluxo com isso faria o bot
  conversar sozinho.
- **Salvar o token não basta**: a rota também chama `subscribed_apps` pra assinar a Página nos campos de
  mensagem. Sem isso a conexão parece certa e nada chega — é o erro mais comum de quem configura à mão.

Messenger fica **fora de Disparos**, pelo mesmo motivo do Instagram: as message tags foram restritas em abril de
2026, e fora da janela de 24h não existe disparo legítimo.

## 22. Canal TikTok

TikTok Business Messaging, pela Business API (`business-api.tiktok.com/open_api/v1.3`). Três diferenças que
moldam `src/lib/server/tiktok.ts`:

- **Token curto.** O access token vale ~24h e o refresh ~30 dias, então renovar faz parte do funcionamento
  normal, não é tratamento de erro. `getValidAccessToken` renova sozinho quando falta menos de 1h.
- **Autenticação por header próprio**: `Access-Token`, não `Authorization`.
- **Responde 200 com `code != 0`** quando dá erro de negócio. Checar só o status HTTP deixaria falha passar
  como sucesso.

O identificador de conversa é `conversation_id`, não um id de usuário — é ele que volta no envio, então é ele
que vira o `contactId`.

O TikTok **não assina o corpo** como a Meta. A única prova de origem possível é um segredo na querystring do
callback, que a tela de conexão já monta pronto pra colar no portal.

**Duas travas que não dependem do código:** a API é restrita por região (não atende conta registrada no Espaço
Econômico Europeu, Suíça e Reino Unido) e exige app aprovado no portal de desenvolvedor.

**Ponto aberto, dito com todas as letras:** a base da API e o modelo de autenticação estão confirmados na
documentação pública, mas os **caminhos exatos dos endpoints de mensagem** só aparecem no portal, que exige login
de desenvolvedor aprovado. Por isso eles são configuráveis por variável de ambiente
(`TIKTOK_SEND_PATH`, `TIKTOK_REFRESH_PATH`, `TIKTOK_API_BASE`) — se o caminho real for outro, é mudar a variável,
não o código.

## 23. Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | Modelos `Agent`, `AgentFlow`, `Conversation`, `Message`, `MessageTemplate`, `WhatsAppConnection`, `MetaConnection`, `InstagramConnection`, `TelegramConnection`, `OutboundQueueItem`, `Broadcast`, `BroadcastVariant`, `CommentAutomation`, `Contact`, `Tag`, `ContactTag`, `Segment`, `Sequence`, `SequenceStep`, `SequenceEnrollment` |
| `src/app/api/widget/[agentId]/message/route.ts`, `.../script.js/route.ts` | Widget embutível (canal `website`) — §12 |
| `src/app/api/leads/route.ts`, `.../[id]/route.ts` | Leads (CRM interno) — §12 |
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
| `src/lib/server/contacts.ts` | Ficha do contato: `syncContactFromConversation`, `applyTag`, `optOutContact` — §13 |
| `src/lib/server/segments.ts` | Regras de segmento → `where` do Prisma — §13 |
| `src/lib/server/sequences.ts` | Régua de drip: inscrição, parada por resposta, `processDueEnrollments` — §14 |
| `src/lib/server/outbound.ts` | Envio de saída por canal, num lugar só, + `registerBroadcastReply` — §15 |
| `src/lib/server/broadcast-runner.ts` | Resolve público, sorteia variante e entrega a campanha — §15 |
| `src/lib/server/permissions.ts` | Papéis e `requirePermission()` — §17 |
| `src/lib/llm-providers.ts` | Catálogo de provedores e modelos, compartilhado servidor/UI — §18 |
| `src/lib/server/llm.ts` | `callLlmWithTools` — os três formatos de API num lugar só — §18 |
| `src/lib/server/embeddings.ts` | Chunk, embedding, indexação e busca vetorial — §19 |
| `src/lib/server/knowledge-search.ts` | Busca híbrida (vetor + full-text, fusão RRF) — §19 |
| `src/lib/server/mcp-client.ts` | Cliente MCP (JSON-RPC sobre Streamable HTTP) — §20 |
| `src/lib/server/tiktok.ts` | Envio e renovação de token do TikTok — §22 |
| `src/app/api/mcp-servers/route.ts` | CRUD + verificação dos servidores MCP — §20 |
| `src/app/api/webhooks/tiktok/[agentId]/route.ts` | Adaptador do canal TikTok — §22 |
| `src/components/agent-studio/channel-connect.tsx` | Conexão de Messenger e TikTok — §21, §22 |
| `src/app/api/internal/scheduler/route.ts` | Relógio: passos de sequência vencidos + disparos agendados (chamado pelo worker) — §14, §15 |
| `src/app/api/webhooks/telegram/[agentId]/route.ts` | Adaptador do canal Telegram — §16 |
| `src/app/(app)/contatos/page.tsx` | Tela de Contatos, Etiquetas e Segmentos — §13 |
| `src/app/(app)/sequencias/page.tsx` | Tela de Sequências (régua e passos) — §14 |
