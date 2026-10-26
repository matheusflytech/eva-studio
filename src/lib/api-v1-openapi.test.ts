import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { METODOS_DOCUMENTADOS, montarOpenApi } from "./api-v1-openapi";

// Rotas da v1 ficam em /api/v1/{contrato}/...; o OpenAPI documenta o que vem depois do contrato.
const RAIZ = path.resolve(__dirname, "../app/api/v1/[contract]");

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
      if (relativo.startsWith("leads")) continue;
      const caminho = "/" + relativo.replace(/\[(\w+)\]/g, "{$1}");
      const codigo = readFileSync(arquivo, "utf8");
      const metodos = [...codigo.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]).sort();
      const documentados = (METODOS_DOCUMENTADOS[caminho] ?? []).slice().sort();
      if (JSON.stringify(metodos) !== JSON.stringify(documentados)) faltando.push(`${caminho}: código ${metodos} x doc ${documentados}`);
    }
    expect(faltando).toEqual([]);
  });

  it("todo endpoint tem exemplo de resposta de sucesso", () => {
    const doc = montarOpenApi();
    const semExemplo: string[] = [];
    for (const [caminho, item] of Object.entries(doc.paths)) {
      for (const [metodo, op] of Object.entries(item)) {
        if (metodo === "parameters") continue;
        const respostas = (op as { responses: Record<string, { content?: { "application/json"?: { example?: unknown } } }> }).responses;
        const sucesso = Object.entries(respostas).find(([s]) => /^2\d\d$/.test(s));
        if (sucesso?.[1].content?.["application/json"]?.example === undefined) semExemplo.push(`${metodo.toUpperCase()} ${caminho}`);
      }
    }
    expect(semExemplo).toEqual([]);
  });

  it("é OpenAPI 3.1 com segurança bearer e envelope de erro", () => {
    const doc = montarOpenApi("https://eva.test/api/v1/{contract}");
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0]).toMatchObject({ url: "https://eva.test/api/v1/{contract}", variables: { contract: { default: "SEU-CONTRATO" } } });
    expect(doc.components.securitySchemes.bearer.scheme).toBe("bearer");
    const op = doc.paths["/contacts/{id}"] as Record<string, { parameters?: unknown[] }> & { parameters: { name: string }[] };
    expect(op.parameters[0].name).toBe("id");
  });
});
