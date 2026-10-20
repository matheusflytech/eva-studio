import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Note, Prisma, Task } from "@/generated/prisma/client";
import { conferirReferencias, type Corpo } from "@/lib/server/api-validacao";
import { TIPOS_DE_TAREFA, parseRelativeDue } from "@/lib/server/crm";
import { normalizarTipoDeTarefa } from "@/lib/tarefas/tipos";
import { ErroApi, iso } from "./http";
import { boolOpc, dataOpc, enumOpc, idOpc, textoOpc } from "./entrada";
import { lerDataDaConsulta } from "./paginacao";

// Tarefas e notas na v1: mesmas regras das rotas da tela (tipo fechado,
// prazo absoluto ou relativo, vínculos conferidos pela organização).

export function serializarTarefa(t: Task) {
  return {
    id: t.id,
    type: t.type,
    text: t.text,
    due_at: iso(t.dueAt),
    done: !!t.doneAt,
    done_at: iso(t.doneAt),
    contact_id: t.contactId,
    deal_id: t.dealId,
    assigned_to_id: t.assignedToId,
    created_at: iso(t.createdAt),
    updated_at: iso(t.updatedAt),
  };
}

export function serializarNota(n: Note) {
  return {
    id: n.id,
    text: n.text,
    contact_id: n.contactId,
    deal_id: n.dealId,
    author_id: n.authorId,
    attachments: n.attachments,
    created_at: iso(n.createdAt),
  };
}

export const CAMPOS_DE_TAREFA = ["text", "type", "due_at", "due", "done", "contact_id", "deal_id", "assigned_to_id"] as const;

async function conferir(orgId: string, refs: { contactId?: string | null; dealId?: string | null; assignedToId?: string | null }) {
  const erroRef = await conferirReferencias(orgId, refs);
  if (erroRef) {
    const param = erroRef.startsWith("Contato") ? "contact_id" : erroRef.startsWith("Negócio") ? "deal_id" : "assigned_to_id";
    throw new ErroApi(erroRef.endsWith("inválido.") ? 400 : 404, "invalid_reference", erroRef, { param });
  }
}

export interface DadosDeTarefa {
  text?: string;
  type?: string;
  dueAt?: Date | null;
  done?: boolean;
  contactId?: string | null;
  dealId?: string | null;
  assignedToId?: string | null;
}

export async function lerDadosDeTarefa(orgId: string, corpo: Corpo): Promise<DadosDeTarefa> {
  const d: DadosDeTarefa = {};
  d.text = textoOpc(corpo, "text", 5000);
  // ligar | whatsapp | email | reuniao | visita | afazer (o antigo "outro" é gravado como afazer).
  const tipo = enumOpc(corpo, "type", TIPOS_DE_TAREFA);
  d.type = tipo === undefined ? undefined : normalizarTipoDeTarefa(tipo) ?? tipo;
  d.dueAt = dataOpc(corpo, "due_at");
  const relativo = textoOpc(corpo, "due", 40);
  if (d.dueAt === undefined && relativo) {
    // "+2d", "3h", "30 minutos": o mesmo formato do bloco do Builder.
    const due = parseRelativeDue(relativo);
    if (!due) throw new ErroApi(400, "invalid_parameter", 'due precisa ser um prazo relativo como "2d", "3h" ou "30m".', { param: "due" });
    d.dueAt = due;
  }
  d.done = boolOpc(corpo, "done");
  d.contactId = idOpc(corpo, "contact_id");
  d.dealId = idOpc(corpo, "deal_id");
  d.assignedToId = idOpc(corpo, "assigned_to_id");
  await conferir(orgId, d);
  return d;
}

export async function carregarTarefa(orgId: string, id: string) {
  const t = await prisma.task.findFirst({ where: { id, orgId } });
  if (!t) throw new ErroApi(404, "not_found", "Tarefa não encontrada.");
  return t;
}

export async function carregarNota(orgId: string, id: string) {
  const n = await prisma.note.findFirst({ where: { id, orgId } });
  if (!n) throw new ErroApi(404, "not_found", "Nota não encontrada.");
  return n;
}

export const FILTROS_DE_TAREFA = ["updated_since", "contact", "deal", "assigned_to", "status"] as const;

export function whereDeTarefas(orgId: string, sp: URLSearchParams): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [{ orgId }];
  const desde = lerDataDaConsulta(sp, "updated_since");
  if (desde) and.push({ updatedAt: { gte: desde } });
  if (sp.get("contact")) and.push({ contactId: sp.get("contact")! });
  if (sp.get("deal")) and.push({ dealId: sp.get("deal")! });
  if (sp.get("assigned_to")) and.push({ assignedToId: sp.get("assigned_to")! });
  const status = sp.get("status");
  if (status) {
    if (status !== "open" && status !== "done") throw new ErroApi(400, "invalid_parameter", "status precisa ser open ou done.", { param: "status" });
    and.push({ doneAt: status === "open" ? null : { not: null } });
  }
  return { AND: and };
}

export const CAMPOS_DE_NOTA = ["text", "contact_id", "deal_id"] as const;
export const FILTROS_DE_NOTA = ["created_since", "contact", "deal"] as const;

export async function lerDadosDeNota(orgId: string, corpo: Corpo) {
  const text = textoOpc(corpo, "text", 5000);
  const contactId = idOpc(corpo, "contact_id");
  const dealId = idOpc(corpo, "deal_id");
  await conferir(orgId, { contactId, dealId });
  return { text, contactId, dealId };
}

export function whereDeNotas(orgId: string, sp: URLSearchParams): Prisma.NoteWhereInput {
  const and: Prisma.NoteWhereInput[] = [{ orgId }];
  const desde = lerDataDaConsulta(sp, "created_since");
  if (desde) and.push({ createdAt: { gte: desde } });
  if (sp.get("contact")) and.push({ contactId: sp.get("contact")! });
  if (sp.get("deal")) and.push({ dealId: sp.get("deal")! });
  return { AND: and };
}
