import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatarMudancas, resumoDaLinha, type CampoDoDicionario, type Dicionario } from "@/lib/historico/formatar";
import type { ItemDoHistorico, LinhaDoHistorico } from "@/lib/historico/tipos";
import type { ItemDaLinhaDoTempo } from "@/components/crm/negocio/linha-do-tempo";
import { listarHistorico } from "@/lib/server/historico";

// Linhas do histórico prontas para a tela: busca de uma vez os nomes que as
// mudanças citam (responsável, etapa, funil, empresa, contato e rótulo de
// campo personalizado), sempre dentro da org, e diz se o registro ainda existe.

const ids = (l: Iterable<unknown>) => [...new Set([...l].filter((x): x is string => typeof x === "string" && x.length > 0))];
const mapa = (l: { id: string; name: string }[]) => Object.fromEntries(l.map((x) => [x.id, x.name]));

export async function montarDicionario(orgId: string, linhas: LinhaDoHistorico[]): Promise<Dicionario> {
  const pessoas: unknown[] = [];
  const etapas: unknown[] = [];
  const funis: unknown[] = [];
  const empresas: unknown[] = [];
  const contatos: unknown[] = [];
  const objetos = new Set<string>();
  for (const l of linhas) {
    if (!l.mudancas) continue;
    objetos.add(l.objeto);
    for (const [campo, m] of Object.entries(l.mudancas)) {
      const ambos = [m?.de, m?.para];
      if (campo === "owner_id") pessoas.push(...ambos);
      else if (campo === "stage_id") etapas.push(...ambos);
      else if (campo === "pipeline_id") funis.push(...ambos);
      else if (campo === "company_id") empresas.push(...ambos);
      else if (campo === "contacts") {
        for (const v of ambos) if (Array.isArray(v)) for (const c of v) contatos.push((c as { contact_id?: unknown })?.contact_id);
      }
    }
  }
  const [p, e, f, em, c, campos] = await Promise.all([
    ids(pessoas).length ? prisma.profile.findMany({ where: { id: { in: ids(pessoas) } }, select: { id: true, name: true } }) : [],
    ids(etapas).length ? prisma.pipelineStage.findMany({ where: { id: { in: ids(etapas) }, pipeline: { orgId } }, select: { id: true, name: true } }) : [],
    ids(funis).length ? prisma.pipeline.findMany({ where: { id: { in: ids(funis) }, orgId }, select: { id: true, name: true } }) : [],
    ids(empresas).length ? prisma.company.findMany({ where: { id: { in: ids(empresas) }, orgId }, select: { id: true, name: true } }) : [],
    ids(contatos).length ? prisma.contact.findMany({ where: { id: { in: ids(contatos) }, orgId }, select: { id: true, name: true } }) : [],
    objetos.size
      ? prisma.customField.findMany({ where: { orgId, entity: { in: [...objetos] } }, select: { entity: true, key: true, label: true, type: true, options: true } })
      : [],
  ]);
  const porObjeto: Record<string, Record<string, CampoDoDicionario>> = {};
  for (const cf of campos) {
    (porObjeto[cf.entity] ??= {})[cf.key] = {
      rotulo: cf.label,
      tipo: cf.type,
      opcoes: Array.isArray(cf.options) ? (cf.options as { value: string; label: string }[]) : [],
    };
  }
  return { pessoas: mapa(p), etapas: mapa(e), funis: mapa(f), empresas: mapa(em), contatos: mapa(c), campos: porObjeto };
}

async function existentes(orgId: string, linhas: LinhaDoHistorico[]): Promise<Set<string>> {
  const de = (o: string) => ids(linhas.filter((l) => l.objeto === o).map((l) => l.objetoId));
  const [d, c, co] = await Promise.all([
    de("deal").length ? prisma.deal.findMany({ where: { id: { in: de("deal") }, orgId }, select: { id: true } }) : [],
    de("contact").length ? prisma.contact.findMany({ where: { id: { in: de("contact") }, orgId }, select: { id: true } }) : [],
    de("company").length ? prisma.company.findMany({ where: { id: { in: de("company") }, orgId }, select: { id: true } }) : [],
  ]);
  return new Set([...d, ...c, ...co].map((x) => x.id));
}

/**
 * `semEtapa` (ficha do negócio): mudança de etapa já aparece no item "Etapa";
 * uma alteração que só mexeu na etapa some.
 */
export async function itensDoHistorico(orgId: string, linhas: LinhaDoHistorico[], opcoes: { semEtapa?: boolean } = {}): Promise<ItemDoHistorico[]> {
  if (linhas.length === 0) return [];
  const [dic, vivos] = await Promise.all([montarDicionario(orgId, linhas), existentes(orgId, linhas)]);
  const itens: ItemDoHistorico[] = [];
  for (const l of linhas) {
    const mudancas = formatarMudancas(l.objeto, l.mudancas, dic, opcoes);
    if (l.acao === "alterou" && mudancas.length === 0) continue;
    itens.push({ ...l, mudancas, resumo: resumoDaLinha(l, mudancas.length), existe: vivos.has(l.objetoId) });
  }
  return itens;
}

/** Itens "alteracao" da linha do tempo de uma ficha. Sem a tabela, nenhum. */
export async function alteracoesDaFicha(
  orgId: string,
  objeto: "deal" | "contact" | "company",
  objetoId: string,
  limite = 100
): Promise<ItemDaLinhaDoTempo[]> {
  const { linhas } = await listarHistorico(orgId, { objeto, objetoId, acoes: ["alterou"], limite });
  const itens = await itensDoHistorico(orgId, linhas, { semEtapa: objeto === "deal" });
  return itens.map((h) => ({
    id: `alteracao-${h.id}`,
    tipo: "alteracao" as const,
    em: h.em,
    ator: { tipo: h.atorTipo, nome: h.atorNome, id: h.atorId },
    mudancas: h.mudancas,
  }));
}
