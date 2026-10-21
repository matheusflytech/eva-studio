import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { apagarDominio, buscarDominio, criarDominio, pedirVerificacao, resendConfigurado, type RegistroDns } from "./resend";

// ---------------------------------------------------------------------------
// Domínio de e-mail do contrato (um por contrato), dentro da conta Resend da
// plataforma. O cliente cria no DNS dele os registros que a Resend pede
// (SPF/DKIM/MX) e pede a verificação aqui.
// ---------------------------------------------------------------------------

export interface DominioNaTela {
  dominio: string;
  status: string;
  registros: RegistroDns[];
  remetenteNome: string;
  remetenteLocal: string;
  responderPara: string;
  verificadoEm: string | null;
}

export interface EstadoDoEmail {
  /** A chave da Resend da plataforma existe neste ambiente. */
  configurado: boolean;
  /** As tabelas de e-mail existem (SQL 2026-10-22-email.sql). */
  disponivel: boolean;
  dominio: DominioNaTela | null;
}

type Linha = {
  dominio: string;
  status: string;
  registros: unknown;
  remetenteNome: string;
  remetenteLocal: string;
  responderPara: string;
  verificadoEm: Date | null;
};

const paraTela = (d: Linha): DominioNaTela => ({
  dominio: d.dominio,
  status: d.status,
  registros: Array.isArray(d.registros) ? (d.registros as RegistroDns[]) : [],
  remetenteNome: d.remetenteNome,
  remetenteLocal: d.remetenteLocal,
  responderPara: d.responderPara,
  verificadoEm: d.verificadoEm?.toISOString() ?? null,
});

export async function estadoDoEmail(orgId: string): Promise<EstadoDoEmail> {
  try {
    const d = await prisma.emailDominio.findUnique({ where: { orgId } });
    return { configurado: resendConfigurado(), disponivel: true, dominio: d ? paraTela(d) : null };
  } catch {
    return { configurado: resendConfigurado(), disponivel: false, dominio: null };
  }
}

/** "Loja.com.br " → "loja.com.br"; sem http, www ou caminho. null = inválido. */
export function normalizarDominio(bruto: string): string | null {
  const d = bruto.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d) ? d : null;
}

type Resultado = { ok: true; dominio: DominioNaTela } | { ok: false; status: number; error: string };

export async function adicionarDominio(orgId: string, bruto: string): Promise<Resultado> {
  const dominio = normalizarDominio(bruto);
  if (!dominio) return { ok: false, status: 400, error: "Digite só o domínio, ex.: suaempresa.com.br" };
  if (await prisma.emailDominio.findUnique({ where: { orgId } })) {
    return { ok: false, status: 409, error: "O contrato já tem um domínio. Remova o atual para trocar." };
  }
  if (await prisma.emailDominio.findUnique({ where: { dominio } })) {
    return { ok: false, status: 409, error: "Este domínio já está em uso em outro contrato." };
  }
  const r = await criarDominio(dominio);
  if (!r.ok) return { ok: false, status: r.status >= 500 ? 502 : 400, error: r.erro };
  const linha = await prisma.emailDominio.create({
    data: {
      orgId,
      dominio,
      resendId: r.dominio.id,
      status: r.dominio.status,
      registros: r.dominio.records as unknown as Prisma.InputJsonValue,
    },
  });
  return { ok: true, dominio: paraTela(linha) };
}

/** Pede a verificação e já lê o estado (a Resend confere o DNS em segundos ou minutos). */
export async function verificarDominio(orgId: string): Promise<Resultado> {
  const linha = await prisma.emailDominio.findUnique({ where: { orgId } });
  if (!linha) return { ok: false, status: 404, error: "O contrato ainda não tem domínio." };
  const pedido = await pedirVerificacao(linha.resendId);
  if (!pedido.ok) return { ok: false, status: 502, error: pedido.erro };
  const r = await buscarDominio(linha.resendId);
  if (!r.ok) return { ok: false, status: 502, error: r.erro };
  const atualizado = await prisma.emailDominio.update({
    where: { orgId },
    data: {
      status: r.dominio.status,
      registros: r.dominio.records as unknown as Prisma.InputJsonValue,
      ...(r.dominio.status === "verified" && !linha.verificadoEm ? { verificadoEm: new Date() } : {}),
    },
  });
  return { ok: true, dominio: paraTela(atualizado) };
}

export async function salvarRemetente(
  orgId: string,
  b: { remetenteNome?: unknown; remetenteLocal?: unknown; responderPara?: unknown }
): Promise<Resultado> {
  const linha = await prisma.emailDominio.findUnique({ where: { orgId } });
  if (!linha) return { ok: false, status: 404, error: "O contrato ainda não tem domínio." };
  const local = typeof b.remetenteLocal === "string" ? b.remetenteLocal.trim().toLowerCase() : linha.remetenteLocal;
  if (!/^[a-z0-9._+-]{1,64}$/.test(local)) return { ok: false, status: 400, error: "O endereço só pode ter letras, números, ponto, hífen e sublinhado." };
  const responder = typeof b.responderPara === "string" ? b.responderPara.trim().toLowerCase() : linha.responderPara;
  if (responder && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(responder)) return { ok: false, status: 400, error: "O \"responder para\" precisa ser um e-mail válido." };
  const nome = typeof b.remetenteNome === "string" ? b.remetenteNome.replace(/["<>]/g, "").trim().slice(0, 80) : linha.remetenteNome;
  const atualizado = await prisma.emailDominio.update({ where: { orgId }, data: { remetenteNome: nome, remetenteLocal: local, responderPara: responder } });
  return { ok: true, dominio: paraTela(atualizado) };
}

export async function removerDominio(orgId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const linha = await prisma.emailDominio.findUnique({ where: { orgId } });
  if (!linha) return { ok: true };
  const r = await apagarDominio(linha.resendId);
  if (!r.ok) return { ok: false, status: 502, error: r.erro };
  await prisma.emailDominio.delete({ where: { orgId } });
  return { ok: true };
}
