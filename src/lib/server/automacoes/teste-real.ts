import "server-only";
import { prisma } from "@/lib/db/prisma";
import { comAtor } from "@/lib/server/eventos/barramento";
import { avaliarRegra } from "@/lib/automacoes/condicoes";
import type { Condicao, Definicao, Objeto } from "@/lib/automacoes/tipos";
import { montarContexto } from "./contexto";

// ---------------------------------------------------------------------------
// Teste de verdade: em vez de simular num registro real, cria um registro de
// teste que cumpre o gatilho e as condições do fluxo e roda todos os passos de
// verdade nele. Regras:
// - O contato de teste é sempre NOVO (nunca upsert): com o número da pessoa,
//   um upsert poderia mexer (e a limpeza apagar) um contato real.
// - Tudo é criado com o ator marcado como teste: o barramento grava o evento
//   mas não entrega a outras automações nem aos webhooks de saída.
// - O WhatsApp só vai para o telefone do contato de teste (o número que a
//   pessoa informou); nada sai para cliente.
// - Os ids criados ficam em `variaveis.__testeReal` da execução; "Apagar dados
//   do teste" remove só eles (e o que os passos criaram ligados a eles).
// ---------------------------------------------------------------------------

export const ETIQUETA_DE_TESTE = "Teste da automação";
const PREFIXO = "[TESTE]";

export type CriadoNoTeste = { objeto: "contact" | "deal" | "company" | "task" | "conversation" | "tag"; id: string };

export interface TesteReal {
  telefone: string;
  email?: string;
  criados: CriadoNoTeste[];
  /** Condições do fluxo que o registro de teste cumpre / não deu para cumprir. */
  cumpridas: string[];
  naoCumpridas: string[];
}

/** Condições que o registro tenta cumprir: o caminho "sim" de cada condição e o 1º caminho de cada "caminhos". */
export function condicoesParaCumprir(def: Definicao): Condicao[] {
  const lista: Condicao[] = [];
  for (const no of Object.values(def.nos)) {
    if (no.tipo === "condicao") lista.push(...(no.regra.grupos[0]?.condicoes ?? []));
    if (no.tipo === "caminhos") lista.push(...(no.caminhos[0]?.regra.grupos[0]?.condicoes ?? []));
  }
  return lista;
}

const numero = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

/** Um valor que faz a condição passar (ou undefined quando não dá para inventar um). */
export function valorQueCumpre(c: Condicao): unknown {
  const v = c.valor;
  switch (c.operador) {
    case "igual":
    case "contem":
    case "comeca_com":
      return v;
    case "em":
      return Array.isArray(v) ? v[0] : v;
    case "preenchido":
      return "teste";
    case "verdadeiro":
      return true;
    case "falso":
      return false;
    case "maior": {
      const n = numero(v);
      return n === null ? undefined : n + 1;
    }
    case "maior_igual":
    case "menor_igual":
      return numero(v) ?? undefined;
    case "menor": {
      const n = numero(v);
      return n === null ? undefined : n - 1;
    }
    case "entre": {
      if (!Array.isArray(v)) return undefined;
      const a = numero(v[0]), b = numero(v[1]);
      return a === null || b === null ? undefined : (a + b) / 2;
    }
    default:
      return undefined; // diferente, não contém, vazio, datas relativas: deixa como está
  }
}

/** Separa o que dá para gravar no registro e no contato a partir das condições. */
function camposDasCondicoes(condicoes: Condicao[]) {
  const registro: Record<string, unknown> = {}, contato: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {}, customContato: Record<string, unknown> = {};
  const tags: unknown[] = [];
  for (const c of condicoes) {
    const valor = valorQueCumpre(c);
    if (valor === undefined) continue;
    const [raiz, campo, sub] = c.campo.split(".");
    if (campo === "tags") tags.push(valor);
    else if (campo === "custom_fields" && sub) (raiz === "contato" ? customContato : custom)[sub] = valor;
    else if (raiz === "registro" && campo) registro[campo] = valor;
    else if (raiz === "contato" && campo) contato[campo] = valor;
  }
  return { registro, contato, custom, customContato, tags };
}

const texto = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/**
 * Cria o registro de teste do objeto da automação (com o contato de teste
 * ligado) já cumprindo as condições. Devolve o id do registro, o gatilho de
 * teste e o que foi criado.
 */
