import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ACENTOS_DE, ACENTOS_PARA, escaparLike, type ConsultaNormalizada } from "@/lib/busca/consulta";
import { trechoComDestaque } from "@/lib/busca/trecho";
import {
  LIMITE_POR_TIPO,
  RESULTADO_VAZIO,
  subtituloDaEmpresa,
  subtituloDoContato,
  subtituloDoNegocio,
  type RegistroEncontrado,
  type ResultadoDaBusca,
  type TipoDeBusca,
  type TrechoEncontrado,
} from "@/lib/busca/resultado";
import { donosVisiveis } from "@/lib/server/escopo-dados";
import { ctxPode, type SessionContext } from "@/lib/server/permissions";

// ---------------------------------------------------------------------------
// Busca global (GET /api/busca). Uma consulta por tipo, em paralelo, sempre
// com o contrato (orgId) e o escopo de dados do papel. Todo texto da pessoa
// entra como PARÂMETRO ($1, $2…); o que é montado com Prisma.raw são só
// nomes fixos deste arquivo e o schema da extensão (validado por regex).
//
// Dois modos, detectados no banco (cache de 5 min):
//   * com prisma/sql/2026-10-20-busca.sql aplicado: public.eva_studio_norm()
//     (lower + unaccent, IMMUTABLE) com índices GIN trigram → rápido; e, se
//     nada bater pelo começo da palavra, segunda volta por semelhança
//     (pg_trgm, operador <%) para erro de digitação.
//   * sem o SQL: translate(lower(col)) + LIKE, sem índice (mais lento, mesmo
//     resultado para os acentos do português); sem semelhança.
// ---------------------------------------------------------------------------

export interface RecursosDoBanco {
  /** public.eva_studio_norm existe (unaccent instalado + função do SQL). */
  norm: boolean;
  /** Schema onde o pg_trgm está instalado (null = sem pg_trgm). */
  trgm: string | null;
}

const SEM_RECURSOS: RecursosDoBanco = { norm: false, trgm: null };
const VALIDADE_DO_CACHE = 5 * 60_000;
let cache: { em: number; r: RecursosDoBanco } | null = null;

/** Só para teste. */
export function limparCacheDosRecursos() {
  cache = null;
}

const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/;

export async function recursosDoBanco(agora = Date.now()): Promise<RecursosDoBanco> {
  if (cache && agora - cache.em < VALIDADE_DO_CACHE) return cache.r;
  let r = SEM_RECURSOS;
  try {
    const [linha] = await prisma.$queryRaw<{ norm: boolean; trgm: string | null }[]>(Prisma.sql`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'eva_studio_norm'
        ) AS norm,
        (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
          WHERE e.extname = 'pg_trgm') AS trgm
    `);
    const trgm = linha?.trgm && IDENTIFICADOR.test(linha.trgm) ? linha.trgm : null;
    r = { norm: !!linha?.norm, trgm };
  } catch {
    // Sem permissão de ler o catálogo (ou banco fora): modo sem extensão.
    r = SEM_RECURSOS;
  }
  cache = { em: agora, r };
  return r;
}

// ── Peças de SQL (exportadas para o teste) ──────────────────────────────────

/** Texto da coluna sem acento e minúsculo, do jeito que o índice foi criado. */
export function norm(coluna: Prisma.Sql, r: RecursosDoBanco): Prisma.Sql {
  return r.norm
    ? Prisma.sql`public.eva_studio_norm(${coluna})`
    : Prisma.sql`translate(lower(${coluna}), ${ACENTOS_DE}, ${ACENTOS_PARA})`;
}

/** Todo termo é começo de alguma palavra de alguma das colunas (E entre termos). */
export function condicaoDeTermos(colunas: Prisma.Sql[], termos: string[], r: RecursosDoBanco): Prisma.Sql {
  if (termos.length === 0 || colunas.length === 0) return Prisma.sql`FALSE`;
  const porTermo = termos.map((t) => {
    const e = escaparLike(t);
    const ou = colunas.map((c) => {
      const n = norm(c, r);
      return Prisma.sql`(${n} LIKE ${`${e}%`} OR ${n} LIKE ${`% ${e}%`})`;
    });
    return Prisma.sql`(${Prisma.join(ou, " OR ")})`;
  });
  return Prisma.sql`(${Prisma.join(porTermo, " AND ")})`;
}

