# Histórico de alterações e auditoria — plano de implementação

> **Para quem executa:** seguir tarefa por tarefa (superpowers:executing-plans),
> TDD: teste falhando, código mínimo, teste passando, commit.

**Objetivo:** gravar e mostrar quem mudou o quê e quando, na ficha (negócio,
contato, empresa) e na auditoria do contrato (Configurações → Dados →
Auditoria), guardando por 2 anos.

**Arquitetura:**
- Tabela própria `eva_studio_historico`.
- `src/lib/server/historico.ts` grava e lê.
- Fontes das linhas:
  - o barramento (`publicarEvento`) grava criar e alterar;
  - a lixeira grava apagar e restaurar;
  - as rotas da conta gravam as ações de conta.
- A pessoa da tela é marcada pela requisição (WeakMap pelo objeto de
  `headers()`), porque `AsyncLocalStorage.enterWith` não atravessa o `await`
  dentro do Next (provado em teste no node: dentro de um `run`, o caller não
  vê o store).
- Os valores são formatados para leitura no servidor, com nomes de
  responsável, etapa, funil, empresa e rótulos de campo personalizado, por uma
  função pura.

**Stack:** Next.js 16 App Router, Prisma 7 (cliente em `src/generated/prisma`),
Postgres (Supabase), Vitest (node, `src/**/*.test.ts`).

Spec: `docs/superpowers/specs/2026-10-23-historico-e-auditoria-design.md`.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `prisma/sql/2026-10-26-historico.sql` (novo) | cria a tabela, índices, RLS |
| `prisma/schema.prisma` | `model Historico` |
| `src/lib/historico/tipos.ts` (novo) | tipos compartilhados tela/servidor |
| `src/lib/historico/formatar.ts` (novo, + test) | função pura: mudanças → linhas legíveis; resumo da ação |
| `src/lib/server/historico.ts` (novo, + test) | `registrarHistorico`, `listarHistorico`, `limparHistoricoVencido`, `marcarPessoaDaRequisicao`, `atorDaRequisicao` |
| `src/lib/server/historico-leitura.ts` (novo, + test) | carrega o dicionário (nomes) e devolve itens prontos para a tela |
| `src/lib/server/eventos/barramento.ts` | usa o ator da requisição; grava histórico de `.created/.updated` |
| `src/lib/server/permissions.ts` | marca a pessoa ao resolver a sessão |
| `src/lib/server/lixeira.ts` | grava apagou/restaurou |
| `src/lib/server/membros.ts`, rotas `roles`, `permission-groups`, `teams`, `api-keys`, exportações | gravam as ações de conta |
| `src/lib/server/automacoes/varreduras.ts` | limpeza de 730 dias |
| `src/lib/permissoes/catalogo.ts` | `auditoria:ver` |
| rotas de linha do tempo (negócio, contato), `api/companies/[companyId]/historico`, `api/auditoria` | leitura |
| `src/components/crm/negocio/linha-do-tempo.ts`, `atividade.tsx` | item `alteracao` e filtro "Alterações" |
| ficha da empresa | bloco "Histórico" |
| `src/components/configuracoes/aba-auditoria.tsx` (novo), `configuracoes/page.tsx` | seção Auditoria |

## Tipos (fonte única: `src/lib/historico/tipos.ts`)

```ts
export type AcaoDoHistorico =
  | "criou" | "alterou" | "apagou" | "restaurou"
  | "membro.convidou" | "membro.removeu" | "membro.mudou_acesso"
  | "papel.criou" | "papel.alterou" | "papel.apagou"
  | "grupo.criou" | "grupo.alterou" | "grupo.apagou"
  | "equipe.criou" | "equipe.alterou" | "equipe.apagou"
  | "chave_api.criou" | "chave_api.revogou"
  | "exportou";

export type ObjetoDoHistorico =
  | "deal" | "contact" | "company" | "member" | "role"
  | "permission_group" | "team" | "api_key" | "export";

export type Mudancas = Record<string, { de: unknown; para: unknown }>;

export interface LinhaDoHistorico {
  id: string;
  acao: AcaoDoHistorico;
  objeto: ObjetoDoHistorico;
  objetoId: string;
  objetoNome: string;
  mudancas: Mudancas | null;
  detalhes: Record<string, unknown>;
  atorTipo: string;
  atorId: string | null;
  atorNome: string;
  em: string; // ISO
}

/** Uma mudança pronta para a tela. */
export interface MudancaLegivel { campo: string; rotulo: string; de: string; para: string }

/** Linha pronta para a tela (ficha e auditoria). */
export interface ItemDoHistorico extends Omit<LinhaDoHistorico, "mudancas"> {
  resumo: string;              // "Alterou 2 campos", "Exportou 1.240 contatos"
  mudancas: MudancaLegivel[];
  existe: boolean;             // registro ainda existe (link na auditoria)
}
```

