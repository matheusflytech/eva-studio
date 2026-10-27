import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/server/conversas", () => ({ CANAIS_DE_TESTE: ["playground", "builder_preview"] }));

import { montarSql } from "./report-sql";
import { sanearReportQuery, vizPermitidas, QUERY_PADRAO, DATASETS, BASES_COM_FILTROS_DO_PAINEL, type ReportQuery } from "@/lib/report-query";

const q = (parcial: Partial<ReportQuery>): ReportQuery => sanearReportQuery({ ...QUERY_PADRAO(), ...parcial })!;
const plano = (s: { text: string }) => s.text.replace(/\s+/g, " ");

describe("sanearReportQuery", () => {
  it("descarta base, campo, operador e métrica que não existem", () => {
    expect(sanearReportQuery({ dataset: "senhas" })).toBeNull();
    const r = sanearReportQuery({
      dataset: "deals",
      columns: ["name", "x; DROP TABLE", "cf:origem_lead", "cf:Nope!"],
      filters: { logic: "or", conditions: [{ field: "amount", op: "gt", value: "10" }, { field: "amount", op: "rm -rf" }] },
      metrics: [{ op: "sum", field: "amount" }, { op: "sum" }, { op: "eval", field: "amount" }],
      groupBy: [{ field: "created", grain: "month" }, { field: "created", grain: "século" }, { field: "nada" }],
      sort: [{ key: "m0", dir: "asc" }, { key: "m3", dir: "desc" }],
      limit: 999999,
    })!;
    expect(r.columns).toEqual(["name", "cf:origem_lead"]);
    expect(r.filters).toEqual({ logic: "or", conditions: [{ field: "amount", op: "gt", value: "10" }] });
    expect(r.metrics).toEqual([{ op: "sum", field: "amount" }]);
    expect(r.groupBy).toEqual([{ field: "created", grain: "month" }, { field: "created" }]);
    expect(r.sort).toEqual([{ key: "m0", dir: "asc" }]);
    expect(r.limit).toBe(1000);
  });

  it("campo personalizado só entra na base que tem campos personalizados", () => {
    expect(sanearReportQuery({ dataset: "tasks", columns: ["cf:origem"] })!.columns).toEqual([]);
  });
});

describe("vizPermitidas", () => {
  it("decide os gráficos pelo formato do resultado", () => {
    expect(vizPermitidas(q({ metrics: [] }))).toEqual(["table", "detail"]);
    expect(vizPermitidas(q({ metrics: [{ op: "count" }] }))).toEqual(["number", "gauge", "progress", "table"]);
    expect(vizPermitidas(q({ groupBy: [{ field: "stage" }] }))).toContain("pie");
    expect(vizPermitidas(q({ groupBy: [{ field: "stage" }, { field: "owner" }] }))).not.toContain("pie");
    expect(vizPermitidas(q({ groupBy: [{ field: "stage" }, { field: "owner" }] }))).toContain("sankey");
    expect(vizPermitidas(q({ groupBy: [{ field: "stage" }] }))).not.toContain("trend");
    expect(vizPermitidas(q({ groupBy: [{ field: "created", grain: "month" }] }))).toContain("trend");
    expect(vizPermitidas(q({ groupBy: [{ field: "owner" }], metrics: [{ op: "count" }, { op: "sum", field: "amount" }] }))).toEqual(
      expect.arrayContaining(["combo", "scatter"])
    );
  });

  it("meta só fica no Indicador e no Progresso", async () => {
    const { sanearRelatorio } = await import("@/lib/report-query");
    const query = { ...QUERY_PADRAO(), metrics: [{ op: "count" }] };
    expect(sanearRelatorio({ query, viz: "gauge", meta: 50 })?.meta).toBe(50);
    expect(sanearRelatorio({ query, viz: "gauge", meta: -1 })?.meta).toBeUndefined();
    expect(sanearRelatorio({ query, viz: "number", meta: 50 })?.meta).toBeUndefined();
  });
});

