import "server-only";
import { prisma } from "@/lib/db/prisma";
import { validarEmail } from "@/lib/capture-validation";
import type { ModoDoCorpo } from "@/lib/email/editor";
import { montarEmail } from "@/lib/email/montar";
import { enviarEmail } from "./resend";
import { criarTokenDeDescadastro, linkDaPaginaDeDescadastro, linkDoDescadastroDireto } from "./descadastro";

// ---------------------------------------------------------------------------
// Envio de um e-mail do contrato para uma pessoa. Ponto único: bloco do fluxo,
// passo de régua, disparo e "enviar teste" passam por aqui.
//
// Ordem das travas (cada uma devolve o motivo, nada sai pela metade):
//   1. o contrato tem domínio verificado (remetente de verdade);
//   2. o endereço é válido e não está na supressão de e-mail do contrato;
//   3. o conteúdo resolve sem variável faltando (vazia sem padrão);
//   4. o envio é registrado ANTES de chamar a Resend (o webhook acha a linha
//      pelo id dela), com rodapé e List-Unsubscribe em um clique.
// ---------------------------------------------------------------------------

export type ConteudoDoEmail = { modeloId: string } | { assunto: string; corpo: string; modo: ModoDoCorpo };

export interface PedidoDeEnvio {
  contactId?: string | null;
  /** Endereço direto (teste, bloco com e-mail digitado). Sem ele, usa o do contato. */
  email?: string | null;
  conteudo: ConteudoDoEmail;
  origem: "fluxo" | "regua" | "disparo" | "teste" | "automacao";
  refId?: string | null;
  /** Variáveis de quem chama (ex.: "negocio.nome"). */
  extras?: Record<string, string | null | undefined>;
}

export type ResultadoDoEnvio =
  | { ok: true; envioId: string }
  | { ok: false; motivo: "sem_tabela" | "sem_dominio" | "sem_email" | "suprimido" | "sem_modelo" | "faltou_variavel" | "erro"; erro: string };

export function remetenteDe(d: { remetenteNome: string; remetenteLocal: string; dominio: string }, nomeDoContrato: string): string {
  const nome = (d.remetenteNome || nomeDoContrato).replace(/["<>]/g, "").trim();
  const endereco = `${(d.remetenteLocal || "contato").trim()}@${d.dominio}`;
  return nome ? `${nome} <${endereco}>` : endereco;
}

export async function enviarEmailDoContrato(orgId: string, p: PedidoDeEnvio): Promise<ResultadoDoEnvio> {
  let dominio;
  try {
    dominio = await prisma.emailDominio.findUnique({ where: { orgId } });
  } catch {
    return { ok: false, motivo: "sem_tabela", erro: "O e-mail ainda não foi ativado no banco deste ambiente (SQL 2026-10-22-email.sql)." };
  }
  if (!dominio || dominio.status !== "verified") {
    return { ok: false, motivo: "sem_dominio", erro: "Verifique o domínio de e-mail do contrato em Integrações → E-mail antes de enviar." };
  }

  const contato = p.contactId
    ? await prisma.contact.findFirst({
        where: { id: p.contactId, orgId },
        select: { name: true, email: true, phone: true, jobTitle: true, customFields: true, company: { select: { name: true } } },
      })
    : null;
  const para = (p.email || contato?.email || "").trim().toLowerCase();
  if (!para || !validarEmail(para)) return { ok: false, motivo: "sem_email", erro: "Sem um e-mail válido para enviar." };

  const suprimido = await prisma.emailSupressao.findUnique({ where: { orgId_email: { orgId, email: para } } });
  if (suprimido) return { ok: false, motivo: "suprimido", erro: `Este endereço não recebe mais e-mails do contrato (${suprimido.motivo}).` };

  let conteudo: { assunto: string; corpo: string; modo: ModoDoCorpo };
  if ("modeloId" in p.conteudo) {
    const m = await prisma.emailModelo.findFirst({ where: { id: p.conteudo.modeloId, orgId } });
    if (!m) return { ok: false, motivo: "sem_modelo", erro: "Modelo de e-mail não encontrado." };
    conteudo = { assunto: m.assunto, corpo: m.corpo, modo: m.modo === "html" ? "html" : "simples" };
  } else {
    conteudo = p.conteudo;
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  const remetente = remetenteDe(dominio, org?.name ?? "");
  const token = criarTokenDeDescadastro(orgId, para);
  const email = montarEmail(
    conteudo,
    {
      contato: contato ? { nome: contato.name, email: contato.email, telefone: contato.phone, cargo: contato.jobTitle } : { email: para },
      empresa: contato?.company ? { nome: contato.company.name } : undefined,
      campos: (contato?.customFields as Record<string, unknown> | null) ?? {},
      extras: p.extras,
    },
    { remetente: dominio.remetenteNome || org?.name || dominio.dominio, linkDeDescadastro: linkDaPaginaDeDescadastro(token) }
  );
  if (email.faltando.length) {
    return { ok: false, motivo: "faltou_variavel", erro: `Faltou valor para: ${email.faltando.join(", ")}. Preencha no contato ou use um padrão.` };
  }
  if (!email.assunto.trim()) return { ok: false, motivo: "erro", erro: "O e-mail está sem assunto." };

  const envio = await prisma.emailEnvio.create({
    data: { orgId, contactId: p.contactId ?? null, para, assunto: email.assunto, origem: p.origem, refId: p.refId ?? null, status: "enviando" },
  });
  const r = await enviarEmail({
    from: remetente,
    to: para,
    subject: email.assunto,
    html: email.html,
    text: email.texto,
    replyTo: dominio.responderPara || null,
    headers: {
      "List-Unsubscribe": `<${linkDoDescadastroDireto(token)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: { envio: envio.id, origem: p.origem },
  });
  if (!r.ok) {
    await prisma.emailEnvio.update({ where: { id: envio.id }, data: { status: "falhou", erro: r.erro } });
    return { ok: false, motivo: "erro", erro: r.erro };
  }
  await prisma.emailEnvio.update({ where: { id: envio.id }, data: { status: "enviado", resendId: r.id } });
  return { ok: true, envioId: envio.id };
}

/** Põe o endereço na supressão de e-mail do contrato (descadastro, bounce, reclamação). */
export async function suprimirEmail(orgId: string, email: string, motivo: "descadastro" | "bounce" | "reclamacao" | "manual", detalhe?: string) {
  const e = email.trim().toLowerCase();
  if (!e) return;
  await prisma.emailSupressao.upsert({
    where: { orgId_email: { orgId, email: e } },
    create: { orgId, email: e, motivo, detalhe: detalhe?.slice(0, 300) ?? null },
    update: {},
  });
}
