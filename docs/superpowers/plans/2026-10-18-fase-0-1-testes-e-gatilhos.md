# Fase 0+1 — Base de testes e Gatilhos (DM, resposta a story, menção em story) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ter testes automáticos no projeto e um sistema de gatilhos por agente que responde a palavra-chave na DM (todos os canais), a respostas/reações em story e a menções em story no Instagram, com contagem de disparos.

**Architecture:** Um modelo novo `AgentTrigger` (tipos `dm_keyword`, `story_reply`, `story_mention`). Toda a decisão de "qual gatilho casa" fica numa função pura (`src/lib/server/triggers.ts`) testada com Vitest. O motor (`advanceConversation`) consulta os gatilhos antes de retomar o bloco parado; o webhook do Instagram só classifica o evento (`src/lib/server/instagram-events.ts`) e repassa. A conexão do Instagram passa a assinar os eventos da Meta sozinha.

**Tech Stack:** Next.js 16 (App Router, route handlers com `params: Promise<...>`), Prisma 7 + Postgres (Supabase), React 19, Vitest.

**Contexto obrigatório antes de começar:**
- Ler `docs/superpowers/plans/2026-10-18-roadmap-todos-eva.md` (decisões e limites da Meta).
- `AGENTS.md`: Next 16 tem APIs diferentes — consultar `node_modules/next/dist/docs/` antes de criar rota.
- Branch: `git checkout -b feat/gatilhos` a partir de `main` atualizado.
- **Banco:** `npm run db:push` aplica no Supabase de **produção** da Eva (o mesmo banco do Beeno Builder, outro produto — tabelas separadas pelo prefixo `eva_studio_`). Neste plano a única mudança de schema é **aditiva** (tabela nova + relação). Não rodar `db:push` sem confirmar com o Alfredo qual banco está no `.env`.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `vitest.config.mts` | criar | Config do Vitest (alias `@/`, stub de `server-only`) |
| `src/test/stubs/server-only.ts` | criar | Módulo vazio no lugar de `server-only` nos testes |
| `package.json` | modificar | scripts `test`, `test:watch`; devDependency `vitest` |
| `src/lib/server/comment-automation.test.ts` | criar | Caracterização do casamento de comentário (rede de segurança) |
| `src/lib/server/triggers.ts` | criar | Tipos, normalização, `isEmojiOnly`, `matchTrigger`, `podeAvaliarGatilho`, `parseTriggerInput` |
| `src/lib/server/triggers.test.ts` | criar | Testes do casamento e da validação |
| `src/lib/server/instagram-events.ts` | criar | `classifyInstagramMessage` (dm / story_reply / story_mention) |
| `src/lib/server/instagram-events.test.ts` | criar | Testes com fixtures |
| `src/test/fixtures/meta/*.json` | criar | Payloads reais/documentados da Meta |
| `src/lib/server/meta-graph.ts` | criar | Versão da Graph e host certo para token do Instagram |
| `src/lib/server/meta-graph.test.ts` | criar | Testes do host |
| `src/lib/server/instagram-subscribe.ts` | criar | Assinar campos do webhook (`subscribed_apps`) |
| `prisma/schema.prisma` | modificar | Modelo `AgentTrigger` + relação em `Agent` |
| `src/lib/server/flow-engine.ts` | modificar | `AdvanceInput.event`, avaliação de gatilho, menção sem fluxo |
| `src/app/api/webhooks/meta/route.ts` | modificar | Classificar evento IG, menção em story, correções da automação de comentário |
| `src/app/api/instagram/oauth/callback/route.ts` | modificar | Assinar eventos após conectar |
| `src/app/api/agents/[agentId]/triggers/route.ts` | criar | GET/POST gatilhos |
| `src/app/api/agents/[agentId]/triggers/[id]/route.ts` | criar | PUT/DELETE gatilho |
| `src/app/api/agents/[agentId]/instagram-stories/route.ts` | criar | Lista stories ativos para escolher |
| `src/app/api/agents/[agentId]/instagram-connection/subscribe/route.ts` | criar | Reassinar eventos de conexão já existente |
| `src/components/agent-studio/triggers-editor.tsx` | criar | Tela de gatilhos |
| `src/components/agent-studio/agent-form.tsx` | modificar | Montar a tela de gatilhos |
| `docs/CHATBOT_ENGINE.md`, `worker/META_SETUP.md` | modificar | Documentar gatilhos e assinatura |

---

### Task 1: Vitest no projeto

**Files:**
- Create: `vitest.config.mts`, `src/test/stubs/server-only.ts`
- Modify: `package.json`

- [ ] **Step 1: Instalar**

Run: `npm i -D vitest`
Expected: `added N packages`, sem erro de peer dependency.

- [ ] **Step 2: Stub do server-only**

`src/test/stubs/server-only.ts`:
```ts
// Nos testes não existe "lado do cliente": o pacote server-only só lança erro
// quando importado num bundle de browser. Aqui ele vira um módulo vazio.
export {};
```

- [ ] **Step 3: Config**

`vitest.config.mts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Scripts**

Em `package.json`, dentro de `"scripts"`, acrescentar:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Rodar sem testes**

Run: `npm test`
Expected: `No test files found` (sai com código 1 — normal até a Task 2).

- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json vitest.config.mts src/test/stubs/server-only.ts
git commit -m "test: adiciona Vitest com stub de server-only"
```

---

### Task 2: Teste de caracterização da automação de comentário

Rede de segurança: a Task 9 mexe no webhook do Instagram, e este é o único casamento que já existe ali.

**Files:**
- Create: `src/lib/server/comment-automation.test.ts`

- [ ] **Step 1: Escrever o teste**
```ts
import { describe, it, expect } from "vitest";
import { matchCommentAutomation, type CommentAutomationLike } from "./comment-automation";

function auto(p: Partial<CommentAutomationLike> & { id: string }): CommentAutomationLike {
  return { mediaId: "", keyword: "", active: true, publicReply: "", dmMessage: "dm", ...p };
}

describe("matchCommentAutomation", () => {
  it("casa palavra-chave por substring, sem diferenciar maiúscula", () => {
    const r = matchCommentAutomation([auto({ id: "a", keyword: "eu quero" })], { mediaId: "m1", text: "EU QUERO!!" });
    expect(r?.id).toBe("a");
  });

  it("aceita lista separada por vírgula", () => {
    const r = matchCommentAutomation([auto({ id: "a", keyword: "preço, valor" })], { mediaId: "m1", text: "qual o valor?" });
    expect(r?.id).toBe("a");
  });

  it("ignora inativa", () => {
    const r = matchCommentAutomation([auto({ id: "a", active: false })], { mediaId: "m1", text: "oi" });
    expect(r).toBeNull();
  });

  it("post específico + palavra ganha de genérico", () => {
    const list = [auto({ id: "gen" }), auto({ id: "esp", mediaId: "m1", keyword: "oi" })];
    expect(matchCommentAutomation(list, { mediaId: "m1", text: "oi" })?.id).toBe("esp");
  });

  it("post diferente não casa", () => {
    const r = matchCommentAutomation([auto({ id: "a", mediaId: "m2" })], { mediaId: "m1", text: "oi" });
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npm test`
Expected: `5 passed`. (Se falhar, o comportamento atual difere do documentado — parar e reportar, não "corrigir" o teste sem entender.)

- [ ] **Step 3: Commit**
```bash
git add src/lib/server/comment-automation.test.ts
git commit -m "test: caracteriza casamento da automação de comentário"
```

---

### Task 3: Spike na conta de teste (sem código de produto)

Responde três perguntas que mudam a Task 4 e a Task 9. Registrar as respostas em `docs/superpowers/plans/2026-10-18-spike-instagram.md`.

Pré-requisito: agente de teste com Instagram conectado pelo **Instagram Login** (botão de conectar no app) e acesso aos logs da Vercel (ou um `console.log` temporário do corpo do webhook em ambiente de preview).

