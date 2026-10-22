# Plano: Automações do CRM (fluxos com gatilho, condição e ação, ao vivo)

Data: 2026-10-21. Pedido do Alfredo. Produto: Eva Studio. Tudo local até ele
autorizar PR; banco só aditivo, com RLS ligada nas tabelas novas, e com OK antes de
aplicar.

Skills: crm-automation-engine (motor), crm-automation-builder-ui (tela),
crm-automation-catalog (gatilhos, ações, modelos, guardrails), react-flow,
crm-design-system.

## O que o Alfredo pediu

Fluxos de automação para tudo (etapas, negócios, contatos, empresas, tarefas,
conversas), bonitos e profissionais, mostrando em tempo real o que está acontecendo
e quantos milissegundos cada passo levou, com log de todas as execuções. Referência
visual: as demos "Eva por dentro" e "Eva Automação" do site da Eva Holding (painel
escuro, números no topo, cartões que ficam verdes, ligações animadas). Referência
funcional: os fluxos do Beeno.

Decisões (21/10):
- **Desenho:** árvore com layout automático da **esquerda para a direita** (gatilho à
  esquerda, passos abrindo para a direita), sem fio solto nem passo órfão; "+" em cada
  ligação.
- **Réguas (Sequências):** ficam como estão; a automação ganha "Inscrever na régua" e
  "Tirar da régua".
- **Primeira entrega:** motor e log, tela e visão ao vivo, gatilhos e ações de todos os
  objetos, e regras rápidas na coluna do kanban. Em partes, um commit local por parte.

## O que já existe (mapa de 21/10)

- **Réguas:** `Sequence`, `SequenceStep` e `SequenceEnrollment`. Os gatilhos são
  tag, segmento, etapa (varredura) e manual. Os passos só mandam mensagem ou aplicam
  tag. O relógio roda `processDueEnrollments`.
- **Regras de etapa:** `PipelineStageRule` com campos obrigatórios e dias para
  "parado". `moveDealStage` é o único caminho para mudar de etapa e tem o atalho
  `ignorarObrigatorios` para automação. `DealStageEvent` é o histórico, com
  `origem`.
- **Fluxo do agente** (`flow-engine.ts`): é por conversa. Grava `FlowExecution` com
  os passos e o `ms` de cada um, sem horário de início nem de fim.
- **Eventos de domínio:** `src/lib/server/webhooks/emitir.ts` é chamado em
  contato, lead, negócio (via `stage-events.ts`), tarefa e mensagem. Não emite em
  tag, tarefa criada, empresa, troca de responsável nem "parado".
- **Relógio** (`/api/internal/scheduler`, a cada minuto, trava de 45 s):
  sequências, disparos, jobs, webhooks e lixeira. O worker do Render acorda as esperas
  do fluxo do agente.
- **Não existe:** modelo de automação nem de execução, notificação interna e rodízio
  de responsável.
- **Do Beeno vale copiar:**
  - alvo E/OU que tira o registro do fluxo;
  - espera relativa a um campo de data;
  - decisão com janela de tempo;
  - mapa de ações com contagem e falha por passo;
  - auditoria de alterações e linha do tempo por registro;
  - reinscrição configurável;
  - rodízio de dono por percentual.
- **No Beeno falta (e aqui entra):**
  - gatilho de empresa, tarefa, conversa, data e webhook;
  - WhatsApp e IA como ação;
  - mais de dois caminhos;
  - horário comercial;
  - teste;
  - versões;
  - erro com nova tentativa.

## Desenho

### Banco (SQL `2026-10-24-automacoes.sql`, aditivo, RLS ligada, não aplicado)

