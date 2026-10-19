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
  carregarCatalogoSequencia,
  montarMensagemSequencia,
  montarPromptSequencia,
  validarRascunhoSequencia,
} from "@/lib/server/ia/sequencias";

// POST /api/agents/[agentId]/sequences/ia/rascunho
//   corpo: { pedido: string (≤ 800), atual?: RascunhoSequencia }
//   200:   { sequencia, explicacao, avisos[] } — rascunho validado, NADA gravado
//   400 corpo inválido · 401/403 sessão/papel · 404 agente de outra org
//   429 limite por org · 503 sem chave de IA · 502 falha do provedor
//   422 o modelo devolveu algo que não vira régua
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  // Mesma permissão de criar/editar sequência.
  const ctx = await requirePermission("broadcasts:send");
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

  const limite = await checkRateLimit(`ia-rascunho-sequencia:${ctx.orgId}`, LIMITE_POR_HORA, 3600);
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
        error: "Para a IA montar a régua, cadastre uma chave de IA (Anthropic, OpenAI, Google, Groq...) em Integrações.",
        codigo: "sem_chave",
      },
      { status: 503 }
    );
  }

  const catalogo = await carregarCatalogoSequencia(ctx.orgId, agentId);

  // O rascunho atual também passa pela validação: o que vai para o prompt
  // é só o que pertence à org.
  const atual = corpo.atual ? validarRascunhoSequencia(corpo.atual, catalogo) : null;

  const resposta = await pedirRascunho({
    provedor,
    systemPrompt: montarPromptSequencia(catalogo),
    userMessage: montarMensagemSequencia(corpo.pedido, atual?.ok ? atual.sequencia : null),
    descricaoDaFerramenta: "Entrega o rascunho da régua de sequência montado a partir do pedido.",
  });

  if (!resposta.ok) {
    if (resposta.motivo === "llm") {
      // Só o provedor e o começo do erro dele (status HTTP): nada do pedido.
      console.error(`[ia/sequencia] ${provedor.provider} falhou: ${resposta.detalhe.slice(0, 80)}`);
      return NextResponse.json({ error: "A IA não respondeu agora. Tenta de novo em instantes." }, { status: 502 });
    }
    return NextResponse.json({ error: "A IA respondeu num formato que não deu para usar. Tenta reformular o pedido." }, { status: 422 });
  }

  const validado = validarRascunhoSequencia(resposta.rascunho, catalogo);
  if (!validado.ok) return NextResponse.json({ error: validado.erro }, { status: 422 });

  return NextResponse.json({
    sequencia: validado.sequencia,
    explicacao: resposta.explicacao,
    avisos: validado.avisos,
  });
}
