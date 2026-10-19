import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { MAX_CENTAVOS, conferirReferencias, reaisParaCentavos, type Corpo } from "@/lib/server/api-validacao";
import { createDeal, moveDealStage, resolverEtapaDeEntrada } from "@/lib/server/crm";
import { aplicarValores, carregarDefinicoes } from "@/lib/server/custom-fields";
import type { OrigemDoMovimento } from "@/lib/server/stage-events";
import { ErroApi, iso } from "./http";
import {
  boolOpc,
  dataOpc,
  externalIdOpc,
  idOpc,
  inteiroOpc,
  listaDeIdsOpc,
  objetoOpc,
  sourceOpc,
  textoOpc,
} from "./entrada";
import { externosDe, idPorExterno, vincularExterno } from "./externos";
import { lerBooleano, lerDataDaConsulta } from "./paginacao";

// ---------------------------------------------------------------------------
// Negócios na API v1. Criação passa por createDeal e todo movimento de etapa
// por moveDealStage (src/lib/server/crm.ts), com origem "api" no histórico —
// é o que mantém probabilidade, closedAt, stageSince e DealStageEvent iguais
// aos da tela e do Builder. Diferença deliberada para a tela: etapa de OUTRO
// funil só com `pipeline_id` explícito (troca de funil é decisão, não acidente).
// ---------------------------------------------------------------------------

export const INCLUDE_NEGOCIO = {
  stage: { select: { type: true } },
  contacts: { select: { contactId: true, role: true } },
} as const;

export type LinhaDeNegocio = Prisma.DealGetPayload<{ include: typeof INCLUDE_NEGOCIO }>;

export function serializarNegocio(d: LinhaDeNegocio, externalId: string | null = null) {
  return {
    id: d.id,
    external_id: externalId,
    name: d.name,
    description: d.description,
    category: d.category,
    pipeline_id: d.pipelineId,
    stage_id: d.stageId,
    status: d.stage?.type ?? "open",
    amount_cents: d.amountCents,
    currency: d.currency,
    probability: d.probability,
    lost_reason: d.lostReason,
    expected_closing_at: iso(d.expectedClosingAt),
    closed_at: iso(d.closedAt),
    archived_at: iso(d.archivedAt),
    stage_since: iso(d.stageSince),
    position: d.position,
    company_id: d.companyId,
    owner_id: d.ownerId,
    contacts: d.contacts.map((c) => ({ contact_id: c.contactId, role: c.role })),
    custom_fields: d.customFields,
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
  };
}

export async function serializarNegocios(orgId: string, linhas: LinhaDeNegocio[]) {
  const externos = await externosDe(orgId, "deal", linhas.map((d) => d.id));
  return linhas.map((d) => serializarNegocio(d, externos.get(d.id) ?? null));
}

export async function carregarNegocio(orgId: string, id: string) {
  const d = await prisma.deal.findFirst({ where: { id, orgId }, include: INCLUDE_NEGOCIO });
  if (!d) throw new ErroApi(404, "not_found", "Negócio não encontrado.");
  return d;
}

export const CAMPOS_DE_NEGOCIO = [
  "name",
  "description",
  "category",
  "pipeline_id",
  "stage_id",
  "amount_cents",
  "amount",
  "currency",
  "expected_closing_at",
  "company_id",
  "owner_id",
  "contact_id",
  "contact_ids",
  "custom_fields",
  "external_id",
  "external_source",
] as const;

export const CAMPOS_DE_PATCH_DE_NEGOCIO = [
  "name",
  "description",
  "category",
  "pipeline_id",
  "stage_id",
  "lost_reason",
  "amount_cents",
  "amount",
  "currency",
  "probability",
  "position",
  "archived",
  "expected_closing_at",
  "company_id",
  "owner_id",
  "custom_fields",
  "external_id",
  "external_source",
] as const;

