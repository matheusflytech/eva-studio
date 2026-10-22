# Melhorias do CRM priorizadas pelas skills crm-*

Data: 2026-10-20. Base: `crm-mvp-blueprint` (índice e `references/feature-catalog.md`)
comparado com o código atual da Eva (branch `feat/dashboards-funil`).

Legenda: **P0** = falta para o CRM ser completo no básico; **P1** = logo depois;
**P2** = diferencial/depois. Cada item cita a skill que o embasa.

## O que já está bom (não entra na lista)

Contratos multi-tenant com papéis, grupos, equipes e escopo de dados; contatos,
empresas e negócios com campos personalizados; vários funis com probabilidade;
histórico de etapa (`DealStageEvent`); timeline na ficha do negócio; listas
paginadas com filtros e colunas; quadro paginado por coluna; importação CSV
com dedupe por e-mail/telefone; produtos no negócio; API v1 com chaves,
escopos, idempotência e lote; agendamento e templates WhatsApp; dashboard com
montador e filtros; IA para filtros e para rascunho de réguas/fluxos;
design system com a identidade da Eva.

## P0

| # | Melhoria | O que falta hoje | Skill |
|---|---|---|---|
| 1 | ✅ **(feito — ver notas abaixo)** **Regras por etapa**: campos obrigatórios ao entrar na etapa (nunca na criação), motivos de perda configuráveis por funil (lista, não texto livre), "parado" com prazo por etapa (hoje 7 dias fixos) | Só texto livre em `lostReason`; `DIAS_PARADO = 7` para tudo; nenhum campo exigido por etapa | crm-pipeline-kanban |
| 2 | ✅ **(feito — ver notas abaixo)** **Lixeira e desfazer**: exclusão vira soft delete com restauração (30 dias), "Desfazer" depois de apagar/mover/arquivar | Apagar negócio/contato apaga de vez, em cascata com tarefas e notas | crm-data-model (+ princípio 3 do blueprint) |
| 3 | ✅ **(feito — ver notas abaixo)** **Tarefas de verdade**: tipos WhatsApp e visita, conclusão com resultado (falou / não atendeu / remarcou) e **próximo passo obrigatório**, adiar (snooze) que também empurra a previsão do negócio, tela "Meu dia" (atrasadas, hoje, próximas) com fila "Concluir e próximo" | Tipos ligar/e-mail/reunião/outro; concluir é só marcar | crm-tasks-agenda |
| 4 | ✅ **(feito — ver notas abaixo)** **Busca global ⌘K / Ctrl+K**: contatos, empresas, negócios por nome, telefone (qualquer pedaço), e-mail, CNPJ; ações rápidas | Não existe | crm-list-views-search |
| 5 | ✅ **(feito — ver notas abaixo)** **Visões salvas** (fase L4) e **ações em massa por filtro** (fase L5) | Abas fixas; seleção sem ações | crm-list-views-search |
| 6 | **Mesclar duplicados** (contato e empresa) com aviso de possível duplicado na ficha e mescla reversível | Dedupe só na criação/importação | crm-record-pages, crm-leads-import-dedupe |
| 7 | **CNPJ que se preenche** (BrasilAPI: razão social, fantasia, CNAE, porte, endereço, sócios opcional) e **telefone E.164** de verdade (`+55...`) | CNPJ só validado; telefone gravado como `55...` sem `+` | crm-brazil-integrations, crm-leads-import-dedupe |
| 8 | **Auditoria**: quem mudou o quê e quando (valor antigo/novo) em negócio, contato, empresa, permissões e chaves | Só histórico de etapa | crm-data-model |
| 9 | **IA que preenche o CRM com aprovação**: resumo da conversa de WhatsApp e do negócio; extração de valor, previsão, próximo passo, objeções como **sugestões** numa bandeja (aceitar com 1 toque), com evidência | IA só em filtros e rascunhos de automação | crm-ai-copilot |
| 10 | **Metas e painel do vendedor x gestor**: metas por pessoa/equipe/período (valor ganho, quantidade, atividades) com progresso; clicar num gráfico abre a lista filtrada | Painel sem metas e sem drill-down | crm-dashboards-reports |
| 11 | **Sinais de risco do negócio por regra**: sem próximo passo, previsão adiada 2x, só um contato, cliente sem resposta há X dias no WhatsApp | Só "parado" e "retorno atrasado" | crm-pipeline-kanban, crm-ai-copilot |

