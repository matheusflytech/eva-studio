# Fase 2 — Lead de verdade (captura validada, lead = contato) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nome, e-mail, telefone e campos livres capturados pelo fluxo passam a ser dados validados da **ficha do contato** (não só variáveis da conversa), com nova tentativa quando a resposta não serve, e a página Leads e a API `/api/v1/leads` passam a mostrar esses contatos, de qualquer canal.

**Architecture:** Lead deixa de ser "conversa do canal website" e passa a ser **um Contact marcado como lead** (colunas novas `leadStage`, `leadAt`, `leadAgentId`, `leadChannel`). A validação vive numa função pura compartilhada (`src/lib/capture-validation.ts`) usada pelo motor, pela API e pela tela. O bloco Captura ganha "tipo do campo" (texto livre, nome, e-mail, telefone, campo do contato), obrigatório/opcional, número de tentativas, mensagem de erro e uma saída "não respondeu certo". Toda leitura/escrita de lead passa por `src/lib/server/leads.ts`.

**Tech Stack:** Next.js 16, Prisma 7 + Postgres (Supabase), React 19, Vitest.

**Contexto obrigatório:**
- Roadmap: `docs/superpowers/plans/2026-10-18-roadmap-todos-eva.md` (Fase 2).
- Branch: continuar em `feat/gatilhos` ou criar `feat/lead-de-verdade` a partir dela. **Tudo local; nada de push/PR sem o Alfredo pedir.**
- Banco: `.env.local` aponta para a **produção** da Eva (`hregdcwbfpxvcmicojds`). Mudança de schema é **só aditiva** e aplicada por SQL revisado (como na Fase 1), nunca `db:push` (ele derruba o índice vetorial). O backfill (Task 10) só roda com ok explícito do Alfredo.

**Fotografia da produção (18/10/2026, só leitura):** 19 contatos (1 com e-mail, 2 com telefone); 26 conversas `website` (3 com etapa); 2 chaves de API, 1 usada uma vez em 16/09; 1 lead criado pela API v1; nenhum campo personalizado.

## Decisões (confirmar com o Alfredo antes da Task 7)

| Tema | Decisão | Por quê |
|---|---|---|
| O que é lead | Contact com `leadStage` preenchido | O dado já cai no Contact (`syncContactFromConversation`); a tela de Leads lia outro lugar |
| Quando vira lead | Na 1ª captura validada de nome/e-mail/telefone/campo do contato, ou criado pela tela/API | Conversa que só disse "oi" não é lead |
| Excluir na tela Leads | **Tira da lista de leads** (`leadStage = null`), não apaga a pessoa | Apagar o contato levaria conversas, negócios e tarefas junto |
| `/api/v1/leads` | Mesmo formato; `id` passa a ser o id do **contato**; `GET/PATCH/DELETE /:id` ainda aceitam o id antigo (de conversa) e resolvem para o contato; `DELETE` tira da lista em vez de apagar | Uso real da API é quase nulo, mas mantém compatível com quem tiver o id antigo guardado |

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/capture-validation.ts` | criar | Validação/normalização de nome, e-mail, telefone BR, campo personalizado; palavras de "pular" |
| `src/lib/capture-validation.test.ts` | criar | Testes |
| `prisma/schema.prisma` | modificar | Colunas de lead no `Contact` |
| `prisma/sql/2026-10-19-contact-lead.sql` | criar | SQL aditivo revisado |
| `src/lib/server/leads.ts` | criar | `marcarComoLead`, `listarLeads`, `serializarLead`, `salvarLeadExterno`, `resolverIdDoLead` |
| `src/lib/server/leads.test.ts` | criar | Testes com Prisma simulado |
| `src/components/agent-studio/builder/flow-node.tsx` | modificar | Campos novos em `FlowNodeData`; saída "invalido" no canvas |
| `src/lib/server/flow-engine.ts` | modificar | Captura com tipo, validação, tentativas, pular, saída inválida, marcar lead |
| `src/lib/server/flow-engine.capture.test.ts` | criar | Testes do motor |
| `src/components/agent-studio/builder/block-validation.ts` | modificar | Aviso do bloco Captura por tipo |
| `src/components/agent-studio/builder/node-inspector.tsx` | modificar | Configuração do bloco Captura |
| `src/app/api/leads/route.ts`, `[id]/route.ts` | reescrever | Leads = contatos |
| `src/app/api/v1/leads/route.ts`, `[id]/route.ts` | reescrever | API pública compatível |
| `src/app/(app)/leads/page.tsx` | modificar | Ler o formato novo, link para a ficha, conversa/execuções do canal certo |
| `scripts/backfill-leads.mjs` | criar | Leva a etapa das conversas `website` para os contatos (dry-run por padrão) |
| `docs/CHATBOT_ENGINE.md` | modificar | §12 e bloco Captura |

---

### Task 1: Validação compartilhada

**Files:**
- Create: `src/lib/capture-validation.ts`, `src/lib/capture-validation.test.ts`

Regras:
- **Nome:** 2–80 caracteres depois de tirar espaço extra; precisa ter letra; não pode ser e-mail nem só número.
- **E-mail:** minúsculo, sem espaço, `algo@dominio.tld`, até 254.
- **Telefone:** aceita qualquer formatação. Brasil: 10–11 dígitos com DDD 11–99 (ou 12–13 começando com 55); celular de 11 dígitos começa com 9 depois do DDD. Grava `+55DDNNNNNNNNN`. Internacional: começa com `+` e tem 8–15 dígitos → `+dígitos`.
- **Campo personalizado:** usa `normalizarValor` de `src/lib/custom-fields.ts` (mesma regra da tela de contatos).
- **Pular:** "pular", "pula", "prefiro não", "não quero", "agora não" (sem acento/caixa) — só vale se o bloco for opcional.

- [ ] **Step 1: Teste**

`src/lib/capture-validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  validarNome,
  validarEmail,
  normalizarTelefoneBR,
  validateCapture,
  isSkip,
  variavelDaCaptura,
  MENSAGEM_DE_ERRO,
} from "./capture-validation";

describe("validarNome", () => {
  it("aceita e limpa espaços", () => expect(validarNome("  Ana   Maria ")).toBe("Ana Maria"));
  it("recusa curto, só número, e-mail e longo", () => {
    expect(validarNome("A")).toBeNull();
    expect(validarNome("12345")).toBeNull();
    expect(validarNome("ana@x.com")).toBeNull();
    expect(validarNome("a".repeat(81))).toBeNull();
  });
});

describe("validarEmail", () => {
  it("aceita e põe em minúsculo", () => expect(validarEmail(" Ana@Empresa.COM.br ")).toBe("ana@empresa.com.br"));
  it("recusa formatos errados", () => {
    expect(validarEmail("ana@")).toBeNull();
    expect(validarEmail("ana empresa.com")).toBeNull();
    expect(validarEmail("ana@empresa")).toBeNull();
  });
});