/** Semelhança (erro de digitação): `consulta <% coluna` (word_similarity ≥ 0,6). */
export function condicaoDeSemelhanca(colunas: Prisma.Sql[], texto: string, r: RecursosDoBanco): Prisma.Sql {
  if (!r.trgm || !texto) return Prisma.sql`FALSE`;
  const op = Prisma.raw(`OPERATOR(${r.trgm}.<%)`);
  const ou = colunas.map((c) => Prisma.sql`${texto} ${op} ${norm(c, r)}`);
  return Prisma.sql`(${Prisma.join(ou, " OR ")})`;
}

/** Ordem por semelhança (maior primeiro), ou nada sem pg_trgm. */
function ordemDeSemelhanca(coluna: Prisma.Sql, texto: string, r: RecursosDoBanco): Prisma.Sql {
  if (!r.trgm) return Prisma.empty;
  return Prisma.sql`${Prisma.raw(`${r.trgm}.word_similarity`)}(${texto}, ${norm(coluna, r)}) DESC,`;
}

/** AND <coluna> = ANY(donos), ou nada quando o escopo é "todos". */
export function filtroDeDonos(coluna: Prisma.Sql, donos: string[] | null): Prisma.Sql {
  return donos ? Prisma.sql`AND ${coluna} = ANY(${donos})` : Prisma.empty;
}

const SO_DIGITOS = (c: Prisma.Sql) => Prisma.sql`regexp_replace(${c}, '[^0-9]', '', 'g')`;

type Modo = "prefixo" | "semelhanca";

/** Primeiro termo (ou o texto inteiro) no começo do nome sobe na lista. */
function comecaCom(coluna: Prisma.Sql, c: ConsultaNormalizada, r: RecursosDoBanco): Prisma.Sql {
  return Prisma.sql`(${norm(coluna, r)} LIKE ${`${escaparLike(c.texto)}%`}) DESC,`;
}

export interface ParametrosDaBusca {
  orgId: string;
  c: ConsultaNormalizada;
  r: RecursosDoBanco;
  limite?: number;
}

export function sqlDeNegocios(p: ParametrosDaBusca, donos: string[] | null, modo: Modo = "prefixo"): Prisma.Sql {
  const { orgId, c, r } = p;
  // Nome do negócio OU nome da empresa dele. A empresa vai num IN (subconsulta)
  // e não num OR sobre o JOIN: assim cada lado usa o próprio índice trigram.
  const cond = (col: Prisma.Sql) =>
    modo === "semelhanca" ? condicaoDeSemelhanca([col], c.texto, r) : condicaoDeTermos([col], c.termos, r);
  const onde = Prisma.sql`(${cond(Prisma.sql`d."name"`)} OR d."companyId" IN (
      SELECT ce."id" FROM "eva_studio_companies" ce WHERE ce."orgId" = ${orgId} AND ${cond(Prisma.sql`ce."name"`)}))`;
  const ordem = modo === "semelhanca" ? ordemDeSemelhanca(Prisma.sql`d."name"`, c.texto, r) : comecaCom(Prisma.sql`d."name"`, c, r);
  return Prisma.sql`
    SELECT d."id", d."name", d."amountCents", s."name" AS "etapa", s."type" AS "tipoEtapa", co."name" AS "empresa"
      FROM "eva_studio_deals" d
      JOIN "eva_studio_pipeline_stages" s ON s."id" = d."stageId"
      LEFT JOIN "eva_studio_companies" co ON co."id" = d."companyId"
     WHERE d."orgId" = ${orgId}
       ${filtroDeDonos(Prisma.sql`d."ownerId"`, donos)}
       AND ${onde}
     ORDER BY ${ordem} (d."archivedAt" IS NULL AND d."closedAt" IS NULL) DESC, d."updatedAt" DESC
     LIMIT ${p.limite ?? LIMITE_POR_TIPO}`;
}

