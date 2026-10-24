# Painel do negócio editável e fotos de contatos e da equipe

Data: 23/10/2026. Pedido do dono: "nessa tela da direita poder editar os valores também" e "fotos/avatares em contatos também não dá para adicionar/editar". Desenho aprovado em 23/10.

São duas partes, em dois PRs. A parte A não mexe no banco. A parte B precisa do OK do dono para a coluna nova e o bucket.

## Parte A: editar no painel da direita

**Onde:** seção "Detalhes do negócio" do painel lateral do quadro (`src/components/crm/negocios/previa.tsx`).

**Campos que passam a ser editáveis**, cada um no lugar, salvando ao sair do campo:

| Campo | Editor | PATCH em `/api/deals/[id]` |
|---|---|---|
| Nome do negócio (`nome`) | texto | `name` |
| Valor (`valor`) | número com "R$". Fica só leitura quando o valor é a soma dos produtos, como na ficha | `amount` (em reais) |
| Chance de fechar (`probabilidade`) | número com "%", de 0 a 100 | `probability` |
| Previsão de fechamento (`previsao`) | data | `expectedClosingAt` |
| Responsável (`responsavel`) | lista dos membros | `ownerId` |
| Empresa (`empresa`) | busca de empresa (`BuscaDeVinculo`); dá para trocar e para remover | `companyId` |
| Etapa (`etapa`) | seletor que já existe e segue as regras de etapa | não muda |
| Campos personalizados (`cf:*`) | o editor de cada tipo (`CampoEditor`), um campo por vez | `customFields: { [chave]: valor }` |

O servidor junta os `customFields` com o que já está gravado e só valida obrigatório para as chaves enviadas. Editar um campo não apaga os outros nem trava por causa de outro obrigatório vazio.

**Continuam só leitura:**
- contato, telefone e e-mail (o contato tem a seção própria);
- produtos;
- tempo na etapa, criado em, última interação e próximo passo.

**Como salva:**
- **Texto, número e data:** salvam ao sair do campo. Enter salva e Esc desfaz.
- **Escolhas** (lista, caixa, múltipla escolha e data de campo personalizado): salvam na hora em que mudam.
- **Erro:** aparece embaixo do campo, e o campo volta ao valor salvo.

**Esc dentro de um campo** desfaz a edição e não fecha o painel. Esc fora dos campos continua fechando.

**Depois de salvar:**
- o painel recarrega a ficha (`useFicha.patch` já faz isso);
- o quadro atualiza o card, pelo `onMudou` que já existe.

**Enquanto a ficha carrega**, as linhas aparecem como hoje, só leitura.

**Reaproveita:**
- `CampoInline` e `BuscaDeVinculo`, de `negocio/pecas.tsx`;
- `CampoEditor`, `rascunhoInicial` e `rascunhoParaEnvio`, de `crm/campos-personalizados.tsx`;
- o `patch` e os `membros` do `useFicha`.

**Fica de fora:** editar o contato pelo painel; isso continua na seção Contato e na ficha do contato.

## Parte B: foto de contatos e da equipe

**Banco:**
- coluna `avatarPath text null` em `eva_studio_contacts` e em `eva_studio_profiles`;
- o SQL fica em `prisma/sql/` e é aplicado só com o OK do dono;
- o `schema.prisma` acompanha.

**Storage:**
- bucket **público** novo `eva-avatares`, criado só com o OK do dono;
- caminho `{orgId}/{uuid}.webp`: o UUID torna o endereço impossível de adivinhar;
- aceita só `image/jpeg`, `image/png` e `image/webp`, até 2 MB;
- o navegador corta a foto em quadrado e reduz para 256 px (WebP) antes de enviar;
- o upload vai direto ao storage, por URL assinada de upload, no mesmo padrão de `api/conversations/upload` e `lib/server/storage.ts`.

**Rotas:**
- `POST /api/contacts/[contactId]/foto` (`contatos:editar`):
  - recebe `{ mime, size }`;
  - devolve `{ path, uploadUrl, token }`;
  - tem rate limit.
- `PUT /api/contacts/[contactId]/foto`:
  - recebe `{ path }`;
  - confere que o caminho é da org (`caminhoDaOrg`) e que o arquivo existe;
  - grava `avatarPath` e apaga a foto anterior do bucket.
- `DELETE /api/contacts/[contactId]/foto`: limpa `avatarPath` e apaga o arquivo.
- `POST|PUT|DELETE /api/me/foto`: o mesmo para o próprio usuário (`Profile`). Ninguém troca a foto de outra pessoa.

**Leitura:**
- as APIs que devolvem contato ou responsável passam a mandar `avatarUrl` (a URL pública montada a partir do `avatarPath`);
- os lugares: quadro (`/api/deals`), ficha do negócio, ficha e lista de contatos, membros.

**Telas:**
- **Avatar do contato:** na ficha do contato e no "Contato principal" do painel. Passar o mouse mostra "Trocar foto"; com foto, aparece também "Remover".
- **Configurações:** cada pessoa troca a própria foto.
- **Avatares:** o `Avatar` do quadro (`deal-card.tsx`) recebe `src`, e o `Avatar` do design system já mostra a foto quando há `src`.

**Fica de fora:**
- puxar a foto do WhatsApp sozinho;
- logo de empresa;
- trocar a foto de outra pessoa da equipe.

## Testes

- **A:**
  - teste do componente de editores: qual campo vira editor e o que vai no PATCH;
  - conferência no navegador: editar valor, previsão, responsável, empresa e um campo personalizado; ver o card atualizar; Esc não fecha o painel.
- **B:**
  - testes das rotas: permissão, tipo e tamanho do arquivo, caminho de outra org recusado, troca apaga a anterior;
  - conferência no navegador com um contato "[TESTE CLAUDE]", apagado no fim.
