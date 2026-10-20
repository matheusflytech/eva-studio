import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  deal: { findMany: vi.fn(), updateMany: vi.fn() },
  contact: { findMany: vi.fn(), updateMany: vi.fn() },
  contactTag: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  tag: { findFirst: vi.fn() },
  sequence: { count: vi.fn(), findFirst: vi.fn() },
  sequenceEnrollment: { findMany: vi.fn() },
  pipelineStage: { findFirst: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

const sessao = vi.hoisted(() => ({ atual: {} as Record<string, unknown> }));
vi.mock("@/lib/server/permissions", async (orig) => {
  const real = await orig<typeof import("@/lib/server/permissions")>();
  return { ...real, requirePermission: vi.fn(async () => sessao.atual) };
});

const motor = vi.hoisted(() => ({ idsDoFiltro: vi.fn() }));
vi.mock("@/lib/server/filtro-crm", () => motor);

const escopo = vi.hoisted(() => ({ donos: null as string[] | null }));
vi.mock("@/lib/server/escopo-dados", () => ({
  donosVisiveis: vi.fn(async () => escopo.donos),
  filtroDeEscopo: vi.fn(async () => (escopo.donos ? { ownerId: { in: escopo.donos } } : {})),
}));

vi.mock("@/lib/server/api-validacao", async (orig) => {
  const real = await orig<typeof import("@/lib/server/api-validacao")>();
  return { ...real, conferirReferencias: vi.fn(async (_org: string, r: { ownerId?: string }) => (r.ownerId === "fantasma" ? "Responsável não encontrado." : null)) };
});

const crm = vi.hoisted(() => ({ moveDealStage: vi.fn() }));
vi.mock("@/lib/server/crm", async () => {
  const { ErroDaMudanca } = await import("@/lib/server/regras-de-etapa");
  class ErroDeCrm extends Error {
    status = 404;
  }
  return { ...crm, ErroDaMudanca, ErroDeCrm };
});
vi.mock("@/lib/server/regras-de-etapa", () => {
  class ErroDaMudanca extends Error {
    constructor(
      m: string,
      public status: number,
      public codigo: string,
      public faltando: { campo: string; rotulo: string }[] = []
    ) {
      super(m);
    }
  }
  return { ErroDaMudanca };
});

const historico = vi.hoisted(() => ({ registrarMudancasEmLote: vi.fn() }));
vi.mock("@/lib/server/stage-events", () => historico);

const lixeira = vi.hoisted(() => ({
  lixeiraDisponivel: vi.fn(async () => true),
  apagarComLixeira: vi.fn(),
  lerItemDaLixeira: vi.fn(),
  restaurarDaLixeira: vi.fn(),
}));
vi.mock("@/lib/server/lixeira", () => {
  class ErroDaLixeira extends Error {
    constructor(
      m: string,
      public status: number,
      public codigo: string
    ) {
      super(m);
    }
  }
  return { ...lixeira, ErroDaLixeira };
});
vi.mock("@/lib/server/lixeira-http", () => ({ nomeDeQuem: vi.fn(async () => "Ana"), podeVerItem: vi.fn(async () => true) }));

const seq = vi.hoisted(() => ({ enrollContact: vi.fn(async () => "e1"), enrollContactByTag: vi.fn() }));
vi.mock("@/lib/server/sequences", () => seq);

import { POST as lotesDeNegocio } from "./route";
import { POST as lotesDeContato } from "../../contacts/lote/route";
import { ErroDaMudanca } from "@/lib/server/regras-de-etapa";

const req = (body: unknown) => new Request("http://x/api/deals/lote", { method: "POST", body: JSON.stringify(body) });
const ETAPA = { id: "s2", name: "Negociação" };

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { orgId: "org", userId: "u1", role: "agent" };
  escopo.donos = null;
  motor.idsDoFiltro.mockResolvedValue({ ids: ["d1", "d2", "d3"], truncado: false, avisos: [] });
  db.deal.findMany.mockImplementation(async ({ where, select }: { where: { id: { in: string[] } }; select: Record<string, unknown> }) =>
    where.id.in.map((id) => ({ id, name: `Negócio ${id}`, ownerId: "u1", stageId: "s1", pipelineId: "p1", archivedAt: null, ...(select.stage ? { stage: { name: "Proposta" } } : {}) }))
  );
  db.deal.updateMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
  db.contact.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, ownerId: null, name: id })));
  db.contact.updateMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
  db.pipelineStage.findFirst.mockResolvedValue(ETAPA);
  crm.moveDealStage.mockImplementation(async (id: string, stageId: string, o: { simular?: boolean; historicoEmLote?: (e: unknown) => void }) => {
    if (id === "d3") throw new ErroDaMudanca("Preencha Valor para mover.", 422, "campos_obrigatorios", [{ campo: "amountCents", rotulo: "Valor", etapaId: "s2", etapa: "Negociação" }]);
    if (!o.simular) o.historicoEmLote?.({ orgId: "org", dealId: id, pipelineId: "p1", fromStageId: "s1", toStageId: stageId });
    return {};
  });
});

