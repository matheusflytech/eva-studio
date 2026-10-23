# Ever Gauzy x EvaApp: o que vale trazer

Pesquisa de 23/10/2026. Fonte do Gauzy: clone raso de `github.com/ever-co/ever-gauzy`
(commit `c9cc8b13`, "Fix GraphQL: resume a cursor whose row is gone at its position"),
lido só como arquivo: nada foi instalado, compilado nem executado. Fonte do EvaApp:
`docs/HANDOFF.md` (seções 1, 9 e 10), `docs/design/PLANO-v6.md` (roteiro do topo),
`src/lib/contrato/rotas.ts` (`SECOES_DO_CONTRATO`), pastas de `src/app/(app)/[contrato]/`
e os 86 `model` de `prisma/schema.prisma`.

Legenda: **[verificado]** = li o arquivo citado; **[não verificado]** = vem de README ou
dedução, sem conferir comportamento rodando. Nenhuma tela do Gauzy foi vista funcionando.

---

## 1. O que é o Gauzy

### 1.1 Em uma frase
Plataforma de gestão "tudo em um" (ERP + CRM + RH + recrutamento + projetos + controle
de horas com app de desktop) da Ever Co. LTD, pensada para agências, freelancers e
empresas de serviço. O centro do produto é o **funcionário e as horas trabalhadas**, não
a conversa com o cliente.

### 1.2 Módulos encontrados no código (não só no README)
`packages/core/src/lib/` tem 193 entradas (módulos e arquivos soltos) e
`packages/plugins/` tem 100 pacotes. Agrupando o que existe de fato **[verificado: nomes
de pasta e entidades]**:

| Área | Pastas no Gauzy |
|---|---|
| CRM | `contact`, `organization-contact` (tipo CLIENT / CUSTOMER / LEAD, orçamento em horas ou valor), `contact-group`, `contact-buyer`, `pipeline`, `pipeline-stage`, `deal` |
| Vendas / financeiro | `invoice` (com `isEstimate` = orçamento), `invoice-item`, `invoice-estimate-history`, `estimate-email`, `public-share/invoice`, `payment`, `payment-term`, `income`, `expense`, `expense-categories`, `accounting-template`, `tax-line`, `currency`, `money`, `sequence` (numeração de documentos) |
| Comércio (plugins) | `catalog`, `pricing`, `promotion`, `cart`, `order`, `payment`, `fulfillment`, `returns`, `purchasing`, `inventory`, `marketplace`, `entitlement`, `product-reviews`; no core: `product*`, `warehouse`, `merchant`, `channel` (canal de venda de e-commerce), `rule` (motor de regras de preço/promoção) |
| Metas | `goal`, `goal-kpi`, `goal-kpi-template`, `goal-template`, `goal-time-frame`, `goal-general-setting`, `keyresult`, `keyresult-update`, `organization-strategic-initiative` |
| Agenda | `employee-appointment`, `appointment-employees`, `event-types`, `availability-slots`, `employee-availability`, `official-holiday`; páginas públicas em `packages/plugins/public-layout-ui` |
| Aprovações | `approval-policy`, `request-approval`, `request-approval-employee`, `request-approval-team` |
| Colaboração | `comment` (com respostas e "resolvido"), `mention`, `reaction`, `entity-subscription` (seguir um registro), `activity-log` (com valores antes/depois), `favorite`, `resource-link`, `employee-notification` |
| Caixa de entrada (plugin) | `packages/plugins/inbox`: itens QUESTION / APPROVAL / ESCALATION / NOTICE / EMAIL por usuário, com lido, arquivar e adiar; e-mail de entrada por provedor (Resend, SES, Postmark...) |
| IA | `packages/plugins/ai-chat` + `ai-chat-react-ui` (copiloto embutido com Vercel AI SDK), 16 plugins `ai-provider-*`, `integration-ai`, `employee-agent-profile` (agente de IA como "funcionário") |
| MCP | `packages/mcp-server` (ferramentas `deals.ts`, `pipelines.ts`, `organization-contact.ts`, `invoices.ts`, `goals.ts`, `tasks.ts`...), `apps/mcp`, `apps/server-mcp` |
| Integrações | `integration-*` (GitHub, Jira, Upwork, Hubstaff, Zapier, Make, ActivePieces, Plane, WakaTime, Sim), `webhook` (assinatura HMAC, fila de tentativas), `event-outbox`, `idempotency`, `tenant-api-key`, `export-import` |
| E-mail | `email-template` (MJML), `email-history`, `email-send`, `custom-smtp`, plugins `email-provider-*` |
| Relatórios | `dashboard` + `dashboard-widget`, `reports`, `stats`, `employee-statistics` |
| RH | `employee*` (nível, prêmio, despesa recorrente, configurações), `time-off-*`, `payroll-run`, `payroll-item`, `organization-department`, `organization-position`, `organization-employment-type`, `skills` |
| Recrutamento (ATS) | `candidate*` (11 pastas: entrevista, feedback, documentos, experiência...), plugins `job-*` |
| Projetos | `organization-project`, `organization-project-module`, `organization-sprint`, `tasks`, `organization-task-setting`, `organization-team*` |
| Horas | `time-tracking`, apps `desktop`, `desktop-timer`, `agent`; plugins `camshot`, `soundshot` (captura de tela/áudio) |
| Plataforma | `tenant`, `organization`, `role`, `role-permission`, `feature` (liga/desliga recurso por organização), `search` (índice único), `tags` + `tag-type`, `i18n`, `knowledge-base` (central de ajuda) |