| Tabela | Para quê |
|---|---|
| `eva_studio_automacoes` | nome, descrição, objeto (deal, contact, company, task, conversation), status (rascunho, ativa, pausada), rascunho (JSON), versão publicada, reinscrição (uma vez, sempre ou intervalo), objetivo (E/OU), falhas seguidas, motivo da pausa, origem (fluxo ou regra_rapida) |
| `eva_studio_automacao_versoes` | definição imutável por publicação (número, quem, quando). Execução presa à versão |
| `eva_studio_eventos` | barramento de eventos de domínio (outbox): tipo, objeto, id, dados, diff, ator (usuário, automação, integração, api, com automação, execução e profundidade) |
| `eva_studio_automacao_execucoes` | uma por registro inscrito: versão, evento, chave de dedupe única, status (pendente, rodando, esperando, concluída, falhou, cancelada, objetivo, pausada), passo atual, próxima hora (espera durável), trava (lease), início, fim, duração em ms, teste sim/não |
| `eva_studio_automacao_passos` | passo a passo da execução: nó, tipo, rótulo, status, tentativa, entrada resolvida, saída, erro, caminho seguido, início, fim, ms (corpo até 16 KB, PII mascarada) |
| `eva_studio_automacao_esperas` | "esperar evento": tipo do evento, registro (orgId + objetoId) e prazo |

Índices para o relógio: `(status, proximaEm)` nas execuções, `(orgId, tipo,
createdAt)` nos eventos e `(execucaoId, iniciadoEm)` nos passos. Limpeza: passos e
eventos com mais de 90 dias saem no relógio, e o número de execuções por dia fica
guardado.

### Definição (JSON tipado, `src/lib/automacoes/`, sem `server-only`)

- `gatilho` + `passos` em árvore: cada nó tem um id estável e `proximo`. Os tipos de
  nó são:
  - `acao` (com `tipo` do catálogo);
  - `condicao`: se/senão, com grupos E dentro de um OU;
  - `caminhos`: N caminhos e "caso contrário", vale o primeiro que bate;
  - `espera`: duração em dias úteis ou horas, até uma data, ou relativa a um campo;
  - `esperar_evento`: saídas "aconteceu" e "tempo esgotado";
  - `fim`.
- Condições sem `eval`: árvore de comparação com operadores filtrados pelo tipo do
  campo. As variáveis `{{ }}` só aceitam caminho e um filtro da lista fechada
  (`primeiro_nome`, `moeda`, `data`, `telefone`, `padrao`).
- `registro.*` é relido do banco a cada passo; `gatilho.*` é a foto do momento do
  evento.
- **Operações puras** `aplicar(def, op)` (adicionar, apagar, mover, duplicar, atualizar)
  compartilhadas pela tela e pelo servidor. Dão desfazer/refazer, validação no
  servidor e auditoria.
- `fraseDaAutomacao(def)` gera a frase do topo: "Quando um negócio entrar em
  Proposta, esperar 2 dias úteis; se não respondeu, mandar o modelo X e criar a tarefa
  Ligar".
- `validar(def)` devolve as pendências por nó. Nunca bloqueia a edição, só a
  publicação.

### Motor (`src/lib/server/automacoes/`)

1. **Barramento:** `publicarEvento()` substitui as chamadas diretas de
   `emitirEvento`. Grava em `eva_studio_eventos` e, depois da resposta, entrega a
   **webhooks** (como hoje) e a **automações**. Os pontos de emissão novos são: tag
   +/−, tarefa criada, tarefa atrasada (varredura), empresa criada/alterada,
   responsável alterado, campo alterado (com diff), conversa aguardando humano e
   opt-out.
2. **Casamento:** índice das automações ativas por (contrato, tipo de evento), depois
   o filtro do gatilho, a reinscrição e a supressão. Cria a execução com `INSERT ...
   ON CONFLICT (chave) DO NOTHING`.
3. **Executor:** pega a execução com `FOR UPDATE SKIP LOCKED` e lease de 60 s, roda
   até 20 passos por vez e grava cada passo com ms. Espera, horário silencioso e limite
   viram `esperando` com `proximaEm` (uma linha, não uma função dormindo). A primeira
   rodada sai logo após o evento (`after`); o resto, no relógio.