export async function criarRegistroDeTeste(
  orgId: string,
  automacaoId: string,
  def: Definicao,
  { telefone, email }: { telefone: string; email: string }
): Promise<{ objetoId: string; gatilho: Record<string, unknown>; criados: CriadoNoTeste[] }> {
  const criados: CriadoNoTeste[] = [];
  const objeto = def.objeto as Objeto;
  const cfg = (def.gatilho?.config ?? {}) as Record<string, unknown>;
  const { registro, contato, custom, customContato, tags } = camposDasCondicoes(condicoesParaCumprir(def));

  return comAtor({ tipo: "automacao", automacaoId, teste: true, profundidade: 1 }, async () => {
    // Etiqueta que marca tudo o que é de teste (achar e apagar depois).
    let etiqueta = await prisma.tag.findFirst({ where: { orgId, name: ETIQUETA_DE_TESTE }, select: { id: true } });
    if (!etiqueta) {
      etiqueta = await prisma.tag.create({ data: { orgId, name: ETIQUETA_DE_TESTE, color: "#8a8a90" }, select: { id: true } });
      criados.push({ objeto: "tag", id: etiqueta.id });
    }

    const pessoa = await prisma.contact.create({
      data: {
        orgId,
        name: `${PREFIXO} ${texto(contato.name) || "Contato de teste"}`,
        phone: telefone,
        email: email || texto(contato.email),
        source: "teste",
        customFields: customContato as object,
      },
      select: { id: true },
    });
    criados.push({ objeto: "contact", id: pessoa.id });
    const etiquetas = [etiqueta.id];
    for (const t of tags) {
      const achada = await prisma.tag.findFirst({ where: { orgId, OR: [{ id: String(t) }, { name: String(t) }] }, select: { id: true } });
      if (achada) etiquetas.push(achada.id);
    }
    if (objeto === "contact" && cfg.tag && typeof cfg.tag === "string") etiquetas.push(cfg.tag);
    await prisma.contactTag.createMany({ data: [...new Set(etiquetas)].map((tagId) => ({ contactId: pessoa.id, tagId })), skipDuplicates: true });

    if (objeto === "contact") return { objetoId: pessoa.id, gatilho: { tipo: def.gatilho?.tipo ?? "teste", teste: true }, criados };

    if (objeto === "deal") {
      const { createDeal } = await import("@/lib/server/crm");
      const etapaId = texto(cfg.etapa) || texto(registro.stage_id) || null;
      const etapa = etapaId
        ? await prisma.pipelineStage.findFirst({ where: { id: etapaId, pipeline: { orgId } }, select: { id: true, pipelineId: true } })
        : await prisma.pipelineStage.findFirst({
            where: { pipeline: { orgId, ...(cfg.funil ? { id: String(cfg.funil) } : {}) }, type: "open" },
            orderBy: [{ pipeline: { createdAt: "asc" } }, { position: "asc" }],
            select: { id: true, pipelineId: true },
          });
      const valor = numero(registro.amount_cents);
      const negocio = await createDeal({
        orgId,
        name: `${PREFIXO} ${texto(registro.name) || "Negócio de teste"}`,
        pipelineId: etapa?.pipelineId,
        stageId: etapa?.id,
        contactId: pessoa.id,
        ownerId: texto(registro.owner_id) || undefined,
        amountCents: valor !== null ? Math.max(0, Math.round(valor)) : undefined,
        customFields: custom,
        origem: "automacao",
      });
      criados.push({ objeto: "deal", id: negocio.id });
      return { objetoId: negocio.id, gatilho: { tipo: def.gatilho?.tipo ?? "teste", teste: true, ...(etapa ? { to_stage_id: etapa.id } : {}) }, criados };
    }

    if (objeto === "company") {
      const empresa = await prisma.company.create({ data: { orgId, name: `${PREFIXO} ${texto(registro.name) || "Empresa de teste"}` }, select: { id: true } });
      await prisma.contact.update({ where: { id: pessoa.id }, data: { companyId: empresa.id } });
      criados.push({ objeto: "company", id: empresa.id });
      return { objetoId: empresa.id, gatilho: { tipo: def.gatilho?.tipo ?? "teste", teste: true }, criados };
    }

    if (objeto === "task") {
      const tarefa = await prisma.task.create({
        data: { orgId, contactId: pessoa.id, text: `${PREFIXO} ${texto(registro.text) || "Tarefa de teste"}`, type: texto(cfg.tipo_tarefa) || texto(registro.type) || "ligar", dueAt: new Date() },
        select: { id: true },
      });
      criados.push({ objeto: "task", id: tarefa.id });
      return { objetoId: tarefa.id, gatilho: { tipo: def.gatilho?.tipo ?? "teste", teste: true }, criados };
    }

    // Conversa: no "playground" (nunca se mistura com a conversa de verdade do
    // número), ligada ao contato de teste. A mensagem do gatilho cumpre as palavras.
    const agente =
      (await prisma.agent.findFirst({ where: { orgId, ...(texto(registro.agent_id) ? { id: texto(registro.agent_id) } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
      (await prisma.agent.findFirst({ where: { orgId }, select: { id: true } }));
    if (!agente) throw new Error("Crie um agente antes: a conversa de teste precisa de um.");
    const palavras = texto(cfg.palavras).split(",").map((p) => p.trim()).filter(Boolean);
    const mensagem = palavras.length ? `Olá! ${palavras[0]} (mensagem de teste)` : "Olá! (mensagem de teste)";
    const conversa = await prisma.conversation.create({
      data: {
        agentId: agente.id,
        channel: "playground",
        contactId: `teste-${pessoa.id}`,
        contactRecordId: pessoa.id,
        status: "active",
        lastContactMessageAt: new Date(),
        lastMessageAt: new Date(),
        lastMessageText: mensagem,
        lastMessageRole: "user",
      },
      select: { id: true },
    });
    criados.push({ objeto: "conversation", id: conversa.id });
    return { objetoId: conversa.id, gatilho: { tipo: def.gatilho?.tipo ?? "teste", teste: true, texto: mensagem, primeira: true }, criados };
  });
}

/** Quais condições o registro de teste cumpre de fato (lido como o motor lê). */
export async function conferirCondicoes(orgId: string, def: Definicao, objetoId: string) {
  const cumpridas: string[] = [], naoCumpridas: string[] = [];
  const montado = await montarContexto(orgId, def.objeto as Objeto, objetoId, { gatilho: { teste: true }, passos: {} }, new Date());
  if (!montado) return { cumpridas, naoCumpridas };
  for (const c of condicoesParaCumprir(def)) {
    const passou = avaliarRegra({ grupos: [{ condicoes: [c] }] }, montado.contexto, new Date());
    (passou ? cumpridas : naoCumpridas).push(c.campo);
  }
  return { cumpridas, naoCumpridas };
}

/** Ids que os passos criaram (deal.create, task.create, note.create) para apagar junto. */
function criadosPelosPassos(passos: { saida: unknown }[]): CriadoNoTeste[] {
  const out: CriadoNoTeste[] = [];
  for (const p of passos) {
    const s = (p.saida ?? {}) as Record<string, unknown>;
    if (typeof s.deal_id === "string") out.push({ objeto: "deal", id: s.deal_id });
    if (typeof s.task_id === "string") out.push({ objeto: "task", id: s.task_id });
  }
  return out;
}

/** "Apagar dados do teste": remove só o que esta execução de teste criou. */
export async function apagarDadosDoTeste(orgId: string, execucaoId: string) {
  const exec = await prisma.automacaoExecucao.findFirst({
    where: { id: execucaoId, orgId, teste: true },
    select: { variaveis: true, passos: { select: { saida: true } } },
  });
  const real = (exec?.variaveis as { __testeReal?: TesteReal } | null)?.__testeReal;
  if (!exec || !real) return { apagados: 0 };
  const todos = [...real.criados, ...criadosPelosPassos(exec.passos)];
  const ids = (o: CriadoNoTeste["objeto"]) => todos.filter((c) => c.objeto === o).map((c) => c.id);
  const contatos = ids("contact");
  let apagados = 0;
  await comAtor({ tipo: "automacao", teste: true }, async () => {
    // Negócios e tarefas do contato de teste (inclusive os que os passos criaram).
    const negocios = [...new Set([...ids("deal"), ...(await prisma.dealContact.findMany({ where: { contactId: { in: contatos } }, select: { dealId: true } })).map((d) => d.dealId)])];
    apagados += (await prisma.task.deleteMany({ where: { orgId, OR: [{ id: { in: ids("task") } }, { contactId: { in: contatos } }, { dealId: { in: negocios } }] } })).count;
    apagados += (await prisma.note.deleteMany({ where: { orgId, OR: [{ contactId: { in: contatos } }, { dealId: { in: negocios } }] } })).count;
    apagados += (await prisma.deal.deleteMany({ where: { orgId, id: { in: negocios } } })).count;
    apagados += (await prisma.conversation.deleteMany({ where: { id: { in: ids("conversation") }, agent: { orgId } } })).count;
    apagados += (await prisma.contact.deleteMany({ where: { orgId, id: { in: contatos } } })).count;
    apagados += (await prisma.company.deleteMany({ where: { orgId, id: { in: ids("company") } } })).count;
  });
  await prisma.automacaoExecucao.update({ where: { id: execucaoId }, data: { variaveis: { ...(exec.variaveis as object), __testeReal: { ...real, apagado: true } } } });
  return { apagados };
}
