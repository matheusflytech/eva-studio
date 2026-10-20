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
| 3 | **Tarefas de verdade**: tipos WhatsApp e visita, conclusão com resultado (falou / não atendeu / remarcou) e **próximo passo obrigatório**, adiar (snooze) que também empurra a previsão do negócio, tela "Meu dia" (atrasadas, hoje, próximas) com fila "Concluir e próximo" | Tipos ligar/e-mail/reunião/outro; concluir é só marcar | crm-tasks-agenda |
| 4 | **Busca global ⌘K / Ctrl+K**: contatos, empresas, negócios por nome, telefone (qualquer pedaço), e-mail, CNPJ; ações rápidas | Não existe | crm-list-views-search |
| 5 | **Visões salvas** (fase L4) e **ações em massa por filtro** (fase L5) | Abas fixas; seleção sem ações | crm-list-views-search |
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
