import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { callLlmWithTools, type LlmToolCall } from "@/lib/server/llm";
import { escolherProvedorDeIa } from "@/lib/server/ia/provedor";
import { registrarUso } from "@/lib/server/ia/uso";
import { carregarCatalogo } from "@/lib/server/ia/catalogo";
import { FERRAMENTA_CONSULTAR, montarPromptDoChat, textoDoResultado, validarMensagens } from "@/lib/server/ia/chat-ia";
import { rodarReportQuery } from "@/lib/server/report-sql";
import { sanearReportQuery } from "@/lib/report-query";
import { sanearFiltrosGlobais, diaLocal } from "@/lib/consulta";
import { mensagemDeFalhaDaIa } from "@/lib/ia/falha-do-provedor";

// ---------------------------------------------------------------------------
// Chat da Eva (botão flutuante).
//
// Corpo: { mensagens: [{ role: "user" | "assistant", content }], pagina?: string }
// Resposta: { resposta: string }
//
// A IA só lê: a única ferramenta é consultar_dados, que roda o mesmo motor dos
// cartões de relatório, sempre no contrato da sessão. Erros: 400 conversa
// inválida · 429 limite · 503 sem chave de IA · 502 provedor falhou.
//
// A conversa e as respostas não vão para o log: têm nome de cliente e valores.
// ---------------------------------------------------------------------------

/** Pedidos por contrato a cada 10 minutos. */
const LIMITE_POR_ORG = 40;
const JANELA_S = 600;
const RODADAS_DE_FERRAMENTA = 6;

export async function POST(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const conversa = validarMensagens(body?.mensagens);
  if (!conversa) return NextResponse.json({ error: "Me diz o que você quer saber." }, { status: 400 });
  const pagina = typeof body?.pagina === "string" ? body.pagina.slice(0, 60) : undefined;

  const provedor = await escolherProvedorDeIa(orgId);
  if (!provedor) {
    return NextResponse.json(
      { error: "A IA ainda não está ligada neste contrato. Cadastre uma chave de IA em Integrações e volte aqui.", codigo: "sem_chave" },
      { status: 503 }
    );
  }

  const limite = await checkRateLimit(`ia-chat:${orgId}`, LIMITE_POR_ORG, JANELA_S);
  if (!limite.allowed) return NextResponse.json({ error: "Muitas perguntas seguidas. Espera uns minutinhos e tenta de novo." }, { status: 429 });

  const catalogo = await carregarCatalogo(orgId);
  const globais = sanearFiltrosGlobais({});

  async function executarFerramenta(call: LlmToolCall): Promise<string> {
    let bruta: unknown;
    try {
      bruta = JSON.parse(call.arguments.consulta ?? "");
    } catch {
      return "Erro: a consulta não é um JSON válido. Mande só o JSON.";
    }
    const query = sanearReportQuery({ v: 2, ...(bruta && typeof bruta === "object" ? bruta : {}) });
    if (!query) return "Erro: consulta inválida. Use só bases, campos, operadores e medidas da lista.";
    try {
      const resultado = await rodarReportQuery(orgId, query, globais);
      return resultado ? textoDoResultado(resultado) : "Erro: escolha ao menos uma medida, um agrupamento ou colunas.";
    } catch (e) {
      return String((e as Error)?.message ?? "").includes("statement timeout")
        ? "Erro: a consulta demorou demais. Filtre um período menor."
        : "Erro: não deu para calcular essa consulta.";
    }
  }

  const resultado = await callLlmWithTools({
    provider: provedor.provider,
    apiKey: provedor.apiKey,
    model: provedor.model,
    systemPrompt: montarPromptDoChat(catalogo, { hoje: diaLocal(new Date()), pagina }),
    history: conversa.historico,
    userMessage: conversa.pergunta,
    tools: [FERRAMENTA_CONSULTAR],
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

  if (resultado.error || !resultado.text) {
    // Só o provedor e o começo do erro dele (status HTTP): nada da conversa.
    console.error(`[ia/chat] ${provedor.provider} falhou: ${(resultado.error ?? "resposta vazia").slice(0, 80)}`);
    return NextResponse.json({ error: mensagemDeFalhaDaIa(provedor.provider, provedor.model, resultado.error) }, { status: 502 });
  }
  return NextResponse.json({ resposta: resultado.text });
}
