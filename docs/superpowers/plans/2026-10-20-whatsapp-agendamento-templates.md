# WhatsApp: envios agendados e criação de templates na Meta — Plano

> To-do 6 / Fase 4 do roadmap (`2026-10-18-roadmap-todos-eva.md`). TDD: cada regra de decisão nasce com teste antes do código.

**Goal:** (1) disparo agendado confiável — contagem certa no WhatsApp QR, fila travada com `FOR UPDATE SKIP LOCKED`, agendar/cancelar/reagendar em horário de São Paulo; (2) mensagem avulsa agendada para um contato a partir da conversa e da ficha do negócio, respeitando a janela de 24h do WhatsApp oficial; (3) criar template na Meta pela tela de Aprovações, com prévia ao vivo e validação; (4) acompanhar aprovação pelo webhook (`message_template_status_update`, `template_category_update`).

**Contexto obrigatório:**
- Branch do worktree, base `feat/dashboards-funil`. Tudo local; sem push/PR.
- `.env` aponta para produção: **nada de `db push`/migrate, nada de escrita no banco, nada de Graph de verdade.** Testes só com mock.
- Schema só aditivo, SQL em `prisma/sql/2026-10-20-whatsapp-agendamento-templates.sql` (IF NOT EXISTS, transação). O SQL precisa ser aplicado **antes** do deploy do app e do worker (colunas novas são lidas pelos dois).
- Outros agentes: API v1 (`src/app/api/v1/**`) e produtos no negócio. Daqui só entra **um** ponto em `src/components/crm/negocio/cabecalho.tsx` (botão "Agendar mensagem").

## Decisões

