# Plano: listas de Contatos e Negócios no padrão de CRM de mercado

Data: 2026-10-20. Pedido do Alfredo: trazer para a Eva as funções das telas de
referência (lista de contatos, quadro de negócios, escolha de conta), com
"paginação e tal". Produto: Eva Studio (não é Beeno; as telas são só
referência de função).

## 1. O que as telas de referência têm

| Função | Contatos | Negócios |
|---|---|---|
| Visões salvas em abas, com contagem ("Todos os contatos 24.752") e "+" para criar | sim | sim ("Todos os negócios 184", "Follow-up Botox…") |
| Filtros rápidos em linha, cada um um menu | Proprietário, Equipes, Empresas, Etiquetas, Criado em, Última atividade | Contatos, Empresas, Proprietário, Equipes, Tarefas, Etiquetas, Produtos, Criado em, Fechado em |
| Filtros avançados (condições livres) | sim | sim |
| Busca | nome, sobrenome ou e-mail | por nome |
| Exportar (o que está filtrado) | sim | (pelo menu) |
| Importar | sim | sim |
| Editar colunas | sim | (engrenagem do quadro) |
| Tabela ordenável por coluna | sim | lista |
| Seleção em massa (caixas) | sim | — |
| Telefone com bandeira e formatado (+55 21 98171-0669) | sim | — |
| Paginação com números, "Próximo", itens por página (25) | sim | lista |
| Quadro: recolher coluna e "Recolher tudo" | — | sim |
| Quadro: rodapé da coluna com Total e Ponderado | — | sim |
| Quadro: tempo na etapa em minutos/horas ("31 minutos nesta etapa") | — | sim |
| Seletor de funil + alternar quadro/lista | — | sim |
| Escolha de conta depois do login ("Qual conta deseja acessar?", busca por nome ou id) | | |

## 2. O que a Eva tem hoje

**Contatos**
- Página com abas Contatos/Etiquetas/Segmentos.
- Busca por nome, e-mail e telefone (também só dígitos).
- Filtro por etiqueta e por segmento, mas não combinados com outros filtros rápidos.
- Paginação no servidor com página fixa e só Anterior/Próximo. Sem total por página escolhível nem números de página.
- Ordem fixa por `lastSeenAt`, sem ordenar por coluna, sem escolher colunas, sem seleção em massa.
- Importar CSV existe. Exportar contatos pela tela não existe (só pela API v1).

**Negócios**
- Quadro e lista, seletor de funil.
- Visões fixas: Todos, Meus, Precisam de atenção, Fechando este mês. Busca e filtro por responsável.
- Exportar CSV e PDF do funil, com os filtros da tela.
- Cartão personalizável por funil (campos, densidade, prévia).
- **Sem paginação:** o GET carrega todos os negócios do funil de uma vez. Com milhares de negócios por funil (o tamanho de clientes reais como a PayIP), a tela fica lenta e pesada.
- Total e previsto ficam no topo da coluna. Sem recolher coluna. Tempo na etapa só em dias.

**Dashboard:** já tem o motor de filtros mais completo do produto (grupos E/OU, operadores por tipo, campos personalizados), mas só para negócios e só em memória.

**Em andamento (outro agente):** contratos com ID na URL, usuário em N contratos, papéis, grupos, **equipes** e a tela de escolha de contrato. O filtro "Equipes" depende dele.

## 3. Decisões