**Ponto importante:** o CRM do Gauzy é raso. `deal.entity.ts` tem só `title`,
`probability`, `stage` e `client` (sem valor, sem dono, sem data prevista); `pipeline`
tem `name`, `description`, `stages`; `pipeline-stage` tem `name`, `description`, `index`
**[verificado: `packages/contracts/src/lib/deal.model.ts`, `pipeline.model.ts`,
`pipeline-stage.model.ts`]**. O EvaApp já está muito à frente no núcleo de vendas.

**Cuidado com nomes iguais e significados diferentes [verificado]:**
- `broadcast` no Gauzy é **comunicado interno** (STATUS_REPORT, MILESTONE, ANNOUNCEMENT...,
  `contracts/src/lib/broadcast.model.ts`), não disparo em massa de WhatsApp.
- `sequence` no Gauzy é **numeração de documento** (prefixo, padding, próximo valor), não
  régua/cadência.
- `channel` no Gauzy é **canal de venda de e-commerce** (moeda, região, prefixo de pedido),
  não canal de mensagem.

### 1.3 Stack
TypeScript; API em NestJS (REST + GraphQL); front em Angular + ngx-admin, com partes novas
em React (`packages/ui-react`, `ai-chat-react-ui`); TypeORM, MikroORM e Knex ao mesmo tempo;
Nx + Lerna; apps de desktop em Electron; SQLite para demo, PostgreSQL/MySQL em produção
**[verificado: README, `apps/`, `packages/`]**. Nada disso é a stack do EvaApp (Next.js 16
+ Prisma + Supabase), então mesmo que a licença permitisse, o código não encaixaria sem
reescrita.

### 1.4 Licença e o que ela permite
- `LICENSE` na raiz: **GNU AGPL v3**. `package.json` da raiz: `"license": "AGPL-3.0"`.
  Dos 120 `package.json` em `packages/*` e `packages/plugins/*`, 119 declaram AGPL-3.0 e
  1 está sem campo. Não achei `LICENSE` próprio em subpastas (só de fontes Roboto)
  **[verificado]**.
- `LICENSES.md`: modelo **dual**. Community Edition = AGPL-3.0. Quem não quer cumprir a
  AGPL compra licença comercial da Ever Co. LTD: "Small Business" (receita anual até
  US$ 1 milhão, uma empresa) ou "Enterprise" (acima disso). As marcas "Ever" e "Gauzy" não
  podem ser usadas para promover produto concorrente **[verificado]**.

O que isso significa para o EvaApp (produto fechado, oferecido como SaaS):

