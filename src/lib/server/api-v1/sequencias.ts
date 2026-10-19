import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Corpo } from "@/lib/server/api-validacao";
import {
  CANAIS_DE_SEQUENCIA,
  GATILHOS_DE_SEQUENCIA,
  ehCanalDeSequencia,
  ehGatilhoDeSequencia,
  limparPassosDeSequencia,
} from "@/lib/server/sequences";
import { ErroApi, iso } from "./http";
import { boolOpc, idOpc, inteiroOpc, textoOpc } from "./entrada";

// ---------------------------------------------------------------------------
// Sequências (réguas) na API v1 (API-5). Mesmas regras da tela (canal e
// gatilho da lista fechada, passos limpos por limparPassosDeSequencia, não
// ativa sem passo) e o que o mapa achou faltando lá: id de etiqueta, segmento
// e etapa do gatilho conferidos contra a organização — também na edição.
// ---------------------------------------------------------------------------

export const INCLUDE_SEQUENCIA = { steps: { orderBy: { order: "asc" as const } } } as const;
type LinhaDeSequencia = Prisma.SequenceGetPayload<{ include: typeof INCLUDE_SEQUENCIA }>;

export function serializarSequencia(s: LinhaDeSequencia, ativos?: number) {
  return {
    id: s.id,
    agent_id: s.agentId,
    name: s.name,
    channel: s.channel,
    active: s.active,
    trigger: s.trigger,
    trigger_tag_id: s.triggerTagId,
    trigger_segment_id: s.triggerSegmentId,
    trigger_stage_id: s.triggerStageId,
    trigger_stage_days: s.triggerStageDays,
    allow_reentry: s.allowReentry,
    stop_on_reply: s.stopOnReply,
    steps: s.steps.map((p) => ({
      order: p.order,
      delay_minutes: p.delayMinutes,
      text: p.text,
      template_id: p.templateId,
      apply_tag_id: p.applyTagId,
    })),
    ...(ativos !== undefined ? { active_enrollments: ativos } : {}),
    created_at: iso(s.createdAt),
    updated_at: iso(s.updatedAt),
  };
}

export async function carregarSequencia(orgId: string, id: string) {
  const s = await prisma.sequence.findFirst({ where: { id, agent: { orgId } }, include: INCLUDE_SEQUENCIA });
  if (!s) throw new ErroApi(404, "not_found", "Sequência não encontrada.");
  return s;
}

export const CAMPOS_DE_SEQUENCIA = [
  "agent_id",
  "name",
  "channel",
  "active",
  "trigger",
  "trigger_tag_id",
  "trigger_segment_id",
  "trigger_stage_id",
  "trigger_stage_days",
  "allow_reentry",
  "stop_on_reply",
  "steps",
] as const;

const MAX_PASSOS = 50;

/**
 * Valida o corpo contra o estado final (atual + o que veio): trocar o gatilho
 * para "tag" sem informar etiqueta é erro mesmo que a etiqueta não tenha vindo.
 */