1. **Um motor de filtro só, no servidor**, para contatos e negócios, com o mesmo formato de condição do dashboard (`src/lib/consulta.ts`: grupos E/OU, `campo`, `op`, `valor/valores/ate`). Tudo que é coluna vira `where` do Prisma; só o que não dá (ex. "dias na etapa" relativo, campo personalizado com operador numérico) é avaliado em memória sobre um conjunto já reduzido. Assim a contagem da aba e a página batem.
2. **Visão salva = filtros + colunas + ordenação + (no quadro) colunas recolhidas.** Pertence ao contrato; pode ser pessoal ou compartilhada. Visões de sistema ("Todos", "Meus", "Precisam de atenção", "Fechando este mês") ficam fixas e não apagáveis.
3. **Paginação por página numerada** (é o que o cliente reconhece) com `pageSize` 25/50/100 e total. No servidor, `skip/take` com índice adequado; acima de ~10 mil linhas a contagem exata pode virar estimativa ("mais de 10 mil").
4. **Quadro paginado por coluna:** o GET do quadro passa a devolver, por etapa, contagem e somas (agregadas no banco) e os primeiros N cartões (padrão 30). Cada coluna carrega mais ao rolar ("Carregar mais"). Totais e ponderado no rodapé saem do agregado, então ficam certos mesmo sem carregar tudo.
5. **Seleção em massa** marca a página ou "todos os N que batem com o filtro" (a ação vai para o servidor com o filtro, não com a lista de ids).

## 4. Fases e tarefas (cada uma com teste antes do código)

### Fase L1. Motor de filtro e listas no servidor — FEITA (2026-10-19, branch feat/dashboards-funil)

**O que foi entregue**
- `src/lib/filtro-crm.ts` (sem server-only, a tela usa): catálogos `CAMPOS_DE_CONTATO` e `CAMPOS_DE_NEGOCIO` (os do dashboard + equipe, contato, produto, tarefa), `VALORES_DE_TAREFA`, `sanearFiltroCrm`, `ORDENACOES`, `lerOrdenacao`, `lerTamanhoDePagina`, `lerPagina`. Filtro = formato do dashboard + `busca` (texto da caixa).
- `src/lib/server/filtro-crm.ts`: `whereDeContatos(ctx, filtro)` / `whereDeNegocios(ctx, filtro)` → `{ where, emMemoria, avisos }`, sempre `{ orgId, AND: [escopo, (archivedAt: null), atalhos, busca, filtro] }`; `resolverConjunto` (parte em memória), `idsDoFiltro(ctx, entidade, filtro, limite)` para a L5, `orderByDe`.
- Reaproveitado do dashboard (sem duplicar): `sanearCondicao/sanearFiltros` aceitam outro catálogo e avisam o descarte; `whereDeLista/whereDeData/whereDeTexto/whereDaCondicao/avaliarValor/valorDoCampoPersonalizado` exportados e genéricos no modelo.
- Rotas: `GET /api/contacts` (+`filtro`, `sort`, `dir`, `pageSize`), `POST /api/contacts/busca`, `GET /api/deals` (+`porEtapa`, `etapa`+`depois`, `filtro`), `POST /api/deals/busca`. Cartão do quadro saiu para `src/lib/server/quadro-negocios.ts`; listas em `src/lib/server/listas-crm.ts`.
- Índices: `prisma/sql/2026-10-20-indices-listas.sql` + `@@index` no schema (NÃO aplicado).

**Decisões / o que mudou do plano**
- Tudo exato no banco, inclusive "dias na etapa" (vira faixa de `stageSince` relativa a agora) e valor (limites arredondados para dentro, em centavos). Só campo personalizado de número/data vai para memória (até 5.000 linhas da pré-seleção, na ordem pedida; passou = `truncado`). Condição do banco dentro de um OU com condição de memória é conferida por ids — resultado continua exato.
- Campo personalizado texto: "é/não é" compara o texto como gravado (JSON do Prisma não tem `equals` sem maiúsculas); "contém" ignora maiúsculas.
- Tarefa: "atrasada" = aberta com prazo < agora; "hoje" = de agora até o fim do dia em São Paulo (mesma regra do Início, sem sobreposição).
- Quadro: SEM `porEtapa` devolve tudo como antes (+ `count` e `temMais:false` aditivos), então a tela atual não muda. COM `porEtapa` (padrão 30, máx. 100) usa agregado no banco (groupBy por etapa+probabilidade; ponderado arredondado por faixa, pode diferir centavos da soma cartão a cartão). Ordem da coluna paginada = (position, id); a tela antiga usa (position, createdAt desc).
- `GET /api/contacts` sem `pageSize` mantém 50 (a tela de hoje); com `pageSize` inválido, 25. `?segment=` de segmento inexistente/de outro contrato agora devolve vazio (antes ignorava o filtro).
- Ordenar por campo personalizado: não viável no Prisma sem SQL cru → ordem padrão + aviso.
- API v1 NÃO usa o motor: lista por cursor de `updatedAt` (sincronização incremental), filtros simples por query documentados no OpenAPI e chave de API sem escopo de papel. Encaixar filtros E/OU lá é mudança de contrato público — fica para quando houver pedido.

