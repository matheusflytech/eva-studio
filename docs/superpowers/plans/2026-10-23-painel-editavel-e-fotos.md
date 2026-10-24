# Plano: painel do negócio editável (A) e fotos (B)

Spec: `docs/superpowers/specs/2026-10-23-painel-editavel-e-fotos-design.md`.

## Parte A (branch `feat/painel-editavel`, PR próprio)

1. **`ConteudoDaPrevia` aceita editores.**
   - Troque a prop `etapaEditavel` por `editor?: (campo) => ReactNode | undefined`.
   - Quando `editor(campo)` devolve algo, isso entra no lugar do texto.
   - A prévia da configuração (`cartao-editor.tsx`) não passa `editor` e continua só leitura.
2. **`negocios/detalhes-editaveis.tsx`, função `editoresDoPainel`.** Recebe a ficha (`deal`, `defs`, `membros`, `patch`), o seletor de etapa e `onMudou`, e devolve a função `editor` com estes campos:
   - `nome`, `valor` (só leitura com valor dos produtos), `probabilidade` e `previsao`: `CampoInline` com `rotuloOculto`;
   - `responsavel`: `Select` dos membros;
   - `empresa`: o nome com os botões Trocar e Remover, e `BuscaDeVinculo` ao trocar;
   - `cf:*`: `CampoPersonalizadoInline`, que usa `CampoEditor`, salva ao sair (texto) ou ao mudar (escolhas) e manda só a chave do campo;
   - `etapa`: o seletor que o painel já tem;
   - os outros campos ficam como estão (só leitura).

   Depois de salvar sem erro, chama `onMudou()` para o quadro atualizar o card.
3. **`previa.tsx`** passa `editor` para a seção Detalhes enquanto `ficha.deal` estiver carregada.
4. **`CampoInline`:** o Esc chama `preventDefault()`, para o painel não fechar enquanto se desfaz uma edição.
5. **Teste:** `detalhes-editaveis.test.ts` cobre o que vai no PATCH. Valor e campo personalizado só levam a própria chave.
6. **Verificação:**
   - `vitest`, `tsc` e `eslint` nos arquivos tocados;
   - no navegador, funil `[DEMO] Renovação`: editar e voltar o valor de um negócio demo; não deixar alteração no banco.
7. **Fechamento:** commit, push e PR com o OK do dono.

## Parte B (depois, branch própria)

1. **SQL e `schema.prisma`:** `prisma/sql/2026-10-28-avatares.sql` cria `avatarPath` em contatos e perfis.
2. **Bucket público `eva-avatares`:** criar só com o OK do dono.
3. **`lib/server/avatares.ts`:**
   - tipos aceitos e limite de 2 MB;
   - `caminhoDoAvatar`, `urlPublicaDoAvatar` e `apagarAvatar`;
   - reaproveita as chamadas REST de `storage.ts`, parametrizadas pelo bucket.
4. **Rotas** `api/contacts/[contactId]/foto` e `api/me/foto` (POST, PUT, DELETE), com testes.
5. **`avatarUrl` nas respostas:** `/api/deals`, ficha do negócio, ficha e lista de contatos, `/api/members`.
6. **UI:**
   - componente `TrocarFoto` (corte quadrado e WebP de 256 px no navegador);
   - entra na ficha do contato, no "Contato principal" do painel e na tela de Configurações;
   - `Avatar` com `src` no quadro, nas listas e nas fichas.
7. **Verificação** com um contato "[TESTE CLAUDE]", apagado no fim, e PR.
