# Motor de fluxo do Eva Studio — referência técnica

Documento de referência pra quem for implementar/estender chatbots no Eva Studio. Cobre exatamente como o
motor de conversa funciona hoje, block por bloco, canal por canal.

## 1. Visão geral — a máquina de estados

Cada conversa é identificada por `(agentId, channel, contactId)`:

- `agentId` — qual agente/bot
- `channel` — `playground` | `whatsapp_qr` | `whatsapp_meta`
- `contactId` — quem está falando (telefone/jid no WhatsApp, um id gerado no Playground)

Essa tripla é única (`eva_studio_conversations`, `@@unique([agentId, channel, contactId])`). A linha guarda:

- `currentNodeId` — em qual bloco a conversa está **parada** esperando algo (ou `null` = não está parada em
  lugar nenhum, a próxima mensagem recomeça do zero)
- `variables` — JSON livre com tudo que já foi capturado (respostas do cliente, resultado de webhooks, etc.)
- `status` — `active` | `waiting_human` | `ended`

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
| `message` | Sim (`detail`) | Não | Manda o texto e já continua andando |
| `capture` | Sim (`detail`, + botões se tiver `options`) | **Sim** | Pergunta e para. Na próxima mensagem: resolve a resposta (ver §4) e continua |
| `condition` | Não | Não | Avalia `conditionExpression`, decide `true`/`false`, continua |
| `variable` | Não | Não | Garante que a variável existe (hoje é um bloco simples, ver §6 pra evoluir) |
| `webhook` | Não | Não | `POST` no `webhookUrl` com `{variables, contactId, agentId}`, guarda a resposta em `variableName`, continua |
| `agent` | Sim (resposta da IA) | **Sim, indefinidamente** | Delega pro `outboundUrl` do agente (mesmo contrato do n8n de sempre), manda a resposta, **fica "alugado" aqui** — todo próximo texto desse contato volta pra IA livre, não sai desse bloco sozinho |
| `human` | Sim (`detail`, opcional) | Sim (`waiting_human`) | Marca a conversa como esperando humano, para de responder sozinho |
| `wait` | Não | Sim (até o prazo) | Guarda `variables.__wait_until`, e ignora mensagens até o prazo passar (ver §7) |
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
`META_WEBHOOK_VERIFY_TOKEN` no ambiente — ver `worker/META_SETUP.md`.

## 6. Extensões óbvias (ainda não implementadas)

- **`variable` mais rico**: hoje só garante que a chave existe. Daria pra ele copiar de outra variável, fazer
  concatenação simples, ou rodar uma expressão — hoje é só um placeholder funcional.
- **`condition` com mais operadores**: hoje só `==`/`!=` contra string literal, e "é verdadeiro". Pra
  comparações numéricas (`{idade} > 18`) precisa estender `evaluateCondition` em `flow-engine.ts`.
- **Retomar depois do `agent`**: hoje quem cai no bloco Agente de IA fica lá pra sempre (a IA assume). Se quiser
  que a IA "devolva" o controle pro fluxo em algum momento (ex: quando detectar uma palavra-chave), precisa de
  um sinal de saída — o jeito mais simples é o seu n8n devolver um campo extra tipo `{reply, done: true}` e o
  motor ler isso pra sair do bloco.
- **Inbox de humano**: `waiting_human` hoje só para o bot. Não existe tela pra um atendente ver essas
  conversas e responder — a página "Conversas" no menu ainda é decorativa.
- **Mensagem ativa/disparo**: o motor só reage a evento (mensagem chegando). Pra disparar uma mensagem sem
  gatilho (campanha, lembrete), precisa de uma rota nova que chama `advanceConversation` (ou manda direto)
  a partir de um cron/agendamento — a página "Disparos" também ainda é decorativa.

## 7. Nota sobre o bloco "Esperar"

Sem uma automação externa, o motor só roda quando alguém manda mensagem — não existe um "despertador" próprio.
Dois jeitos como isso foi resolvido:

- **Padrão simples** (Meta, Playground): a espera só é verificada quando a *próxima* mensagem chega — se o
  prazo não passou, essa mensagem é ignorada silenciosamente.
- **Padrão ativo** (worker do WhatsApp via QR, que já fica ligado 24/7): a cada 15s
  (`resumeDueWaits` em `worker/index.js`) o worker pergunta ao banco quem tem prazo vencido e força a
  continuação sozinho, sem precisar de mensagem nova do contato. Esse é o único canal com essa automação hoje.

## 8. Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | Modelos `Agent`, `AgentFlow`, `Conversation`, `WhatsAppConnection`, `MetaConnection` |
| `src/lib/server/flow-engine.ts` | `advanceConversation` — o motor inteiro, único lugar com a lógica de conversa |
| `src/app/api/conversations/message/route.ts` | Entrada HTTP autenticada (sessão OU segredo interno) |
| `src/components/agent-studio/builder/flow-node.tsx` | Como cada bloco renderiza (inclui as saídas por opção) |
| `src/components/agent-studio/builder/node-inspector.tsx` | Edição de cada tipo de bloco, incluindo os botões |
| `worker/index.js` | Adaptador do canal WhatsApp via QR (Baileys) |
| `src/app/api/webhooks/meta/route.ts` | Adaptador do canal WhatsApp oficial (Meta) |