**Para L2/L3**
- Contatos: `POST /api/contacts/busca` `{ filtro, q, tag, segment, company, sort, dir, page, pageSize }` → `{ total, page, pageSize, contacts (com ownerId/owner), avisos, truncado, ordenacao }`.
- Negócios lista: `POST /api/deals/busca` `{ filtro, q, pipeline, arquivados, sort, dir, page, pageSize }` → `{ total, page, pageSize, deals (cartão + stage + pipeline), somaCents, avisos, truncado, ordenacao }`.
- Quadro: `GET /api/deals?pipeline=&porEtapa=30&filtro=<JSON>` → `stages[] { count, totalCents, weightedCents, deals, temMais, depois }`; mais cartões: `GET /api/deals?etapa=<id>&depois=<cursor>&porEtapa=30&filtro=<mesmo>` → `{ etapa, deals, temMais, depois }`. Mandar o MESMO filtro nas duas chamadas.
- Mostrar `avisos` (condição descartada, ordenação recusada) e `truncado`. Opções das listas vêm de: membros, equipes (`/api/teams`), empresas, etiquetas, segmentos, canais, contatos, produtos, `VALORES_DE_TAREFA`; `SEM_VALOR` = "sem responsável/empresa/equipe".
- `src/lib/server/filtro-crm.ts`: `whereDeContatos(orgId, filtro)` e `whereDeNegocios(orgId, filtro)` a partir do formato de condição. Campos de contato: responsável, equipe*, empresa, etiqueta, segmento, canal, criado em, última atividade (`lastSeenAt`), opt-in, e-mail/telefone preenchido, campos personalizados. Campos de negócio: os do dashboard mais contato, tarefa (atrasada, hoje, sem tarefa), produto, fechado em.
  - Testes: cada campo × operador vira o `where` esperado; E/OU aninhado; isolamento por org sempre presente; campo desconhecido é descartado com aviso.
- `GET /api/contacts`: aceita `filtro` (JSON na query ou POST `/api/contacts/busca`), `sort` (coluna + direção, só colunas permitidas), `page`, `pageSize` (25/50/100). Mantém `q`, `tag`, `segment`, `company` como atalhos.
  - Testes: ordenação por cada coluna, página fora do fim, pageSize inválido vira 25, contagem igual à soma das páginas.
- `GET /api/deals` (quadro): por etapa `{ count, totalCents, weightedCents, deals[0..N], temMais }`, com `?etapa=&depois=` para carregar mais. A lista paginada usa o mesmo motor.
  - Testes: totais vêm do agregado; "carregar mais" não repete nem pula; filtro aplicado igual no agregado e nos cartões.
- Índices novos se faltarem (ex. `(orgId, lastSeenAt)`, `(orgId, ownerId)`, `(orgId, createdAt)` em contatos; `(orgId, pipelineId, stageId, position)` em negócios), em SQL só aditivo.

### Fase L2. Contatos: tabela completa — FEITA (2026-10-19, branch feat/dashboards-funil)