4. **Varreduras no relógio:**
   - esperas vencidas;
   - leases vencidos;
   - "parado N dias";
   - "tarefa atrasada";
   - "data relativa a campo" (aniversário, renovação);
   - agendadas (todo dia às X sobre um segmento);
   - limpeza.
5. **Ações externas** (WhatsApp, e-mail, webhook): grava `rodando`, chama com chave de
   idempotência `execucao:no:tentativa` e grava o resultado. Na nova tentativa, confere
   o que já saiu antes de reenviar.
6. **Erros:**
   - 429, 5xx e tempo esgotado: nova tentativa com espera crescente (até 6 em ~2 h);
   - validação, janela de 24 h fechada ou número fora do WhatsApp: caminho de erro
     (opcional no nó) ou falha;
   - 10 falhas seguidas pausam a automação e avisam no Início.
7. **Guardrails:**
   - todo evento leva o ator; profundidade acima de 3 para com "Loop detectado"
     visível;
   - a automação não dispara a si mesma no mesmo registro em 10 min;
   - "campo alterado" só dispara quando o valor muda de fato e ignora as alterações
     feitas pela própria automação;
   - opt-out de sistema sempre ligado;
   - horário silencioso para falar com o cliente (seg–sáb 8h–20h, sem feriado,
     fuso de São Paulo, configurável);
   - "aplicar a quem já atende" mostra a contagem antes e roda em lote com limite.
8. **Versões:** sempre se edita o rascunho. Publicar segue três passos: validar, depois
   "aplicar a quem já atende?" com a contagem, depois confirmar. Quem está no meio
   continua na versão antiga (a opção "cancelar" fica no assistente).
9. **Teste** (modo seguro): roda num registro real com `teste = true`. As ações de
   efeito só mostram o que fariam, ou mandam o WhatsApp só para o número de quem
   testa. As esperas não esperam. O teste fica 7 dias no histórico.

### Catálogo da primeira entrega

**Gatilhos**
- Negócio: criado, entrou na etapa (criação, movimento ou ambos), saiu da etapa,
  ganho, perdido (com filtro de motivo), reaberto, parado N dias, campo alterado (de →
  para), responsável alterado.
- Contato: criado, campo alterado, tag adicionada/removida, virou lead.
- Empresa: criada, campo alterado.
- Tarefa: criada, concluída, atrasada.
- Conversa: mensagem recebida (primeira, qualquer, ou contendo uma palavra, com
  intervalo mínimo), cliente sem responder há X h, aguardando atendente há X min.
- Data relativa a um campo de data (X dias antes ou depois).
- Agendado (todo dia ou semana, sobre um segmento).
- Webhook de entrada (URL própria da automação, com token).
- Manual (botão no registro e em massa na lista, com prévia da contagem).

**Condições**
- Campos do registro e dos registros ligados (negócio → contato e empresa).
- Tag, etapa, funil, responsável, origem.
- Janela de 24 h aberta, aceita mensagens, tem negócio aberto, dia útil, horário
  comercial.
- Resultado de um passo anterior.

**Ações**
- **Registro:** atualizar campos, mover etapa ou funil, marcar ganho ou perdido, criar
  negócio (inclusive em outro funil), criar ou atualizar contato, adicionar ou tirar
  tag, criar nota.
- **Pessoas:**
  - atribuir responsável (fixo, rodízio igual ou por percentual, menos carga);
  - criar tarefa (prazo em dias úteis);
  - concluir as tarefas abertas;
  - avisar a equipe (e-mail interno e aviso no app; a notificação interna é um modelo
    novo simples).
- **Cliente:** WhatsApp (texto com a janela aberta; modelo aprovado fora dela),
  e-mail (modelo da Biblioteca), inscrever ou tirar de uma régua, passar a conversa
  para atendente ou pausar o agente.