export interface DadosDeNegocio {
  name?: string;
  description?: string;
  category?: string;
  pipelineId?: string | null;
  stageId?: string | null;
  lostReason?: string;
  amountCents?: number;
  currency?: string;
  probability?: number;
  position?: number;
  archived?: boolean;
  expectedClosingAt?: Date | null;
  companyId?: string | null;
  ownerId?: string | null;
  contactIds?: string[];
  customFields?: Record<string, unknown>;
  externalId?: string | null;
  source: string;
}

export async function lerDadosDeNegocio(orgId: string, corpo: Corpo): Promise<DadosDeNegocio> {
  const d: DadosDeNegocio = { source: sourceOpc(corpo) };
  d.name = textoOpc(corpo, "name", 200);
  d.description = textoOpc(corpo, "description", 5000);
  d.category = textoOpc(corpo, "category", 100);
  d.pipelineId = idOpc(corpo, "pipeline_id");
  d.stageId = idOpc(corpo, "stage_id");
  d.lostReason = textoOpc(corpo, "lost_reason", 500);
  // Centavos é o formato canônico; `amount` em reais é o mesmo apelido da tela.
  d.amountCents = inteiroOpc(corpo, "amount_cents", 0, MAX_CENTAVOS);
  if (d.amountCents === undefined && corpo.amount !== undefined) {
    const c = reaisParaCentavos(corpo.amount);
    if (c === null || c === undefined) {
      throw new ErroApi(400, "invalid_parameter", "amount inválido (máximo R$ 21 milhões).", { param: "amount" });
    }
    d.amountCents = c;
  }
  const moeda = textoOpc(corpo, "currency", 3);
  if (moeda !== undefined) {
    if (!/^[A-Za-z]{3}$/.test(moeda)) throw new ErroApi(400, "invalid_parameter", "currency precisa ser ISO-4217 (ex.: BRL).", { param: "currency" });
    d.currency = moeda.toUpperCase();
  }
  d.probability = inteiroOpc(corpo, "probability", 0, 100);
  d.position = inteiroOpc(corpo, "position", -2_000_000_000, 2_000_000_000);
  d.archived = boolOpc(corpo, "archived");
  d.expectedClosingAt = dataOpc(corpo, "expected_closing_at");
  d.companyId = idOpc(corpo, "company_id");
  d.ownerId = idOpc(corpo, "owner_id");
  const um = idOpc(corpo, "contact_id");
  const varios = listaDeIdsOpc(corpo, "contact_ids", 50);
  if (um || varios) d.contactIds = [...new Set([...(um ? [um] : []), ...(varios ?? [])])];
  d.customFields = objetoOpc(corpo, "custom_fields");
  d.externalId = externalIdOpc(corpo);

  const erroRef = await conferirReferencias(orgId, { companyId: d.companyId, ownerId: d.ownerId });
  if (erroRef) {
    throw new ErroApi(erroRef.endsWith("inválido.") ? 400 : 404, "invalid_reference", erroRef, {
      param: erroRef.startsWith("Empresa") ? "company_id" : "owner_id",
    });
  }
  if (d.contactIds?.length) {
    const achados = await prisma.contact.count({ where: { orgId, id: { in: d.contactIds } } });
    if (achados !== d.contactIds.length) {
      throw new ErroApi(404, "invalid_reference", "Contato não encontrado nesta organização.", { param: "contact_ids" });
    }
  }
  return d;
}

/** Valida campos personalizados do negócio pelo funil onde ele mora (obrigatório só para o que veio). */
async function validarCampos(
  orgId: string,
  pipelineId: string,
  atuais: Record<string, unknown>,
  entrada: Record<string, unknown>,
  criando: boolean
) {
  const defs = await carregarDefinicoes(orgId, "deal", pipelineId);
  const r = aplicarValores(defs, atuais, entrada, { exigirObrigatorios: criando });
  if (!r.ok) throw new ErroApi(422, "invalid_custom_fields", r.erros.join(" "), { param: "custom_fields", details: { errors: r.erros } });
  if (!criando) {
    for (const def of defs) {
      if (def.required && def.key in entrada && r.valores[def.key] === undefined) {
        throw new ErroApi(422, "invalid_custom_fields", `${def.label}: preenchimento obrigatório.`, { param: "custom_fields" });
      }
    }
  }
  return r.valores;
}

