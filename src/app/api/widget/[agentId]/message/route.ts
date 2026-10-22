import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation } from "@/lib/server/flow-engine";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit";
import { transcreverAudio } from "@/lib/server/transcribe";
import { entenderAnexo, MAX_ANEXO_BYTES } from "@/lib/server/anexos";
import { guardarBuffer } from "@/lib/server/media-inbound";
import { classificarMime, mimeBase } from "@/lib/server/storage";

// Limites de tamanho pra não deixar entrada gigante inflar o banco / prompt.
const MAX_TEXT = 4000;
const MAX_CONTACT_ID = 128;
const MAX_OPTION_ID = 128;
// A Vercel recusa corpo acima de 4,5 MB. Em base64 o arquivo cresce um terço,
// então 3 MB de arquivo é o teto que cabe com folga.
const MAX_BASE64 = Math.ceil((MAX_ANEXO_BYTES * 4) / 3) + 64;

// Rota pública (sem sessão) — o widget roda no site de um visitante
// qualquer, então não tem cookie de login nem X-Internal-Secret pra
// mandar. A única "chave" é o próprio agentId (igual todo widget de chat
// embutível — Intercom, Drift, etc. funcionam assim). Por isso exige
// explicitamente que o agente tenha o widget ativado (widgetEnabled), pra
// não virar um jeito de conversar de graça com QUALQUER agente só sabendo
// o id dele.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function resposta(texto: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ messages: [{ text: texto }], status: "active", ...extra }, { headers: CORS_HEADERS });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || !agent.widgetEnabled) {
    return NextResponse.json({ error: "Widget não disponível." }, { status: 404, headers: CORS_HEADERS });
  }

  // Rota pública sem sessão — sem rate limit, qualquer um com o agentId (que
  // fica embutido no script.js público) poderia floodar e amplificar chamadas
  // ao webhook/IA da org. Limita por IP e por agente.
  const ip = getClientIp(request);
  const [byIp, byAgent] = await Promise.all([
    checkRateLimit(`widget:${agentId}:${ip}`, 20, 60), // 20/min por IP+agente
    checkRateLimit(`widget:${agentId}`, 600, 60), // 600/min por agente (teto global)
  ]);
  if (!byIp.allowed || !byAgent.allowed) {
    return NextResponse.json({ error: "Muitas mensagens. Aguarde um instante." }, { status: 429, headers: CORS_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const { optionId, lang } = body;
  let { text } = body;
  // O site antigo mandava `conversation_id`; aceita os dois nomes.
  const contactId = body.contactId ?? body.conversation_id;
  const safeLang = typeof lang === "string" ? lang.slice(0, 8) : undefined;

  if (!contactId || typeof contactId !== "string" || contactId.length > MAX_CONTACT_ID) {
    return NextResponse.json({ error: "contactId inválido." }, { status: 400, headers: CORS_HEADERS });
  }
  if (text !== undefined && (typeof text !== "string" || text.length > MAX_TEXT)) {
    return NextResponse.json({ error: "Mensagem muito longa." }, { status: 400, headers: CORS_HEADERS });
  }
  if (optionId !== undefined && (typeof optionId !== "string" || optionId.length > MAX_OPTION_ID)) {
    return NextResponse.json({ error: "optionId inválido." }, { status: 400, headers: CORS_HEADERS });
  }

  let transcricao: string | undefined;
  let media: { path: string; type: string; mime: string; name?: string; size?: number } | undefined;
  let anexoContexto: string | undefined;

  // Áudio: guarda o arquivo, transcreve e segue como se o visitante tivesse digitado.
  if (typeof body.audio_base64 === "string") {
    if (body.audio_base64.length > MAX_BASE64) {
      return resposta("Esse áudio ficou grande demais. Pode mandar um mais curto ou escrever?");
    }
    const mime = typeof body.audio_mime === "string" ? mimeBase(body.audio_mime).slice(0, 40) : "audio/webm";
    const bytes = Buffer.from(body.audio_base64, "base64");
    const r = await transcreverAudio(agent.orgId, body.audio_base64, mime, safeLang);
    if ("erro" in r) {
      const msg =
        r.erro === "sem_chave"
          ? "O atendimento por voz ainda não está configurado. Pode escrever sua mensagem?"
          : r.erro === "vazio"
            ? "Não consegui ouvir nada nesse áudio. Tente de novo ou escreva."
            : "Não consegui entender o áudio agora. Pode escrever sua mensagem?";
      return resposta(msg);
    }
    text = r.texto.slice(0, MAX_TEXT);
    transcricao = text;
    // O áudio fica guardado para a equipe ouvir na caixa de entrada.
    media = (await guardarBuffer(agent.orgId, bytes, mime, { name: "audio" })) ?? undefined;
  }

  // Anexo (imagem, PDF, Word, texto): guarda, entende e passa o contexto à IA.
  const a = body.attachment;
  if (a && typeof a === "object") {
    const base64 = typeof a.base64 === "string" ? a.base64 : "";
    const mime = typeof a.mime === "string" ? mimeBase(a.mime).slice(0, 120) : "";
    const nome = typeof a.name === "string" ? a.name.replace(/[\r\n]+/g, " ").slice(0, 120) : "";

    if (!base64 || base64.length > MAX_BASE64) {
      return resposta("Esse arquivo é grande demais. O limite é de 3 MB. Pode mandar um menor?");
    }
    const classe = classificarMime(mime);
    if (!classe || classe.tipo === "audio" || classe.tipo === "video") {
      return resposta("Eu consigo receber imagens, PDF, Word e texto. Esse tipo de arquivo não dá. Pode mandar em outro formato?");
    }
    // Anexo é mais caro que texto (visão e extração): limite próprio por IP.
    const anexos = await checkRateLimit(`widget-anexo:${agentId}:${ip}`, 6, 60);
    if (!anexos.allowed) return resposta("Muitos arquivos de uma vez. Espere um instante e mande de novo.");

    const bytes = Buffer.from(base64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_ANEXO_BYTES) {
      return resposta("Esse arquivo é grande demais. O limite é de 3 MB. Pode mandar um menor?");
    }
    media = (await guardarBuffer(agent.orgId, bytes, mime, { name: nome || undefined })) ?? undefined;
    anexoContexto = await entenderAnexo(agent.orgId, bytes, mime, nome);
    // Sem legenda, a mensagem mostra o nome do arquivo na caixa de entrada.
    if (!text || !String(text).trim()) text = `📎 ${nome || "arquivo"}`;
  }

  const result = await advanceConversation({
    agentId,
    channel: "website",
    contactId,
    text,
    optionId,
    lang: safeLang,
    media,
    anexoContexto,
  });
  return NextResponse.json(transcricao ? { ...result, transcricao } : result, { headers: CORS_HEADERS });
}