### Notas do item 1 (regras por etapa) — feito em 20/10/2026

- **Onde mora:** validação pura em `src/lib/regras-de-etapa.ts` (alvo, puladas
  que não podem ser puladas, campos padrão e personalizados, ganho/perdido só
  com Reabrir, motivos, parado, montagem do modal); carga e erro em
  `src/lib/server/regras-de-etapa.ts`. O único chamador é `moveDealStage`
  (`src/lib/server/crm.ts`), por onde passam quadro, prévia, ficha, gaveta,
  painel da conversa, `PATCH /api/deals/[id]`, API v1 (move/won/lost/PATCH),
  importação e motor do fluxo. Criação de negócio nunca valida.
- **Resposta:** 422 `{ codigo: "campos_obrigatorios", faltando: [...] }`
  (v1: `stage_requirements_missing` com `details.missing_fields`), 409
  `negocio_fechado` (v1: `deal_closed`, `reopen: true`), 422
  `motivo_obrigatorio` (v1: `lost_reason_required`). PATCH valida já
  contando os campos do mesmo corpo (é o "salvar e mover" do modal).
- **Pular obrigatórios:** só importação (checkbox na tela; `options.
  skip_stage_requirements` na API) e bloco "Mover etapa" do fluxo (opção no
  Builder), registrado em `DealStageEvent.ignorouObrigatorios`. A ferramenta
  de IA nunca pula.
- **Parado:** `aberto E prazo NOT NULL E agora − greatest(lastActivityAt,
  stageSince) > prazo` no cartão, na lista, no filtro do servidor (campo
  `parado`, usado pela visão "Precisam de atenção"), no Início, no dashboard
  (negócios parados) e na voz da Eva. `tocarAtividade` em nota, tarefa
  concluída (tela e v1), mensagem entrando/saindo (`registrarMensagens`) e
  edição de campo (tela, v1, fluxo).
- **Banco:** `prisma/sql/2026-10-20-regras-de-etapa.sql` (só aditivo; não
  aplicado). Sem ele vale o comportamento de antes: nada obrigatório, 7 dias,
  motivos padrão, relógio só pela entrada na etapa.
- **Motivo da perda:** estruturado em `eva_studio_deal_losses`; `lostReason`
  guarda o rótulo (relatório, exportação e dashboard agrupam por ele; renomear
  o motivo atualiza as perdas ligadas). Nota do motivo fica só na perda
  estruturada.
- **Pendente:** gaveta antiga do negócio ainda edita `lostReason` como texto
  livre; aprovação de etapa (crm-approvals) e automações por etapa ficam para
  os itens 17 e 18.

### Notas do item 2 (lixeira e desfazer) — feito em 20/10/2026

- **Decisão: lixeira por "foto" (B), não soft delete (A).** Soft delete exigiria
  filtrar `deletedAt` em toda leitura (listas, busca, dashboard, analytics,
  exportação, API v1, filtro-crm, flow-engine, dedupe, sequências, disparos…):
  uma leitura esquecida vira registro "fantasma", e coluna nova em tabela
  existente quebra o Prisma até o SQL ser aplicado. A foto é só aditiva (uma
  tabela nova), nenhuma leitura muda e o app funciona sem o SQL.
- **Onde mora:** parte pura (foto → plano de restauração, avisos, expiração,
  corpo do desfazer) em `src/lib/lixeira.ts`; banco em
  `src/lib/server/lixeira.ts` (`apagarComLixeira`, `restaurarDaLixeira`,
  `listarLixeira`, `limparLixeiraVencida`, `apagarParaSempre`); permissão e
  resposta das rotas em `src/lib/server/lixeira-http.ts`.