**O que foi entregue**
- Tela `src/app/(app)/[contrato]/contatos/page.tsx` reescrita no design system (PageHeader + abas Contatos/Etiquetas/Segmentos); partes em `src/components/crm/contatos/` (`lista-de-contatos`, `ficha-do-contato` em Drawer, `modais` criar/importar, `etiquetas-e-segmentos`, `tipos`).
- Visões fixas com contagem (Todos, Meus, Sem proprietário) via `POST /api/contacts/busca` com `apenasTotal` (novo: conta sem buscar linhas).
- Barra: Proprietário, Equipes, Empresas, Etiquetas (FilterButton), Criado em e Última atividade (DateFilterButton: hoje, 7/30/90 dias, este mês, intervalo), Filtros avançados (gaveta com o editor do dashboard, agora com `catalogo`/`opcoesExtras`/`campoInicialId` — o dashboard segue igual), Limpar filtros, busca, Editar colunas, Importar, Exportar.
- Filtros da barra vão no filtro como `rapidos` (novo em `FiltroCrm`; saneados com o catálogo, sem `cf:`; o motor soma como E no banco). Assim a barra não disputa o limite de grupos nem muda o sentido de um OU dos avançados.
- Tabela: DataTable com ordenação no servidor (nome, e-mail, proprietário, celular, empresa, criado, última atividade), seleção, cabeçalho fixo, Pagination 25/50/100. Colunas: Nome (fixa), E-mail, Proprietário, Celular, Telefone, Empresa, Cargo, Etiquetas, Canais, Origem, Aceita mensagens, Última atividade, Criado em e campos personalizados.
- Editar colunas (ColumnPicker): escolher/reordenar, salvo em localStorage por lista+contrato+usuário (`src/lib/listas/colunas.ts`).
- Estado (visão, busca, barra, avançados, ordem, página, tamanho) na URL via `history.replaceState` (`src/lib/listas/estado-da-lista.ts` + `use-estado-da-lista.ts`); `?abrir=` continua abrindo a ficha.
- Telefone com bandeira: `src/lib/telefone.ts` (DDI → país → `public/bandeiras/<iso>.svg`, 15 países; sem DDI e 10–11 dígitos = Brasil) + `PhoneNumber`.
- Exportar: `GET /api/contacts/exportar` (mesmo filtro/ordem/escopo, até 10 mil, `contatos:exportar`, contrato na query) + `src/lib/exportar/contatos.ts`.
- Design system: `PhoneNumber`, `DateFilterButton`, `SearchInput`, `SegmentedControl`, `ColumnPicker`, `Notice`; `FilterButton.onSearchChange`. Identidade da Eva nos tokens (commit à parte).
- Testes: telefone/bandeira, períodos, montagem do filtro da barra, URL ida e volta, colunas salvas, `rapidos` no saneamento e no motor, planilha de contatos.

**Ficou para depois**
- Seleção marca linhas, mas as ações em massa são da L5 (a barra de seleção avisa).
- Visões salvas ("+" nas abas) e colunas no banco: L4.
- Filtro de segmento saiu da barra (está nos avançados como "Segmento").

- Barra de filtros rápidos: Proprietário (inclui "sem proprietário"), Equipes*, Empresas, Etiquetas, Criado em, Última atividade (presets e intervalo), cada um com várias escolhas e busca.
- "Filtros avançados": reaproveita o editor de grupos do dashboard (`src/components/dashboard/editor-de-filtros.tsx`) com o catálogo de campos de contato.
- Tabela: colunas Nome, E-mail, Proprietário, Celular, Telefone, Empresa, Etiquetas, Última atividade, Criado em e campos personalizados. Ordenar clicando no cabeçalho, cabeçalho fixo, linhas com link para a ficha.
- Telefone formatado com bandeira do país (DDI → bandeira em SVG local, sem dependência nova; Brasil `+55 21 98171-0669`).
- "Editar colunas": escolher e reordenar, salvo na visão.
- Paginação: números de página, Anterior/Próximo, itens por página.
- Exportar CSV do que está filtrado (reaproveita `src/lib/exportar`); Importar continua.
- Testes de componente/funções puras: formatação de telefone por DDI, montagem do filtro a partir da barra, persistência de colunas.

### Fase L3. Negócios: quadro e lista no mesmo nível — FEITA (2026-10-19, branch feat/dashboards-funil)

