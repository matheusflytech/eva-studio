import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ensureDefaultPipeline } from "@/lib/server/crm";
import {
  MAX_ETAPAS,
  MAX_FUNIS,
  PROBABILIDADE_ABERTA_PADRAO,
  corValida,
  etapaEquivalente,
  moverNegociosDaEtapa,
  probabilidade,
  tipoValido,
} from "@/lib/server/funis";
import { registrarMudancasEmLote } from "@/lib/server/stage-events";

// ---------------------------------------------------------------------------
// Ações de funil e etapa, extraídas das rotas da tela (src/app/api/pipelines)
// para a API v1 usar exatamente as mesmas regras: limites, etapa aberta antes
// das de fechamento, tipo que muda o que os negócios significam, e apagar com
// negócios só dizendo para onde eles vão (com histórico de etapa gravado).
//
// Erro sai como ErroDeFunil com o status e a mensagem que a tela já mostrava;
// cada chamador converte para o seu formato de resposta.
// ---------------------------------------------------------------------------

export class ErroDeFunil extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409,
    public code: string,
    public extra: { deals?: number } = {}
  ) {
    super(message);
    this.name = "ErroDeFunil";
  }
}

const naoAchouFunil = () => new ErroDeFunil("Funil não encontrado.", 404, "not_found");
const naoAchouEtapa = () => new ErroDeFunil("Etapa não encontrada.", 404, "not_found");

/** Funis da org com etapas e contagem de negócios. Cria o padrão na primeira vez. */
export async function listarFunis(orgId: string) {
  await ensureDefaultPipeline(orgId);
  return prisma.pipeline.findMany({
    where: { orgId },
    include: {
      stages: { orderBy: { position: "asc" }, include: { _count: { select: { deals: true } } } },
      _count: { select: { deals: true } },
    },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
  });
}

export interface EtapaDeEntrada {
  name?: unknown;
  probability?: unknown;
  type?: unknown;
  color?: unknown;
}

export async function criarFunil(orgId: string, entrada: { name?: unknown; stages?: unknown }) {
  const name = String(entrada.name ?? "").trim().slice(0, 60);
  if (!name) throw new ErroDeFunil("Nome do funil é obrigatório.", 400, "invalid_parameter");
  const stages: EtapaDeEntrada[] = Array.isArray(entrada.stages) ? (entrada.stages as EtapaDeEntrada[]) : [];
  if (stages.length === 0) throw new ErroDeFunil("Um funil precisa de pelo menos uma etapa.", 400, "invalid_parameter");
  if (stages.length > MAX_ETAPAS) throw new ErroDeFunil(`O limite é de ${MAX_ETAPAS} etapas por funil.`, 400, "limit_exceeded");

  const count = await prisma.pipeline.count({ where: { orgId } });
  if (count >= MAX_FUNIS) throw new ErroDeFunil(`O limite é de ${MAX_FUNIS} funis.`, 400, "limit_exceeded");

  return prisma.pipeline.create({
    data: {
      orgId,
      name,
      position: count,
      stages: {
        create: stages.map((s, i) => {
          const type = tipoValido(s?.type);
          return {
            name: String(s?.name ?? "").trim().slice(0, 40) || `Etapa ${i + 1}`,
            position: i,
            probability: probabilidade(s?.probability, type),
            type,
            color: corValida(s?.color),
          };
        }),
      },
    },
    include: { stages: { orderBy: { position: "asc" } } },
  });
}

export async function atualizarFunil(orgId: string, id: string, entrada: { name?: unknown; isDefault?: unknown }) {
  const funil = await prisma.pipeline.findFirst({ where: { id, orgId } });
  if (!funil) throw naoAchouFunil();
  let name: string | undefined;
  if (entrada.name !== undefined) {
    name = String(entrada.name).trim().slice(0, 60);
    if (!name) throw new ErroDeFunil("O nome não pode ficar vazio.", 400, "invalid_parameter");
  }
  await prisma.$transaction(async (tx) => {
    if (name) await tx.pipeline.update({ where: { id }, data: { name } });
    // Só um funil é o padrão: é onde cai o negócio criado sem funil definido.
    if (entrada.isDefault === true && !funil.isDefault) {
      await tx.pipeline.updateMany({ where: { orgId }, data: { isDefault: false } });
      await tx.pipeline.update({ where: { id }, data: { isDefault: true } });
    }
  });
}

/**
 * Apagar funil com negócios exige `moverPara` (outro funil). Cada negócio cai
 * na etapa de mesmo nome do destino, ou na de mesmo tipo, ou na primeira aberta.
 */
