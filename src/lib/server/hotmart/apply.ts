import "server-only";
import { prisma } from "@/lib/db/prisma";
import { createDeal, moveDealStage, preencherCamposDoContato, preencherCamposDoNegocio } from "@/lib/server/crm";
import { idPorExterno, vincularExterno } from "@/lib/server/api-v1/externos";
import { criarContato } from "@/lib/server/api-v1/contatos";
import { publicarEvento } from "@/lib/server/eventos/barramento";
import { normalizeEvent } from "@/lib/hotmart/normalize";
import { decide } from "@/lib/hotmart/decide";
import type { ProductConfig, StageRole } from "@/lib/hotmart/types";
import { remap, targetKey, type FieldMap } from "@/lib/hotmart/fields";
import type { OrigemDoMovimento } from "@/lib/server/stage-events";
import type { Products } from "./connection";
import { recordHotmartTouch } from "@/lib/server/marketing";

// Aplica um evento da Hotmart no CRM do contrato com as regras do n8n:
// contato, negócio do produto, etapa sem voltar, campos (no destino que o
// contrato escolheu), venda e evento de automação. Erro de regra vira
// resultado "error" (sem exceção).

export interface ApplyResult {
  result: "ok" | "ignored" | "error";
  detail?: string;
  contactId?: string | null;
  dealId?: string | null;
}

// Etapas onde um card sem chave pode ser achado pelo nome (igual ao n8n).
const INITIAL_ROLES: StageRole[] = ["waitlist", "cart", "awaiting", "late"];
const SALE_EVENTS: Record<string, string> = {
  PURCHASE_APPROVED: "sale.approved", PURCHASE_REFUNDED: "sale.refunded",
  PURCHASE_CHARGEBACK: "sale.chargeback", PURCHASE_CANCELED: "sale.canceled",
};
const CONTACT_SELECT = { id: true, name: true, phone: true, customFields: true } as const;
const DEAL_SELECT = { id: true, name: true, stageId: true, customFields: true } as const;

