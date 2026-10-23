# Histórico de alterações e auditoria

Data: 23/10/2026. Primeiro item da sequência vinda da comparação com o Gauzy
(`docs/pesquisa/ever-gauzy-comparacao.md`): histórico → caixa de decisões →
proposta → copiloto. Só ideias do Gauzy (AGPL), nenhum código.

## Objetivo

Responder "quem mudou isso, de quê para quê, e quando" em dois lugares:

1. **Na ficha** do negócio, do contato e da empresa: as alterações daquele registro.
2. **Na auditoria** (Configurações → Dados → Auditoria): tudo o que aconteceu no
   contrato, inclusive ações da conta.

Guardado por **2 anos**; depois a limpeza diária apaga.

## O que já existe e o que falta

- `publicarEvento` (`src/lib/server/eventos/barramento.ts`) grava em
  `eva_studio_eventos` com `diff` (`{ campo: { de, para } }`) e `ator`.
  `publicarAlteracao` (`eventos/alteracoes.ts`) já calcula o diff campo a campo,
  inclusive `custom_fields.<chave>`, para negócio, contato e empresa.
- `eva_studio_eventos` é a fila das automações e dos webhooks e é limpa em 90
  dias (`varreduras.ts`, `RETENCAO_DIAS`). Não serve de histórico.
- Ações na tela saem com ator `sistema`: só API (`api-v1/rota.ts`), agente
  (`flow-engine.ts`) e automações usam `comAtor`.
- Apagar e restaurar (`src/lib/server/lixeira.ts`) não publicam evento.
- A linha do tempo das fichas (`components/crm/negocio/linha-do-tempo.ts`) não
  mostra alteração de campo. A ficha da empresa não tem linha do tempo.

## Dados

Tabela nova `eva_studio_historico` (model `Historico`), em
`prisma/sql/2026-10-26-historico.sql`: só aditivo, numa transação, RLS ligada
sem política (padrão dos outros SQLs). Sem a tabela, nada quebra: gravar e ler
o histórico viram "não disponível" (mesmo padrão `semTabela` do barramento).

| Coluna | Tipo | O quê |
|---|---|---|
| `id` | text (uuid) | |
| `orgId` | text | |
| `acao` | text | ver lista abaixo |
| `objeto` | text | `deal`, `contact`, `company`, `member`, `role`, `permission_group`, `team`, `api_key`, `export` |
| `objetoId` | text | |
| `objetoNome` | text | nome no momento (o registro pode sumir depois) |
| `mudancas` | jsonb null | `{ campo: { de, para } }`, só em `alterou` |
| `detalhes` | jsonb | extra da ação (exportação: quantidade e filtro; chave: nome e prefixo) |
| `atorTipo` | text | `usuario`, `agente`, `automacao`, `api`, `integracao`, `sistema` |
| `atorId` | text null | userId, agentId, keyId ou automacaoId |
| `atorNome` | text | nome no momento (a pessoa pode sair da equipe) |
| `createdAt` | timestamp | |

Índices: `(orgId, objeto, objetoId, createdAt)`, `(orgId, createdAt)`,
`(orgId, atorId, createdAt)`.

### Ações

- Registros: `criou`, `alterou`, `apagou`, `restaurou`.
- Conta:
  - `membro.convidou`, `membro.removeu`, `membro.mudou_papel`;
  - `papel.criou`, `papel.alterou`, `papel.apagou`;
  - `grupo.criou`, `grupo.alterou`, `grupo.apagou`;
  - `equipe.criou`, `equipe.alterou`, `equipe.apagou`;
  - `chave_api.criou`, `chave_api.revogou`;
  - `exportou`.

### Regras de gravação

- Valores de texto acima de 500 caracteres são cortados (`…`).
- Nunca grava segredo: da chave de API só o nome e o `keyPrefix`.
- Ator com `teste: true` (Testar de verdade das automações) não grava: os
  registros do teste são apagados depois.
- Falha ao gravar só vai para o log. A ação da pessoa nunca cai por causa do
  histórico.
- A limpeza diária (`varreduras.ts`, já roda à hora cheia) apaga linhas com mais
  de 730 dias.

## Gravação

Módulo novo `src/lib/server/historico.ts`:

- `registrarHistorico(entrada)`: grava uma linha. Resolve `atorNome` (pessoa:
  nome do usuário; agente: nome do agente; automação: nome da automação; API:
  nome da chave). Usa `atorAtual()` quando a entrada não traz ator.