export async function apagarFunil(orgId: string, id: string, moverPara: string | null): Promise<{ movidos: number }> {
  const funil = await prisma.pipeline.findFirst({ where: { id, orgId } });
  if (!funil) throw naoAchouFunil();

  const total = await prisma.pipeline.count({ where: { orgId } });
  if (total <= 1) throw new ErroDeFunil("A conta precisa de pelo menos um funil.", 400, "last_pipeline");

  let destino: Awaited<ReturnType<typeof carregarDestino>> = null;
  if (moverPara && moverPara !== id) {
    destino = await carregarDestino(moverPara, orgId);
    if (!destino || destino.stages.length === 0) throw new ErroDeFunil("Funil de destino inválido.", 400, "invalid_move_to");
  }

  // Contar, mover e apagar na mesma transação: negócio criado no funil entre
  // a contagem e o delete iria embora junto (cascade).
  const eventos: { dealId: string; fromStageId: string; toStageId: string }[] = [];
  const r = await prisma.$transaction(async (tx) => {
    const qtd = await tx.deal.count({ where: { pipelineId: id } });
    if (qtd > 0 && !destino) return { qtd, faltaDestino: true };
    if (destino) {
      const etapas = await tx.pipelineStage.findMany({ where: { pipelineId: id } });
      for (const etapa of etapas) {
        const alvo = etapaEquivalente(destino.stages, etapa);
        const ids = await moverNegociosDaEtapa(tx, etapa.id, alvo);
        for (const dealId of ids) eventos.push({ dealId, fromStageId: etapa.id, toStageId: alvo.id });
      }
    }
    await tx.pipeline.delete({ where: { id } });
    if (funil.isDefault) {
      const outro = await tx.pipeline.findFirst({ where: { orgId }, orderBy: { position: "asc" } });
      if (outro) await tx.pipeline.update({ where: { id: outro.id }, data: { isDefault: true } });
    }
    return { qtd, faltaDestino: false };
  });
  if (r.faltaDestino) {
    throw new ErroDeFunil(`Este funil tem ${r.qtd} negócio(s). Escolha para qual funil eles vão.`, 409, "move_to_required", {
      deals: r.qtd,
    });
  }
  if (destino) {
    const pipelineId = destino.id;
    await registrarMudancasEmLote(eventos.map((e) => ({ ...e, orgId, pipelineId })));
  }
  return { movidos: r.qtd };
}

function carregarDestino(id: string, orgId: string) {
  return prisma.pipeline.findFirst({ where: { id, orgId }, include: { stages: { orderBy: { position: "asc" } } } });
}

/** Ordem nova; funis que não vieram ficam no fim, na ordem atual (lista velha nunca duplica posição). */
export async function reordenarFunis(orgId: string, pedidos: string[]) {
  const funis = await prisma.pipeline.findMany({ where: { orgId }, select: { id: true }, orderBy: { position: "asc" } });
  const validos = new Set(funis.map((f) => f.id));
  const ordem = [...pedidos.filter((i) => validos.has(i)), ...funis.map((f) => f.id).filter((i) => !pedidos.includes(i))];
  await prisma.$transaction(ordem.map((fid, position) => prisma.pipeline.update({ where: { id: fid }, data: { position } })));
  return ordem;
}

export async function criarEtapa(orgId: string, pipelineId: string, entrada: EtapaDeEntrada) {
  const funil = await prisma.pipeline.findFirst({
    where: { id: pipelineId, orgId },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  if (!funil) throw naoAchouFunil();
  if (funil.stages.length >= MAX_ETAPAS) throw new ErroDeFunil(`O limite é de ${MAX_ETAPAS} etapas por funil.`, 400, "limit_exceeded");

  const name = String(entrada.name ?? "").trim().slice(0, 40);
  if (!name) throw new ErroDeFunil("Dê um nome à etapa.", 400, "invalid_parameter");
  const type = tipoValido(entrada.type);

  // Etapa aberta nasce antes das de fechamento (ganho/perdido ficam no fim).
  const primeiraDeFechamento = funil.stages.find((s) => s.type !== "open");
  const position = type === "open" && primeiraDeFechamento ? primeiraDeFechamento.position : funil.stages.length;

  return prisma.$transaction(async (tx) => {
    await tx.pipelineStage.updateMany({ where: { pipelineId, position: { gte: position } }, data: { position: { increment: 1 } } });
    return tx.pipelineStage.create({
      data: { pipelineId, name, type, position, color: corValida(entrada.color), probability: probabilidade(entrada.probability, type) },
    });
  });
}

function carregarEtapa(orgId: string, pipelineId: string, stageId: string) {
  return prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId, pipeline: { orgId } } });
}

