import { describe, it, expect } from "vitest";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import {
  linhasDaPlanilha,
  linhasDosItens,
  csvDosNegocios,
  ordenarPorEtapa,
  resumoDaExportacao,
  type ItemParaExportar,
  type NegocioParaExportar,
} from "./negocios";

const etapas = [
  { id: "s2", name: "Proposta", type: "open", position: 1, probability: 50 },
  { id: "s1", name: "Novo", type: "open", position: 0, probability: 10 },
  { id: "s3", name: "Ganho", type: "won", position: 2, probability: 100 },
];

const def = (o: Partial<DefinicaoDeCampo>): DefinicaoDeCampo => ({
  id: o.key ?? "x",
  entity: "deal",
  pipelineId: null,
  key: "x",
  label: "X",
  type: "text",
  options: [],
  required: false,
  helpText: "",
  showOnCard: false,
  position: 0,
  ...o,
});

const defs = [
  def({ key: "imovel", label: "Tipo de imóvel", type: "select", options: [{ value: "apto", label: "Apartamento" }] }),
  def({ key: "consumo", label: "Consumo (kWh)", type: "number" }),
];

const negocio = (o: Partial<NegocioParaExportar>): NegocioParaExportar => ({
  id: "d",
  name: "Negócio",
  description: "",
  stageId: "s1",
  position: 0,
  amountCents: 0,
  probability: 0,
  lostReason: "",
  createdAt: "2026-10-01T15:00:00Z",
  stageSince: "2026-10-01T15:00:00Z",
  closedAt: null,
  expectedClosingAt: null,
  archivedAt: null,
  company: null,
  owner: null,
  contacts: [],
  nextTask: null,
  openTasks: 0,
  customFields: {},
  ...o,
});

const agora = new Date("2026-10-11T15:00:00Z");

