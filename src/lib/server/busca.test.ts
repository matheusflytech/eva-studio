import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Prisma } from "@/generated/prisma/client";

const db = vi.hoisted(() => {
  const queryRaw = vi.fn<(sql: unknown) => Promise<unknown[]>>(async () => []);
  const executeRaw = vi.fn(async () => 0);
  return {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ $queryRaw: queryRaw, $executeRaw: executeRaw })),
    teamMember: { findMany: vi.fn(async () => []) },
  };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/server/permissions", async (orig) => ({ ...(await orig<object>()), requirePermission: auth.requirePermission }));

import {
  buscarTudo,
  limparCacheDosRecursos,
  recursosDoBanco,
  sqlDeContatos,
  sqlDeEmpresas,
  sqlDeMensagens,
  sqlDeNegocios,
  sqlDeNotas,
  tiposPermitidos,
  type RecursosDoBanco,
} from "./busca";
import { normalizarConsulta } from "@/lib/busca/consulta";
import { TIPOS_DE_BUSCA } from "@/lib/busca/resultado";
import { permissoesDoPapelDeSistema } from "@/lib/permissoes/catalogo";
import { GET } from "@/app/api/busca/route";

const COM: RecursosDoBanco = { norm: true, trgm: "extensions" };
const SEM: RecursosDoBanco = { norm: false, trgm: null };
const MALICIOSO = "x'); DROP TABLE eva_studio_deals; --";

const sqlDe = (s: Prisma.Sql) => s.sql;
const valoresDe = (s: Prisma.Sql) => s.values as unknown[];

const ctxBase = {
  userId: "u1",
  orgId: "org-1",
  role: "owner" as const,
  permissoes: permissoesDoPapelDeSistema("owner"),
};

beforeEach(() => {
  vi.clearAllMocks();
  limparCacheDosRecursos();
  db.$queryRaw.mockResolvedValue([]);
});

