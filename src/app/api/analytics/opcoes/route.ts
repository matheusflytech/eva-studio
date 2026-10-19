import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { membrosDoContrato } from "@/lib/server/contratos";
import { serializarDefinicao } from "@/lib/server/custom-fields";

// Tudo que os filtros do dashboard oferecem pra escolher, de uma vez: funis e
// etapas, pessoas, etiquetas, empresas, canais, motivos de perda já usados e
// os campos personalizados de negócio. Uma ida ao servidor por tela, em vez
// de cada seletor buscar a sua lista.

const CANAIS_INTERNOS = ["playground", "builder_preview"];

export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;

  const [funis, membros, etiquetas, empresas, canais, motivos, campos] = await Promise.all([
    prisma.pipeline.findMany({
      where: { orgId },
      select: { id: true, name: true, stages: { select: { id: true, name: true, type: true, position: true }, orderBy: { position: "asc" } } },
      orderBy: [{ isDefault: "desc" }, { position: "asc" }],
    }),
    // Quem tem vínculo com o contrato (não só quem o tem como padrão).
    membrosDoContrato(orgId, { id: true, name: true }, { orderBy: { name: "asc" } }),
    prisma.tag.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.company.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.contactChannel.findMany({
      where: { contact: { orgId }, channel: { notIn: CANAIS_INTERNOS } },
      distinct: ["channel"],
      select: { channel: true },
    }),
    prisma.deal.findMany({
      where: { orgId, lostReason: { not: "" } },
      distinct: ["lostReason"],
      select: { lostReason: true },
      orderBy: { lostReason: "asc" },
      take: 100,
    }),
    prisma.customField.findMany({ where: { orgId, entity: "deal" }, orderBy: { position: "asc" } }),
  ]);

  return NextResponse.json({
    funis,
    membros: membros.map((m) => ({ id: m.id, name: m.name || "Sem nome" })),
    etiquetas,
    empresas,
    canais: canais.map((c) => c.channel),
    motivosDePerda: motivos.map((m) => m.lostReason),
    campos: campos.map(serializarDefinicao),
  });
}
