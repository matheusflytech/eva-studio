import { describe, expect, it } from "vitest";
import { sanearFiltroCrm } from "@/lib/filtro-crm";
import { aplicarVisao, fimDoMes } from "./visoes";

const HOJE = "2026-10-19";

describe("visões fixas de negócios", () => {
  it("fim do mês, inclusive dezembro e fevereiro bissexto", () => {
    expect(fimDoMes("2026-10-19")).toBe("2026-10-31");
    expect(fimDoMes("2026-12-05")).toBe("2026-12-31");
    expect(fimDoMes("2028-02-10")).toBe("2028-02-29");
  });

  it("Todos não mexe no filtro; Meus soma o responsável aos rápidos", () => {
    const f = { logica: "e" as const, grupos: [], rapidos: [{ campo: "empresa", op: "qualquer" as const, valores: ["e1"] }] };
    expect(aplicarVisao(f, "todos", "u1", HOJE)).toEqual({ filtro: f, conflito: false });
    expect(aplicarVisao(f, "meus", "u1", HOJE).filtro.rapidos).toEqual([
      { campo: "responsavel", op: "qualquer", valores: ["u1"] },
      { campo: "empresa", op: "qualquer", valores: ["e1"] },
    ]);
  });

  it("Fechando este mês: aberto e previsão dentro do mês", () => {
    expect(aplicarVisao({ logica: "e", grupos: [] }, "fechando", "u1", HOJE).filtro.rapidos).toEqual([
      { campo: "tipoEtapa", op: "qualquer", valores: ["open"] },
      { campo: "previsao", op: "entre", valor: "2026-10-01", ate: "2026-10-31" },
    ]);
  });

  it("Precisam de atenção vira um grupo OU na frente dos avançados (e o servidor aceita)", () => {
    const av = { logica: "e" as const, grupos: [{ logica: "e" as const, condicoes: [{ campo: "valor", op: "gte" as const, valor: "1000" }] }] };
    const { filtro, conflito } = aplicarVisao(av, "atencao", "u1", HOJE);
    expect(conflito).toBe(false);
    expect(filtro.grupos[0].logica).toBe("ou");
    expect(filtro.grupos[0].condicoes.map((c) => c.campo)).toEqual(["parado", "tarefa", "previsao"]);
    expect(filtro.grupos[1]).toEqual(av.grupos[0]);
    expect(sanearFiltroCrm(filtro, "negocios").avisos).toEqual([]);
  });

  it("avançados em OU com vários grupos: a visão de atenção avisa conflito e não muda o sentido", () => {
    const av = {
      logica: "ou" as const,
      grupos: [
        { logica: "e" as const, condicoes: [{ campo: "valor", op: "gte" as const, valor: "1" }] },
        { logica: "e" as const, condicoes: [{ campo: "valor", op: "lte" as const, valor: "0" }] },
      ],
    };
    const r = aplicarVisao(av, "atencao", "u1", HOJE);
    expect(r.conflito).toBe(true);
    expect(r.filtro.grupos).toEqual(av.grupos);
    expect(r.filtro.logica).toBe("ou");
  });
});