---

### Tarefa 1: tabela e model

**Arquivos:** criar `prisma/sql/2026-10-26-historico.sql`; mexer em
`prisma/schema.prisma` (depois de `model EventoDeDominio`).

- [ ] SQL (padrão dos outros: `BEGIN; CREATE TABLE IF NOT EXISTS ...; índices;
  ENABLE ROW LEVEL SECURITY; COMMIT;`):

```sql
-- Histórico de alterações e auditoria (spec 2026-10-23). Só aditivo, RLS
-- ligada sem política. Sem esta tabela: nada quebra, a ficha e a auditoria
-- dizem que o histórico ainda não está ativado.
BEGIN;
CREATE TABLE IF NOT EXISTS "eva_studio_historico" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "objetoId" TEXT NOT NULL,
    "objetoNome" TEXT NOT NULL DEFAULT '',
    "mudancas" JSONB,
    "detalhes" JSONB NOT NULL DEFAULT '{}',
    "atorTipo" TEXT NOT NULL DEFAULT 'sistema',
    "atorId" TEXT,
    "atorNome" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eva_studio_historico_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "eva_studio_historico_registro_idx" ON "eva_studio_historico"("orgId", "objeto", "objetoId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_historico_org_idx" ON "eva_studio_historico"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_historico_ator_idx" ON "eva_studio_historico"("orgId", "atorId", "createdAt");
CREATE INDEX IF NOT EXISTS "eva_studio_historico_limpeza_idx" ON "eva_studio_historico"("createdAt");
ALTER TABLE "eva_studio_historico" ENABLE ROW LEVEL SECURITY;
COMMIT;
```

- [ ] Model Prisma com os mesmos campos, `@@index` iguais e `@@map("eva_studio_historico")`.
- [ ] `npx prisma generate`. Esperado: cliente gerado sem erro.
- [ ] Commit `feat(historico): tabela eva_studio_historico`.

### Tarefa 2: gravar, ler e limpar (`src/lib/server/historico.ts`)

**Teste primeiro** (`src/lib/server/historico.test.ts`, prisma mockado como
em `teste-real-seguranca.test.ts`):

1. `registrarHistorico({ orgId, acao: "alterou", objeto: "deal", objetoId, objetoNome, mudancas })`
   sem ator usa `atorAtual()`; com ator `usuario` busca `profile.name` e grava
   `atorNome`.
2. Texto acima de 500 caracteres em `mudancas` vira 500 + `…`, inclusive dentro
   de `custom_fields.x`.
3. Ator com `teste: true` não grava.
4. `create` rejeitando com erro genérico não propaga (só loga); com
   "eva_studio_historico does not exist" não loga.
5. Sem `objetoNome`, busca o nome do registro (`deal.name`, `contact.name`,
   `company.name`).
6. `listarHistorico(orgId, { objeto, objetoId, atorId, atorTipo, acao, objetoTipo, de, ate, busca, cursor, limite })`
   monta o `where` certo e devolve `{ linhas, proximo }` com cursor
   `"<iso>|<id>"`. Pede `limite + 1` para saber se tem mais.
7. `limparHistoricoVencido(agora)` faz `deleteMany` com `createdAt < agora - 730 dias`.
8. `marcarPessoaDaRequisicao` + `atorDaRequisicao`: com o `headers()` mockado
   devolvendo o mesmo objeto, o ator volta `{ tipo: "usuario", id }`. Fora de
   requisição (`headers()` lança), volta `null`.

**Código** (pontos-chave):

```ts
import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { atorAtual, type Ator } from "@/lib/server/eventos/barramento";

const pessoasDaRequisicao = new WeakMap<object, Ator>();
export async function marcarPessoaDaRequisicao(userId: string) {
  try { pessoasDaRequisicao.set(await headers(), { tipo: "usuario", id: userId }); } catch { /* fora de requisição */ }
}
export async function atorDaRequisicao(): Promise<Ator | null> {
  try { return pessoasDaRequisicao.get(await headers()) ?? null; } catch { return null; }
}
```

Para evitar import circular (o barramento vai importar o histórico), o
`atorAtual`/`comAtor` continuam no barramento. O histórico importa só o tipo
`Ator`, e `atorAtual` chega como parâmetro, resolvido por quem chama.

- [ ] Rodar `npx vitest run src/lib/server/historico.test.ts`: falha; implementar; passa.
- [ ] Commit.