export function sqlDeContatos(p: ParametrosDaBusca, donos: string[] | null, modo: Modo = "prefixo"): Prisma.Sql {
  const { orgId, c, r } = p;
  let onde: Prisma.Sql;
  if (c.telefone) {
    // Qualquer trecho do número: telefone principal (legado com máscara
    // também), secundários (JSON) e id do canal (WhatsApp: 5511…@s.whatsapp.net).
    const trecho = `%${c.telefone}%`;
    onde = Prisma.sql`(
      ${SO_DIGITOS(Prisma.sql`ct."phone"`)} LIKE ${trecho}
      OR ct."phones"::text LIKE ${trecho}
      OR ct."id" IN (SELECT ch."contactId" FROM "eva_studio_contact_channels" ch WHERE ch."externalId" LIKE ${trecho})
    )`;
  } else {
    const colunas = [Prisma.sql`ct."name"`, Prisma.sql`ct."email"`];
    onde = modo === "semelhanca" ? condicaoDeSemelhanca([Prisma.sql`ct."name"`], c.texto, r) : condicaoDeTermos(colunas, c.termos, r);
    if (c.email && modo === "prefixo") {
      // E-mail secundário (JSON). O principal já entra pelos termos.
      onde = Prisma.sql`(${onde} OR lower(ct."emails"::text) LIKE ${`%${escaparLike(c.email)}%`})`;
    }
  }
  const ordem = modo === "semelhanca" ? ordemDeSemelhanca(Prisma.sql`ct."name"`, c.texto, r) : c.telefone ? Prisma.empty : comecaCom(Prisma.sql`ct."name"`, c, r);
  return Prisma.sql`
    SELECT ct."id", ct."name", ct."email", ct."phone", co."name" AS "empresa",
           -- Conversa de WhatsApp mais recente (para "Enviar WhatsApp para…" abrir o inbox).
           (SELECT cv."id" FROM "eva_studio_conversations" cv
             WHERE cv."contactRecordId" = ct."id" AND cv."channel" = ANY(${CANAIS_WHATSAPP})
             ORDER BY cv."lastMessageAt" DESC LIMIT 1) AS "conversaId"
      FROM "eva_studio_contacts" ct
      LEFT JOIN "eva_studio_companies" co ON co."id" = ct."companyId"
     WHERE ct."orgId" = ${orgId}
       ${filtroDeDonos(Prisma.sql`ct."ownerId"`, donos)}
       AND ${onde}
     ORDER BY ${ordem} ct."lastSeenAt" DESC
     LIMIT ${p.limite ?? LIMITE_POR_TIPO}`;
}

export function sqlDeEmpresas(p: ParametrosDaBusca, modo: Modo = "prefixo"): Prisma.Sql {
  const { orgId, c, r } = p;
  const partes: Prisma.Sql[] = [];
  if (modo === "semelhanca") partes.push(condicaoDeSemelhanca([Prisma.sql`co."name"`], c.texto, r));
  else {
    if (!c.cnpj && !c.telefone) partes.push(condicaoDeTermos([Prisma.sql`co."name"`], c.termos, r));
    // CNPJ colado com pontuação: compara só os dígitos, pelo começo.
    if (c.cnpj) partes.push(Prisma.sql`${SO_DIGITOS(Prisma.sql`co."cnpj"`)} LIKE ${`${c.cnpj}%`}`);
    if (c.telefone) partes.push(Prisma.sql`${SO_DIGITOS(Prisma.sql`co."phone"`)} LIKE ${`%${c.telefone}%`}`);
  }
  const ordem = modo === "semelhanca" ? ordemDeSemelhanca(Prisma.sql`co."name"`, c.texto, r) : comecaCom(Prisma.sql`co."name"`, c, r);
  return Prisma.sql`
    SELECT co."id", co."name", co."cnpj", co."city", co."uf"
      FROM "eva_studio_companies" co
     WHERE co."orgId" = ${orgId}
       AND (${Prisma.join(partes, " OR ")})
     ORDER BY ${ordem} co."updatedAt" DESC
     LIMIT ${p.limite ?? LIMITE_POR_TIPO}`;
}