| Ação | Pode? |
|---|---|
| Ler o código e a documentação para entender a ideia de um recurso | Sim |
| Reimplementar do zero um recurso parecido (conceito, fluxo, modelo de dados descrito com nossas palavras) | Sim. Ideia e funcionalidade não são protegidas por direito autoral; o texto do código é |
| Copiar arquivos, funções, trechos, SQL de migração, textos de i18n ou de README para o repositório | **Não**, a menos que o EvaApp inteiro passe a cumprir a AGPL |
| Copiar e cumprir a AGPL | Exigiria oferecer **todo o código-fonte do EvaApp** (obra combinada) sob AGPL a todo usuário que acessa pela rede (seção 13), manter avisos de copyright e licença. Inviável para produto fechado |
| Comprar licença comercial da Ever Co. | Possível, mas o código é Angular/NestJS e não serve para nossa stack |
| Rodar o Gauzy sem alteração como serviço separado e falar com ele por API | Tecnicamente fora da "obra combinada", mas qualquer alteração no Gauzy teria de ser publicada; não recomendo (dois produtos para manter) |
| Usar o nome "Gauzy" ou "Ever" no marketing | Não |

**Veredito:** trazer **ideias e desenho de recurso, sim; código, não.** Regra prática:
quem implementar no EvaApp não cola nada do Gauzy; escreve a especificação em português
(como está neste documento) e implementa a partir dela. Isto não é parecer jurídico; se
algum dia houver dúvida sobre um trecho específico, consultar advogado.

---

## 2. Tabela módulo a módulo