describe("montarSql", () => {
  it("toda consulta começa presa ao contrato e manda valor como parâmetro", () => {
    const m = montarSql("org-1", q({ filters: { logic: "and", conditions: [{ field: "name", op: "contains", value: "50%' OR 1=1" }] } }))!;
    expect(plano(m.sql)).toContain(`WHERE d."orgId" = $1 AND d."archivedAt" IS NULL`);
    expect(m.sql.values[0]).toBe("org-1");
    expect(m.sql.values).toContain("%50\\%' OR 1=1%");
    expect(m.sql.text).not.toContain("OR 1=1");
  });

  it("contagem por etapa: agrupa, ordena pela métrica e pede uma linha a mais", () => {
    const m = montarSql("o", q({ groupBy: [{ field: "stage" }], limit: 10 }))!;
    const s = plano(m.sql);
    expect(s).toMatch(/^SELECT ds\.name AS c0, COUNT\(\*\)::float8 AS c1 FROM eva_studio_deals d/);
    expect(s).toContain("GROUP BY 1 ORDER BY c1 DESC NULLS LAST LIMIT $2");
    expect(m.sql.values.at(-1)).toBe(11);
    expect(m.columns.map((c) => [c.label, c.role])).toEqual([["Etapa", "dimension"], ["Contagem", "metric"]]);
  });

  it("data agrupada por mês no horário de São Paulo, em ordem cronológica", () => {
    const m = montarSql("o", q({ groupBy: [{ field: "created", grain: "month" }], metrics: [{ op: "sum", field: "amount" }] }))!;
    const s = plano(m.sql);
    expect(s).toContain(`to_char(date_trunc($1, (d."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))`);
    expect(m.sql.values[0]).toBe("month");
    expect(s).toContain(`SUM((d."amountCents" / 100.0)::float8)::float8 AS c1`);
    expect(s).toContain("ORDER BY c0 ASC");
    expect(m.columns[0].label).toBe("Criado em (por mês)");
    expect(m.columns[1]).toMatchObject({ label: "Soma de Valor", type: "money" });
  });

  it("junção Negócios ↔ Tarefas e filtro OU", () => {
    const m = montarSql("o", q({
      dataset: "deals_tasks",
      metrics: [],
      columns: ["deal_name", "task_status"],
      filters: { logic: "or", conditions: [{ field: "task_type", op: "in", values: ["Ligação", "Reunião"] }, { field: "deal_amount", op: "gte", value: "1000" }] },
    }))!;
    const s = plano(m.sql);
    expect(s).toContain(`FROM eva_studio_tasks t JOIN eva_studio_deals d ON d.id = t."dealId"`);
    expect(s).toMatch(/ AND \(.+ = ANY\(\$2::text\[\]\) OR .+ >= \$3\)/);
    expect(m.sql.values.slice(1, 3)).toEqual([["Ligação", "Reunião"], 1000]);
    expect(m.columns.map((c) => c.key)).toEqual(["deal_name", "task_status"]);
  });

  it("filtro sem valor não filtra; período do painel usa os filtros globais", () => {
    const vazio = montarSql("o", q({ filters: { logic: "and", conditions: [{ field: "name", op: "eq", value: " " }] } }))!;
    expect(plano(vazio.sql)).not.toContain(" AND (");
    const painel = montarSql("o", q({ filters: { logic: "and", conditions: [{ field: "created", op: "panel" }] } }), {
      globais: { dias: 7, funis: [], donos: [] },
    })!;
    expect(plano(painel.sql)).toContain(`(now() AT TIME ZONE 'America/Sao_Paulo')::date - $2::int`);
    expect(painel.sql.values[1]).toBe(6);
  });

  it("funis e responsáveis da barra valem nas bases de negócio, e só nelas", () => {
    const globais = { dias: 30, funis: ["p1"], donos: ["u1", "__nenhum"] };
    const m = montarSql("o", q({ metrics: [{ op: "count" }] }), { globais })!;
    expect(plano(m.sql)).toContain(`AND d."pipelineId" = ANY($2::text[]) AND (d."ownerId" = ANY($3::text[]) OR d."ownerId" IS NULL)`);
    expect(m.sql.values.slice(1, 3)).toEqual([["p1"], ["u1"]]);
    const perdas = montarSql("o", q({ dataset: "deal_losses", metrics: [{ op: "count" }] }), { globais })!;
    expect(plano(perdas.sql)).toContain(`l."pipelineId" = ANY(`);
    const contatos = montarSql("o", q({ dataset: "contacts", metrics: [{ op: "count" }] }), { globais })!;
    expect(plano(contatos.sql)).not.toContain("ANY(");
  });

  it("UF pelo DDD: tira o 55, aceita 10 a 13 dígitos e vai para o mapa", () => {
    const m = montarSql("o", q({ dataset: "contacts", metrics: [{ op: "count" }], groupBy: [{ field: "ddd_uf" }] }))!;
    const s = plano(m.sql);
    expect(s).toContain(`WHEN length(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g')) IN (12, 13)`);
    expect(s).toContain(`WHEN '47' THEN 'SC'`);
    expect(s).toContain(`WHEN '11' THEN 'SP'`);
    expect(vizPermitidas(q({ dataset: "contacts", metrics: [{ op: "count" }], groupBy: [{ field: "ddd_uf" }] }))).toContain("map");
    expect(vizPermitidas(q({ dataset: "contacts", metrics: [{ op: "count" }], groupBy: [{ field: "ddd" }] }))).not.toContain("map");
    expect(vizPermitidas(q({ dataset: "companies", metrics: [{ op: "count" }], groupBy: [{ field: "uf" }] }))).toContain("map");
  });

  it("toda base marcada para os filtros do painel tem as colunas no motor", () => {
    const globais = { dias: 30, funis: ["p1"], donos: [] };
    for (const d of DATASETS) {
      const m = montarSql("o", q({ dataset: d.key, metrics: [{ op: "count" }] }), { globais })!;
      expect(plano(m.sql).includes("ANY("), d.key).toBe(BASES_COM_FILTROS_DO_PAINEL.has(d.key));
    }
  });

  it("campo personalizado de lista mostra o rótulo da opção; chave vai como parâmetro", () => {
    const m = montarSql("o", q({ groupBy: [{ field: "cf:origem" }] }), {
      personalizados: [{ key: "origem", label: "Origem", type: "select", options: [{ value: "ig", label: "Instagram" }] }],
    })!;
    expect(plano(m.sql)).toContain(`(CASE (d."customFields" ->> $1::text) WHEN $2 THEN $3`);
    expect(m.sql.values.slice(0, 3)).toEqual(["origem", "ig", "Instagram"]);
    expect(m.columns[0].label).toBe("Origem");
  });

  it("campo personalizado que não existe mais some da consulta", () => {
    const m = montarSql("o", q({ groupBy: [{ field: "cf:apagado" }] }))!;
    expect(m.columns.map((c) => c.key)).toEqual(["m0"]);
  });

  it("opções marcadas: uma linha por opção, só de campo de múltipla escolha do contrato", () => {
    const m = montarSql("o", q({ dataset: "deals_multiselect", groupBy: [{ field: "option" }] }))!;
    const s = plano(m.sql);
    expect(s).toContain(`mcf."orgId" = d."orgId" AND mcf.entity = 'deal'`);
    expect(s).toContain(`mcf.type = 'multiselect'`);
    expect(s).toContain(`jsonb_array_elements_text`);
    expect(s).toContain(`WHERE d."orgId" = $1`);
    expect(montarSql("o", q({ dataset: "contacts_multiselect", metrics: [] }))!.columns.map((c) => c.key)).toEqual(["contact_name", "field", "option", "contact_created"]);
  });

  it("conversas deixam de fora os canais de teste", () => {
    const m = montarSql("o", q({ dataset: "conversations" }))!;
    expect(plano(m.sql)).toContain(`cv.channel <> ALL($2)`);
    expect(m.sql.values[1]).toEqual(["playground", "builder_preview"]);
  });
});

