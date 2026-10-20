import "server-only";
import { prisma } from "@/lib/db/prisma";
import { carregarDefinicoes } from "@/lib/server/custom-fields";
import {
  MOTIVOS_PADRAO,
  regraDoRegistro,
  validarMudancaDeEtapa,
  type CampoFaltando,
  type EstadoDoNegocio,
  type EtapaDaRegra,
  type MotivoDePerda,
  type RegraDaEtapa,
  type ResultadoDaMudanca,
} from "@/lib/regras-de-etapa";

// ---------------------------------------------------------------------------
// Regras por etapa no servidor: carrega regras, motivos e o estado do negócio
// e chama a validação pura (src/lib/regras-de-etapa.ts). O único chamador da
// validação é moveDealStage (src/lib/server/crm.ts), por onde passam o
// quadro, a prévia, a ficha, PATCH /api/deals/[id], a API v1, a importação e o
// motor do fluxo — ninguém move etapa por fora.
//
// Leituras tolerantes: sem as tabelas novas no banco, vale a regra padrão
// (nenhum campo obrigatório, 7 dias para parado) e os motivos padrão.
// ---------------------------------------------------------------------------

/** Erro da mudança de etapa com o que a tela precisa para abrir o modal certo. */
export class ErroDaMudanca extends Error {
  constructor(
    message: string,
    public status: 409 | 422,
    public codigo: "negocio_fechado" | "campos_obrigatorios" | "motivo_obrigatorio",
    public faltando: CampoFaltando[] = []
  ) {
    super(message);
    this.name = "ErroDaMudanca";
  }
}

/** Regras das etapas (padrão para quem não tem registro). `disponivel` = a tabela respondeu. */
export async function lerRegras(etapas: { id: string; type: string }[]): Promise<{ regras: Map<string, RegraDaEtapa>; disponivel: boolean }> {
  let linhas: { stageId: string; requiredFields: unknown; canBeSkipped: boolean; rottingDays: number | null; guidance: string }[] = [];
  let disponivel = true;
  if (etapas.length) {
    try {
      linhas = await prisma.pipelineStageRule.findMany({
        where: { stageId: { in: etapas.map((e) => e.id) } },
        select: { stageId: true, requiredFields: true, canBeSkipped: true, rottingDays: true, guidance: true },
      });
    } catch {
      disponivel = false;
    }
  }
  const porId = new Map(linhas.map((l) => [l.stageId, l]));
  return { regras: new Map(etapas.map((e) => [e.id, regraDoRegistro(porId.get(e.id), e.type)])), disponivel };
}

/** Motivos de perda do funil, na ordem. Sem registro (ou sem tabela): os padrão. */
export async function lerMotivos(pipelineId: string): Promise<{ motivos: MotivoDePerda[]; salvos: boolean; disponivel: boolean }> {
  try {
    const linhas = await prisma.pipelineLostReason.findMany({
      where: { pipelineId, archivedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, label: true, requiresNote: true },
    });
    if (linhas.length === 0) return { motivos: MOTIVOS_PADRAO, salvos: false, disponivel: true };
    return { motivos: linhas.map((l) => ({ id: l.id, rotulo: l.label, exigeNota: l.requiresNote })), salvos: true, disponivel: true };
  } catch {
    return { motivos: MOTIVOS_PADRAO, salvos: false, disponivel: false };
  }
}

/** Itens do negócio (a tabela de produtos pode não existir: conta 0). */
async function contarItens(dealId: string): Promise<number> {
  try {
    return await prisma.dealItem.count({ where: { dealId } });
  } catch {
    return 0;
  }
}

/** Estado atual do negócio + o que a mesma ação vai gravar (`pendente`). */
export async function estadoDoNegocio(
  deal: { id: string; amountCents: number; expectedClosingAt: Date | null; ownerId: string | null; companyId: string | null; customFields: unknown },
  pendente: Partial<EstadoDoNegocio> & { contatosNovos?: number } = {}
): Promise<EstadoDoNegocio> {
  const [contatos, produtos] = await Promise.all([prisma.dealContact.count({ where: { dealId: deal.id } }), contarItens(deal.id)]);
  const { contatosNovos = 0, ...resto } = pendente;
  return {
    amountCents: deal.amountCents,
    expectedClosingAt: deal.expectedClosingAt,
    ownerId: deal.ownerId,
    companyId: deal.companyId,
    contatos: contatos + contatosNovos,
    produtos,
    customFields: (deal.customFields ?? {}) as Record<string, unknown>,
    ...resto,
  };
}

/**
 * Confere a mudança: etapa atual e alvo, regras do funil de destino, campos
 * personalizados do funil. Devolve o resultado da validação pura.
 */
export async function conferirMudanca(e: {
  orgId: string;
  de: EtapaDaRegra | null;
  para: EtapaDaRegra;
  negocio: EstadoDoNegocio;
  reabrir?: boolean;
  ignorarObrigatorios?: boolean;
}): Promise<ResultadoDaMudanca> {
  // Sem nada para validar (mesma etapa, ou negócio fechado sem reabrir), nem consulta.
  const atalho = validarMudancaDeEtapa({ etapas: [], regras: new Map(), de: e.de, para: e.para, negocio: e.negocio, defs: [], reabrir: e.reabrir });
  if (!atalho.ok && atalho.codigo === "negocio_fechado") return atalho;
  if (e.de?.id === e.para.id) return atalho;

  const etapas = await prisma.pipelineStage.findMany({
    where: { pipelineId: e.para.pipelineId },
    select: { id: true, name: true, type: true, position: true, pipelineId: true },
  });
  const { regras } = await lerRegras(etapas.length ? etapas : [e.para]);
  const defs = await carregarDefinicoes(e.orgId, "deal", e.para.pipelineId);
  return validarMudancaDeEtapa({
    etapas,
    regras,
    de: e.de,
    para: e.para,
    negocio: e.negocio,
    defs,
    reabrir: e.reabrir,
    ignorarObrigatorios: e.ignorarObrigatorios,
  });
}

/** Grava (ou apaga, ao reabrir) o motivo estruturado da perda. Tolerante. */
export async function gravarPerda(
  d: { dealId: string; orgId: string; pipelineId: string },
  perda: { motivoId: string | null; rotulo: string; nota: string } | null
): Promise<void> {
  try {
    if (!perda) {
      await prisma.dealLoss.deleteMany({ where: { dealId: d.dealId } });
      return;
    }
    const dados = { orgId: d.orgId, pipelineId: d.pipelineId, reasonId: perda.motivoId, reasonLabel: perda.rotulo, note: perda.nota, lostAt: new Date() };
    await prisma.dealLoss.upsert({ where: { dealId: d.dealId }, create: { dealId: d.dealId, ...dados }, update: dados });
  } catch (e) {
    console.warn("[regras-de-etapa] motivo estruturado da perda não gravado", e instanceof Error ? e.message : e);
  }
}

/** Perda estruturada do negócio (para a ficha). Sem a tabela: null. */
export async function lerPerda(dealId: string): Promise<{ motivoId: string | null; rotulo: string; nota: string } | null> {
  try {
    const p = await prisma.dealLoss.findUnique({ where: { dealId }, select: { reasonId: true, reasonLabel: true, note: true } });
    return p ? { motivoId: p.reasonId, rotulo: p.reasonLabel, nota: p.note } : null;
  } catch {
    return null;
  }
}
