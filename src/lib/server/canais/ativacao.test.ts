import { describe, it, expect, vi, beforeEach } from "vitest";

// Banco em memória com o mínimo que a ativação usa: canais, agentes e a
// tabela de ativação do Instagram (as outras seguem o mesmo caminho).
const estado = vi.hoisted(() => ({
  canais: [] as Record<string, unknown>[],
  agentes: [] as { id: string; orgId: string }[],
  instagram: [] as Record<string, unknown>[],
}));

const db = vi.hoisted(() => {
  const casa = (linha: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "NOT") return !Object.entries(v as Record<string, unknown>).every(([kk, vv]) => linha[kk] === vv);
      return linha[k] === v;
    });
  const tabela = (nome: "instagram") => ({
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => estado[nome].find((l) => casa(l, where)) ?? null),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      estado[nome] = estado[nome].filter((l) => !casa(l, where));
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (estado[nome].some((l) => l.igBusinessId === data.igBusinessId)) throw new Error("unique igBusinessId");
      estado[nome].push(data);
      return data;
    }),
  });
  const base = {
    canal: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => estado.canais.find((c) => casa(c, where)) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const c = estado.canais.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return c;
      }),
    },
    agent: { findFirst: vi.fn(async ({ where }: { where: { id: string; orgId: string } }) => estado.agentes.find((a) => a.id === where.id && a.orgId === where.orgId) ?? null) },
    instagramConnection: tabela("instagram"),
  };
  return { ...base, $transaction: vi.fn(async (fn: (tx: typeof base) => unknown) => fn(base)) };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/crypto", () => ({ encryptSecret: (s: string) => `enc(${s})`, decryptSecret: (s: string) => s.replace(/^enc\(|\)$/g, "") }));

import { ativarCanal, desativarCanal, decifrarSegredos } from "./ativacao";

const ig = (id: string, agentId: string | null, extra: Record<string, unknown> = {}) => ({
  id, orgId: "o1", tipo: "instagram", rotulo: `@${id}`, externalId: `ig-${id}`, segredos: null, agentId, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  estado.agentes = [{ id: "A", orgId: "o1" }, { id: "B", orgId: "o1" }, { id: "X", orgId: "outro" }];
  estado.canais = [];
  estado.instagram = [];
});

describe("ativarCanal", () => {
  it("canal migrado (sem segredos) que estava com A passa para B: cópia sai de A, entra em B, canal guarda os segredos", async () => {
    estado.canais = [ig("loja", "A")];
    estado.instagram = [{ agentId: "A", igBusinessId: "ig-loja", pageAccessToken: "tok-cifrado", username: "loja" }];
    const r = await ativarCanal("o1", "loja", "B");
    expect(r).toMatchObject({ ok: true, saiuDe: "A" });
    expect(estado.instagram).toEqual([{ agentId: "B", igBusinessId: "ig-loja", pageAccessToken: "tok-cifrado", username: "loja" }]);
    expect(estado.canais[0].agentId).toBe("B");
    expect(decifrarSegredos(estado.canais[0].segredos as string)).toEqual({ igBusinessId: "ig-loja", pageAccessToken: "tok-cifrado", username: "loja" });
  });

  it("canal sem agente, com segredos: entra no agente", async () => {
    estado.canais = [ig("loja", null, { segredos: `enc(${JSON.stringify({ igBusinessId: "ig-loja", pageAccessToken: "t", username: "loja" })})` })];
    await ativarCanal("o1", "loja", "A");
    expect(estado.instagram).toEqual([{ igBusinessId: "ig-loja", pageAccessToken: "t", username: "loja", agentId: "A" }]);
  });

  it("agente que já atendia por outro Instagram: o outro fica sem agente (segue conectado)", async () => {
    estado.canais = [ig("velho", "A"), ig("novo", null, { segredos: `enc(${JSON.stringify({ igBusinessId: "ig-novo", pageAccessToken: "t2", username: "novo" })})` })];
    estado.instagram = [{ agentId: "A", igBusinessId: "ig-velho", pageAccessToken: "t1", username: "velho" }];
    await ativarCanal("o1", "novo", "A");
    const velho = estado.canais.find((c) => c.id === "velho")!;
    expect(velho.agentId).toBeNull();
    expect(decifrarSegredos(velho.segredos as string)).toMatchObject({ igBusinessId: "ig-velho" });
    expect(estado.instagram).toEqual([{ igBusinessId: "ig-novo", pageAccessToken: "t2", username: "novo", agentId: "A" }]);
  });

  it("canal ou agente de outro contrato: recusa sem mexer em nada", async () => {
    estado.canais = [ig("loja", "A")];
    expect(await ativarCanal("o1", "loja", "X")).toMatchObject({ ok: false, status: 404 });
    expect(await ativarCanal("outro", "loja", "A")).toMatchObject({ ok: false, status: 404 });
    expect(estado.canais[0].agentId).toBe("A");
  });

  it("sem segredos e sem cópia para copiar: pede reconectar", async () => {
    estado.canais = [ig("loja", null)];
    expect(await ativarCanal("o1", "loja", "A")).toMatchObject({ ok: false, status: 409 });
  });
});

describe("desativarCanal", () => {
  it("apaga a cópia do agente e o canal segue conectado, com os segredos guardados", async () => {
    estado.canais = [ig("loja", "A")];
    estado.instagram = [{ agentId: "A", igBusinessId: "ig-loja", pageAccessToken: "t", username: "loja" }];
    const r = await desativarCanal("o1", "loja");
    expect(r).toMatchObject({ ok: true, saiuDe: "A" });
    expect(estado.instagram).toEqual([]);
    expect(estado.canais[0].agentId).toBeNull();
    expect(decifrarSegredos(estado.canais[0].segredos as string)).toMatchObject({ pageAccessToken: "t" });
  });
});
