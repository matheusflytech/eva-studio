import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { callLlmWithTools, type LlmToolCall } from "@/lib/server/llm";
import { provedorDoChat } from "@/lib/server/ia/provedor";
import { registrarUso } from "@/lib/server/ia/uso";
import { carregarCatalogo } from "@/lib/server/ia/catalogo";
import {
  FERRAMENTA_CONSULTAR,
  FERRAMENTA_RELATORIO,
  LINHAS_DO_CARTAO,
  MAX_CARTOES,
  montarPromptDoChat,
  textoDoResultado,
  validarCartaoDoChat,
  validarMensagens,
  type CartaoDoChat,
} from "@/lib/server/ia/chat-ia";
import { rodarReportQuery } from "@/lib/server/report-sql";
import { sanearReportQuery, type ReportQuery, type ReportResult } from "@/lib/report-query";
import { sanearFiltrosGlobais, diaLocal } from "@/lib/consulta";
import { mensagemDeFalhaDaIa } from "@/lib/ia/falha-do-provedor";

// ---------------------------------------------------------------------------
// Chat da Eva (botão flutuante).
//
// Corpo: { mensagens: [{ role: "user" | "assistant", content }], pagina?: string }
// Resposta: { resposta: string, cartoes: [{ query, viz, titulo, result }] }
//
// Chave: a da Eva (GROQ_API_KEY) por padrão, ou a do contrato se ele escolheu (Integrações → IA).
// A IA só lê: a única ferramenta é consultar_dados, que roda o mesmo motor dos
// cartões de relatório, sempre no contrato da sessão. Erros: 400 conversa
// inválida · 429 limite · 503 sem chave da Eva (GROQ_API_KEY) · 502 provedor falhou.
//
// A conversa e as respostas não vão para o log: têm nome de cliente e valores.
// ---------------------------------------------------------------------------

/** Pedidos por contrato a cada 10 minutos. */
const LIMITE_POR_ORG = 40;
const JANELA_S = 600;
const RODADAS_DE_FERRAMENTA = 4;
/**
 * Perguntas por minuto, somando todos os contratos, na chave da Eva. Cada pergunta gasta uns 5 mil
 * tokens e o plano grátis da Groq dá 8 mil por minuto: passar disso só queima token e dá 429.
 * Com plano pago, suba pela variável CHAT_IA_LIMITE_POR_MINUTO na Vercel.
 */
const LIMITE_DA_EVA_POR_MINUTO = Math.max(1, Number(process.env.CHAT_IA_LIMITE_POR_MINUTO) || 1);

