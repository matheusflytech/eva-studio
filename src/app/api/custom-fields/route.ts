import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { carregarDefinicoes, gerarChaveUnica, prepararOpcoes, serializarDefinicao } from "@/lib/server/custom-fields";
import { TIPO_POR_ID, type OpcaoDeCampo } from "@/lib/custom-fields";

// Campos que o cliente cria.
//   GET  ?entity=deal|contact&pipelineId=...  os campos que valem nesse contexto
//        ?todos=1                              todos da organização (tela de configuração)
//   POST cria um campo novo

const LIMITE_POR_ENTIDADE = 40;

export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const sp = new URL(request.url).searchParams;
  const entity = sp.get("entity") === "contact" ? "contact" : "deal";

  if (sp.get("todos") === "1") {
    const linhas = await prisma.customField.findMany({
      where: { orgId: ctx.orgId, entity },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ fields: linhas.map(serializarDefinicao) });
  }

  const fields = await carregarDefinicoes(ctx.orgId, entity, sp.get("pipelineId"));
  return NextResponse.json({ fields });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const label = String(body.label ?? "").trim().slice(0, 60);
  const entity = body.entity === "contact" ? "contact" : "deal";
  const type = String(body.type ?? "");

  if (!label) return NextResponse.json({ error: "Dê um nome ao campo." }, { status: 400 });
  const info = TIPO_POR_ID.get(type as never);
  if (!info) return NextResponse.json({ error: "Escolha o tipo do campo." }, { status: 400 });

  const opcoes = info.comOpcoes ? prepararOpcoes(body.options) : [];
  if (info.comOpcoes && (opcoes as OpcaoDeCampo[]).length === 0) {
    return NextResponse.json({ error: "Adicione pelo menos uma opção à lista." }, { status: 400 });
  }

  const total = await prisma.customField.count({ where: { orgId: ctx.orgId, entity } });
  if (total >= LIMITE_POR_ENTIDADE) {
    return NextResponse.json({ error: `O limite é de ${LIMITE_POR_ENTIDADE} campos. Apague algum que não usa mais.` }, { status: 400 });
  }

  // Campo de funil específico: confere que o funil é da organização.
  let pipelineId: string | null = null;
  if (entity === "deal" && body.pipelineId) {
    const funil = await prisma.pipeline.findFirst({ where: { id: String(body.pipelineId), orgId: ctx.orgId } });
    if (!funil) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });
    pipelineId = funil.id;
  }

  const key = await gerarChaveUnica(ctx.orgId, entity, label);

  const campo = await prisma.customField.create({
    data: {
      orgId: ctx.orgId,
      entity,
      pipelineId,
      key,
      label,
      type,
      options: opcoes as unknown as object,
      required: body.required === true,
      helpText: String(body.helpText ?? "").slice(0, 200),
      showOnCard: entity === "deal" && body.showOnCard === true,
      position: total,
    },
  });

  return NextResponse.json({ field: serializarDefinicao(campo) });
}