- **Controle:** esperar, se/senão, caminhos, esperar evento com prazo, parar.
- **Integração:** n8n/webhook assinado (mesma assinatura dos webhooks) e HTTP com a
  resposta virando variável.

**IA:** classificar e extrair ficam para a parte 2 (precisa de orçamento e saída
estruturada).

**Modelos prontos (galeria, 10):**
1. Lead novo no WhatsApp: contato e negócio, rodízio, saudação e alerta se ninguém
   responder em 5 min.
2. SLA da primeira resposta com escalonamento.
3. Negócio parado: tarefa e, depois de 2 dias úteis, alerta ao gestor.
4. Proposta sem resposta em 2 dias úteis: modelo e tarefa "ligar".
5. Tarefa por etapa (playbook).
6. Ganho: n8n, funil de pós-venda e agradecimento.
7. Perdido por preço: régua de nutrição.
8. Aniversário do contato.
9. Formulário/lead externo: criar ou atualizar e modelo em 5 min.
10. Reativação de quem está há 90 dias parado.

### Tela

- **Menu:** Automações (grupo Automação, primeiro item).
- **Lista** (`/automacoes`):
  - faixa no estilo da demo da Eva Holding: execuções hoje, tempo médio, erros,
    ativas;
  - cartões com a frase, o status, o número de execuções e de erros, e quando foi a
    última;
  - botões "Nova" (abre a galeria) e "Em branco".
- **Editor** (`/automacoes/[id]`):
  - canvas React Flow em layout próprio esquerda→direita, recursivo, com nó de
    tamanho fixo e sem arrastar;
  - "+" no meio de cada ligação abre o seletor (popover com busca e seções);
  - painel à direita com as abas Configurar, Testar e Saída, com campos de variável;
  - selo vermelho nos nós com pendência e "N pendências" no topo;
  - salva sozinho; desfazer/refazer; botão Publicar com o assistente;
  - minimapa; a frase legível no topo.
- **Ao vivo:** a aba Execuções lista as execuções (registro, status, duração, quando,
  versão) com filtros. Ao abrir uma:
  - o canvas mostra a execução por cima: a ligação animada até o passo atual e cada nó
    com anel verde, amarelo ou vermelho e o `ms`;
  - ao lado, a linha do tempo no estilo "Eva por dentro" (passo, detalhe e ms) com a
    entrada e a saída de cada passo;
  - a execução em andamento atualiza sozinha (consulta a cada 1 s enquanto roda; sem
    canal novo);
  - botões para reexecutar a partir de um passo (com confirmação) e abrir no editor
    com os dados da execução.
- **No registro** (negócio, contato, empresa): seção "Automações" com o que rodou
  ("Automação X mandou o modelo Y") e as **próximas ações agendadas**, com a opção de
  tirar dali.
- **Regras rápidas:** ⚡ no cabeçalho da coluna do kanban com a contagem. Abre uma
  frase para preencher ("Quando entrar nesta etapa → [ação] → [quando]"). Vira uma
  automação com `origem = regra_rapida`, que pode ser "aberta como fluxo".

### Partes (um commit local por parte, testes em cada uma)

| Parte | Entrega |
|---|---|
| A | SQL + modelos Prisma; tipos da definição, validação, operações puras, frase legível, catálogo; testes |
| B | Barramento de eventos (webhooks passam a ler dele) e pontos de emissão novos; testes |
| C | Motor: casamento, executor, esperas duráveis, varreduras, nova tentativa, anti-loop, auto-pausa, versões; passo no relógio; testes |
| D | Ações e condições do catálogo, incluindo rodízio de responsável e aviso interno; testes |
| E | Telas: lista com KPIs, galeria, editor (layout E→D, "+", painel, pendências, publicar/versões) |
| F | Execuções ao vivo (canvas animado, linha do tempo em ms), teste em modo seguro, seção no registro |
| G | Regras rápidas no kanban |
| H | Docs (HANDOFF, ajuda), graphify, conferência no navegador |