1. **Mensagem avulsa = Broadcast com `kind = "single"`.** Reaproveita relógio (`runDueBroadcasts`), fila do QR, envio de modelo e placar. Público `manual` com um destinatário. Colunas novas em `Broadcast`: `kind`, `contactRecordId`, `dealId`, `createdById`, `lastError` (sem FK, para não mexer nos models de Contato/Negócio que outro agente está alterando). A tela de Disparos lista só `kind = "campaign"`.
2. **Janela de 24h decidida duas vezes:** ao agendar (se a hora marcada já cai fora da janela e não há modelo aprovado → 400) e na hora de enviar (o cliente pode ter escrito de novo, ou não). Fora da janela com modelo → manda o modelo; sem modelo → falha com motivo legível em `lastError`. Função pura `decidirEnvio`.
3. **Contagem do disparo:** `runBroadcast` só soma em `sentCount` o que saiu de verdade (envio direto). Item que foi para a fila do QR é contado pelo worker quando sai. Fechamento (`done`) numa instrução SQL só, com `CASE`, tanto no app quanto no worker — quem fizer a última conta fecha. O worker passa a somar também no placar da variante (antes ninguém somava `sentCount` de variante no QR).
4. **Trava da fila:** o worker reivindica itens com `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`, status `sending` + `claimedAt`. Item preso em `sending` há mais de 15 min vira `failed` ("envio interrompido") em vez de voltar para `pending` — melhor avisar do que mandar duas vezes. Código da fila em `worker/fila.js`, testável.
5. **Agendado vira "enviando" de forma atômica** (`updateMany where status = scheduled`): duas batidas do relógio não disparam a mesma campanha duas vezes; cancelar só vale enquanto `scheduled`.
6. **Fuso:** o campo de data/hora é sempre lido como horário de São Paulo (`America/Sao_Paulo`), independente do fuso do navegador. Funções puras em `src/lib/fuso-sp.ts`.
7. **Template na Meta:** variável escrita como `{{1}}`, `{{ 2 }}`, `{nome}` ou `{{nome}}` — tudo vira posicional `{{n}}` na Meta, e o modelo local guarda `{chave}` + `variableOrder`, que é o que o runner já usa para preencher. Header de mídia usa a Resumable Upload API (`META_APP_ID`) para obter o `header_handle` do exemplo. AUTHENTICATION usa o formato fixo da Meta (código + botão copiar).
8. **Status do template:** webhook grava `metaStatus`, `metaStatusReason`, `metaStatusAt` e categoria no `MessageTemplate`. A consulta ao vivo continua sendo a fonte da tela; se a Meta não responder, a tela mostra o último status gravado (marcado como "último aviso da Meta").

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `prisma/schema.prisma` | colunas novas em MessageTemplate, Broadcast, OutboundQueueItem |
| `prisma/sql/2026-10-20-whatsapp-agendamento-templates.sql` | criar |
| `src/lib/fuso-sp.ts` (+ test) | criar — São Paulo ⇄ UTC, formatação |
| `src/lib/whatsapp/janela.ts` (+ test) | criar — `decidirEnvio` |
| `src/lib/whatsapp/template-meta.ts` (+ test) | criar — variáveis, validação, payload, prévia |
| `src/lib/server/meta-templates.ts` (+ test) | criar — Graph: criar template, subir mídia de exemplo (fetch mockado) |
| `src/lib/server/meta-template-eventos.ts` (+ test) | criar — parser e gravação dos eventos de template |
| `src/lib/server/broadcast-runner.ts` (+ test) | contagem, claim atômico, janela para `single` |
| `src/lib/server/agendamento.ts` (+ test) | criar — agendar avulsa, cancelar, reagendar |
| `worker/fila.js` (+ `worker/fila.test.ts`) | criar — claim com SKIP LOCKED, fechamento do disparo |
| `worker/index.js` | usar `fila.js` |
| `vitest.config.mts` | incluir `worker/**/*.test.ts` |
| `src/app/api/webhooks/meta/route.ts` | despachar eventos de template |
| `src/app/api/agents/[agentId]/meta-templates/route.ts` | POST cria; GET usa status local como reserva |
| `src/app/api/agents/[agentId]/meta-templates/midia/route.ts` | criar — sobe exemplo de mídia |
| `src/app/api/agents/[agentId]/broadcasts/route.ts` | só campanhas; `lastError` |
| `src/app/api/agents/[agentId]/broadcasts/[broadcastId]/route.ts` | criar — PATCH cancelar/reagendar |
| `src/app/api/mensagens-agendadas/route.ts`, `[id]/route.ts`, `destinos/route.ts` | criar |
| `src/components/whatsapp/previa-whatsapp.tsx` | criar — balão estilo WhatsApp |
| `src/components/whatsapp/campo-data-sp.tsx` | criar — data/hora em SP com atalhos |
| `src/components/whatsapp/agendar-mensagem.tsx` | criar — modal de agendamento avulso |
| `src/components/aprovacoes/criar-template.tsx` | criar — formulário + prévia |
| `src/app/(app)/aprovacoes/page.tsx` | botão "Novo template", status local |
| `src/app/(app)/disparos/page.tsx` | horário SP, "agendado para", cancelar/reagendar |
| `src/components/inbox/compositor.tsx` | botão "Agendar" |
| `src/components/crm/negocio/cabecalho.tsx` | **único** ponto: botão "Agendar mensagem" |

## Tarefas (TDD)

### 1. Fuso de São Paulo — `src/lib/fuso-sp.ts`
- [ ] Teste: `deSaoPaulo("2026-10-20T09:00")` = `2026-10-20T12:00:00.000Z`; entrada inválida → `null`; `paraCampoSaoPaulo(date)` devolve o inverso; `formatarSaoPaulo` → `"20/10/2026 às 09:00"`; atalho "amanhã 9h" a partir de um instante às 23h30 de SP cai no dia seguinte de SP (não no de UTC).
- [ ] Implementar com `Intl.DateTimeFormat` (offset calculado, não fixo em -3).

### 2. Janela de 24h — `src/lib/whatsapp/janela.ts`
- [ ] Teste: QR/Telegram → texto sempre; Meta com última mensagem do cliente há 2h e envio em 1h → texto; envio depois de expirar e com modelo → modelo; sem modelo → erro legível; nunca escreveu (`null`) → precisa de modelo; Meta com só modelo e janela aberta → modelo.
- [ ] Implementar `decidirEnvio({ channel, lastContactMessageAt, quando, temTexto, temModelo })`.