**O que foi entregue**
- `src/app/(app)/[contrato]/negocios/page.tsx` reescrita: PageHeader (descrição com abertos, total e ponderado agregados), seletor de funil (`?funil=` na URL), Quadro | Lista (SegmentedControl), Exportar, Importar, Criar negócio; abas de visão com contagem (Todos, Meus, Precisam de atenção, Fechando este mês — `components/crm/negocios/visoes.ts`, todas no motor; "atenção" = grupo OU parado > 7 dias / tarefa atrasada / previsão vencida, só aberto).
- Barra igual à de contatos: Contatos (busca no servidor), Empresas, Proprietário, Equipes, Tarefas, Etiquetas, Produtos, Criado em, Fechado em + Filtros avançados (catálogo de negócio), busca, Recolher/Expandir tudo, engrenagem (configurar cartão), "Como ler", seletor de estilo.
- Quadro paginado: `GET /api/deals?porEtapa=30&filtro=`; "Carregar mais" automático ao rolar o fim da coluna (IntersectionObserver + botão), `juntarCartoes` sem duplicar; rodapé Total/Ponderado do agregado + "N de M carregados"; recolher coluna e tudo (localStorage por usuário+contrato+funil até a L4).
- Arrastar entre etapas e zonas Ganho/Perdido mantidos; o movimento otimista agora acerta contagem/total/ponderado (`moverCartao`) e só recarrega se o servidor recusar (preserva os "carregar mais").
- Cartão no design system (sem borda âmbar, avatar cinza, sinal vira Badge de status, WhatsApp em `text-success`), respeitando o layout personalizável; rodapé fixo "31 minutos / 3 horas / 2 dias nesta etapa" quando o layout não tem "Tempo na etapa" (o texto do campo também passou a minutos/horas/dias).
- Lista: `ListaDeNegocios` (DataTable, `POST /api/deals/busca`, ordenação no servidor, colunas editáveis com campos personalizados, seleção, soma do filtro, Pagination).
- Eva · 1/2/3 mantidos e restilizados: cabeçalho com brilho e a marca "A" (MarcaEva) saíram — o topo é o PageHeader; recado em painel neutro com eyebrow; momentos em linha; "Desde ontem / Pede sua atenção" em painéis; comemoração em toast neutro. Keyframe `eva-respira` removido.
- Importar negócios pela tela: `POST /api/deals/import` (CSV até 1.000 linhas, `negocios:criar`) reaproveitando `linhasDoCsv` + `processarLinha` da API v1 em lote (contato achado/criado por e-mail/telefone; etapa padrão escolhida na tela).
- Prévia, legenda e zonas restilizadas; `list-view.tsx` removido; NewDealModal virou `novo-negocio.tsx`.
- Design system: KanbanColumn ganhou `containerRef`, `highlighted`, `headerActions`, `footerNote`.
- Testes: tempo na etapa ("31 minutos", "3 horas", "2 dias"), carregar mais sem duplicar, mover com totais, visões (fim do mês, grupo OU, conflito com avançados em OU).

**Limitações / para depois**
- A voz da Eva (recado, momentos, "desde ontem", atenção) olha só os cartões carregados (30 por coluna); para valer no funil inteiro precisa de um resumo no servidor.
- Exportar CSV/PDF ainda usa o filtro antigo (funil, busca, visão e um proprietário); passar o filtro do motor para `/api/deals/exportar` fica para a L5 (exportar em massa).
- "Precisam de atenção" com avançados em OU de vários grupos não dá para combinar sem mudar o sentido: a tela avisa e mostra só os abertos.
- Recolhidas e colunas no localStorage até a L4; ações em massa da seleção na L5.

- Mesma barra de filtros rápidos com os campos de negócio (Contatos, Empresas, Proprietário, Equipes*, Tarefas, Etiquetas, Produtos, Criado em, Fechado em) + Filtros avançados.
- Quadro paginado por coluna (L1), rodapé com Total e Ponderado, recolher coluna e "Recolher tudo" (salvo na visão), tempo na etapa com minutos/horas/dias.
- Lista paginada no servidor com as mesmas colunas editáveis e seleção.
- Importar negócios pela tela (CSV, mesma lógica da importação de contatos e da API v1 em lote).
- Testes: texto do tempo na etapa ("31 minutos", "3 horas", "2 dias"), estado recolhido por visão, totais do rodapé com filtro.

