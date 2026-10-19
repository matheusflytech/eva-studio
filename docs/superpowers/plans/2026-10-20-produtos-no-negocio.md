# Produtos no negócio — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps em checkbox (`- [ ]`). TDD: teste primeiro, vê falhar, implementa, vê passar.

**Goal:** o negócio deixa de ser só "um valor digitado" e passa a ter **itens** vindos de um **catálogo de produtos** da organização (como HubSpot Products/Line items, Pipedrive Products, RD Station CRM e Agendor). O valor do negócio vira a soma dos itens (com opção de valor manual), a ficha mostra MRR/ARR quando há recorrência, o cartão do quadro pode mostrar "3 produtos · Plano Pro +2", a planilha do funil ganha a coluna "Produtos" (e uma exportação de itens, uma linha por item) e o dashboard ganha o agrupamento "Por produto".

**Architecture:** contas puras (total do item, desconto, soma, MRR/ARR, resumo do cartão, leitura de quantidade e desconto) em `src/lib/produtos.ts`, testadas sem banco. O servidor (`src/lib/server/produtos.ts`) só busca, grava e **recalcula o valor do negócio numa transação** sempre que os itens mudam. Rotas finas em `/api/products` e `/api/deals/[dealId]/items`. Tudo filtrado por `orgId` vindo da sessão.

**Tech Stack:** Next.js 16 (App Router, `params: Promise`), Prisma 7, Postgres, React 19, Tailwind 4, Vitest 4 (prisma mockado com `vi.hoisted` + `vi.mock`).

**Contexto obrigatório:**
- Tudo local (sem push/PR). `.env` aponta para produção: **nada de `db push`/`migrate`**; o SQL fica em `prisma/sql/2026-10-20-produtos.sql` para alguém aplicar revisado.
- Mudança **só aditiva**: três tabelas novas, nenhuma coluna nova em tabela existente. Motivo: o Prisma seleciona todas as colunas do modelo; uma coluna nova em `eva_studio_deals` derrubaria o quadro inteiro se o código subisse antes do SQL. Com tabelas à parte (mesmo raciocínio de `PipelineCardLayout`), sem o SQL o resto do CRM segue igual e só a parte de produtos avisa que não está ativa.

## Como o mercado faz (e o que copiamos)

| CRM | Catálogo | Item no negócio | Valor do negócio |
|---|---|---|---|
| HubSpot | Products (nome, SKU, preço, recorrência, prazo) | Line item = cópia do produto (preço/nome congelados), qtd, desconto % ou valor | "Amount" = soma dos line items, recalculado; MRR/ARR/TCV calculados |
| Pipedrive | Products (código, unidade, preço por moeda, categoria, ativo) | qtd, preço, desconto % ou valor, "duração" | Valor = soma dos produtos, com opção de editar manualmente |
| RD Station CRM | Produtos (nome, preço, recorrência) | qtd, desconto | Valor total do negócio = soma; separa único x recorrente |
| Agendor | Produtos/Serviços (código, preço, categoria) | qtd, desconto | Valor = soma dos itens |

Decisões tiradas daí:
1. **Nome, código, unidade, preço e recorrência são congelados no item.** Mudar o preço no catálogo não reescreve proposta antiga. Apagar o produto não apaga o item (FK `SET NULL`).
2. **Item avulso** (sem produto do catálogo) é permitido, como no HubSpot/Pipedrive.
3. **Desconto por item**, em % ou em R$, nunca maior que o bruto.
4. **Valor = soma dos itens**, recalculado no servidor; o usuário pode ligar "usar valor manual" (Pipedrive).
5. **MRR/ARR** só aparecem quando há item recorrente: mensal conta inteiro no MRR; anual conta 1/12. ARR = MRR × 12.

## Modelo (Prisma + SQL)

```prisma
model Product {            // eva_studio_products
  id, orgId, name, sku (""), description (""), priceCents Int, currency ("BRL"),
  unit ("un"), recurrence ("unico" | "mensal" | "anual"), category (""),
  archivedAt DateTime?, createdAt, updatedAt
  @@index([orgId, archivedAt])
}
model DealItem {           // eva_studio_deal_items
  id, orgId, dealId (FK cascade), productId String? (FK set null),
  name, sku, unit, recurrence      // congelados do produto (ou digitados no avulso)
  unitPriceCents Int               // congelado
  quantity Decimal(12,3)
  discountType ("percentual" | "valor"), discountValue Int
    // percentual: centésimos de ponto (1050 = 10,50%); valor: centavos
  totalCents Int                   // calculado no servidor
  position Int, createdAt, updatedAt
  @@index([dealId, position]) @@index([orgId, productId])
}
model DealAmountSetting {  // eva_studio_deal_amount_settings (1:1 com o negócio)
  dealId @id (FK cascade), orgId, manualAmount Boolean (false), updatedAt
}
```

