import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";
import { validarEmail } from "@/lib/capture-validation";
import { enviarEmailDoContrato } from "./envio";

// ---------------------------------------------------------------------------
// Disparo de e-mail (canal "email" de um Broadcast).
//
// Diferente do WhatsApp, sai em LOTES: a conta Resend da plataforma é uma só
// para todos os contratos (limite de ~2 envios/s) e cada execução tem de caber
// no tempo da função da Vercel. Cada rodada manda até LOTE pessoas que ainda
// não receberam (o registro de envio, origem "disparo" + refId = disparo, é a
// marca de "já foi"); o relógio (scheduler, a cada minuto) chama de novo
// enquanto o disparo estiver "sending".
//
// Quem é pulado (sem e-mail, descadastrado, falta dado) também ganha um
// registro, como "pulado", para não ser tentado de novo a cada rodada.
// ---------------------------------------------------------------------------

export const LOTE = 40;
const PAUSA_MS = 550;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Destinatario {
  contactId: string | null;
  email: string;
}

interface DisparoDeEmail {
  id: string;
  orgId: string;
  audience: string;
  segmentId: string | null;
  tagIds: unknown;
  manualRecipients: unknown;
  templateId: string | null;
  variants: { id: string; templateId: string | null; weight: number }[];
}

/** Público do disparo: contatos com opt-in e e-mail (ou a lista manual de endereços). */
export async function destinatariosDoDisparo(b: Omit<DisparoDeEmail, "id" | "templateId" | "variants">): Promise<Destinatario[]> {
  if (b.audience === "manual") {
    const lista = Array.isArray(b.manualRecipients) ? (b.manualRecipients as string[]) : [];
    const emails = [...new Set(lista.map((e) => validarEmail(String(e))).filter((e): e is string => !!e))];
    // Endereço que é de um contato do contrato ganha as variáveis da ficha dele.
    const conhecidos = emails.length
      ? await prisma.contact.findMany({ where: { orgId: b.orgId, email: { in: emails, mode: "insensitive" } }, select: { id: true, email: true } })
      : [];
    const porEmail = new Map(conhecidos.map((c) => [c.email.toLowerCase(), c.id]));
    return emails.map((email) => ({ email, contactId: porEmail.get(email) ?? null }));
  }

  const where =
    b.audience === "segment" && b.segmentId
      ? await (async () => {
          const segmento = await prisma.segment.findFirst({ where: { id: b.segmentId!, orgId: b.orgId } });
          return segmento ? buildSegmentWhere(b.orgId, segmento.match, parseRules(segmento.rules)) : { orgId: b.orgId, id: "__nenhum__" };
        })()
      : { orgId: b.orgId, tags: { some: { tagId: { in: (b.tagIds as string[]) ?? [] } } } };

  const contatos = await prisma.contact.findMany({
    where: { AND: [where, { optIn: true }, { email: { not: "" } }] },
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
    take: 20_000,
  });
  const vistos = new Set<string>();
  const lista: Destinatario[] = [];
  for (const c of contatos) {
    const e = validarEmail(c.email);
    if (!e || vistos.has(e)) continue;
    vistos.add(e);
    lista.push({ contactId: c.id, email: e });
  }
  return lista;
}

function sortear<T extends { weight: number }>(itens: T[]): T | null {
  if (itens.length === 0) return null;
  const total = itens.reduce((s, v) => s + Math.max(0, v.weight), 0);
  let bilhete = Math.random() * (total || 1);
  for (const v of itens) {
    bilhete -= Math.max(0, v.weight);
    if (bilhete <= 0) return v;
  }
  return itens[itens.length - 1];
}

export interface RodadaDeEmail {
  totalCount: number;
  sentCount: number;
  failedCount: number;
  queuedCount: number;
  errors: string[];
  /** Ainda tem gente para a próxima rodada. */
  faltam: number;
  /** Parou por problema do contrato (sem domínio/tabela): não adianta tentar de novo. */
  parouPorContrato: boolean;
}

export async function rodarDisparoDeEmail(b: DisparoDeEmail, opcoes: { lote?: number; pausaMs?: number } = {}): Promise<RodadaDeEmail> {
  const lote = opcoes.lote ?? LOTE;
  const pausa = opcoes.pausaMs ?? PAUSA_MS;
  const todos = await destinatariosDoDisparo(b);
  const feitos = new Set(
    (await prisma.emailEnvio.findMany({ where: { orgId: b.orgId, origem: "disparo", refId: b.id }, select: { para: true } })).map((e) => e.para)
  );
  const pendentes = todos.filter((d) => !feitos.has(d.email));
  const agora = pendentes.slice(0, lote);
  const r: RodadaDeEmail = {
    totalCount: todos.length,
    sentCount: 0,
    failedCount: 0,
    queuedCount: 0,
    errors: [],
    faltam: pendentes.length - agora.length,
    parouPorContrato: false,
  };

  for (let i = 0; i < agora.length; i += 1) {
    const d = agora[i];
    const variante = sortear(b.variants);
    const modeloId = variante?.templateId ?? b.templateId;
    const envio = modeloId
      ? await enviarEmailDoContrato(b.orgId, { contactId: d.contactId, email: d.email, conteudo: { modeloId }, origem: "disparo", refId: b.id })
      : ({ ok: false, motivo: "sem_modelo", erro: "Disparo sem modelo de e-mail." } as const);

    if (envio.ok) {
      r.sentCount += 1;
      if (variante) await prisma.broadcastVariant.update({ where: { id: variante.id }, data: { sentCount: { increment: 1 } } });
    } else {
      // Problema do contrato (sem domínio, sem tabela): nada desta rodada sai;
      // para aqui e o disparo fica com o erro para a pessoa ver.
      if (envio.motivo === "sem_dominio" || envio.motivo === "sem_tabela") {
        r.errors.push(envio.erro);
        r.faltam = pendentes.length - i;
        r.parouPorContrato = true;
        break;
      }
      r.failedCount += 1;
      if (r.errors.length < 5) r.errors.push(`${d.email}: ${envio.erro}`);
      if (variante) await prisma.broadcastVariant.update({ where: { id: variante.id }, data: { failedCount: { increment: 1 } } });
      // Erro da Resend já deixou o registro "falhou"; os outros motivos não
      // criam registro, então marca como pulado para não tentar de novo.
      if (envio.motivo !== "erro") {
        await prisma.emailEnvio.create({
          data: { orgId: b.orgId, contactId: d.contactId, para: d.email, origem: "disparo", refId: b.id, status: "pulado", erro: envio.erro.slice(0, 300) },
        });
      }
    }
    if (i < agora.length - 1 && pausa > 0) await dormir(pausa);
  }
  return r;
}
