import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Company, Prisma } from "@/generated/prisma/client";
import { conferirReferencias, type Corpo } from "@/lib/server/api-validacao";
import { cnpjValido, tamanhoDaEmpresa } from "@/lib/server/cnpj";
import { ErroApi, iso } from "./http";
import { externalIdOpc, idOpc, sourceOpc, textoOpc } from "./entrada";
import { externosDe, idPorExterno, vincularExterno } from "./externos";
import { lerDataDaConsulta } from "./paginacao";
import { publicarEvento } from "@/lib/server/eventos/barramento";
import { fotoDoRegistro, publicarAlteracao } from "@/lib/server/eventos/alteracoes";

// ---------------------------------------------------------------------------
// Empresas na API v1. Mesmas regras da tela (src/app/api/companies): CNPJ só
// com dígitos, validado e único na organização (é a chave natural de empresa
// no Brasil), número de funcionários inteiro, responsável da própria org.
// ---------------------------------------------------------------------------

export function serializarEmpresa(c: Company, externalId: string | null = null) {
  return {
    id: c.id,
    external_id: externalId,
    name: c.name,
    cnpj: c.cnpj,
    sector: c.sector,
    size: c.size,
    website: c.website,
    phone: c.phone,
    linkedin_url: c.linkedinUrl,
    address: c.address,
    city: c.city,
    uf: c.uf,
    zipcode: c.zipcode,
    description: c.description,
    revenue: c.revenue,
    owner_id: c.ownerId,
    created_at: iso(c.createdAt),
    updated_at: iso(c.updatedAt),
  };
}

export async function serializarEmpresas(orgId: string, linhas: Company[], source?: string) {
  const externos = await externosDe(orgId, "company", linhas.map((c) => c.id), source);
  return linhas.map((c) => serializarEmpresa(c, externos.get(c.id) ?? null));
}

export async function carregarEmpresa(orgId: string, id: string) {
  const c = await prisma.company.findFirst({ where: { id, orgId } });
  if (!c) throw new ErroApi(404, "not_found", "Empresa não encontrada.");
  return c;
}

const TEXTOS = {
  sector: ["sector", 200],
  website: ["website", 500],
  phone: ["phone", 40],
  linkedinUrl: ["linkedin_url", 500],
  address: ["address", 500],
  city: ["city", 200],
  zipcode: ["zipcode", 20],
  description: ["description", 10_000],
  revenue: ["revenue", 100],
} as const;

export const CAMPOS_DE_EMPRESA = [
  "name",
  "cnpj",
  "size",
  "uf",
  "owner_id",
  "external_id",
  "external_source",
  ...Object.values(TEXTOS).map(([c]) => c),
] as const;

export type DadosDeEmpresa = Partial<Record<keyof typeof TEXTOS | "name" | "cnpj" | "uf", string>> & {
  size?: number | null;
  ownerId?: string | null;
  externalId?: string | null;
  source: string;
};

export async function lerDadosDeEmpresa(orgId: string, corpo: Corpo): Promise<DadosDeEmpresa> {
  const d: DadosDeEmpresa = { source: sourceOpc(corpo) };
  d.name = textoOpc(corpo, "name", 200);
  for (const [chave, [campo, max]] of Object.entries(TEXTOS) as Array<[keyof typeof TEXTOS, readonly [string, number]]>) {
    d[chave] = textoOpc(corpo, campo, max);
  }
  const uf = textoOpc(corpo, "uf", 2);
  if (uf !== undefined) d.uf = uf.toUpperCase();
  const cnpj = textoOpc(corpo, "cnpj", 30);
  if (cnpj !== undefined) {
    const digitos = cnpj.replace(/\D/g, "");
    if (digitos && !cnpjValido(digitos)) throw new ErroApi(400, "invalid_cnpj", "CNPJ inválido.", { param: "cnpj" });
    d.cnpj = digitos;
  }
  const size = tamanhoDaEmpresa(corpo.size);
  if (size === "invalido") throw new ErroApi(400, "invalid_parameter", "size precisa ser um inteiro (funcionários).", { param: "size" });
  d.size = size;
  d.ownerId = idOpc(corpo, "owner_id");
  d.externalId = externalIdOpc(corpo);
  const erroRef = await conferirReferencias(orgId, { ownerId: d.ownerId });
  if (erroRef) throw new ErroApi(/inválid[oa]\.$/.test(erroRef) ? 400 : 404, "invalid_reference", erroRef, { param: "owner_id" });
  return d;
}