### 3. Payload e validação do template — `src/lib/whatsapp/template-meta.ts`
- [ ] Teste `normalizarVariaveis`: `{{1}} {{2}}` mantém; `{nome}`/`{{nome}}` viram `{{1}}` com chave `nome`; `{{ 1 }}` com espaços; repetida reaproveita a mesma posição; mistura `{nome}` e `{{2}}` numera na ordem de aparição.
- [ ] Teste `validarTemplate`: nome snake_case (maiúscula, espaço, acento, hífen → erro); body vazio / >1024; header texto >60 / mais de 1 variável; footer >60 / com variável; >10 botões, >2 URL, >1 telefone, texto de botão >25; URL com variável sem exemplo; exemplo de variável faltando; body começando/terminando em variável; mídia sem exemplo.
- [ ] Teste `montarPayloadTemplate`: MARKETING com header texto + variável, body com 2 variáveis (`example.body_text: [[...]]`), footer, botões agrupados (respostas rápidas antes das ações), URL dinâmica com exemplo, telefone; header IMAGE com `header_handle`; AUTHENTICATION no formato fixo.
- [ ] Teste `previaTemplate` troca variáveis pelos exemplos.

### 4. Graph — `src/lib/server/meta-templates.ts`
- [ ] Teste (fetch mockado): POST em `/{WABA}/message_templates` com Bearer; devolve `{ id, status, category }`; erro da Meta vira mensagem em português; upload de mídia faz as 2 chamadas da Resumable Upload e devolve o handle; sem `META_APP_ID` → erro claro.

### 5. Webhook de status — `src/lib/server/meta-template-eventos.ts`
- [ ] Teste do parser: `message_template_status_update` APPROVED/REJECTED (com `reason`), `template_category_update` (`new_category`), campo desconhecido → null, value malformado → null; `reason: "NONE"` → null.
- [ ] Teste de gravação (prisma mockado): acha por `metaTemplateId` entre agentes com aquele WABA; cai para nome+idioma; categoria em minúsculas.
- [ ] Rota do webhook despacha antes de exigir `phone_number_id`.

### 6. Contagem do disparo — `broadcast-runner.ts`
- [ ] Teste: 3 destinatários no QR (todos na fila) → `sentCount` não soma nada no app, status fica `sending`; Meta direto → soma e fecha `done`; falha soma `failedCount`; agendado já reivindicado por outra batida → não roda; `single` no Meta fora da janela sem modelo → falha com `lastError`.

### 7. Trava da fila — `worker/fila.js`
- [ ] Teste (pool falso): SQL do claim tem `FOR UPDATE SKIP LOCKED`, muda para `sending`, grava `claimedAt` e usa `RETURNING`; `somarNoDisparo` faz incremento + fechamento numa instrução e soma na variante; `expirarTravados` marca `failed` e soma falha no disparo.

### 8. Agendamento avulso e cancelar/reagendar — `src/lib/server/agendamento.ts`
- [ ] Teste: data no passado → erro; Meta fora da janela sem modelo → erro; cria Broadcast `single` `scheduled`; cancelar só em `scheduled` (`updateMany` com count 0 → erro "já começou"); reagendar valida data e janela.

### 9. Telas
- [ ] Disparos: campo SP + atalhos, "agendado para 20/10/2026 às 09:00 (horário de São Paulo)", botões Cancelar/Reagendar.
- [ ] Aprovações: "Novo template" com formulário, contador, erros ao vivo, prévia estilo WhatsApp; status local como reserva.
- [ ] Conversa (compositor) e ficha do negócio (cabeçalho): "Agendar mensagem".

### 10. Verificação
- [ ] `npx vitest run`, `npx tsc --noEmit -p .`, eslint nos arquivos tocados.

## Configuração na Meta (manual, fora do código)
- App → WhatsApp → Configuração → Webhook: assinar os campos **`messages`** (já usado), **`message_template_status_update`** e **`template_category_update`** (opcional: `message_template_quality_update`).
- Token do System User com `whatsapp_business_management` (criar template) e `whatsapp_business_messaging`.
- `META_APP_ID` no ambiente (upload de mídia de exemplo de header).