describe("montagem das consultas", () => {
  it("contrato e escopo entram como parâmetro; o texto da pessoa nunca entra no SQL", () => {
    const c = normalizarConsulta(MALICIOSO);
    for (const s of [
      sqlDeNegocios({ orgId: "org-1", c, r: COM }, ["u1", "u2"]),
      sqlDeContatos({ orgId: "org-1", c, r: COM }, ["u1"]),
      sqlDeEmpresas({ orgId: "org-1", c, r: COM }),
      sqlDeNotas({ orgId: "org-1", c, r: COM }, { negocios: ["u1"], contatos: ["u1"] }, new Date(0)),
      sqlDeMensagens({ orgId: "org-1", c, r: COM }, ["u1"], new Date(0)),
    ]) {
      expect(sqlDe(s)).not.toContain("DROP");
      expect(sqlDe(s)).not.toContain("org-1");
      expect(valoresDe(s)).toContain("org-1");
      expect(valoresDe(s).some((v) => typeof v === "string" && v.includes("drop"))).toBe(true);
    }
  });

  it("escopo: = ANY(donos) só quando o papel não vê todos", () => {
    const c = normalizarConsulta("alfa");
    const restrito = sqlDeNegocios({ orgId: "o", c, r: COM }, ["u1", "u2"]);
    expect(sqlDe(restrito)).toContain(`d."ownerId" = ANY(`);
    expect(valoresDe(restrito)).toContainEqual(["u1", "u2"]);
    expect(sqlDe(sqlDeNegocios({ orgId: "o", c, r: COM }, null))).not.toContain(`"ownerId" = ANY`);

    const notas = sqlDeNotas({ orgId: "o", c, r: COM }, { negocios: ["u1"], contatos: null }, new Date(0));
    expect(sqlDe(notas)).toContain(`n."dealId" IS NULL OR d."ownerId" = ANY(`);
    expect(sqlDe(notas)).not.toContain(`ct."ownerId" = ANY(`);

    const msgs = sqlDeMensagens({ orgId: "o", c, r: COM }, ["u1"], new Date(0));
    expect(sqlDe(msgs)).toContain(`cv."assignedToId" = ANY(`);
    expect(sqlDe(msgs)).toContain(`a."orgId" = ?`);
  });

  it("prefixo de palavra, termo a termo (E), sem acento", () => {
    const s = sqlDeContatos({ orgId: "o", c: normalizarConsulta("Joã Sil"), r: COM }, null);
    expect(sqlDe(s)).toContain("public.eva_studio_norm(");
    expect(valoresDe(s)).toEqual(expect.arrayContaining(["joa%", "% joa%", "sil%", "% sil%"]));
    expect(sqlDe(s)).toMatch(/\) AND \(/);
  });

  it("sem o SQL aplicado: translate(lower()) em vez da função (cai para LIKE sem índice)", () => {
    const s = sqlDeNegocios({ orgId: "o", c: normalizarConsulta("ação"), r: SEM }, null);
    expect(sqlDe(s)).not.toContain("eva_studio_norm");
    expect(sqlDe(s)).toContain("translate(lower(");
    expect(valoresDe(s)).toContain("acao%");
  });

  it("telefone: qualquer trecho no principal, nos secundários e no id do canal", () => {
    const s = sqlDeContatos({ orgId: "o", c: normalizarConsulta("11 99999"), r: COM }, null);
    expect(valoresDe(s).filter((v) => v === "%1199999%").length).toBe(3);
    expect(sqlDe(s)).toContain(`regexp_replace(ct."phone", '[^0-9]', '', 'g')`);
    expect(sqlDe(s)).toContain(`ch."externalId" LIKE`);
    expect(sqlDe(s)).toContain(`ct."phones"::text LIKE`);
  });

  it("CNPJ com pontuação: só dígitos, pelo começo", () => {
    const s = sqlDeEmpresas({ orgId: "o", c: normalizarConsulta("12.345.678/0001-90"), r: COM });
    expect(valoresDe(s)).toContain("12345678000190%");
    expect(sqlDe(s)).toContain(`regexp_replace(co."cnpj"`);
  });

  it("e-mail: principal pelo prefixo e secundários no JSON", () => {
    const s = sqlDeContatos({ orgId: "o", c: normalizarConsulta("Ana@Empresa.com"), r: COM }, null);
    expect(valoresDe(s)).toEqual(expect.arrayContaining(["ana@empresa.com%", "%ana@empresa.com%"]));
    expect(sqlDe(s)).toContain(`lower(ct."emails"::text) LIKE`);
  });

  it("semelhança usa o operador do schema detectado", () => {
    const s = sqlDeNegocios({ orgId: "o", c: normalizarConsulta("alfredo"), r: COM }, null, "semelhanca");
    expect(sqlDe(s)).toContain("OPERATOR(extensions.<%)");
    expect(sqlDe(s)).toContain("extensions.word_similarity(");
    // Sem pg_trgm a semelhança vira FALSE (nunca um operador inexistente).
    expect(sqlDe(sqlDeNegocios({ orgId: "o", c: normalizarConsulta("alfredo"), r: SEM }, null, "semelhanca"))).not.toContain("OPERATOR");
  });
});

describe("recursosDoBanco", () => {
  it("detecta função e schema do pg_trgm, com cache", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ norm: true, trgm: "extensions" }]);
    expect(await recursosDoBanco(1000)).toEqual({ norm: true, trgm: "extensions" });
    expect(await recursosDoBanco(2000)).toEqual({ norm: true, trgm: "extensions" });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("schema estranho é ignorado; erro no catálogo = modo sem extensão", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ norm: false, trgm: "x; drop" }]);
    expect(await recursosDoBanco(0)).toEqual({ norm: false, trgm: null });
    limparCacheDosRecursos();
    db.$queryRaw.mockRejectedValueOnce(new Error("permission denied"));
    expect(await recursosDoBanco(0)).toEqual({ norm: false, trgm: null });
  });
});

