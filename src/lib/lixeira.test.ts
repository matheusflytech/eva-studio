import { describe, it, expect } from "vitest";
import {
  corpoParaDesfazer,
  diasRestantes,
  expiraEm,
  paraJson,
  planejarContato,
  planejarEmpresa,
  planejarNegocio,
  resumoDaFoto,
  textoDeExpiracao,
  tituloDaMudanca,
  type ExistentesDoContato,
  type ExistentesDoNegocio,
  type FotoDaEmpresa,
  type FotoDoContato,
  type FotoDoNegocio,
} from "./lixeira";

const AGORA = new Date("2026-10-20T12:00:00Z");

function fotoDoNegocio(extra: Partial<FotoDoNegocio> = {}): FotoDoNegocio {
  return {
    versao: 1,
    entidade: "deal",
    registro: { id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s-lost", companyId: "co1", ownerId: "u1", name: "Acme", probability: 0, closedAt: "2026-10-01T00:00:00.000Z", lostReason: "Preço" },
    contexto: { etapa: "Perdido", funil: "Vendas", empresa: "Acme SA" },
    contatos: [{ contactId: "c1", role: "decisor" }, { contactId: "c-sumiu", role: "" }],
    tarefas: [{ id: "t1", dealId: "d1", contactId: "c-sumiu", assignedToId: "u-saiu", text: "Ligar" }],
    notas: [{ id: "n1", dealId: "d1", contactId: "c1", authorId: "u1", text: "Oi" }],
    eventos: [{ id: "e1", dealId: "d1", toStageId: "s-lost" }],
    itens: [{ id: "i1", dealId: "d1", productId: "prod-sumiu", name: "Plano" }],
    valorManual: { dealId: "d1", manualAmount: true },
    perda: { dealId: "d1", reasonLabel: "Preço" },
    atividade: { dealId: "d1", lastActivityAt: "2026-10-01T00:00:00.000Z" },
    externos: [{ source: "api", externalId: "erp-1" }, { source: "api", externalId: "erp-2" }],
    ...extra,
  };
}

function existentesDoNegocio(extra: Partial<ExistentesDoNegocio> = {}): ExistentesDoNegocio {
  return {
    etapaOriginal: { id: "s-lost", pipelineId: "p1", type: "lost", probability: 0 },
    etapaDeEntrada: { id: "s-novo", pipelineId: "p1", type: "open", probability: 10 },
    empresas: new Set(["co1"]),
    pessoas: new Set(["u1"]),
    contatos: new Set(["c1"]),
    produtos: new Set(),
    externosOcupados: new Set(["api|erp-2"]),
    agora: AGORA,
    ...extra,
  };
}

describe("planejarNegocio", () => {
  it("tudo existe: recria igual (mesmos ids), sem aviso de etapa", () => {
    const p = planejarNegocio(fotoDoNegocio(), existentesDoNegocio());
    if (!p.ok) throw new Error(p.erro);
    expect(p.registro).toMatchObject({ id: "d1", stageId: "s-lost", companyId: "co1", ownerId: "u1" });
    expect(p.perda).toEqual({ dealId: "d1", reasonLabel: "Preço" });
    expect(p.eventoNovo).toBeNull();
    expect(p.eventos).toEqual([{ id: "e1", dealId: "d1", toStageId: "s-lost" }]);
    expect(p.valorManual).toEqual({ dealId: "d1", manualAmount: true });
  });

  it("etapa apagada: vai para a primeira etapa aberta, reabre e avisa", () => {
    const p = planejarNegocio(fotoDoNegocio(), existentesDoNegocio({ etapaOriginal: null }));
    if (!p.ok) throw new Error(p.erro);
    expect(p.registro).toMatchObject({ stageId: "s-novo", pipelineId: "p1", probability: 10, closedAt: null, lostReason: "" });
    expect(p.registro.stageSince).toBe(AGORA.toISOString());
    expect(p.perda).toBeNull();
    expect(p.eventoNovo).toEqual({ fromStageId: "s-lost", toStageId: "s-novo", pipelineId: "p1" });
    expect(p.avisos.join(" ")).toContain('A etapa "Perdido" não existe mais');
  });

  it("funil apagado: vai para outro funil e avisa", () => {
    const p = planejarNegocio(fotoDoNegocio(), existentesDoNegocio({ etapaOriginal: null, etapaDeEntrada: { id: "x1", pipelineId: "p2", type: "open", probability: 5 } }));
    if (!p.ok) throw new Error(p.erro);
    expect(p.registro.pipelineId).toBe("p2");
    expect(p.avisos.join(" ")).toContain('O funil "Vendas" não existe mais');
  });

  it("sem etapa aberta nenhuma: não restaura", () => {
    const p = planejarNegocio(fotoDoNegocio(), existentesDoNegocio({ etapaOriginal: null, etapaDeEntrada: null }));
    expect(p.ok).toBe(false);
  });

  it("empresa, responsável, contato, produto e pessoa da tarefa sumidos: solta o vínculo e avisa", () => {
    const p = planejarNegocio(fotoDoNegocio(), existentesDoNegocio({ empresas: new Set(), pessoas: new Set() }));
    if (!p.ok) throw new Error(p.erro);
    expect(p.registro.companyId).toBeNull();
    expect(p.registro.ownerId).toBeNull();
    expect(p.contatos).toEqual([{ contactId: "c1", role: "decisor" }]);
    expect(p.tarefas[0]).toMatchObject({ id: "t1", dealId: "d1", contactId: null, assignedToId: null });
    expect(p.notas[0]).toMatchObject({ id: "n1", contactId: "c1", authorId: null });
    expect(p.itens[0]).toMatchObject({ id: "i1", productId: null, name: "Plano" });
    expect(p.externos).toEqual([{ source: "api", externalId: "erp-1" }]);
    const texto = p.avisos.join(" ");
    expect(texto).toContain('A empresa "Acme SA" não existe mais');
    expect(texto).toContain("responsável");
    expect(texto).toContain("1 contato não existe");
    expect(texto).toContain("1 id externo");
  });
});

function fotoDoContato(): FotoDoContato {
  return {
    versao: 1,
    entidade: "contact",
    registro: { id: "c1", orgId: "o1", companyId: "co1", ownerId: "u1", name: "Ana" },
    contexto: { empresa: "Acme" },
    canais: [
      { id: "ch1", contactId: "c1", agentId: "a1", channel: "whatsapp_qr", externalId: "5511" },
      { id: "ch2", contactId: "c1", agentId: "a1", channel: "instagram", externalId: "ig1" },
      { id: "ch3", contactId: "c1", agentId: "a-sumiu", channel: "telegram", externalId: "t1" },
    ],
    etiquetas: [{ tagId: "tag1", addedAt: "2026-01-01" }, { tagId: "tag-sumiu", addedAt: "2026-01-01" }],
    negocios: [{ dealId: "d1", role: "" }, { dealId: "d-sumiu", role: "" }],
    tarefas: [{ id: "t1", contactId: "c1", dealId: "d-sumiu", assignedToId: "u1" }],
    notas: [{ id: "n1", contactId: "c1", dealId: "d1", authorId: "u1" }],
    inscricoes: [{ id: "en1", sequenceId: "seq1", contactId: "c1" }, { id: "en2", sequenceId: "seq-sumiu", contactId: "c1" }],
    conversas: ["cv1", "cv2"],
    externos: [],
  };
}

describe("planejarContato", () => {
  const base: ExistentesDoContato = {
    empresas: new Set(["co1"]),
    pessoas: new Set(["u1"]),
    etiquetas: new Set(["tag1"]),
    negocios: new Set(["d1"]),
    sequencias: new Set(["seq1"]),
    agentes: new Set(["a1"]),
    canaisOcupados: new Set(["a1|whatsapp_qr|5511"]),
    conversasLivres: new Set(["cv1"]),
    externosOcupados: new Set(),
  };

  it("reata o que existe e avisa canal ocupado, negócio sumido e conversa presa", () => {
    const p = planejarContato(fotoDoContato(), base);
    expect(p.registro).toMatchObject({ id: "c1", companyId: "co1", ownerId: "u1" });
    expect(p.canais.map((c) => c.id)).toEqual(["ch2"]);
    expect(p.etiquetas.map((t) => t.tagId)).toEqual(["tag1"]);
    expect(p.negocios).toEqual([{ dealId: "d1", role: "" }]);
    expect(p.tarefas[0]).toMatchObject({ id: "t1", contactId: "c1", dealId: null });
    expect(p.notas[0]).toMatchObject({ id: "n1", dealId: "d1" });
    expect(p.inscricoes.map((i) => i.id)).toEqual(["en1"]);
    expect(p.conversas).toEqual(["cv1"]);
    const texto = p.avisos.join(" ");
    expect(texto).toContain("1 canal já pertence a outra ficha");
    expect(texto).toContain("1 negócio ligado não existe");
    expect(texto).toContain("1 conversa já está ligada");
  });

  it("empresa apagada: volta sem empresa", () => {
    const p = planejarContato(fotoDoContato(), { ...base, empresas: new Set() });
    expect(p.registro.companyId).toBeNull();
    expect(p.avisos[0]).toContain('A empresa "Acme" não existe mais');
  });
});

describe("planejarEmpresa", () => {
  it("reata só contatos/negócios que continuam sem empresa", () => {
    const foto: FotoDaEmpresa = {
      versao: 1,
      entidade: "company",
      registro: { id: "co1", ownerId: "u1", name: "Acme" },
      contatos: ["c1", "c2"],
      negocios: ["d1"],
      externos: [],
    };
    const p = planejarEmpresa(foto, { pessoas: new Set(["u1"]), contatosLivres: new Set(["c1"]), negociosLivres: new Set(["d1"]), externosOcupados: new Set() });
    expect(p.contatos).toEqual(["c1"]);
    expect(p.negocios).toEqual(["d1"]);
    expect(p.avisos.join(" ")).toContain("1 vínculo não voltou");
  });
});

describe("expiração e resumo", () => {
  it("30 dias por padrão; dias restantes arredondam para cima e nunca ficam negativos", () => {
    const fim = expiraEm(AGORA);
    expect(fim.toISOString()).toBe("2026-11-19T12:00:00.000Z");
    expect(diasRestantes(fim, AGORA)).toBe(30);
    expect(diasRestantes(new Date(AGORA.getTime() + 3_600_000), AGORA)).toBe(1);
    expect(diasRestantes(new Date(AGORA.getTime() - 1), AGORA)).toBe(0);
    expect(textoDeExpiracao(fim.toISOString(), AGORA)).toBe("Expira em 30 dias");
    expect(textoDeExpiracao(AGORA, AGORA)).toBe("Expira hoje");
  });

  it("resumo conta o que foi junto", () => {
    expect(resumoDaFoto(fotoDoNegocio())).toBe("Vendas › Perdido · 1 tarefa · 1 nota · 1 produto · 2 contatos");
  });

  it("paraJson: datas viram ISO", () => {
    expect(paraJson({ d: new Date("2026-01-01T00:00:00Z") })).toEqual({ d: "2026-01-01T00:00:00.000Z" });
  });
});

describe("desfazer mudança de etapa", () => {
  const aberta = { id: "s1", name: "Proposta", type: "open" };
  const outra = { id: "s2", name: "Negociação", type: "open" };
  const ganho = { id: "w", name: "Ganho", type: "won" };
  const perdido = { id: "l", name: "Perdido", type: "lost" };

  it("mover entre abertas: volta para a anterior", () => {
    expect(corpoParaDesfazer(aberta, outra)).toEqual({ stageId: "s1" });
    expect(tituloDaMudanca(outra)).toBe("Movido para Negociação");
  });

  it("ganho/perdido: reabre na etapa anterior", () => {
    expect(corpoParaDesfazer(aberta, ganho)).toEqual({ stageId: "s1", reabrir: true });
    expect(corpoParaDesfazer(aberta, perdido)).toEqual({ stageId: "s1", reabrir: true });
    expect(tituloDaMudanca(perdido)).toBe("Marcado como perdido");
  });

  it("reabrir um ganho: desfazer volta para ganho; reabrir um perdido não tem desfazer", () => {
    const reaberto = { id: "", name: "", type: "open" };
    expect(corpoParaDesfazer(ganho, reaberto)).toEqual({ stageId: "w" });
    expect(corpoParaDesfazer(perdido, reaberto)).toBeNull();
    expect(tituloDaMudanca(reaberto)).toBe("Negócio reaberto");
  });

  it("sem etapa de origem ou mesma etapa: nada a desfazer", () => {
    expect(corpoParaDesfazer(undefined, aberta)).toBeNull();
    expect(corpoParaDesfazer(aberta, aberta)).toBeNull();
  });
});