async function conferirCnpjUnico(orgId: string, cnpj: string | undefined, excluirId?: string) {
  if (!cnpj) return;
  const outra = await prisma.company.findFirst({
    where: { orgId, cnpj, ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: { id: true },
  });
  if (outra) throw new ErroApi(409, "duplicate", "Já existe uma empresa com esse CNPJ.", { param: "cnpj", details: { existing_id: outra.id } });
}

function dadosParaGravar(d: DadosDeEmpresa) {
  const data: Record<string, unknown> = {};
  for (const chave of [...Object.keys(TEXTOS), "name", "cnpj", "uf"] as const) {
    const v = d[chave as keyof DadosDeEmpresa];
    if (v !== undefined) data[chave] = v;
  }
  if (d.size !== undefined) data.size = d.size;
  if (d.ownerId !== undefined) data.ownerId = d.ownerId;
  return data;
}

export async function criarEmpresa(orgId: string, d: DadosDeEmpresa): Promise<{ id: string }> {
  if (!d.name) throw new ErroApi(400, "invalid_parameter", "name é obrigatório.", { param: "name" });
  if (d.externalId) {
    const existente = await idPorExterno(orgId, "company", d.externalId, d.source);
    if (existente) throw new ErroApi(409, "duplicate", "Já existe uma empresa com esse external_id.", { details: { existing_id: existente } });
  }
  await conferirCnpjUnico(orgId, d.cnpj);
  const c = await prisma.company.create({
    data: { ...(dadosParaGravar(d) as Omit<Prisma.CompanyUncheckedCreateInput, "orgId" | "name">), orgId, name: d.name },
    select: { id: true },
  });
  if (d.externalId) await vincularExterno(orgId, "company", c.id, d.externalId, d.source);
  await publicarEvento({ orgId, tipo: "company.created", objeto: "company", objetoId: c.id, dados: { source: "api" } });
  return c;
}

export async function atualizarEmpresa(orgId: string, id: string, d: DadosDeEmpresa): Promise<{ mudou: boolean }> {
  const atual = await carregarEmpresa(orgId, id);
  if (d.name === "") throw new ErroApi(400, "invalid_parameter", "name não pode ficar vazio.", { param: "name" });
  if (d.cnpj && d.cnpj !== atual.cnpj) await conferirCnpjUnico(orgId, d.cnpj, id);
  const data = dadosParaGravar(d);
  for (const [k, v] of Object.entries(data)) if ((atual as Record<string, unknown>)[k] === v) delete data[k];
  let externoMuda = false;
  if (d.externalId !== undefined) {
    externoMuda = ((await externosDe(orgId, "company", [id], d.source)).get(id) ?? null) !== d.externalId;
  }
  const mudou = externoMuda || Object.keys(data).length > 0;
  const antes = mudou ? await fotoDoRegistro(orgId, "company", id) : null;
  if (externoMuda) await vincularExterno(orgId, "company", id, d.externalId ?? null, d.source);
  if (Object.keys(data).length > 0) await prisma.company.update({ where: { id }, data: data as Prisma.CompanyUncheckedUpdateInput });
  if (mudou) await publicarAlteracao(orgId, "company", id, antes);
  return { mudou };
}

/** Upsert pelo id externo; sem vínculo, o CNPJ (chave natural) faz o papel de reserva. */
export async function upsertEmpresa(orgId: string, d: DadosDeEmpresa) {
  let id = d.externalId ? await idPorExterno(orgId, "company", d.externalId, d.source) : null;
  let matchedBy: "external_id" | "cnpj" | null = id ? "external_id" : null;
  if (!id && d.cnpj) {
    const porCnpj = await prisma.company.findFirst({ where: { orgId, cnpj: d.cnpj }, select: { id: true } });
    if (porCnpj) {
      id = porCnpj.id;
      matchedBy = "cnpj";
    }
  }
  if (!id) {
    const c = await criarEmpresa(orgId, d);
    return { id: c.id, result: "created" as const, matchedBy };
  }
  // Achou pelo CNPJ uma empresa já ligada a OUTRO id externo: trocar o vínculo
  // em silêncio misturaria dois registros do outro lado (mesma regra do contato).
  if (d.externalId && matchedBy === "cnpj") {
    const atual = (await externosDe(orgId, "company", [id], d.source)).get(id);
    if (atual && atual !== d.externalId) {
      throw new ErroApi(409, "external_id_mismatch", "A empresa com esse CNPJ já está ligada a outro external_id.", {
        details: { existing_id: id, existing_external_id: atual, matched_by: "cnpj" },
      });
    }
  }
  const { mudou } = await atualizarEmpresa(orgId, id, d);
  return { id, result: mudou ? ("updated" as const) : ("unchanged" as const), matchedBy };
}

export const FILTROS_DE_EMPRESA = ["updated_since", "cnpj", "owner", "external_id", "external_source", "name"] as const;

export async function whereDeEmpresas(orgId: string, sp: URLSearchParams): Promise<Prisma.CompanyWhereInput> {
  const and: Prisma.CompanyWhereInput[] = [{ orgId }];
  const desde = lerDataDaConsulta(sp, "updated_since");
  if (desde) and.push({ updatedAt: { gte: desde } });
  if (sp.get("cnpj")) and.push({ cnpj: sp.get("cnpj")!.replace(/\D/g, "") });
  if (sp.get("owner")) and.push({ ownerId: sp.get("owner")! });
  if (sp.get("name")) and.push({ name: { contains: sp.get("name")!, mode: "insensitive" } });
  const externo = sp.get("external_id");
  if (externo) {
    const id = await idPorExterno(orgId, "company", externo, sp.get("external_source") || "api");
    and.push({ id: id ?? "__nenhum__" });
  }
  return { AND: and };
}