| Módulo | Gauzy tem | EvaApp tem | Lacuna no EvaApp |
|---|---|---|---|
| Funis e negócios | Básico: negócio com título, probabilidade, etapa, cliente | Completo: valor, dono, previsão, motivos de perda, regras por etapa, histórico (`DealStageEvent`), quadro paginado, ficha do negócio, cartão por funil | Nenhuma (EvaApp à frente) |
| Contatos e empresas | `organization-contact` (CLIENT/CUSTOMER/LEAD), `contact-group` | `Contact`, `ContactChannel`, `Company`, leads com `leadStage`, página completa, segmentos | Nenhuma relevante |
| Produtos no negócio | Produtos com variantes, tradução, galeria | `Product`, `DealItem` com desconto, MRR/ARR | Variantes (baixo valor) |
| **Orçamento / proposta** | `invoice` com `isEstimate`, PDF (`generate-invoice-pdf.ts`), link público com token (`public-share/invoice`, `estimate-email`), aceite (`isAccepted`), histórico (`invoice-estimate-history`), numeração (`sequence`) | Exportação CSV/PDF do negócio; não há documento de proposta | **Sim, grande** |
| Faturas, pagamentos, recorrência | `invoice`, `payment`, `payment-term`, recorrentes no menu; plugin `payment` | Não | Sim (Pix/boleto já está como P2 no HANDOFF) |
| Tabela de preços, cupons | Plugins `pricing`, `promotion` | Não | Só para clientes de e-commerce |
| **Metas / KPIs** | `goal`, `goal-kpi`, `keyresult`, `goal-time-frame`, modelos de meta | Não (é o P0 nº 10 aberto em `melhorias-crm-skills.md`) | **Sim** |
| **Auditoria** | `activity-log` com `updatedFields`, `previousValues`, `updatedValues`, autor humano ou agente | Linha do tempo do negócio e do contato; `DeletedRecord`/`TrashItem`; sem diff de campo (P0 nº 8 aberto) | **Sim** |
| **Comentários e @menções** | `comment` (respostas, resolvido), `mention`, `reaction`, `entity-subscription` (seguir registro) | `Note` simples, sem resposta nem menção; `Aviso` para notificação | **Sim** |
| **Caixa de decisões (humano no loop)** | Plugin `inbox`: pergunta, aprovação, escalonamento, aviso; lido/arquivar/adiar por usuário; resposta volta para a origem | `Aviso` (só informativo, com `lidoEm`) | **Sim** |
| Aprovações | `approval-policy` + `request-approval` (valor, moeda, aprovadores pessoa/equipe, status) | Tela Aprovações = templates da Meta; aprovação genérica é P1 aberto | Sim |
| **Agendamento** | `event-types` (duração), `availability-slots`, `employee-appointment` (buffer, convidados), páginas públicas de marcar/confirmar em `public-layout-ui` | Calendário dentro de Tarefas (`components/tarefas/calendario.tsx`); Google Agenda pendente de conversa | **Sim** |
| Copiloto de IA no app | `ai-chat`: chat lateral que usa o login do usuário, ferramentas do servidor e do navegador (abrir página, preencher formulário), **toda alteração pede aprovação** | IA no dashboard, consulta em linguagem natural (`api/analytics/ia/consulta`), assistente de régua; agentes atendem clientes | Copiloto que age no CRM com aprovação |
| Agentes de IA | `employee-agent-profile` (agente externo registrado como funcionário) | Agent Studio completo: builder, canais, central de IA, base de conhecimento | Nenhuma (EvaApp à frente) |
| Servidor MCP do próprio CRM | `packages/mcp-server` com ~30 arquivos de ferramentas | `McpServer` é cliente (agente chama MCP de fora); API v1 + OpenAPI; nó do n8n | Expor o CRM como servidor MCP |
| Canais de mensagem | Nenhum WhatsApp/Instagram | WhatsApp oficial e QR, Instagram, Messenger, Telegram, TikTok, widget | Nenhuma |
| E-mail de saída | `email-template` MJML, `email-history`, SMTP por organização | Resend por domínio, modelos, supressão, descadastro | Nenhuma |
| **E-mail de entrada** | Plugin `inbox` fase 4: caixas, e-mail recebido via Resend/SES/Postmark com verificação | Não achei (só saída) | **Sim** (e-mail como canal na Caixa de entrada) |
| Disparos, réguas, automações | Não tem (ver nomes iguais na seção 1.2) | Completo | Nenhuma |
| Webhooks, idempotência, API | `webhook`, `event-outbox`, `idempotency`, `tenant-api-key` | `WebhookEndpoint`/`WebhookEntrega` (Standard Webhooks), `IdempotencyKey`, `ApiKey` com escopo | Nenhuma |
| Busca global | `search` (índice único com pesos por campo) | Ctrl+K (~90 ms) | Nenhuma |
| Favoritos | `favorite` | Não | Pequena |
| Feriados / dias úteis | `official-holiday` (país, data, recorrente) | Não ("expediente configurável" está nas pendências) | Pequena |
| Liga/desliga recurso por contrato | `feature` + `feature-organization` | Não achei equivalente direto (há `niche-packs.ts`, não verificado) | Pequena |
| Central de ajuda pública | Plugin `knowledge-base` (help center, artigos com versão, autores) | `KnowledgeDoc`/`KnowledgeChunk` para os agentes; tela Ajuda interna | Opcional |
| Papéis e permissões | `role`, `role-permission` | Papéis personalizados, grupos, equipes, escopo de dados | Nenhuma |
| RH, folha, férias | Completo | Não | Fora do foco |
| Recrutamento (ATS) | Completo | Não | Fora do foco |
| Projetos e sprints | Completo | Não | Fora do foco |
| Controle de horas e desktop | Completo, com captura de tela | Não | Fora do foco |
| Estoque, pedidos, marketplace | Plugins completos | Não | Fora do foco |

---

## 3. O que vale trazer (priorizado)

Critério: impacto para um CRM de vendas brasileiro, WhatsApp-first, com agentes de IA.
Esforço: **P** = até ~3 dias, **M** = 1 a 2 semanas, **G** = mais de 2 semanas (estimativas,
não medidas). Todos são **reimplementação a partir da ideia**, sem copiar código.

### P0

**1. Proposta / orçamento com link público e aceite pelo cliente**
- O que é: documento gerado do negócio (itens, desconto, validade, condições), com número
  sequencial, PDF, link público com token que expira, botão "Aceitar" e histórico (criado,
  enviado, visto, aceito, recusado).