Riscos e cuidados:
- **Tempo da Vercel:** o executor roda ≤ 20 passos por chamada e o resto vai no
  relógio.
- **Volume de passos:** limite de corpo e limpeza de 90 dias.
- **Disparo em massa por "aplicar a quem já atende":** prévia e lote.
- **WhatsApp:** uma régua e uma automação mandando ao mesmo tempo para o mesmo
  contato. Limite de mensagens por contato por dia, compartilhado com as réguas.

## Andamento

### Parte A: FEITA (21/10/2026, local, SQL não aplicado)
- SQL `prisma/sql/2026-10-24-automacoes.sql` (6 tabelas, RLS ligada) e modelos
  `Automacao`, `AutomacaoVersao`, `EventoDeDominio`, `AutomacaoExecucao`,
  `AutomacaoPasso`, `AutomacaoEspera`.
- `src/lib/automacoes/` (sem `server-only`, mesmos arquivos na tela e no servidor):
  - `tipos.ts`: definição em árvore, saídas por tipo de nó;
  - `catalogo.ts`: 34 gatilhos, 20 ações e os campos que as condições enxergam, com
    formulário, `mostrarSe` e frase;
  - `condicoes.ts`: avaliação sem eval (texto sem acento, número, data, listas de
    etiquetas por id ou nome);
  - `variaveis.ts`: `{{ caminho | filtro }}` com lista fechada de filtros;
  - `operacoes.ts`: inserir, apagar, atualizar, duplicar, mover e caminhos;
  - `validar.ts`: estrutura, obrigatórios, ciclo, passo solto, variável de passo
    posterior, aviso de janela de 24h e de autoalimentação;
  - `frase.ts`.
- 34 testes em `src/lib/automacoes/*.test.ts`.

### Revisão da parte A: corrigida (21/10/2026)
Revisão independente achou 24 pontos; todos corrigidos, com um teste por achado em
`src/lib/automacoes/revisao.test.ts`:
- **Condições:** data só ISO, Date ou ms ("Proposta 2" não vira data); dia sem hora vale
  o dia inteiro em São Paulo; número estrito com milhar brasileiro; grupo vazio
  ignorado no OU; caminho só lê propriedade própria.
- **Variáveis e frase:** dia sem hora não volta um dia; moeda de vazio fica vazia;
  variável mal escrita e filtro fora da lista viram erro; lista de etapas com nome;
  padrões do catálogo na frase.
- **Operações:** chaves editáveis por tipo; caminhos só reordena/renomeia (ids
  iguais); nó novo com tipo desconhecido, id `gatilho` ou caminho repetido é
  recusado; apagar com ramo inexistente é erro; mover mantém o erro ligado.
- **Validação:** forma de cada nó antes de caminhar (JSON quebrado vira pendência);
  variável de passo posterior também em condição e espera; aviso de 24h zera quando o
  cliente responde; operandos de "entre", "últimos dias" e datas.
- **SQL/Prisma:** FK de esperas → execuções (cascade), execuções → versão (no
  action), versão publicada (set null, única).

### Parte B: FEITA (21/10/2026, local)
- **Barramento** (`src/lib/server/eventos/barramento.ts`): `publicarEvento` grava em
  `eva_studio_eventos` e entrega depois da resposta. Quem marca `processadoEm` primeiro
  entrega, então a entrega acontece no máximo uma vez. O relógio entrega o que ficou
  para trás há mais de 1 min (`entregarEventosPendentes`). Sem a tabela, entrega direto,
  como antes.
- **Ator** por `AsyncLocalStorage` (`comAtor`): a API v1 marca "api" (com a chave) e o
  agente marca "agente". O resto sai como "sistema". A parte C marca "automacao", com a
  cadeia e a profundidade.
