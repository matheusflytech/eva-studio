import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { validarEmail } from "@/lib/capture-validation";
import { conferirReferencias, type Corpo } from "@/lib/server/api-validacao";
import { applyTag, filtroDeTelefone, optOutContact, removeTag, telefoneParaGravar } from "@/lib/server/contacts";
import { mesclarCamposDeContato } from "@/lib/server/custom-fields";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { ErroApi, iso } from "./http";
import {
  boolOpc,
  externalIdOpc,
  idOpc,
  listaDeIdsOpc,
  objetoOpc,
  sourceOpc,
  textoOpc,
} from "./entrada";
import { externosDe, idPorExterno, vincularExterno } from "./externos";
import { lerDataDaConsulta } from "./paginacao";

// ---------------------------------------------------------------------------
// Contatos na API v1: validação, deduplicação/upsert e formato público.
//
// As mesmas regras das telas (src/app/api/contacts/**): e-mail e telefone
// normalizados como a ficha grava, campos personalizados por
// mesclarCamposDeContato, empresa/responsável conferidos pela org, etiqueta
// por applyTag (que é o que dispara a sequência por etiqueta) e opt-out por
// optOutContact (que para as réguas). A importação em lote usa estas mesmas
// funções, então "duplicado" significa a mesma coisa nos dois caminhos.
// ---------------------------------------------------------------------------

export const INCLUDE_CONTATO = {
  tags: { include: { tag: { select: { id: true, name: true } } } },
  channels: { select: { agentId: true, channel: true, externalId: true } },
} as const;

export type LinhaDeContato = Prisma.ContactGetPayload<{ include: typeof INCLUDE_CONTATO }>;

/** Telefone sai em +55...: só dígitos ganham o "+"; formato legado sai como está. */
export function telefonePublico(phone: string): string {
  return /^\d{10,15}$/.test(phone) ? `+${phone}` : phone;
}

export function serializarContato(c: LinhaDeContato, externalId: string | null = null) {
  return {
    id: c.id,
    external_id: externalId,
    name: c.name,
    email: c.email,
    phone: telefonePublico(c.phone),
    job_title: c.jobTitle,
    emails: c.emails,
    phones: c.phones,
    linkedin_url: c.linkedinUrl,
    background: c.background,
    notes: c.notes,
    custom_fields: c.customFields,
    source: c.source,
    opt_in: c.optIn,
    opted_out_at: iso(c.optOutAt),
    lead_stage: c.leadStage,
    company_id: c.companyId,
    owner_id: c.ownerId,
    tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
    channels: c.channels.map((ch) => ({ agent_id: ch.agentId, channel: ch.channel, external_id: ch.externalId })),
    last_seen_at: iso(c.lastSeenAt),
    created_at: iso(c.createdAt),
    updated_at: iso(c.updatedAt),
  };
}

export async function serializarContatos(orgId: string, linhas: LinhaDeContato[]) {
  const externos = await externosDe(orgId, "contact", linhas.map((c) => c.id));
  return linhas.map((c) => serializarContato(c, externos.get(c.id) ?? null));
}

export const CAMPOS_DE_CONTATO = [
  "name",
  "email",
  "phone",
  "job_title",
  "linkedin_url",
  "background",
  "notes",
  "company_id",
  "owner_id",
  "custom_fields",
  "opt_in",
  "tag_ids",
  "external_id",
  "external_source",
] as const;

export const CAMPOS_DE_PATCH_DE_CONTATO = [
  ...CAMPOS_DE_CONTATO.filter((c) => c !== "tag_ids"),
  "add_tag_ids",
  "remove_tag_ids",
] as const;

export interface DadosDeContato {
  name?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  background?: string;
  notes?: string;
  companyId?: string | null;
  ownerId?: string | null;
  customFields?: Record<string, unknown>;
  optIn?: boolean;
  addTagIds?: string[];
  removeTagIds?: string[];
  externalId?: string | null;
  source: string;
}

