# Dashboards do funil — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dashboard montável ganha cartões de funil de verdade — conversão etapa a etapa, tempo em cada etapa, negócios parados, motivos de perda, taxa de ganho e ciclo de venda — e um botão "Painel do funil" que monta tudo de uma vez.

**Architecture:** Hoje o negócio só sabe a etapa atual e desde quando está nela (`stageSince`); sem histórico não existe conversão entre etapas nem tempo médio por etapa. Primeiro passa a existir um **registro de mudança de etapa** (`DealStageEvent`), gravado num lugar só (`registrarMudancaDeEtapa`, chamado por `createDeal` e `moveDealStage`, que já são o único caminho da tela, da API e do fluxo). As contas do funil ficam numa função pura testada (`src/lib/funil-metricas.ts`); `src/lib/server/analytics.ts` só busca as linhas e chama essas funções; o catálogo de fontes ganha as fontes novas; o dashboard ganha o desenho de funil.

**Tech Stack:** Next.js 16, Prisma 7 + Postgres (Supabase), React 19, Vitest.

**Contexto obrigatório:**
- Branch: `feat/dashboards-funil` a partir de `feat/lead-de-verdade`. **Tudo local; sem push/PR até o Alfredo pedir.**
- Banco: `.env.local` aponta para a **produção** da Eva. Mudança de schema só aditiva, por SQL revisado (nunca `db:push`). Backfill só com ok explícito.
- Produção hoje (19/10/2026, leitura): 3 negócios, todos abertos; funil "Vendas". Os números vão começar pequenos — os estados vazios precisam explicar isso.
- Dados de antes do registro não existem: para cada negócio antigo, o backfill grava uma entrada "nasceu na etapa atual em `createdAt`". A tela mostra "histórico a partir de DD/MM" para não enganar.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `prisma/schema.prisma` | modificar | Modelo `DealStageEvent` + relações |
| `prisma/sql/2026-10-19-deal-stage-events.sql` | criar | SQL aditivo revisado |
| `src/lib/server/stage-events.ts` | criar | `registrarMudancaDeEtapa` |
| `src/lib/server/crm.ts` | modificar | `createDeal`/`moveDealStage` gravam o evento; `origem` opcional |
| `src/lib/server/crm.stage-events.test.ts` | criar | Testes |
| `src/lib/funil-metricas.ts` | criar | Contas puras do funil |
| `src/lib/funil-metricas.test.ts` | criar | Testes |
| `src/lib/analytics-catalog.ts` | modificar | Fontes novas + tipo `funil` |
| `src/lib/server/analytics.ts` | modificar | Busca linhas e calcula as fontes novas |
| `src/components/charts/funnel-chart.tsx` | criar | Desenho do funil |
| `src/app/(app)/dashboard/page.tsx` | modificar | Cartão tipo funil, botão "Painel do funil", aviso de histórico |
| `scripts/backfill-stage-events.mjs` | criar | Evento inicial dos negócios antigos (simulação por padrão) |

---

### Task 1: Registro de mudança de etapa (schema)

- [ ] **Step 1:** Em `prisma/schema.prisma`, depois de `model DealContact`:
```prisma
// Cada vez que um negócio entra numa etapa (inclusive ao nascer). É o que
// permite medir conversão etapa a etapa e tempo em cada etapa — `stageSince`
// só sabe da etapa atual. Gravado só por registrarMudancaDeEtapa
// (src/lib/server/stage-events.ts).
model DealStageEvent {
  id          String   @id @default(uuid())
  orgId       String
  dealId      String
  pipelineId  String
  fromStageId String?
  toStageId   String
  origem      String   @default("usuario") // usuario | fluxo | api | importacao | backfill
  at          DateTime @default(now())

  deal Deal @relation(fields: [dealId], references: [id], onDelete: Cascade)

  @@index([orgId, pipelineId, at])
  @@index([dealId, at])
  @@map("eva_studio_deal_stage_events")
}
```
E em `model Deal`, junto das relações: `stageEvents DealStageEvent[]`.
(Sem FK para etapa: etapa apagada não pode apagar a história; o nome sai do join quando a etapa existe.)

