import "server-only";
import { prisma } from "@/lib/db/prisma";
import { gerarChaveUnica, prepararOpcoes } from "@/lib/server/custom-fields";
import { ensureDefaultPipeline } from "@/lib/server/crm";
import { TIPO_POR_ID } from "@/lib/custom-fields";
import type { PacoteDeNicho } from "@/lib/niche-packs";

// ---------------------------------------------------------------------------
// Aplica um pacote de nicho numa organização: funil, campos e um atendimento
// pronto. Cria tudo de uma vez, sem pedir chave de IA nem canal conectado: o
// atendimento do pacote é um fluxo de perguntas fixas que já preenche o CRM, e
// o canal a pessoa liga depois.
// ---------------------------------------------------------------------------

export interface ResumoDoPacote {
  funilId: string;
  funilNome: string;
  agenteId: string;
  campos: { entity: "deal" | "contact"; label: string; key: string }[];
  substituiuFunilVazio: boolean;
}

function id(): string {
  return crypto.randomUUID();
}

export async function aplicarPacote(orgId: string, pacote: PacoteDeNicho, empresa: string): Promise<ResumoDoPacote> {
  const nomeEmpresa = empresa.trim().slice(0, 60) || "nossa empresa";

  // 1) Funil. Se a conta só tem o funil que o sistema cria sozinho e ele está
  // vazio, o do pacote toma o lugar dele; senão entra ao lado, sem mexer no
  // que a pessoa já tem.
  const existentes = await prisma.pipeline.findMany({
    where: { orgId },
    include: { _count: { select: { deals: true } } },
    orderBy: { position: "asc" },
  });
  const substitui = existentes.length === 1 && existentes[0]._count.deals === 0;

  const funil = await prisma.pipeline.create({
    data: {
      orgId,
      name: pacote.funil.nome,
      isDefault: substitui || existentes.length === 0,
      position: existentes.length,
      stages: {
        create: pacote.funil.etapas.map((e, i) => ({
          name: e.name,
          position: i,
          type: e.type,
          probability: e.type === "won" ? 100 : e.type === "lost" ? 0 : e.probability,
          color: e.color ?? "",
        })),
      },
    },
  });
  if (substitui) await prisma.pipeline.delete({ where: { id: existentes[0].id } });
  else if (existentes.length === 0) await ensureDefaultPipeline(orgId);

  // 2) Campos. Guarda a chave final de cada um: é ela que dá nome à variável
  // da pergunta, e o preenchimento automático liga as duas pelo nome.
  const posicao = { deal: await prisma.customField.count({ where: { orgId, entity: "deal" } }), contact: await prisma.customField.count({ where: { orgId, entity: "contact" } }) };
  const criados: ResumoDoPacote["campos"] = [];
  const perguntas: { key: string; pergunta: string; opcoes?: { id: string; label: string }[] }[] = [];

  for (const c of pacote.campos) {
    const info = TIPO_POR_ID.get(c.type);
    if (!info) continue;
    const key = await gerarChaveUnica(orgId, c.entity, c.label);
    const opcoes = info.comOpcoes ? prepararOpcoes((c.options ?? []).map((label) => ({ label }))) : [];
    await prisma.customField.create({
      data: {
        orgId,
        entity: c.entity,
        key,
        label: c.label,
        type: c.type,
        options: opcoes as unknown as object,
        showOnCard: c.entity === "deal" && c.showOnCard === true,
        position: posicao[c.entity]++,
      },
    });
    criados.push({ entity: c.entity, label: c.label, key });
    if (c.pergunta) {
      perguntas.push({
        key,
        pergunta: c.pergunta,
        // Lista vira botões na conversa: o cliente responde com o número ou o nome.
        opcoes: info.comOpcoes && c.type === "select" ? opcoes.map((o) => ({ id: o.value, label: o.label })) : undefined,
      });
    }
  }

  // 3) Atendimento: perguntas fixas, cria o negócio e passa para uma pessoa.
  const agenteId = id();
  const nos: { id: string; data: Record<string, unknown> }[] = [];
  const no = (iconKey: string, data: Record<string, unknown>) => {
    const nid = id();
    nos.push({ id: nid, data: { iconKey, label: iconKey, ...data } });
    return nid;
  };

  no("start", { label: "Início", kind: "Início", detail: "" });
  no("capture", {
    label: "Nome",
    kind: "Captura de input",
    detail: pacote.abertura.replace("{empresa}", nomeEmpresa),
    variableName: "nome",
  });
  for (const p of perguntas) {
    no("capture", { label: p.pergunta.slice(0, 28), kind: "Captura de input", detail: p.pergunta, variableName: p.key, ...(p.opcoes ? { options: p.opcoes } : {}) });
  }
  no("crm-deal", {
    label: "Criar negócio",
    kind: "CRM",
    detail: "Abre o negócio no funil e preenche os campos com as respostas.",
    crmDealName: "{nome}",
    crmPipelineId: funil.id,
    crmAutoFill: true,
    crmFieldMap: [],
    variableName: "negocio_id",
  });
  no("crm-update", {
    label: "Atualizar contato",
    kind: "CRM",
    detail: "Grava as respostas nos dados do contato.",
    crmUpdateTarget: "contact",
    crmAutoFill: true,
    crmFieldMap: [],
  });
  no("message", {
    label: "Despedida",
    kind: "Mensagem",
    detail: "Perfeito, {nome}! Já anotei tudo. Um especialista da " + nomeEmpresa + " vai continuar o atendimento por aqui em instantes.",
  });
  no("human", { label: "Passar para uma pessoa", kind: "Atendimento humano", detail: "" });

  const nodes = nos.map((n, i) => ({
    id: n.id,
    type: "flowNode",
    position: { x: 120 + i * 320, y: 120 },
    data: n.data,
  }));
  // Pergunta com botões sai por uma ligação para cada opção (o motor segue a
  // ligação da opção escolhida). Todas apontam para o mesmo próximo bloco.
  const edges: { id: string; source: string; target: string; sourceHandle?: string }[] = [];
  nodes.slice(0, -1).forEach((n, i) => {
    const opcoes = (n.data.options as { id: string }[] | undefined) ?? [];
    if (opcoes.length > 0) {
      opcoes.forEach((o) => edges.push({ id: `e${i}-${o.id}`, source: n.id, target: nodes[i + 1].id, sourceHandle: o.id }));
    } else {
      edges.push({ id: `e${i}`, source: n.id, target: nodes[i + 1].id });
    }
  });

  await prisma.agent.create({
    data: {
      id: agenteId,
      orgId,
      name: `Atendimento ${nomeEmpresa}`.slice(0, 80),
      description: `Recebe o cliente, faz as perguntas do nicho ${pacote.nome.toLowerCase()} e abre o negócio no funil.`,
      tone: "Simpático, direto e profissional",
      instructions: `${pacote.contexto} Atenda em português, de forma simpática e objetiva. Faça uma pergunta de cada vez. Se o cliente pedir para falar com uma pessoa, chame um atendente.`,
      guidelines: "Nunca invente preços ou prazos. Em caso de dúvida, chame um atendente.",
      flow: { create: { nodes: nodes as unknown as object, edges: edges as unknown as object } },
    },
  });

  return {
    funilId: funil.id,
    funilNome: funil.name,
    agenteId,
    campos: criados,
    substituiuFunilVazio: substitui,
  };
}