export async function lerSequencia(orgId: string, corpo: Corpo, atual?: LinhaDeSequencia) {
  const data: Prisma.SequenceUncheckedUpdateInput & { agentId?: string } = {};

  if (!atual) {
    const agentId = idOpc(corpo, "agent_id");
    if (!agentId) throw new ErroApi(400, "invalid_parameter", "agent_id é obrigatório.", { param: "agent_id" });
    const agente = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true } });
    if (!agente) throw new ErroApi(404, "invalid_reference", "Agente não encontrado nesta organização.", { param: "agent_id" });
    data.agentId = agentId;
  } else if (corpo.agent_id !== undefined && corpo.agent_id !== atual.agentId) {
    throw new ErroApi(422, "immutable_field", "agent_id não muda depois de criada.", { param: "agent_id" });
  }
  const agentId = atual?.agentId ?? (data.agentId as string);

  const name = textoOpc(corpo, "name", 120);
  if (name === "" || (!atual && !name)) throw new ErroApi(400, "invalid_parameter", "name é obrigatório.", { param: "name" });
  if (name) data.name = name;

  if (corpo.channel !== undefined) {
    if (!ehCanalDeSequencia(corpo.channel)) {
      throw new ErroApi(400, "invalid_parameter", `channel precisa ser um de: ${CANAIS_DE_SEQUENCIA.join(", ")}.`, { param: "channel" });
    }
    data.channel = corpo.channel;
  }
  if (corpo.trigger !== undefined && !ehGatilhoDeSequencia(corpo.trigger)) {
    throw new ErroApi(400, "invalid_parameter", `trigger precisa ser um de: ${GATILHOS_DE_SEQUENCIA.join(", ")}.`, { param: "trigger" });
  }
  const gatilho = (corpo.trigger as string | undefined) ?? atual?.trigger ?? "manual";
  data.trigger = gatilho;

  const tagId = idOpc(corpo, "trigger_tag_id");
  const segmentId = idOpc(corpo, "trigger_segment_id");
  const stageId = idOpc(corpo, "trigger_stage_id");
  const finalTag = tagId !== undefined ? tagId : atual?.triggerTagId ?? null;
  const finalSegmento = segmentId !== undefined ? segmentId : atual?.triggerSegmentId ?? null;
  const finalEtapa = stageId !== undefined ? stageId : atual?.triggerStageId ?? null;

  // Só o id do gatilho escolhido fica; os outros são limpos (como a tela faz na criação).
  data.triggerTagId = gatilho === "tag" ? finalTag : null;
  data.triggerSegmentId = gatilho === "segment" ? finalSegmento : null;
  data.triggerStageId = gatilho === "stage" ? finalEtapa : null;
  if (gatilho === "tag") {
    if (!finalTag) throw new ErroApi(400, "invalid_parameter", "Gatilho tag precisa de trigger_tag_id.", { param: "trigger_tag_id" });
    if (!(await prisma.tag.findFirst({ where: { id: finalTag, orgId }, select: { id: true } }))) {
      throw new ErroApi(404, "invalid_reference", "Etiqueta não encontrada nesta organização.", { param: "trigger_tag_id" });
    }
  }
  if (gatilho === "segment") {
    if (!finalSegmento) throw new ErroApi(400, "invalid_parameter", "Gatilho segment precisa de trigger_segment_id.", { param: "trigger_segment_id" });
    if (!(await prisma.segment.findFirst({ where: { id: finalSegmento, orgId }, select: { id: true } }))) {
      throw new ErroApi(404, "invalid_reference", "Segmento não encontrado nesta organização.", { param: "trigger_segment_id" });
    }
  }
  if (gatilho === "stage") {
    if (!finalEtapa) throw new ErroApi(400, "invalid_parameter", "Gatilho stage precisa de trigger_stage_id.", { param: "trigger_stage_id" });
    if (!(await prisma.pipelineStage.findFirst({ where: { id: finalEtapa, pipeline: { orgId } }, select: { id: true } }))) {
      throw new ErroApi(404, "invalid_reference", "Etapa não encontrada nesta organização.", { param: "trigger_stage_id" });
    }
  }
  const dias = inteiroOpc(corpo, "trigger_stage_days", 0, 365);
  if (dias !== undefined) data.triggerStageDays = gatilho === "stage" ? dias : 0;
  else if (gatilho !== "stage") data.triggerStageDays = 0;

  const reentrada = boolOpc(corpo, "allow_reentry");
  if (reentrada !== undefined) data.allowReentry = reentrada;
  const pararAoResponder = boolOpc(corpo, "stop_on_reply");
  if (pararAoResponder !== undefined) data.stopOnReply = pararAoResponder;

  let passos: ReturnType<typeof limparPassosDeSequencia> | undefined;
  if (corpo.steps !== undefined) {
    if (!Array.isArray(corpo.steps) || corpo.steps.length > MAX_PASSOS || !corpo.steps.every((s) => s && typeof s === "object")) {
      throw new ErroApi(400, "invalid_parameter", `steps precisa ser uma lista de até ${MAX_PASSOS} passos.`, { param: "steps" });
    }
    passos = limparPassosDeSequencia(
      (corpo.steps as Record<string, unknown>[]).map((s) => ({
        delayMinutes: s.delay_minutes,
        text: s.text,
        templateId: s.template_id,
        applyTagId: s.apply_tag_id,
      }))
    );
    const etiquetas = [...new Set(passos.map((p) => p.applyTagId).filter((t): t is string => !!t))];
    if (etiquetas.length && (await prisma.tag.count({ where: { orgId, id: { in: etiquetas } } })) !== etiquetas.length) {
      throw new ErroApi(404, "invalid_reference", "apply_tag_id de um passo não existe nesta organização.", { param: "steps" });
    }
    const modelos = [...new Set(passos.map((p) => p.templateId).filter((t): t is string => !!t))];
    if (modelos.length && (await prisma.messageTemplate.count({ where: { agentId, id: { in: modelos } } })) !== modelos.length) {
      throw new ErroApi(404, "invalid_reference", "template_id de um passo não é um modelo deste agente.", { param: "steps" });
    }
  }

  const ativa = boolOpc(corpo, "active");
  if (ativa !== undefined) data.active = ativa;
  const qtdPassos = passos ? passos.length : atual?.steps.length ?? 0;
  if ((ativa ?? atual?.active) && qtdPassos === 0) {
    throw new ErroApi(422, "no_steps", "Adicione pelo menos um passo antes de ativar a sequência.", { param: "active" });
  }

  return { data, passos };
}

export async function criarSequencia(orgId: string, corpo: Corpo) {
  const { data, passos } = await lerSequencia(orgId, corpo);
  const criada = await prisma.sequence.create({
    data: {
      ...(data as Prisma.SequenceUncheckedCreateInput),
      // Nasce desligada se não pediram o contrário (mesma escolha da tela).
      active: data.active === true,
      steps: passos?.length ? { create: passos } : undefined,
    },
  });
  return carregarSequencia(orgId, criada.id);
}

export async function atualizarSequencia(orgId: string, id: string, corpo: Corpo) {
  const atual = await carregarSequencia(orgId, id);
  const { data, passos } = await lerSequencia(orgId, corpo, atual);
  delete data.agentId;
  await prisma.$transaction([
    ...(passos
      ? [prisma.sequenceStep.deleteMany({ where: { sequenceId: id } }), prisma.sequenceStep.createMany({ data: passos.map((p) => ({ ...p, sequenceId: id })) })]
      : []),
    prisma.sequence.update({ where: { id }, data }),
  ]);
  return carregarSequencia(orgId, id);
}
