import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { callLlmWithTools } from "@/lib/server/llm";
import { escolherProvedorDeIa } from "@/lib/server/ia/provedor";
import { mensagemDeFalhaDaIa } from "@/lib/ia/falha-do-provedor";
import { registrarUso } from "@/lib/server/ia/uso";
import { carregarCatalogo } from "@/lib/server/ia/catalogo";
import { sanearRelatorio } from "@/lib/report-query";
import {
  LIMITE_DO_PEDIDO,
  derivarFiltrosGlobais,
  extrairJson,
  montarPromptDeConsulta,
  validarRespostaDaIa,
  type ModoDaIa,
} from "@/lib/server/ia/consulta-ia";
import { montarPromptDeRelatorio, validarRelatorioDaIa } from "@/lib/server/ia/relatorio-ia";
import { diaLocal, sanearConsulta, sanearFiltrosGlobais } from "@/lib/consulta";

// ---------------------------------------------------------------------------
// "Pergunte à Eva" do dashboard: frase em português → consulta de cartão
// (modo "cartao"), filtros da barra do painel (modo "globais") ou cartão do
// construtor v2 (modo "relatorio").
//
// Corpo: { pedido: string (≤ 500), modo?: "cartao" | "globais",
//          consultaAtual?: Consulta, globaisAtuais?: FiltrosGlobais }
//
// Resposta (cartao):  { modo, consulta, tipo, titulo, explicacao, avisos }
// Resposta (relatorio): { modo, relatorio: { query, viz, meta? }, titulo, explicacao }
//   (corpo pode trazer relatorioAtual: { query, viz } para ajustes)
// Resposta (globais): { modo, globais: { dias, de?, ate?, funis, donos },
//                       sobras, cartao: { consulta, tipo, titulo } | null,
//                       explicacao, avisos }
//
// Erros: 400 pedido vazio/longo · 429 limite · 503 sem chave de IA ·
//        502 provedor falhou · 422 resposta do modelo inaproveitável.
//
// O pedido e a resposta do modelo não vão para o log: podem ter nome de
// cliente e valores de negócio.
// ---------------------------------------------------------------------------

/** Pedidos por organização a cada 10 minutos. */
const LIMITE_POR_ORG = 30;
const JANELA_S = 600;

export async function POST(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const pedido = typeof body?.pedido === "string" ? body.pedido.trim() : "";
  if (!pedido) return NextResponse.json({ error: "Me diz o que você quer ver." }, { status: 400 });
  if (pedido.length > LIMITE_DO_PEDIDO) {
    return NextResponse.json({ error: `Pedido longo demais: tenta resumir em até ${LIMITE_DO_PEDIDO} caracteres.` }, { status: 400 });
  }
  const modo: ModoDaIa | "relatorio" = body?.modo === "globais" ? "globais" : body?.modo === "relatorio" ? "relatorio" : "cartao";

  const provedor = await escolherProvedorDeIa(orgId);
  if (!provedor) {
    return NextResponse.json(
      {
        error: "A IA ainda não está ligada nesta conta. Cadastre uma chave de IA (Groq, OpenAI, Anthropic...) em Integrações e volte aqui.",
        codigo: "sem_chave",
      },
      { status: 503 }
    );
  }

  const limite = await checkRateLimit(`ia-consulta:${orgId}`, LIMITE_POR_ORG, JANELA_S);
  if (!limite.allowed) {
    return NextResponse.json({ error: "Muitos pedidos seguidos. Espera uns minutinhos e tenta de novo." }, { status: 429 });
  }

  const hoje = diaLocal(new Date());
  const catalogo = await carregarCatalogo(orgId);
  const consultaAtual = modo === "cartao" ? sanearConsulta(body?.consultaAtual) : null;
  const relatorioAtual = modo === "relatorio" ? sanearRelatorio(body?.relatorioAtual) : null;
  const globaisAtuais = sanearFiltrosGlobais(
    body?.globaisAtuais && typeof body.globaisAtuais === "object" ? (body.globaisAtuais as Record<string, unknown>) : {}
  );

  const resultado = await callLlmWithTools({
    provider: provedor.provider,
    apiKey: provedor.apiKey,
    model: provedor.model,
    systemPrompt:
      modo === "relatorio"
        ? montarPromptDeRelatorio(catalogo, { hoje, atual: relatorioAtual })
        : montarPromptDeConsulta(catalogo, { hoje, modo, consultaAtual }),
    userMessage: pedido,
    tools: [],
    executeTool: async () => "",
    maxIterations: 1,
    effort: "low",
    maxTokens: 1500,
  });
  await registrarUso([{
    orgId,
    credentialId: provedor.credentialId ?? null,
    recurso: "dashboard",
    provider: provedor.provider,
    model: provedor.model,
    inputTokens: resultado.usage?.entrada ?? 0,
    outputTokens: resultado.usage?.saida ?? 0,
    ok: !resultado.error && !!resultado.text,
  }]);

  if (resultado.error || !resultado.text) {
    // Só o provedor e o começo do erro dele (status HTTP): nada do pedido.
    console.error(`[ia/consulta] ${provedor.provider} falhou: ${(resultado.error ?? "resposta vazia").slice(0, 80)}`);
    return NextResponse.json({ error: mensagemDeFalhaDaIa(provedor.provider, provedor.model, resultado.error) }, { status: 502 });
  }

  const json = extrairJson(resultado.text);
  if (modo === "relatorio") {
    const r = json ? validarRelatorioDaIa(json) : null;
    if (!r) {
      return NextResponse.json(
        { error: "Não consegui transformar esse pedido num cartão. Tenta dizer o que medir, de qual base e como separar." },
        { status: 422 }
      );
    }
    const { titulo, explicacao, ...relatorio } = r;
    return NextResponse.json({ modo, relatorio, titulo, explicacao });
  }
  const lido = json ? validarRespostaDaIa(json, catalogo, hoje) : null;
  if (!lido) {
    return NextResponse.json(
      { error: "Não consegui transformar esse pedido num cartão. Tenta descrever de outro jeito, com o que medir e de quais negócios." },
      { status: 422 }
    );
  }

  if (modo === "globais") {
    const g = derivarFiltrosGlobais(lido, catalogo, globaisAtuais);
    return NextResponse.json({
      modo,
      globais: g.globais,
      sobras: g.sobras,
      cartao: g.sobras.length ? { consulta: lido.consulta, tipo: lido.tipo, titulo: lido.titulo } : null,
      explicacao: lido.explicacao,
      avisos: [...g.avisos, ...lido.avisos],
    });
  }

  return NextResponse.json({
    modo,
    consulta: lido.consulta,
    tipo: lido.tipo,
    titulo: lido.titulo,
    explicacao: lido.explicacao,
    avisos: lido.avisos,
  });
}
