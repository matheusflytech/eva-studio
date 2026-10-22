import "server-only";
import { prisma } from "@/lib/db/prisma";
import { registrarMensagens } from "@/lib/server/inbox";
import { marcarComoLead } from "@/lib/server/leads";

// ---------------------------------------------------------------------------
// Conversa de um site externo com IA própria (ex.: o chat do Drawing Club,
// que fala direto com a Groq). O site manda cada troca (mensagem do visitante
// + resposta da IA) pela URL de entrada do agente; aqui ela vira conversa do
// agente no canal "website", igual às do widget do site da Eva Holding. Assim
// cada site tem o seu "pipe" na tela de Leads e as conversas não se misturam.
//
// Vira lead quando o visitante deixa e-mail ou telefone, ou quando a IA manda
// o botão de compra ([[ANUAL]] / [[MENSAL]]): é o sinal de interesse que o
// chat de lá já usa.
// ---------------------------------------------------------------------------

export const CANAL_DO_SITE = "website";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// Telefone com DDD (BR) ou internacional: 10 a 13 dígitos, com ou sem pontuação.
const TELEFONE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/;
const MARCADOR_DE_COMPRA = /\[\[(ANUAL|MENSAL)\]\]/;

export interface TrocaExterna {
  /** Id da conversa no site (fica na sessão do visitante). */
  conversationId: string;
  message: string;
  reply: string;
  lang?: string;
  pagina?: string;
  nome?: string;
}

/** O que a troca revela do visitante (e-mail, telefone, interesse de compra). Puro. */
export function sinaisDaTroca(t: Pick<TrocaExterna, "message" | "reply">): { email: string | null; telefone: string | null; interesse: string | null } {
  const email = t.message.match(EMAIL)?.[0]?.toLowerCase() ?? null;
  const bruto = t.message.replace(EMAIL, " ").match(TELEFONE)?.[0] ?? null;
  const digitos = bruto ? bruto.replace(/\D/g, "") : "";
  const telefone = digitos.length >= 10 && digitos.length <= 13 ? digitos : null;
  const interesse = t.reply.match(MARCADOR_DE_COMPRA)?.[1]?.toLowerCase() ?? null;
  return { email, telefone, interesse };
}

export type ResultadoDaTroca = { ok: true; conversaId: string; lead: boolean; contatoId: string | null } | { ok: false; status: number; error: string };

export async function registrarTrocaExterna(orgId: string, agentId: string, t: TrocaExterna): Promise<ResultadoDaTroca> {
  const id = String(t.conversationId ?? "").trim();
  if (!/^[\w.-]{4,100}$/.test(id)) return { ok: false, status: 400, error: "conversation_id inválido (4 a 100 letras, números, _ . -)." };
  const message = String(t.message ?? "").trim().slice(0, 4000);
  const reply = String(t.reply ?? "").trim().slice(0, 8000);
  if (!message && !reply) return { ok: false, status: 400, error: "Mande message e/ou reply." };

  const conversa = await prisma.conversation.upsert({
    where: { agentId_channel_contactId: { agentId, channel: CANAL_DO_SITE, contactId: id } },
    create: {
      agentId,
      channel: CANAL_DO_SITE,
      contactId: id,
      variables: { origem: "site_externo", ...(t.lang ? { lang: String(t.lang).slice(0, 5) } : {}), ...(t.pagina ? { pagina: String(t.pagina).slice(0, 300) } : {}) },
    },
    update: {},
  });

  // Uma gravação por mensagem: numa só as duas saem com o mesmo horário e a
  // conversa pode mostrar a resposta antes da pergunta.
  if (message) await registrarMensagens(conversa.id, [{ role: "contact", text: message }]);
  if (reply) await registrarMensagens(conversa.id, [{ role: "bot", text: reply }]);

  // ---- lead ----
  const s = sinaisDaTroca({ message, reply });
  let contatoId = conversa.contactRecordId;
  const virouLead = !!(s.email || s.telefone || s.interesse);
  if (virouLead) {
    if (!contatoId) {
      const c = await prisma.contact.create({
        data: {
          orgId,
          name: String(t.nome ?? "").trim().slice(0, 120) || "Visitante do site",
          email: s.email ?? "",
          phone: s.telefone ?? "",
          source: "site",
          lastSeenAt: new Date(),
          customFields: { ...(t.lang ? { idioma: String(t.lang).slice(0, 5) } : {}), ...(s.interesse ? { interesse: `plano ${s.interesse}` } : {}) },
          channels: { create: { agentId, channel: CANAL_DO_SITE, externalId: id } },
        },
        select: { id: true },
      });
      contatoId = c.id;
      await prisma.conversation.update({ where: { id: conversa.id }, data: { contactRecordId: contatoId } });
    } else {
      // Já tem ficha: só completa o que estava vazio.
      const atual = await prisma.contact.findUnique({ where: { id: contatoId }, select: { email: true, phone: true } });
      const data: Record<string, string> = {};
      if (s.email && !atual?.email) data.email = s.email;
      if (s.telefone && !atual?.phone) data.phone = s.telefone;
      if (Object.keys(data).length) await prisma.contact.update({ where: { id: contatoId }, data });
    }
    await marcarComoLead(contatoId, { agentId, channel: CANAL_DO_SITE });
  }
  return { ok: true, conversaId: conversa.id, lead: virouLead, contatoId };
}
