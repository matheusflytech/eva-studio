import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { findOpenDealForContact } from "@/lib/server/crm";
import { acharContatoExistente, lerDadosDeContato, upsertContato } from "@/lib/server/api-v1/contatos";
import { ErroApi } from "@/lib/server/api-v1/http";
import { inscrever } from "./inscricao";
import type { Definicao } from "@/lib/automacoes/tipos";

// ---------------------------------------------------------------------------
// Gatilho "Webhook de entrada": outro sistema chama
//   POST /api/hooks/automations/{automacaoId}/{token}
// com o id do registro ou o e-mail/telefone do contato. O token vem do
// gatilho da versão publicada (só quem tem a URL dispara). O corpo inteiro
// fica no gatilho da execução: os passos usam {{gatilho.campo}}.
//   contato: acha por id, e-mail ou telefone; se não existe, cria.
//   negócio: por id, ou o negócio aberto do contato achado por e-mail/telefone.
//   empresa: por id.
// ---------------------------------------------------------------------------

export type RespostaDoWebhook = { status: number; corpo: Record<string, unknown>; executar?: string };

const erro = (status: number, code: string, message: string, details?: unknown): RespostaDoWebhook => ({
  status,
  corpo: { error: { code, message, ...(details ? { details } : {}) } },
});
const NAO_ACHOU = erro(404, "invalid_url", "URL inválida ou trocada.");

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

function mesmoToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function acharRegistro(orgId: string, objeto: string, corpo: Record<string, unknown>): Promise<string | null> {
  const id = texto(corpo.id);
  const email = texto(corpo.email);
  const phone = texto(corpo.phone) ?? texto(corpo.telefone);

  if (objeto === "company") {
    return id ? ((await prisma.company.findFirst({ where: { id, orgId }, select: { id: true } }))?.id ?? null) : null;
  }
  if (objeto === "deal") {
    if (id) return (await prisma.deal.findFirst({ where: { id, orgId }, select: { id: true } }))?.id ?? null;
    if (!email && !phone) return null;
    const contato = await acharContatoExistente(orgId, { source: "webhook", email, phone });
    return contato ? ((await findOpenDealForContact(contato.id))?.id ?? null) : null;
  }
  if (objeto === "contact") {
    if (id) return (await prisma.contact.findFirst({ where: { id, orgId }, select: { id: true } }))?.id ?? null;
    if (!email && !phone) return null;
    const achado = await acharContatoExistente(orgId, { source: "webhook", email, phone });
    if (achado) return achado.id;
    // Lead novo vindo de fora (formulário, landing): cria o contato.
    const nome = texto(corpo.name) ?? texto(corpo.nome);
    const r = await upsertContato(orgId, await lerDadosDeContato(orgId, { ...(nome ? { name: nome } : {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}) }));
    return r.id;
  }
  return null;
}

export async function receberWebhook(automacaoId: string, token: string, corpo: Record<string, unknown>, idempotencia?: string | null): Promise<RespostaDoWebhook> {
  const a = await prisma.automacao.findUnique({
    where: { id: automacaoId },
    select: { id: true, orgId: true, objeto: true, status: true, versaoPublicadaId: true, reinscricao: true, reinscricaoHoras: true, versaoPublicada: { select: { definicao: true } } },
  });
  const gatilho = (a?.versaoPublicada?.definicao as unknown as Definicao | undefined)?.gatilho;
  const salvo = typeof gatilho?.config?.token === "string" ? (gatilho.config.token as string) : "";
  // Automação inexistente, sem webhook ou token errado: a mesma resposta (não revela qual).
  if (!a || !gatilho?.tipo.endsWith(".webhook") || !salvo || !mesmoToken(salvo, token)) return NAO_ACHOU;
  if (a.status !== "ativa") return erro(409, "automation_off", "A automação está desligada.");

  let objetoId: string | null;
  try {
    objetoId = await acharRegistro(a.orgId, a.objeto, corpo);
  } catch (e) {
    if (e instanceof ErroApi) return erro(e.status, e.code, e.message, e.extra.details);
    throw e;
  }
  if (!objetoId) {
    const como = a.objeto === "company" ? "o id da empresa" : a.objeto === "deal" ? "o id do negócio ou o e-mail/telefone de um contato com negócio aberto" : "o id, o e-mail ou o telefone do contato";
    return erro(404, "record_not_found", `Registro não encontrado. Mande ${como}.`);
  }

  const r = await inscrever(a, objetoId, {
    origem: `webhook:${idempotencia?.slice(0, 200) || randomUUID()}`,
    gatilho: { ...corpo, tipo: "webhook" },
  });
  return r.inscrita
    ? { status: 202, corpo: { data: { enrolled: true, execution_id: r.execucaoId, record_id: objetoId } }, executar: r.execucaoId }
    : { status: 200, corpo: { data: { enrolled: false, reason: r.motivo, record_id: objetoId } } };
}