describe("seriesDoResultado", () => {
  it("dois agrupamentos viram categorias × séries, com buraco onde não há dado", async () => {
    const { seriesDoResultado } = await import("@/lib/report-query");
    const r = seriesDoResultado({
      columns: [
        { key: "created", label: "Criado em (por mês)", type: "date", role: "dimension", grain: "month" },
        { key: "owner", label: "Responsável", type: "text", role: "dimension" },
        { key: "m0", label: "Soma de Valor", type: "money", role: "metric" },
      ],
      rows: [["2026-09-01", "Ana", 100], ["2026-10-01", "Ana", 50], ["2026-10-01", null, 7]],
      truncated: false,
    });
    expect(r.categorias).toEqual(["set/26", "out/26"]);
    expect(r.series).toEqual([
      { nome: "Ana", tipo: "money", valores: [100, 50] },
      { nome: "(vazio)", tipo: "money", valores: [null, 7] },
    ]);
  });

  it("formata sem inventar zero", async () => {
    const { formatarValor } = await import("@/lib/report-query");
    expect(formatarValor(null, "money")).toBe("—");
    expect(formatarValor(1234.5, "money")).toBe("R$ 1.234,50");
    expect(formatarValor("2026-10-26 00:00", "date")).toBe("26/10/2026");
  });
});