- **Foto:** negócio = registro + contatos (`DealContact`), tarefas, notas,
  `DealStageEvent`, itens, valor manual, perda, última atividade, ids
  externos; contato = registro + canais, etiquetas, vínculos com negócios,
  tarefas, notas, inscrições em sequência, conversas ligadas, ids externos;
  empresa = registro + ids dos contatos e negócios ligados (SetNull no banco).
  Gravada na mesma transação do DELETE, junto com a lápide de
  `eva_studio_deleted_records` (removida ao restaurar).
- **Restaurar:** mesmos ids, numa transação. Etapa apagada → primeira etapa
  aberta do funil (funil apagado → de outro funil), reaberto, com evento de
  etapa novo; empresa/responsável/contato/produto sumidos → sem vínculo;
  canal já usado por outra ficha (a pessoa falou de novo) fica na outra;
  conversa religada só se continua sem ficha; id externo já usado não volta.
  Cada caso vira um aviso na resposta/toast. Vencido: 410; já restaurado: 409.
- **Rotas:** `DELETE /api/deals|contacts|companies/[id]` → lixeira
  (`{ lixeira: { id, expiresAt } }`); sem a tabela: 409
  `lixeira_indisponivel`, e a tela confirma e manda `?definitivo=1`.
  `GET /api/lixeira` (busca, tipo) e `POST /api/lixeira` (`restaurar`,
  `apagar_para_sempre`). API v1: DELETE vai para a lixeira (sem a tabela,
  apaga de vez com `warning`); `POST /v1/{contacts|companies|deals}/{id}/restore`
  (no OpenAPI).
- **Permissão:** ver/restaurar = poder apagar aquele tipo (negocios:apagar,
  contatos:apagar, empresas:gerenciar), no escopo do papel (sempre vê o que
  ela mesma apagou); "Apagar para sempre" = `lixeira:esvaziar` (novo; dono e
  admin, fora dos pacotes antigos).
- **Telas:** Configurações → Lixeira (busca, tipo, quem apagou, quando,
  "expira em N dias", Restaurar, Apagar para sempre com confirmação
  digitada). Toast com Desfazer (6 s): apagar negócio (ficha e gaveta),
  contato e empresa (sem `window.confirm`); mover etapa no quadro, prévia,
  ficha e gaveta (volta pelo mesmo PATCH/`moveDealStage`, origem
  `usuario`, com as regras; ganho/perdido reabrem na anterior; reabrir um
  perdido não oferece desfazer porque voltar pediria o motivo); arquivar.
- **Relógio:** `/api/internal/scheduler` apaga as vencidas (`lixeira.expiradas`).
- **Banco:** `prisma/sql/2026-10-20-lixeira.sql` (só aditivo; não aplicado).
- **Pendente:** lixeira de tarefa e nota (hoje apagam de vez); desfazer no
  painel da conversa (inbox) e na lista de negócios (não move etapa);
  "esvaziar lixeira" em lote; RLS na tabela nova junto com o item 22.

### Notas do item 3 (tarefas de verdade) — feito em 20/10/2026

- **Onde mora:** parte pura em `src/lib/tarefas/` (`tipos.ts`, `calendario.ts`
  em SP, `quick-add.ts`, `agrupar.ts`, `adiar.ts`, `conclusao.ts`,
  `meu-dia.ts`, `fila.ts`, `escopo.ts`, `formato.ts`, `tela.ts`); servidor em
  `src/lib/server/tarefas.ts` (lista, concluir, adiar, massa, quick add),
  `src/lib/server/meu-dia.ts` e `src/lib/server/tarefas-detalhes.ts`; telas
  em `src/components/tarefas/` e `src/app/(app)/[contrato]/tarefas`.