describe("buscarTudo", () => {
  it("só os tipos que a pessoa pode ver", () => {
    expect(tiposPermitidos({ role: "viewer", permissoes: ["contatos:ver"] }, TIPOS_DE_BUSCA)).toEqual(["contatos"]);
    expect(tiposPermitidos({ role: "owner", permissoes: permissoesDoPapelDeSistema("owner") }, TIPOS_DE_BUSCA)).toEqual([
      ...TIPOS_DE_BUSCA,
    ]);
  });

  it("consulta vazia não toca o banco", async () => {
    await buscarTudo(ctxBase, normalizarConsulta("a"), TIPOS_DE_BUSCA);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("monta linhas com título, subtítulo e caminho; escopo 'só os meus' vira [eu]", async () => {
    db.$queryRaw.mockImplementation(async (s: unknown) => {
      const sql = (s as Prisma.Sql).sql ?? "";
      if (sql.includes("pg_extension")) return [{ norm: false, trgm: null }];
      if (sql.includes(`FROM "eva_studio_contacts" ct`))
        return [{ id: "c1", name: "Maria", email: "m@x.com", phone: "5511999998888", empresa: "Alfa", conversaId: "cv1" }];
      return [];
    });
    const ctx = { ...ctxBase, escopo: { negocios: "todos" as const, contatos: "proprios" as const, conversas: "todos" as const } };
    const r = await buscarTudo(ctx, normalizarConsulta("mar"), ["contatos"]);
    expect(r.contatos).toEqual([
      expect.objectContaining({ id: "c1", conversaId: "cv1", titulo: "Maria", caminho: "/contacts?open=c1", subtitulo: expect.stringContaining("m@x.com") }),
    ]);
    expect(r.modo).toEqual({ semAcento: "translate", similaridade: false });
    const chamada = db.$queryRaw.mock.calls.find(([s]) => ((s as Prisma.Sql).sql ?? "").includes(`FROM "eva_studio_contacts" ct`))!;
    expect((chamada[0] as Prisma.Sql).values).toContainEqual(["u1"]);
  });

  it("sem resultado pelo prefixo e com pg_trgm: segunda volta por semelhança, marcada como aproximada", async () => {
    let voltas = 0;
    db.$queryRaw.mockImplementation(async (s: unknown) => {
      const sql = (s as Prisma.Sql).sql ?? "";
      if (sql.includes("pg_extension")) return [{ norm: true, trgm: "extensions" }];
      if (sql.includes(`FROM "eva_studio_companies" co`) && !sql.includes("eva_studio_deals")) {
        voltas++;
        return sql.includes("OPERATOR") ? [{ id: "e1", name: "Alfredo SA", cnpj: "", city: "", uf: "" }] : [];
      }
      return [];
    });
    const r = await buscarTudo(ctxBase, normalizarConsulta("alferdo"), ["empresas"]);
    expect(voltas).toBe(2);
    expect(r.empresas[0]).toMatchObject({ id: "e1", aproximado: true });
  });

  it("notas e mensagens rodam com teto de tempo; estourou = aviso, não erro", async () => {
    db.$queryRaw.mockImplementation(async (s: unknown) => {
      const sql = (s as Prisma.Sql).sql ?? "";
      if (sql.includes("pg_extension")) return [{ norm: true, trgm: null }];
      if (sql.includes("eva_studio_messages")) throw new Error("canceling statement due to statement timeout");
      if (sql.includes("eva_studio_notes"))
        return [{ id: "n1", text: "Pediu proposta nova", createdAt: new Date(0), dealId: "d1", contactId: null, negocio: "Alfa", contato: null }];
      return [];
    });
    const r = await buscarTudo(ctxBase, normalizarConsulta("proposta"), ["notas", "mensagens"]);
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(r.notas[0]).toMatchObject({ titulo: "Nota · Negócio Alfa", caminho: "/deals/d1" });
    expect(r.notas[0].trecho.destaques.length).toBe(1);
    expect(r.mensagens).toEqual([]);
    expect(r.avisos).toEqual(["A busca em mensagens demorou demais e foi interrompida."]);
  });
});

describe("GET /api/busca", () => {
  it("sem sessão: o erro da permissão", async () => {
    auth.requirePermission.mockResolvedValueOnce({ error: "Não autenticado", status: 401 });
    const res = await GET(new Request("http://x/api/busca?q=alfa"));
    expect(res.status).toBe(401);
  });

  it("responde o resultado com Server-Timing e sem cache", async () => {
    auth.requirePermission.mockResolvedValueOnce(ctxBase);
    db.$queryRaw.mockResolvedValue([]);
    const res = await GET(new Request("http://x/api/busca?q=alfa&tipos=empresas,inventado"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Server-Timing")).toMatch(/^busca;dur=/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const corpo = await res.json();
    expect(corpo).toMatchObject({ negocios: [], empresas: [], avisos: [] });
  });
});
