import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { normalizarFluxo, layoutDeCimaParaBaixo, condicaoValida, nomeDeVariavel, LAYOUT, type CatalogoFluxo } from "./fluxos";

const cat: CatalogoFluxo = {
  pipelines: [{ id: "p-b2b", name: "B2B", stages: [{ id: "st-novo", name: "Novo lead" }, { id: "st-prop", name: "Proposta" }] }],
  tags: [{ id: "tag-1", name: "Lead frio" }],
  camposContato: [{ key: "cargo", label: "Cargo", type: "text" }],
  camposNegocio: [{ key: "segmento", label: "Segmento", type: "text", pipelineId: null }],
  templates: [],
  canais: ["Instagram"],
};

const exemplo = {
  nodes: [
    { id: "s", bloco: "start" },
    { id: "nome", bloco: "capture", label: "Nome", detail: "Como posso te chamar?", captureField: "name" },
    { id: "zap", bloco: "capture", label: "WhatsApp", detail: "Qual seu WhatsApp?", captureField: "phone" },
    {
      id: "seg",
      bloco: "capture",
      label: "Segmento",
      detail: "Qual o seu segmento?",
      variableName: "segmento",
      options: [{ id: "o1", label: "Varejo" }, { id: "o2", label: "Indústria" }],
    },
    {
      id: "deal",
      bloco: "crm-deal",
      label: "Criar negócio",
      crmPipelineId: "p-b2b",
      crmStageId: "st-novo",
      crmDealName: "Negócio de {nome}",
      crmFieldMap: [{ key: "segmento", value: "{segmento}" }, { key: "inexistente", value: "x" }],
    },
    { id: "fim", bloco: "end", label: "Fim", detail: "Obrigado!" },
    { id: "humano", bloco: "human", label: "Atendente", detail: "Já te passo para alguém." },
  ],
  edges: [
    { source: "s", target: "nome" },
    { source: "nome", target: "zap" },
    { source: "zap", target: "seg" },
    { source: "zap", target: "humano", sourceHandle: "invalido" },
    { source: "seg", target: "deal", sourceHandle: "o1" },
    { source: "seg", target: "deal", sourceHandle: "Indústria" },
    { source: "deal", target: "fim" },
  ],
};