- **Tipos:** ligar, whatsapp, email, reuniao, visita, afazer (duração 10/3/5/
  30/60/15 min; ação de 1 clique tel:, `/conversas?c=` (sem conversa: wa.me),
  mailto:). Ids antigos valem sem migração; `outro` é aceito e gravado como
  `afazer` (o que já está no banco aparece como "A fazer"). Tela, Builder,
  IA de réguas (`crm_criar_tarefa` ganhou `tipo`), flow-engine e API v1
  passam por `normalizarTipoDeTarefa`.
- **Banco:** tabela nova `eva_studio_task_details` (1:1, PK `taskId`) —
  `allDay`, `priority`, `durationMin`, `origin`, `outcome`, `outcomeNote`,
  `nextStepDecision`, `nextTaskId`, `completedById`, `snoozedCount` — e um
  índice `(orgId, assignedToId, doneAt, dueAt)` em tarefas.
  `prisma/sql/2026-10-20-tarefas.sql` (só aditivo; não aplicado). Sem a
  tabela tudo funciona; só não ficam guardados prioridade, duração, origem,
  resultado e decisão. Dia todo = 23:59 de SP (deduzido da hora quando falta
  a linha), então "vence no fim do dia" vale mesmo sem a tabela.
- **Origem:** manual (tela), `automacao` (bloco do fluxo, follow-up do
  perdido, API v1), `ia` (ferramenta da IA, revisão acima do teto). Rotulada
  na lista e no Meu dia.
- **Conclusão:** `POST /api/tasks/[id]/concluir` e `PATCH done:true` exigem
  `resultado` e `proximo` (`agendou` com tipo/texto/data, ou `sem_proximo`);
  sem decisão → 422 `proximo_passo_obrigatorio`. Na transação: marca feita (só
  se aberta; outra aba → 409), cria a próxima (mesmo negócio/contato e
  responsável) e grava **nota** "Tarefa concluída: … / Ligação · Não atendeu —
  nota" no negócio/contato (é o que a timeline e a ficha do contato mostram).
  Diálogo único (`useConcluirTarefa`) em tarefas, Meu dia, fila, ficha,
  gaveta, contato, empresa e painel da conversa. Sugestão: não atendeu →
  WhatsApp (se era ligação) no próximo dia útil; remarcou → +2 dias úteis;
  falou → WhatsApp de retorno em 2 dias úteis; sempre 10h. Reabrir
  (`done:false`) limpa resultado e decisão. API v1 continua concluindo com
  `done: true` (integração).
- **Adiar:** `POST /api/tasks/[id]/adiar` (`1h`, `amanha` 9h, `segunda` 9h,
  `data`); `empurrarPrevisao` move `expectedClosingAt` pelos mesmos dias de
  calendário, nunca para trás nem antes do novo prazo; exige
  `negocios:editar` e o negócio no escopo (senão adia a tarefa e avisa).
  Conta `snoozedCount` ("adiada 3x" na lista).
- **Quick add:** `POST /api/tasks/rapida`; parser próprio (hoje, amanhã,
  depois de amanhã, dias da semana — sempre a próxima —, semana que vem,
  dd/mm[/aaaa], dia N, em N dias/horas/min, 14h, 14:30, meio-dia, "3 da
  tarde", "às 3" = 15h, urgente/!). Pessoa com maiúscula vira vínculo se bater
  com UM contato no escopo de contatos (+ negócio aberto mais recente dele);
  ambíguo fica sem vínculo e avisa. Atalho `T` na tela de tarefas.
- **Lista:** grupos por dia de SP (semana seg–dom); Minhas/Equipe/Todas com
  teto no escopo de **negócios** do papel (tarefa não tem escopo próprio);
  PATCH/DELETE/concluir/adiar de tarefa fora do escopo → 404. Permissões
  agora granulares (`tarefas:ver` / `tarefas:gerenciar`, mesmos papéis de
  antes). Massa (`POST /api/tasks/massa`): +1 dia (mantém a hora), próxima
  segunda 9h, reatribuir (não para fora do escopo → 403), concluir (exige
  resultado e "sem próximo passo" explícito).
- **Meu dia** (aba principal de /tarefas, `GET /api/tasks/meu-dia`): fixos =
  reunião/visita com hora hoje; pool = atrasadas e de hoje + "Responder"
  (conversa com humano, última mensagem do cliente não lida, minha ou da
  minha ficha), "Primeiro contato" (lead `novo` meu, 7 dias) e "Definir
  próximo passo" (negócio meu parado sem tarefa aberta). Score da skill (SLA
  cresce até 1,2 ao estourar 30 min). Capacidade = minutos até 18h − fixos −
  15%; excedente "provavelmente amanhã" com adiar em 1 clique. Filas por tipo
  e "Começar pela ordem" → modo registro a registro com contexto ao lado e
  "Concluir e próximo" / "Feito, próximo" / "Pular".