`Deal`, `Organization` e `Product` ganham só os campos de relação (não viram coluna).

SQL (`prisma/sql/2026-10-20-produtos.sql`): `BEGIN; CREATE TABLE IF NOT EXISTS ...; CREATE INDEX IF NOT EXISTS ...; DO $$ ... ADD CONSTRAINT ... $$; COMMIT;` — mesmo padrão dos outros arquivos da pasta.

## Regra do valor do negócio

- Itens mudaram (adicionar, editar, remover, reordenar não conta) → na mesma transação: se o negócio tem ≥ 1 item **e** não está em valor manual, `amountCents = soma(totalCents)`.
- Sem itens: o valor volta a ser digitado e **fica como estava** (remover o último item não zera o negócio de surpresa).
- "Usar valor manual" liga `manualAmount = true`: a soma para de mandar, o campo Valor volta a ser editável. Desligar recalcula na hora.
- `PATCH /api/deals/[dealId]` com `amount` num negócio com itens e sem valor manual → **409** "O valor deste negócio vem dos produtos…". Se as tabelas não existem ainda, a checagem cai fora (sem itens) e nada muda.
- Teto: a soma não pode passar de `MAX_CENTAVOS` (coluna Int) → 400.

## API

| Rota | Permissão | O quê |
|---|---|---|
| `GET /api/products?busca=&arquivados=1` | read | Lista (até 200; busca em nome/código/categoria; ativos por padrão) |
| `POST /api/products` | agents:manage | Cria (limite 2.000 por org) |
| `GET/PATCH/DELETE /api/products/[productId]` | read / agents:manage | Lê, edita (`archived: true/false` arquiva), apaga (itens ficam, sem vínculo) |
| `GET /api/deals/[dealId]/items` | read | `{ itens, valorManual, resumo, disponivel }` |
| `POST /api/deals/[dealId]/items` | contacts:manage | Adiciona do catálogo (`productId`, opcionais `quantity`, `unitPrice`, `discountType`, `discount`) ou avulso (`name`, `unitPrice`…). Limite 100 itens |
| `PATCH /api/deals/[dealId]/items` | contacts:manage | `{ ordem: [ids] }` reordena; `{ valorManual: bool }` liga/desliga valor manual |
| `PATCH/DELETE /api/deals/[dealId]/items/[itemId]` | contacts:manage | Edita qtd/preço/desconto/nome; remove |

Sem a tabela no banco: GET devolve `disponivel: false`; escrita devolve 503 "Produtos ainda não foram ativados no banco."

## UI

- **Catálogo:** aba "Produtos" em `/negocios/configurar?aba=produtos` (`src/components/crm/config/produtos-editor.tsx`): busca, lista (nome, código, preço, recorrência, categoria), criar/editar em modal, arquivar/reativar, ver arquivados.
- **Ficha:** seção "Produtos" no topo da coluna central (`src/components/crm/negocio/produtos.tsx`): tabela (produto, qtd, preço, desconto, total), busca no catálogo para adicionar, item avulso, edição no lugar (salva ao sair do campo), subir/descer, remover, total geral, MRR/ARR, chave "Usar valor manual". O campo Valor em "Sobre o negócio" fica só leitura com "Soma dos produtos" quando a soma manda.
- **Cartão:** campo padrão `produtos` em `CAMPOS_PADRAO` ("Produtos"). O texto é `resumoDosProdutos(nomes)` → "3 produtos · Plano Pro +2". O `GET /api/deals` só busca os nomes quando o layout do funil usa o campo (e falha de tabela vira lista vazia).
- **Planilha do funil:** coluna "Produtos" depois de "Descrição" ("2 × Plano Pro; 1 × Implantação"). `?itens=1` exporta uma linha por item (Funil, Etapa, Situação, Negócio, Empresa, Responsável, Produto, Código, Quantidade, Unidade, Preço unitário, Desconto, Total, Recorrência). Item "Planilha de itens (CSV)" no menu Exportar.
- **Dashboard:** agrupamento "Por produto" no montador. O negócio entra em cada produto que tem; com medida sobre "Valor", conta o total **daquele item** (não o negócio inteiro duas vezes). Negócio sem itens cai em "Sem produtos". Filtro "Produto" no montador fica para a próxima (ver Pendências).
- **Linha do tempo:** fora desta entrega (precisaria de tabela de eventos de item; registrar só o "último update" mentiria sobre o histórico).

## Tarefas