- [ ] **Step 1: Capturar payloads reais.** Com outra conta, (a) responder um story da conta de teste com texto, (b) reagir com emoji rápido, (c) mencionar a conta num story. Copiar cada `entry[0].messaging[0]` para `src/test/fixtures/meta/ig-story-reply.json`, `ig-story-reaction.json`, `ig-story-mention.json`. Trocar ids/URLs reais por valores falsos. Se a reação **não** chegar ou chegar em outro formato, anotar no spike — a opção "incluir reações" passa a depender disso.

- [ ] **Step 2: Host do token.** Com o token salvo (decifrar localmente com `decryptSecret`), rodar:
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/<IG_ID>/messages" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d "{\"recipient\":{\"id\":\"<IGSID_TESTE>\"},\"message\":{\"text\":\"teste fb\"}}"
curl -s -X POST "https://graph.instagram.com/v21.0/<IG_ID>/messages" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d "{\"recipient\":{\"id\":\"<IGSID_TESTE>\"},\"message\":{\"text\":\"teste ig\"}}"
```
Anotar qual responde `message_id`.

- [ ] **Step 3: Lista de stories e versão.**
```bash
curl -s "https://graph.instagram.com/v21.0/<IG_ID>/stories?fields=id,media_type,media_url,thumbnail_url,timestamp,permalink&access_token=<TOKEN>"
curl -s "https://graph.instagram.com/v25.0/me?fields=user_id,username&access_token=<TOKEN>"
```
Anotar se a lista vem e se a v21.0 ainda responde (ou se vem aviso de versão).

- [ ] **Step 4: Commit das fixtures e do spike**
```bash
git add src/test/fixtures/meta docs/superpowers/plans/2026-10-18-spike-instagram.md
git commit -m "docs: spike do Instagram (story, host do token, versão)"
```

> **Sem conta de teste disponível ainda:** criar as fixtures com o formato documentado abaixo, seguir o plano, e repetir o Step 1 antes do merge.

`ig-story-reply.json`:
```json
{ "sender": { "id": "IGSID_1" }, "recipient": { "id": "IG_1" }, "timestamp": 1760000000000,
  "message": { "mid": "mid.reply1", "text": "Quero o cupom",
    "reply_to": { "story": { "id": "STORY_1", "url": "https://lookaside.example/story1" } } } }
```
`ig-story-reaction.json`:
```json
{ "sender": { "id": "IGSID_1" }, "recipient": { "id": "IG_1" }, "timestamp": 1760000000000,
  "message": { "mid": "mid.react1", "text": "❤️",
    "reply_to": { "story": { "id": "STORY_1", "url": "https://lookaside.example/story1" } } } }
```
`ig-story-mention.json`:
```json
{ "sender": { "id": "IGSID_2" }, "recipient": { "id": "IG_1" }, "timestamp": 1760000000000,
  "message": { "mid": "mid.mention1",
    "attachments": [{ "type": "story_mention", "payload": { "url": "https://lookaside.example/mention1" } }] } }
```
`ig-dm.json`:
```json
{ "sender": { "id": "IGSID_3" }, "recipient": { "id": "IG_1" }, "timestamp": 1760000000000,
  "message": { "mid": "mid.dm1", "text": "PROMO" } }
```

---

### Task 4: Host e versão da Graph centralizados

**Files:**
- Create: `src/lib/server/meta-graph.ts`, `src/lib/server/meta-graph.test.ts`

- [ ] **Step 1: Teste**
```ts
import { describe, it, expect } from "vitest";
import { instagramGraphBase, FACEBOOK_GRAPH, INSTAGRAM_GRAPH } from "./meta-graph";

describe("instagramGraphBase", () => {
  it("token do Instagram Login (IGAA/IGQV) vai para graph.instagram.com", () => {
    expect(instagramGraphBase("IGAAxyz")).toBe(INSTAGRAM_GRAPH);
    expect(instagramGraphBase("IGQVJabc")).toBe(INSTAGRAM_GRAPH);
  });
  it("token de Página (EAA…) continua em graph.facebook.com", () => {
    expect(instagramGraphBase("EAAGabc")).toBe(FACEBOOK_GRAPH);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/server/meta-graph.test.ts`
Expected: FAIL — `Cannot find module './meta-graph'`.

- [ ] **Step 3: Implementar**

`src/lib/server/meta-graph.ts` (usar a versão confirmada no spike; `v21.0` é a atual do código):
```ts
// Versão única da Graph API para o app inteiro. Trocar aqui sobe tudo junto.
export const GRAPH_VERSION = "v21.0";
export const FACEBOOK_GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const INSTAGRAM_GRAPH = `https://graph.instagram.com/${GRAPH_VERSION}`;

/**
 * Token do Instagram Login (começa com "IG") só vale em graph.instagram.com;
 * token de Página do Facebook (conexão manual/FB Login) vale em graph.facebook.com.
 */
export function instagramGraphBase(accessToken: string): string {
  return accessToken.startsWith("IG") ? INSTAGRAM_GRAPH : FACEBOOK_GRAPH;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/server/meta-graph.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Aplicar no envio — só se o spike (Task 3, Step 2) mostrou que `graph.facebook.com` falha com o token do Instagram Login.**

Em `src/lib/server/outbound.ts`, `sendInstagramText` e `sendInstagramMedia`: trocar `` `${GRAPH}/${igBusinessId}/messages` `` por `` `${instagramGraphBase(accessToken)}/${igBusinessId}/messages` `` e acrescentar `import { instagramGraphBase } from "@/lib/server/meta-graph";`. Se o spike mostrou que os dois hosts funcionam, pular este step e anotar no spike.

- [ ] **Step 6: Commit**
```bash
git add src/lib/server/meta-graph.ts src/lib/server/meta-graph.test.ts src/lib/server/outbound.ts
git commit -m "feat: host da Graph certo para token do Instagram Login"
```

---

### Task 5: Casamento de gatilhos (função pura)

**Files:**
- Create: `src/lib/server/triggers.ts`, `src/lib/server/triggers.test.ts`

Regras (fonte da verdade, os testes cobrem cada uma):
1. Texto e palavras normalizados: sem acento, minúsculo, espaços colapsados.
2. `exact` = texto inteiro igual a uma das palavras; `contains` = texto contém uma das palavras; `any` = qualquer texto (proibido em `dm_keyword`).
3. `channels` vazio = todos. Canais de teste (`builder_preview`, `playground`) ignoram o filtro de canal.
4. `story_reply`: `storyId` vazio = qualquer story; reação (só emoji) só casa se `includeReactions`.
5. Resposta a story sem gatilho de story casa cai nos gatilhos de DM; **reação** sem gatilho de story não cai.
6. Desempate: story específico (+4), `exact` (+2), `contains` (+1); depois `priority` maior; depois o mais antigo.
7. Gatilho de DM só é avaliado se a conversa não está parada, ou está parada em `ai-agent`, `agent` ou `wait`. Nunca durante uma Captura. Eventos de story são sempre avaliados.

- [ ] **Step 1: Teste**

`src/lib/server/triggers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  matchTrigger,
  normalizeText,
  isEmojiOnly,
  podeAvaliarGatilho,
  parseTriggerInput,
  type TriggerLike,
} from "./triggers";

let seq = 0;
function trig(p: Partial<TriggerLike>): TriggerLike {
  seq += 1;
  return {
    id: p.id ?? `t${seq}`,
    kind: "dm_keyword",
    channels: [],
    matchMode: "contains",
    keywords: [],
    storyId: "",
    includeReactions: true,
    priority: 0,
    active: true,
    createdAt: new Date(2026, 0, seq),
    ...p,
  };
}

describe("normalizeText / isEmojiOnly", () => {
  it("tira acento, caixa e espaço extra", () => {
    expect(normalizeText("  Promoção   DE Natal ")).toBe("promocao de natal");
  });
  it("detecta só emoji", () => {
    expect(isEmojiOnly("❤️")).toBe(true);
    expect(isEmojiOnly("🔥🔥")).toBe(true);
    expect(isEmojiOnly("👍🏽")).toBe(true);
    expect(isEmojiOnly("lindo ❤️")).toBe(false);
    expect(isEmojiOnly("")).toBe(false);
    expect(isEmojiOnly(undefined)).toBe(false);
  });
});

describe("matchTrigger — DM", () => {
  it("exata casa só o texto inteiro", () => {
    const t = trig({ id: "a", matchMode: "exact", keywords: ["promo"] });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "Promo" })?.id).toBe("a");
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "quero a promo" })).toBeNull();
  });
  it("parcial casa dentro do texto, sem acento", () => {
    const t = trig({ id: "a", matchMode: "contains", keywords: ["promoção"] });
    expect(matchTrigger([t], { channel: "whatsapp_meta", kind: "dm", text: "tem PROMOCAO?" })?.id).toBe("a");
  });
  it("várias palavras no mesmo gatilho", () => {
    const t = trig({ id: "a", keywords: ["preço", "valor", "quanto custa"] });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "quanto custa?" })?.id).toBe("a");
  });
  it("nada casa → null (fluxo padrão)", () => {
    const t = trig({ keywords: ["promo"] });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "oi" })).toBeNull();
  });
  it("modo any é ignorado em DM", () => {
    const t = trig({ matchMode: "any" });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "oi" })).toBeNull();
  });
  it("respeita canal, mas playground passa", () => {
    const t = trig({ id: "a", keywords: ["promo"], channels: ["instagram"] });
    expect(matchTrigger([t], { channel: "whatsapp_qr", kind: "dm", text: "promo" })).toBeNull();
    expect(matchTrigger([t], { channel: "builder_preview", kind: "dm", text: "promo" })?.id).toBe("a");
  });
  it("inativo não casa", () => {
    const t = trig({ keywords: ["promo"], active: false });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "promo" })).toBeNull();
  });
  it("exata ganha de parcial; depois prioridade", () => {
    const parcial = trig({ id: "p", keywords: ["promo"], priority: 50 });
    const exata = trig({ id: "e", matchMode: "exact", keywords: ["promo"] });
    expect(matchTrigger([parcial, exata], { channel: "instagram", kind: "dm", text: "promo" })?.id).toBe("e");
    const p2 = trig({ id: "p2", keywords: ["promo"], priority: 10 });
    expect(matchTrigger([parcial, p2], { channel: "instagram", kind: "dm", text: "promo" })?.id).toBe("p");
  });
});

describe("matchTrigger — story", () => {
  const ctxReply = { channel: "instagram", kind: "story_reply" as const, text: "quero", storyId: "S1", isReaction: false };
  const ctxReact = { channel: "instagram", kind: "story_reply" as const, text: "❤️", storyId: "S1", isReaction: true };

  it("qualquer resposta a qualquer story", () => {
    const t = trig({ id: "a", kind: "story_reply", matchMode: "any" });
    expect(matchTrigger([t], ctxReply)?.id).toBe("a");
  });
  it("story específico ganha de qualquer story", () => {
    const geral = trig({ id: "g", kind: "story_reply", matchMode: "any" });
    const esp = trig({ id: "e", kind: "story_reply", matchMode: "any", storyId: "S1" });
    expect(matchTrigger([geral, esp], ctxReply)?.id).toBe("e");
  });
  it("story diferente não casa", () => {
    const t = trig({ kind: "story_reply", matchMode: "any", storyId: "S2" });
    expect(matchTrigger([t], ctxReply)).toBeNull();
  });
  it("reação só se includeReactions", () => {
    const sim = trig({ id: "s", kind: "story_reply", matchMode: "any", includeReactions: true });
    const nao = trig({ id: "n", kind: "story_reply", matchMode: "any", includeReactions: false });
    expect(matchTrigger([nao], ctxReact)).toBeNull();
    expect(matchTrigger([nao, sim], ctxReact)?.id).toBe("s");
  });
  it("filtro por palavra na resposta do story", () => {
    const t = trig({ id: "a", kind: "story_reply", matchMode: "contains", keywords: ["cupom"] });
    expect(matchTrigger([t], { ...ctxReply, text: "manda o CUPOM" })?.id).toBe("a");
    expect(matchTrigger([t], ctxReply)).toBeNull();
  });
  it("resposta a story sem gatilho de story cai na palavra-chave de DM", () => {
    const dm = trig({ id: "dm", keywords: ["quero"] });
    expect(matchTrigger([dm], ctxReply)?.id).toBe("dm");
  });
  it("reação sem gatilho de story NÃO cai na DM", () => {
    const dm = trig({ matchMode: "contains", keywords: ["❤"] });
    expect(matchTrigger([dm], ctxReact)).toBeNull();
  });
  it("menção casa gatilho de menção", () => {
    const t = trig({ id: "m", kind: "story_mention", matchMode: "any" });
    expect(matchTrigger([t], { channel: "instagram", kind: "story_mention", text: "[Menção no story]" })?.id).toBe("m");
  });
});

describe("podeAvaliarGatilho", () => {
  it("DM: só fora de Captura", () => {
    expect(podeAvaliarGatilho(null, "dm")).toBe(true);
    expect(podeAvaliarGatilho("ai-agent", "dm")).toBe(true);
    expect(podeAvaliarGatilho("agent", "dm")).toBe(true);
    expect(podeAvaliarGatilho("wait", "dm")).toBe(true);
    expect(podeAvaliarGatilho("capture", "dm")).toBe(false);
  });
  it("story: sempre", () => {
    expect(podeAvaliarGatilho("capture", "story_reply")).toBe(true);
    expect(podeAvaliarGatilho("capture", "story_mention")).toBe(true);
  });
});

describe("parseTriggerInput", () => {
  const base = { name: "Promo", kind: "dm_keyword", matchMode: "exact", keywords: "promo, PROMOÇÃO", replyText: "Oi!" };
  it("aceita palavras em texto separado por vírgula", () => {
    const r = parseTriggerInput(base);
    expect("data" in r && r.data.keywords).toEqual(["promo", "PROMOÇÃO"]);
  });
  it("DM exige palavra", () => {
    expect(parseTriggerInput({ ...base, keywords: "" })).toEqual({ error: "Informe ao menos uma palavra-chave." });
  });
  it("DM não aceita 'qualquer mensagem'", () => {
    expect("error" in parseTriggerInput({ ...base, matchMode: "any" })).toBe(true);
  });
  it("exige resposta ou bloco de destino", () => {
    expect(parseTriggerInput({ ...base, replyText: "" })).toEqual({
      error: "Defina uma mensagem de resposta ou um bloco do fluxo para seguir.",
    });
  });
  it("story força canal instagram e limpa storyId em menção", () => {
    const r = parseTriggerInput({ name: "M", kind: "story_mention", storyId: "X", replyText: "Valeu!", channels: ["telegram"] });
    expect("data" in r && r.data.channels).toEqual(["instagram"]);
    expect("data" in r && r.data.storyId).toBe("");
  });
  it("tipo inválido", () => {
    expect("error" in parseTriggerInput({ ...base, kind: "xyz" })).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/server/triggers.test.ts`
Expected: FAIL — `Cannot find module './triggers'`.

- [ ] **Step 3: Implementar**

`src/lib/server/triggers.ts`:
```ts
// Gatilhos do agente: palavra-chave na DM (qualquer canal), resposta/reação a
// story e menção em story (Instagram). Tudo aqui é puro — sem banco, sem
// rede — pra ser testado à parte e reaproveitado pelo motor e pela API.

export type TriggerKind = "dm_keyword" | "story_reply" | "story_mention";
export type MatchMode = "any" | "exact" | "contains";
export type InboundKind = "dm" | "story_reply" | "story_mention";

export const TRIGGER_KINDS: TriggerKind[] = ["dm_keyword", "story_reply", "story_mention"];
export const MATCH_MODES: MatchMode[] = ["any", "exact", "contains"];
export const TRIGGER_CHANNELS = ["instagram", "whatsapp_meta", "whatsapp_qr", "messenger", "telegram", "website", "tiktok"];
// Canais do simulador: testam o gatilho sem filtro de canal.
const TEST_CHANNELS = new Set(["builder_preview", "playground"]);
// Blocos em que a conversa pode ser "puxada" por uma palavra-chave. Captura
// fica de fora: a resposta do cliente ali é dado, não comando.
const INTERRUPTIBLE = new Set(["ai-agent", "agent", "wait"]);

export interface TriggerLike {
  id: string;
  kind: string;
  channels: string[];
  matchMode: string;
  keywords: string[];
  storyId: string;
  includeReactions: boolean;
  priority: number;
  active: boolean;
  createdAt: Date;
}

export interface InboundContext {
  channel: string;
  kind: InboundKind;
  text?: string;
  storyId?: string;
  isReaction?: boolean;
}

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isEmojiOnly(text: string | undefined): boolean {
  const t = text?.trim();
  if (!t) return false;
  return t.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣\s]/gu, "").length === 0;
}

function keywordsMatch(mode: string, keywords: string[], text: string | undefined): boolean {
  if (mode === "any") return true;
  const t = normalizeText(text ?? "");
  if (!t) return false;
  const ks = keywords.map(normalizeText).filter(Boolean);
  if (mode === "exact") return ks.some((k) => t === k);
  if (mode === "contains") return ks.some((k) => t.includes(k));
  return false;
}

function specificity(t: TriggerLike): number {
  return (t.storyId ? 4 : 0) + (t.matchMode === "exact" ? 2 : t.matchMode === "contains" ? 1 : 0);
}

function best<T extends TriggerLike>(list: T[]): T | null {
  const sorted = [...list].sort(
    (a, b) =>
      specificity(b) - specificity(a) || b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime()
  );
  return sorted[0] ?? null;
}

function candidates<T extends TriggerLike>(triggers: T[], ctx: InboundContext, kind: TriggerKind): T[] {
  return triggers.filter((t) => {
    if (!t.active || t.kind !== kind) return false;
    if (t.channels.length > 0 && !TEST_CHANNELS.has(ctx.channel) && !t.channels.includes(ctx.channel)) return false;
    if (kind === "dm_keyword") return t.matchMode !== "any" && keywordsMatch(t.matchMode, t.keywords, ctx.text);
    if (kind === "story_reply") {
      if (t.storyId && t.storyId !== ctx.storyId) return false;
      if (ctx.isReaction && !t.includeReactions) return false;
      return keywordsMatch(t.matchMode, t.keywords, ctx.text);
    }
    return true; // story_mention: qualquer menção
  });
}

export function matchTrigger<T extends TriggerLike>(triggers: T[], ctx: InboundContext): T | null {
  if (ctx.kind === "story_mention") return best(candidates(triggers, ctx, "story_mention"));
  if (ctx.kind === "story_reply") {
    const story = best(candidates(triggers, ctx, "story_reply"));
    if (story) return story;
    // Um ❤️ num story não é pedido de nada — não pode cair numa palavra-chave de DM.
    if (ctx.isReaction) return null;
  }
  return best(candidates(triggers, ctx, "dm_keyword"));
}

export function podeAvaliarGatilho(parkedKind: string | null, inbound: InboundKind): boolean {
  if (inbound !== "dm") return true;
  return parkedKind === null || INTERRUPTIBLE.has(parkedKind);
}

export interface TriggerInput {
  name: string;
  kind: TriggerKind;
  channels: string[];
  matchMode: MatchMode;
  keywords: string[];
  storyId: string;
  includeReactions: boolean;
  replyText: string;
  targetNodeId: string;
  priority: number;
  active: boolean;
}

function toList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return raw.map((v) => String(v).trim()).filter(Boolean);
}

export function parseTriggerInput(body: unknown): { data: TriggerInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = String(b.name ?? "").trim();
  if (!name) return { error: "Dê um nome ao gatilho." };

  const kind = String(b.kind ?? "") as TriggerKind;
  if (!TRIGGER_KINDS.includes(kind)) return { error: "Tipo de gatilho inválido." };

  const isStory = kind !== "dm_keyword";
  const matchMode = (kind === "story_mention" ? "any" : String(b.matchMode ?? "contains")) as MatchMode;
  if (!MATCH_MODES.includes(matchMode)) return { error: "Modo de correspondência inválido." };
  if (kind === "dm_keyword" && matchMode === "any") {
    return { error: "Palavra-chave na DM precisa ser exata ou parcial — 'qualquer mensagem' já é o fluxo padrão." };
  }

  const keywords = matchMode === "any" ? [] : toList(b.keywords);
  if (matchMode !== "any" && keywords.length === 0) return { error: "Informe ao menos uma palavra-chave." };

  const channels = isStory ? ["instagram"] : toList(b.channels).filter((c) => TRIGGER_CHANNELS.includes(c));
  const replyText = String(b.replyText ?? "").trim();
  const targetNodeId = String(b.targetNodeId ?? "").trim();
  if (!replyText && !targetNodeId) return { error: "Defina uma mensagem de resposta ou um bloco do fluxo para seguir." };

  const priority = Math.max(0, Math.min(100, Number.parseInt(String(b.priority ?? 0), 10) || 0));

  return {
    data: {
      name,
      kind,
      channels,
      matchMode,
      keywords,
      storyId: kind === "story_reply" ? String(b.storyId ?? "").trim() : "",
      includeReactions: kind === "story_reply" ? b.includeReactions !== false : false,
      replyText,
      targetNodeId,
      priority,
      active: b.active !== false,
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/server/triggers.test.ts`
Expected: todos passam. Se `isEmojiOnly("👍🏽")` falhar, conferir se `\p{Emoji_Modifier}` está na classe.

- [ ] **Step 5: Commit**
```bash
git add src/lib/server/triggers.ts src/lib/server/triggers.test.ts
git commit -m "feat: casamento de gatilhos (DM, story, menção) com testes"
```

---

### Task 6: Classificar evento do Instagram

**Files:**
- Create: `src/lib/server/instagram-events.ts`, `src/lib/server/instagram-events.test.ts`
- Uses: `src/test/fixtures/meta/ig-*.json` (Task 3)

- [ ] **Step 1: Teste**
```ts
import { describe, it, expect } from "vitest";
import { classifyInstagramMessage } from "./instagram-events";
import reply from "@/test/fixtures/meta/ig-story-reply.json";
import reaction from "@/test/fixtures/meta/ig-story-reaction.json";
import mention from "@/test/fixtures/meta/ig-story-mention.json";
import dm from "@/test/fixtures/meta/ig-dm.json";

describe("classifyInstagramMessage", () => {
  it("resposta a story", () => {
    expect(classifyInstagramMessage(reply.message)).toEqual({
      kind: "story_reply",
      storyId: "STORY_1",
      storyUrl: "https://lookaside.example/story1",
      isReaction: false,
    });
  });
  it("reação com emoji num story", () => {
    expect(classifyInstagramMessage(reaction.message)).toMatchObject({ kind: "story_reply", isReaction: true });
  });
  it("menção em story", () => {
    expect(classifyInstagramMessage(mention.message)).toEqual({
      kind: "story_mention",
      storyUrl: "https://lookaside.example/mention1",
      isReaction: false,
    });
  });
  it("DM comum", () => {
    expect(classifyInstagramMessage(dm.message)).toEqual({ kind: "dm", isReaction: false });
  });
  it("mensagem vazia", () => {
    expect(classifyInstagramMessage({})).toEqual({ kind: "dm", isReaction: false });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/server/instagram-events.test.ts`
Expected: FAIL — módulo não existe. (Se reclamar de import de JSON, acrescentar `"resolveJsonModule": true` no `tsconfig.json` — conferir antes se já existe.)

- [ ] **Step 3: Implementar**

`src/lib/server/instagram-events.ts`:
```ts
import { isEmojiOnly, type InboundKind } from "@/lib/server/triggers";

export interface InstagramMessageLike {
  text?: string;
  attachments?: { type?: string; payload?: { url?: string } }[];
  reply_to?: { mid?: string; story?: { id?: string; url?: string } };
}

export interface ClassifiedInstagramMessage {
  kind: InboundKind;
  storyId?: string;
  storyUrl?: string;
  isReaction: boolean;
}

/**
 * O Instagram manda resposta a story, reação a story e menção em story no
 * mesmo campo "messages" de uma DM comum. A diferença está no reply_to.story
 * (resposta/reação) e no anexo do tipo story_mention (menção).
 */
export function classifyInstagramMessage(message: InstagramMessageLike): ClassifiedInstagramMessage {
  const mention = message.attachments?.find((a) => a.type === "story_mention");
  if (mention) return { kind: "story_mention", storyUrl: mention.payload?.url, isReaction: false };

  const story = message.reply_to?.story;
  if (story) {
    return { kind: "story_reply", storyId: story.id, storyUrl: story.url, isReaction: isEmojiOnly(message.text) };
  }
  return { kind: "dm", isReaction: false };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/server/instagram-events.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/server/instagram-events.ts src/lib/server/instagram-events.test.ts tsconfig.json
git commit -m "feat: classifica DM, resposta e menção em story do Instagram"
```

---

### Task 7: Modelo `AgentTrigger`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Acrescentar o modelo** logo depois de `model CommentAutomation { ... }`:
```prisma
// Gatilhos do agente: palavra-chave na DM (qualquer canal), resposta/reação a
// story e menção em story (Instagram). Casamento em src/lib/server/triggers.ts.
// Ação: replyText (opcional) e/ou pular para targetNodeId no fluxo.
model AgentTrigger {
  id               String    @id @default(uuid())
  agentId          String
  name             String
  kind             String // dm_keyword | story_reply | story_mention
  channels         String[]  @default([]) // vazio = todos
  matchMode        String    @default("contains") // any | exact | contains
  keywords         String[]  @default([])
  storyId          String    @default("") // story_reply: vazio = qualquer story
  includeReactions Boolean   @default(true)
  replyText        String    @default("") @db.Text
  targetNodeId     String    @default("")
  priority         Int       @default(0)
  active           Boolean   @default(true)
  triggerCount     Int       @default(0)
  lastTriggeredAt  DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  agent Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@index([agentId, active])
  @@map("eva_studio_agent_triggers")
}
```

- [ ] **Step 2: Relação no `Agent`.** No `model Agent`, junto das outras relações (perto de `commentAutomations CommentAutomation[]`), acrescentar:
```prisma
  triggers           AgentTrigger[]
```

- [ ] **Step 3: Gerar o client e checar tipos**

Run: `npx prisma validate && npx prisma generate && npx tsc --noEmit`
Expected: `The schema at prisma/schema.prisma is valid`, client gerado, `tsc` sem erros.

- [ ] **Step 4: Aplicar no banco — PARAR e confirmar com o Alfredo qual banco está no `.env` (staging ou produção).**

Run (após confirmação): `npm run db:push`
Expected: `Your database is now in sync with your Prisma schema` e o `post-migrate` recriando o índice vetorial. **Se o Prisma avisar perda de dados, abortar** — esta mudança é só aditiva.

- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat: modelo AgentTrigger"
```

---

### Task 8: Gatilho no motor

**Files:**
- Modify: `src/lib/server/flow-engine.ts`

- [ ] **Step 1: Import.** Junto dos imports do topo:
```ts
import { matchTrigger, podeAvaliarGatilho, type InboundKind } from "@/lib/server/triggers";
```

- [ ] **Step 2: Campo novo em `AdvanceInput`** (depois de `externalId?: string;`):
```ts
  // Que tipo de evento é (só o Instagram distingue hoje): DM comum, resposta
  // ou reação a story, menção em story. Sem isso, é DM.
  event?: { kind: InboundKind; storyId?: string; isReaction?: boolean };
```

- [ ] **Step 3: Helpers** logo antes de `export async function advanceConversation`:
```ts
async function acharGatilho(input: AdvanceInput, kind: InboundKind) {
  const triggers = await prisma.agentTrigger.findMany({ where: { agentId: input.agentId, active: true } });
  if (triggers.length === 0) return null;
  return matchTrigger(triggers, {
    channel: input.channel,
    kind,
    text: input.text,
    storyId: input.event?.storyId,
    isReaction: input.event?.isReaction,
  });
}

async function contarDisparo(triggerId: string): Promise<void> {
  try {
    await prisma.agentTrigger.update({
      where: { id: triggerId },
      data: { triggerCount: { increment: 1 }, lastTriggeredAt: new Date() },
    });
  } catch (error) {
    console.error("[flow-engine] falha ao contar disparo do gatilho", error);
  }
}
```

- [ ] **Step 4: Menção sem fluxo salvo não vai pro n8n.** No bloco `if (!flow) {`, logo depois do `if (agentePausado(...)) { ... }`, acrescentar:
```ts
    // Menção em story não é pergunta: registra e não acorda o webhook do agente.
    if (input.event?.kind === "story_mention") {
      await logMessages(conversation.id, input.text, [], input);
      await syncContact(conversation.id, {}, true);
      return { messages: [], status: "active" };
    }
```

- [ ] **Step 5: Avaliar o gatilho antes de retomar o bloco parado.** Substituir:
```ts
  const parkedNode = findNode(nodes, currentId);
  if (parkedNode?.data.iconKey === "capture") {
```
por:
```ts
  const parkedNode = findNode(nodes, currentId);
  const inboundKind: InboundKind = input.event?.kind ?? "dm";
  const gatilho =
    isGenuineInbound && podeAvaliarGatilho(parkedNode?.data.iconKey ?? null, inboundKind)
      ? await acharGatilho(input, inboundKind)
      : null;

  if (gatilho) {
    await contarDisparo(gatilho.id);
    steps.push({ nodeId: `trigger:${gatilho.id}`, kind: "trigger", label: gatilho.name, ms: 0 });
    if (gatilho.replyText) messages.push({ text: interpolate(gatilho.replyText, variables) });
    const alvo = gatilho.targetNodeId ? findNode(nodes, gatilho.targetNodeId) : null;
    if (!alvo) return finish(); // só resposta: a conversa fica onde estava
    delete variables.__wait_until;
    currentId = alvo.id; // o laço abaixo executa o bloco de destino
  } else if (inboundKind === "story_mention") {
    // Menção sem gatilho configurado: entra na caixa de entrada e mais nada.
    return finish();
  } else if (parkedNode?.data.iconKey === "capture") {
```
O resto da cadeia (`else if (parkedNode?.data.iconKey === "agent")`, `"ai-agent"`, `"wait"`, `else if (!parkedNode)`) continua igual.

- [ ] **Step 6: Tipos e testes**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros de tipo; todos os testes passam.

- [ ] **Step 7: Teste manual no Playground** (`npm run dev`, abrir o agente de teste → Playground). Antes, criar um gatilho direto no banco de staging ou esperar a Task 10 e criar pela API:
  1. Gatilho `dm_keyword`, exato, `promo`, resposta "Cupom: EVA10". Digitar `Promo` → recebe "Cupom: EVA10". Digitar `oi` → fluxo padrão.
  2. Mesmo gatilho com `targetNodeId` de um bloco Mensagem → digitar `promo` executa aquele bloco.
  3. Fluxo parado numa Captura de e-mail → digitar `promo` → **não** dispara (vira resposta da captura).
  4. Conferir `triggerCount` subindo e o passo "trigger" na aba Execuções.

- [ ] **Step 8: Commit**
```bash
git add src/lib/server/flow-engine.ts
git commit -m "feat: motor avalia gatilhos antes de retomar o bloco parado"
```

---

### Task 9: Webhook do Instagram entende story e menção; correção da automação de comentário

**Files:**
- Modify: `src/app/api/webhooks/meta/route.ts`

- [ ] **Step 1: Import**
```ts
import { classifyInstagramMessage } from "@/lib/server/instagram-events";
```

- [ ] **Step 2: Tipo do evento.** Trocar `interface InstagramMessagingEvent` por:
```ts
interface InstagramMessagingEvent {
  sender?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: AnexoSocial[];
    reply_to?: { mid?: string; story?: { id?: string; url?: string } };
  };
}
```

- [ ] **Step 3: Menção vira mídia + rótulo.** Em `lerEntradaSocial`, dentro do `for (const a of anexos)`, antes do `else if (a.type === "location" ...)`, transformar o início do encadeamento em:
```ts
    const tipo = tipoDoAnexoSocial(a.type);
    if (a.type === "story_mention") {
      // A URL do story expira em horas: baixa agora pra ficar na conversa.
      const midia = orgId && a.payload?.url ? await baixarEGuardar(orgId, a.payload.url) : null;
      lidos.push({ texto: "[Menção no story]", media: midia ?? undefined });
    } else if (tipo) {
```
(o corpo do antigo `if (tipo) { ... }` continua igual, agora como `else if (tipo)`.)

- [ ] **Step 4: Passar o evento ao motor.** Em `handleInstagramEntries`, dentro do `try`, trocar a chamada de `advanceConversation` por:
```ts
        const evento = classifyInstagramMessage(event.message ?? {});
        const result = await advanceConversation({
          agentId: connection.agentId,
          channel: "instagram",
          contactId: from,
          text: entrada.text,
          media: entrada.media,
          externalId: event.message?.mid,
          event: { kind: evento.kind, storyId: evento.storyId, isReaction: evento.isReaction },
        });
```

- [ ] **Step 5: Automação de comentário para de mentir.** Trocar `sendPrivateCommentReply` por uma versão que diz se deu certo:
```ts
async function sendPrivateCommentReply(commentId: string, accessToken: string, text: string): Promise<boolean> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${commentId}/private_replies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
  if (!res.ok) console.error("[webhook/meta] private reply falhou", res.status, await res.text().catch(() => ""));
  return res.ok;
}
```
Em `handleMatchedComment`, trocar `await sendPrivateCommentReply(commentId, accessToken, dmMessage);` por:
```ts
  const enviada = await sendPrivateCommentReply(commentId, accessToken, dmMessage);
  if (!enviada) return; // não conta disparo nem registra DM que não saiu
```
No `catch {}` do laço de comentários em `handleInstagramEntries`, trocar por:
```ts
      } catch (e) {
        console.error("[webhook/meta] falha na automação de comentário", e instanceof Error ? e.message : e);
      }
```
E corrigir o comentário acima de `handleMatchedComment` ("isso não é deduplicado hoje") — a deduplicação já existe via `isFirstDelivery(commentId)`.

> Se o spike (Task 3) mostrou que o token do Instagram Login só funciona em `graph.instagram.com`, trocar também as URLs de `sendPublicCommentReply`/`sendPrivateCommentReply` para `${instagramGraphBase(accessToken)}/...`, e a private reply para o formato do Instagram Login: `POST ${INSTAGRAM_GRAPH}/{igBusinessId}/messages` com `{ recipient: { comment_id }, message: { text } }`.

- [ ] **Step 6: Tipos, lint, testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo verde.

- [ ] **Step 7: Commit**
```bash
git add src/app/api/webhooks/meta/route.ts
git commit -m "feat: webhook do Instagram trata resposta e menção em story; comentário só conta DM enviada"
```

---

### Task 10: API de gatilhos e lista de stories

**Files:**
- Create: `src/app/api/agents/[agentId]/triggers/route.ts`, `src/app/api/agents/[agentId]/triggers/[id]/route.ts`, `src/app/api/agents/[agentId]/instagram-stories/route.ts`

- [ ] **Step 1: GET/POST**

`src/app/api/agents/[agentId]/triggers/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { parseTriggerInput } from "@/lib/server/triggers";

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId }, select: { id: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const triggers = await prisma.agentTrigger.findMany({ where: { agentId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ triggers });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId }, select: { id: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const parsed = parseTriggerInput(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const trigger = await prisma.agentTrigger.create({ data: { agentId, ...parsed.data } });
  return NextResponse.json({ trigger });
}
```

- [ ] **Step 2: PUT/DELETE**

`src/app/api/agents/[agentId]/triggers/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { parseTriggerInput } from "@/lib/server/triggers";

type Params = { params: Promise<{ agentId: string; id: string }> };

async function acharDaOrg(agentId: string, id: string, orgId: string) {
  return prisma.agentTrigger.findFirst({ where: { id, agentId, agent: { orgId } }, select: { id: true } });
}

export async function PUT(request: Request, { params }: Params) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, id } = await params;

  if (!(await acharDaOrg(agentId, id, ctx.orgId))) {
    return NextResponse.json({ error: "Gatilho não encontrado." }, { status: 404 });
  }
  const parsed = parseTriggerInput(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const trigger = await prisma.agentTrigger.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ trigger });
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, id } = await params;

  if (!(await acharDaOrg(agentId, id, ctx.orgId))) {
    return NextResponse.json({ error: "Gatilho não encontrado." }, { status: 404 });
  }
  await prisma.agentTrigger.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Stories ativos**

`src/app/api/agents/[agentId]/instagram-stories/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { decryptSecret } from "@/lib/server/crypto";
import { instagramGraphBase } from "@/lib/server/meta-graph";

interface StoryDaMeta {
  id: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp?: string;
}

// Stories ativos (últimas 24h) da conta conectada, pra escolher "este story"
// num gatilho. Se a Meta não devolver (permissão/token), a tela cai no campo
// de ID manual — por isso erro aqui vira lista vazia com motivo, não 500.
export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId: ctx.orgId },
    include: { instagramConnection: true },
  });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  if (!agent.instagramConnection) return NextResponse.json({ stories: [], reason: "Instagram não conectado." });

  const token = decryptSecret(agent.instagramConnection.pageAccessToken);
  const url = new URL(`${instagramGraphBase(token)}/${agent.instagramConnection.igBusinessId}/stories`);
  url.searchParams.set("fields", "id,media_type,media_url,thumbnail_url,timestamp");

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return NextResponse.json({ stories: [], reason: `A Meta respondeu ${res.status}.` });
    const data = (await res.json()) as { data?: StoryDaMeta[] };
    const stories = (data.data ?? []).map((s) => ({
      id: s.id,
      type: s.media_type ?? "",
      preview: s.thumbnail_url ?? s.media_url ?? "",
      postedAt: s.timestamp ?? null,
    }));
    return NextResponse.json({ stories });
  } catch {
    return NextResponse.json({ stories: [], reason: "Não foi possível falar com a Meta." });
  }
}
```

- [ ] **Step 4: Tipos/lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: verde. (Conferir o nome da relação: `instagramConnection` em `model Agent`. Se for outro, ajustar o `include`.)

- [ ] **Step 5: Teste manual da API** (logado no `npm run dev`, pelo console do navegador):
```js
await (await fetch(`/api/agents/${AGENT}/triggers`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Promo", kind: "dm_keyword", matchMode: "exact", keywords: "promo", replyText: "Cupom: EVA10" }) })).json()
```
Expected: `{ trigger: {...} }`. Repetir com `keywords: ""` → 400 "Informe ao menos uma palavra-chave.".

- [ ] **Step 6: Commit**
```bash
git add "src/app/api/agents/[agentId]/triggers" "src/app/api/agents/[agentId]/instagram-stories"
git commit -m "feat: API de gatilhos e lista de stories ativos"
```

---

### Task 11: Assinar eventos do Instagram automaticamente

**Files:**
- Create: `src/lib/server/instagram-subscribe.ts`, `src/app/api/agents/[agentId]/instagram-connection/subscribe/route.ts`
- Modify: `src/app/api/instagram/oauth/callback/route.ts`

- [ ] **Step 1: Função**

`src/lib/server/instagram-subscribe.ts`:
```ts
import "server-only";
import { INSTAGRAM_GRAPH } from "@/lib/server/meta-graph";

// Campos que a Eva usa: DM (inclui resposta/menção em story), botões,
// reações e comentários. Sem isso a Meta não manda nada — antes era preciso
// marcar à mão no painel do app.
export const INSTAGRAM_FIELDS = ["messages", "messaging_postbacks", "message_reactions", "comments"];

export async function assinarEventosInstagram(accessToken: string): Promise<{ ok: boolean; error?: string }> {
  if (!accessToken.startsWith("IG")) {
    return { ok: false, error: "Conexão feita pelo Facebook: assine os campos na Página (painel do app Meta)." };
  }
  try {
    const res = await fetch(`${INSTAGRAM_GRAPH}/me/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ subscribed_fields: INSTAGRAM_FIELDS.join(","), access_token: accessToken }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `A Meta respondeu ${res.status}: ${await res.text().catch(() => "")}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha de rede" };
  }
}
```

- [ ] **Step 2: Chamar no OAuth.** Em `src/app/api/instagram/oauth/callback/route.ts`, importar `assinarEventosInstagram` e, logo depois do `prisma.instagramConnection.upsert(...)`:
```ts
    const assinatura = await assinarEventosInstagram(accessToken);
    if (!assinatura.ok) {
      console.error("[instagram/oauth] não assinou os eventos", assinatura.error);
      redirectBack.searchParams.set("instagram_warning", "subscribe_failed");
    }
```

- [ ] **Step 3: Rota para reassinar conexões antigas**

`src/app/api/agents/[agentId]/instagram-connection/subscribe/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { decryptSecret } from "@/lib/server/crypto";
import { assinarEventosInstagram } from "@/lib/server/instagram-subscribe";

export async function POST(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId: ctx.orgId },
    include: { instagramConnection: true },
  });
  if (!agent?.instagramConnection) return NextResponse.json({ error: "Instagram não conectado." }, { status: 404 });

  const result = await assinarEventosInstagram(decryptSecret(agent.instagramConnection.pageAccessToken));
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
```

- [ ] **Step 4: Tipos/lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: verde.

- [ ] **Step 5: Teste manual.** Reconectar o Instagram do agente de teste. Conferir:
```bash
curl -s "https://graph.instagram.com/v21.0/me/subscribed_apps?access_token=<TOKEN>"
```
Expected: lista com `messages`, `messaging_postbacks`, `message_reactions`, `comments`.

- [ ] **Step 6: Commit**
```bash
git add src/lib/server/instagram-subscribe.ts "src/app/api/agents/[agentId]/instagram-connection/subscribe" src/app/api/instagram/oauth/callback/route.ts
git commit -m "feat: conexão do Instagram assina os eventos sozinha"
```

---

### Task 12: Tela de gatilhos

**Files:**
- Create: `src/components/agent-studio/triggers-editor.tsx`
- Modify: `src/components/agent-studio/agent-form.tsx`

- [ ] **Step 1: Componente**

`src/components/agent-studio/triggers-editor.tsx`:
```tsx
"use client";

import * as React from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Kind = "dm_keyword" | "story_reply" | "story_mention";
type Mode = "any" | "exact" | "contains";

interface Trigger {
  id: string;
  name: string;
  kind: Kind;
  channels: string[];
  matchMode: Mode;
  keywords: string[];
  storyId: string;
  includeReactions: boolean;
  replyText: string;
  targetNodeId: string;
  priority: number;
  active: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
}

type Draft = Omit<Trigger, "id" | "triggerCount" | "lastTriggeredAt" | "keywords"> & { keywords: string };

const KIND_LABEL: Record<Kind, string> = {
  dm_keyword: "Palavra-chave na mensagem",
  story_reply: "Resposta a story",
  story_mention: "Menção em story",
};

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  whatsapp_meta: "WhatsApp oficial",
  whatsapp_qr: "WhatsApp (QR)",
  messenger: "Messenger",
  telegram: "Telegram",
  website: "Site",
  tiktok: "TikTok",
};

function emptyDraft(kind: Kind): Draft {
  return {
    name: "",
    kind,
    channels: [],
    matchMode: kind === "dm_keyword" ? "contains" : "any",
    keywords: "",
    storyId: "",
    includeReactions: true,
    replyText: "",
    targetNodeId: "",
    priority: 0,
    active: true,
  };
}

interface FlowNodeOption {
  id: string;
  label: string;
}
interface StoryOption {
  id: string;
  preview: string;
  postedAt: string | null;
}

export function TriggersEditor({ agentId }: { agentId: string }) {
  const [triggers, setTriggers] = React.useState<Trigger[]>([]);
  const [nodes, setNodes] = React.useState<FlowNodeOption[]>([]);
  const [stories, setStories] = React.useState<StoryOption[]>([]);
  const [storiesReason, setStoriesReason] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const [t, f] = await Promise.all([
      fetch(`/api/agents/${agentId}/triggers`).then((r) => r.json()),
      fetch(`/api/flows/${agentId}`).then((r) => r.json()),
    ]);
    setTriggers(t.triggers ?? []);
    const flowNodes = (f.flow?.nodes ?? []) as { id: string; data?: { label?: string; iconKey?: string } }[];
    setNodes(
      flowNodes
        .filter((n) => n.data?.iconKey !== "start")
        .map((n) => ({ id: n.id, label: n.data?.label || n.data?.iconKey || n.id }))
    );
  }, [agentId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function loadStories() {
    const r = await fetch(`/api/agents/${agentId}/instagram-stories`).then((res) => res.json());
    setStories(r.stories ?? []);
    setStoriesReason(r.reason ?? null);
  }

  function startNew(kind: Kind) {
    setEditingId(null);
    setError(null);
    setDraft(emptyDraft(kind));
    if (kind === "story_reply") void loadStories();
  }

  function startEdit(t: Trigger) {
    setEditingId(t.id);
    setError(null);
    setDraft({ ...t, keywords: t.keywords.join(", ") });
    if (t.kind === "story_reply") void loadStories();
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/agents/${agentId}/triggers/${editingId}` : `/api/agents/${agentId}/triggers`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      setDraft(null);
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/agents/${agentId}/triggers/${id}`, { method: "DELETE" });
    await load();
  }

  function toggleChannel(c: string) {
    if (!draft) return;
    const has = draft.channels.includes(c);
    setDraft({ ...draft, channels: has ? draft.channels.filter((x) => x !== c) : [...draft.channels, c] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => startNew("dm_keyword")}>
          <Plus className="mr-1 h-4 w-4" /> Palavra-chave
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => startNew("story_reply")}>
          <Plus className="mr-1 h-4 w-4" /> Resposta a story
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => startNew("story_mention")}>
          <Plus className="mr-1 h-4 w-4" /> Menção em story
        </Button>
      </div>

      {triggers.length === 0 && !draft && (
        <p className="text-sm text-text-secondary">
          Nenhum gatilho. Sem gatilho, toda mensagem segue o fluxo padrão do agente.
        </p>
      )}

      <ul className="space-y-2">
        {triggers.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-lg border border-border-default p-3">
            <button type="button" className="text-left" onClick={() => startEdit(t)}>
              <div className="flex items-center gap-2 font-medium">
                <Zap className="h-4 w-4" /> {t.name}
                {!t.active && <Badge variant="neutral">pausado</Badge>}
              </div>
              <div className="text-xs text-text-secondary">
                {KIND_LABEL[t.kind]}
                {t.keywords.length > 0 && ` · ${t.matchMode === "exact" ? "exata" : "contém"}: ${t.keywords.join(", ")}`}
                {t.storyId && " · story específico"}
                {` · disparou ${t.triggerCount}x`}
              </div>
            </button>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(t.id)} aria-label="Excluir gatilho">
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>

      {draft && (
        <div className="space-y-3 rounded-lg border border-border-default p-4">
          <div className="text-sm font-medium">{KIND_LABEL[draft.kind]}</div>

          <div>
            <Label>Nome</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>

          {draft.kind !== "story_mention" && (
            <div>
              <Label>Quando</Label>
              <select
                className="w-full rounded-lg border border-border-default bg-surface-2 p-2 text-sm"
                value={draft.matchMode}
                onChange={(e) => setDraft({ ...draft, matchMode: e.target.value as Mode })}
              >
                {draft.kind === "story_reply" && <option value="any">Qualquer resposta</option>}
                <option value="exact">A mensagem for exatamente</option>
                <option value="contains">A mensagem contiver</option>
              </select>
            </div>
          )}

          {draft.matchMode !== "any" && (
            <div>
              <Label>Palavras (separadas por vírgula)</Label>
              <Input
                value={draft.keywords}
                placeholder="promo, cupom, quero"
                onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
              />
            </div>
          )}

          {draft.kind === "story_reply" && (
            <>
              <div>
                <Label>Story</Label>
                <select
                  className="w-full rounded-lg border border-border-default bg-surface-2 p-2 text-sm"
                  value={stories.some((s) => s.id === draft.storyId) || !draft.storyId ? draft.storyId : "__manual"}
                  onChange={(e) => setDraft({ ...draft, storyId: e.target.value === "__manual" ? draft.storyId : e.target.value })}
                >
                  <option value="">Qualquer story</option>
                  {stories.map((s) => (
                    <option key={s.id} value={s.id}>
                      Story de {s.postedAt ? new Date(s.postedAt).toLocaleString("pt-BR") : s.id}
                    </option>
                  ))}
                  <option value="__manual">Informar ID…</option>
                </select>
                {storiesReason && <p className="mt-1 text-xs text-text-secondary">{storiesReason}</p>}
                <Input
                  className="mt-2"
                  value={draft.storyId}
                  placeholder="ID do story (vazio = qualquer)"
                  onChange={(e) => setDraft({ ...draft, storyId: e.target.value })}
                />
                <p className="mt-1 text-xs text-text-secondary">Story some em 24h — depois disso este gatilho não dispara mais.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.includeReactions}
                  onChange={(e) => setDraft({ ...draft, includeReactions: e.target.checked })}
                />
                Também responder reações com emoji
              </label>
            </>
          )}

          {draft.kind === "dm_keyword" && (
            <div>
              <Label>Canais (nenhum marcado = todos)</Label>
              <div className="flex flex-wrap gap-3 text-sm">
                {Object.entries(CHANNEL_LABEL).map(([c, label]) => (
                  <label key={c} className="flex items-center gap-1">
                    <input type="checkbox" checked={draft.channels.includes(c)} onChange={() => toggleChannel(c)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Resposta (pode ter cupom, link e {"{variaveis}"})</Label>
            <Textarea value={draft.replyText} onChange={(e) => setDraft({ ...draft, replyText: e.target.value })} />
          </div>

          <div>
            <Label>Depois, seguir para o bloco</Label>
            <select
              className="w-full rounded-lg border border-border-default bg-surface-2 p-2 text-sm"
              value={draft.targetNodeId}
              onChange={(e) => setDraft({ ...draft, targetNodeId: e.target.value })}
            >
              <option value="">Não mudar a conversa</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            {nodes.length === 0 && (
              <p className="mt-1 text-xs text-text-secondary">Este agente não tem fluxo salvo: só a resposta será enviada.</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Ativo
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Conferir as props dos componentes de UI.** Abrir `src/components/ui/button.tsx` e `src/components/ui/badge.tsx` e confirmar que existem `variant="secondary" | "ghost" | "secondary"` e `size="sm" | "icon"`. Se algum nome for diferente, usar o equivalente que existe.

- [ ] **Step 3: Montar no formulário.** Em `src/components/agent-studio/agent-form.tsx`, importar `import { TriggersEditor } from "./triggers-editor";` e, logo antes do `<Card>` de "Respostas automáticas a comentários (Instagram)", acrescentar um card no mesmo padrão:
```tsx
          <Card>
            <CardHeader>
              <CardTitle>Gatilhos</CardTitle>
              <CardDescription>
                Palavra-chave na mensagem (todos os canais), resposta a story e menção em story (Instagram).
              </CardDescription>
            </CardHeader>
            <TriggersEditor agentId={agentId} />
          </Card>
```
(Conferir se esse trecho fica dentro de uma condição de "agente já salvo" — o editor precisa de `agentId` existente, igual ao de comentários.)

- [ ] **Step 4: Tipos/lint/build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: verde.

- [ ] **Step 5: Teste manual de UI** (`npm run dev`): criar, editar, pausar e excluir um gatilho de cada tipo; ver a mensagem de erro do servidor ao salvar palavra-chave vazia; ver "disparou Nx" subir depois de testar no Playground.

- [ ] **Step 6: Commit**
```bash
git add src/components/agent-studio/triggers-editor.tsx src/components/agent-studio/agent-form.tsx
git commit -m "feat: tela de gatilhos no agente"
```

---

### Task 13: Documentação

**Files:**
- Modify: `docs/CHATBOT_ENGINE.md`, `worker/META_SETUP.md`

- [ ] **Step 1:** Em `docs/CHATBOT_ENGINE.md`, nova seção "Gatilhos" com: os três tipos, as regras 1–7 da Task 5, onde o motor avalia (antes do bloco parado), "Captura não é interrompida", "menção sem gatilho só registra", e o arquivo `src/lib/server/triggers.ts`. Corrigir a frase da §12 que diz que comentário não é deduplicado.
- [ ] **Step 2:** Em `worker/META_SETUP.md`, trocar a instrução de assinar campos à mão por: "a conexão pelo Instagram Login assina `messages, messaging_postbacks, message_reactions, comments` sozinha; conexões antigas: `POST /api/agents/{id}/instagram-connection/subscribe`".
- [ ] **Step 3: Commit**
```bash
git add docs/CHATBOT_ENGINE.md worker/META_SETUP.md
git commit -m "docs: gatilhos e assinatura automática do Instagram"
```

---

### Task 14: Roteiro ponta a ponta (conta de teste) e PR

- [ ] **Step 1: Verificação completa**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde. Colar a saída no PR.

- [ ] **Step 2: Roteiro na conta de teste** (preview da Vercel apontando para o banco de staging). Marcar cada item no PR:

| # | Ação | Esperado |
|---|---|---|
| 1 | DM "promo" no Instagram (gatilho exato "promo") | Resposta do gatilho; contador +1 |
| 2 | DM "quero a promo" com gatilho exato | Fluxo padrão |
| 3 | DM "tem PROMOÇÃO?" com gatilho parcial "promoção" | Gatilho dispara |
| 4 | WhatsApp oficial e WhatsApp QR: mesmo teste do item 1 | Mesmo resultado |
| 5 | Responder story com texto (gatilho "qualquer resposta") | Resposta do gatilho |
| 6 | Reagir ❤️ ao story com "incluir reações" desligado | Nada enviado; mensagem aparece na caixa de entrada |
| 7 | Mesmo, ligado | Resposta enviada |
| 8 | Gatilho de story específico + outro story | Só dispara no story escolhido |
| 9 | Mencionar a conta num story (gatilho de menção com cupom) | Agradecimento com cupom; mídia do story na conversa |
| 10 | Menção sem gatilho de menção | Nada enviado; aparece "[Menção no story]" na caixa de entrada |
| 11 | Conversa parada numa Captura + DM "promo" | Captura recebe "promo", gatilho não dispara |
| 12 | Conversa presa no Agente de IA + DM "promo" | Gatilho tira da IA e segue para o bloco de destino |
| 13 | Comentário com automação, private reply falhando (token inválido) | Erro no log; contador **não** sobe |

- [ ] **Step 3: PR**
```bash
git push -u origin feat/gatilhos
gh pr create --repo matheusflytech/eva-studio --title "Gatilhos: palavra-chave na DM, resposta e menção em story" --body-file docs/superpowers/plans/2026-10-18-fase-0-1-testes-e-gatilhos.md
```
(Antes do `db:push` em produção: rodar a Task 7 Step 4 contra produção só depois do merge aprovado.)
