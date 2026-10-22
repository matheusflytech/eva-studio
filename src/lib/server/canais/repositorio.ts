import "server-only";
import { prisma } from "@/lib/db/prisma";
import { listarCanais as listarDasAtivacoes } from "@/lib/server/canais-do-contrato";
import type { TipoDeCanal } from "@/lib/canais";

// ---------------------------------------------------------------------------
// Leitura dos canais do contrato, para as telas.
//
// Fonte: eva_studio_canais. Sem a tabela (SQL 2026-10-22 ainda não
// aplicado), monta a mesma lista a partir das conexões de cada agente, como
// era antes; nesse modo nada se conecta pelo contrato (disponivel = false).
// ---------------------------------------------------------------------------

export interface CanalNaTela {
  id: string;
  tipo: TipoDeCanal;
  rotulo: string;
  status: "conectado" | "atencao" | "pendente" | "desconectado";
  detalhe: string | null;
  agentId: string | null;
  agentNome: string | null;
}

export interface CanaisNaTela {
  disponivel: boolean;
  canais: CanalNaTela[];
  agentes: { id: string; nome: string; widget: boolean }[];
}

export async function lerCanaisDoContrato(orgId: string): Promise<CanaisNaTela> {
  const agentes = await prisma.agent.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, widgetEnabled: true },
  });
  const nome = new Map(agentes.map((a) => [a.id, a.name]));
  const listaDeAgentes = agentes.map((a) => ({ id: a.id, nome: a.name, widget: a.widgetEnabled }));

  try {
    const canais = await prisma.canal.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
    return {
      disponivel: true,
      agentes: listaDeAgentes,
      canais: canais.map((c) => ({
        id: c.id,
        tipo: c.tipo as TipoDeCanal,
        rotulo: c.rotulo,
        status: c.status as CanalNaTela["status"],
        detalhe: c.detalhe,
        agentId: c.agentId,
        agentNome: c.agentId ? nome.get(c.agentId) ?? null : null,
      })),
    };
  } catch {
    const legado = await listarDasAtivacoes(orgId);
    return {
      disponivel: false,
      agentes: listaDeAgentes,
      canais: legado.conexoes.map((c) => ({
        id: `legado:${c.tipo}:${c.agentId}`,
        tipo: c.tipo,
        rotulo: c.rotulo,
        status: c.situacao,
        detalhe: c.detalhe ?? null,
        agentId: c.agentId,
        agentNome: c.agentNome,
      })),
    };
  }
}

/** Canal do contrato pelo id, ou null (inclusive sem a tabela). */
export async function lerCanal(orgId: string, canalId: string) {
  try {
    return await prisma.canal.findFirst({ where: { id: canalId, orgId } });
  } catch {
    return null;
  }
}
