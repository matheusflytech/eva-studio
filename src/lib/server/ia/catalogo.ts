import "server-only";
import { prisma } from "@/lib/db/prisma";
import { serializarDefinicao } from "@/lib/server/custom-fields";
import { LIMITES_DO_CATALOGO, type CatalogoDoCrm } from "@/lib/server/ia/consulta-ia";

// O catálogo real da organização para a IA: as mesmas listas que os filtros
// do dashboard oferecem (GET /api/analytics/opcoes), já cortadas no tamanho
// que cabe num prompt. Sempre filtrado pelo orgId da sessão.

const CANAIS_INTERNOS = ["playground", "builder_preview"];

export async function carregarCatalogo(orgId: string): Promise<CatalogoDoCrm> {
  const [funis, membros, etiquetas, empresas, canais, motivos, campos] = await Promise.all([
    prisma.pipeline.findMany({
      where: { orgId },
      select: { id: true, name: true, stages: { select: { id: true, name: true, type: true }, orderBy: { position: "asc" } } },
      orderBy: [{ isDefault: "desc" }, { position: "asc" }],
    }),
    prisma.profile.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: LIMITES_DO_CATALOGO.membros }),
    prisma.tag.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: LIMITES_DO_CATALOGO.etiquetas }),
    prisma.company.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: LIMITES_DO_CATALOGO.empresas }),
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
      take: LIMITES_DO_CATALOGO.motivos,
    }),
    prisma.customField.findMany({ where: { orgId, entity: "deal" }, orderBy: { position: "asc" }, take: LIMITES_DO_CATALOGO.campos }),
  ]);

  return {
    funis,
    membros: membros.map((m) => ({ id: m.id, name: m.name || "Sem nome" })),
    etiquetas,
    empresas,
    canais: canais.map((c) => c.channel),
    motivosDePerda: motivos.map((m) => m.lostReason),
    campos: campos.map(serializarDefinicao).map((d) => ({ key: d.key, label: d.label, type: d.type, options: d.options })),
  };
}
