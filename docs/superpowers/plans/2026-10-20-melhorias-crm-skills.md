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
| 1 | **Regras por etapa**: campos obrigatórios ao entrar na etapa (nunca na criação), motivos de perda configuráveis por funil (lista, não texto livre), "parado" com prazo por etapa (hoje 7 dias fixos) | Só texto livre em `lostReason`; `DIAS_PARADO = 7` para tudo; nenhum campo exigido por etapa | crm-pipeline-kanban |
| 2 | **Lixeira e desfazer**: exclusão vira soft delete com restauração (30 dias), "Desfazer" depois de apagar/mover/arquivar | Apagar negócio/contato apaga de vez, em cascata com tarefas e notas | crm-data-model (+ princípio 3 do blueprint) |
| 3 | **Tarefas de verdade**: tipos WhatsApp e visita, conclusão com resultado (falou / não atendeu / remarcou) e **próximo passo obrigatório**, adiar (snooze) que também empurra a previsão do negócio, tela "Meu dia" (atrasadas, hoje, próximas) com fila "Concluir e próximo" | Tipos ligar/e-mail/reunião/outro; concluir é só marcar | crm-tasks-agenda |
| 4 | **Busca global ⌘K / Ctrl+K**: contatos, empresas, negócios por nome, telefone (qualquer pedaço), e-mail, CNPJ; ações rápidas | Não existe | crm-list-views-search |
| 5 | **Visões salvas** (fase L4) e **ações em massa por filtro** (fase L5) | Abas fixas; seleção sem ações | crm-list-views-search |
| 6 | **Mesclar duplicados** (contato e empresa) com aviso de possível duplicado na ficha e mescla reversível | Dedupe só na criação/importação | crm-record-pages, crm-leads-import-dedupe |
| 7 | **CNPJ que se preenche** (BrasilAPI: razão social, fantasia, CNAE, porte, endereço, sócios opcional) e **telefone E.164** de verdade (`+55...`) | CNPJ só validado; telefone gravado como `55...` sem `+` | crm-brazil-integrations, crm-leads-import-dedupe |
| 8 | **Auditoria**: quem mudou o quê e quando (valor antigo/novo) em negócio, contato, empresa, permissões e chaves | Só histórico de etapa | crm-data-model |
| 9 | **IA que preenche o CRM com aprovação**: resumo da conversa de WhatsApp e do negócio; extração de valor, previsão, próximo passo, objeções como **sugestões** numa bandeja (aceitar com 1 toque), com evidência | IA só em filtros e rascunhos de automação | crm-ai-copilot |
| 10 | **Metas e painel do vendedor x gestor**: metas por pessoa/equipe/período (valor ganho, quantidade, atividades) com progresso; clicar num gráfico abre a lista filtrada | Painel sem metas e sem drill-down | crm-dashboards-reports |
| 11 | **Sinais de risco do negócio por regra**: sem próximo passo, previsão adiada 2x, só um contato, cliente sem resposta há X dias no WhatsApp | Só "parado" e "retorno atrasado" | crm-pipeline-kanban, crm-ai-copilot |

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
