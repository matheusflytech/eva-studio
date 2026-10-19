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

### Fase L2. Contatos: tabela completa
- Barra de filtros rápidos: Proprietário (inclui "sem proprietário"), Equipes*, Empresas, Etiquetas, Criado em, Última atividade (presets e intervalo), cada um com várias escolhas e busca.
- "Filtros avançados": reaproveita o editor de grupos do dashboard (`src/components/dashboard/editor-de-filtros.tsx`) com o catálogo de campos de contato.
- Tabela: colunas Nome, E-mail, Proprietário, Celular, Telefone, Empresa, Etiquetas, Última atividade, Criado em e campos personalizados. Ordenar clicando no cabeçalho, cabeçalho fixo, linhas com link para a ficha.
- Telefone formatado com bandeira do país (DDI → bandeira em SVG local, sem dependência nova; Brasil `+55 21 98171-0669`).
- "Editar colunas": escolher e reordenar, salvo na visão.
- Paginação: números de página, Anterior/Próximo, itens por página.
- Exportar CSV do que está filtrado (reaproveita `src/lib/exportar`); Importar continua.
- Testes de componente/funções puras: formatação de telefone por DDI, montagem do filtro a partir da barra, persistência de colunas.

### Fase L3. Negócios: quadro e lista no mesmo nível
- Mesma barra de filtros rápidos com os campos de negócio (Contatos, Empresas, Proprietário, Equipes*, Tarefas, Etiquetas, Produtos, Criado em, Fechado em) + Filtros avançados.
- Quadro paginado por coluna (L1), rodapé com Total e Ponderado, recolher coluna e "Recolher tudo" (salvo na visão), tempo na etapa com minutos/horas/dias.
- Lista paginada no servidor com as mesmas colunas editáveis e seleção.
- Importar negócios pela tela (CSV, mesma lógica da importação de contatos e da API v1 em lote).
- Testes: texto do tempo na etapa ("31 minutos", "3 horas", "2 dias"), estado recolhido por visão, totais do rodapé com filtro.

### Fase L4. Visões salvas em abas
- Tabela nova `eva_studio_saved_views` (orgId, entidade, pipelineId?, nome, dono, compartilhada, filtro, colunas, ordenação, recolhidas, posição).
- Abas com contagem ao vivo, "+" cria a partir do filtro atual, renomear, duplicar, compartilhar, apagar. Visão alterada mostra "Salvar alterações / Salvar como nova".
- Testes: contagem da aba = total da lista; visão pessoal não aparece para outro usuário; compartilhada sim; isolamento por contrato.

### Fase L5. Ações em massa
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