/** Janela das notas: 1 ano. Mensagens: 90 dias (a tabela que mais cresce). */
export const JANELA_DAS_NOTAS_DIAS = 365;
export const JANELA_DAS_MENSAGENS_DIAS = 90;
/** Canais de WhatsApp (a busca em mensagens é de WhatsApp). */
const CANAIS_WHATSAPP = ["whatsapp_qr", "whatsapp_meta"];

export function sqlDeNotas(
  p: ParametrosDaBusca,
  donos: { negocios: string[] | null; contatos: string[] | null },
  desde: Date
): Prisma.Sql {
  const { orgId, c, r } = p;
  // Nota de negócio fora do escopo (ou de contato fora do escopo) não aparece.
  const escNeg = donos.negocios ? Prisma.sql`AND (n."dealId" IS NULL OR d."ownerId" = ANY(${donos.negocios}))` : Prisma.empty;
  const escCont = donos.contatos ? Prisma.sql`AND (n."contactId" IS NULL OR ct."ownerId" = ANY(${donos.contatos}))` : Prisma.empty;
  return Prisma.sql`
    SELECT n."id", n."text", n."createdAt", n."dealId", n."contactId", d."name" AS "negocio", ct."name" AS "contato"
      FROM "eva_studio_notes" n
      LEFT JOIN "eva_studio_deals" d ON d."id" = n."dealId"
      LEFT JOIN "eva_studio_contacts" ct ON ct."id" = n."contactId"
     WHERE n."orgId" = ${orgId}
       AND n."createdAt" >= ${desde}
       ${escNeg}
       ${escCont}
       AND ${condicaoDeTermos([Prisma.sql`n."text"`], c.termos, r)}
     ORDER BY n."createdAt" DESC
     LIMIT ${p.limite ?? LIMITE_POR_TIPO}`;
}

export function sqlDeMensagens(p: ParametrosDaBusca, atendentes: string[] | null, desde: Date): Prisma.Sql {
  const { orgId, c, r } = p;
  return Prisma.sql`
    SELECT m."id", m."text", m."createdAt", m."role", cv."id" AS "conversaId", ct."name" AS "contato", cv."contactId" AS "externo"
      FROM "eva_studio_messages" m
      JOIN "eva_studio_conversations" cv ON cv."id" = m."conversationId"
      JOIN "eva_studio_agents" a ON a."id" = cv."agentId"
      LEFT JOIN "eva_studio_contacts" ct ON ct."id" = cv."contactRecordId"
     WHERE a."orgId" = ${orgId}
       AND cv."channel" = ANY(${CANAIS_WHATSAPP})
       AND m."createdAt" >= ${desde}
       ${filtroDeDonos(Prisma.sql`cv."assignedToId"`, atendentes)}
       AND ${condicaoDeTermos([Prisma.sql`m."text"`], c.termos, r)}
     ORDER BY m."createdAt" DESC
     LIMIT ${p.limite ?? LIMITE_POR_TIPO}`;
}

// ── Execução ────────────────────────────────────────────────────────────────

type Ctx = Pick<SessionContext, "userId" | "orgId" | "escopo" | "role" | "permissoes">;

/** Que tipos a pessoa pode buscar (pedido ∩ permissões). */
export function tiposPermitidos(ctx: Pick<SessionContext, "role" | "permissoes">, pedidos: readonly TipoDeBusca[]): TipoDeBusca[] {
  const exige: Record<TipoDeBusca, Parameters<typeof ctxPode>[1]> = {
    negocios: "negocios:ver",
    contatos: "contatos:ver",
    empresas: "empresas:ver",
    notas: "tarefas:ver",
    mensagens: "conversas:ver",
  };
  return pedidos.filter((t) => ctxPode(ctx, exige[t]));
}

/** Teto de 1,5 s por consulta de texto livre (notas/mensagens): melhor vazio que lento. */
async function comTeto<T>(sql: Prisma.Sql): Promise<T[]> {
  return prisma.$transaction(async (tx) => {
    // SET LOCAL vale só nesta transação (seguro com o pooler em modo transação).
    await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
    return tx.$queryRaw<T[]>(sql);
  });
}