describe("POST /api/deals/lote — mover", () => {
  it("por filtro: o servidor refaz a busca (contrato/escopo/funil) e reporta bloqueados", async () => {
    const res = await lotesDeNegocio(req({ acao: "mover", filtro: { busca: "x" }, pipelineId: "p1", parametros: { stageId: "s2" } }));
    const d = await res.json();
    expect(motor.idsDoFiltro).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org" }),
      "negocios",
      { busca: "x" },
      5000,
      { extras: [{ campo: "funil", op: "qualquer", valores: ["p1"] }], incluirArquivados: false }
    );
    expect(d.ok).toBe(2);
    expect(d.falhas).toEqual([{ id: "d3", nome: "Negócio d3", motivo: "Preencha Valor para mover.", codigo: "campos_obrigatorios", faltando: [{ id: "amountCents", rotulo: "Valor" }] }]);
    // cada um passa por moveDealStage (as regras), com origem usuário
    expect(crm.moveDealStage).toHaveBeenCalledTimes(3);
    expect(crm.moveDealStage.mock.calls[0][2]).toMatchObject({ origem: "usuario", simular: false });
    // histórico em lote
    expect(historico.registrarMudancasEmLote).toHaveBeenCalledTimes(1);
    expect(historico.registrarMudancasEmLote.mock.calls[0][0]).toHaveLength(2);
    expect(historico.registrarMudancasEmLote.mock.calls[0][1]).toBe("usuario");
    expect(d.desfazer).toEqual({ acao: "restaurar_etapa", parametros: { itens: [{ id: "d1", stageId: "s1" }, { id: "d2", stageId: "s1" }] } });
  });

  it("simular = prévia: nada gravado, caminho de → para", async () => {
    const d = await (await lotesDeNegocio(req({ acao: "mover", ids: ["d1", "d2", "d3"], parametros: { stageId: "s2" }, simular: true }))).json();
    expect(crm.moveDealStage.mock.calls.every((c) => c[2].simular === true)).toBe(true);
    expect(historico.registrarMudancasEmLote).not.toHaveBeenCalled();
    expect(d.previa.caminhos).toEqual([{ de: "Proposta", para: "Negociação", quantidade: 2 }]);
    expect(d.desfazer).toBeUndefined();
  });

  it("filtro truncado no limite avisa", async () => {
    motor.idsDoFiltro.mockResolvedValue({ ids: ["d1"], truncado: true, avisos: [] });
    const d = await (await lotesDeNegocio(req({ acao: "mover", filtro: {}, parametros: { stageId: "s2" } }))).json();
    expect(d.truncado).toBe(true);
    expect(d.avisos.join(" ")).toMatch(/5\.000/);
  });

  it("etapa de outro contrato → 404", async () => {
    db.pipelineStage.findFirst.mockResolvedValue(null);
    expect((await lotesDeNegocio(req({ acao: "mover", ids: ["d1"], parametros: { stageId: "s-outra" } }))).status).toBe(404);
    expect(db.pipelineStage.findFirst.mock.calls[0][0].where).toEqual({ id: "s-outra", pipeline: { orgId: "org" } });
  });

  it("desfazer: volta cada um à etapa de antes, com reabrir", async () => {
    db.pipelineStage.findMany.mockResolvedValue([{ id: "s1", name: "Proposta" }]);
    db.deal.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, name: id, stageId: "s2", stage: { name: "Negociação" } })));
    const d = await (await lotesDeNegocio(req({ acao: "restaurar_etapa", parametros: { itens: [{ id: "d1", stageId: "s1" }] } }))).json();
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "s1", expect.objectContaining({ reabrir: true }));
    expect(d.ok).toBe(1);
  });
});

describe("POST /api/deals/lote — seleção por ids", () => {
  it("confere contrato e escopo; o que não bate fica de fora", async () => {
    escopo.donos = ["u1"];
    db.deal.findMany.mockResolvedValueOnce([{ id: "d1" }]);
    const d = await (await lotesDeNegocio(req({ acao: "arquivar", ids: ["d1", "d-outro"] }))).json();
    expect(db.deal.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["d1", "d-outro"] }, orgId: "org", ownerId: { in: ["u1"] } });
    expect(d.ignorados).toBe(1);
    expect(d.ok).toBe(1);
    expect(d.desfazer).toEqual({ acao: "desarquivar", ids: ["d1"], parametros: {} });
  });

  it("ids e filtro juntos → 400; ação desconhecida → 400", async () => {
    expect((await lotesDeNegocio(req({ acao: "mover", ids: ["d1"], filtro: {} }))).status).toBe(400);
    expect((await lotesDeNegocio(req({ acao: "explodir", ids: ["d1"] }))).status).toBe(400);
  });
});