/* eslint-disable @typescript-eslint/no-explicit-any -- payload externo */
/** `origin`: quem mexeu, no histórico de etapas. Na importação ("importacao") não sai `sale.*`. */
export async function applyEvent(orgId: string, products: Products, payload: any, map: FieldMap = {}, opts: { origin?: OrigemDoMovimento } = {}): Promise<ApplyResult> {
  const origin = opts.origin ?? "automacao";
  const productId = payload?.data?.product?.id ? String(payload.data.product.id) : "";
  const product: ProductConfig | undefined = products[productId];
  if (!product) return { result: "ignored", detail: `Produto ${productId || "?"} sem funil ligado.` };
  const n = normalizeEvent(payload, product);
  if (!n.event) return { result: "ignored", detail: "Evento vazio." };
  if (!n.email && !n.cpf) return { result: "ignored", detail: "Sem e-mail nem CPF do comprador." };

  try {
    // Contato: e-mail; senão CPF (mesma pessoa com outro e-mail).
    const byEmail = n.email
      ? await prisma.contact.findFirst({ where: { orgId, email: { equals: n.email, mode: "insensitive" } }, select: CONTACT_SELECT })
      : null;
    const cpfKey = targetKey(map, "cpf_cnpj");
    const byCpf = !byEmail && n.cpf && cpfKey
      ? await prisma.contact.findFirst({ where: { orgId, customFields: { path: [cpfKey], equals: n.cpf } }, select: CONTACT_SELECT })
      : null;
    const contact = byEmail ?? byCpf;
    const cf = (contact?.customFields ?? {}) as Record<string, unknown>;

    // Negócio: chave (assinante ou transação); senão nome, só nas etapas iniciais (exceto primeiro acesso).
    const roleOf = (stageId: string) => (Object.entries(product.stages).find(([, id]) => id === stageId)?.[0] as StageRole | undefined) ?? null;
    const keyedId = n.key.value ? await idPorExterno(orgId, "deal", n.key.value, n.key.source) : null;
    let deal = keyedId ? await prisma.deal.findFirst({ where: { id: keyedId, orgId, pipelineId: product.pipelineId }, select: DEAL_SELECT }) : null;
    if (!deal) {
      const initial = INITIAL_ROLES.map((r) => product.stages[r]).filter((x): x is string => !!x);
      deal = await prisma.deal.findFirst({
        where: {
          orgId, pipelineId: product.pipelineId, name: { in: [n.baseName, n.cardName] },
          ...(n.event === "CLUB_FIRST_ACCESS" ? {} : { stageId: { in: initial } }),
        },
        orderBy: { createdAt: "desc" },
        select: DEAL_SELECT,
      });
    }
    let dealId = deal?.id ?? null;
    const dcf = (deal?.customFields ?? {}) as Record<string, unknown>;
    // Lê de volta pelo campo escolhido (chave padrão quando não há mapa).
    const read = (values: Record<string, unknown>, id: string) => { const k = targetKey(map, id); return k ? values[k] : undefined; };
    const boughtNow = read(cf, "produtos_comprados");

    const d = decide(
      {
        model: product.model,
        hasLateStage: !!product.stages.late,
        card: deal ? { role: roleOf(deal.stageId), name: deal.name, lastEvent: (read(dcf, "ultimo_evento_hotmart") as string) ?? null, transaction: (read(dcf, "transacao_hotmart") as string) ?? null } : null,
        contact: contact ? { products: Array.isArray(boughtNow) ? boughtNow.map(String) : [], ltvCents: Number(read(cf, "ltv_hotmart") ?? 0) || 0 } : null,
      },
      { event: n.event, transaction: n.transaction, cardName: n.cardName, plan: n.plan, amountBrlCents: n.amountBrlCents, productSlug: product.slug, directChannel: n.deal.customFields.canal_de_origem === "direto" }
    );

    // Contato: cria só com o básico e preenche os campos pelo helper tolerante
    // (valor fora do tipo é descartado, não derruba a venda).
    const contactFields = remap(map, { ...n.contact.customFields, ...d.contact });
    let contactId = contact?.id ?? null;
    if (!contactId) {
      contactId = (await criarContato(orgId, { name: n.contact.name, email: n.email || undefined, phone: n.contact.phone || undefined, source: "hotmart" })).id;
    } else if (!contact!.phone && n.contact.phone) {
      await prisma.contact.update({ where: { id: contactId }, data: { phone: n.contact.phone } });
    }
    await preencherCamposDoContato(orgId, contactId, contactFields);
    // Origem (src/sck) antes do negócio: é ela que o createDeal congela.
    const eventMs = Number(payload?.creation_date ?? payload?.creationDate);
    await recordHotmartTouch(orgId, contactId, n.sale.src, n.sale.sck, n.sale.orderedAt ? new Date(n.sale.orderedAt) : eventMs ? new Date(eventMs) : new Date());

    // Negócio.
    const standardDealFields: Record<string, unknown> = d.firstAccessOnly
      ? { data_do_primeiro_acesso: n.deal.customFields.data_do_primeiro_acesso }
      : { ...n.deal.customFields, ...d.dealFields, ...(d.lossReason ? { motivo_da_perda: d.lossReason } : {}) };
    if (d.dropChannel) delete standardDealFields.canal_de_origem;
    const dealFields = remap(map, standardDealFields);
    // Data de fechamento: a da aprovação; senão a do evento (na importação, antiga; no webhook, agora).
    const closedAt = n.deal.closeDate ? new Date(`${n.deal.closeDate}T12:00:00-03:00`) : eventMs ? new Date(eventMs) : null;

    if (d.action === "create" && d.target) {
      const stageId = product.stages[d.target];
      if (!stageId) return { result: "error", detail: `Funil sem etapa para "${d.target}".`, contactId };
      const created = await createDeal({
        orgId, name: n.cardName, pipelineId: product.pipelineId, stageId, contactId,
        amountCents: n.deal.amountCents ?? 0, currency: n.deal.currency ?? "BRL", customFields: dealFields, origem: origin,
      });
      dealId = created.id;
      if (n.key.value) await vincularExterno(orgId, "deal", dealId, n.key.value, n.key.source);
      if (created.closedAt && closedAt) await prisma.deal.update({ where: { id: dealId }, data: { closedAt } });
    } else if (d.action === "update" && dealId) {
      const stageId = d.move && d.target ? product.stages[d.target] : undefined;
      if (stageId) {
        await moveDealStage(dealId, stageId, { origem: origin, reabrir: true, ignorarObrigatorios: true, ...(d.lossReason ? { perda: { motivo: d.lossReason } } : {}) });
        if (closedAt) await prisma.deal.updateMany({ where: { id: dealId, closedAt: { not: null } }, data: { closedAt } });
      }
      await preencherCamposDoNegocio(orgId, dealId, dealFields);
      const data: { name?: string; amountCents?: number; currency?: string } = {};
      if (d.rename) data.name = d.rename;
      if (!d.firstAccessOnly && !d.late && n.deal.amountCents !== null) data.amountCents = n.deal.amountCents;
      if (!d.firstAccessOnly && !d.late && n.deal.currency) data.currency = n.deal.currency;
      if (Object.keys(data).length) await prisma.deal.update({ where: { id: dealId }, data });
      // Card achado pelo nome ganha a chave; chave de outro card não troca de dono.
      if (n.key.value && !keyedId) await vincularExterno(orgId, "deal", dealId, n.key.value, n.key.source).catch(() => {});
    }

    // Venda: uma linha por transação; o status mais recente vence e o que o
    // evento não traz (data de aprovação num reembolso, por exemplo) fica.
    const status = n.sale.status;
    if (n.transaction && status) {
      const s = n.sale;
      const sale = {
        status, productId: s.productId, productName: s.productName, offerCode: s.offerCode, plan: s.plan,
        subscriberCode: s.subscriberCode, recurrence: s.recurrence, paymentType: s.paymentType, installments: s.installments,
        buyerEmail: n.email || null, buyerName: n.contact.name || null, src: s.src, sck: s.sck, channel: s.channel,
        orderedAt: s.orderedAt ? new Date(s.orderedAt) : null, approvedAt: s.approvedAt ? new Date(s.approvedAt) : null,
        contactId, dealId,
        ...(n.deal.amountCents !== null ? { amountCents: n.deal.amountCents, currency: n.deal.currency ?? "BRL", amountBrlCents: n.amountBrlCents } : {}),
      };
      await prisma.sale.upsert({
        where: { orgId_platform_transaction: { orgId, platform: "hotmart", transaction: n.transaction } },
        create: { orgId, platform: "hotmart", transaction: n.transaction, ...sale },
        update: Object.fromEntries(Object.entries(sale).filter(([, v]) => v !== null)),
      });
    }

    const tipo = SALE_EVENTS[n.event];
    if (tipo && dealId && !d.repeated && origin !== "importacao") {
      await publicarEvento({ orgId, tipo, objeto: "deal", objetoId: dealId, dados: { produto: product.slug, transacao: n.transaction, valorCents: n.deal.amountCents }, ator: { tipo: "integracao" } });
    }

    const moved = d.move && d.target ? ` -> ${d.target}` : "";
    return { result: "ok", detail: `${n.event}: ${d.action}${moved}${d.repeated ? " (repetido)" : ""}`, contactId, dealId };
  } catch (e) {
    return { result: "error", detail: e instanceof Error ? e.message.slice(0, 300) : "Erro ao aplicar." };
  }
}