- [ ] **Step 2:** `npx prisma validate && npx prisma generate && npx tsc --noEmit`.
- [ ] **Step 3:** `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → copiar só o `CREATE TABLE`, os 2 índices e a FK para `prisma/sql/2026-10-19-deal-stage-events.sql` (com `IF NOT EXISTS` e a FK dentro de `DO $$ ... IF NOT EXISTS`), **sem** o `DROP INDEX` do índice vetorial.
- [ ] **Step 4: Aplicar — pedir ok ao Alfredo** (produção). Rodar numa transação; conferir com `migrate diff` que sobrou só o índice vetorial.
- [ ] **Step 5:** commit local.

---

### Task 2: Gravar o evento em todo movimento

**Files:** Create `src/lib/server/stage-events.ts`, `src/lib/server/crm.stage-events.test.ts`; Modify `src/lib/server/crm.ts`.

- [ ] **Step 1: Teste** (`crm.stage-events.test.ts`, Prisma simulado):
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipelineStage: { findUnique: vi.fn(), findFirst: vi.fn() },
  pipeline: { findFirst: vi.fn() },
  deal: { update: vi.fn(), findUnique: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  dealStageEvent: { create: vi.fn() },
  dealContact: { create: vi.fn() },
  customField: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { moveDealStage } from "./crm";

beforeEach(() => {
  vi.clearAllMocks();
  db.pipelineStage.findUnique.mockResolvedValue({ id: "s2", pipelineId: "p1", probability: 40, type: "open" });
});

describe("moveDealStage grava o histórico", () => {
  it("registra de onde veio, para onde foi e quem moveu", async () => {
    db.deal.findUnique.mockResolvedValue({ id: "d1", orgId: "o1", stageId: "s1" });
    db.deal.update.mockResolvedValue({ id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    await moveDealStage("d1", "s2", undefined, "fluxo");
    expect(db.dealStageEvent.create).toHaveBeenCalledWith({
      data: { orgId: "o1", dealId: "d1", pipelineId: "p1", fromStageId: "s1", toStageId: "s2", origem: "fluxo" },
    });
  });

  it("mesma etapa: não grava evento (não é movimento)", async () => {
    db.deal.findUnique.mockResolvedValue({ id: "d1", orgId: "o1", stageId: "s2" });
    db.deal.update.mockResolvedValue({ id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    await moveDealStage("d1", "s2");
    expect(db.dealStageEvent.create).not.toHaveBeenCalled();
  });

  it("origem padrão é usuario", async () => {
    db.deal.findUnique.mockResolvedValue({ id: "d1", orgId: "o1", stageId: "s1" });
    db.deal.update.mockResolvedValue({ id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    await moveDealStage("d1", "s2");
    expect(db.dealStageEvent.create.mock.calls[0][0].data.origem).toBe("usuario");
  });

  it("falha ao gravar o histórico não desfaz o movimento", async () => {
    db.deal.findUnique.mockResolvedValue({ id: "d1", orgId: "o1", stageId: "s1" });
    db.deal.update.mockResolvedValue({ id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    db.dealStageEvent.create.mockRejectedValue(new Error("tabela não existe"));
    await expect(moveDealStage("d1", "s2")).resolves.toMatchObject({ stageId: "s2" });
  });
});
```
> Um teste de `createDeal` no mesmo arquivo (`fromStageId: null`, `origem` repassada) — escrever depois de ler a assinatura de `CreateDealInput` em `crm.ts:53` e acrescentar `origem?` a ela.

- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3: Implementar.** `src/lib/server/stage-events.ts`:
```ts
import "server-only";
import { prisma } from "@/lib/db/prisma";

export type OrigemDoMovimento = "usuario" | "fluxo" | "api" | "importacao" | "backfill";

/**
 * Histórico de etapas. Nunca derruba quem moveu o negócio: se não gravar, o
 * dashboard perde um ponto, mas o negócio continua na etapa certa.
 */
export async function registrarMudancaDeEtapa(e: {
  orgId: string;
  dealId: string;
  pipelineId: string;
  fromStageId: string | null;
  toStageId: string;
  origem?: OrigemDoMovimento;
}): Promise<void> {
  if (e.fromStageId === e.toStageId) return;
  try {
    await prisma.dealStageEvent.create({
      data: {
        orgId: e.orgId,
        dealId: e.dealId,
        pipelineId: e.pipelineId,
        fromStageId: e.fromStageId,
        toStageId: e.toStageId,
        origem: e.origem ?? "usuario",
      },
    });
  } catch (error) {
    console.error("[stage-events] falha ao registrar mudança de etapa", error);
  }
}
```
Em `crm.ts`, `moveDealStage(dealId, stageId, lostReason?, origem: OrigemDoMovimento = "usuario")`: antes do `update`, ler `const antes = await prisma.deal.findUnique({ where: { id: dealId }, select: { stageId: true, orgId: true } })`; depois do `update`, `await registrarMudancaDeEtapa({ orgId: atualizado.orgId, dealId, pipelineId: atualizado.pipelineId, fromStageId: antes?.stageId ?? null, toStageId: stageId, origem })` e retornar `atualizado`. Em `createDeal`, depois de criar: `registrarMudancaDeEtapa({ ..., fromStageId: null, toStageId: deal.stageId, origem: input.origem })`.
Chamadas: `flow-engine.ts:375`, `:413`, `:1263`, `:1301` passam `"fluxo"`; as rotas de sessão ficam com o padrão `"usuario"`.

- [ ] **Step 4:** testes do arquivo + `flow-engine.*.test.ts` verdes; `tsc` limpo. Commit local.

---

### Task 3: Contas do funil (puras)

**Files:** Create `src/lib/funil-metricas.ts`, `src/lib/funil-metricas.test.ts`.

Definições (a tela e a ajuda usam as mesmas palavras):
- **Chegou na etapa X:** o negócio passou por X ou por uma etapa aberta depois de X (pular etapa conta como ter passado), ou foi ganho.
- **Conversão:** dos negócios criados no período, quantos chegaram em cada etapa; `% da anterior` e `% do início`. A última barra é "Ganho".
- **Tempo na etapa:** da entrada até a saída; quem ainda está na etapa entra com "até agora" e é marcado como em andamento. Mostra **mediana** (média engana com 1 negócio esquecido) e quantos negócios entraram na conta.
- **Parado:** aberto e sem mudar de etapa há mais de N dias (padrão 7).
- **Taxa de ganho:** ganhos ÷ (ganhos + perdidos) fechados no período.
- **Ciclo de venda:** mediana de dias entre criar e ganhar, dos ganhos no período.