describe("permissões por ação", () => {
  it("somente leitura não move (403)", async () => {
    sessao.atual = { orgId: "org", userId: "u1", role: "viewer" };
    const res = await lotesDeNegocio(req({ acao: "mover", ids: ["d1"], parametros: { stageId: "s2" } }));
    expect(res.status).toBe(403);
    expect(crm.moveDealStage).not.toHaveBeenCalled();
  });

  it("papel que edita mas não apaga: apagar → 403", async () => {
    sessao.atual = { orgId: "org", userId: "u1", role: "agent", permissoes: ["negocios:ver", "negocios:editar"] };
    expect((await lotesDeNegocio(req({ acao: "apagar", ids: ["d1"] }))).status).toBe(403);
    expect((await lotesDeNegocio(req({ acao: "arquivar", ids: ["d1"] }))).status).toBe(200);
  });

  it("sequência pede sequencias:gerenciar (atendente não tem)", async () => {
    expect((await lotesDeContato(req({ acao: "sequencia", ids: ["c1"], parametros: { sequenceId: "q1" } }))).status).toBe(403);
  });
});

describe("ganho e perdido", () => {
  it("perdido sem motivo → 400", async () => {
    expect((await lotesDeNegocio(req({ acao: "perdido", ids: ["d1"] }))).status).toBe(400);
  });

  it("perdido usa a etapa de perda do funil de cada negócio e o motivo da lista", async () => {
    db.pipelineStage.findMany.mockResolvedValue([{ id: "lost1", name: "Perdido", pipelineId: "p1" }]);
    await lotesDeNegocio(req({ acao: "perdido", ids: ["d1"], parametros: { motivoId: "m1", nota: "caro" } }));
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "lost1", expect.objectContaining({ perda: { motivoId: "m1", nota: "caro" } }));
  });
});

describe("POST /api/contacts/lote", () => {
  it("atribuir: só os que mudam, desfazer guarda o dono de antes", async () => {
    const d = await (await lotesDeContato(req({ acao: "atribuir", ids: ["c1", "c2"], parametros: { responsavelId: "u1" } }))).json();
    expect(d.ok).toBe(2);
    expect(db.contact.updateMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["c1", "c2"] }, orgId: "org" }, data: { ownerId: "u1" } });
    expect(d.desfazer).toEqual({ acao: "restaurar_responsavel", parametros: { itens: [{ id: "c1", responsavelId: null }, { id: "c2", responsavelId: null }] } });
  });

  it("atribuir para fora do escopo → 403; responsável de outro contrato → 404", async () => {
    escopo.donos = ["u1"];
    expect((await lotesDeContato(req({ acao: "atribuir", ids: ["c1"], parametros: { responsavelId: "u9" } }))).status).toBe(403);
    escopo.donos = null;
    expect((await lotesDeContato(req({ acao: "atribuir", ids: ["c1"], parametros: { responsavelId: "fantasma" } }))).status).toBe(404);
  });

  it("etiqueta: só quem não tinha; gatilho de sequência inscreve; desfazer remove", async () => {
    db.tag.findFirst.mockResolvedValue({ id: "t1" });
    db.contactTag.findMany.mockResolvedValue([{ contactId: "c1" }]);
    db.contactTag.createMany.mockResolvedValue({ count: 1 });
    db.sequence.count.mockResolvedValue(1);
    const d = await (await lotesDeContato(req({ acao: "etiqueta", ids: ["c1", "c2"], parametros: { tagId: "t1", modo: "adicionar" } }))).json();
    expect(db.contactTag.createMany).toHaveBeenCalledWith({ data: [{ contactId: "c2", tagId: "t1" }], skipDuplicates: true });
    expect(seq.enrollContactByTag).toHaveBeenCalledWith("c2", "t1");
    expect(d.desfazer).toEqual({ acao: "etiqueta", ids: ["c2"], parametros: { tagId: "t1", modo: "remover" } });
  });

  it("apagar sem a lixeira ativada → 409 (pede confirmação de definitivo)", async () => {
    lixeira.lixeiraDisponivel.mockResolvedValueOnce(false);
    const res = await lotesDeContato(req({ acao: "apagar", ids: ["c1"] }));
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe("lixeira_indisponivel");
    expect(lixeira.apagarComLixeira).not.toHaveBeenCalled();
  });

  it("apagar vai para a lixeira e o desfazer restaura em lote", async () => {
    lixeira.apagarComLixeira.mockImplementation(async ({ id }: { id: string }) => ({ lixeira: true, trashId: `t-${id}` }));
    const d = await (await lotesDeContato(req({ acao: "apagar", ids: ["c1", "c2"] }))).json();
    expect(lixeira.apagarComLixeira.mock.calls[0][0]).toMatchObject({ orgId: "org", entidade: "contact", seIndisponivel: "recusar" });
    expect(d.desfazer).toEqual({ acao: "restaurar_lixeira", parametros: { trashIds: ["t-c1", "t-c2"] } });

    lixeira.lerItemDaLixeira.mockResolvedValue({ entity: "contact", name: "Ana", ownerId: null, deletedById: "u1" });
    lixeira.restaurarDaLixeira.mockResolvedValue({ nome: "Ana", avisos: [] });
    const r = await (await lotesDeContato(req(d.desfazer))).json();
    expect(lixeira.restaurarDaLixeira).toHaveBeenCalledTimes(2);
    expect(lixeira.lerItemDaLixeira).toHaveBeenCalledWith("org", "t-c1");
    expect(r.ok).toBe(2);
  });
});
