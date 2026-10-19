import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { METODOS_DOCUMENTADOS, montarOpenApi } from "./api-v1-openapi";

const RAIZ = path.resolve(__dirname, "../app/api/v1");

function rotas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const cheio = path.join(dir, nome);
    if (statSync(cheio).isDirectory()) return rotas(cheio);
    return nome === "route.ts" ? [cheio] : [];
  });
}

describe("OpenAPI da v1", () => {
  it("todo arquivo de rota da v1 (menos leads, que tem página própria) está documentado, com os mesmos métodos", () => {
    const faltando: string[] = [];
    for (const arquivo of rotas(RAIZ)) {
      const relativo = path.relative(RAIZ, path.dirname(arquivo)).split(path.sep).join("/");
      if (relativo.startsWith("leads") || relativo === "openapi.json") continue;
      const caminho = "/" + relativo.replace(/\[(\w+)\]/g, "{$1}");
      const codigo = readFileSync(arquivo, "utf8");
      const metodos = [...codigo.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]).sort();
      const documentados = (METODOS_DOCUMENTADOS[caminho] ?? []).slice().sort();
      if (JSON.stringify(metodos) !== JSON.stringify(documentados)) faltando.push(`${caminho}: código ${metodos} x doc ${documentados}`);
    }
    expect(faltando).toEqual([]);
  });

  it("é OpenAPI 3.1 com segurança bearer e envelope de erro", () => {
    const doc = montarOpenApi("https://eva.test/api/v1");
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe("https://eva.test/api/v1");
    expect(doc.components.securitySchemes.bearer.scheme).toBe("bearer");
    const op = doc.paths["/contacts/{id}"] as Record<string, { parameters?: unknown[] }> & { parameters: { name: string }[] };
    expect(op.parameters[0].name).toBe("id");
  });
});