- **Consumidores** em lista fixa. Os webhooks passaram a ler do barramento
  (`webhooks/do-barramento.ts`) e as automações entram na parte C.
- **"Campo alterado"** (`eventos/alteracoes.ts`): foto do registro antes e depois, no
  formato da API, e `<objeto>.updated` só com o que mudou. Campos personalizados vão um
  a um (`custom_fields.<chave>`), e etiquetas comparam pelos ids. Responsável mudou
  também publica `deal.owner_changed`.
- **Pontos de emissão:**
  - etiqueta adicionada e removida, e opt-out;
  - tarefa criada (`createTask` e próxima tarefa da conclusão);
  - empresa criada e alterada (tela e API);
  - negócio alterado (tela, API, campos pelo fluxo);
  - contato alterado (tela, API, campos pelo fluxo);
  - responsável em massa;
  - conversa aguardando atendente (bloco Equipe do fluxo).

  Os que já existiam passaram a sair pelo barramento.
- **Webhooks e n8n** ganharam os eventos novos (`contact.tag_added/tag_removed/opted_out`,
  `company.created/updated`, `deal.updated/owner_changed`, `task.created`), na tela e no
  gatilho do pacote do n8n.
- **Fica de fora** (sem emissão ainda): importação de CSV da tela, e edição de contato
  pelo lead (`atualizarLead`) e pela conversa (`syncContactFromConversation`), que mudam
  dados a cada mensagem.

### Parte C: FEITA (21/10/2026, local, SQL não aplicado)
- **Puro** (`src/lib/automacoes/`):
  - `calendario.ts`: dias úteis com feriados nacionais e Sexta-feira Santa, e horário
    comercial seg–sáb 8h–20h em São Paulo;
  - `casar.ts`: o evento casa com o gatilho (etapa na criação ou no movimento, campo
    alterado ignorando a própria automação, palavra-chave por palavra inteira, canal,
    motivo e tipo de tarefa), mais os registros que um evento toca;
  - `interpretar.ts`: próximo movimento de cada nó e o fim de cada espera.
- **Servidor** (`src/lib/server/automacoes/`):
  - `contexto.ts`: registro, contato, empresa, gatilho, passos e sistema, relidos a
    cada passo, com campos derivados (situação do negócio, tarefa aberta, janela de
    24h);
  - `executor.ts`: lease de 60 s, até 20 passos por rodada, cada passo gravado com ms.
    - Espera = status "esperando" + `proximaEm`.
    - Objetivo encerra na hora.
    - Opt-out pula e fora do horário comercial espera a janela.
    - Nova tentativa até 6 com espera crescente; erro definitivo segue o caminho de
      erro ou falha.
    - 10 falhas seguidas pausam.
    - Teste simula as ações externas e não espera.
  - `inscricao.ts`: uma vez, sempre (uma viva por registro) ou intervalo, com chave
    única;
  - `casamento.ts`: consumidor do barramento.
    - Inscreve, acorda o "esperar evento" (também nos negócios do contato) e confere
      o objetivo.
    - Anti-loop: não dispara a si mesma; com cadeia ≥ 3 fica uma execução cancelada
      "Loop detectado".
  - `varreduras.ts`: o passo do relógio.
    - Lease vencido volta para a fila.
    - Gatilhos parado, tarefa atrasada, data de campo (consulta parametrizada),
      agendado, sem resposta e aguardando atendente.
    - Roda as vencidas e faz a limpeza de 90 dias de hora em hora.
  - `gerenciar.ts`: publicar (versão nova imutável; a versão 0 é o rascunho de
    teste), pausar, retomar, inscrever à mão e testar.
  - `acoes.ts`: só nota e etiqueta; o resto é a parte D.
- **Ligações:** o barramento chama `paraAutomacoes`; o relógio chama
  `rodarAutomacoes`. A mensagem recebida traz `primeira`.
