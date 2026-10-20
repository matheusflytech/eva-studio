// ---------------------------------------------------------------------------
// Lixeira e desfazer — a parte pura (sem banco), usada pelo servidor
// (src/lib/server/lixeira.ts) e pelas telas.
//
// Lixeira por "foto": ao apagar, o registro E tudo o que a cascata do banco
// levaria junto viram um JSON; restaurar recria com os mesmos ids. O que não
// existe mais na hora de restaurar (etapa, empresa, contato, responsável,
// etiqueta, canal ocupado por outra ficha...) é tratado aqui, com um aviso
// legível para cada caso — nada de restaurar pela metade em silêncio.
// ---------------------------------------------------------------------------

export const DIAS_NA_LIXEIRA = 30;
/** Quanto tempo o toast "Desfazer" fica na tela. */
export const MS_PARA_DESFAZER = 6000;

export type EntidadeDaLixeira = "deal" | "contact" | "company";
export const ENTIDADES_DA_LIXEIRA: EntidadeDaLixeira[] = ["deal", "contact", "company"];

export const ROTULO_DA_ENTIDADE: Record<EntidadeDaLixeira, string> = {
  deal: "Negócio",
  contact: "Contato",
  company: "Empresa",
};

export function ehEntidadeDaLixeira(v: unknown): v is EntidadeDaLixeira {
  return v === "deal" || v === "contact" || v === "company";
}

export type Linha = Record<string, unknown>;
export interface Externo {
  source: string;
  externalId: string;
}

export interface FotoDoNegocio {
  versao: 1;
  entidade: "deal";
  registro: Linha;
  /** Nomes na hora de apagar, para o aviso quando a etapa/empresa sumir. */
  contexto: { etapa: string; funil: string; empresa: string };
  contatos: { contactId: string; role: string }[];
  tarefas: Linha[];
  notas: Linha[];
  eventos: Linha[];
  itens: Linha[];
  valorManual: Linha | null;
  perda: Linha | null;
  atividade: Linha | null;
  externos: Externo[];
}

export interface FotoDoContato {
  versao: 1;
  entidade: "contact";
  registro: Linha;
  contexto: { empresa: string };
  canais: Linha[];
  etiquetas: { tagId: string; addedAt: unknown }[];
  negocios: { dealId: string; role: string }[];
  tarefas: Linha[];
  notas: Linha[];
  inscricoes: Linha[];
  /** Conversas que apontavam para a ficha (a FK é SetNull: elas ficam). */
  conversas: string[];
  externos: Externo[];
}

export interface FotoDaEmpresa {
  versao: 1;
  entidade: "company";
  registro: Linha;
  /** Contatos e negócios ligados (SetNull no banco: eles ficam, sem empresa). */
  contatos: string[];
  negocios: string[];
  externos: Externo[];
}

export type Foto = FotoDoNegocio | FotoDoContato | FotoDaEmpresa;

/** Date → ISO, Decimal → string: o que vai para o jsonb é sempre JSON puro. */
export function paraJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null));
}

export function expiraEm(deletedAt: Date, dias = DIAS_NA_LIXEIRA): Date {
  return new Date(deletedAt.getTime() + dias * 86_400_000);
}

/** Dias inteiros que faltam (arredonda para cima; vencido = 0). */
export function diasRestantes(expiresAt: Date | string, agora: Date = new Date()): number {
  const fim = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  return Math.max(0, Math.ceil((fim - agora.getTime()) / 86_400_000));
}