- **Para os itens 13 e 20:** `carregarMeuDia(ctx)` devolve `resumo` (texto
  "Hoje: 3 compromissos, 12 tarefas (2 atrasadas), …") via `resumoDoDia` —
  o digest das 8h por WhatsApp e o alerta de SLA devem reutilizar isso.
  Expediente fixo 9h–18h e SLA fixo de 30 min por enquanto.
- **Pendente:** detalhes da tarefa não entram na foto da lixeira (restaurar
  traz a tarefa sem prioridade/resultado; a nota do resultado volta);
  recorrência, agenda/calendário e Google Agenda (item 20); feriados no "dia
  útil" da sugestão; expediente e SLA por pessoa/contrato; Início continua
  contando as tarefas do contrato todo (o Meu dia é por pessoa).

### Notas do item 4 (busca global ⌘K / Ctrl+K) — feito em 20/10/2026

- **Onde mora:** parte pura em `src/lib/busca/` (`consulta.ts` normalização,
  `trecho.ts` destaque, `grupos.ts` ordem/permissões/contexto, `atalhos.ts`,
  `recentes.ts`, `resultado.ts`); servidor em `src/lib/server/busca.ts` e
  `GET /api/busca?q=&tipos=negocios,contatos,empresas,notas,mensagens`; tela
  em `src/components/busca/` (paleta + `registro-em-foco.ts`) e
  `src/components/ui/command.tsx`.
- **Dependência nova:** `cmdk` (a base do Command do shadcn). O
  `shadcn add command` gerava `import { cn } from "cn"` e puxava o pacote
  `radix-ui` inteiro, então o Command foi escrito com os tokens da casa sobre
  o `@radix-ui/react-dialog` que já existia.
- **Servidor:** contrato + permissão por tipo (negocios:ver, contatos:ver,
  empresas:ver, tarefas:ver p/ notas, conversas:ver p/ mensagens) + escopo de
  dados (dono do negócio/contato; atendente da conversa; nota de negócio/
  contato fora do escopo some). Só parâmetros; `Prisma.raw` só com nomes fixos
  e o schema do pg_trgm validado por regex. Até 8 por tipo.
- **Matching:** sem acento, cada termo no começo de alguma palavra (E entre
  termos); negócio também pelo nome da empresa. Telefone: consulta só com
  dígitos/máscara e **≥ 7 dígitos** (o exemplo "11 99999" tem 7) acha qualquer
  trecho no telefone principal (legado com máscara também), nos secundários e
  no id do canal (5511…@s.whatsapp.net). CNPJ: 8–14 dígitos com ou sem
  pontuação, pelo começo. E-mail: com "@", principal e secundários. Notas: 1
  ano; mensagens: WhatsApp, 90 dias; as duas com `statement_timeout` local de
  1,5 s (estourou = aviso, não erro). Sem resultado pelo prefixo e com
  pg_trgm: segunda volta por semelhança (`<%`, "parecido" na linha).