- `listarHistorico(orgId, filtro)`: lê com cursor (`createdAt` + `id`), filtros
  por objeto/objetoId, atorTipo/atorId, objeto (tipo), ação, período e busca em
  `objetoNome`.

De onde vem cada linha:

1. **Criar e alterar registro:** `publicarEvento` chama `registrarHistorico`
   quando `tipo` é `deal|contact|company` `.created` ou `.updated` (com o diff).
   Nenhuma rota muda.
2. **Apagar e restaurar:** `apagarComLixeira` e `restaurarDaLixeira` chamam
   `registrarHistorico` depois de concluir.
3. **Conta:** as rotas `api/members`, `api/roles`, `api/permission-groups`,
   `api/teams`, `api/api-keys` e as exportações (`api/contacts/exportar`,
   `api/deals/exportar`, `api/v1/exports`) chamam `registrarHistorico` depois de
   concluir.
4. **Quem fez, na tela:** `requirePermission`
   (`src/lib/server/permissions.ts`) passa a marcar o ator
   `{ tipo: "usuario", id: userId }` para o resto da requisição. O plano decide
   o mecanismo (`AsyncLocalStorage.enterWith` ou um embrulho da rota) e o prova
   com teste: um evento publicado depois de `requirePermission` sai com o ator
   da pessoa.

## Telas

### Ficha do negócio e do contato

- Rotas `/api/deals/[dealId]/linha-do-tempo` e
  `/api/contacts/[contactId]/linha-do-tempo` passam a incluir itens
  `tipo: "alteracao"`. Um item por gravação, com a lista de campos.
- Filtro novo "Alterações" ao lado de Conversas, Notas, Etapas e Tarefas; em
  "Tudo" entram na ordem do tempo.
- Item: quem fez (foto da pessoa, ou ícone para agente, automação e API;
  automação com link para ela), "alterou N campos" e a lista "Campo: de → para".
- Valores legíveis (função pura, testada):
  - responsável e etapa pelo nome;
  - etiquetas como etiquetas;
  - dinheiro, data e sim/não formatados;
  - campo personalizado pelo rótulo da definição;
  - vazio como "vazio".
- Mudança de etapa (`stage_id`) não entra no item de alteração: já existe o
  item "Etapa".

### Ficha da empresa

Bloco "Histórico" com as últimas 10 linhas da empresa e "Ver mais" (carrega
mais 20). Rota `GET /api/companies/[companyId]/historico`.

### Configurações → Dados → Auditoria

- Seção nova `?aba=auditoria`, ao lado de Lixeira.
- Rota `GET /api/auditoria` (cursor, até 50 por página).
- Lista com quando, quem, ação, registro e um resumo legível. Exemplos:
  "Exportou 1.240 contatos", "Mudou o papel de Bruno para Administrador".
- Filtros:
  - período;
  - quem fez (uma pessoa, ou IA, automação ou API);
  - tipo de registro;
  - ação;
  - busca pelo nome do registro.
- Clicar abre o detalhe com o de/para completo e um link para o registro, ou
  "apagado" se ele não existir mais.
- "Carregar mais" no fim.

### Permissões

- Ficha: quem vê o registro vê o histórico dele (mesma checagem e escopo de
  dados da ficha).
- Auditoria: permissão nova `auditoria:ver` no catálogo
  (`src/lib/permissoes/catalogo.ts`), ligada para Dono e Administrador, que
  pode ser dada a outros papéis.

## Testes

Vitest, ambiente node (`*.test.ts`), com o prisma mockado como nos testes
existentes:

- `historico.test.ts`:
  - grava com o ator do contexto;
  - corta textos longos;
  - não grava teste;
  - falha não propaga;
  - sem a tabela, não quebra;
  - filtros e cursor do `listarHistorico`.
- Barramento: `.updated` com diff grava histórico; `.created` grava; outros
  tipos não.
- Lixeira: apagar e restaurar gravam.
- `requirePermission`: evento publicado depois sai com o ator da pessoa.
- Rotas de conta: cada uma grava a ação certa, sem segredo na chave de API.
- Formatação dos valores (função pura) e o item `alteracao` na linha do tempo.
- Limpeza: apaga com mais de 730 dias.

## Fora do escopo

- Exportar a auditoria em CSV.
- Alertas ("avise quando alguém exportar").
- Histórico de tarefas, notas, funis, automações e agentes.
- Desfazer uma alteração pelo histórico.
- Gravar mudanças feitas direto no banco (fora do app).
