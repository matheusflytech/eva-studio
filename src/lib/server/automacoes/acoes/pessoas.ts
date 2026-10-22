import "server-only";
import { prisma } from "@/lib/db/prisma";
import { fotoDoRegistro, publicarAlteracao } from "@/lib/server/eventos/alteracoes";
import { publicarEvento } from "@/lib/server/eventos/barramento";
import { fimDaDuracao } from "@/lib/automacoes/calendario";
import { numero } from "@/lib/automacoes/condicoes";
import type { Unidade } from "@/lib/automacoes/tipos";
import { contatoDaAcao, lerJson, linkDoRegistro, membrosAtivos, negocioDaAcao, seguro } from "./comum";
import type { CtxDaAcao, ManipuladorDeAcao } from "./tipos";

// Ações de pessoas: responsável (fixo, rodízio igual ou por percentual, quem
// tem menos negócios abertos), tarefas e avisos para a equipe.

/**
 * Próximo do rodízio: quem está mais abaixo da sua cota. Com pesos 60/40, a
 * cada 5 entradas 3 vão para o primeiro e 2 para o segundo. Empate: a ordem
 * da lista. Função pura (o servidor guarda as contagens).
 */
export function escolherNoRodizio(usuarios: string[], contagem: Record<string, number>, pesos: Record<string, number> = {}): string {
  let melhor = usuarios[0];
  let melhorRazao = Number.POSITIVE_INFINITY;
  for (const u of usuarios) {
    const peso = pesos[u] && pesos[u] > 0 ? pesos[u] : 1;
    const razao = ((contagem[u] ?? 0) + 1) / peso;
    if (razao < melhorRazao) {
      melhor = u;
      melhorRazao = razao;
    }
  }
  return melhor;
}