/** Prefixo; se não achou nada e há pg_trgm, uma volta por semelhança. */
async function comSemelhanca<T>(
  r: RecursosDoBanco,
  c: ConsultaNormalizada,
  prefixo: () => Prisma.Sql,
  semelhanca: () => Prisma.Sql
): Promise<{ linhas: T[]; aproximado: boolean }> {
  const linhas = await prisma.$queryRaw<T[]>(prefixo());
  if (linhas.length || !r.trgm || c.telefone || c.cnpj || c.email || c.texto.length < 3) return { linhas, aproximado: false };
  return { linhas: await prisma.$queryRaw<T[]>(semelhanca()), aproximado: true };
}

const diasAtras = (agora: Date, dias: number) => new Date(agora.getTime() - dias * 86_400_000);

export async function buscarTudo(
  ctx: Ctx,
  c: ConsultaNormalizada,
  pedidos: readonly TipoDeBusca[],
  agora = new Date()
): Promise<ResultadoDaBusca> {
  const resultado: ResultadoDaBusca = { ...RESULTADO_VAZIO, avisos: [] };
  if (c.vazia) return resultado;
  const tipos = new Set(tiposPermitidos(ctx, pedidos));
  const r = await recursosDoBanco();
  resultado.modo = { semAcento: r.norm ? "unaccent" : "translate", similaridade: !!r.trgm };
  const p: ParametrosDaBusca = { orgId: ctx.orgId, c, r };

  const [donosNeg, donosCont, donosConv] = await Promise.all([
    tipos.has("negocios") || tipos.has("notas") ? donosVisiveis(ctx, "negocios") : null,
    tipos.has("contatos") || tipos.has("notas") ? donosVisiveis(ctx, "contatos") : null,
    tipos.has("mensagens") ? donosVisiveis(ctx, "conversas") : null,
  ]);

  const tarefas: Promise<void>[] = [];

  if (tipos.has("negocios") && !c.cnpj && !c.telefone) {
    tarefas.push(
      comSemelhanca<LinhaDeNegocio>(r, c, () => sqlDeNegocios(p, donosNeg), () => sqlDeNegocios(p, donosNeg, "semelhanca")).then(
        ({ linhas, aproximado }) => {
          resultado.negocios = linhas.map((l) => negocioEncontrado(l, aproximado));
        }
      )
    );
  }
  if (tipos.has("contatos")) {
    tarefas.push(
      comSemelhanca<LinhaDeContato>(r, c, () => sqlDeContatos(p, donosCont), () => sqlDeContatos(p, donosCont, "semelhanca")).then(
        ({ linhas, aproximado }) => {
          resultado.contatos = linhas.map((l) => contatoEncontrado(l, aproximado));
        }
      )
    );
  }
  if (tipos.has("empresas")) {
    tarefas.push(
      comSemelhanca<LinhaDeEmpresa>(r, c, () => sqlDeEmpresas(p), () => sqlDeEmpresas(p, "semelhanca")).then(({ linhas, aproximado }) => {
        resultado.empresas = linhas.map((l) => empresaEncontrada(l, aproximado));
      })
    );
  }
  // Notas e mensagens só com texto (telefone/CNPJ/e-mail não estão no corpo).
  const textoLivre = !c.telefone && !c.cnpj && !c.email;
  if (tipos.has("notas") && textoLivre) {
    tarefas.push(
      comTeto<LinhaDeNota>(sqlDeNotas(p, { negocios: donosNeg, contatos: donosCont }, diasAtras(agora, JANELA_DAS_NOTAS_DIAS)))
        .then((linhas) => {
          resultado.notas = linhas.map((l) => notaEncontrada(l, c.termos));
        })
        .catch(() => {
          resultado.avisos.push("A busca em notas demorou demais e foi interrompida.");
        })
    );
  }
  if (tipos.has("mensagens") && textoLivre) {
    tarefas.push(
      comTeto<LinhaDeMensagem>(sqlDeMensagens(p, donosConv, diasAtras(agora, JANELA_DAS_MENSAGENS_DIAS)))
        .then((linhas) => {
          resultado.mensagens = linhas.map((l) => mensagemEncontrada(l, c.termos));
        })
        .catch(() => {
          resultado.avisos.push("A busca em mensagens demorou demais e foi interrompida.");
        })
    );
  }

  await Promise.all(tarefas);
  return resultado;
}

