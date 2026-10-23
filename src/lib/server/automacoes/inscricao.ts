import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Objeto } from "@/lib/automacoes/tipos";

// ---------------------------------------------------------------------------
// Inscrever um registro numa automação: a mesma regra para evento, varredura,
// webhook de entrada e botão manual.
// - reinscrição: uma_vez (nunca de novo), sempre (mas uma execução viva por
//   registro) ou intervalo (horas desde a última);
// - "Não repetir por N min" do gatilho (mensagem recebida);
// - chave única: o mesmo evento nunca inscreve duas vezes (ON CONFLICT).
// ---------------------------------------------------------------------------

export const VIVAS = ["pendente", "rodando", "esperando", "pausada"];

export interface AutomacaoParaInscrever {
  id: string;
  orgId: string;
  objeto: string;
  versaoPublicadaId: string | null;
  reinscricao: string;
  reinscricaoHoras: number | null;
}

export type ResultadoDaInscricao = { inscrita: true; execucaoId: string } | { inscrita: false; motivo: string };

export const chaveDaInscricao = (automacaoId: string, objetoId: string, origem: string) =>
  createHash("sha256").update(`${automacaoId}:${objetoId}:${origem}`).digest("hex");

export async function inscrever(
  a: AutomacaoParaInscrever,
  objetoId: string,
  d: {
    /** Identifica a origem para a chave: id do evento, período da varredura, id do pedido manual. */
    origem: string;
    eventoId?: string | null;
    gatilho?: Record<string, unknown>;
    profundidade?: number;
    intervaloMin?: number;
    teste?: boolean;
    /** Variáveis iniciais (o teste de verdade grava as dele na mesma escrita). */
    variaveis?: Record<string, unknown>;
    status?: "pendente" | "cancelada";
    erro?: string;
  }
): Promise<ResultadoDaInscricao> {
  if (!a.versaoPublicadaId) return { inscrita: false, motivo: "sem versão publicada" };

  if (!d.teste && d.status !== "cancelada") {
    const anteriores = await prisma.automacaoExecucao.findMany({
      where: { automacaoId: a.id, objetoId, teste: false },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { status: true, createdAt: true },
    });
    const ultima = anteriores[0];
    if (ultima) {
      if (a.reinscricao === "uma_vez") return { inscrita: false, motivo: "já passou por esta automação" };
      if (VIVAS.includes(ultima.status)) return { inscrita: false, motivo: "já está nesta automação" };
      if (a.reinscricao === "intervalo" && a.reinscricaoHoras && Date.now() - ultima.createdAt.getTime() < a.reinscricaoHoras * 3_600_000) {
        return { inscrita: false, motivo: "entrou há pouco tempo" };
      }
      if (d.intervaloMin && Date.now() - ultima.createdAt.getTime() < d.intervaloMin * 60_000) return { inscrita: false, motivo: "intervalo do gatilho" };
    }
  }

  const chave = chaveDaInscricao(a.id, objetoId, d.teste ? `teste:${d.origem}:${Date.now()}` : d.origem);
  try {
    const e = await prisma.automacaoExecucao.create({
      data: {
        orgId: a.orgId,
        automacaoId: a.id,
        versaoId: a.versaoPublicadaId,
        objeto: a.objeto as Objeto,
        objetoId,
        eventoId: d.eventoId ?? null,
        chave,
        status: d.status ?? "pendente",
        erro: d.erro ?? null,
        gatilho: (d.gatilho ?? {}) as object,
        profundidade: d.profundidade ?? 0,
        teste: !!d.teste,
        ...(d.variaveis ? { variaveis: d.variaveis as object } : {}),
        proximaEm: new Date(),
        ...(d.status === "cancelada" ? { terminadaEm: new Date(), duracaoMs: 0 } : {}),
      },
      select: { id: true },
    });
    return { inscrita: true, execucaoId: e.id };
  } catch (error) {
    const codigo = (error as { code?: string })?.code;
    if (codigo === "P2002") return { inscrita: false, motivo: "este evento já inscreveu" };
    throw error;
  }
}