/** Escolhe e soma 1 numa transação com a linha travada (duas execuções juntas não pegam o mesmo). */
async function proximoDoRodizio(ctx: CtxDaAcao, usuarios: string[], pesos: Record<string, number>): Promise<string> {
  const chave = `${ctx.automacaoId}:${ctx.noId}`;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "eva_studio_rodizios" ("chave", "orgId", "contagem", "updatedAt") VALUES (${chave}, ${ctx.orgId}, '{}'::jsonb, NOW()) ON CONFLICT ("chave") DO NOTHING`;
      const [linha] = await tx.$queryRaw<{ contagem: Record<string, number> }[]>`SELECT "contagem" FROM "eva_studio_rodizios" WHERE "chave" = ${chave} FOR UPDATE`;
      const contagem = linha?.contagem ?? {};
      const escolhido = escolherNoRodizio(usuarios, contagem, pesos);
      const nova = { ...contagem, [escolhido]: (contagem[escolhido] ?? 0) + 1 };
      await tx.$executeRaw`UPDATE "eva_studio_rodizios" SET "contagem" = ${JSON.stringify(nova)}::jsonb, "updatedAt" = NOW() WHERE "chave" = ${chave}`;
      return escolhido;
    });
  } catch {
    // Sem a tabela do rodízio: o primeiro da lista (melhor que não atribuir).
    return usuarios[0];
  }
}

async function menosCarga(orgId: string, usuarios: string[]): Promise<string> {
  const grupos = await prisma.deal.groupBy({ by: ["ownerId"], where: { orgId, ownerId: { in: usuarios }, closedAt: null, archivedAt: null }, _count: { _all: true } });
  const carga = new Map(grupos.map((g) => [g.ownerId, g._count._all]));
  return usuarios.reduce((a, b) => ((carga.get(b) ?? 0) < (carga.get(a) ?? 0) ? b : a));
}

/** Prazo da tarefa: dias úteis respeitam fim de semana e feriado. */
export function prazoDaTarefa(agora: Date, quantidade: unknown, unidade: unknown): Date {
  const n = numero(quantidade) ?? 1;
  const u = (["minutos", "horas", "dias", "dias_uteis"].includes(String(unidade)) ? unidade : "dias_uteis") as Unidade;
  return fimDaDuracao(agora, Math.max(0, n), u);
}

export const ACOES_DE_PESSOAS: Record<string, ManipuladorDeAcao> = {
  "owner.assign": (config, ctx) =>
    seguro(async () => {
      const r = ctx.contexto.registro as Record<string, unknown>;
      const atual = (ctx.objeto === "conversation" ? r.assigned_to_id : r.owner_id) as string | null | undefined;
      if (config.so_se_vazio === true && atual) return { ok: true, pulado: "já tem responsável" };

      const modo = String(config.modo ?? "rodizio");
      const lista = await membrosAtivos(ctx.orgId, modo === "fixo" ? config.usuario : modo === "menos_carga" ? config.usuarios_carga : config.usuarios);
      if (!lista.length) return { ok: false, erro: "Nenhuma das pessoas escolhidas está ativa no contrato." };
      let escolhido = lista[0];
      if (modo === "rodizio" && lista.length > 1) {
        const pesos = lerJson(config.pesos, {});
        const p = pesos.ok && pesos.valor && typeof pesos.valor === "object" ? (pesos.valor as Record<string, unknown>) : {};
        escolhido = await proximoDoRodizio(ctx, lista, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, numero(v) ?? 1])));
      } else if (modo === "menos_carga" && lista.length > 1) escolhido = await menosCarga(ctx.orgId, lista);
      if (escolhido === atual) return { ok: true, pulado: "a pessoa escolhida já é a responsável", saida: { owner_id: escolhido } };

      if (ctx.objeto === "conversation") {
        await prisma.conversation.update({ where: { id: ctx.objetoId }, data: { assignedToId: escolhido } });
      } else if (ctx.objeto === "deal" || ctx.objeto === "contact" || ctx.objeto === "company") {
        const antes = await fotoDoRegistro(ctx.orgId, ctx.objeto, ctx.objetoId);
        if (ctx.objeto === "deal") await prisma.deal.updateMany({ where: { id: ctx.objetoId, orgId: ctx.orgId }, data: { ownerId: escolhido } });
        else if (ctx.objeto === "contact") await prisma.contact.updateMany({ where: { id: ctx.objetoId, orgId: ctx.orgId }, data: { ownerId: escolhido } });
        else await prisma.company.updateMany({ where: { id: ctx.objetoId, orgId: ctx.orgId }, data: { ownerId: escolhido } });
        await publicarAlteracao(ctx.orgId, ctx.objeto, ctx.objetoId, antes);
      } else return { ok: false, erro: "Este tipo de registro não tem responsável." };
      return { ok: true, saida: { owner_id: escolhido, anterior: atual ?? null, modo } };
    }),

  "task.create": (config, ctx) =>
    seguro(async () => {
      const texto = String(config.texto ?? "").trim();
      if (!texto) return { ok: false, erro: "Tarefa sem texto." };
      let responsavel = ctx.ids.responsavel;
      if (config.para === "usuario") {
        const [u] = await membrosAtivos(ctx.orgId, config.usuario);
        if (!u) return { ok: false, erro: "A pessoa escolhida não está ativa no contrato." };
        responsavel = u;
      }
      const { createTask } = await import("@/lib/server/crm");
      const t = await createTask({
        orgId: ctx.orgId,
        text: texto.slice(0, 500),
        type: String(config.tipo_tarefa ?? "afazer"),
        dealId: negocioDaAcao(ctx),
        contactId: contatoDaAcao(ctx),
        assignedToId: responsavel,
        dueAt: prazoDaTarefa(ctx.agora, config.prazo, config.unidade),
        origem: "automacao",
      });
      return { ok: true, saida: { task_id: t.id, due_at: t.dueAt?.toISOString() ?? null, assigned_to_id: responsavel } };
    }),

  "task.complete_open": (_config, ctx) =>
    seguro(async () => {
      const deal = negocioDaAcao(ctx);
      const contato = contatoDaAcao(ctx);
      const onde = ctx.objeto === "deal" ? { dealId: ctx.objetoId } : contato ? { contactId: contato } : deal ? { dealId: deal } : null;
      if (!onde) return { ok: true, pulado: "sem negócio nem contato" };
      const abertas = await prisma.task.findMany({ where: { orgId: ctx.orgId, doneAt: null, ...onde }, select: { id: true }, take: 200 });
      if (!abertas.length) return { ok: true, pulado: "nenhuma tarefa aberta" };
      await prisma.task.updateMany({ where: { id: { in: abertas.map((t) => t.id) }, doneAt: null }, data: { doneAt: ctx.agora } });
      for (const t of abertas) await publicarEvento({ orgId: ctx.orgId, tipo: "task.completed", objeto: "task", objetoId: t.id, dados: { outcome: "automacao" } });
      return { ok: true, saida: { concluidas: abertas.length } };
    }),

  "team.notify": (config, ctx) =>
    seguro(async () => {
      const mensagem = String(config.mensagem ?? "").trim();
      if (!mensagem) return { ok: false, erro: "Aviso sem mensagem." };
      const para = config.para === "usuarios" ? await membrosAtivos(ctx.orgId, config.usuarios) : ctx.ids.responsavel ? await membrosAtivos(ctx.orgId, ctx.ids.responsavel) : [];
      if (!para.length) return { ok: true, pulado: config.para === "usuarios" ? "nenhuma das pessoas está ativa" : "o registro não tem responsável" };
      const automacao = await prisma.automacao.findUnique({ where: { id: ctx.automacaoId }, select: { nome: true } });
      const titulo = `Automação: ${automacao?.nome ?? "aviso"}`;
      const link = linkDoRegistro(ctx.objeto, ctx.objetoId);

      let noApp = 0;
      try {
        const r = await prisma.aviso.createMany({
          data: para.map((userId) => ({ orgId: ctx.orgId, userId, titulo, texto: mensagem.slice(0, 2000), link, objeto: ctx.objeto, objetoId: ctx.objetoId, origem: "automacao" })),
        });
        noApp = r.count;
      } catch {
        // Sem a tabela de avisos: fica só o e-mail (se pedido).
      }

      const emails: { para: string; ok: boolean; motivo?: string }[] = [];
      if (config.email === true && !ctx.teste) {
        const pessoas = await prisma.profile.findMany({ where: { id: { in: para } }, select: { email: true } });
        const { enviarEmailDoContrato } = await import("@/lib/server/email/envio");
        for (const p of pessoas.filter((x) => x.email)) {
          const r = await enviarEmailDoContrato(ctx.orgId, {
            email: p.email,
            conteudo: { assunto: titulo, corpo: `${mensagem}${link ? `\n\nAbrir no Eva Studio: ${link}` : ""}`, modo: "simples" },
            origem: "automacao",
            refId: ctx.execucaoId,
          });
          emails.push({ para: p.email, ok: r.ok, ...(r.ok ? {} : { motivo: r.erro }) });
        }
      }
      if (!noApp && !emails.some((e) => e.ok)) return { ok: false, erro: "O aviso não chegou a ninguém (avisos no app ainda não ativados e e-mail não saiu)." };
      return { ok: true, saida: { avisados: para, no_app: noApp, emails } };
    }),
};