- **Banco:** `prisma/sql/2026-10-20-busca.sql` (só aditivo; não aplicado):
  unaccent + pg_trgm no schema `extensions`, função IMMUTABLE
  `public.eva_studio_norm` e 11 índices GIN trigram (nomes, e-mails,
  telefones, canal, CNPJ, notas, mensagens). Sem ele o app detecta e usa
  `translate(lower())` + LIKE sem índice (mesmo resultado para os acentos do
  português, mais lento, sem semelhança). Tempo no cabeçalho `Server-Timing`.
- **Paleta:** 640px, topo em 20vh, campo 48px, linhas 36px; espera 150 ms e
  cancela a anterior. Ordem: [ações do registro aberto] → Ações → Ir para →
  Negócios → Contatos → Empresas → Notas e mensagens → Recentes (sem
  consulta: registro → Recentes → Ações → Ir para). Ações: Criar negócio/
  contato (`/negocios?novo=` e `/contatos?novo=`), Criar tarefa (quick add do
  item 3), Enviar WhatsApp para… (conversa no inbox; sem conversa, wa.me),
  Mudar etapa para… e Atribuir a… na ficha e na prévia do negócio (pelas
  funções da tela: regras de etapa, modais e desfazer). Recentes: ficha do
  negócio, prévia, ficha do contato e página da empresa, no localStorage por
  contrato e pessoa.
- **Atalhos (prioridade):** Ctrl+K/⌘K sempre (até em campo) → digitando ou
  com diálogo modal aberto nenhuma letra solta vale → G pendente (1,5 s)
  consome D/N/C/E/T (o N de Negócios e o T de Tarefas não disparam) → atalhos
  das telas (N, /, T) como antes → `?` folha de atalhos. ⌘ no Mac, Ctrl no
  resto. Botão "Buscar" no menu lateral e lupa no topo do celular.
- **Pendente:** medir o p95 depois de aplicar o SQL (meta < 150 ms; nada foi
  medido no banco de produção); "Atribuir a…" no contato e na empresa; ações
  na gaveta antiga do negócio e no painel da conversa; busca em transcrições
  de áudio; `C` criar contextual (não entrou para não brigar com digitação e
  com o G); Recentes mais frequentes primeiro.

### Notas do item 5 (visões salvas e ações em massa) — feito em 20/10/2026

- **Onde mora:** visões — parte pura em `src/lib/visoes/visoes.ts` (config,
  saneamento, estado ↔ config, campo removido, quem vê/mexe), servidor em
  `src/lib/server/visoes-salvas.ts`, rotas `GET|POST /api/visoes`,
  `PATCH|DELETE /api/visoes/[id]`, `PUT /api/visoes/padrao`; tela em
  `src/components/crm/listas/visoes-salvas.tsx`. Lote — parte pura em
  `src/lib/lote/lote.ts`, servidor em `src/lib/server/lote.ts`, rotas
  `POST /api/contacts/lote` e `POST /api/deals/lote`; tela em
  `src/components/crm/listas/acoes-em-massa.tsx` + `BulkActionBar` (novo em
  `src/components/ui`). Detalhes de comportamento nas fases L4/L5 de
  `2026-10-20-listas-filtros-visoes.md`.
- **Banco:** `prisma/sql/2026-10-20-visoes-salvas.sql` (só aditivo, NÃO
  aplicado): `eva_studio_saved_views` e `eva_studio_saved_view_defaults`. Sem
  ele: abas de sistema, colunas/recolhidas no navegador, aviso discreto; o
  "+" avisa que não está ativado; escrita responde 409 `visoes_indisponiveis`.
  O lote não precisa de tabela nova (apagar usa a lixeira do item 2; sem ela,
  409 `lixeira_indisponivel` e a tela pede confirmação de definitivo).
- **Visibilidade:** pessoal (só o dono, nem admin vê), equipe (membros da
  equipe; equipe apagada = só o dono) e contrato (só admin — `membros:gerenciar`
  ou `funis:configurar` — compartilha com todos). Alterar/apagar: dono, ou
  admin numa compartilhada. Quem não pode mexer só tem "Salvar como nova".
  Tudo preso ao `orgId` do contrato ativo; visão de outro contrato = 404.