export async function atualizarEtapa(orgId: string, pipelineId: string, stageId: string, entrada: EtapaDeEntrada) {
  const etapa = await carregarEtapa(orgId, pipelineId, stageId);
  if (!etapa) throw naoAchouEtapa();

  const data: { name?: string; color?: string; type?: string; probability?: number } = {};
  if (entrada.name !== undefined) {
    const name = String(entrada.name).trim().slice(0, 40);
    if (!name) throw new ErroDeFunil("O nome não pode ficar vazio.", 400, "invalid_parameter");
    data.name = name;
  }
  if (entrada.color !== undefined) data.color = corValida(entrada.color);
  const tipo = entrada.type !== undefined ? tipoValido(entrada.type) : etapa.type;
  if (entrada.type !== undefined) data.type = tipo;
  if (entrada.probability !== undefined || entrada.type !== undefined) {
    // Ganho (100) ou perdido (0) virando aberta não pode herdar o número do
    // fechamento: sem probabilidade nova, volta ao padrão de etapa aberta.
    const virouAberta = tipo === "open" && etapa.type !== "open";
    const base = entrada.probability ?? (virouAberta ? PROBABILIDADE_ABERTA_PADRAO : etapa.probability);
    data.probability = probabilidade(base, tipo);
  }

  await prisma.$transaction(async (tx) => {
    await tx.pipelineStage.update({ where: { id: stageId }, data });

    // Mudar o tipo da etapa muda o que os negócios nela significam: ganho e
    // perdido carimbam a data de fechamento, aberto limpa.
    if (data.type && data.type !== etapa.type) {
      const fechando = data.type !== "open";
      await tx.deal.updateMany({
        where: { stageId, closedAt: fechando ? null : { not: null } },
        data: { closedAt: fechando ? new Date() : null },
      });
      if (data.type !== "lost") await tx.deal.updateMany({ where: { stageId }, data: { lostReason: "" } });
    }
    // Probabilidade nova vale pros negócios que ainda usavam a antiga; quem
    // foi ajustado à mão continua com o valor dele.
    if (data.probability !== undefined && data.probability !== etapa.probability) {
      await tx.deal.updateMany({ where: { stageId, probability: etapa.probability }, data: { probability: data.probability } });
    }
  });
}

/** Apagar etapa com negócios exige `moverPara` (etapa do mesmo funil). */
export async function apagarEtapa(orgId: string, pipelineId: string, stageId: string, moverPara: string | null) {
  const etapa = await carregarEtapa(orgId, pipelineId, stageId);
  if (!etapa) throw naoAchouEtapa();

  const irmas = await prisma.pipelineStage.findMany({ where: { pipelineId }, orderBy: { position: "asc" } });
  if (irmas.length <= 1) throw new ErroDeFunil("O funil precisa de pelo menos uma etapa.", 400, "last_stage");

  const destino = irmas.find((s) => s.id === moverPara && s.id !== stageId) ?? null;

  // Contar, mover e apagar na mesma transação: negócio criado na etapa entre
  // a contagem e o delete não pode sumir junto com ela.
  const r = await prisma.$transaction(async (tx) => {
    const qtd = await tx.deal.count({ where: { stageId } });
    if (qtd > 0 && !destino) return { qtd, movidos: [] as string[], faltaDestino: true };
    const movidos = destino ? await moverNegociosDaEtapa(tx, stageId, destino) : [];
    await tx.pipelineStage.delete({ where: { id: stageId } });
    const restantes = irmas.filter((s) => s.id !== stageId);
    for (let i = 0; i < restantes.length; i++) {
      await tx.pipelineStage.update({ where: { id: restantes[i].id }, data: { position: i } });
    }
    return { qtd, movidos, faltaDestino: false };
  });
  if (r.faltaDestino) {
    throw new ErroDeFunil(`Esta etapa tem ${r.qtd} negócio(s). Escolha para qual etapa eles vão.`, 409, "move_to_required", {
      deals: r.qtd,
    });
  }
  if (destino) {
    await registrarMudancasEmLote(
      r.movidos.map((dealId) => ({ orgId, dealId, pipelineId, fromStageId: stageId, toStageId: destino.id }))
    );
  }
  return { movidos: r.movidos.length };
}

export async function reordenarEtapas(orgId: string, pipelineId: string, pedidas: string[]) {
  const etapas = await prisma.pipelineStage.findMany({
    where: { pipelineId, pipeline: { orgId } },
    select: { id: true },
    orderBy: { position: "asc" },
  });
  if (etapas.length === 0) throw naoAchouFunil();
  const validas = new Set(etapas.map((e) => e.id));
  // Etapas que o cliente não mandou ficam no fim, na ordem atual: assim uma
  // lista desatualizada nunca apaga nem duplica posições.
  const ordem = [...pedidas.filter((i) => validas.has(i)), ...etapas.map((e) => e.id).filter((i) => !pedidas.includes(i))];
  await prisma.$transaction(ordem.map((sid, position) => prisma.pipelineStage.update({ where: { id: sid }, data: { position } })));
  return ordem;
}
