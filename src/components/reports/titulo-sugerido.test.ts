import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/crm/negocios/animacao/gsap", () => ({ CURVA: {}, gsap: {}, reduzMovimento: () => true, useGSAP: () => {} }));
vi.mock("@/components/reports/report-view", () => ({ ReportView: () => null, useReportResult: () => ({}) }));

import { tituloSugerido } from "./report-builder";
import { QUERY_PADRAO, camposDoDataset } from "@/lib/report-query";

describe("tituloSugerido", () => {
  it("põe o campo em minúscula, mas mantém sigla", () => {
    const q = { ...QUERY_PADRAO("contacts"), metrics: [{ op: "count" as const }] };
    expect(tituloSugerido({ ...q, groupBy: [{ field: "ddd_uf" }] }, camposDoDataset("contacts"))).toBe("Contagem de Contatos por UF (pelo DDD)");
    expect(tituloSugerido({ ...q, groupBy: [{ field: "source" }] }, camposDoDataset("contacts"))).toMatch(/por [a-z]/);
  });
});