- No Gauzy: `packages/core/src/lib/invoice/` (`isEstimate`, `isAccepted`, `token`,
  `generate-invoice-pdf.ts`, `pdfmaker.service.ts`), `estimate-email/estimate-email.service.ts`
  (token assinado com validade de N dias), `public-share/invoice/public-invoice.controller.ts`,
  `invoice-estimate-history/`, `sequence/sequence.entity.ts` (prefixo, padding,
  `resetPolicy`), `accounting-template/` (modelo do documento). Rotas da UI em
  `apps/gauzy/src/app/pages/pages.routes.ts` (`sales/estimates`).
- No EvaApp: nasce na ficha do negócio (`/negocios/<id>`) a partir dos `DealItem`. Modelos
  novos sugeridos: `Proposta` (número, validade, status, token, snapshot dos itens e
  totais), `PropostaEvento`. Envio pelo agente/canal do negócio (WhatsApp com link), modelo
  do documento na Biblioteca, evento `deal.proposal_accepted` no catálogo de webhooks
  (`src/lib/webhooks/eventos.ts`) e como gatilho de automação (aceite move a etapa).
  Página pública fora de `[contrato]`, como já é `descadastro/`.
- Esforço: **M** (PDF e itens já existem; o novo é página pública, token e eventos).

**2. Auditoria com "antes e depois" de cada campo**
- O que é: registro de quem mudou o quê (pessoa, agente de IA, automação, API), com lista de
  campos alterados e valores anteriores e novos.
- No Gauzy: `packages/core/src/lib/activity-log/` (`activity-log.subscriber.ts` grava a
  partir dos eventos da ORM; `contracts/src/lib/activity-log.model.ts` tem
  `updatedFields`, `previousValues`, `updatedValues`, `actorType`).
- No EvaApp: é o P0 nº 8 de `docs/superpowers/plans/2026-10-20-melhorias-crm-skills.md`.
  Encaixa na linha do tempo que já existe (negócio e `/api/contacts/[contactId]/linha-do-tempo`)
  e em Configurações (auditoria do contrato). Gravar no mesmo lugar onde já se emite evento
  (`EventoDeDominio`, `stage-events.ts`), com `ator` = usuário / agente / automação / chave
  de API. Isso também responde "o que a IA mudou?".
- Esforço: **M**.

**3. Metas de venda e painel vendedor x gestor**
- O que é: meta por período (mês/trimestre), por pessoa ou equipe, com métrica (valor
  ganho, nº de ganhos, atividades feitas, conversas atendidas), valor atual calculado e
  progresso.
- No Gauzy: `goal/goal.entity.ts` (dono pessoa ou equipe, prazo, progresso),
  `goal-kpi/goal-kpi.entity.ts` (`currentValue`, `targetValue`, `operator`, `unit`),
  `keyresult/`, `goal-time-frame/`, `goal-kpi-template/`, `goal-general-setting/`; UI em
  `pages.routes.ts` (`goals`, `goals/reports`, `goals/settings`).
- No EvaApp: P0 nº 10 aberto. Tabela nova `Meta` ligada a `Team`/`Membership`; o valor
  atual sai do que já existe (`DealStageEvent` de ganho, `Task.doneAt`, mensagens). Mostra
  no Dashboard e no Início ("faltam R$ X para a meta"). Não trazer OKR completo
  (objetivo → resultado-chave → iniciativa estratégica): para vendas basta meta + métrica.
- Esforço: **M**.

**4. Caixa de decisões: o agente pergunta, a pessoa decide**
- O que é: itens acionáveis por usuário (pergunta, aprovação, escalonamento, aviso), com
  lido, arquivar e "adiar até", contador no topo, e a resposta volta para quem perguntou.
- No Gauzy: `packages/plugins/inbox/README.md` (tabelas `inbox_item` e
  `inbox_item_recipient`, `POST /items/:id/reply` com a resposta reivindicada uma vez só,
  registro de "fontes" que tratam a resposta).