interface Opcoes {
  simular?: boolean;
  origem?: OrigemDoMovimento;
}

export async function criarNegocio(orgId: string, d: DadosDeNegocio, op: Opcoes = {}): Promise<{ id: string }> {
  if (!d.name) throw new ErroApi(400, "invalid_parameter", "name é obrigatório.", { param: "name" });
  const etapa = await resolverEtapaDeEntrada(orgId, d.pipelineId ?? undefined, d.stageId ?? undefined);
  const customFields = d.customFields ? await validarCampos(orgId, etapa.pipelineId, {}, d.customFields, true) : undefined;
  if (op.simular) return { id: "" };

  const [primeiro, ...outros] = d.contactIds ?? [];
  const deal = await createDeal({
    orgId,
    name: d.name,
    pipelineId: etapa.pipelineId,
    stageId: etapa.id,
    contactId: primeiro ?? null,
    companyId: d.companyId ?? null,
    ownerId: d.ownerId ?? null,
    amountCents: d.amountCents ?? 0,
    currency: d.currency,
    description: d.description ?? "",
    expectedClosingAt: d.expectedClosingAt ?? null,
    customFields,
    origem: op.origem ?? "api",
  });
  if (outros.length > 0) {
    await prisma.dealContact.createMany({ data: outros.map((contactId) => ({ dealId: deal.id, contactId })), skipDuplicates: true });
  }
  if (d.category) await prisma.deal.update({ where: { id: deal.id }, data: { category: d.category } });
  if (d.externalId) await vincularExterno(orgId, "deal", deal.id, d.externalId, d.source);
  return { id: deal.id };
}

/**
 * Move de etapa. Etapa de outro funil exige `pipeline_id` igual ao funil da
 * etapa: é a confirmação de que a troca de funil é intencional.
 */
export async function moverNegocio(
  orgId: string,
  dealId: string,
  alvo: { stageId: string; pipelineId?: string | null; lostReason?: string },
  op: Opcoes = {}
): Promise<{ mudou: boolean; pipelineId: string }> {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId }, select: { id: true, stageId: true, pipelineId: true, lostReason: true } });
  if (!deal) throw new ErroApi(404, "not_found", "Negócio não encontrado.");
  const etapa = await prisma.pipelineStage.findFirst({
    where: { id: alvo.stageId, pipeline: { orgId } },
    select: { id: true, pipelineId: true, type: true },
  });
  if (!etapa) throw new ErroApi(404, "invalid_reference", "Etapa não encontrada nesta organização.", { param: "stage_id" });
  if (alvo.pipelineId && etapa.pipelineId !== alvo.pipelineId) {
    throw new ErroApi(422, "stage_not_in_pipeline", "A etapa não pertence ao funil informado.", { param: "stage_id" });
  }
  if (etapa.pipelineId !== deal.pipelineId && alvo.pipelineId !== etapa.pipelineId) {
    throw new ErroApi(
      422,
      "stage_in_other_pipeline",
      "A etapa é de outro funil. Para trocar o negócio de funil, envie também pipeline_id com o funil da etapa.",
      { param: "stage_id", details: { deal_pipeline_id: deal.pipelineId, stage_pipeline_id: etapa.pipelineId } }
    );
  }
  if (etapa.id === deal.stageId) {
    // Mesma etapa: só registra o motivo da perda, se veio (caso "perdi e volto depois para dizer por quê").
    const motivo = alvo.lostReason?.trim().slice(0, 500);
    if (etapa.type === "lost" && motivo !== undefined && motivo !== deal.lostReason) {
      if (!op.simular) await prisma.deal.update({ where: { id: dealId }, data: { lostReason: motivo } });
      return { mudou: true, pipelineId: etapa.pipelineId };
    }
    return { mudou: false, pipelineId: etapa.pipelineId };
  }
  if (!op.simular) await moveDealStage(dealId, etapa.id, alvo.lostReason?.trim().slice(0, 500) ?? "", op.origem ?? "api");
  return { mudou: true, pipelineId: etapa.pipelineId };
}