// ── Linha do banco → linha da paleta ────────────────────────────────────────

interface LinhaDeNegocio {
  id: string;
  name: string;
  amountCents: number;
  etapa: string;
  tipoEtapa: string;
  empresa: string | null;
}
interface LinhaDeContato {
  id: string;
  name: string;
  email: string;
  phone: string;
  empresa: string | null;
  conversaId?: string | null;
}
interface LinhaDeEmpresa {
  id: string;
  name: string;
  cnpj: string;
  city: string;
  uf: string;
}
interface LinhaDeNota {
  id: string;
  text: string;
  createdAt: Date;
  dealId: string | null;
  contactId: string | null;
  negocio: string | null;
  contato: string | null;
}
interface LinhaDeMensagem {
  id: string;
  text: string;
  createdAt: Date;
  role: string;
  conversaId: string;
  contato: string | null;
  externo: string;
}

export function negocioEncontrado(l: LinhaDeNegocio, aproximado = false): RegistroEncontrado {
  const fechado = l.tipoEtapa === "won" ? "ganho" : l.tipoEtapa === "lost" ? "perdido" : null;
  return {
    tipo: "negocio",
    id: l.id,
    titulo: l.name || "Negócio sem nome",
    subtitulo: subtituloDoNegocio({ empresa: l.empresa, etapa: l.etapa, amountCents: Number(l.amountCents), fechado }),
    caminho: `/deals/${encodeURIComponent(l.id)}`,
    ...(aproximado ? { aproximado } : {}),
  };
}

export function contatoEncontrado(l: LinhaDeContato, aproximado = false): RegistroEncontrado {
  return {
    tipo: "contato",
    id: l.id,
    titulo: l.name || l.phone || l.email || "Contato sem nome",
    subtitulo: subtituloDoContato({ phone: l.phone, email: l.email, empresa: l.empresa }),
    caminho: `/contacts?open=${encodeURIComponent(l.id)}`,
    ...(l.phone ? { telefone: l.phone } : {}),
    ...(l.conversaId ? { conversaId: l.conversaId } : {}),
    ...(aproximado ? { aproximado } : {}),
  };
}

export function empresaEncontrada(l: LinhaDeEmpresa, aproximado = false): RegistroEncontrado {
  return {
    tipo: "empresa",
    id: l.id,
    titulo: l.name || "Empresa sem nome",
    subtitulo: subtituloDaEmpresa(l),
    caminho: `/companies/${encodeURIComponent(l.id)}`,
    ...(aproximado ? { aproximado } : {}),
  };
}

export function notaEncontrada(l: LinhaDeNota, termos: string[]): TrechoEncontrado {
  const onde = l.negocio ? `Negócio ${l.negocio}` : l.contato ? l.contato : "";
  return {
    tipo: "nota",
    id: l.id,
    titulo: onde ? `Nota · ${onde}` : "Nota",
    trecho: trechoComDestaque(l.text, termos),
    caminho: l.dealId
      ? `/deals/${encodeURIComponent(l.dealId)}`
      : `/contacts?open=${encodeURIComponent(l.contactId ?? "")}`,
    quando: new Date(l.createdAt).toISOString(),
  };
}

export function mensagemEncontrada(l: LinhaDeMensagem, termos: string[]): TrechoEncontrado {
  const quem = l.contato || l.externo.replace(/@.*$/, "");
  const autor = l.role === "contact" ? "" : l.role === "note" ? " · nota interna" : " · enviada";
  return {
    tipo: "mensagem",
    id: l.id,
    titulo: `WhatsApp · ${quem}${autor}`,
    trecho: trechoComDestaque(l.text, termos),
    caminho: `/conversations?c=${encodeURIComponent(l.conversaId)}`,
    quando: new Date(l.createdAt).toISOString(),
  };
}