/** Lê e valida o corpo (sem gravar nada). Referências e etiquetas conferidas pela org. */
export async function lerDadosDeContato(orgId: string, corpo: Corpo): Promise<DadosDeContato> {
  const d: DadosDeContato = { source: sourceOpc(corpo) };
  d.name = textoOpc(corpo, "name", 200);
  const email = textoOpc(corpo, "email", 254);
  if (email !== undefined) {
    const e = email ? validarEmail(email) : "";
    if (e === null) throw new ErroApi(400, "invalid_email", "E-mail inválido.", { param: "email" });
    d.email = e;
  }
  const phone = textoOpc(corpo, "phone", 40);
  if (phone !== undefined) {
    const p = telefoneParaGravar(phone);
    if (p === null) throw new ErroApi(400, "invalid_phone", "Telefone inválido. Informe com DDD (ex.: +5511999998888).", { param: "phone" });
    d.phone = p;
  }
  d.jobTitle = textoOpc(corpo, "job_title", 200);
  d.linkedinUrl = textoOpc(corpo, "linkedin_url", 500);
  d.background = textoOpc(corpo, "background", 10_000);
  d.notes = textoOpc(corpo, "notes", 10_000);
  d.companyId = idOpc(corpo, "company_id");
  d.ownerId = idOpc(corpo, "owner_id");
  d.customFields = objetoOpc(corpo, "custom_fields");
  d.optIn = boolOpc(corpo, "opt_in");
  d.addTagIds = listaDeIdsOpc(corpo, "tag_ids") ?? listaDeIdsOpc(corpo, "add_tag_ids");
  d.removeTagIds = listaDeIdsOpc(corpo, "remove_tag_ids");
  d.externalId = externalIdOpc(corpo);

  await conferirVinculos(orgId, d);
  return d;
}

export async function conferirVinculos(orgId: string, d: { companyId?: string | null; ownerId?: string | null; addTagIds?: string[] }) {
  const erroRef = await conferirReferencias(orgId, { companyId: d.companyId, ownerId: d.ownerId });
  if (erroRef) {
    const param = erroRef.startsWith("Empresa") ? "company_id" : "owner_id";
    throw new ErroApi(erroRef.endsWith("inválido.") ? 400 : 404, "invalid_reference", erroRef, { param });
  }
  if (d.addTagIds?.length) {
    const achadas = await prisma.tag.count({ where: { orgId, id: { in: d.addTagIds } } });
    if (achadas !== d.addTagIds.length) {
      throw new ErroApi(404, "invalid_reference", "Etiqueta não encontrada nesta organização.", { param: "tag_ids" });
    }
  }
}

export type ComoAchou = "external_id" | "email" | "phone";

/**
 * Procura quem já é esta pessoa, na ordem do roteiro: id externo → e-mail →
 * telefone. Dois candidatos no mesmo degrau não é "pega o primeiro": é 409
 * com os ids, para quem integra decidir (ou mesclar na tela).
 */
export async function acharContatoExistente(
  orgId: string,
  chaves: { externalId?: string | null; source: string; email?: string; phone?: string },
  excluirId?: string
): Promise<{ id: string; matchedBy: ComoAchou } | null> {
  if (chaves.externalId) {
    const id = await idPorExterno(orgId, "contact", chaves.externalId, chaves.source);
    if (id && id !== excluirId) return { id, matchedBy: "external_id" };
  }
  const degraus: Array<[ComoAchou, Prisma.ContactWhereInput | null]> = [
    ["email", chaves.email ? { email: { equals: chaves.email, mode: "insensitive" } } : null],
    ["phone", chaves.phone ? filtroDeTelefone(chaves.phone) : null],
  ];
  for (const [como, filtro] of degraus) {
    if (!filtro) continue;
    const achados = await prisma.contact.findMany({
      where: { orgId, ...filtro, ...(excluirId ? { id: { not: excluirId } } : {}) },
      select: { id: true },
      take: 5,
    });
    if (achados.length === 1) return { id: achados[0].id, matchedBy: como };
    if (achados.length > 1) {
      throw new ErroApi(409, "ambiguous_match", `Mais de um contato com esse ${como === "email" ? "e-mail" : "telefone"}.`, {
        details: { matched_by: como, ids: achados.map((a) => a.id) },
      });
    }
  }
  return null;
}

interface Opcoes {
  /** Valida e decide sem gravar (dry_run da importação). */
  simular?: boolean;
  /** Definições de campo já carregadas (lote evita uma consulta por linha). */
  defs?: DefinicaoDeCampo[];
  origem?: "api" | "importacao";
}

async function camposMesclados(orgId: string, atuais: Record<string, unknown>, entrada: Record<string, unknown>, defs?: DefinicaoDeCampo[]) {
  const r = await mesclarCamposDeContato(orgId, atuais, entrada, defs);
  if (!r.ok) {
    throw new ErroApi(422, "invalid_custom_fields", r.erros.join(" "), { param: "custom_fields", details: { errors: r.erros } });
  }
  return r.valores;
}