### Task 1: Contas puras — `src/lib/produtos.ts`
- [ ] Teste `src/lib/produtos.test.ts`:
  - `totalDoItem`: 3 × R$ 100 = 30000; desconto 10% (1000 bp) → 27000; desconto R$ 50 → 25000; desconto maior que o bruto → 0; qtd 1,5 × R$ 33,33 arredonda certo.
  - `resumoDosItens`: total, `unicoCents`, `mrrCents` (mensal inteiro + anual/12 arredondado), `arrCents = mrr × 12`, `temRecorrencia`.
  - `resumoDosProdutos`: `[]` → ""; `["Plano Pro"]` → "1 produto · Plano Pro"; 3 nomes → "3 produtos · Plano Pro +2".
  - `lerQuantidade`: "1,5" → 1.5; 0/negativo/texto → null; > 1.000.000 → null; 3 casas.
  - `lerDesconto`: percentual "10,5" → 1050; > 100% → null; valor "R$ 50,00" → 5000.
  - `lerRecorrencia`, `rotuloDaRecorrencia`.
- [ ] Implementa; roda; verde.

### Task 2: Schema + SQL
- [ ] Modelos acima em `prisma/schema.prisma`; `npx prisma generate` (não conecta no banco).
- [ ] `prisma/sql/2026-10-20-produtos.sql`.

### Task 3: Servidor — `src/lib/server/produtos.ts`
- [ ] `recalcularValorDoNegocio(tx, dealId)`; `lerItensDoNegocio(orgId, dealId)`; `negocioUsaSomaDosItens(dealId)` (para o PATCH do negócio; falha de tabela = false); `nomesDosProdutosPorNegocio(orgId, ids)` (falha = mapa vazio); `tabelaDeProdutosAusente(e)`.
- [ ] Teste `src/lib/server/produtos.test.ts`: recalcula com itens e sem manual; não mexe com manual; não mexe sem itens; teto estoura → erro.

### Task 4: `/api/products`
- [ ] Teste `src/app/api/products/route.test.ts` e `[productId]/route.test.ts`: 403 sem agents:manage; nome obrigatório; preço inválido 400; recorrência inválida 400; busca filtra por org; PATCH de produto de outra org → 404; arquivar grava `archivedAt`; DELETE de outra org → 404.
- [ ] Implementa.

### Task 5: `/api/deals/[dealId]/items`
- [ ] Teste `src/app/api/deals/[dealId]/items/route.test.ts` e `[itemId]/route.test.ts`: negócio de outra org → 404; produto de outra org/arquivado → 404; congela nome/preço do produto; avulso sem nome → 400; quantidade inválida → 400; limite de 100; recalcula o valor (update do deal com a soma); reordenar com id estranho → 400; valorManual liga e desliga (desligar recalcula); PATCH de item de outro negócio → 404; DELETE recalcula.
- [ ] Implementa.

### Task 6: Trava do valor no PATCH do negócio
- [ ] Teste em `src/app/api/deals/[dealId]/route.test.ts`: `amount` com itens e sem manual → 409; com manual → passa.
- [ ] Implementa (mínimo: uma checagem antes da escrita).

### Task 7: Cartão
- [ ] Teste em `cartao-layout.test.ts` (campo `produtos` válido) e `cartao.test.ts` (`textoDoCampo("produtos")`).
- [ ] `CAMPOS_PADRAO.produtos`, `NegocioKanban.produtos?`, `textoDoCampo`, ícone no `deal-card.tsx`, nomes no `GET /api/deals`.

### Task 8: Exportação
- [ ] Teste em `src/lib/exportar/negocios.test.ts`: coluna "Produtos"; `linhasDosItens` uma linha por item.
- [ ] `dados.ts` carrega itens (falha = sem itens); rota aceita `?itens=1`; item no menu.

### Task 9: Dashboard "Por produto"
- [ ] Teste em `src/lib/server/consulta.test.ts`: soma de valor por produto usa o total do item; negócio sem itens em "Sem produtos"; contagem conta o negócio em cada produto.
- [ ] `AGRUPAMENTOS_BASE` + `rodarConsulta` (inclui itens só quando agrupa por produto).

### Task 10: UI do catálogo e da ficha
- [ ] `produtos-editor.tsx` + aba.
- [ ] `produtos.tsx` na ficha + `SobreONegocio` com valor travado.

### Task 11: Verificação
- [ ] `npx vitest run`, `npx tsc --noEmit -p .`, `npx eslint <arquivos tocados>`.

## Pendências (fora desta entrega)
- Filtro "Produto" no montador do dashboard (precisa de fonte de opções `produtos` no `opcoes.ts` do dashboard e pré-seleção `items: { some: { productId: { in } } }`).
- Linha do tempo com "Produtos atualizados" (tabela de eventos de item).
- Preço por moeda, impostos, tabela de preços, prazo de contrato/TCV (HubSpot "term").
- API pública v1 de produtos (outro agente cuida de `src/app/api/v1/**`).
- Itens na gaveta do quadro (`deal-drawer.tsx`) — hoje a gaveta mostra o valor e, se a soma manda, o servidor recusa a edição com mensagem.