### Tarefa 3: ator da tela e barramento

**Arquivos:** `permissions.ts`, `eventos/barramento.ts`, `barramento.test.ts`.

- [ ] Teste no barramento:
  - sem `comAtor` e com `atorDaRequisicao` mockado, o evento grava o ator `usuario`;
  - `comAtor` tem prioridade;
  - `deal.updated` com diff chama `registrarHistorico` com `acao: "alterou"`;
  - `contact.created` chama com `"criou"`;
  - `deal.stage_changed` não chama.
- [ ] `publicarEvento` faz `const ator = e.ator ?? contextoDoAtor.getStore() ?? (await atorDaRequisicao()) ?? { tipo: "sistema" }`.
  Depois de gravar o evento, quando é `deal|contact|company` e `.created` ou
  `.updated` com diff, chama
  `depoisDaResposta(() => registrarHistorico({...}, ator))`.
- [ ] `getSessionContextDetalhado` chama `await marcarPessoaDaRequisicao(user.id)`
  quando a sessão resolve.
- [ ] Teste de `requirePermission` (mock de supabase/prisma/contratos): depois
  dele, `atorDaRequisicao()` devolve a pessoa.
- [ ] Commit.

### Tarefa 4: lixeira

- [ ] Teste: `apagarComLixeira` grava `apagou` com `objetoNome = nomeDaFoto(foto)`
  depois da transação; `restaurarDaLixeira` grava `restaurou` com `item.name`.
  Falha no histórico não muda o retorno.
- [ ] Implementar nos dois, chamando `registrarHistorico` depois do commit.
- [ ] Commit.

### Tarefa 5: ações da conta

Cada chamada fica depois da ação concluir, com `void`/`await` de
`registrarHistorico` (nunca lança).

- `membros.ts`:
  - `convidarMembro`: `membro.convidou`, objeto `member`, nome, `detalhes: { email, papel }`;
  - `alterarMembro`: `membro.mudou_acesso`, com `mudancas` só do que mudou (`papel`, `papel_personalizado`, `grupos`, `equipes`), usando os nomes;
  - `removerMembro`: `membro.removeu`.
- `roles` POST/PATCH/DELETE: `papel.*`, com o nome do papel (no DELETE, lido antes de apagar).
- `permission-groups` e `teams`: `grupo.*` e `equipe.*`, mesmo padrão.
- `api-keys` POST: `chave_api.criou`, `detalhes: { prefixo: keyPrefix, escopos }`.
  `[id]` DELETE: `chave_api.revogou`, lendo `name` e `keyPrefix`. Nunca grava a chave nem o hash.
- Exportações:
  - `contacts/exportar`: `exportou`, objeto `export`, `objetoNome: "Contatos"`, `detalhes: { entidade: "contatos", quantidade, truncado, filtro }`;
  - `deals/exportar`: idem com o funil e o formato;
  - `api/v1/exports`: `detalhes: { entidade, formato }`.

- [ ] Testes: `membros.test.ts` (convidar, alterar, remover gravam; sem segredo)
  e `api-keys/route.test.ts` (o histórico não recebe `key`/`keyHash`).
- [ ] Commit.

### Tarefa 6: formatação legível (pura)

`src/lib/historico/formatar.ts`:

```ts
export interface Dicionario {
  pessoas: Record<string, string>;   // userId -> nome
  etapas: Record<string, string>;
  funis: Record<string, string>;
  empresas: Record<string, string>;
  contatos: Record<string, string>;
  campos: Record<string, { rotulo: string; tipo: string; opcoes?: { value: string; label: string }[] }>; // chave do custom field
}
export function formatarMudancas(objeto: string, m: Mudancas | null, d: Dicionario, opcoes?: { semEtapa?: boolean }): MudancaLegivel[];
export function resumoDaLinha(l: LinhaDoHistorico, n: number): string;
```

- Rótulos fixos por objeto: `name` vira Nome, `amount_cents` vira Valor, `expected_closing_at` vira Previsão de fechamento, `owner_id` vira Responsável, `stage_id` vira Etapa, `pipeline_id` vira Funil, `company_id` vira Empresa, `email`, `phone`, `job_title`, `tags` vira Etiquetas, `contacts` vira Contatos, `cnpj` etc.
- Ignorados na tela: `status`, `closed_at`, `stage_since`, `position`, `currency`, `archived_at`. Com `semEtapa`, ignora também `stage_id` e `pipeline_id`.
- Valores:
  - centavos em BRL;
  - datas ISO em dd/mm/aaaa;
  - booleanos em Sim/Não;
  - ids pelo dicionário (ausente: "removido");
  - listas `{id,name}` pelos nomes;
  - `contacts` pelos `contact_id` no dicionário;
  - custom field pelo tipo (opção pelo label, data, moeda, sim/não);
  - vazio, null e `""` como "vazio".