- [ ] **Step 1: Teste** (`src/lib/funil-metricas.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import {
  conversaoPorEtapa,
  tempoPorEtapa,
  negociosParados,
  motivosDePerda,
  taxaDeGanho,
  cicloDeVenda,
  type EtapaF,
  type NegocioF,
  type EventoF,
} from "./funil-metricas";

const D = (s: string) => new Date(`2026-10-${s}T12:00:00Z`);
const etapas: EtapaF[] = [
  { id: "lead", nome: "Lead", posicao: 0, tipo: "open" },
  { id: "prop", nome: "Proposta", posicao: 1, tipo: "open" },
  { id: "neg", nome: "Negociação", posicao: 2, tipo: "open" },
  { id: "ganho", nome: "Ganho", posicao: 3, tipo: "won" },
  { id: "perdido", nome: "Perdido", posicao: 4, tipo: "lost" },
];
const neg = (p: Partial<NegocioF> & { id: string }): NegocioF => ({
  etapaId: "lead",
  criadoEm: D("01"),
  fechadoEm: null,
  naEtapaDesde: D("01"),
  valorCentavos: 0,
  motivoPerda: "",
  ...p,
});
const ev = (dealId: string, para: string, dia: string, de: string | null = null): EventoF => ({ dealId, de, para, em: D(dia) });

describe("conversaoPorEtapa", () => {
  it("conta quem chegou em cada etapa, inclusive quem pulou etapa e quem ganhou", () => {
    const negocios = [
      neg({ id: "a", etapaId: "lead" }),
      neg({ id: "b", etapaId: "prop" }),
      neg({ id: "c", etapaId: "neg" }), // pulou Proposta
      neg({ id: "d", etapaId: "ganho", fechadoEm: D("09") }),
    ];
    const eventos = [
      ev("a", "lead", "01"),
      ev("b", "lead", "01"), ev("b", "prop", "03", "lead"),
      ev("c", "lead", "01"), ev("c", "neg", "04", "lead"),
      ev("d", "lead", "01"), ev("d", "prop", "02", "lead"), ev("d", "ganho", "09", "prop"),
    ];
    const r = conversaoPorEtapa(etapas, negocios, eventos);
    expect(r.map((x) => [x.nome, x.quantidade])).toEqual([
      ["Lead", 4], ["Proposta", 3], ["Negociação", 2], ["Ganho", 1],
    ]);
    expect(r[1].taxaDaAnterior).toBeCloseTo(0.75);
    expect(r[3].taxaDoInicio).toBeCloseTo(0.25);
  });

  it("perdido conta só até onde chegou antes de perder", () => {
    const negocios = [neg({ id: "x", etapaId: "perdido", fechadoEm: D("05"), motivoPerda: "preço" })];
    const eventos = [ev("x", "lead", "01"), ev("x", "prop", "02", "lead"), ev("x", "perdido", "05", "prop")];
    const r = conversaoPorEtapa(etapas, negocios, eventos);
    expect(r.map((x) => x.quantidade)).toEqual([1, 1, 0, 0]);
  });

  it("negócio sem nenhum evento usa a etapa atual", () => {
    const r = conversaoPorEtapa(etapas, [neg({ id: "z", etapaId: "prop" })], []);
    expect(r.map((x) => x.quantidade)).toEqual([1, 1, 0, 0]);
  });

  it("sem negócios: tudo zero, sem dividir por zero", () => {
    const r = conversaoPorEtapa(etapas, [], []);
    expect(r.every((x) => x.quantidade === 0 && x.taxaDaAnterior === 0 && x.taxaDoInicio === 0)).toBe(true);
  });
});

describe("tempoPorEtapa", () => {
  it("mediana em dias por etapa, contando quem ainda está nela até agora", () => {
    const eventos = [
      ev("a", "lead", "01"), ev("a", "prop", "03", "lead"), // 2 dias em Lead
      ev("b", "lead", "01"), ev("b", "prop", "05", "lead"), // 4 dias em Lead
      ev("c", "lead", "01"), // ainda em Lead
    ];
    const r = tempoPorEtapa(etapas, eventos, D("07"));
    const lead = r.find((x) => x.etapaId === "lead")!;
    expect(lead.medianaDias).toBe(4); // 2, 4, 6 → 4
    expect(lead.amostras).toBe(3);
    expect(lead.emAndamento).toBe(1);
  });

  it("etapas de fechamento ficam de fora", () => {
    const r = tempoPorEtapa(etapas, [ev("d", "ganho", "02")], D("07"));
    expect(r.some((x) => x.etapaId === "ganho")).toBe(false);
  });
});

describe("negociosParados / motivos / taxa / ciclo", () => {
  it("parados: abertos sem mudar de etapa há mais de N dias, mais antigos primeiro", () => {
    const r = negociosParados(
      etapas,
      [
        neg({ id: "velho", naEtapaDesde: D("01") }),
        neg({ id: "novo", naEtapaDesde: D("10") }),
        neg({ id: "fechado", etapaId: "ganho", fechadoEm: D("02"), naEtapaDesde: D("02") }),
      ],
      D("15"),
      7
    );
    expect(r.map((x) => [x.id, x.diasParado])).toEqual([["velho", 14]]);
  });

  it("motivos de perda agrupados, vazio vira 'Sem motivo'", () => {
    const r = motivosDePerda([
      neg({ id: "1", etapaId: "perdido", fechadoEm: D("02"), motivoPerda: "Preço" }),
      neg({ id: "2", etapaId: "perdido", fechadoEm: D("02"), motivoPerda: "preço " }),
      neg({ id: "3", etapaId: "perdido", fechadoEm: D("02"), motivoPerda: "" }),
    ], etapas);
    expect(r).toEqual([{ label: "Preço", value: 2 }, { label: "Sem motivo", value: 1 }]);
  });

  it("taxa de ganho e ciclo de venda", () => {
    const negocios = [
      neg({ id: "g1", etapaId: "ganho", criadoEm: D("01"), fechadoEm: D("05") }),
      neg({ id: "g2", etapaId: "ganho", criadoEm: D("01"), fechadoEm: D("11") }),
      neg({ id: "p1", etapaId: "perdido", criadoEm: D("01"), fechadoEm: D("03") }),
    ];
    expect(taxaDeGanho(negocios, etapas)).toBeCloseTo(2 / 3);
    expect(cicloDeVenda(negocios, etapas)).toBe(7); // 4 e 10 → mediana 7
    expect(taxaDeGanho([], etapas)).toBeNull();
    expect(cicloDeVenda([], etapas)).toBeNull();
  });
});
```

- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3: Implementar** `src/lib/funil-metricas.ts`:
```ts
// Contas do funil. Puras (sem banco): src/lib/server/analytics.ts busca as
// linhas e chama daqui; a tela de ajuda usa as mesmas definições.

export interface EtapaF {
  id: string;
  nome: string;
  posicao: number;
  tipo: "open" | "won" | "lost" | string;
}
export interface NegocioF {
  id: string;
  etapaId: string;
  criadoEm: Date;
  fechadoEm: Date | null;
  naEtapaDesde: Date;
  valorCentavos: number;
  motivoPerda: string;
  nome?: string;
}
export interface EventoF {
  dealId: string;
  de: string | null;
  para: string;
  em: Date;
}

const DIA = 86_400_000;
const dias = (ms: number) => Math.round(ms / DIA);

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function porId(etapas: EtapaF[]) {
  return new Map(etapas.map((e) => [e.id, e]));
}

function eventosPorNegocio(eventos: EventoF[]) {
  const m = new Map<string, EventoF[]>();
  for (const e of eventos) m.set(e.dealId, [...(m.get(e.dealId) ?? []), e]);
  for (const l of m.values()) l.sort((a, b) => a.em.getTime() - b.em.getTime());
  return m;
}

export interface LinhaDeConversao {
  etapaId: string;
  nome: string;
  quantidade: number;
  taxaDaAnterior: number;
  taxaDoInicio: number;
}

export function conversaoPorEtapa(etapas: EtapaF[], negocios: NegocioF[], eventos: EventoF[]): LinhaDeConversao[] {
  const abertas = etapas.filter((e) => e.tipo === "open").sort((a, b) => a.posicao - b.posicao);
  const ganho = etapas.find((e) => e.tipo === "won");
  const mapa = porId(etapas);
  const hist = eventosPorNegocio(eventos);

  // Índice (nas etapas abertas) mais longe que cada negócio chegou; -1 = nenhuma.
  const alcance = negocios.map((n) => {
    const passou = [...(hist.get(n.id) ?? []).map((e) => e.para), n.etapaId];
    let max = -1;
    let ganhou = false;
    for (const id of passou) {
      const e = mapa.get(id);
      if (!e) continue;
      if (e.tipo === "won") ganhou = true;
      const i = abertas.findIndex((a) => a.id === id);
      if (i > max) max = i;
    }
    if (ganhou) max = abertas.length - 1;
    return { max, ganhou };
  });

  const linhas: LinhaDeConversao[] = abertas.map((e, i) => ({
    etapaId: e.id,
    nome: e.nome,
    quantidade: alcance.filter((a) => a.max >= i).length,
    taxaDaAnterior: 0,
    taxaDoInicio: 0,
  }));
  if (ganho) {
    linhas.push({ etapaId: ganho.id, nome: ganho.nome, quantidade: alcance.filter((a) => a.ganhou).length, taxaDaAnterior: 0, taxaDoInicio: 0 });
  }
  const inicio = linhas[0]?.quantidade ?? 0;
  linhas.forEach((l, i) => {
    const anterior = i === 0 ? l.quantidade : linhas[i - 1].quantidade;
    l.taxaDaAnterior = anterior > 0 ? l.quantidade / anterior : 0;
    l.taxaDoInicio = inicio > 0 ? l.quantidade / inicio : 0;
  });
  return linhas;
}

export interface TempoNaEtapa {
  etapaId: string;
  nome: string;
  medianaDias: number | null;
  amostras: number;
  emAndamento: number;
}

export function tempoPorEtapa(etapas: EtapaF[], eventos: EventoF[], agora: Date): TempoNaEtapa[] {
  const abertas = etapas.filter((e) => e.tipo === "open").sort((a, b) => a.posicao - b.posicao);
  const duracoes = new Map<string, number[]>(abertas.map((e) => [e.id, []]));
  const andamento = new Map<string, number>();
  for (const lista of eventosPorNegocio(eventos).values()) {
    lista.forEach((e, i) => {
      const bucket = duracoes.get(e.para);
      if (!bucket) return;
      const saida = lista[i + 1]?.em ?? agora;
      if (!lista[i + 1]) andamento.set(e.para, (andamento.get(e.para) ?? 0) + 1);
      bucket.push((saida.getTime() - e.em.getTime()) / DIA);
    });
  }
  return abertas.map((e) => {
    const v = duracoes.get(e.id) ?? [];
    const m = mediana(v);
    return { etapaId: e.id, nome: e.nome, medianaDias: m === null ? null : Math.round(m * 10) / 10, amostras: v.length, emAndamento: andamento.get(e.id) ?? 0 };
  });
}

export function negociosParados(etapas: EtapaF[], negocios: NegocioF[], agora: Date, limiteDias = 7) {
  const mapa = porId(etapas);
  return negocios
    .filter((n) => !n.fechadoEm && mapa.get(n.etapaId)?.tipo === "open")
    .map((n) => ({ id: n.id, nome: n.nome ?? "", etapa: mapa.get(n.etapaId)?.nome ?? "", diasParado: dias(agora.getTime() - n.naEtapaDesde.getTime()), valorCentavos: n.valorCentavos }))
    .filter((n) => n.diasParado > limiteDias)
    .sort((a, b) => b.diasParado - a.diasParado);
}

export function motivosDePerda(negocios: NegocioF[], etapas: EtapaF[]) {
  const mapa = porId(etapas);
  const grupos = new Map<string, { label: string; value: number }>();
  for (const n of negocios) {
    if (mapa.get(n.etapaId)?.tipo !== "lost") continue;
    const bruto = n.motivoPerda.trim();
    const chave = bruto.toLowerCase() || "__sem";
    const g = grupos.get(chave) ?? { label: bruto || "Sem motivo", value: 0 };
    g.value += 1;
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => b.value - a.value);
}

export function taxaDeGanho(negocios: NegocioF[], etapas: EtapaF[]): number | null {
  const mapa = porId(etapas);
  const ganhos = negocios.filter((n) => mapa.get(n.etapaId)?.tipo === "won").length;
  const perdidos = negocios.filter((n) => mapa.get(n.etapaId)?.tipo === "lost").length;
  return ganhos + perdidos === 0 ? null : ganhos / (ganhos + perdidos);
}

export function cicloDeVenda(negocios: NegocioF[], etapas: EtapaF[]): number | null {
  const mapa = porId(etapas);
  const v = negocios
    .filter((n) => mapa.get(n.etapaId)?.tipo === "won" && n.fechadoEm)
    .map((n) => (n.fechadoEm!.getTime() - n.criadoEm.getTime()) / DIA);
  const m = mediana(v);
  return m === null ? null : Math.round(m);
}
```
- [ ] **Step 4:** rodar → passa. Commit local.

---

### Task 4: Fontes novas no dashboard

**Files:** Modify `src/lib/analytics-catalog.ts`, `src/lib/server/analytics.ts`.

- [ ] **Step 1: Catálogo.** `TipoDeFonte` ganha `"funil"`; `formato` ganha `"dias"`. No grupo "Funil", acrescentar:
```ts
  { chave: "funilConversao", rotulo: "Conversão do funil", explicacao: "Dos negócios criados no período, quantos chegaram em cada etapa.", tipo: "funil", grupo: "Funil" },
  { chave: "tempoPorEtapa", rotulo: "Tempo em cada etapa", explicacao: "Mediana de dias que um negócio fica em cada etapa.", tipo: "quebra", grupo: "Funil" },
  { chave: "negociosParados", rotulo: "Negócios parados", explicacao: "Abertos e sem mudar de etapa há mais de 7 dias.", tipo: "tabela", grupo: "Funil" },
  { chave: "motivosDePerda", rotulo: "Motivos de perda", explicacao: "Por que os negócios perdidos no período foram perdidos.", tipo: "quebra", grupo: "Funil" },
  { chave: "taxaDeGanho", rotulo: "Taxa de ganho", explicacao: "Dos negócios fechados no período, quantos foram ganhos.", tipo: "numero", formato: "porcento", grupo: "Funil" },
  { chave: "cicloDeVenda", rotulo: "Ciclo de venda", explicacao: "Mediana de dias entre criar o negócio e ganhar.", tipo: "numero", formato: "dias", grupo: "Funil" },
```
- [ ] **Step 2: `coletarFontes`.** Ler `src/lib/server/analytics.ts:39` inteiro antes de mexer. Acrescentar uma busca (escopo `orgId`, `archivedAt: null`, funil padrão ou o do filtro existente, criados no período **ou** ainda abertos, `take` 5000 como `consulta.ts`), as etapas do funil e os eventos desses negócios; converter para `EtapaF/NegocioF/EventoF` e preencher as chaves novas em `Fontes`. Acrescentar ao retorno `historicoDesde: Date | null` (o evento mais antigo da organização) para a tela avisar.
- [ ] **Step 3: Teste** de `coletarFontes` com Prisma simulado: confere que as chaves novas existem e que o `where` traz `orgId` (isolamento entre organizações).
- [ ] **Step 4:** `tsc`, testes. Commit local.

---

### Task 5: Desenho do funil e "Painel do funil"

**Files:** Create `src/components/charts/funnel-chart.tsx`; Modify `src/app/(app)/dashboard/page.tsx`.

- [ ] **Step 1: `FunnelChart`** — barras horizontais centradas, largura proporcional ao maior valor, rótulo da etapa à esquerda, número e `% da anterior` à direita, última barra (Ganho) em verde (`emerald`), demais em `accent-500` com opacidade decrescente; `role="img"` com `aria-label` descrevendo a sequência ("Lead 40, Proposta 22 (55%)…"); valores sempre visíveis em texto (não só cor); `motion-reduce` respeitado; zero negócios → estado vazio "Nenhum negócio criado no período".
- [ ] **Step 2: Cartão.** Em `Cartao` (`dashboard/page.tsx:405`), tratar `fonte.tipo === "funil"` com `FunnelChart`. Formato `dias` = "N dias" (1 dia no singular). Tabela de parados reaproveita o desenho de tabela existente (nome, etapa, dias parado, valor), linha clicável para o negócio.
- [ ] **Step 3: Botão "Painel do funil".** Na barra do dashboard, ao lado de adicionar cartão: adiciona de uma vez Taxa de ganho, Ciclo de venda, Negócios abertos, Previsão ponderada (números) + Conversão do funil, Tempo em cada etapa (largos) + Negócios parados, Motivos de perda. Não duplica cartão que já está no painel.
- [ ] **Step 4: Aviso de histórico.** Se `historicoDesde` for recente (menos que o período escolhido), faixa discreta no topo: "O histórico de etapas começou em DD/MM. Antes disso, cada negócio conta a partir da etapa em que estava."
- [ ] **Step 5: Navegador** (agente/organização de teste, sem mexer em negócio real): painel vazio mostra estados vazios claros; criar 2 negócios de teste, mover um de etapa, ver conversão e tempo mudarem; botão monta o painel; celular (375px) sem rolagem horizontal; apagar os negócios de teste no fim.
- [ ] **Step 6:** `tsc`, lint sem erro novo, build (com o dev parado). Commit local.

---

### Task 6: Backfill do histórico (produção — só com ok)

- [ ] `scripts/backfill-stage-events.mjs` (`pg` puro, `DIRECT_URL`, simulação por padrão, `--aplicar` grava numa transação): para cada negócio **sem nenhum evento**, inserir `{ fromStageId: null, toStageId: stageId, at: createdAt, origem: 'backfill' }`. Mostrar a contagem; aplicar só com ok do Alfredo. Commit local do script.

---

### Task 7: Fechamento
- [ ] `npm test && npx tsc --noEmit && npm run build` verdes; lint sem erro novo nos arquivos da branch.
- [ ] Atualizar a Eva Help (`src/app/(app)/ajuda/conteudo.ts`) se ela listar as fontes do dashboard (ela lê `FONTES`; conferir).
- [ ] **Não** fazer push/PR.