/** Ganho/perdido: a primeira etapa desse tipo no funil atual do negócio. */
export async function fecharNegocio(orgId: string, dealId: string, tipo: "won" | "lost", lostReason?: string) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId }, select: { pipelineId: true } });
  if (!deal) throw new ErroApi(404, "not_found", "Negócio não encontrado.");
  const etapa = await prisma.pipelineStage.findFirst({
    where: { pipelineId: deal.pipelineId, type: tipo },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!etapa) {
    throw new ErroApi(422, tipo === "won" ? "no_won_stage" : "no_lost_stage", `O funil deste negócio não tem etapa de ${tipo === "won" ? "ganho" : "perda"}.`);
  }
  return moverNegocio(orgId, dealId, { stageId: etapa.id, lostReason }, { origem: "api" });
}

export async function atualizarNegocio(orgId: string, dealId: string, d: DadosDeNegocio, op: Opcoes = {}): Promise<{ mudou: boolean }> {
  const atual = await prisma.deal.findFirst({ where: { id: dealId, orgId } });
  if (!atual) throw new ErroApi(404, "not_found", "Negócio não encontrado.");

  // Etapa primeiro (só conferida, sem gravar): os campos personalizados
  // valem pelo funil de destino, e nada é gravado antes de tudo validar.
  let pipelineFinal = atual.pipelineId;
  let moveu = false;
  const alvo = d.stageId ? { stageId: d.stageId, pipelineId: d.pipelineId, lostReason: d.lostReason } : null;
  if (alvo) {
    const r = await moverNegocio(orgId, dealId, alvo, { ...op, simular: true });
    moveu = r.mudou;
    pipelineFinal = r.pipelineId;
  } else if (d.pipelineId && d.pipelineId !== atual.pipelineId) {
    throw new ErroApi(422, "stage_required", "Para trocar de funil, envie também stage_id (uma etapa do funil novo).", { param: "stage_id" });
  }

  const data: Prisma.DealUncheckedUpdateInput = {};
  const muda = <K extends keyof typeof atual>(campo: K, valor: (typeof atual)[K] | undefined) => {
    if (valor !== undefined && valor !== atual[campo]) (data as Record<string, unknown>)[campo as string] = valor;
  };
  muda("name", d.name || undefined);
  muda("description", d.description);
  muda("category", d.category);
  muda("amountCents", d.amountCents);
  muda("currency", d.currency);
  muda("probability", d.probability);
  muda("position", d.position);
  muda("companyId", d.companyId);
  muda("ownerId", d.ownerId);
  if (!d.stageId && d.lostReason !== undefined) muda("lostReason", d.lostReason);
  if (d.expectedClosingAt !== undefined && (d.expectedClosingAt?.getTime() ?? null) !== (atual.expectedClosingAt?.getTime() ?? null)) {
    data.expectedClosingAt = d.expectedClosingAt;
  }
  if (d.archived === true && !atual.archivedAt) data.archivedAt = new Date();
  if (d.archived === false && atual.archivedAt) data.archivedAt = null;
  if (d.customFields) {
    const atuais = (atual.customFields ?? {}) as Record<string, unknown>;
    const valores = await validarCampos(orgId, pipelineFinal, atuais, d.customFields, false);
    if (JSON.stringify(valores) !== JSON.stringify(atuais)) data.customFields = valores as Prisma.InputJsonValue;
  }

  let externoMuda = false;
  if (d.externalId !== undefined) {
    externoMuda = ((await externosDe(orgId, "deal", [dealId], d.source)).get(dealId) ?? null) !== d.externalId;
  }

  const mudou = moveu || externoMuda || Object.keys(data).length > 0;
  if (op.simular || !mudou) return { mudou };
  if (externoMuda) await vincularExterno(orgId, "deal", dealId, d.externalId ?? null, d.source);
  if (alvo && moveu) await moverNegocio(orgId, dealId, alvo, op);
  if (Object.keys(data).length > 0) await prisma.deal.update({ where: { id: dealId }, data });
  return { mudou };
}