/** Cria a ficha. Não deduplica: quem chama decide (POST recusa duplicado, upsert atualiza). */
export async function criarContato(orgId: string, d: DadosDeContato, op: Opcoes = {}): Promise<{ id: string }> {
  if (!d.name && !d.email && !d.phone) {
    throw new ErroApi(400, "missing_identity", "Informe pelo menos name, email ou phone.");
  }
  const customFields = d.customFields ? await camposMesclados(orgId, {}, d.customFields, op.defs) : {};
  if (op.simular) return { id: "" };

  const contato = await prisma.contact.create({
    data: {
      orgId,
      name: d.name ?? "",
      email: d.email ?? "",
      phone: d.phone ?? "",
      jobTitle: d.jobTitle ?? "",
      linkedinUrl: d.linkedinUrl ?? "",
      background: d.background ?? "",
      notes: d.notes ?? "",
      companyId: d.companyId ?? null,
      ownerId: d.ownerId ?? null,
      customFields: customFields as Prisma.InputJsonValue,
      optIn: d.optIn ?? true,
      optOutAt: d.optIn === false ? new Date() : null,
      source: op.origem ?? "api",
    },
    select: { id: true },
  });
  if (d.externalId) await vincularExterno(orgId, "contact", contato.id, d.externalId, d.source);
  // Etiqueta pela API passa por applyTag (dispara sequência), igual à tela.
  // Na importação, direto (mesma regra da importação de CSV da tela: mil
  // linhas não podem disparar mil réguas sem ninguém pedir).
  for (const tagId of d.addTagIds ?? []) {
    if (op.origem === "importacao") await prisma.contactTag.createMany({ data: [{ contactId: contato.id, tagId }], skipDuplicates: true });
    else await applyTag(contato.id, tagId);
  }
  return contato;
}

/**
 * PATCH parcial: só o que veio muda; `null` limpa. Devolve se algo mudou de
 * fato (é o "unchanged" do upsert, que deixa a sincronização barata de ler).
 */
export async function atualizarContato(orgId: string, contactId: string, d: DadosDeContato, op: Opcoes = {}): Promise<{ mudou: boolean }> {
  const atual = await prisma.contact.findFirst({
    where: { id: contactId, orgId },
    include: { tags: { select: { tagId: true } } },
  });
  if (!atual) throw new ErroApi(404, "not_found", "Contato não encontrado.");

  // E-mail/telefone de OUTRA ficha é conflito, mesma regra da tela.
  const emailNovo = d.email !== undefined && d.email !== "" && d.email !== atual.email.toLowerCase() ? d.email : undefined;
  const phoneNovo = d.phone !== undefined && d.phone !== "" && d.phone !== atual.phone ? d.phone : undefined;
  if (emailNovo || phoneNovo) {
    const porTelefone = phoneNovo ? filtroDeTelefone(phoneNovo) : null;
    const outro = await prisma.contact.findFirst({
      where: {
        orgId,
        id: { not: contactId },
        OR: [
          ...(emailNovo ? [{ email: { equals: emailNovo, mode: "insensitive" as const } }] : []),
          ...(porTelefone ? [porTelefone] : []),
        ],
      },
      select: { id: true },
    });
    if (outro) {
      throw new ErroApi(409, "duplicate", "Já existe outro contato com esse e-mail ou telefone.", { details: { existing_id: outro.id } });
    }
  }

  const data: Prisma.ContactUncheckedUpdateInput = {};
  const muda = <K extends keyof typeof atual>(campo: K, valor: (typeof atual)[K] | undefined) => {
    if (valor !== undefined && valor !== atual[campo]) (data as Record<string, unknown>)[campo as string] = valor;
  };
  muda("name", d.name);
  muda("email", d.email);
  muda("phone", d.phone);
  muda("jobTitle", d.jobTitle);
  muda("linkedinUrl", d.linkedinUrl);
  muda("background", d.background);
  muda("notes", d.notes);
  muda("companyId", d.companyId);
  muda("ownerId", d.ownerId);
  if (d.optIn === true && !atual.optIn) data.optIn = true;
  const optOut = d.optIn === false && atual.optIn;

  if (d.customFields) {
    const atuais = (atual.customFields ?? {}) as Record<string, unknown>;
    const valores = await camposMesclados(orgId, atuais, d.customFields, op.defs);
    if (JSON.stringify(valores) !== JSON.stringify(atuais)) data.customFields = valores as Prisma.InputJsonValue;
  }

  const tem = new Set(atual.tags.map((t) => t.tagId));
  const adicionar = (d.addTagIds ?? []).filter((t) => !tem.has(t));
  const remover = (d.removeTagIds ?? []).filter((t) => tem.has(t));

  let externoMuda = false;
  if (d.externalId !== undefined) {
    const atuais = await externosDe(orgId, "contact", [contactId], d.source);
    externoMuda = (atuais.get(contactId) ?? null) !== d.externalId;
  }

  const mudou = Object.keys(data).length > 0 || optOut || adicionar.length > 0 || remover.length > 0 || externoMuda;
  if (op.simular || !mudou) return { mudou };

  if (externoMuda) await vincularExterno(orgId, "contact", contactId, d.externalId ?? null, d.source);
  if (Object.keys(data).length > 0) await prisma.contact.update({ where: { id: contactId }, data });
  if (optOut) await optOutContact(contactId);
  for (const tagId of adicionar) {
    if (op.origem === "importacao") await prisma.contactTag.createMany({ data: [{ contactId, tagId }], skipDuplicates: true });
    else await applyTag(contactId, tagId);
  }
  for (const tagId of remover) await removeTag(contactId, tagId);
  return { mudou: true };
}

