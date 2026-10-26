import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { Edge, Node } from "@xyflow/react";
import { prisma } from "@/lib/db/prisma";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";
import { ErroApi } from "@/lib/server/api-v1/http";
import { substituirFluxo, validarFluxo, type Problema } from "@/lib/server/api-v1/fluxos";
import { FLUXO_PRINCIPAL, MAX_FLUXOS, sanearPalavras } from "@/lib/subfluxos";

// ---------------------------------------------------------------------------
// Fluxos extras do bot (S4) e o pacote de exportação/importação, usados pelo
// builder (/api/flows/...) e pela API v1 (/agents/{id}/subflows, /flow/export,
// /flow/import). Tudo que entra passa pela mesma validação do fluxo principal.
// ---------------------------------------------------------------------------

export const FORMATO_DO_PACOTE = "eva.flows";

type Modo = "api" | "builder";
interface Opcoes {
  modo: Modo;
  temUrlDoFluxo: boolean;
}

/** Fluxo novo nasce só com o Início, como o principal. */
const SO_INICIO = [{ id: "inicio", type: "flowNode", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false } }];

/** ErroApi da lógica daqui → resposta das rotas do builder ({ error, issues }). */
export function respostaDoBuilder(err: unknown) {
  if (!(err instanceof ErroApi)) throw err;
  const issues = (err.extra.details as { issues?: unknown[] } | undefined)?.issues ?? [];
  return NextResponse.json({ error: err.message, issues }, { status: err.status });
}

function nomeValido(bruto: unknown): string {
  const nome = typeof bruto === "string" ? bruto.trim().slice(0, 60) : "";
  if (!nome) throw new ErroApi(400, "invalid_parameter", "Dê um nome ao fluxo.", { param: "name" });
  return nome;
}