describe("seriesDoResultado sem data", () => {
  it("grupo sem data sai do eixo do tempo e é contado", async () => {
    const { seriesDoResultado } = await import("@/lib/report-query");
    const r = seriesDoResultado({
      columns: [
        { key: "closed", label: "Fechado em (por mês)", type: "date", role: "dimension", grain: "month" },
        { key: "m0", label: "Contagem", type: "number", role: "metric" },
      ],
      rows: [["2026-10-01", 3], [null, 84]],
      truncated: false,
    });
    expect(r.categorias).toEqual(["out/26"]);
    expect(r.semData).toBe(1);
  });
});

describe("visuais da Fase 2", () => {
  const col = (key: string, role: "dimension" | "metric", type: "text" | "number" = role === "metric" ? "number" : "text") => ({ key, label: key, type, role });

  it("Sankey tira a ligação que fecharia um ciclo (fica a de maior valor)", async () => {
    const { ligacoesDoSankey } = await import("@/lib/report-query");
    const r = ligacoesDoSankey({
      columns: [col("de", "dimension"), col("para", "dimension"), col("m0", "metric")],
      rows: [["A", "B", 10], ["B", "C", 5], ["C", "A", 2], ["B", "B", 1], ["A", "C", 0]],
      truncated: false,
    });
    expect(r.ligacoes).toEqual([{ source: "A", target: "B", value: 10 }, { source: "B", target: "C", value: 5 }]);
    expect(r.descartadas).toBe(2);
    expect(r.nos).toEqual(["A", "B", "C"]);
  });

  it("Cascata acumula e desce com valor negativo", async () => {
    const { degrausDaCascata } = await import("@/lib/report-query");
    expect(degrausDaCascata([10, -4, null, 6])).toEqual([
      { base: 0, valor: 10, acumulado: 10 },
      { base: 6, valor: 4, acumulado: 6 },
      { base: 6, valor: 0, acumulado: 6 },
      { base: 6, valor: 6, acumulado: 12 },
    ]);
  });

  it("Tendência compara o último período com o anterior", async () => {
    const { tendencia } = await import("@/lib/report-query");
    const t = tendencia({
      columns: [{ key: "created", label: "Mês", type: "date", role: "dimension", grain: "month" }, col("m0", "metric")],
      rows: [["2026-09-01", 80], ["2026-10-01", 100]],
      truncated: false,
    });
    expect(t).toMatchObject({ atual: 100, anterior: 80, variacao: 0.25, rotuloAtual: "out/26", rotuloAnterior: "set/26" });
  });

  it("Tabela dinâmica: linhas do 1º agrupamento, colunas do 2º", async () => {
    const { tabelaDinamica } = await import("@/lib/report-query");
    const p = tabelaDinamica({
      columns: [col("etapa", "dimension"), col("dono", "dimension"), col("m0", "metric")],
      rows: [["Nova", "Ana", 2], ["Ganho", "Bia", 1]],
      truncated: false,
    });
    expect(p).toEqual({ linhas: ["Nova", "Ganho"], colunas: ["Ana", "Bia"], celulas: [[2, null], [null, 1]], tipo: "number" });
  });
});