export type ResultadoDoUpsert = { id: string; result: "created" | "updated" | "unchanged"; matchedBy: ComoAchou | null };

/**
 * Upsert por id externo → e-mail → telefone. `modo: "create"` recusa quem já
 * existe (409 duplicate) em vez de atualizar.
 */
export async function upsertContato(
  orgId: string,
  d: DadosDeContato,
  op: Opcoes & { modo?: "upsert" | "create" } = {}
): Promise<ResultadoDoUpsert> {
  const achado = await acharContatoExistente(orgId, { externalId: d.externalId, source: d.source, email: d.email, phone: d.phone });
  if (!achado) {
    const criado = await criarContato(orgId, d, op);
    return { id: criado.id, result: "created", matchedBy: null };
  }
  if (op.modo === "create") {
    throw new ErroApi(409, "duplicate", "Este contato já existe.", { details: { existing_id: achado.id, matched_by: achado.matchedBy } });
  }
  // Achou por e-mail/telefone uma ficha que já tem OUTRO id externo: é outro
  // registro lá do outro lado. Trocar o vínculo em silêncio misturaria os dois.
  if (d.externalId && achado.matchedBy !== "external_id") {
    const atual = (await externosDe(orgId, "contact", [achado.id], d.source)).get(achado.id);
    if (atual && atual !== d.externalId) {
      throw new ErroApi(409, "external_id_mismatch", "O contato com esse e-mail/telefone já está ligado a outro external_id.", {
        details: { existing_id: achado.id, existing_external_id: atual, matched_by: achado.matchedBy },
      });
    }
  }
  const { mudou } = await atualizarContato(orgId, achado.id, d, op);
  return { id: achado.id, result: mudou ? "updated" : "unchanged", matchedBy: achado.matchedBy };
}

export async function carregarContato(orgId: string, id: string) {
  const c = await prisma.contact.findFirst({ where: { id, orgId }, include: INCLUDE_CONTATO });
  if (!c) throw new ErroApi(404, "not_found", "Contato não encontrado.");
  return c;
}

export const FILTROS_DE_CONTATO = ["updated_since", "email", "phone", "external_id", "external_source", "tag", "owner", "company"] as const;

/** Filtros simples da listagem. Telefone e e-mail normalizados como a ficha grava. */
export async function whereDeContatos(orgId: string, sp: URLSearchParams): Promise<Prisma.ContactWhereInput> {
  const and: Prisma.ContactWhereInput[] = [{ orgId }];
  const desde = lerDataDaConsulta(sp, "updated_since");
  if (desde) and.push({ updatedAt: { gte: desde } });
  const email = sp.get("email");
  if (email) and.push({ email: { equals: email.trim(), mode: "insensitive" } });
  const phone = sp.get("phone");
  if (phone) {
    const p = telefoneParaGravar(phone);
    const filtro = p ? filtroDeTelefone(p) : null;
    if (!filtro) throw new ErroApi(400, "invalid_parameter", "phone inválido.", { param: "phone" });
    and.push(filtro);
  }
  const externo = sp.get("external_id");
  if (externo) {
    const id = await idPorExterno(orgId, "contact", externo, sp.get("external_source") || "api");
    and.push({ id: id ?? "__nenhum__" });
  }
  if (sp.get("tag")) and.push({ tags: { some: { tagId: sp.get("tag")! } } });
  if (sp.get("owner")) and.push({ ownerId: sp.get("owner")! });
  if (sp.get("company")) and.push({ companyId: sp.get("company")! });
  return { AND: and };
}