export type ResultadoDoUpsertDeNegocio = { id: string; result: "created" | "updated" | "unchanged"; matchedBy: "external_id" | null };

/**
 * Negócio não tem e-mail/telefone: o upsert é só pelo id externo. Sem
 * external_id, cada envio cria um negócio novo (quem integra precisa mandar
 * o id do seu sistema para reenviar sem duplicar).
 */
export async function upsertNegocio(
  orgId: string,
  d: DadosDeNegocio,
  op: Opcoes & { modo?: "upsert" | "create" } = {}
): Promise<ResultadoDoUpsertDeNegocio> {
  const existente = d.externalId ? await idPorExterno(orgId, "deal", d.externalId, d.source) : null;
  if (!existente) {
    const criado = await criarNegocio(orgId, d, op);
    return { id: criado.id, result: "created", matchedBy: null };
  }
  if (op.modo === "create") {
    throw new ErroApi(409, "duplicate", "Já existe um negócio com esse external_id.", { details: { existing_id: existente } });
  }
  // Contatos no upsert só acrescentam: tirar alguém do negócio é ação explícita.
  const { mudou } = await atualizarNegocio(orgId, existente, d, op);
  let acrescentou = false;
  if (d.contactIds?.length) {
    const tem = new Set(
      (await prisma.dealContact.findMany({ where: { dealId: existente }, select: { contactId: true } })).map((c) => c.contactId)
    );
    const novos = d.contactIds.filter((c) => !tem.has(c));
    acrescentou = novos.length > 0;
    if (acrescentou && !op.simular) {
      await prisma.dealContact.createMany({ data: novos.map((contactId) => ({ dealId: existente, contactId })), skipDuplicates: true });
    }
  }
  return { id: existente, result: mudou || acrescentou ? "updated" : "unchanged", matchedBy: "external_id" };
}

export const FILTROS_DE_NEGOCIO = [
  "updated_since",
  "pipeline",
  "stage",
  "owner",
  "company",
  "contact",
  "status",
  "external_id",
  "external_source",
  "archived",
] as const;

export async function whereDeNegocios(orgId: string, sp: URLSearchParams): Promise<Prisma.DealWhereInput> {
  const and: Prisma.DealWhereInput[] = [{ orgId }];
  const desde = lerDataDaConsulta(sp, "updated_since");
  if (desde) and.push({ updatedAt: { gte: desde } });
  if (sp.get("pipeline")) and.push({ pipelineId: sp.get("pipeline")! });
  if (sp.get("stage")) and.push({ stageId: sp.get("stage")! });
  if (sp.get("owner")) and.push({ ownerId: sp.get("owner")! });
  if (sp.get("company")) and.push({ companyId: sp.get("company")! });
  if (sp.get("contact")) and.push({ contacts: { some: { contactId: sp.get("contact")! } } });
  const status = sp.get("status");
  if (status) {
    if (!["open", "won", "lost"].includes(status)) {
      throw new ErroApi(400, "invalid_parameter", "status precisa ser open, won ou lost.", { param: "status" });
    }
    and.push({ stage: { type: status } });
  }
  const arquivado = lerBooleano(sp, "archived");
  if (arquivado === true) and.push({ archivedAt: { not: null } });
  if (arquivado === false) and.push({ archivedAt: null });
  const externo = sp.get("external_id");
  if (externo) {
    const id = await idPorExterno(orgId, "deal", externo, sp.get("external_source") || "api");
    and.push({ id: id ?? "__nenhum__" });
  }
  return { AND: and };
}