- No EvaApp: evolução do `Aviso` (hoje só informativo). Fontes: agente de IA que não sabe
  responder ou pede desconto ("Escalar para humano" com opções), passo de automação "pedir
  aprovação", proposta com desconto acima do limite (item 1), webhook falhando (já vira
  aviso no Início). A resposta pode seguir o fluxo do agente na mesma conversa.
- Esforço: **M**.

### P1

**5. Copiloto de IA que age no CRM, com aprovação de cada alteração**
- O que é: chat lateral no app que consulta e altera dados usando as permissões de quem
  está logado; toda ferramenta que muda dado mostra "Aprovar / Recusar" antes de rodar.
- No Gauzy: `packages/plugins/ai-chat/README.md` (seções Architecture e Security model:
  ferramentas do servidor com o token do próprio usuário, ferramentas do navegador
  `open_page`/`fill_form`/`submit_form`, limite de 12 passos, chaves BYOK cifradas) e
  `packages/plugins/ai-chat-react-ui`.
- No EvaApp: usa a Central de IA (`AiConnection`, `AiUsage`, `AiKeyLimit`) e as mesmas
  funções da API v1 como ferramentas (contatos, negócios, tarefas, notas). Cobre o P0 nº 9
  ("IA que resume e sugere campos com aprovação"). Mesma stack de IA (Vercel AI SDK) que o
  Gauzy usa, o que facilita o desenho, mas o código é nosso.
- Esforço: **M** a **G**.

**6. Link de agendamento (tipo Calendly) que o agente manda no WhatsApp**
- O que é: tipos de reunião (duração, intervalo antes/depois), disponibilidade por pessoa,
  página pública para o cliente escolher horário e confirmar, reunião criada como tarefa
  "reunião" no negócio.
- No Gauzy: `event-types/`, `availability-slots/` (com checagem de conflito),
  `employee-appointment/` (`bufferTimeInMins`, `breakTimeInMins`, convidados, status),
  `packages/plugins/public-layout-ui/src/lib/public-layout.routes.ts` (rotas
  `create-appointment`, `confirm/:appointmentId`, `edit-appointment`).
- No EvaApp: conversa direto com o Calendário (PLANO-v6 3.2 item 6, componente que já aceita
  eventos com `origem`) e com o Google Agenda pendente. Bloco novo no builder "Oferecer
  horário" e ação de automação. Começar sem sincronizar agenda externa (só tarefas do EvaApp)
  e ligar o Google depois.
- Esforço: **M** sem Google; **G** com sincronização Google/Outlook.

**7. Comentários com @menção e "seguir" um negócio**
- O que é: comentário com resposta em fio, marcar como resolvido, @menção que avisa a
  pessoa, reação, e inscrição automática em quem foi mencionado, atribuído ou comentou.
- No Gauzy: `comment/` (`parentId`, `resolved`, `resolvedByEmployeeId`), `mention/`
  (`parentEntityId` para inscrever no negócio e não no comentário), `reaction/`,
  `entity-subscription/` (tipos manual, menção, atribuição, comentário, criou).
- No EvaApp: estende `Note` (resposta, menções) e usa `Aviso` (ou a caixa do item 4) para
  avisar. Útil para o "passa-bola" entre SDR e closer e entre agente de IA e humano.
- Esforço: **M**.

**8. Aprovações genéricas por política**
- O que é: política de aprovação (tipo, valor mínimo, quem aprova: pessoa ou equipe) e
  pedido de aprovação com status solicitado / aprovado / recusado.
- No Gauzy: `approval-policy/`, `request-approval/` (`amount`, `currency`,
  `employeeApprovals`, `teamApprovals`, `requestType`), `request-approval-employee/`,
  `request-approval-team/`.
- No EvaApp: está como P1 ("aprovações") no HANDOFF. A tela `aprovacoes/` hoje trata
  templates da Meta; ganharia uma aba "Pedidos". Casos: desconto na proposta, mover para
  "Ganho" acima de um valor, disparo grande. Entrega pela caixa do item 4.
- Esforço: **M** (menor se feito junto com o item 4).

