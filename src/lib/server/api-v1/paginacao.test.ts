import { describe, it, expect } from "vitest";
import { ErroApi } from "./http";
import { codificarCursor, decodificarCursor, hashDosFiltros, lerConsulta, lerLimite, paginar } from "./paginacao";

type Linha = { id: string; updatedAt: Date };

// Banco em memória que entende exatamente a condição que paginar() monta.
function bancoEmMemoria(linhas: Linha[]) {
  const depois = (l: Linha, c?: Record<string, unknown>) => {
    if (!c) return true;
    const [a, b] = (c.OR as Array<Record<string, unknown>>) ?? [];
    const gt = (a.updatedAt as { gt: Date }).gt.getTime();
    const igual = (b.updatedAt as Date).getTime();
    const idGt = (b.id as { gt: string }).gt;
    return l.updatedAt.getTime() > gt || (l.updatedAt.getTime() === igual && l.id > idGt);
  };
  return async ({ cursor, take }: { cursor?: Record<string, unknown>; take: number }) =>
    linhas
      .filter((l) => depois(l, cursor))
      .sort((x, y) => x.updatedAt.getTime() - y.updatedAt.getTime() || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
      .slice(0, take);
}

describe("paginação por cursor (contrato)", () => {
  it("percorre tudo: soma das páginas = COUNT, sem repetição, has_more=false no fim", async () => {
    const base = Date.UTC(2026, 9, 1);
    // 523 linhas, muitas com o MESMO updatedAt (é onde cursor por data sozinha entra em ciclo).
    const linhas: Linha[] = Array.from({ length: 523 }, (_, i) => ({
      id: `id-${String((i * 7919) % 1000).padStart(4, "0")}-${i}`,
      updatedAt: new Date(base + Math.floor(i / 10) * 1000),
    }));
    const buscar = bancoEmMemoria(linhas);

    const vistos = new Set<string>();
    let cursor: string | null = null;
    let paginas = 0;
    for (;;) {
      const sp: URLSearchParams = new URLSearchParams({ limit: "50", updated_since: "2026-01-01T00:00:00Z", ...(cursor ? { cursor } : {}) });
      const p: Awaited<ReturnType<typeof paginar<Linha>>> = await paginar({ sp, campo: "updatedAt", buscar });
      for (const l of p.itens) {
        expect(vistos.has(l.id)).toBe(false);
        vistos.add(l.id);
      }
      paginas += 1;
      expect(paginas).toBeLessThan(20);
      if (!p.hasMore) {
        expect(p.nextCursor).toBeNull();
        break;
      }
      cursor = p.nextCursor;
    }
    expect(vistos.size).toBe(linhas.length);
    expect(paginas).toBe(11);
  });

  it("página exata no fim não promete próxima vazia", async () => {
    const linhas = Array.from({ length: 100 }, (_, i) => ({ id: `x${String(i).padStart(3, "0")}`, updatedAt: new Date(1000 + i) }));
    const p1 = await paginar({ sp: new URLSearchParams({ limit: "100" }), campo: "updatedAt", buscar: bancoEmMemoria(linhas) });
    expect(p1.itens).toHaveLength(100);
    expect(p1.hasMore).toBe(false);
  });

  it("cursor reaproveitado com outros filtros: cursor_mismatch", () => {
    const h = hashDosFiltros(new URLSearchParams({ pipeline: "p1" }));
    const c = codificarCursor({ valor: new Date(), id: "a" }, h);
    expect(() => decodificarCursor(c, hashDosFiltros(new URLSearchParams({ pipeline: "p2" })))).toThrowError(
      expect.objectContaining({ code: "cursor_mismatch" })
    );
    expect(() => decodificarCursor("lixo!!", h)).toThrowError(expect.objectContaining({ code: "invalid_cursor" }));
    // limit e cursor não entram no hash: mudar o tamanho da página é permitido.
    expect(hashDosFiltros(new URLSearchParams({ pipeline: "p1", limit: "10" }))).toBe(h);
  });

  it("parâmetro desconhecido e limit fora da faixa são 400", () => {
    expect(() => lerConsulta("https://x/api?updatedSince=1", ["updated_since"])).toThrowError(
      expect.objectContaining({ code: "unknown_parameter", extra: expect.objectContaining({ param: "updatedSince" }) })
    );
    expect(() => lerLimite(new URLSearchParams({ limit: "500" }))).toThrow(ErroApi);
    expect(lerLimite(new URLSearchParams())).toBe(50);
  });
});