### Fase L4. Visões salvas em abas — FEITA (2026-10-20, branch feat/dashboards-funil)

**O que foi entregue**
- Tabelas `eva_studio_saved_views` (orgId, entity contatos|negocios,
  pipelineId?, name, ownerId, visibility pessoal|equipe|contrato, teamId?,
  config JSON, position) e `eva_studio_saved_view_defaults` (padrão por
  pessoa e lista; id de salva ou de sistema). SQL
  `prisma/sql/2026-10-20-visoes-salvas.sql`, NÃO aplicado.
- Config = `{ visaoBase, estado: { busca, listas, datas, avancado, ordem,
  tamanho }, colunas?, recolhidas?, modo? }`. `visaoBase` é a de sistema em
  que a salva se apoia ("Meus" continua sendo de quem olha).
- Abas: de sistema (fixas) + salvas visíveis, com contagem ao vivo (mesmo
  motor, `apenasTotal`). "+" cria do que está na tela (pede nome e quem vê).
  Menu da aba ativa: Renomear, Duplicar, Mudar visibilidade, Definir como
  padrão, Apagar (as de sistema só têm Duplicar e Definir como padrão).
- "Não salvo": ponto na aba + faixa "Alterações não salvas em busca,
  Proprietário…" com Salvar (só quem pode mexer), Salvar como nova e
  Descartar. Ajuste de quem não é dono nunca grava na compartilhada.