async function conferirNomeLivre(agentId: string, nome: string, exceto?: string) {
  const repetido = await prisma.agentSubflow.findFirst({
    where: { agentId, name: { equals: nome, mode: "insensitive" }, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { id: true },
  });
  if (repetido) throw new ErroApi(409, "conflict", "Já existe um fluxo com esse nome.", { param: "name" });
}

/** Valida nodes/edges com o rótulo do fluxo na mensagem (o pacote tem vários). */
async function validarConteudo(orgId: string, nome: string, bruto: { nodes?: unknown; edges?: unknown }, op: Opcoes) {
  try {
    return await validarFluxo(orgId, bruto, op);
  } catch (e) {
    if (e instanceof ErroApi) throw new ErroApi(e.status, e.code, `Fluxo "${nome}": ${e.message}`, e.extra);
    throw e;
  }
}

export function serializarSubfluxo(f: { id: string; agentId: string; name: string; keywords: string[]; position: number; nodes: unknown; edges: unknown; updatedAt: Date }) {
  return { id: f.id, agent_id: f.agentId, name: f.name, keywords: f.keywords, position: f.position, nodes: f.nodes, edges: f.edges, updated_at: f.updatedAt.toISOString() };
}

export async function criarSubfluxo(orgId: string, agentId: string, corpo: { name?: unknown; keywords?: unknown; nodes?: unknown; edges?: unknown }, op: Opcoes) {
  const name = nomeValido(corpo.name);
  const total = await prisma.agentSubflow.count({ where: { agentId } });
  if (total >= MAX_FLUXOS) throw new ErroApi(422, "limit_reached", `Máximo de ${MAX_FLUXOS} fluxos por agente.`);
  await conferirNomeLivre(agentId, name);
  const comConteudo = corpo.nodes !== undefined || corpo.edges !== undefined;
  const conteudo = comConteudo ? await validarConteudo(orgId, name, corpo, op) : null;
  const flow = await prisma.agentSubflow.create({
    data: {
      agentId,
      name,
      keywords: sanearPalavras(corpo.keywords),
      position: total,
      nodes: (conteudo?.nodes ?? SO_INICIO) as unknown as object,
      edges: (conteudo?.edges ?? []) as unknown as object,
    },
  });
  return { flow, avisos: conteudo?.avisos ?? [] };
}

export async function atualizarSubfluxo(orgId: string, agentId: string, flowId: string, corpo: { name?: unknown; keywords?: unknown; nodes?: unknown; edges?: unknown }, op: Opcoes) {
  const atual = await prisma.agentSubflow.findFirst({ where: { id: flowId, agentId, agent: { orgId } } });
  if (!atual) throw new ErroApi(404, "not_found", "Fluxo não encontrado.");
  const data: { name?: string; keywords?: string[]; nodes?: object; edges?: object } = {};
  if (corpo.name !== undefined) {
    data.name = nomeValido(corpo.name);
    await conferirNomeLivre(agentId, data.name, flowId);
  }
  if (corpo.keywords !== undefined) data.keywords = sanearPalavras(corpo.keywords);
  let avisos: Problema[] = [];
  if (corpo.nodes !== undefined || corpo.edges !== undefined) {
    const r = await validarConteudo(orgId, data.name ?? atual.name, corpo, op);
    data.nodes = r.nodes as unknown as object;
    data.edges = r.edges as unknown as object;
    avisos = r.avisos;
  }
  const flow = await prisma.agentSubflow.update({ where: { id: flowId }, data });
  return { flow, avisos };
}

/** Conversa que estava neste fluxo volta para o principal na próxima mensagem. */
export async function apagarSubfluxo(orgId: string, agentId: string, flowId: string) {
  const atual = await prisma.agentSubflow.findFirst({ where: { id: flowId, agentId, agent: { orgId } }, select: { id: true } });
  if (!atual) throw new ErroApi(404, "not_found", "Fluxo não encontrado.");
  await prisma.$transaction([
    prisma.conversation.updateMany({ where: { agentId, currentFlowId: flowId }, data: { currentFlowId: null, currentNodeId: null } }),
    prisma.agentSubflow.delete({ where: { id: flowId } }),
  ]);
}

// ── Pacote: o bot inteiro (principal + extras) num JSON ────────────────────

export async function exportarPacote(agentId: string, agentName: string) {
  const [principal, extras] = await Promise.all([
    prisma.agentFlow.findUnique({ where: { agentId } }),
    prisma.agentSubflow.findMany({ where: { agentId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
  ]);
  return {
    format: FORMATO_DO_PACOTE,
    version: 1,
    agent_name: agentName,
    exported_at: new Date().toISOString(),
    main: { nodes: principal?.nodes ?? [], edges: principal?.edges ?? [] },
    subflows: extras.map((s) => ({ id: s.id, name: s.name, keywords: s.keywords, nodes: s.nodes, edges: s.edges })),
  };
}

/** Troca o destino dos "Ir para fluxo" pelos ids deste agente; destino fora do pacote fica vazio (vira aviso). */
export function remapearDestinos(nodes: Node<FlowNodeData>[], mapa: Map<string, string>): { nodes: Node<FlowNodeData>[]; soltos: string[] } {
  const soltos: string[] = [];
  const out = nodes.map((n) => {
    const alvo = n.data.iconKey === "go-to-flow" ? n.data.targetFlowId : undefined;
    if (!alvo || alvo === FLUXO_PRINCIPAL) return n;
    const novo = mapa.get(alvo);
    if (!novo) soltos.push(n.id);
    return { ...n, data: { ...n.data, targetFlowId: novo ?? "" } };
  });
  return { nodes: out, soltos };
}

/**
 * Importa um pacote: o principal é substituído (a versão anterior fica para
 * desfazer) e cada fluxo extra entra pelo nome — com o mesmo nome, o
 * conteúdo é trocado; nome novo, o fluxo é criado. Fluxos do agente que não
 * estão no arquivo ficam como estão. Tudo é validado antes de gravar.
 */
export async function importarPacote(orgId: string, agentId: string, bruto: unknown, op: Opcoes) {
  const p = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  if (p.format !== FORMATO_DO_PACOTE) {
    throw new ErroApi(400, "invalid_parameter", `Envie um pacote exportado da Eva (format: "${FORMATO_DO_PACOTE}").`, { param: "format" });
  }
  const main = p.main && typeof p.main === "object" ? (p.main as { nodes?: unknown; edges?: unknown }) : null;
  if (!main) throw new ErroApi(400, "invalid_parameter", "Falta o fluxo principal (main).", { param: "main" });
  const extrasBrutos = Array.isArray(p.subflows) ? p.subflows : [];
  if (p.subflows !== undefined && !Array.isArray(p.subflows)) throw new ErroApi(400, "invalid_parameter", "subflows precisa ser uma lista.", { param: "subflows" });

  const existentes = await prisma.agentSubflow.findMany({ where: { agentId }, select: { id: true, name: true } });
  const porNome = new Map(existentes.map((e) => [e.name.toLowerCase(), e.id]));
  const vistos = new Set<string>();
  const extras = extrasBrutos.map((s, i) => {
    const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
    const name = nomeValido(o.name);
    if (vistos.has(name.toLowerCase())) throw new ErroApi(400, "invalid_parameter", `Fluxo repetido no arquivo: ${name}.`, { param: `subflows[${i}].name` });
    vistos.add(name.toLowerCase());
    const destino = porNome.get(name.toLowerCase()) ?? randomUUID();
    return { idNoArquivo: typeof o.id === "string" ? o.id : "", destino, novo: !porNome.has(name.toLowerCase()), name, keywords: sanearPalavras(o.keywords), nodes: o.nodes, edges: o.edges };
  });
  const novos = extras.filter((e) => e.novo).length;
  if (existentes.length + novos > MAX_FLUXOS) throw new ErroApi(422, "limit_reached", `Máximo de ${MAX_FLUXOS} fluxos por agente.`);

  const mapa = new Map(extras.filter((e) => e.idNoArquivo).map((e) => [e.idNoArquivo, e.destino]));
  const avisos: Problema[] = [];
  const preparar = async (nome: string, conteudo: { nodes?: unknown; edges?: unknown }) => {
    const r = await validarConteudo(orgId, nome, conteudo, op);
    const { nodes, soltos } = remapearDestinos(r.nodes, mapa);
    for (const id of soltos) avisos.push({ code: "flow_warning", message: `${nome}: "Ir para fluxo" aponta para um fluxo que não está no arquivo.`, node_id: id });
    avisos.push(...r.avisos.map((a) => ({ ...a, message: `${nome}: ${a.message}` })));
    return { nodes, edges: r.edges };
  };

  const principal = await preparar("Principal", main);
  const prontos: { e: (typeof extras)[number]; nodes: Node<FlowNodeData>[]; edges: Edge[] }[] = [];
  for (const e of extras) prontos.push({ e, ...(await preparar(e.name, { nodes: e.nodes, edges: e.edges })) });

  await substituirFluxo(orgId, agentId, principal, "importacao");
  let posicao = existentes.length; // fluxo novo entra depois das abas que já existem
  await prisma.$transaction(
    prontos.map(({ e, nodes, edges }) =>
      e.novo
        ? prisma.agentSubflow.create({ data: { id: e.destino, agentId, name: e.name, keywords: e.keywords, position: posicao++, nodes: nodes as unknown as object, edges: edges as unknown as object } })
        : prisma.agentSubflow.update({ where: { id: e.destino }, data: { keywords: e.keywords, nodes: nodes as unknown as object, edges: edges as unknown as object } })
    )
  );
  return { avisos, criados: novos, atualizados: extras.length - novos };
}