- **Cuidado para a parte E:** em gatilho de varredura (parado, agendado, data), a
  reinscrição padrão na tela deve ser "sempre". Com "uma vez", o registro só entra na
  primeira vez.

### SQL aplicado e teste ponta a ponta (21/10/2026)
- `2026-10-24-automacoes.sql` aplicado em produção: 6 tabelas com RLS (anon vê 0) e as 6
  chaves estrangeiras certas.
- **Teste contra o banco de produção**, no contrato do Alfredo. O script temporário foi
  apagado depois e o banco ficou zerado.
  - Montagem: um contato de teste com opt-out e duas etiquetas de teste. A automação
    era: etiqueta A → condição → nota com variável → espera de 1 min → etiqueta B.
  - Do evento à execução: 1,7 s. Os passos levaram 90–230 ms cada; a espera voltou
    pelo relógio das automações (`rodarAutomacoes`) e o total ficou em 62 s.
  - Resultado: a nota saiu "Automação de teste rodou para Teste", e a etiqueta B foi
    posta com ator `automacao` e profundidade 1. A etiqueta B não reinscreveu
    ninguém (1 execução).
- **Visto no caminho:** 2 de 5 rodadas locais caíram com "Connection terminated
  unexpectedly" do pooler (porta 6543) logo no começo. É rede local ↔ Supavisor, não
  o motor, mas vale olhar o `idleTimeout` do pool em `src/lib/db/prisma.ts` antes da
  produção.

### Parte D: FEITA (21/10/2026, local, SQL novo não aplicado)
- **Organização:** `src/lib/server/automacoes/acoes/`, com os arquivos `registro.ts`,
  `pessoas.ts`, `cliente.ts` e `integracao.ts`, mais `comum.ts` e `tipos.ts`. As 20
  ações do catálogo têm quem as execute, e um teste confere que nenhuma ficou sem.
- **Registro:**
  - "Atualizar campos" passa pelas funções da API v1, com as mesmas validações e os
    mesmos eventos. Aceita campos personalizados, número, booleano e vazio (vazio
    limpa o campo).
  - "Mover", "ganho" e "perda" passam pela etapa do funil com origem `automacao` e
    `ignorarObrigatorios` registrado.
  - "Criar negócio" respeita "não criar se já tem aberto". "Criar ou atualizar
    contato" liga o contato ao negócio. Etiqueta e nota completam o grupo.
- **Pessoas:**
  - Responsável: fixo, rodízio igual ou por percentual (tabela de contagem com linha
    travada) ou quem tem menos negócios abertos. Só aceita membro ativo e respeita
    "só se vazio".
  - Tarefa com prazo em dias úteis e "concluir as abertas".
  - "Avisar a equipe": aviso no app (tabela `eva_studio_avisos`) e e-mail pelo domínio
    do contrato. No teste, o e-mail não sai.
- **Cliente:**
  - WhatsApp pela conversa, pelo canal do contato com o agente ou pelo telefone. A
    janela de 24h segue a escolha do passo: pular ou falhar. Limite de envio e falha
    de rede tentam de novo.
  - E-mail por modelo: descadastrado pula; sem domínio é falha definitiva.
  - Régua: entrar e sair. Conversa: passar para a fila ou para uma pessoa.
- **Integração:**
  - n8n: POST com o registro, o contato, a empresa e o gatilho. Com segredo `whsec_`
    vai assinado no padrão Standard Webhooks; o webhook-id é a chave do passo.
  - HTTP com cabeçalhos em JSON. Para os dois: 2xx ok, 408/429/5xx tentam de novo
    (respeitando Retry-After) e URL interna é bloqueada.
- **SQL novo:** `2026-10-25-avisos-rodizio.sql`, não aplicado.
- **Fica para depois:**
  - os avisos não aparecem em lugar nenhum da tela (sino ou Início): é a parte F;
  - a idempotência do WhatsApp na nova tentativa depende de o passo não ter chegado a
    enviar (não há conferência no canal).