**9. Servidor MCP do próprio CRM**
- O que é: expor contatos, negócios, funis, tarefas e notas como ferramentas MCP, para o
  cliente plugar o EvaApp no Claude, ChatGPT ou num agente próprio.
- No Gauzy: `packages/mcp-server/src/lib/tools/` (`deals.ts`, `pipelines.ts`,
  `organization-contact.ts`, `tasks.ts`, `comments.ts`...), `config/tools-registry.ts`,
  `apps/server-mcp`.
- No EvaApp: camada fina sobre a API v1 (`src/lib/server/api-v1/*`), autenticada pela
  `ApiKey` com escopos que já existe; aparece em Integrações ao lado de API e n8n.
- Esforço: **P** a **M**.

**10. E-mail de entrada como canal da Caixa de entrada**
- O que é: o contrato recebe e-mail num endereço do domínio verificado; cada e-mail vira
  mensagem de uma `Conversation` ligada ao contato, como já acontece com WhatsApp.
- No Gauzy: `packages/plugins/inbox/EMAIL.md` (provedores com `inbound.verify` e
  `inbound.parse`, credenciais cifradas), plugins `email-provider-resend`, `-ses`,
  `-postmark`.
- No EvaApp: já usamos Resend para saída (`src/lib/server/email/envio.ts`,
  `/api/webhooks/resend`). Faltaria o webhook de entrada e o canal "E-mail" em `Canal`.
  Completa o omnichannel (pedido comum em B2B).
- Esforço: **M**.

### P2

| # | O que | No Gauzy | No EvaApp | Esforço |
|---|---|---|---|---|
| 11 | Feriados e dias úteis para SLA, réguas e "parado há N dias" | `official-holiday/official-holiday.entity.ts` | Preencher com feriados nacionais (BrasilAPI) e permitir municipais; usar em tarefas, réguas, rodízio | P |
| 12 | Favoritos (negócios e contatos fixados) | `favorite/` | Estrela na ficha; seção no Início e no Ctrl+K | P |
| 13 | Liga/desliga recurso por contrato | `feature/`, `feature-organization.entity.ts` | Ajuda em liberação gradual e planos; checar antes se `niche-packs.ts` já cobre | P a M |
| 14 | Cobrança: fatura do negócio ganho, pagamento parcial, recorrência | `invoice/`, `payment/`, `payment-term/`, plugin `payment` | Já é P2 (Pix/boleto no chat); fazer com gateway brasileiro, não copiar modelo de cobrança americano | G |
| 15 | Tabela de preço por faixa de quantidade e cupom | plugins `pricing`, `promotion` | Só se aparecer cliente de varejo/e-commerce pedindo | G |
| 16 | Central de ajuda pública que também alimenta o agente | plugin `knowledge-base` (`help-center-article-version.entity.ts`) | Artigo publicado vira `KnowledgeDoc` do agente | M |

---

## 4. O que NÃO vale trazer

