import "server-only";
import { prisma } from "@/lib/db/prisma";
import { fotoDoRegistro, type Foto } from "@/lib/server/eventos/alteracoes";
import { janelaDeResposta } from "@/lib/server/inbox";
import { sistemaAgora } from "@/lib/automacoes/calendario";
import type { Contexto } from "@/lib/automacoes/condicoes";
import type { Objeto } from "@/lib/automacoes/tipos";

// ---------------------------------------------------------------------------
// O que as condições e as variáveis enxergam numa execução, relido a cada
// passo (dado velho depois de uma espera é armadilha clássica):
//   registro  o objeto da automação, no formato da API v1, + campos derivados
//   contato   contato principal (negócio, conversa, tarefa) ou o próprio
//   empresa   empresa do registro (ou do contato)
//   gatilho   foto do evento que disparou (não muda)
//   passos    saídas dos passos anteriores, por id do nó
//   sistema   dia útil, horário comercial, hora em São Paulo
// null = o registro não existe mais (apagado): a execução é cancelada.
// ---------------------------------------------------------------------------

export interface ContextoDaExecucao {
  contexto: Contexto;
  /** Ids prontos para as ações (contato do negócio, conversa do contato...). */
  ids: { contato: string | null; empresa: string | null; negocio: string | null; conversa: string | null; responsavel: string | null };
}

async function contatoEmpresa(orgId: string, contatoId: string | null | undefined, empresaId: string | null | undefined) {
  const contato = contatoId ? await fotoDoRegistro(orgId, "contact", contatoId) : null;
  const idEmpresa = empresaId ?? (contato?.company_id as string | null | undefined) ?? null;
  const empresa = idEmpresa ? await fotoDoRegistro(orgId, "company", idEmpresa) : null;
  return { contato, empresa };
}

/** Janela de 24h do WhatsApp oficial: a conversa mais recente do contato. */
async function janelaDoContato(contatoId: string | null): Promise<{ aberta: boolean; conversa: string | null }> {
  if (!contatoId) return { aberta: false, conversa: null };
  const c = await prisma.conversation.findFirst({
    where: { contactRecordId: contatoId, channel: { notIn: ["playground", "builder_preview"] } },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, channel: true, lastContactMessageAt: true },
  });
  if (!c) return { aberta: false, conversa: null };
  return { aberta: janelaDeResposta(c.channel, c.lastContactMessageAt).aberta, conversa: c.id };
}

export async function montarContexto(
  orgId: string,
  objeto: Objeto,
  objetoId: string,
  extras: { gatilho?: Record<string, unknown>; passos?: Record<string, unknown> },
  agora = new Date()
): Promise<ContextoDaExecucao | null> {
  let registro: Foto | null = null;
  let contato: Foto | null = null;
  let empresa: Foto | null = null;
  const ids: ContextoDaExecucao["ids"] = { contato: null, empresa: null, negocio: null, conversa: null, responsavel: null };

  if (objeto === "deal") {
    registro = await fotoDoRegistro(orgId, "deal", objetoId);
    if (!registro) return null;
    const contatos = (registro.contacts as { contact_id: string }[] | undefined) ?? [];
    ({ contato, empresa } = await contatoEmpresa(orgId, contatos[0]?.contact_id, registro.company_id as string | null));
    const [etapa, abertas] = await Promise.all([
      prisma.pipelineStage.findUnique({ where: { id: String(registro.stage_id) }, select: { type: true } }),
      prisma.task.count({ where: { orgId, dealId: objetoId, doneAt: null } }),
    ]);
    registro = { ...registro, status: etapa?.type === "won" ? "won" : etapa?.type === "lost" ? "lost" : "open", tem_tarefa_aberta: abertas > 0 };
    ids.negocio = objetoId;
  } else if (objeto === "contact") {
    registro = await fotoDoRegistro(orgId, "contact", objetoId);
    if (!registro) return null;
    ({ empresa } = await contatoEmpresa(orgId, null, registro.company_id as string | null));
    const [aberto, janela] = await Promise.all([
      prisma.deal.findFirst({ where: { orgId, contacts: { some: { contactId: objetoId } }, closedAt: null, archivedAt: null }, select: { id: true }, orderBy: { updatedAt: "desc" } }),
      janelaDoContato(objetoId),
    ]);
    registro = { ...registro, tem_negocio_aberto: !!aberto, janela_aberta: janela.aberta };
    contato = registro;
    ids.negocio = aberto?.id ?? null;
    ids.conversa = janela.conversa;
  } else if (objeto === "company") {
    registro = await fotoDoRegistro(orgId, "company", objetoId);
    if (!registro) return null;
    empresa = registro;
  } else if (objeto === "task") {
    const t = await prisma.task.findFirst({ where: { id: objetoId, orgId } });
    if (!t) return null;
    const { serializarTarefa } = await import("@/lib/server/api-v1/tarefas-notas");
    registro = serializarTarefa(t) as Foto;
    ({ contato, empresa } = await contatoEmpresa(orgId, t.contactId, null));
    ids.negocio = t.dealId;
  } else {
    const c = await prisma.conversation.findFirst({ where: { id: objetoId, agent: { orgId } } });
    if (!c) return null;
    registro = {
      id: c.id,
      channel: c.channel,
      agent_id: c.agentId,
      status: c.status,
      channel_contact_id: c.contactId,
      contact_id: c.contactRecordId,
      last_message_at: c.lastMessageAt?.toISOString() ?? null,
      janela_aberta: janelaDeResposta(c.channel, c.lastContactMessageAt).aberta,
    };
    ({ contato, empresa } = await contatoEmpresa(orgId, c.contactRecordId, null));
    ids.conversa = c.id;
  }

  ids.contato = (contato?.id as string | undefined) ?? null;
  ids.empresa = (empresa?.id as string | undefined) ?? null;
  ids.responsavel = ((registro.owner_id ?? registro.assigned_to_id ?? contato?.owner_id) as string | null | undefined) ?? null;
  return {
    contexto: {
      registro,
      contato: contato ?? {},
      empresa: empresa ?? {},
      gatilho: extras.gatilho ?? {},
      passos: extras.passos ?? {},
      sistema: sistemaAgora(agora),
    },
    ids,
  };
}