export async function POST(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const conversa = validarMensagens(body?.mensagens);
  if (!conversa) return NextResponse.json({ error: "Me diz o que você quer saber." }, { status: 400 });
  const pagina = typeof body?.pagina === "string" ? body.pagina.slice(0, 60) : undefined;

  const { provedor, origem } = await provedorDoChat(orgId);
  if (!provedor) {
    return NextResponse.json(
      {
        error:
          origem === "contract"
            ? "Este contrato escolheu usar a própria chave de IA no chat, mas não tem nenhuma. Cadastre uma em Integrações ou volte para a chave da Eva."
            : "A IA da Eva está desligada no momento. Avise o suporte.",
        codigo: "sem_chave",
      },
      { status: 503 }
    );
  }

  const limite = await checkRateLimit(`ia-chat:${orgId}`, LIMITE_POR_ORG, JANELA_S);
  if (!limite.allowed) return NextResponse.json({ error: "Muitas perguntas seguidas. Espera uns minutinhos e tenta de novo." }, { status: 429 });

  if (origem === "eva") {
    const fila = await checkRateLimit("ia-chat:eva", LIMITE_DA_EVA_POR_MINUTO, 60);
    if (!fila.allowed) {
      return NextResponse.json({ error: "A Eva está atendendo outra pergunta agora. Espere um minutinho e pergunte de novo." }, { status: 429 });
    }
  }

  const catalogo = await carregarCatalogo(orgId);
  const globais = sanearFiltrosGlobais({});

  // Cartões que a IA mostrou nesta resposta, já com os dados (a tela não precisa consultar de novo).
  const cartoes: (CartaoDoChat & { result: ReportResult })[] = [];

  async function rodar(query: ReportQuery): Promise<ReportResult | string> {
    try {
      return (await rodarReportQuery(orgId, query, globais)) ?? "Erro: escolha ao menos uma medida, um agrupamento ou colunas.";
    } catch (e) {
      return String((e as Error)?.message ?? "").includes("statement timeout")
        ? "Erro: a consulta demorou demais. Filtre um período menor."
        : "Erro: não deu para calcular essa consulta.";
    }
  }

  async function executarFerramenta(call: LlmToolCall): Promise<string> {
    if (call.name === FERRAMENTA_RELATORIO.name) {
      if (cartoes.length >= MAX_CARTOES) return `Erro: já mostrei ${MAX_CARTOES} cartões nesta resposta.`;
      const cartao = validarCartaoDoChat(call.arguments);
      if (!cartao) return "Erro: relatório inválido. Confira a consulta (bases, campos, operadores e medidas da lista) e o visual.";
      const r = await rodar(cartao.query);
      if (typeof r === "string") return r;
      cartoes.push({ ...cartao, result: { columns: r.columns, rows: r.rows.slice(0, LINHAS_DO_CARTAO), truncated: r.truncated || r.rows.length > LINHAS_DO_CARTAO } });
      return `Cartão "${cartao.titulo}" mostrado à pessoa.
${textoDoResultado(r)}`;
    }
    let bruta: unknown;
    try {
      bruta = JSON.parse(call.arguments.consulta ?? "");
    } catch {
      return "Erro: a consulta não é um JSON válido ou faltou o parâmetro consulta. Mande o JSON no parâmetro consulta.";
    }
    const query = sanearReportQuery({ v: 2, ...(bruta && typeof bruta === "object" ? bruta : {}) });
    if (!query) return "Erro: consulta inválida. Use só bases, campos, operadores e medidas da lista.";
    const r = await rodar(query);
    return typeof r === "string" ? r : textoDoResultado(r);
  }

  const resultado = await callLlmWithTools({
    provider: provedor.provider,
    apiKey: provedor.apiKey,
    model: provedor.model,
    systemPrompt: montarPromptDoChat(catalogo, { hoje: diaLocal(new Date()), pagina }),
    history: conversa.historico,
    userMessage: conversa.pergunta,
    tools: [FERRAMENTA_CONSULTAR, FERRAMENTA_RELATORIO],
    executeTool: executarFerramenta,
    maxIterations: RODADAS_DE_FERRAMENTA,
    effort: "low",
    maxTokens: 1200,
    timeoutMs: 40_000,
  });
  await registrarUso([{
    orgId,
    credentialId: provedor.credentialId ?? null,
    recurso: "chat",
    provider: provedor.provider,
    model: provedor.model,
    inputTokens: resultado.usage?.entrada ?? 0,
    outputTokens: resultado.usage?.saida ?? 0,
    ok: !resultado.error && !!resultado.text,
  }]);

  // A IA mostrou cartões e não escreveu nada: o cartão fala por si.
  const resposta = resultado.text || (cartoes.length ? "Aqui está o que encontrei." : null);
  if (resultado.error || !resposta) {
    // Só o provedor e o começo do erro dele (status HTTP): nada da conversa.
    console.error(`[ia/chat] ${provedor.provider} falhou: ${(resultado.error ?? "resposta vazia").slice(0, 80)}`);
    return NextResponse.json({ error: mensagemDeFalhaDaIa(provedor.provider, provedor.model, resultado.error) }, { status: 502 });
  }
  return NextResponse.json({ resposta, cartoes });
}
