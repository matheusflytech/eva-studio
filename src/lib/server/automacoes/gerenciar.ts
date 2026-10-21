import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { validar, podePublicar, type Pendencia } from "@/lib/automacoes/validar";
import type { Definicao } from "@/lib/automacoes/tipos";
import { inscrever } from "./inscricao";
import { executarExecucao } from "./executor";

// ---------------------------------------------------------------------------
// Ciclo de vida da automação: publicar (versão nova, imutável), pausar,
// retomar, inscrever à mão e testar o rascunho num registro real.
// Quem já está no meio continua na versão em que entrou.
// ---------------------------------------------------------------------------

export class ErroDaAutomacao extends Error {
  constructor(
    message: string,
    public status: number,
    public pendencias?: Pendencia[]
  ) {
    super(message);
  }
}

/** Número 0 = versão de teste (o rascunho do momento). Publicadas começam em 1. */
const VERSAO_DE_TESTE = 0;

async function carregar(orgId: string, id: string) {
  const a = await prisma.automacao.findFirst({ where: { id, orgId } });
  if (!a) throw new ErroDaAutomacao("Automação não encontrada.", 404);
  return a;
}

export async function publicarAutomacao(orgId: string, id: string, userId: string | null) {
  const a = await carregar(orgId, id);
  const def = a.rascunho as unknown as Definicao;
  const pendencias = validar(def);
  if (!podePublicar(pendencias)) throw new ErroDaAutomacao("Corrija as pendências antes de publicar.", 422, pendencias.filter((p) => p.nivel === "erro"));
  const ultima = await prisma.automacaoVersao.findFirst({ where: { automacaoId: id }, orderBy: { numero: "desc" }, select: { numero: true } });
  const versao = await prisma.automacaoVersao.create({
    data: { automacaoId: id, numero: Math.max(ultima?.numero ?? 0, 0) + 1, definicao: def as object, publicadaPor: userId },
  });
  await prisma.automacao.update({
    where: { id },
    data: { versaoPublicadaId: versao.id, status: "ativa", pausadaPor: null, falhasSeguidas: 0, objeto: def.objeto },
  });
  // Execuções que pararam com a pausa continuam (cada uma na versão dela).
  await prisma.automacaoExecucao.updateMany({ where: { automacaoId: id, status: "pausada" }, data: { status: "pendente", proximaEm: new Date() } });
  return { versao: versao.numero, avisos: pendencias.filter((p) => p.nivel === "aviso") };
}

export async function pausarAutomacao(orgId: string, id: string, motivo = "Pausada por alguém da equipe.") {
  await carregar(orgId, id);
  await prisma.automacao.update({ where: { id }, data: { status: "pausada", pausadaPor: motivo } });
}

export async function retomarAutomacao(orgId: string, id: string) {
  const a = await carregar(orgId, id);
  if (!a.versaoPublicadaId) throw new ErroDaAutomacao("Publique a automação antes de ligar.", 409);
  await prisma.automacao.update({ where: { id }, data: { status: "ativa", pausadaPor: null, falhasSeguidas: 0 } });
  await prisma.automacaoExecucao.updateMany({ where: { automacaoId: id, status: "pausada" }, data: { status: "pendente", proximaEm: new Date() } });
}

/** Botão "rodar agora" no registro ou em massa na lista. */
export async function inscreverManualmente(orgId: string, id: string, objetoIds: string[], userId: string | null) {
  const a = await carregar(orgId, id);
  if (a.status !== "ativa") throw new ErroDaAutomacao("Ligue a automação antes de rodar.", 409);
  const pedido = randomUUID();
  const r = { inscritas: 0, ignoradas: [] as { id: string; motivo: string }[], execucoes: [] as string[] };
  for (const objetoId of objetoIds.slice(0, 500)) {
    const x = await inscrever(a, objetoId, { origem: `manual:${pedido}`, gatilho: { tipo: "manual", por: userId } });
    if (x.inscrita) {
      r.inscritas++;
      r.execucoes.push(x.execucaoId);
    } else r.ignoradas.push({ id: objetoId, motivo: x.motivo });
  }
  for (const e of r.execucoes.slice(0, 10)) await executarExecucao(e).catch(() => null);
  return r;
}

/**
 * Testa o rascunho num registro real: ações externas só mostram o que fariam
 * e as esperas não esperam. Fica no histórico marcado como teste.
 */
export async function testarAutomacao(orgId: string, id: string, objetoId: string, userId: string | null) {
  const a = await carregar(orgId, id);
  const def = a.rascunho as unknown as Definicao;
  const erros = validar(def).filter((p) => p.nivel === "erro" && p.no !== "gatilho");
  if (erros.length) throw new ErroDaAutomacao("Corrija as pendências dos passos antes de testar.", 422, erros);
  const versao = await prisma.automacaoVersao.upsert({
    where: { automacaoId_numero: { automacaoId: id, numero: VERSAO_DE_TESTE } },
    create: { automacaoId: id, numero: VERSAO_DE_TESTE, definicao: def as object, publicadaPor: userId },
    update: { definicao: def as object, publicadaPor: userId },
  });
  const x = await inscrever({ ...a, versaoPublicadaId: versao.id }, objetoId, { origem: "teste", teste: true, gatilho: { tipo: "teste", por: userId } });
  if (!x.inscrita) throw new ErroDaAutomacao(`Não deu para testar: ${x.motivo}.`, 409);
  // Teste roda inteiro de uma vez (esperas colapsadas), até 5 rodadas.
  for (let i = 0; i < 5; i++) {
    const r = await executarExecucao(x.execucaoId);
    if (!r || r.status !== "pendente") break;
  }
  return { execucaoId: x.execucaoId };
}