- **Lote:** permissão granular por ação (contatos:editar, contatos:apagar,
  sequencias:gerenciar, negocios:editar, negocios:apagar); por filtro refaz a
  busca (`idsDoFiltro`, até 5.000, aviso ao cortar); por ids confere contrato
  + escopo. Mover/ganho/perdido um a um por `moveDealStage` (regras da etapa),
  histórico gravado em lote (`registrarMudancasEmLote`, origem `usuario`).
- **Pendente:** fixar visão no menu lateral (opcional, ficou de fora);
  reordenar abas por arrastar (a coluna `position` existe); o evento de etapa
  não marca "ação em massa" (precisaria de coluna nova em tabela existente);
  ações em massa no quadro (só na lista); "editar campo" em massa; RLS das
  tabelas novas junto com o item 22.

## P1

| # | Melhoria | Skill |
|---|---|---|
| 12 | **Webhooks de saída** (catálogo de eventos, assinatura HMAC, tentativas, log de entregas, reenviar) — a API-6 que ficou no plano | crm-api-webhooks |
| 13 | **Caixa de entrada de leads com SLA**: lead novo sem toque em N minutos alerta e redistribui; rodízio (round-robin) entre vendedores | crm-leads-import-dedupe, crm-tasks-agenda |
| 14 | **Importação com assistente**: mapear colunas (com IA), prévia, simulação, desfazer importação; migração de Pipedrive/RD/Agendor/Ploomes | crm-leads-import-dedupe |
| 15 | **Previsão por categoria** (Pipeline / Melhor caso / Compromisso / Fechado) e **ranking** | crm-dashboards-reports |
| 16 | **Áudio do WhatsApp vira atualização do CRM** ("Fechei com a Acme, 12 mil, assina sexta") | crm-ai-copilot, crm-whatsapp-channel |
| 17 | **Aprovações** de desconto/proposta, de disparo e de etapa, com aprovar pelo WhatsApp | crm-approvals |
| 18 | **Réguas**: parar sozinho quando o cliente responde, horário comercial, limite por remetente, variantes A/B | crm-sequences |
| 19 | **Biblioteca**: respostas rápidas, roteiro por etapa (playbook), modelos com variáveis | crm-content-library |
| 20 | **Google Agenda nos dois sentidos** e lembrete do dia pelo WhatsApp às 8h | crm-tasks-agenda |
| 21 | **LGPD**: registro de consentimento por canal, opt-out automático, exportar/apagar dados do titular | crm-brazil-integrations, crm-broadcasts |
| 22 | **RLS no banco como segunda trava** do contrato (hoje a checagem é só no servidor via Prisma) | crm-data-model, supabase-postgres-best-practices |
| 23 | **Disparos**: estimativa de custo, lote de teste (canário), supressão, painel de entrega/leitura/resposta | crm-broadcasts |

## P2

| # | Melhoria | Skill |
|---|---|---|
| 24 | Proposta + link Pix/boleto no chat e "Ganho" automático no pagamento | crm-brazil-integrations, crm-pipeline-kanban |
| 25 | Integrações ERP/e-commerce (Omie, Bling, Tray, Nuvemshop, RD Station, Meta Lead Ads) | crm-brazil-integrations |
| 26 | Node e modelos n8n da Eva | crm-n8n-integration |
| 27 | Colunas de IA (classificar, resumir) por funil/lista | crm-ai-copilot |
| 28 | Objetos personalizados | crm-data-model |
| 29 | Modelos prontos por vertical (clínica, imobiliária, educação, seguros) | crm-ux-pain-points |

## Ordem de execução

Um item por vez, carregando a skill certa (e `supabase-postgres-best-practices`
para banco, `shadcn` e `crm-design-system` para tela): 1 → 2 → 3 → 4 → 5 → 6 →
7 → 8 → 9 → 10 → 11, depois os P1. Toda mudança de banco é só aditiva, com SQL
revisado e aplicado com OK.