| O que | Onde no Gauzy | Por quê |
|---|---|---|
| RH (funcionários, níveis, prêmios, férias, folha) | `employee*`, `time-off-*`, `payroll-run`, `payroll-item`, `organization-position`, `organization-department` | Não é problema de quem vende pelo WhatsApp. Folha no Brasil exige eSocial, FGTS, INSS: produto à parte |
| Recrutamento (ATS) | `candidate*`, plugins `job-*`, `job-proposal` (proposta de vaga no Upwork, não proposta comercial) | Fora do foco |
| Controle de horas, captura de tela e áudio, apps de desktop | `time-tracking`, `apps/desktop*`, `apps/agent`, plugins `camshot`, `soundshot` | Fora do foco e com risco de LGPD (monitoramento de funcionário) |
| Gestão de projetos e sprints | `organization-project*`, `organization-sprint`, `tasks` | As tarefas do EvaApp já são de venda (ligar, WhatsApp, reunião); quadro de projeto dilui o produto |
| Estoque, pedidos, carrinho, devolução, compras, marketplace, licenças | plugins `inventory`, `order`, `cart`, `fulfillment`, `returns`, `purchasing`, `marketplace`, `entitlement` | É um ERP de comércio. Para clientes de e-commerce, integrar (Nuvemshop, Tray, Bling) é melhor que reconstruir |
| Contabilidade (receita, despesa, despesas recorrentes) | `income`, `expense`, `organization-recurring-expense` | É ERP financeiro; integrar com Omie/Bling/Conta Azul |
| Equipamentos e compartilhamento | `equipment*` | Sem relação com vendas |
| Funil e negócio do Gauzy | `pipeline`, `pipeline-stage`, `deal` | Mais simples que o do EvaApp |
| "Broadcast", "Sequence", "Channel" do Gauzy | ver seção 1.2 | Nomes iguais aos nossos, coisas diferentes (comunicado interno, numeração, canal de e-commerce) |
| Suporte a várias ORMs e bancos | TypeORM + MikroORM + Knex | Custo enorme sem ganho para nós (Prisma + Postgres) |
| Integrações de freelancer/dev | `integration-upwork`, `-hubstaff`, `-github`, `-jira`, `-wakatime`, `-plane` | Público diferente |
| OKR completo (iniciativa estratégica, resultado-chave com peso) | `organization-strategic-initiative`, `keyresult-update` | Para vendas, meta simples (item 3) resolve; OKR é ferramenta de gestão geral |

---

## 5. Riscos

1. **Licença AGPL (o maior).** Um trecho copiado basta para contaminar o EvaApp. Mitigação:
   proibir copiar código, SQL, textos de i18n e de README; implementar a partir de
   especificação escrita (este documento ou o plano de cada item); em revisão de PR,
   desconfiar de código com cara de NestJS/TypeORM ou nomes em inglês idênticos aos do
   Gauzy. Não usar "Gauzy" nem "Ever" em material comercial.
2. **Inchar o produto.** O Gauzy tenta ser tudo (193 módulos no core, 100 plugins) e o CRM
   dele ficou raso por isso. Trazer só o que serve à venda pelo WhatsApp; cada item aqui
   deve passar pela regra do HANDOFF de perguntar ao dono antes de criar tabela.
3. **Banco compartilhado.** Tabelas novas (proposta, meta, auditoria, comentário, caixa de
   decisões, agendamento) precisam do prefixo `eva_studio_` e de SQL aplicado com cuidado,
   porque o banco é dividido com o Beeno Builder. A auditoria cresce rápido: definir
   retenção e índices desde o início.
4. **Páginas públicas (proposta e agendamento).** Token com validade e trocável, sem dado
   pessoal na URL além do token, limite de acesso, LGPD (o que o cliente vê de outros
   dados do contrato). O Gauzy usa token assinado com validade em
   `estimate-email.service.ts`; nós já temos o padrão de link assinado no descadastro.
5. **IA agindo no CRM.** O copiloto (item 5) só é seguro se cada ferramenta passar pelas
   mesmas permissões do usuário e se toda alteração pedir aprovação; registrar na auditoria
   (item 2) com ator "IA". Custo de tokens entra no `AiKeyLimit` que já existe.
6. **Agendamento com Google/Outlook.** OAuth, verificação de app no Google, fuso horário,
   conflito de agenda e privacidade (quem vê a agenda de quem). Por isso a sugestão de
   começar sem sincronização.
7. **Estimativas.** Os esforços acima são palpites a partir do que já existe no EvaApp; não
   conferi o código de cada tela envolvida.

---

## O que não foi verificado

- Nenhuma tela do Gauzy foi vista rodando; o comportamento do copiloto (`ai-chat`), da caixa
  de decisões (`inbox`) e das páginas públicas de agendamento vem dos READMEs e dos nomes de
  arquivo/entidade.
- Do EvaApp, li documentação, rotas, pastas e o `schema.prisma`; o estado "feito" de cada
  frente é o que o HANDOFF e o PLANO-v6 dizem, não testei no navegador.
- Não verifiquei se `src/lib/niche-packs.ts` já faz papel de liga/desliga por contrato
  (item 13) nem se existe e-mail de entrada fora de `src/lib` (item 10).
