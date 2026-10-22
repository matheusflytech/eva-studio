import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  LIMITE_POR_HORA,
  lerCorpoDoPedido,
  pedirRascunho,
  resolverProvedorDeIa,
} from "@/lib/server/ia/automacoes-llm";
import {
  carregarCatalogoFluxo,
  compactarFluxo,
  montarMensagemFluxo,
  montarPromptFluxo,
  normalizarFluxo,
} from "@/lib/server/ia/fluxos";

// POST /api/agents/[agentId]/flow/ia/rascunho
//   corpo: { pedido: string (≤ 800), atual?: { nodes, edges } }
//   200:   { fluxo: { nodes, edges }, explicacao, avisos[] } — validado, NADA gravado
//   400 corpo inválido · 401/403 sessão/papel · 404 agente de outra org
//   429 limite por org · 503 sem chave de IA · 502 falha do provedor
//   422 o modelo devolveu algo que não vira fluxo
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  // Editar fluxo é "agents:manage" no RBAC (agente, fluxo, conexões).
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId }, select: { id: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const corpo = lerCorpoDoPedido(body);
  if ("erro" in corpo) return NextResponse.json({ error: corpo.erro }, { status: 400 });

  const limite = await checkRateLimit(`ia-rascunho-fluxo:${ctx.orgId}`, LIMITE_POR_HORA, 3600);
  if (!limite.allowed) {
    return NextResponse.json(
      { error: "Muitos rascunhos na última hora. Respira um pouco e tenta de novo daqui a pouco." },
      { status: 429 }
    );
  }

  const provedor = await resolverProvedorDeIa(ctx.orgId);
  if (!provedor) {
    return NextResponse.json(
      {
        error: "Para a IA montar o fluxo, cadastre uma chave de IA (Anthropic, OpenAI, Google, Groq...) em Integrações.",
        codigo: "sem_chave",
      },
      { status: 503 }
    );
  }

  const catalogo = await carregarCatalogoFluxo(ctx.orgId, agentId);

  const resposta = await pedirRascunho({
    uso: { orgId: ctx.orgId, agentId, recurso: "rascunho_fluxo" },
    provedor,
    systemPrompt: montarPromptFluxo(catalogo),
    userMessage: montarMensagemFluxo(corpo.pedido, compactarFluxo(corpo.atual)),
    descricaoDaFerramenta: "Entrega o rascunho do fluxo de conversa (blocos e ligações) montado a partir do pedido.",
    maxTokens: 6000,
  });

  if (!resposta.ok) {
    if (resposta.motivo === "llm") {
      // Só o provedor e o começo do erro dele (status HTTP): nada do pedido.
      console.error(`[ia/fluxo] ${provedor.provider} falhou: ${resposta.detalhe.slice(0, 80)}`);
      return NextResponse.json({ error: "A IA não respondeu agora. Tenta de novo em instantes." }, { status: 502 });
    }
    return NextResponse.json({ error: "A IA respondeu num formato que não deu para usar. Tenta reformular o pedido." }, { status: 422 });
  }

  const fluxo = normalizarFluxo(resposta.rascunho, catalogo);
  if (!fluxo.ok) return NextResponse.json({ error: fluxo.erro }, { status: 422 });

  return NextResponse.json({
    fluxo: { nodes: fluxo.nodes, edges: fluxo.edges },
    explicacao: resposta.explicacao,
    avisos: fluxo.avisos,
  });
}