- `resumoDaLinha`:
  - criou: "Criou"; alterou: "Alterou 1 campo" ou "Alterou N campos"; apagou e restaurou;
  - "Exportou 1.240 contatos";
  - "Convidou Ana (ana@x.com)";
  - "Mudou o acesso de Bruno";
  - "Criou a chave de API Produção (evs_live_4f2a)".
- [ ] Testes de cada regra acima (`formatar.test.ts`), commit.

### Tarefa 7: leitura pronta para a tela

`src/lib/server/historico-leitura.ts`:
`itensDoHistorico(orgId, linhas, opcoes)` coleta ids de pessoa, etapa, funil,
empresa e contato de todas as mudanças, busca os nomes (uma consulta por tipo,
sempre com `orgId`), carrega as definições de campo (`carregarDefinicoes`) dos
objetos presentes, confere quais registros ainda existem e devolve
`ItemDoHistorico[]`. Com `semEtapa`, linhas `alterou` que ficam sem mudança
somem.

- [ ] Teste com prisma mockado: um `owner_id` vira o nome; um registro apagado
  vem com `existe: false`; com `semEtapa`, só a mudança de etapa some. Commit.

### Tarefa 8: ficha do negócio e do contato

- [ ] `linha-do-tempo.ts`:
  - item novo `(Base & DoNegocio & { tipo: "alteracao"; ator: { tipo, nome, id }; mudancas: MudancaLegivel[] })`;
  - filtro `"alteracoes"`;
  - `descreverItem`: "Ana Souza alterou 2 campos" (ou "Automação X alterou…", "Agente…", "API…").
  - Testes no `linha-do-tempo.test.ts`, se existir, ou num novo.
- [ ] Rotas: buscar
  `listarHistorico(orgId, { objeto: "deal", objetoId, acao: "alterou", limite: 100 })`
  e `itensDoHistorico(..., { semEtapa: true })`.
  - O contato faz o mesmo para o próprio contato.
  - Sem a tabela, a lista vem vazia.
- [ ] `atividade.tsx`: filtro "Alterações" e item com ícone do ator e lista "Rótulo: de → para".
- [ ] Commit.

### Tarefa 9: ficha da empresa

- [ ] Rota `GET /api/companies/[companyId]/historico?cursor=` (permissão
  `read`, confere a empresa na org), com 10 itens na primeira página e 20 nas
  seguintes.
- [ ] Bloco "Histórico" na ficha, com "Ver mais".
- [ ] Commit.

### Tarefa 10: permissão e auditoria

- [ ] `catalogo.ts`: módulo `{ id: "auditoria", nome: "Auditoria", acoes: ["ver"] }`,
  na lista extra de owner e admin. Ajustar `catalogo.test.ts`.
- [ ] `GET /api/auditoria`:
  - permissão `auditoria:ver`;
  - filtros por query (`de`, `ate`, `ator`, `atorTipo`, `objeto`, `acao`, `q`, `cursor`), até 50 por página;
  - devolve `{ disponivel, itens, proximo, pessoas }`, onde `pessoas` alimenta o filtro.
- [ ] `aba-auditoria.tsx`:
  - filtros com `Select`/`Input`;
  - lista com data, quem, resumo e registro (link quando `existe`);
  - detalhe expandindo a linha com as mudanças;
  - "Carregar mais".
- [ ] `configuracoes/page.tsx`: aba `auditoria` no grupo "Dados", visível com `auditoria:ver`.
- [ ] Commit.

### Tarefa 11: limpeza de 2 anos

- [ ] `varreduras.ts`, no mesmo bloco que roda à hora cheia, chama
  `limparHistoricoVencido(agora)` e soma em `limpos`. Teste em
  `varreduras-gerenciar.test.ts`. Commit.

### Tarefa 12: verificação final

- [ ] `npx vitest run`: tudo passando.
- [ ] `npx tsc --noEmit`, `npx eslint` nos arquivos mexidos, `npx next build`.
- [ ] Abrir no navegador local:
  - o filtro "Alterações" na ficha;
  - o bloco da empresa;
  - a Auditoria;
  - sem a tabela, cada tela mostra o aviso e nada quebra.
- [ ] SQL aplicado só com o OK do Matheus/Alfredo (banco local aponta para produção).
- [ ] PR com descrição e o SQL para aplicar.