export function textoDeExpiracao(expiresAt: Date | string, agora: Date = new Date()): string {
  const d = diasRestantes(expiresAt, agora);
  if (d <= 0) return "Expira hoje";
  return d === 1 ? "Expira em 1 dia" : `Expira em ${d} dias`;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** O que foi junto, em uma linha: "3 tarefas · 2 notas · 1 contato". */
export function resumoDaFoto(foto: Foto): string {
  const partes: string[] = [];
  const add = (n: number, um: string, varios: string) => n > 0 && partes.push(plural(n, um, varios));
  if (foto.entidade === "deal") {
    if (foto.contexto.funil) partes.push(`${foto.contexto.funil} › ${foto.contexto.etapa}`);
    add(foto.tarefas.length, "tarefa", "tarefas");
    add(foto.notas.length, "nota", "notas");
    add(foto.itens.length, "produto", "produtos");
    add(foto.contatos.length, "contato", "contatos");
  } else if (foto.entidade === "contact") {
    add(foto.negocios.length, "negócio", "negócios");
    add(foto.tarefas.length, "tarefa", "tarefas");
    add(foto.notas.length, "nota", "notas");
    add(foto.conversas.length, "conversa", "conversas");
    add(foto.etiquetas.length, "etiqueta", "etiquetas");
  } else {
    add(foto.contatos.length, "contato", "contatos");
    add(foto.negocios.length, "negócio", "negócios");
  }
  return partes.join(" · ");
}

// ── Restaurar: o que existe hoje → o que recriar ──────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Tarefa/nota: vínculo com registro que sumiu vira nulo (a FK recusaria). */
function religarAtividade(
  linha: Linha,
  campos: { pessoa: "assignedToId" | "authorId" },
  existe: { contatos: Set<string>; negocios: Set<string>; pessoas: Set<string> }
): Linha {
  const l = { ...linha };
  if (str(l.contactId) && !existe.contatos.has(l.contactId as string)) l.contactId = null;
  if (str(l.dealId) && !existe.negocios.has(l.dealId as string)) l.dealId = null;
  const p = campos.pessoa;
  if (str(l[p]) && !existe.pessoas.has(l[p] as string)) l[p] = null;
  return l;
}

function externosLivres(externos: Externo[], ocupados: Set<string>, avisos: string[]): Externo[] {
  const livres = externos.filter((e) => !ocupados.has(`${e.source}|${e.externalId}`));
  const n = externos.length - livres.length;
  if (n > 0) avisos.push(`${plural(n, "id externo já está", "ids externos já estão")} em outro registro e não ${n === 1 ? "voltou" : "voltaram"}.`);
  return livres;
}

export interface EtapaExistente {
  id: string;
  pipelineId: string;
  type: string;
  probability: number;
}

export interface ExistentesDoNegocio {
  /** A etapa da foto, se ainda existe (no mesmo contrato). */
  etapaOriginal: EtapaExistente | null;
  /** Primeira etapa aberta do funil da foto (ou, se o funil sumiu, do primeiro funil). */
  etapaDeEntrada: EtapaExistente | null;
  empresas: Set<string>;
  pessoas: Set<string>;
  contatos: Set<string>;
  produtos: Set<string>;
  /** "source|externalId" já usados por outro negócio. */
  externosOcupados: Set<string>;
  agora: Date;
}

export type PlanoDoNegocio =
  | {
      ok: true;
      registro: Linha;
      contatos: { contactId: string; role: string }[];
      tarefas: Linha[];
      notas: Linha[];
      eventos: Linha[];
      /** Evento extra quando a etapa mudou na restauração. */
      eventoNovo: { fromStageId: string | null; toStageId: string; pipelineId: string } | null;
      itens: Linha[];
      valorManual: Linha | null;
      perda: Linha | null;
      atividade: Linha | null;
      externos: Externo[];
      avisos: string[];
    }
  | { ok: false; erro: string };

export function planejarNegocio(foto: FotoDoNegocio, e: ExistentesDoNegocio): PlanoDoNegocio {
  const avisos: string[] = [];
  const registro: Linha = { ...foto.registro };
  let perda = foto.perda;
  let eventoNovo: { fromStageId: string | null; toStageId: string; pipelineId: string } | null = null;

  if (!e.etapaOriginal) {
    if (!e.etapaDeEntrada) return { ok: false, erro: "O funil deste negócio não tem mais etapa aberta. Crie uma etapa e tente de novo." };
    const nova = e.etapaDeEntrada;
    const mudouFunil = nova.pipelineId !== registro.pipelineId;
    eventoNovo = { fromStageId: str(registro.stageId), toStageId: nova.id, pipelineId: nova.pipelineId };
    Object.assign(registro, {
      stageId: nova.id,
      pipelineId: nova.pipelineId,
      probability: nova.probability,
      stageSince: e.agora.toISOString(),
      closedAt: null,
      lostReason: "",
    });
    perda = null;
    avisos.push(
      mudouFunil
        ? `O funil "${foto.contexto.funil}" não existe mais: o negócio voltou na primeira etapa aberta de outro funil.`
        : `A etapa "${foto.contexto.etapa}" não existe mais: o negócio voltou na primeira etapa aberta do funil.`
    );
  }

  if (str(registro.companyId) && !e.empresas.has(registro.companyId as string)) {
    registro.companyId = null;
    avisos.push(`A empresa${foto.contexto.empresa ? ` "${foto.contexto.empresa}"` : ""} não existe mais: o negócio voltou sem empresa.`);
  }
  if (str(registro.ownerId) && !e.pessoas.has(registro.ownerId as string)) {
    registro.ownerId = null;
    avisos.push("O responsável não está mais no contrato: o negócio voltou sem responsável.");
  }

  const contatos = foto.contatos.filter((c) => e.contatos.has(c.contactId));
  const sumiram = foto.contatos.length - contatos.length;
  if (sumiram > 0) avisos.push(`${plural(sumiram, "contato não existe", "contatos não existem")} mais e não ${sumiram === 1 ? "voltou" : "voltaram"} ao negócio.`);

  const existe = { contatos: e.contatos, negocios: new Set([String(registro.id)]), pessoas: e.pessoas };
  const tarefas = foto.tarefas.map((t) => religarAtividade(t, { pessoa: "assignedToId" }, existe));
  const notas = foto.notas.map((n) => religarAtividade(n, { pessoa: "authorId" }, existe));
  const itens = foto.itens.map((i) => (str(i.productId) && !e.produtos.has(i.productId as string) ? { ...i, productId: null } : i));

  return {
    ok: true,
    registro,
    contatos,
    tarefas,
    notas,
    eventos: foto.eventos,
    eventoNovo,
    itens,
    valorManual: foto.valorManual,
    perda,
    atividade: foto.atividade,
    externos: externosLivres(foto.externos, e.externosOcupados, avisos),
    avisos,
  };
}

export interface ExistentesDoContato {
  empresas: Set<string>;
  pessoas: Set<string>;
  etiquetas: Set<string>;
  negocios: Set<string>;
  sequencias: Set<string>;
  agentes: Set<string>;
  /** "agentId|channel|externalId" já usados por outra ficha. */
  canaisOcupados: Set<string>;
  /** Conversas que existem e estão sem ficha (as outras foram religadas a outra pessoa). */
  conversasLivres: Set<string>;
  externosOcupados: Set<string>;
}

export interface PlanoDoContato {
  registro: Linha;
  canais: Linha[];
  etiquetas: { tagId: string; addedAt: unknown }[];
  negocios: { dealId: string; role: string }[];
  tarefas: Linha[];
  notas: Linha[];
  inscricoes: Linha[];
  conversas: string[];
  externos: Externo[];
  avisos: string[];
}

export function planejarContato(foto: FotoDoContato, e: ExistentesDoContato): PlanoDoContato {
  const avisos: string[] = [];
  const registro: Linha = { ...foto.registro };
  if (str(registro.companyId) && !e.empresas.has(registro.companyId as string)) {
    registro.companyId = null;
    avisos.push(`A empresa${foto.contexto.empresa ? ` "${foto.contexto.empresa}"` : ""} não existe mais: o contato voltou sem empresa.`);
  }
  if (str(registro.ownerId) && !e.pessoas.has(registro.ownerId as string)) {
    registro.ownerId = null;
    avisos.push("O responsável não está mais no contrato: o contato voltou sem responsável.");
  }

  const chave = (c: Linha) => `${c.agentId}|${c.channel}|${c.externalId}`;
  const canais = foto.canais.filter((c) => e.agentes.has(String(c.agentId)) && !e.canaisOcupados.has(chave(c)));
  const ocupados = foto.canais.filter((c) => e.canaisOcupados.has(chave(c))).length;
  if (ocupados > 0) {
    avisos.push(
      `${plural(ocupados, "canal já pertence", "canais já pertencem")} a outra ficha (a pessoa falou de novo depois de apagada): ${ocupados === 1 ? "ficou" : "ficaram"} lá. Se for a mesma pessoa, mescle as fichas.`
    );
  }

  const etiquetas = foto.etiquetas.filter((t) => e.etiquetas.has(t.tagId));
  const negocios = foto.negocios.filter((d) => e.negocios.has(d.dealId));
  const negociosSumidos = foto.negocios.length - negocios.length;
  if (negociosSumidos > 0) avisos.push(`${plural(negociosSumidos, "negócio ligado não existe", "negócios ligados não existem")} mais.`);

  const existe = { contatos: new Set([String(registro.id)]), negocios: e.negocios, pessoas: e.pessoas };
  const tarefas = foto.tarefas.map((t) => religarAtividade(t, { pessoa: "assignedToId" }, existe));
  const notas = foto.notas.map((n) => religarAtividade(n, { pessoa: "authorId" }, existe));
  const inscricoes = foto.inscricoes.filter((i) => e.sequencias.has(String(i.sequenceId)));

  const conversas = foto.conversas.filter((id) => e.conversasLivres.has(id));
  const presas = foto.conversas.length - conversas.length;
  if (presas > 0) avisos.push(`${plural(presas, "conversa já está ligada", "conversas já estão ligadas")} a outra ficha ou não existe mais.`);

  return {
    registro,
    canais,
    etiquetas,
    negocios,
    tarefas,
    notas,
    inscricoes,
    conversas,
    externos: externosLivres(foto.externos, e.externosOcupados, avisos),
    avisos,
  };
}

export interface ExistentesDaEmpresa {
  pessoas: Set<string>;
  /** Contatos/negócios da foto que existem e continuam sem empresa. */
  contatosLivres: Set<string>;
  negociosLivres: Set<string>;
  externosOcupados: Set<string>;
}

export interface PlanoDaEmpresa {
  registro: Linha;
  contatos: string[];
  negocios: string[];
  externos: Externo[];
  avisos: string[];
}

export function planejarEmpresa(foto: FotoDaEmpresa, e: ExistentesDaEmpresa): PlanoDaEmpresa {
  const avisos: string[] = [];
  const registro: Linha = { ...foto.registro };
  if (str(registro.ownerId) && !e.pessoas.has(registro.ownerId as string)) {
    registro.ownerId = null;
    avisos.push("O responsável não está mais no contrato: a empresa voltou sem responsável.");
  }
  const contatos = foto.contatos.filter((id) => e.contatosLivres.has(id));
  const negocios = foto.negocios.filter((id) => e.negociosLivres.has(id));
  const fora = foto.contatos.length - contatos.length + (foto.negocios.length - negocios.length);
  if (fora > 0) avisos.push(`${plural(fora, "vínculo não voltou", "vínculos não voltaram")} (registro apagado ou já ligado a outra empresa).`);
  return { registro, contatos, negocios, externos: externosLivres(foto.externos, e.externosOcupados, avisos), avisos };
}

// ── Desfazer mudança de etapa ─────────────────────────────────────────────

export interface EtapaSimples {
  id: string;
  name: string;
  type: string;
}

/**
 * Corpo do PATCH que desfaz uma mudança de etapa (volta para `de` pelo mesmo
 * moveDealStage, com as regras). null = não tem como desfazer: voltar para
 * "perdido" pediria o motivo de novo, então reabrir um perdido não oferece
 * desfazer.
 */
export function corpoParaDesfazer(de: EtapaSimples | null | undefined, para: EtapaSimples): Record<string, unknown> | null {
  if (!de?.id || de.id === para.id) return null;
  if (de.type === "lost") return null;
  const fechou = para.type === "won" || para.type === "lost";
  return { stageId: de.id, ...(fechou ? { reabrir: true } : {}) };
}

/** Título do toast depois de mover. `para.id` vazio = "Reabrir" (o servidor escolheu a etapa). */
export function tituloDaMudanca(para: EtapaSimples): string {
  if (!para.id) return "Negócio reaberto";
  if (para.type === "won") return "Marcado como ganho";
  if (para.type === "lost") return "Marcado como perdido";
  return `Movido para ${para.name}`;
}
