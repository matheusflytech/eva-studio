# Plano v7 do EvaApp

Escrito em 24/10/2026. Base: `main` = `24b7de9` (PRs #12–#23), as conversas
reais do WhatsApp QR de 23–24/10, o código e as referências de design que o
dono mandou. Plano anterior: `docs/design/PLANO-v6.md`.

**Status das pendências:** WhatsApp por QR funcionando (confirmado pelo dono). Bucket
`eva-avatares` criado. Falta o Google Agenda.

**Ordem:** A (o agente responder direito no WhatsApp) antes de B (visual e
movimento). C ficam esperando decisão.

---

## A. Agente de IA no WhatsApp

Diagnóstico e guia de prompt: `docs/agentes/guia-do-agente-whatsapp.md`.

### A0. Sem código (pode ser hoje, no próprio app)

- Reescrever o prompt do "Vendedor Virtual" como no guia (2.7). Mover o catálogo
  para a base de conhecimento. Tirar o "Use markdown". Repetir no bloco os limites
  de assunto, ou marcar "usar o agente".
- Temperatura e conversão de markdown só chegam com A1 e A6. Até lá, o prompt
  segura sozinho.

### A1. Saída com cara de WhatsApp

- Converter o markdown da IA antes de enviar, uma vez, no ponto comum de envio
  (Meta e QR):
  - `**x**` vira `*x*`, e `__x__` vira `_x_`;
  - `#` títulos viram a linha em `*negrito*`;
  - tabela vira linhas "Coluna: valor";
  - `[texto](url)` vira `texto: url`.
  - Teste unitário com os textos reais do diagnóstico.
- Quebrar a resposta em até 3 balões por parágrafo. Antes de cada balão,
  mostrar "digitando…" com pausa proporcional ao tamanho (0,8 a 2,5 s). No
  Baileys é `sendPresenceUpdate("composing")`; na Meta é o indicador de
  digitando da Cloud API. Deve ser opção do bloco, ligada por padrão no WhatsApp.

### A2. Juntar mensagens seguidas ("mensagens quebradas")

- Ao chegar uma mensagem, esperar uma janela curta (padrão 4 s, configurável no
  bloco). Se outra mensagem chegar dentro dela, reinicia a espera. No fim, a IA
  roda uma vez com todas as mensagens juntas.
- Hoje cada mensagem roda a IA na hora e em paralelo, e uma sobrescreve as
  variáveis da outra (`flow-engine.ts` 1286–1296). A2 corrige isso também.
- Onde: a fila já existe (`eva_studio_outbound_queue`, relógio pg_cron e a
  rodada do worker a cada 15 s). Precisa de um marcador "IA pendente até T" na
  conversa. **Pode exigir coluna nova: SQL só com OK do dono.**
- Também resolve a figurinha seguida de pergunta: as duas vão juntas.

### A3. Ver e ouvir tudo

- **Áudio:** transcrever com `transcribe.ts` (já usado no widget). A IA recebe
  "[Áudio transcrito] …". A transcrição fica guardada na mensagem e aparece no
  balão em Conversas. Limite: 5 min.
- **Imagem:** mandar para o modelo de visão (`anexos.ts`) via `anexoContexto`,
  que o motor já aceita.
- **Documento:** extrair PDF/DOCX (`anexos.ts`) com o nome do arquivo. Corta
  em N caracteres e avisa a IA que cortou.
- **Inbox:** baixar documento e mostrar a transcrição em Conversas
  (`components/inbox/balao.tsx` já mostra imagem, áudio e vídeo).
- **Limites:** só processar até 16 MB (limite atual do bucket). Áudio acima de
  5 min: responder que vai encaminhar para a equipe.

### A4. Tipos que hoje somem ou confundem

- **QR:**
  - desembrulhar `ephemeralMessage` e `viewOnceMessage*`;
  - ler localização e contato (como a Meta já faz).
- **Citação (reply):** os dois canais passam a mandar "Respondendo a: «trecho»".
- **Figurinha, reação e emoji sozinhos:** não acordam a IA. Entram no histórico
  e esperam a próxima mensagem; com A2 vão juntos.
- **Tipo desconhecido:** hoje `[Mensagem não suportada: X]` vai para a IA.
  Passa a ser só registrado.

### A5. Grupos

- Responder em reply à mensagem que mencionou o bot e falar com quem mencionou.
- Mandar para a IA quem pediu e o que pediu, separado do resto do histórico.
- **Conferir:** "Rafael: Taaaaa" e uma figurinha do Rafael tiveram resposta
  sem menção visível. Ver se "responder a uma mensagem do bot" conta como menção
  (`worker/contato.js`).

### A6. Prompt montado pela plataforma

- Temperatura padrão 0,4 no bloco de IA, editável. Hoje fica a do provedor,
  ~1,0, em `llm.ts`.
- Pôr no prompt, sempre:
  - data e hora de São Paulo;
  - canal (WhatsApp, site, grupo);
  - nome do contato, se conhecido;
  - regras de formato do canal (o 2.2 do guia, automático no WhatsApp).
- Trocar `{variavel}` no texto do bloco pelo valor. Hoje vai literal.
- Não perder o texto quando a IA escreve e chama ferramenta na mesma vez
  (`llm.ts:153`). Guardar e enviar o rascunho junto, ou mudar a instrução do
  `seguir_fluxo`.
- No editor do bloco:
  - aviso quando "usar o agente" está desligado ("Tom e Nunca faça do agente não
    valem aqui");
  - contador de caracteres com alerta acima de ~3 mil.

### A7. Saber o que a IA fez

- Gravar `FlowExecution` também nas respostas de IA do WhatsApp. Na janela de
  23–24/10 não há registro nenhum. Guardar o texto do modelo antes da conversão,
  para comparar com o enviado.

**Testes de A:** unitário do conversor (A1), da junção (A2) e dos tipos (A4).
Roteiro do guia, 2.8, no número de teste 47 99970-5773 por QR e no widget.

---

## B. Design e movimento "estilo Apple" (desktop)

Referências lidas: `emilkowalski/skills` (apple-design), `jakubkrehel/skills`
(14 skills, a mais útil: `better-ui`) e `greensock/gsap-skills`. Regra do dono
(o texto em inglês): **contenção**, mola sem exagero, nada de brilho, desfoque e
vidro em excesso, respeitar o "reduzir movimento", conferir no navegador.

### O que existe hoje

- **Três motores:** CSS (globals.css), GSAP (quadro de negócios) e
  framer-motion (15 arquivos: ilha, canvas, contatos, segmented-control…).
- **Quatro curvas diferentes:** `(0.2,0,0,1)`, `(0.32,0.72,0,1)`,
  `(0.4,0,1,1)`, mais as do GSAP (`power2/3`).
- **Overshoot em todo botão:** `cubic-bezier(0.34,1.56,0.64,1)`, que as três
  referências desaconselham para interações frequentes.
- **Desfoque em quase tudo que entra:** entrada de tela 3px, menus 4px, modal
  6px, saída de tela 4px. Também `backdrop-blur` em 18 lugares, de `sm` a `2xl`.
- **Reduzir movimento:** respeitado no CSS e no GSAP (`reduzMovimento()`). No
  framer-motion é caso a caso.

### Tokens propostos (um lugar só: `globals.css` + `animacao/gsap.ts`)

| Token | Valor | Uso |
|---|---|---|
| `--dur-instant` | 100 ms | hover de linha, cor |
| `--dur-fast` | 150 ms | apertar, abas, saída |
| `--dur-base` | 220 ms | menus, popovers |
| `--dur-slow` | 300 ms | gaveta, modal, entrada de tela |
| `--ease-out` | `cubic-bezier(0.32,0.72,0,1)` | tudo que entra ou se move (já é a "mola curta" da v5) |
| `--ease-in` | `cubic-bezier(0.4,0,1,1)` | saída |
| Mola (framer/GSAP) | `bounce: 0`, 0,3–0,4 s | arrastar, soltar, reordenar |

**Mola com bounce:** só depois de arremesso (soltar card com velocidade).
Mesmo assim, no máximo 0,15.

### Itens

- **B0. Ferramentas.** Instalar como skills locais (sem ir para o git):
  - `better-ui`, `better-typography`, `better-layout` e `better-accessibility`
    (jakubkrehel, MIT);
  - a pasta `apple-design` (emilkowalski, MIT; **não** o instalador do catálogo,
    que instala 478 skills);
  - `gsap-performance` e `gsap-plugins` (faltam localmente).
  - **Pedir OK antes.**
- **B1. Tokens.** Criar os tokens acima. Trocar as curvas soltas. Apertar: `scale(0.97)`, 150 ms, sem overshoot
  e nunca em botão desabilitado. Nenhum `transition: all`.
- **B2. Menos desfoque.**
  - Entradas: só opacidade + 8–12px de deslocamento, sem `filter: blur`.
  - `backdrop-blur`: só no véu de modal/gaveta e na notificação (ilha), um
    valor só (`md`).
  - Painéis e selects passam a ter fundo sólido.
- **B3. Gaveta, modal e menu coordenados.**
  - Entra de onde veio (`transform-origin` no botão) e sai pelo mesmo caminho, mais rápido que a entrada.
  - Interrompível: fechar no meio da abertura volta do ponto atual.
  - Foco: vai para dentro ao abrir e volta ao botão ao fechar. Esc fecha.
  - Conferir `ui/drawer.tsx`, `ui/modal.tsx`, `deal-drawer.tsx` e o painel do quadro.
- **B4. Quadro de negócios.**
  - Flip já existe. Medir com 300 cards (perfil do Chrome, alvo 60 fps).
  - Mola `bounce: 0` ao soltar.
  - Card que outra pessoa moveu (atualização ao vivo) desliza para a nova coluna em vez de pular.
- **B5. Um motor por tipo de trabalho.**
  - CSS para estados (hover, aberto/fechado).
  - GSAP para Flip e arrasto do quadro.
  - framer-motion só onde já está e funciona (ilha, arrastar para dispensar).
  - Sem dependência nova.
  - `MotionConfig reducedMotion="user"` na raiz para o framer.
- **B6. Tipografia e espaço** (auditoria tela a tela, regras do `better-typography` e do `better-layout`):
  - escala 13/14/16/18/24/36;
  - ênfase por peso, não por tamanho;
  - `tabular-nums` em números que mudam;
  - espaço entre grupos ≥ 2× o espaço dentro do grupo;
  - raio de dentro = raio de fora − padding.
- **B7. Conferência.** No navegador, 1440 e 1920, claro e escuro:
  - estados hover, focus, active, carregando, vazio e erro;
  - com "reduzir movimento" ligado e desligado.
  - Gravar antes e depois (`web-motion/scripts/record-app.mjs`).

**Ordem de B:** B0 → B1 → B2 → B3 → B4 → B5, com B7 a cada passo. B6 é
auditoria por tela, uma tela por PR.

---

## C. Esperando decisão

- **Google Agenda.** Precisa de:
  - app OAuth no Google Cloud;
  - tabela de conexões (SQL com OK);
  - respostas em `docs/design/proposta-v6/google-agenda.html`: só leitura? quem vê?
  - O calendário já recebe `origem: "agenda"`.
- **Roteiro do v6, itens 4–6:**
  - modelos para a API não oficial;
  - ações de canal nas automações;
  - login.
- **Limpeza:** apagar `docs/superpowers/plans/2026-10-23-quadro-v4-PASSAGEM.md`
  (untracked e obsoleto).

## Decisões do dono (24/10/2026)

1. A2 pode ganhar coluna nova na conversa: SQL escrito e mostrado antes, aplicado
   em produção só depois do OK no arquivo.
2. Janela de espera padrão: 4 s.
3. Balões com "digitando…" ligados por padrão no WhatsApp (desliga no bloco).
4. Áudio: transcreve até 5 min; acima disso avisa e encaminha para a equipe.
5. B0 liberado: jakubkrehel (better-ui, better-typography, better-layout,
   better-accessibility), a pasta apple-design, gsap-performance e gsap-plugins.
6. Ordem: A inteiro, depois B.