- URL: `?v=<id>` + SÓ o que difere da visão (parâmetro vazio = "tirei o
  filtro que a visão tinha"; `cols=` e `rec=` para colunas/recolhidas).
  Trocar de aba usa pushState (Voltar volta à aba anterior); o resto,
  replaceState. Link para visão que a pessoa não enxerga: aviso + os filtros
  do link continuam valendo (dados sempre pelo escopo do servidor).
- Campo removido: condição dos avançados com `cf:` apagado ou id fora do
  catálogo vira chip vermelho "campo removido: x" com "Tirar do filtro" (o
  motor já ignorava com aviso).
- Colunas (lista de contatos e de negócios) e recolhidas (quadro) vêm da
  visão salva; nas de sistema (e sem as tabelas) continuam no navegador. O
  "+" leva as do navegador para a visão (a migração). Modo quadro/lista
  guardado na visão é aplicado ao abri-la.

**Mudanças de comportamento**
- De uma visão salva para uma de sistema, a lista começa limpa (os filtros
  eram da visão); entre visões de sistema continua mantendo os filtros.
- Com visão padrão definida, `/contatos` e `/negocios` sem `?v=` abrem nela
  (a lista espera o GET das visões antes da primeira busca).

- Tabela nova `eva_studio_saved_views` (orgId, entidade, pipelineId?, nome, dono, compartilhada, filtro, colunas, ordenação, recolhidas, posição).
- Abas com contagem ao vivo, "+" cria a partir do filtro atual, renomear, duplicar, compartilhar, apagar. Visão alterada mostra "Salvar alterações / Salvar como nova".
- Testes: contagem da aba = total da lista; visão pessoal não aparece para outro usuário; compartilhada sim; isolamento por contrato.

### Fase L5. Ações em massa — FEITA (2026-10-20, branch feat/dashboards-funil)

**O que foi entregue**
- `POST /api/contacts/lote` e `/api/deals/lote` `{ acao, ids? | filtro?,
  pipelineId?, parametros, simular? }` → `{ total, ok, ignorados, falhas[{id,
  nome, motivo, codigo, faltando}], truncado, avisos, previa, desfazer }`.
  Contatos: atribuir, etiqueta (+/−; adicionar dispara a sequência de
  gatilho, como o applyTag), sequência, apagar. Negócios: atribuir, mover,
  ganho, perdido (motivo obrigatório da lista do funil), arquivar, apagar.
  Exportar = link para os exportar com `?ids=` (até 500) ou `?filtro=`.
- Por filtro ("Selecionar todos os N resultados"): `idsDoFiltro` no
  servidor, contrato + escopo (+ funil), até 5.000 com aviso. Por ids:
  conferidos contra `{ orgId, escopo }`, o resto conta como ignorado.
- Permissão por ação (`PERMISSAO_DA_ACAO`); atribuir não passa para membro
  de outro contrato (404) nem para fora do escopo do papel (403).
- Escritas simples em transações de 200; mover/ganho/perdido um a um por
  `moveDealStage` (com as regras; 6 em paralelo), histórico com
  `registrarMudancasEmLote` (origem `usuario`, novo `historicoEmLote` no
  moveDealStage); apagar um a um por `apagarComLixeira` (foto).
- `simular: true` = prévia (mover simula pelo próprio moveDealStage):
  "12 negócios vão de Proposta → Negociação; 3 bloqueados por campos
  obrigatórios; 2 sem mudança". A tela sempre mostra a prévia antes de
  aplicar; bloqueados voltam listados com o que falta e "Abrir".
- Desfazer (toast de 8 s): a resposta traz o corpo pronto — atribuir →
  `restaurar_responsavel` (dono de antes por registro), etiqueta → a
  inversa só nos que mudaram, mover/ganho/perdido → `restaurar_etapa`
  (reabrir, mesmas regras), arquivar → `desarquivar`, apagar →
  `restaurar_lixeira` (restaura da lixeira em lote). Limites: vale enquanto
  o toast está na tela (o "antes" fica só no navegador); quem mexeu nos
  registros nesse meio-tempo é sobrescrito; voltar de etapa pode ser
  bloqueado pelas regras (vem em `falhas`); desfazer etiqueta não tira das
  sequências em que o gatilho inscreveu; sequência e apagar definitivo (sem
  lixeira) não têm Desfazer.
- Exportar negócios passou a usar o filtro do motor (`?filtro=` no
  `/api/deals/exportar` e no relatório em PDF); `busca/dono/visao` antigos
  só valem sem `?filtro=` (links antigos).
- Ações em massa só na lista de negócios (o quadro não tem seleção).

- Caixa por linha, "selecionar esta página", "selecionar todos os N".
- Contatos: atribuir proprietário, adicionar/remover etiqueta, adicionar a sequência, exportar, apagar (com confirmação e contagem).
- Negócios: atribuir proprietário, mover de etapa, marcar ganho/perdido (com motivo), exportar, arquivar.
- Servidor recebe o filtro ou os ids, aplica em lote dentro do contrato, devolve quantos mudaram; registra histórico de etapa em lote.
- Testes: "todos os N" usa o filtro e não ultrapassa o contrato; permissão por ação (depende das permissões novas).

### Fase L6. Escolha de contrato
Repassada ao agente de contratos: "Olá <nome>, qual contrato deseja acessar?", busca por nome ou id, tabela Id/Nome/Acessar, entrada direta quando há um contrato só.

\* Equipes dependem da frente de contratos/permissões.

## 5. Ordem e dependências

1. Esperar a frente de contratos/permissões ser juntada: ela mexe nos mesmos arquivos (links, `getSessionContext`, páginas sob `/[contrato]/`).
2. L1 → L2 e L3 podem andar em paralelo (arquivos diferentes) → L4 → L5.
3. SQL de índices e de visões salvas só aditivo, aplicado com OK.

## 6. Riscos

- **Desempenho com bases grandes:** contagem exata em tabelas de centenas de milhares pode ser lenta; usar índices e, se preciso, estimativa acima de um limite.
- **Filtros em memória:** limitar ao conjunto já reduzido no banco e avisar quando a lista for truncada (como o dashboard faz).
- **Seleção "todos":** sempre reaplicar o filtro no servidor dentro do contrato; nunca confiar em ids vindos da tela sem conferir o contrato.