describe("normalizarFluxo", () => {
  it("monta o fluxo do lead do Instagram com ids novos, saídas certas e layout", () => {
    const r = normalizarFluxo(exemplo, cat);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes).toHaveLength(7);
    const ids = new Set(r.nodes.map((n) => n.id));
    expect(ids.size).toBe(7);
    expect(ids.has("s")).toBe(false); // ids refeitos: dá pra acrescentar sem colidir

    const porKind = (k: string) => r.nodes.filter((n) => n.data.iconKey === k);
    expect(porKind("start")).toHaveLength(1);
    const menu = r.nodes.find((n) => n.data.label === "Segmento")!;
    const opcoes = menu.data.options!;
    expect(opcoes.map((o) => o.label)).toEqual(["Varejo", "Indústria"]);
    // As duas opções viraram saídas com os ids novos (uma por rótulo).
    const saidasDoMenu = r.edges.filter((e) => e.source === menu.id).map((e) => e.sourceHandle).sort();
    expect(saidasDoMenu).toEqual(opcoes.map((o) => o.id).sort());

    const zap = r.nodes.find((n) => n.data.label === "WhatsApp")!;
    expect(r.edges.find((e) => e.source === zap.id && e.sourceHandle === "invalido")).toBeTruthy();

    const deal = porKind("crm-deal")[0];
    expect(deal.data).toMatchObject({ crmPipelineId: "p-b2b", crmStageId: "st-novo", variableName: "negocio_id" });
    expect(deal.data.crmFieldMap).toEqual([{ key: "segmento", value: "{segmento}" }]);
    expect(r.avisos.join(" ")).toMatch(/inexistente/);

    // Todas as arestas apontam para nós que existem.
    for (const e of r.edges) {
      expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    }
    // Layout de cima para baixo: o Início no topo.
    const inicio = porKind("start")[0];
    expect(inicio.position.y).toBe(0);
    expect(Math.max(...r.nodes.map((n) => n.position.y))).toBeGreaterThan(0);
  });

  it("descarta blocos desconhecidos e os que exigem configuração manual", () => {
    const r = normalizarFluxo(
      {
        nodes: [
          { id: "s", bloco: "start" },
          { id: "m", bloco: "message", detail: "Oi" },
          { id: "x", bloco: "teletransporte" },
          { id: "h", bloco: "http", httpUrl: "https://exemplo.com" },
          { id: "f", bloco: "end" },
        ],
        edges: [
          { source: "s", target: "m" },
          { source: "m", target: "x" },
          { source: "m", target: "f" },
          { source: "f", target: "h" },
        ],
      },
      cat
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.map((n) => n.data.iconKey).sort()).toEqual(["end", "message", "start"]);
    const avisos = r.avisos.join(" ");
    expect(avisos).toMatch(/desconhecido/);
    expect(avisos).toMatch(/Requisição HTTP/);
  });

  it("grafo desconexo: tira o que não é alcançável a partir do Início", () => {
    const r = normalizarFluxo(
      {
        nodes: [
          { id: "s", bloco: "start" },
          { id: "a", bloco: "message", label: "A", detail: "a" },
          { id: "b", bloco: "end", label: "B" },
          { id: "ilha", bloco: "message", label: "Ilha", detail: "solta" },
          { id: "ilha2", bloco: "end", label: "Ilha 2" },
        ],
        edges: [
          { source: "s", target: "a" },
          { source: "a", target: "b" },
          { source: "ilha", target: "ilha2" },
        ],
      },
      cat
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.map((n) => n.data.label)).toEqual(["Início", "A", "B"]);
    expect(r.avisos.join(" ")).toMatch(/Ilha/);
  });

  it("ids duplicados, dois Inícios, arestas soltas e repetidas", () => {
    const r = normalizarFluxo(
      {
        nodes: [
          { id: "s", bloco: "start" },
          { id: "s2", bloco: "start" },
          { id: "m", bloco: "message", detail: "um" },
          { id: "m", bloco: "message", detail: "dois" },
          { id: "f", bloco: "end" },
        ],
        edges: [
          { source: "s", target: "m" },
          { source: "m", target: "f" },
          { source: "m", target: "f" },
          { source: "m", target: "fantasma" },
          { source: "f", target: "m" },
          { source: "m", target: "s" },
        ],
      },
      cat
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.filter((n) => n.data.iconKey === "start")).toHaveLength(1);
    expect(r.nodes.find((n) => n.data.iconKey === "message")!.data.detail).toBe("um");
    expect(r.edges).toHaveLength(2);
    const avisos = r.avisos.join(" ");
    expect(avisos).toMatch(/mesmo id/);
    expect(avisos).toMatch(/mais de um Início/);
    expect(avisos).toMatch(/repetida/);
  });

  it("sem Início: cria um e liga no primeiro bloco", () => {
    const r = normalizarFluxo(
      { nodes: [{ id: "m", bloco: "message", detail: "Oi" }, { id: "f", bloco: "end" }], edges: [{ source: "m", target: "f" }] },
      cat
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inicio = r.nodes.find((n) => n.data.iconKey === "start")!;
    expect(inicio.data.hasTarget).toBe(false);
    expect(r.edges.some((e) => e.source === inicio.id)).toBe(true);
  });

  it("condição: saídas Sim/Não normalizadas e expressão conferida", () => {
    const r = normalizarFluxo(
      {
        nodes: [
          { id: "s", bloco: "start" },
          { id: "q", bloco: "capture", detail: "Orçamento?", variableName: "orcamento" },
          { id: "c", bloco: "condition", label: "Grande?", conditionExpression: "{orcamento} > 5000" },
          { id: "c2", bloco: "condition", label: "Estranha", conditionExpression: "orcamento maior que 5" },
          { id: "f", bloco: "end" },
          { id: "h", bloco: "human" },
        ],
        edges: [
          { source: "s", target: "q" },
          { source: "q", target: "c" },
          { source: "c", target: "h", sourceHandle: "sim" },
          { source: "c", target: "c2", sourceHandle: "nao" },
          { source: "c2", target: "f" },
          { source: "c2", target: "h", sourceHandle: "talvez" },
        ],
      },
      cat
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.nodes.find((n) => n.data.label === "Grande?")!;
    expect(r.edges.filter((e) => e.source === c.id).map((e) => e.sourceHandle).sort()).toEqual(["false", "true"]);
    const c2 = r.nodes.find((n) => n.data.label === "Estranha")!;
    expect(r.edges.filter((e) => e.source === c2.id).map((e) => e.sourceHandle)).toEqual(["true"]);
    expect(r.avisos.join(" ")).toMatch(/formato que o motor entende/);
  });

  it("ids de CRM de outra org são limpos com aviso", () => {
    const r = normalizarFluxo(
      {
        nodes: [
          { id: "s", bloco: "start" },
          { id: "t", bloco: "crm-tag", label: "Etiquetar", crmTagId: "tag-de-outra-org" },
          { id: "e", bloco: "crm-stage", label: "Mover", crmStageId: "st-de-outra-org" },
          { id: "f", bloco: "end" },
        ],
        edges: [{ source: "s", target: "t" }, { source: "t", target: "e" }, { source: "e", target: "f" }],
      },
      cat
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.find((n) => n.data.iconKey === "crm-tag")!.data.crmTagId).toBeUndefined();
    expect(r.nodes.find((n) => n.data.iconKey === "crm-stage")!.data.crmStageId).toBeUndefined();
    expect(r.avisos.join(" ")).toMatch(/etiqueta/);
  });

  it("espera: valor inválido vira 1, dias viram horas", () => {
    const r = normalizarFluxo(
      {
        nodes: [
          { id: "s", bloco: "start" },
          { id: "w", bloco: "wait", waitDuration: -5 },
          { id: "w2", bloco: "wait", waitDuration: 2, waitUnit: "dias" },
          { id: "f", bloco: "end" },
        ],
        edges: [{ source: "s", target: "w" }, { source: "w", target: "w2" }, { source: "w2", target: "f" }],
      },
      cat
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [w, w2] = r.nodes.filter((n) => n.data.iconKey === "wait");
    expect(w.data.waitDuration).toBe(1);
    expect(w2.data).toMatchObject({ waitDuration: 48, waitUnit: "horas" });
  });

  it("nada utilizável: recusa", () => {
    expect(normalizarFluxo({ nodes: [{ id: "x", bloco: "foo" }], edges: [] }, cat).ok).toBe(false);
    expect(normalizarFluxo(null, cat).ok).toBe(false);
    expect(normalizarFluxo([], cat).ok).toBe(false);
  });
});

describe("utilidades", () => {
  it("layout em camadas de cima para baixo, centrado", () => {
    const nodes = ["a", "b", "c"].map((id) => ({ id, position: { x: 99, y: 99 }, data: {} }));
    const out = layoutDeCimaParaBaixo(nodes, [
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "a", target: "c" },
    ]);
    expect(out.find((n) => n.id === "a")!.position).toEqual({ x: 0, y: 0 });
    expect(out.find((n) => n.id === "b")!.position).toEqual({ x: -LAYOUT.colunaX / 2, y: LAYOUT.linhaY });
    expect(out.find((n) => n.id === "c")!.position).toEqual({ x: LAYOUT.colunaX / 2, y: LAYOUT.linhaY });
  });

  it("condição e nome de variável", () => {
    expect(condicaoValida('{segmento} == "Varejo"')).toBe("segmento");
    expect(condicaoValida("{ok}")).toBe("ok");
    expect(condicaoValida("segmento = varejo")).toBeNull();
    expect(nomeDeVariavel("Segmento do Cliente")).toBe("segmento_do_cliente");
    expect(nomeDeVariavel("__proto__")).toBe("proto"); // vira um nome inofensivo
    expect(nomeDeVariavel("constructor")).toBe("");
  });
});
