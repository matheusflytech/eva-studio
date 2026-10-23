import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { validar, podePublicar, type Pendencia } from "@/lib/automacoes/validar";
import type { Definicao } from "@/lib/automacoes/tipos";
import { inscrever } from "./inscricao";
import { executarExecucao } from "./executor";
import { apagarCriadosNoTeste, apagarDadosDoTeste, conferirCondicoes, criarRegistroDeTeste, type CriadoNoTeste } from "./teste-real";

/** Segundos que o "Apagar dados do teste" espera um passo em andamento soltar. */
const ESPERA_DO_PASSO_RODANDO = 10;
import { planoDoTeste } from "@/lib/automacoes/teste";

// ---------------------------------------------------------------------------
// Ciclo de vida da automação: publicar (versão nova, imutável), pausar,
// retomar, inscrever à mão e testar o rascunho num registro real.
// Quem já está no meio continua na versão em que entrou.
// ---------------------------------------------------------------------------

export class ErroDaAutomacao extends Error {
  constructor(
    message: string,
    public status: number,
    public pendencias?: Pendencia[],
    /** Para a tela reagir a um caso específico (ex.: "contato_existente"). */
    public codigo?: string
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
 * Testa o rascunho num registro real: as ações só mostram o que fariam
 * e as esperas não esperam. Fica no histórico marcado como teste.
 */
export async function testarAutomacao(orgId: string, id: string, objetoId: string, userId: string | null) {
  const a = await carregar(orgId, id);
  const def = a.rascunho as unknown as Definicao;
  // Teste não muda nada: campo faltando só aparece no passo. Estrutura quebrada
  // (ciclo, passo solto, malformado) não dá para percorrer.
  const erros = validar(def).filter((p) => p.nivel === "erro" && p.no !== "gatilho" && !/falta /.test(p.mensagem));
  if (erros.length) throw new ErroDaAutomacao("Corrija a estrutura antes de testar.", 422, erros);
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

/** Telefone do teste: só dígitos, com DDI (55 quando vier só DDD + número). */
export function telefoneDoTeste(bruto: unknown): string | null {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

/**
 * Teste de verdade: cria um registro de teste que cumpre o gatilho e as
 * condições e roda o rascunho nele com as ações de verdade. O WhatsApp só vai
 * para o telefone do teste. Roda até terminar ou parar numa espera (curta);
 * a tela chama `continuarTeste` quando a espera vence.
 */
/**
 * Contato de verdade com esse telefone ou e-mail. O WhatsApp e o e-mail do teste
 * saem de verdade: com o número de um cliente, ele receberia o teste.
 */
export async function contatoComOsDadosDoTeste(orgId: string, telefone: string | null, email: string): Promise<string | null> {
  const ou: object[] = [];
  // Telefones podem estar gravados com ou sem DDI e pontuação: busca pelo fim.
  if (telefone) ou.push({ phone: { contains: telefone.slice(-8) } });
  if (email) ou.push({ email: { equals: email, mode: "insensitive" } });
  if (!ou.length) return null;
  const achados = await prisma.contact.findMany({
    where: { orgId, source: { not: "teste" }, OR: ou },
    select: { name: true, phone: true, email: true },
    take: 20,
  });
  const digitos = (v: string) => v.replace(/\D/g, "");
  const mesmo = achados.find(
    (c) =>
      (email && c.email.toLowerCase() === email.toLowerCase()) ||
      (telefone && digitos(c.phone).length >= 8 && (telefone.endsWith(digitos(c.phone)) || digitos(c.phone).endsWith(telefone.slice(2))))
  );
  return mesmo ? mesmo.name || "um contato" : null;
}

export async function testarDeVerdade(
  orgId: string,
  id: string,
  contato: { telefone?: unknown; email?: unknown; confirmarContatoExistente?: unknown },
  userId: string | null
) {
  const a = await carregar(orgId, id);
  const def = a.rascunho as unknown as Definicao;
  // Só pede o que o fluxo usa: sem passo de WhatsApp, o contato de teste fica sem telefone.
  const plano = planoDoTeste(def);
  const telefone = telefoneDoTeste(contato.telefone);
  if (plano.precisaWhatsApp && !telefone) throw new ErroDaAutomacao("Este fluxo manda WhatsApp: informe o número do teste com DDD (ex.: 47 99999-9999).", 400);
  const email = typeof contato.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contato.email.trim()) ? contato.email.trim() : "";
  if (plano.precisaEmail && !email) throw new ErroDaAutomacao("Este fluxo manda e-mail: informe o e-mail que recebe o teste.", 400);
  if (contato.confirmarContatoExistente !== true) {
    const dono = await contatoComOsDadosDoTeste(orgId, plano.precisaWhatsApp ? telefone : null, plano.precisaEmail ? email : "");
    if (dono) {
      throw new ErroDaAutomacao(
        `Esse número ou e-mail é de ${dono}, um contato do CRM. O teste manda mensagem de verdade para ele. Use um número seu de teste ou confirme.`,
        409,
        undefined,
        "contato_existente"
      );
    }
  }
  const erros = validar(def).filter((p) => p.nivel === "erro" && p.no !== "gatilho" && !/falta /.test(p.mensagem));
  if (erros.length) throw new ErroDaAutomacao("Corrija a estrutura antes de testar.", 422, erros);
  const versao = await prisma.automacaoVersao.upsert({
    where: { automacaoId_numero: { automacaoId: id, numero: VERSAO_DE_TESTE } },
    create: { automacaoId: id, numero: VERSAO_DE_TESTE, definicao: def as object, publicadaPor: userId },
    update: { definicao: def as object, publicadaPor: userId },
  });
  const inicio = new Date();
  const criados: CriadoNoTeste[] = [];
  let x: Awaited<ReturnType<typeof inscrever>>;
  let registro: Awaited<ReturnType<typeof criarRegistroDeTeste>>;
  let conferido: Awaited<ReturnType<typeof conferirCondicoes>>;
  try {
    registro = await criarRegistroDeTeste(orgId, id, def, { telefone: telefone ?? "", email }, criados);
    conferido = await conferirCondicoes(orgId, def, registro.objetoId);
    // As variáveis do teste vão na mesma escrita que cria a execução: a
    // varredura pode pegá-la antes de qualquer update e rodaria como simulada.
    x = await inscrever({ ...a, versaoPublicadaId: versao.id }, registro.objetoId, {
      origem: "teste-real",
      teste: true,
      gatilho: { ...registro.gatilho, por: userId },
      variaveis: { passos: {}, __testeReal: { telefone: telefone ?? "", email, criados: registro.criados, ...conferido } },
    });
  } catch (e) {
    // O que já foi criado não fica solto (sem execução, o "Apagar" não alcança).
    await apagarCriadosNoTeste(orgId, { criados, telefone: telefone ?? "", desde: inicio }).catch(() => 0);
    throw e;
  }
  if (!x.inscrita) {
    await apagarCriadosNoTeste(orgId, { criados, telefone: telefone ?? "", desde: inicio }).catch(() => 0);
    throw new ErroDaAutomacao(`Não deu para testar: ${x.motivo}.`, 409);
  }
  for (let i = 0; i < 5; i++) {
    const r = await executarExecucao(x.execucaoId);
    if (!r || r.status !== "pendente") break;
  }
  return { execucaoId: x.execucaoId, objeto: def.objeto, objetoId: registro.objetoId, ...conferido };
}

/** A tela chama quando a espera curta do teste venceu. Seguro chamar à toa. */
export async function continuarTeste(orgId: string, automacaoId: string, execucaoId: string) {
  const e = await prisma.automacaoExecucao.findFirst({ where: { id: execucaoId, automacaoId, orgId, teste: true }, select: { id: true } });
  if (!e) throw new ErroDaAutomacao("Teste não encontrado.", 404);
  const r = await executarExecucao(execucaoId);
  return { status: r?.status ?? null };
}

export async function apagarTeste(orgId: string, automacaoId: string, execucaoId: string) {
  let e = await prisma.automacaoExecucao.findFirst({ where: { id: execucaoId, automacaoId, orgId, teste: true }, select: { id: true, status: true } });
  if (!e) throw new ErroDaAutomacao("Teste não encontrado.", 404);
  // Um passo rodando agora pode criar algo depois da limpeza: espera ele soltar.
  for (let i = 0; e?.status === "rodando" && i < ESPERA_DO_PASSO_RODANDO; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    e = await prisma.automacaoExecucao.findFirst({ where: { id: execucaoId }, select: { id: true, status: true } });
  }
  if (!e) throw new ErroDaAutomacao("Teste não encontrado.", 404);
  if (e.status === "rodando") throw new ErroDaAutomacao("O teste ainda está rodando um passo. Tente de novo em alguns segundos.", 409);
  // Para o teste antes de apagar o registro (senão a próxima batida cancela sozinha).
  if (e.status === "pendente" || e.status === "esperando") {
    await prisma.automacaoExecucao.update({ where: { id: e.id }, data: { status: "cancelada", erro: "Dados do teste apagados.", proximaEm: null, terminadaEm: new Date() } });
  }
  return apagarDadosDoTeste(orgId, execucaoId);
}
