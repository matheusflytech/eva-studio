import { describe, expect, it } from "vitest";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { BOM } from "./csv";
import { csvDosContatos, linhasDosContatos, telefonesSecundarios, type ContatoParaExportar } from "./contatos";

const defs = [
  {
    id: "p",
    entity: "contact",
    pipelineId: null,
    key: "plano",
    label: "Plano",
    type: "select",
    options: [{ value: "pro", label: "Pro" }],
    required: false,
    helpText: "",
    showOnCard: false,
    position: 0,
  },
] as unknown as DefinicaoDeCampo[];

const contato = (o: Partial<ContatoParaExportar> = {}): ContatoParaExportar => ({
  name: "Ana Souza",
  email: "ana@x.com",
  phone: "5521981710669",
  phones: [{ value: "552131710669", label: "comercial" }],
  jobTitle: "Diretora",
  empresa: "Acme",
  proprietario: "Bruno",
  etiquetas: ["vip", "sp"],
  canais: ["whatsapp_meta", "whatsapp_meta", "instagram"],
  source: "importacao",
  optIn: true,
  lastSeenAt: "2026-10-19T15:30:00Z",
  createdAt: "2026-10-01T02:00:00Z",
  customFields: { plano: "pro" },
  ...o,
});

describe("planilha de contatos", () => {
  it("uma linha por contato, telefone formatado, datas em SP e campos personalizados no fim", () => {
    const [cab, linha] = linhasDosContatos([contato()], defs);
    expect(cab.slice(0, 3)).toEqual(["Nome", "E-mail", "Celular"]);
    expect(cab[cab.length - 1]).toBe("Plano");
    expect(linha).toEqual([
      "Ana Souza",
      "ana@x.com",
      "+55 21 98171-0669",
      "+55 21 3171-0669 (comercial)",
      "Diretora",
      "Acme",
      "Bruno",
      "vip, sp",
      "WhatsApp oficial, Instagram",
      "Importação",
      "Sim",
      "19/10/2026 12:30",
      "30/09/2026",
      "Pro",
    ]);
  });

  it("vazios não viram 'null'", () => {
    const [, linha] = linhasDosContatos([contato({ phone: "", phones: [], empresa: null, proprietario: null, customFields: {} })], defs);
    expect(linha[2]).toBe("");
    expect(linha[3]).toBe("");
    expect(linha[5]).toBe("");
    expect(linha[13]).toBe("");
  });

  it("CSV para o Excel pt-BR, com aviso de corte no fim", () => {
    const csv = csvDosContatos({ contatos: [contato({ name: "=HYPERLINK(1)" })], defs: [], aviso: "Limitado." });
    expect(csv.startsWith(BOM + "Nome;E-mail;")).toBe(true);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv.trimEnd().endsWith("Limitado.")).toBe(true);
  });

  it("telefones secundários aceitam lixo", () => {
    expect(telefonesSecundarios("x")).toBe("");
    expect(telefonesSecundarios([{ value: "" }, null, { value: "+351912345678" }])).toBe("+351 912 345 678");
  });
});