describe("planilha de negócios", () => {
  it("ordena pela etapa (posição do funil) e depois pela posição no quadro", () => {
    const ns = [
      negocio({ id: "a", stageId: "s3" }),
      negocio({ id: "b", stageId: "s2", position: 1 }),
      negocio({ id: "c", stageId: "s2", position: 0 }),
      negocio({ id: "d", stageId: "s1" }),
    ];
    expect(ordenarPorEtapa(etapas, ns).map((n) => n.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("cabeçalho com as colunas fixas e um campo personalizado por coluna", () => {
    const [cab] = linhasDaPlanilha({ funil: "Vendas", etapas, negocios: [], defs, agora });
    expect(cab.slice(0, 4)).toEqual(["Funil", "Etapa", "Situação", "Negócio"]);
    expect(cab).toContain("Valor (número)");
    expect(cab).toContain("Dias na etapa");
    expect(cab.slice(-2)).toEqual(["Tipo de imóvel", "Consumo (kWh)"]);
  });

  it("monta a linha com valores formatados, contatos e campos personalizados", () => {
    const [, linha] = linhasDaPlanilha({
      funil: "Vendas",
      etapas,
      defs,
      agora,
      negocios: [
        negocio({
          name: "Solar Casa",
          stageId: "s3",
          amountCents: 1234567,
          probability: 40,
          closedAt: "2026-10-10T02:00:00Z",
          expectedClosingAt: "2026-10-20T12:00:00Z",
          stageSince: "2026-10-08T15:00:00Z",
          company: { id: "c", name: "Acme" },
          owner: { id: "u", name: "Ana" },
          contacts: [
            { id: "k1", name: "Marina", phone: "+5511999", email: "m@x.com" },
            { id: "k2", name: "João", phone: "", email: "j@x.com" },
          ],
          nextTask: { type: "ligar", text: "confirmar", dueAt: "2026-10-12T13:00:00Z" },
          openTasks: 2,
          customFields: { imovel: "apto", consumo: 480 },
        }),
      ],
    });
    const cab = linhasDaPlanilha({ funil: "Vendas", etapas, negocios: [], defs, agora })[0];
    const col = (nome: string) => linha[cab.indexOf(nome)];
    expect(col("Situação")).toBe("Ganho");
    expect(col("Etapa")).toBe("Ganho");
    expect(col("Valor")).toBe("R$ 12.345,67");
    expect(col("Valor (número)")).toBe("12345,67");
    expect(col("Valor ponderado")).toBe("R$ 4.938,27");
    expect(col("Fechado em")).toBe("09/10/2026");
    expect(col("Previsão de fechamento")).toBe("20/10/2026");
    expect(col("Dias na etapa")).toBe(3);
    expect(col("Outros contatos")).toBe("João (j@x.com)");
    expect(col("Próxima tarefa")).toBe("Ligar: confirmar");
    expect(col("Prazo da próxima tarefa")).toBe("12/10/2026 10:00");
    expect(col("Tipo de imóvel")).toBe("Apartamento");
    expect(col("Consumo (kWh)")).toBe("480");
  });

  it("CSV final: BOM, ; e aviso no fim quando cortado", () => {
    const csv = csvDosNegocios({ funil: "Vendas", etapas, negocios: [negocio({ name: 'Diz "oi"' })], defs: [], agora, aviso: "Cortado." });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(';"Diz ""oi""";');
    expect(csv.trimEnd().endsWith("Cortado.")).toBe(true);
  });

  it("coluna de arquivados só quando pedida", () => {
    const [cab] = linhasDaPlanilha({ funil: "V", etapas, negocios: [], defs: [], agora, comArquivados: true });
    expect(cab).toContain("Arquivado em");
  });

  const item = (o: Partial<ItemParaExportar>): ItemParaExportar => ({
    name: "Plano Pro",
    sku: "PRO",
    unit: "mês",
    recurrence: "mensal",
    unitPriceCents: 9_900,
    quantity: 2,
    discountType: "percentual",
    discountValue: 0,
    totalCents: 19_800,
    ...o,
  });

  it("coluna Produtos: lista resumida com a quantidade", () => {
    const [cab, linha] = linhasDaPlanilha({
      funil: "V",
      etapas,
      defs: [],
      agora,
      negocios: [negocio({ itens: [item({}), item({ name: "Implantação", quantity: 1.5 })] })],
    });
    expect(cab).toContain("Produtos");
    expect(linha[cab.indexOf("Produtos")]).toBe("2 × Plano Pro; 1,5 × Implantação");
  });

  it("coluna Produtos vazia sem itens (e sem quebrar negócio antigo)", () => {
    const [cab, linha] = linhasDaPlanilha({ funil: "V", etapas, defs: [], agora, negocios: [negocio({})] });
    expect(linha[cab.indexOf("Produtos")]).toBe("");
  });

  it("planilha de itens: uma linha por item, com o negócio repetido", () => {
    const linhas = linhasDosItens({
      funil: "Vendas",
      etapas,
      defs: [],
      agora,
      negocios: [
        negocio({ id: "a", name: "Solar", stageId: "s2", company: { id: "c", name: "Acme" }, itens: [item({}), item({ name: "Frete", sku: "", recurrence: "unico", unitPriceCents: 3_550, quantity: 1, discountType: "valor", discountValue: 550, totalCents: 3_000 })] }),
        negocio({ id: "b", name: "Sem itens" }),
      ],
    });
    const [cab, l1, l2] = linhas;
    expect(linhas).toHaveLength(3);
    const col = (l: unknown[], nome: string) => l[cab.indexOf(nome)];
    expect(col(l1, "Negócio")).toBe("Solar");
    expect(col(l1, "Empresa")).toBe("Acme");
    expect(col(l1, "Produto")).toBe("Plano Pro");
    expect(col(l1, "Quantidade")).toBe("2");
    expect(col(l1, "Recorrência")).toBe("Mensal");
    expect(col(l1, "Total")).toBe("R$ 198,00");
    expect(col(l2, "Produto")).toBe("Frete");
    expect(col(l2, "Desconto")).toBe("R$ 5,50");
    expect(col(l2, "Total (número)")).toBe("30,00");
  });

  it("resumo: aberto, ponderado e ganho a partir da data", () => {
    const r = resumoDaExportacao(
      etapas,
      [
        negocio({ stageId: "s1", amountCents: 1000, probability: 10 }),
        negocio({ stageId: "s3", amountCents: 5000, closedAt: "2026-10-05T00:00:00Z" }),
        negocio({ stageId: "s3", amountCents: 7000, closedAt: "2026-01-05T00:00:00Z" }),
      ],
      new Date("2026-10-01T00:00:00Z")
    );
    expect(r).toEqual({ abertos: 1, abertoCents: 1000, ponderadoCents: 100, ganhos: 1, ganhoCents: 5000 });
  });
});