describe("normalizarTelefoneBR", () => {
  it("celular com e sem formatação", () => {
    expect(normalizarTelefoneBR("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizarTelefoneBR("11987654321")).toBe("+5511987654321");
    expect(normalizarTelefoneBR("+55 11 98765 4321")).toBe("+5511987654321");
    expect(normalizarTelefoneBR("5511987654321")).toBe("+5511987654321");
  });
  it("fixo de 10 dígitos", () => expect(normalizarTelefoneBR("47 3333-4444")).toBe("+554733334444"));
  it("internacional com +", () => expect(normalizarTelefoneBR("+1 415 555 2671")).toBe("+14155552671"));
  it("recusa curto, DDD inválido e celular sem 9", () => {
    expect(normalizarTelefoneBR("98765-4321")).toBeNull();
    expect(normalizarTelefoneBR("(01) 98765-4321")).toBeNull();
    expect(normalizarTelefoneBR("11887654321")).toBeNull();
    expect(normalizarTelefoneBR("abc")).toBeNull();
  });
});

describe("validateCapture", () => {
  it("texto livre aceita qualquer coisa não vazia", () => {
    expect(validateCapture("text", " oi ")).toEqual({ ok: true, value: "oi" });
    expect(validateCapture("text", "  ").ok).toBe(false);
  });
  it("delegação por tipo", () => {
    expect(validateCapture("email", "x@y.com")).toEqual({ ok: true, value: "x@y.com" });
    expect(validateCapture("phone", "11 98765-4321")).toEqual({ ok: true, value: "+5511987654321" });
    expect(validateCapture("name", "1").ok).toBe(false);
  });
  it("campo personalizado usa a regra do campo", () => {
    const def = { type: "number" as const, label: "Consumo", options: [] };
    expect(validateCapture("custom", "1.500", def)).toEqual({ ok: true, value: 1500 });
    expect(validateCapture("custom", "muito", def).ok).toBe(false);
    expect(validateCapture("custom", "qualquer").ok).toBe(false); // sem definição
  });
});

describe("isSkip / variavelDaCaptura / mensagens", () => {
  it("palavras de pular sem acento e caixa", () => {
    expect(isSkip("Pular")).toBe(true);
    expect(isSkip("prefiro nao")).toBe(true);
    expect(isSkip("Não quero")).toBe(true);
    expect(isSkip("pular essa")).toBe(false);
    expect(isSkip(undefined)).toBe(false);
  });
  it("variável onde a resposta é guardada", () => {
    expect(variavelDaCaptura({ captureField: "name" })).toBe("nome");
    expect(variavelDaCaptura({ captureField: "email" })).toBe("email");
    expect(variavelDaCaptura({ captureField: "phone" })).toBe("telefone");
    expect(variavelDaCaptura({ captureField: "custom", captureCustomKey: "consumo" })).toBe("consumo");
    expect(variavelDaCaptura({ variableName: "opcao" })).toBe("opcao");
  });
  it("tem mensagem de erro para cada tipo", () => {
    for (const k of ["text", "name", "email", "phone", "custom"] as const) expect(MENSAGEM_DE_ERRO[k]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/capture-validation.test.ts` → FAIL, módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/capture-validation.ts`:
```ts
// Validação do que o cliente responde no bloco Captura. Puro e sem
// "server-only": o motor, a API de leads e a tela usam exatamente a mesma regra.
import { normalizarValor, type DefinicaoDeCampo } from "@/lib/custom-fields";

export type CaptureField = "text" | "name" | "email" | "phone" | "custom";

/** Id da porta "não respondeu certo" do bloco Captura. Mora aqui (e não em
 * flow-node.tsx, que é "use client") porque o motor no servidor também usa. */
export const SAIDA_INVALIDA = "invalido";

export const CAPTURE_FIELDS: { value: CaptureField; label: string }[] = [
  { value: "text", label: "Texto livre" },
  { value: "name", label: "Nome" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone / WhatsApp" },
  { value: "custom", label: "Campo do contato" },
];

export const MENSAGEM_DE_ERRO: Record<CaptureField, string> = {
  text: "Não entendi. Pode responder de novo?",
  name: "Pode me dizer seu nome?",
  email: "Esse e-mail não parece certo. Pode conferir e mandar de novo? Ex.: nome@empresa.com",
  phone: "Esse telefone não parece certo. Manda com DDD, por favor. Ex.: (11) 98765-4321",
  custom: "Não consegui entender essa resposta. Pode mandar de novo?",
};

/** Onde a resposta fica guardada. nome/email/telefone são os nomes que viram coluna do Contact. */
export function variavelDaCaptura(data: { captureField?: string; captureCustomKey?: string; variableName?: string }): string {
  switch (data.captureField) {
    case "name":
      return "nome";
    case "email":
      return "email";
    case "phone":
      return "telefone";
    case "custom":
      return data.captureCustomKey ?? "";
    default:
      return data.variableName ?? "";
  }
}

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const PULAR = new Set(["pular", "pula", "prefiro nao", "nao quero", "agora nao"]);

export function isSkip(text: string | undefined): boolean {
  return !!text && PULAR.has(semAcento(text));
}

export function validarNome(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 80) return null;
  if (!/\p{L}/u.test(t) || t.includes("@")) return null;
  return t;
}

export function validarEmail(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (t.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return null;
  return t;
}

export function normalizarTelefoneBR(raw: string): string | null {
  const t = (raw ?? "").trim();
  let d = t.replace(/\D/g, "");
  if (!d) return null;
  const internacional = t.startsWith("+") && !d.startsWith("55");
  if (internacional) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;

  d = d.replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || ddd % 10 === 0) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return `+55${d}`;
}

export type CaptureResult = { ok: true; value: unknown } | { ok: false };

export function validateCapture(
  field: CaptureField,
  raw: string,
  def?: Pick<DefinicaoDeCampo, "type" | "label" | "options">
): CaptureResult {
  const texto = (raw ?? "").trim();
  if (!texto) return { ok: false };
  switch (field) {
    case "name": {
      const v = validarNome(texto);
      return v ? { ok: true, value: v } : { ok: false };
    }
    case "email": {
      const v = validarEmail(texto);
      return v ? { ok: true, value: v } : { ok: false };
    }
    case "phone": {
      const v = normalizarTelefoneBR(texto);
      return v ? { ok: true, value: v } : { ok: false };
    }
    case "custom": {
      if (!def) return { ok: false };
      const r = normalizarValor(def, texto);
      return r.ok && r.valor !== null ? { ok: true, value: r.valor } : { ok: false };
    }
    default:
      return { ok: true, value: texto };
  }
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/capture-validation.test.ts` → todos passam.
- [ ] **Step 5: Commit local**
```bash
git add src/lib/capture-validation.ts src/lib/capture-validation.test.ts
git commit -m "feat: validação compartilhada de nome, e-mail, telefone e campo do contato"
```

---

### Task 2: Colunas de lead no Contact

**Files:**
- Modify: `prisma/schema.prisma` (`model Contact`)
- Create: `prisma/sql/2026-10-19-contact-lead.sql`

- [ ] **Step 1: Schema.** Em `model Contact`, depois de `lastSeenAt`:
```prisma
  // Lead = contato com etapa. null = ainda não é lead (só conversou).
  // Vira lead na 1ª captura validada de nome/e-mail/telefone/campo, ou
  // quando é criado pela tela/API de Leads. Ver src/lib/server/leads.ts.
  leadStage    String?
  leadAt       DateTime?
  leadAgentId  String?
  leadChannel  String?
```
E nos índices: `@@index([orgId, leadStage])`.

- [ ] **Step 2: Gerar e checar** — `npx prisma validate && npx prisma generate && npx tsc --noEmit` → válido, sem erro.

- [ ] **Step 3: SQL revisado.** Rodar `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` e conferir que, além do `DROP INDEX ...embedding_idx` conhecido, só aparecem as 4 colunas e o índice. Gravar **só elas** em `prisma/sql/2026-10-19-contact-lead.sql`:
```sql
ALTER TABLE "eva_studio_contacts" ADD COLUMN IF NOT EXISTS "leadStage" TEXT;
ALTER TABLE "eva_studio_contacts" ADD COLUMN IF NOT EXISTS "leadAt" TIMESTAMP(3);
ALTER TABLE "eva_studio_contacts" ADD COLUMN IF NOT EXISTS "leadAgentId" TEXT;
ALTER TABLE "eva_studio_contacts" ADD COLUMN IF NOT EXISTS "leadChannel" TEXT;
CREATE INDEX IF NOT EXISTS "eva_studio_contacts_orgId_leadStage_idx" ON "eva_studio_contacts"("orgId", "leadStage");
```

- [ ] **Step 4: Aplicar — PARAR e pedir ok ao Alfredo** (é produção). Depois do ok, rodar o arquivo numa transação (mesmo script da Fase 1) e conferir com `migrate diff` que sobrou só o índice vetorial.

- [ ] **Step 5: Commit local**
```bash
git add prisma/schema.prisma prisma/sql/2026-10-19-contact-lead.sql
git commit -m "feat: colunas de lead no contato"
```

---

### Task 3: Serviço de leads

**Files:**
- Create: `src/lib/server/leads.ts`, `src/lib/server/leads.test.ts`

- [ ] **Step 1: Teste**

`src/lib/server/leads.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { updateMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  agent: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/custom-fields", () => ({ normalizarCapturados: vi.fn(async () => undefined) }));

import { marcarComoLead, serializarLead, salvarLeadExterno, resolverIdDoLead } from "./leads";

beforeEach(() => vi.clearAllMocks());

describe("marcarComoLead", () => {
  it("só marca quem ainda não é lead (não rebaixa etapa)", async () => {
    await marcarComoLead("c1", { agentId: "a1", channel: "instagram" });
    expect(db.contact.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", leadStage: null },
      data: expect.objectContaining({ leadStage: "novo", leadAgentId: "a1", leadChannel: "instagram" }),
    });
  });
});

describe("serializarLead", () => {
  it("monta nome/e-mail/telefone, campos e a última conversa", () => {
    const lead = serializarLead({
      id: "c1",
      name: "Ana",
      email: "ana@x.com",
      phone: "+5511987654321",
      customFields: { consumo: 300 },
      leadStage: "qualificado",
      leadAt: new Date("2026-10-19T10:00:00Z"),
      leadAgentId: "a1",
      leadChannel: "website",
      updatedAt: new Date("2026-10-19T11:00:00Z"),
      conversations: [
        { id: "conv1", agentId: "a1", channel: "website", contactId: "site-123", agent: { name: "Vendedor" }, messages: [{ text: "oi", role: "contact" }] },
      ],
    });
    expect(lead).toMatchObject({
      id: "c1",
      name: "Ana",
      stage: "qualificado",
      agentId: "a1",
      agentName: "Vendedor",
      channel: "website",
      externalId: "site-123",
      conversationId: "conv1",
      fields: { nome: "Ana", email: "ana@x.com", telefone: "+5511987654321", consumo: 300 },
      lastMessage: { text: "oi", role: "contact" },
    });
  });
});

describe("salvarLeadExterno", () => {
  beforeEach(() => {
    db.agent.findFirst.mockResolvedValue({ id: "a1" });
    db.contact.findFirst.mockResolvedValue(null);
    db.contact.create.mockImplementation(async ({ data }) => ({ id: "novo", ...data }));
  });

  it("recusa e-mail e telefone inválidos com erro por campo", async () => {
    const r = await salvarLeadExterno("o1", { agentId: "a1", fields: { email: "ana@", telefone: "123" } }, "api");
    expect(r).toEqual({ error: "Dados inválidos.", fieldErrors: { email: "E-mail inválido.", telefone: "Telefone inválido." } });
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("agente de outra org: erro", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    expect(await salvarLeadExterno("o1", { agentId: "x", fields: {} }, "api")).toEqual({ error: "agentId não encontrado nessa organização." });
  });

  it("cria contato-lead normalizado; resto vira campo livre", async () => {
    const r = await salvarLeadExterno(
      "o1",
      { agentId: "a1", fields: { nome: " Ana ", email: "ANA@X.COM", telefone: "(11) 98765-4321", origem: "feira" }, stage: "contatado" },
      "api"
    );
    expect("contactId" in r && r.contactId).toBe("novo");
    expect(db.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "o1",
        name: "Ana",
        email: "ana@x.com",
        phone: "+5511987654321",
        customFields: { origem: "feira" },
        source: "api",
        leadStage: "contatado",
        leadAgentId: "a1",
      }),
    });
  });

  it("mesmo e-mail na org: atualiza a ficha em vez de duplicar", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c9", name: "Ana", email: "ana@x.com", phone: "", customFields: {}, leadStage: null });
    db.contact.update.mockResolvedValue({ id: "c9" });
    const r = await salvarLeadExterno("o1", { agentId: "a1", fields: { email: "ana@x.com" } }, "api");
    expect("contactId" in r && r.contactId).toBe("c9");
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("etapa inválida", async () => {
    expect(await salvarLeadExterno("o1", { agentId: "a1", fields: {}, stage: "xyz" }, "api")).toEqual({
      error: "stage precisa ser um de: novo, contatado, qualificado, ganho, perdido.",
    });
  });
});

describe("resolverIdDoLead", () => {
  it("id de contato da org", async () => {
    db.contact.findFirst.mockResolvedValueOnce({ id: "c1" });
    expect(await resolverIdDoLead("o1", "c1")).toBe("c1");
  });
  it("id antigo (conversa) resolve para o contato", async () => {
    db.contact.findFirst.mockResolvedValueOnce(null);
    db.conversation.findFirst.mockResolvedValueOnce({ contactRecordId: "c7" });
    expect(await resolverIdDoLead("o1", "conv-antiga")).toBe("c7");
    expect(db.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "conv-antiga", agent: { orgId: "o1" } } })
    );
  });
  it("nada encontrado", async () => {
    db.contact.findFirst.mockResolvedValueOnce(null);
    db.conversation.findFirst.mockResolvedValueOnce(null);
    expect(await resolverIdDoLead("o1", "zzz")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/server/leads.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/lib/server/leads.ts`:
```ts
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { normalizarCapturados } from "@/lib/server/custom-fields";
import { validarEmail, validarNome, normalizarTelefoneBR } from "@/lib/capture-validation";
import { mapCaptureField, normalizePhone } from "@/lib/server/contacts";

// Lead = Contact com leadStage. Todo lugar que lê ou grava lead (tela, API
// pública, motor) passa por aqui, pra regra ser uma só.

export const LEAD_STAGES = ["novo", "contatado", "qualificado", "ganho", "perdido"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const isLeadStage = (s: unknown): s is LeadStage => typeof s === "string" && (LEAD_STAGES as readonly string[]).includes(s);

export async function marcarComoLead(contactId: string, origem: { agentId: string; channel: string }): Promise<void> {
  await prisma.contact.updateMany({
    where: { id: contactId, leadStage: null },
    data: { leadStage: "novo", leadAt: new Date(), leadAgentId: origem.agentId, leadChannel: origem.channel },
  });
}

interface ContatoComConversa {
  id: string;
  name: string;
  email: string;
  phone: string;
  customFields: unknown;
  leadStage: string | null;
  leadAt: Date | null;
  leadAgentId: string | null;
  leadChannel: string | null;
  updatedAt: Date;
  conversations: {
    id: string;
    agentId: string;
    channel: string;
    contactId: string;
    agent: { name: string };
    messages: { text: string; role: string }[];
  }[];
}

export interface LeadDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  stage: string;
  agentId: string | null;
  agentName: string | null;
  channel: string | null;
  externalId: string | null;
  conversationId: string | null;
  fields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastMessage: { text: string; role: string } | null;
}

export const INCLUDE_LEAD = {
  conversations: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
    include: { agent: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" as const }, take: 1 } },
  },
};

export function serializarLead(c: ContatoComConversa): LeadDto {
  const conv = c.conversations[0];
  const custom = (c.customFields ?? {}) as Record<string, unknown>;
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    stage: c.leadStage ?? "novo",
    agentId: c.leadAgentId ?? conv?.agentId ?? null,
    agentName: conv?.agent.name ?? null,
    channel: c.leadChannel ?? conv?.channel ?? null,
    externalId: conv?.contactId ?? null,
    conversationId: conv?.id ?? null,
    fields: {
      ...(c.name ? { nome: c.name } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(c.phone ? { telefone: c.phone } : {}),
      ...custom,
    },
    createdAt: (c.leadAt ?? c.updatedAt).toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lastMessage: conv?.messages[0] ? { text: conv.messages[0].text, role: conv.messages[0].role } : null,
  };
}

export async function listarLeads(orgId: string, opts: { stage?: string | null; limit?: number } = {}): Promise<LeadDto[]> {
  const rows = await prisma.contact.findMany({
    where: { orgId, leadStage: opts.stage && isLeadStage(opts.stage) ? opts.stage : { not: null } },
    include: INCLUDE_LEAD,
    orderBy: { leadAt: "desc" },
    take: Math.min(Math.max(opts.limit ?? 200, 1), 500),
  });
  return rows.map((r) => serializarLead(r as unknown as ContatoComConversa));
}

export async function buscarLead(orgId: string, contactId: string): Promise<LeadDto | null> {
  const row = await prisma.contact.findFirst({ where: { id: contactId, orgId, leadStage: { not: null } }, include: INCLUDE_LEAD });
  return row ? serializarLead(row as unknown as ContatoComConversa) : null;
}

/** id de contato, ou id antigo de conversa (API v1 antes da Fase 2) → id do contato. */
export async function resolverIdDoLead(orgId: string, id: string): Promise<string | null> {
  const contato = await prisma.contact.findFirst({ where: { id, orgId }, select: { id: true } });
  if (contato) return contato.id;
  const conversa = await prisma.conversation.findFirst({
    where: { id, agent: { orgId } },
    select: { contactRecordId: true },
  });
  return conversa?.contactRecordId ?? null;
}

export type ResultadoLead = { contactId: string } | { error: string; fieldErrors?: Record<string, string> };

/**
 * Lead que chega de fora do fluxo (tela, API pública, n8n): valida, deduplica
 * por e-mail/telefone na org e marca como lead. `fields` aceita nome/email/
 * telefone (e sinônimos) e qualquer outro campo, que vira campo livre.
 */
export async function salvarLeadExterno(
  orgId: string,
  input: { agentId: string; fields: Record<string, unknown>; stage?: unknown },
  source: "api" | "manual"
): Promise<ResultadoLead> {
  if (input.stage !== undefined && !isLeadStage(input.stage)) {
    return { error: `stage precisa ser um de: ${LEAD_STAGES.join(", ")}.` };
  }
  const agent = await prisma.agent.findFirst({ where: { id: input.agentId, orgId }, select: { id: true } });
  if (!agent) return { error: "agentId não encontrado nessa organização." };

  const base: { name?: string; email?: string; phone?: string } = {};
  const custom: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};

  for (const [key, bruto] of Object.entries(input.fields ?? {})) {
    if (key.startsWith("__") || bruto === undefined || bruto === null || bruto === "") continue;
    const alvo = mapCaptureField(key);
    const texto = String(bruto);
    if (alvo === "name") {
      const v = validarNome(texto);
      if (v) base.name = v;
      else fieldErrors[key] = "Nome inválido.";
    } else if (alvo === "email") {
      const v = validarEmail(texto);
      if (v) base.email = v;
      else fieldErrors[key] = "E-mail inválido.";
    } else if (alvo === "phone") {
      const v = normalizarTelefoneBR(texto);
      if (v) base.phone = v;
      else fieldErrors[key] = "Telefone inválido.";
    } else {
      custom[key] = bruto;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { error: "Dados inválidos.", fieldErrors };

  await normalizarCapturados(orgId, custom);
  const stage = (input.stage as string | undefined) ?? "novo";
  const telefone = normalizePhone(base.phone ?? "");

  const existente =
    base.email || telefone.length >= 10
      ? await prisma.contact.findFirst({
          where: {
            orgId,
            OR: [
              ...(base.email ? [{ email: { equals: base.email, mode: "insensitive" as const } }] : []),
              ...(telefone.length >= 10 ? [{ phone: { contains: telefone.slice(-10) } }] : []),
            ],
          },
        })
      : null;

  if (existente) {
    await prisma.contact.update({
      where: { id: existente.id },
      data: {
        name: base.name || existente.name,
        email: base.email || existente.email,
        phone: base.phone || existente.phone,
        customFields: { ...((existente.customFields ?? {}) as Record<string, unknown>), ...custom } as Prisma.InputJsonValue,
        ...(existente.leadStage
          ? input.stage !== undefined
            ? { leadStage: stage }
            : {}
          : { leadStage: stage, leadAt: new Date(), leadAgentId: input.agentId, leadChannel: source }),
      },
    });
    return { contactId: existente.id };
  }

  const criado = await prisma.contact.create({
    data: {
      orgId,
      name: base.name ?? "",
      email: base.email ?? "",
      phone: base.phone ?? "",
      customFields: custom as Prisma.InputJsonValue,
      source,
      leadStage: stage,
      leadAt: new Date(),
      leadAgentId: input.agentId,
      leadChannel: source,
    },
  });
  return { contactId: criado.id };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/lib/server/leads.test.ts` → todos passam. `npx tsc --noEmit` sem erro.
- [ ] **Step 5: Commit local** — `git commit -m "feat: serviço de leads sobre o contato"`.

---

### Task 4: Tipos do bloco Captura e saída "não respondeu certo"

**Files:**
- Modify: `src/components/agent-studio/builder/flow-node.tsx`

- [ ] **Step 1: Campos em `FlowNodeData`** (junto de `variableName?`):
```ts
  // Bloco Captura: o que a resposta é. "text" (ou vazio) = comportamento
  // antigo, guarda em variableName sem validar.
  captureField?: "text" | "name" | "email" | "phone" | "custom";
  captureCustomKey?: string; // chave do CustomField de contato quando captureField = "custom"
  captureRequired?: boolean; // false = aceita "pular"
  captureMaxRetries?: number; // novas tentativas antes de desistir (padrão 2)
  captureErrorMessage?: string; // vazio = mensagem padrão do tipo
```

- [ ] **Step 2: Saída no canvas.** Importar `import { SAIDA_INVALIDA } from "@/lib/capture-validation";` e criar duas portas quando a captura valida (sem botões).
Antes do `return (` do componente, junto de `isMenu`:
```ts
  const validaResposta = data.iconKey === "capture" && !isMenu && !!data.captureField && data.captureField !== "text";
```
No ternário das saídas, entre `isMenu ? (...)` e o caso padrão, inserir:
```tsx
      ) : validaResposta ? (
        <>
          <div className="pointer-events-none mt-3 flex flex-col gap-4 text-[10px] font-medium">
            <span className="text-emerald-400">Respondeu</span>
            <span className="text-amber-400">Não respondeu certo</span>
          </div>
          <Handle type="source" position={Position.Right} style={{ top: "30%" }} className={cn(HANDLE_DOT, "!bg-emerald-400")} />
          <Handle id={SAIDA_INVALIDA} type="source" position={Position.Right} style={{ top: "70%" }} className={cn(HANDLE_DOT, "!bg-amber-400")} />
        </>
```
(A saída "Respondeu" fica **sem id** de propósito: arestas já existentes desse bloco continuam ligadas nela.)

- [ ] **Step 3:** `npx tsc --noEmit` → sem erro. Commit local: `git commit -m "feat: bloco Captura com tipo e saída de resposta inválida"`.

---

### Task 5: Captura validada no motor

**Files:**
- Modify: `src/lib/server/flow-engine.ts`
- Create: `src/lib/server/flow-engine.capture.test.ts`

- [ ] **Step 1: Teste** (mesma técnica de `flow-engine.triggers.test.ts`: Prisma e efeitos simulados)

`src/lib/server/flow-engine.capture.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findUnique: vi.fn() },
  agentFlow: { findUnique: vi.fn() },
  agentTrigger: { findMany: vi.fn(async () => []), update: vi.fn() },
  conversation: { upsert: vi.fn(), update: vi.fn() },
  flowExecution: { create: vi.fn() },
}));
const leads = vi.hoisted(() => ({ marcarComoLead: vi.fn() }));
const defs = vi.hoisted(() => ({ carregarDefinicoes: vi.fn(async () => []) }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/inbox", () => ({ registrarMensagens: vi.fn(), agentePausado: () => false }));
vi.mock("@/lib/server/contacts", () => ({ syncContactFromConversation: vi.fn(async () => "contato-1") }));
vi.mock("@/lib/server/sequences", () => ({ stopEnrollmentsOnReply: vi.fn() }));
vi.mock("@/lib/server/outbound", () => ({ registerBroadcastReply: vi.fn() }));
vi.mock("@/lib/server/leads", () => leads);
vi.mock("@/lib/server/custom-fields", () => defs);

import { advanceConversation } from "./flow-engine";

function fluxo(capture: Record<string, unknown>, comSaidaInvalida = true) {
  return {
    agentId: "a1",
    nodes: [
      { id: "start", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
      { id: "cap", position: { x: 0, y: 0 }, data: { iconKey: "capture", label: "Pergunta", detail: "Qual seu e-mail?", ...capture } },
      { id: "ok", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Ok", detail: "Valeu, {email}!" } },
      { id: "falhou", position: { x: 0, y: 0 }, data: { iconKey: "message", label: "Falhou", detail: "Sem problema, seguimos." } },
    ],
    edges: [
      { id: "e1", source: "start", target: "cap" },
      ...(comSaidaInvalida ? [{ id: "e3", source: "cap", sourceHandle: "invalido", target: "falhou" }] : []),
      { id: "e2", source: "cap", target: "ok" },
    ],
  };
}

const base = { agentId: "a1", channel: "instagram", contactId: "IG1" };
const parado = (vars: Record<string, unknown> = {}) => ({
  id: "c1", status: "active", currentNodeId: "cap", variables: vars, lastContactMessageAt: null, contactRecordId: null,
});
const gravado = () => db.conversation.update.mock.calls.at(-1)?.[0]?.data;

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findUnique.mockResolvedValue({ id: "a1", orgId: "o1" });
  db.conversation.upsert.mockResolvedValue(parado());
});

describe("Captura validada", () => {
  it("e-mail válido: guarda normalizado, segue pela saída padrão e marca lead", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email" }));
    const r = await advanceConversation({ ...base, text: " ANA@X.COM " });
    expect(r.messages.map((m) => m.text)).toEqual(["Valeu, ana@x.com!"]);
    expect(gravado().variables).toMatchObject({ email: "ana@x.com" });
    expect(leads.marcarComoLead).toHaveBeenCalledWith("contato-1", { agentId: "a1", channel: "instagram" });
  });

  it("e-mail inválido: pede de novo com a mensagem do tipo e conta a tentativa", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email" }));
    const r = await advanceConversation({ ...base, text: "ana@" });
    expect(r.messages[0].text).toContain("e-mail não parece certo");
    expect(gravado()).toMatchObject({ currentNodeId: "cap", variables: { __capture_tries: 1 } });
    expect(leads.marcarComoLead).not.toHaveBeenCalled();
  });

  it("mensagem de erro personalizada", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email", captureErrorMessage: "Manda um e-mail de verdade 🙂" }));
    const r = await advanceConversation({ ...base, text: "nada" });
    expect(r.messages[0].text).toBe("Manda um e-mail de verdade 🙂");
  });

  it("estourou as tentativas: sai pela saída 'não respondeu certo' sem guardar", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email", captureMaxRetries: 2 }));
    db.conversation.upsert.mockResolvedValue(parado({ __capture_tries: 2 }));
    const r = await advanceConversation({ ...base, text: "ainda errado" });
    expect(r.messages.map((m) => m.text)).toEqual(["Sem problema, seguimos."]);
    expect(gravado().variables).not.toHaveProperty("email");
    expect(gravado().variables).not.toHaveProperty("__capture_tries");
  });

  it("estourou e o bloco não tem saída inválida: segue pela padrão sem guardar", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email", captureMaxRetries: 0 }, false));
    const r = await advanceConversation({ ...base, text: "errado" });
    // interpolate troca variável ausente por "" (flow-engine.ts:83)
    expect(r.messages.map((m) => m.text)).toEqual(["Valeu, !"]);
  });

  it("opcional + 'pular': segue pela padrão sem guardar e sem marcar lead", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email", captureRequired: false }));
    await advanceConversation({ ...base, text: "Pular" });
    expect(gravado().variables).not.toHaveProperty("email");
    expect(leads.marcarComoLead).not.toHaveBeenCalled();
  });

  it("obrigatório: 'pular' é tratado como resposta inválida", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "email" }));
    const r = await advanceConversation({ ...base, text: "pular" });
    expect(gravado().currentNodeId).toBe("cap");
    expect(r.messages[0].text).toContain("e-mail");
  });

  it("campo do contato usa a definição do campo", async () => {
    defs.carregarDefinicoes.mockResolvedValue([{ key: "consumo", type: "number", label: "Consumo", options: [] }]);
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ captureField: "custom", captureCustomKey: "consumo" }));
    await advanceConversation({ ...base, text: "1.200" });
    expect(gravado().variables).toMatchObject({ consumo: 1200 });
    expect(defs.carregarDefinicoes).toHaveBeenCalledWith("o1", "contact");
  });

  it("texto livre (padrão antigo) não muda nada", async () => {
    db.agentFlow.findUnique.mockResolvedValue(fluxo({ variableName: "resposta" }));
    await advanceConversation({ ...base, text: "qualquer coisa" });
    expect(gravado().variables).toMatchObject({ resposta: "qualquer coisa" });
    expect(leads.marcarComoLead).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/server/flow-engine.capture.test.ts`.

- [ ] **Step 3: Implementar.**

Imports no topo:
```ts
import {
  validateCapture,
  isSkip,
  variavelDaCaptura,
  MENSAGEM_DE_ERRO,
  SAIDA_INVALIDA,
  type CaptureField,
} from "@/lib/capture-validation";
import { marcarComoLead } from "@/lib/server/leads";
```

Helper ao lado de `nextNodeId`:
```ts
/** Saída "normal" de um bloco: a aresta sem nome; nunca a de resposta inválida. */
function nextDefaultNodeId(edges: Edge[], fromId: string): string | null {
  const semNome = edges.find((e) => e.source === fromId && e.sourceHandle == null);
  const qualquer = edges.find((e) => e.source === fromId && e.sourceHandle !== SAIDA_INVALIDA);
  return (semNome ?? qualquer)?.target ?? null;
}
```

`syncContact` passa a devolver o id (troca `Promise<void>` por `Promise<string | null>`, retorna `contactId` no `try` e `null` no `catch`). Em `advanceConversation`, junto das outras `let`:
```ts
  let virouLead = false;
```
No `finish()`, trocar `await syncContact(conversation.id, variables, isGenuineInbound);` por:
```ts
    const contatoId = await syncContact(conversation.id, variables, isGenuineInbound);
    if (virouLead && contatoId) {
      await marcarComoLead(contatoId, { agentId: input.agentId, channel: input.channel }).catch((e) =>
        console.error("[flow-engine] falha ao marcar lead", e)
      );
    }
```

No ramo `parkedNode?.data.iconKey === "capture"`, logo depois de `const options = parkedNode.data.options ?? [];`, inserir:
```ts
    const campo = (parkedNode.data.captureField ?? "text") as CaptureField;
    if (options.length === 0 && campo !== "text") {
      const tentativas = Number(variables.__capture_tries ?? 0);
      const opcional = parkedNode.data.captureRequired === false;
      if (opcional && isSkip(input.text)) {
        delete variables.__capture_tries;
        currentId = nextDefaultNodeId(edges, parkedNode.id);
      } else {
        const def =
          campo === "custom"
            ? (await carregarDefinicoes(agent.orgId, "contact")).find((d) => d.key === parkedNode.data.captureCustomKey)
            : undefined;
        const r = validateCapture(campo, input.text ?? "", def);
        if (r.ok) {
          setVar(variables, variavelDaCaptura(parkedNode.data), r.value);
          delete variables.__capture_tries;
          virouLead = true;
          currentId = nextDefaultNodeId(edges, parkedNode.id);
        } else if (tentativas < (parkedNode.data.captureMaxRetries ?? 2)) {
          variables.__capture_tries = tentativas + 1;
          messages.push({ text: interpolate(parkedNode.data.captureErrorMessage || MENSAGEM_DE_ERRO[campo], variables) });
          pushStep(parkedNode, { error: "resposta inválida" });
          currentId = parkedNode.id;
          return finish();
        } else {
          delete variables.__capture_tries;
          pushStep(parkedNode, { error: "desistiu após tentativas" });
          currentId = nextNodeId(edges, parkedNode.id, SAIDA_INVALIDA) ?? nextDefaultNodeId(edges, parkedNode.id);
        }
      }
    } else {
```
e fechar esse `else {` em volta do código antigo do ramo de Captura (o que trata botões e texto livre), terminando com `}` antes do `} else if (parkedNode?.data.iconKey === "agent")`.
> `carregarDefinicoes` já é importado no topo do motor (`@/lib/server/custom-fields`). Conferir assinatura: `carregarDefinicoes(orgId, entity, pipelineId?)`.

- [ ] **Step 4: Rodar** — `npx vitest run src/lib/server/flow-engine.capture.test.ts src/lib/server/flow-engine.triggers.test.ts` → todos passam (os de gatilho continuam verdes). `npx tsc --noEmit`.
- [ ] **Step 5: Prova de que o teste pega erro** — reverter `flow-engine.ts` para o commit anterior, rodar o teste (tem que falhar), restaurar.
- [ ] **Step 6: Commit local** — `git commit -m "feat: Captura valida nome, e-mail, telefone e campo do contato, com novas tentativas"`.

---

### Task 6: Configuração do bloco Captura na tela

**Files:**
- Modify: `src/components/agent-studio/builder/block-validation.ts`, `src/components/agent-studio/builder/node-inspector.tsx`

- [ ] **Step 1: Aviso do bloco.** Em `validateNode`, `case "capture":`
```ts
    case "capture": {
      if (vazio(data.detail)) return "Escreva a pergunta.";
      const campo = data.captureField ?? "text";
      if (campo === "custom" && vazio(data.captureCustomKey)) return "Escolha qual campo do contato a resposta preenche.";
      if (campo === "text" && vazio(data.variableName)) return "Escolha em qual variável guardar a resposta.";
      return null;
    }
```

- [ ] **Step 2: Inspetor.** Substituir o bloco `{iconKey === "capture" && (...)}` (hoje em `node-inspector.tsx:242-298`) por um que tenha, nesta ordem:
  1. **"A resposta é"** — `<Select id="node-capture-field">` com `CAPTURE_FIELDS` (`@/lib/capture-validation`). Ao trocar para outro tipo que não "Texto livre", limpar `options` (botões não combinam com validação).
  2. Se "Texto livre": o `Input` de `variableName` e o editor de botões que já existem (copiar sem mudar).
  3. Se "Campo do contato": `<Select id="node-capture-custom">` com os campos de `GET /api/custom-fields?entity=contact` (carregar uma vez no inspetor com `useEffect`; lista vazia → texto "Crie campos em Contatos → Campos personalizados" com link `/negocios/configurar`).
  4. Se Nome/E-mail/Telefone: linha de ajuda "Guarda em {nome|email|telefone} e preenche a ficha do contato." usando `variavelDaCaptura`.
  5. Para todo tipo que não "Texto livre":
     - `Switch` "Obrigatório" (`captureRequired`, padrão ligado). Desligado mostra ajuda: "A pessoa pode responder “pular”."
     - `Select` "Tentar de novo" 0–5 vezes (`captureMaxRetries`, padrão 2).
     - `Input` "Mensagem quando a resposta não serve" (`captureErrorMessage`), placeholder = `MENSAGEM_DE_ERRO[tipo]`.
     - Ajuda: "Se não acertar depois das tentativas, segue pela saída “Não respondeu certo”. Sem ela ligada, segue pela normal."
  Usar os mesmos componentes do arquivo (`Label`, `Input`, `Select`) e `Switch` de `@/components/ui/switch`.

- [ ] **Step 3: Verificação no navegador** (`npm run dev`, agente "teste" → Editar o fluxo):
  - criar bloco Captura → aviso "Escolha em qual variável…";
  - trocar para E-mail → aviso some, aparecem as duas saídas no canvas;
  - escolher "Campo do contato" sem campos → aparece a orientação;
  - salvar fluxo, recarregar, conferir que a configuração voltou igual.
- [ ] **Step 4:** `npx tsc --noEmit && npx eslint src/components/agent-studio/builder` sem erro novo. Commit local.

---

### Task 7: API interna de Leads

**Files:**
- Rewrite: `src/app/api/leads/route.ts`, `src/app/api/leads/[id]/route.ts`

- [x] **Step 1: Teste de rota** (`src/app/api/leads/route.test.ts`, mesmo padrão de `triggers/route.test.ts`): sem sessão → 401; GET chama `listarLeads(orgId)`; POST manual chama `salvarLeadExterno(orgId, {agentId, fields: variables, stage: leadStage}, "manual")` e devolve `{ id }`; POST com `X-Internal-Secret` exige `agentId` existente e usa o `orgId` do agente; erro de validação → 400 com `fieldErrors`; PATCH com etapa inválida → 400; DELETE tira da lista (`leadStage: null`) e **não** apaga o contato; contato de outra org → 404.

- [x] **Step 2: Implementar.**

`src/app/api/leads/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";
import { listarLeads, salvarLeadExterno } from "@/lib/server/leads";

// Leads = contatos com etapa (src/lib/server/leads.ts). Antes eram as conversas
// do canal "website"; o formato da resposta foi mantido o mais parecido possível.
export async function GET() {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ leads: await listarLeads(orgId) });
}

// Sessão (botão "+ Novo lead") ou X-Internal-Secret (n8n, formulário externo).
export async function POST(request: Request) {
  const expected = process.env.INTERNAL_API_SECRET;
  const viaSecret = !!expected && timingSafeEqualStr(request.headers.get("x-internal-secret"), expected);

  const body = (await request.json().catch(() => null)) as
    | { agentId?: string; variables?: Record<string, unknown>; leadStage?: string }
    | null;
  if (!body?.agentId || !body.variables || typeof body.variables !== "object" || Array.isArray(body.variables)) {
    return NextResponse.json({ error: "agentId e variables são obrigatórios." }, { status: 400 });
  }

  let orgId: string | null;
  if (viaSecret) {
    const agent = await prisma.agent.findUnique({ where: { id: body.agentId }, select: { orgId: true } });
    orgId = agent?.orgId ?? null;
    if (!orgId) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  } else {
    orgId = await requireOrgId();
    if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const r = await salvarLeadExterno(
    orgId,
    { agentId: body.agentId, fields: body.variables, stage: body.leadStage || undefined },
    viaSecret ? "api" : "manual"
  );
  if ("error" in r) return NextResponse.json(r, { status: r.error.includes("agentId") ? 404 : 400 });
  return NextResponse.json({ id: r.contactId });
}
```

`src/app/api/leads/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { isLeadStage } from "@/lib/server/leads";

type Params = { params: Promise<{ id: string }> };

async function leadDaOrg(id: string, orgId: string) {
  return prisma.contact.findFirst({ where: { id, orgId, leadStage: { not: null } }, select: { id: true } });
}

export async function PATCH(request: Request, { params }: Params) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  if (!(await leadDaOrg(id, orgId))) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const { leadStage } = (await request.json().catch(() => ({}))) as { leadStage?: unknown };
  if (!isLeadStage(leadStage)) return NextResponse.json({ error: "leadStage inválido." }, { status: 400 });

  await prisma.contact.update({ where: { id }, data: { leadStage } });
  return NextResponse.json({ ok: true });
}

// Tira da lista de leads. A pessoa (contato, conversas, negócios) continua.
export async function DELETE(_request: Request, { params }: Params) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  if (!(await leadDaOrg(id, orgId))) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  await prisma.contact.update({ where: { id }, data: { leadStage: null } });
  return NextResponse.json({ ok: true });
}
```

- [x] **Step 3:** testes passam, `tsc` limpo. (Commit local pendente — aguardando o Alfredo.)

---

### Task 8: API pública `/api/v1/leads`

**Files:**
- Rewrite: `src/app/api/v1/leads/route.ts`, `src/app/api/v1/leads/[id]/route.ts`
- Create: `src/app/api/v1/leads/route.test.ts`

Formato público (mantém as chaves antigas e acrescenta as novas):
```ts
function publico(l: LeadDto) {
  return {
    id: l.id,
    agentId: l.agentId,
    contactId: l.externalId,
    stage: l.stage,
    fields: l.fields,
    name: l.name,
    email: l.email,
    phone: l.phone,
    channel: l.channel,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}
```

- [x] **Step 1: Teste:** chave inválida → 401; limite de requisições → 429; `GET ?stage=` repassa etapa válida e ignora inválida; `POST` com e-mail inválido → 400 `{ error, fieldErrors }`; `POST` ok → 201 com `data.id` = id do contato; `GET /:id` com id **antigo de conversa** resolve via `resolverIdDoLead` e devolve o lead; `PATCH /:id` com `fields.email` inválido → 400; `PATCH` ok mescla `fields` no `customFields`/colunas; `DELETE` → `leadStage: null` e resposta `{ data: { removed: true } }`.

- [x] **Step 2: Implementar** — mesma autenticação/limite de hoje (`requireApiKeyOrgId`, `checkRateLimit(\`apikey:${orgId}\`, 120, 60)`); listagem por `listarLeads(orgId, { stage, limit })`; criação por `salvarLeadExterno(orgId, { agentId, fields, stage }, "api")` (o `contactId` do corpo antigo é ignorado); `/:id` sempre passa por `resolverIdDoLead` e depois `buscarLead`; `PATCH` reaproveita `salvarLeadExterno` só para validar/normalizar os `fields` (extrair a parte de validação para `validarCamposDeLead(fields)` em `leads.ts` e usar nas duas funções — com teste).

- [x] **Step 3:** testes, `tsc`. (Commit local pendente — aguardando o Alfredo.)

---

### Task 9: Página Leads lendo o formato novo

**Files:**
- Modify: `src/app/(app)/leads/page.tsx`

- [x] **Step 1: Tipo** — `interface Lead` passa a ser o `LeadDto` (copiar os campos; não importar de `server`).
- [x] **Step 2: Nome/e-mail/telefone** — `leadName = lead.name || pick(lead.fields, [...]) || "Sem nome"`; `leadEmail = lead.email || pick(...)`; `leadPhone = lead.phone || pick(...)`; trocar `lead.variables` por `lead.fields` no arquivo todo.
- [x] **Step 3: Origem** — `leadSource` passa a olhar `lead.channel` (`website` + `externalId` com `site-` = chat; `landing_` = formulário; `api`/`manual` = Manual/API; `instagram`, `whatsapp_meta`, `whatsapp_qr`, `messenger`, `telegram` ganham rótulo próprio). Atualizar `SOURCE_LABEL`/`SOURCE_ICON` e o filtro de origem.
- [x] **Step 4: Conversa e execuções** — mensagens: `fetch(\`/api/conversations/${lead.conversationId}/messages\`)` só se houver `conversationId` (senão mostrar "Sem conversa — lead criado pela tela ou API."). Execuções: `conversationId = \`${lead.channel}:${lead.externalId}\`` (sem fixar `website:`).
- [x] **Step 5: Ficha** — no cabeçalho do detalhe, link "Abrir ficha" → `/contatos?abrir=${lead.id}`; nos dados, mostrar Nome/E-mail/Telefone primeiro e depois os campos livres.
- [x] **Step 6: Excluir** — botão e confirmação passam a dizer "Remover dos leads" e explicar que o contato continua em Contatos.
- [x] **Step 7: Novo lead (modal)** — mostrar o erro por campo que vem em `fieldErrors`.
- [ ] **Step 8: Navegador:** lista carrega; mudar etapa arrastando; abrir detalhe; "Abrir ficha" abre o contato certo; remover dos leads some da lista e o contato continua em Contatos; criar lead com e-mail inválido mostra o erro no campo.
- [x] **Step 9:** `tsc`, lint sem erro novo (os 3 `set-state-in-effect` da página já existiam). (Commit local pendente.)

#### Como ficou (Tasks 7–9, 19/10/2026) — diferenças em relação ao plano

- **Permissões (A3):** `/api/leads` GET e `/api/leads/:id` GET usam `requirePermission("read")`; POST (por sessão), PATCH e DELETE usam `requirePermission("contacts:manage")` (viewer → 403). POST com `X-Internal-Secret` continua sem sessão, org vem do agente.
- **Corpo:** `fields`/`stage` são os nomes novos; `variables`/`leadStage` continuam aceitos como apelido (rota interna e v1). `contactId` (formato antigo) é aceito se for texto e ignorado; não-texto → 400. JSON inválido → 400 (`lerCorpo`/`JSON_INVALIDO`). Stage fora de `LEAD_STAGES` → 400.
- **`leads.ts`:** `ResultadoLead` de erro agora carrega `status` (400/404); validação extraída para `validarCamposDeLead`; novos `atualizarLead`, `removerDosLeads`, `serializarLeadPublico`; `LeadDto` ganhou `conversationChannel` (canal da última conversa, usado para achar as execuções do fluxo).
- **A7 — dedupe por telefone:** antes `contains telefone.slice(-10)` juntava DDDs diferentes. Agora o e-mail é procurado primeiro; o telefone pré-filtra por `contains` dos 4 últimos dígitos e compara o número inteiro com `normalizePhone` (sem 55). `11977776666` ≠ `21977776666`.
- **`GET /api/leads/:id`** foi acrescentado (antes não existia). PATCH aceita `fields` além de `stage` e devolve `{ ok: true, lead }`.
- **v1 `GET ?stage=` inválido → 400** (o plano dizia "ignora"; ignorar devolveria todos os leads, o que é pior para quem filtra).
- **v1 `DELETE`** responde `{ data: { deleted: true, removed: true } }` — `deleted` mantido por compatibilidade com a resposta antiga.
- **v1 resposta:** chaves antigas (`id`, `agentId`, `contactId`, `stage`, `fields`, `createdAt`, `updatedAt`) + `name`, `email`, `phone`, `channel`, `conversationId`. Mudanças de significado: `id` é o id do **contato** (ids antigos de conversa ainda resolvem em GET/PATCH/DELETE `/:id`); `contactId` é o id externo da última conversa e pode ser `null` (lead criado pela tela/API sem conversa).
- **Página:** PATCH/DELETE otimistas com rollback e aviso de erro; remoção em lote também desfaz os que falharem.
- **Pendente:** Step 8 (navegador) não foi feito; leads antigos (conversas `website` com `leadStage`) só aparecem depois do backfill da Task 10.

---

### Task 10: Backfill dos leads antigos (produção — só com ok)

**Files:**
- Create: `scripts/backfill-leads.mjs`

O que faz: para cada conversa `website` que já tem `contactRecordId`, leva a etapa (`leadStage ?? 'novo'`), `createdAt`, `agentId` para o contato **se o contato ainda não for lead**. Conversas `website` sem contato ligado só entram no relatório (viram contato quando a pessoa falar de novo, pelo motor).

- [ ] **Step 1: Script** (`pg` puro, lê `DIRECT_URL` de `.env.local`, **dry-run por padrão**, `--aplicar` para gravar, tudo numa transação):
```js
import { config } from "dotenv";
import pg from "pg";
config({ path: ".env.local" });

const aplicar = process.argv.includes("--aplicar");
const client = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN");
  const alvo = await client.query(`
    SELECT DISTINCT ON (c."contactRecordId")
      c."contactRecordId" AS contato, coalesce(c."leadStage", 'novo') AS etapa, c."createdAt" AS em, c."agentId" AS agente
    FROM eva_studio_conversations c
    JOIN eva_studio_contacts ct ON ct.id = c."contactRecordId"
    WHERE c.channel = 'website' AND ct."leadStage" IS NULL
    ORDER BY c."contactRecordId", c."updatedAt" DESC`);
  const semContato = await client.query(
    `SELECT count(*)::int n FROM eva_studio_conversations WHERE channel = 'website' AND "contactRecordId" IS NULL`
  );
  console.log({ contatosQueViramLead: alvo.rowCount, conversasSemContato: semContato.rows[0].n, modo: aplicar ? "APLICAR" : "simulação" });
  if (aplicar) {
    for (const r of alvo.rows) {
      await client.query(
        `UPDATE eva_studio_contacts SET "leadStage" = $1, "leadAt" = $2, "leadAgentId" = $3, "leadChannel" = 'website'
         WHERE id = $4 AND "leadStage" IS NULL`,
        [r.etapa, r.em, r.agente, r.contato]
      );
    }
  }
  await client.query(aplicar ? "COMMIT" : "ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
```
- [ ] **Step 2: Simulação** — `node scripts/backfill-leads.mjs` → mostrar os números ao Alfredo.
- [ ] **Step 3: Aplicar — só com ok explícito** — `node scripts/backfill-leads.mjs --aplicar`; conferir a página Leads.
- [ ] **Step 4:** commit local do script.

---

### Task 11: Documentação

- [ ] `docs/CHATBOT_ENGINE.md` §12 (Widget + Leads): lead = contato com etapa; quando vira lead; remover ≠ apagar; contrato da API v1 (campos novos, id de contato, compatibilidade com id antigo, `DELETE` remove da lista).
- [ ] §3 (blocos): bloco Captura com tipos, obrigatório/opcional ("pular"), tentativas, mensagem de erro, saída "Não respondeu certo", `__capture_tries`.
- [ ] Texto do `ApiInfoModal` em `leads/page.tsx` com o formato novo.
- [ ] Commit local.

---

### Task 12: Verificação final e roteiro

- [ ] `npm test && npx tsc --noEmit && npm run build` (com o dev parado) — tudo verde; lint sem erro novo nos arquivos da branch.
- [ ] Roteiro no app local (agente "teste", Playground):

| # | Ação | Esperado |
|---|---|---|
| 1 | Fluxo: Captura "E-mail" → Mensagem "Valeu, {email}" | — |
| 2 | Responder `ana@` | Pede de novo com a mensagem de e-mail |
| 3 | Responder `ANA@EMPRESA.COM` | "Valeu, ana@empresa.com"; aparece em Leads com o e-mail |
| 4 | Captura "Telefone" e responder `(11) 98765-4321` | Ficha com `+5511987654321` |
| 5 | Errar 3 vezes com tentativas = 2 e saída inválida ligada | Segue pela saída "Não respondeu certo" |
| 6 | Bloco opcional + "pular" | Segue sem guardar e sem virar lead |
| 7 | Campo do contato "Consumo" (número) + `1.200` | Ficha com Consumo 1200 |
| 8 | Leads → Abrir ficha | Abre o contato certo |
| 9 | Leads → Remover dos leads | Some da lista; continua em Contatos |
| 10 | `POST /api/v1/leads` com e-mail inválido | 400 com `fieldErrors.email` |
| 11 | `GET /api/v1/leads/{id antigo de conversa}` | Devolve o lead do contato ligado |

- [ ] Limpar o que foi criado no teste (contatos/leads de teste no agente "teste").
- [ ] **Não** fazer push/PR — esperar o Alfredo.
