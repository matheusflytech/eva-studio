import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CANAIS_DE_TESTE } from "@/lib/server/conversas";
import { ROTULO_CANAL, SEM_VALOR, type FiltrosGlobais } from "@/lib/consulta";
import { DDDS_DA_UF, UFS } from "@/lib/ddd";
import { dataExiste } from "@/lib/custom-fields";
import { INFO_DO_TIPO } from "@/lib/tarefas/tipos";
import {
  DATASET_BY_KEY,
  GRAIN_LABEL,
  OPS_POR_TIPO,
  camposDoDataset,
  colunasEfetivas,
  rotuloDaMetrica,
  tipoDaMetrica,
  type CampoPersonalizado,
  type FieldType,
  type ReportColumn,
  type ReportFilter,
  type ReportQuery,
  type ReportResult,
} from "@/lib/report-query";

// ---------------------------------------------------------------------------
// Motor do construtor de cartões (v2): transforma uma ReportQuery já saneada
// em UM SELECT agregado no banco. Toda base começa com a condição do contrato
// (orgId) e toda expressão vem deste arquivo; da tela só entram valores, como
// parâmetro. Datas são timestamp sem fuso guardando UTC: tudo que o usuário vê
// ou filtra passa para o horário de São Paulo antes.
// ---------------------------------------------------------------------------

const raw = Prisma.raw;
const sql = Prisma.sql;

/** Coluna UTC → horário de São Paulo. */
const local = (col: string) => raw(`(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')`);
const HOJE = raw(`(now() AT TIME ZONE 'America/Sao_Paulo')::date`);
const texto = (col: string) => raw(`NULLIF(${col}, '')`);
const reais = (col: string) => raw(`(${col} / 100.0)::float8`);

/** CASE que troca o código gravado pelo rótulo em português (o resto passa como está). */
function rotular(col: string, mapa: Record<string, string>): Prisma.Sql {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const casos = Object.entries(mapa).map(([k, v]) => `WHEN ${q(k)} THEN ${q(v)}`).join(" ");
  return raw(`(CASE ${col} ${casos} ELSE NULLIF(${col}, '') END)`);
}

const ROTULO_TIPO_DE_TAREFA = Object.fromEntries(
  [...Object.entries(INFO_DO_TIPO).map(([k, v]) => [k, v.rotulo]), ["outro", "A fazer"]]
) as Record<string, string>;
const ROTULO_SITUACAO_CONVERSA = { active: "Com o agente", waiting_human: "Esperando atendente", human: "Com atendente", ended: "Encerrada" };
const ROTULO_QUEM_MANDOU = { contact: "Cliente", bot: "Agente", human: "Atendente", note: "Nota interna" };
const ROTULO_ANEXO = { image: "Imagem", audio: "Áudio", video: "Vídeo", document: "Documento", sticker: "Figurinha" };
const ROTULO_ENTREGA = { sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou", pending: "Pendente" };
const ROTULO_DISPARO = { scheduled: "Agendado", sending: "Enviando", done: "Concluído", canceled: "Cancelado" };
const ROTULO_TIPO_DISPARO = { campaign: "Campanha", single: "Individual" };
const ROTULO_ORIGEM_ETAPA = { usuario: "Pessoa", fluxo: "Fluxo", api: "API", importacao: "Importação", backfill: "Histórico" };
const ROTULO_RECORRENCIA = { unico: "Único", mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };
const ROTULO_PAPEL = { owner: "Dono", admin: "Administrador", agent: "Atendente", viewer: "Leitor" };
const ROTULO_MEMBRO = { ativo: "Ativo", convidado: "Convidado" };

/** DDD do telefone: só dígitos, sem o 55 do país; o que não parece telefone do Brasil fica vazio. */
function dddDo(col: string): Prisma.Sql {
  const d = `regexp_replace(COALESCE(${col}, ''), '[^0-9]', '', 'g')`;
  return raw(`(CASE WHEN length(${d}) IN (12, 13) AND left(${d}, 2) = '55' THEN substr(${d}, 3, 2)
    WHEN length(${d}) IN (10, 11) THEN left(${d}, 2) END)`);
}
/** UF pelo DDD (tabela da Anatel em src/lib/ddd.ts). */
function ufPeloDdd(col: string): Prisma.Sql {
  const casos = UFS.flatMap((uf) => DDDS_DA_UF(uf).map((d) => `WHEN '${d}' THEN '${uf}'`)).join(" ");
  return sql`(CASE ${dddDo(col)} ${raw(casos)} END)`;
}

const SITUACAO_DO_NEGOCIO = raw(`(CASE ds.type WHEN 'won' THEN 'Ganho' WHEN 'lost' THEN 'Perdido' ELSE 'Em aberto' END)`);

// Negócio (alias d) com funil, etapa e responsável: base de várias junções.
const JOIN_DO_NEGOCIO = `
  JOIN eva_studio_pipelines dp ON dp.id = d."pipelineId"
  JOIN eva_studio_pipeline_stages ds ON ds.id = d."stageId"
  LEFT JOIN eva_studio_profiles dow ON dow.id = d."ownerId"`;

const CAMPOS_DO_NEGOCIO: Record<string, Prisma.Sql> = {
  deal_name: raw(`d.name`),
  deal_pipeline: raw(`dp.name`),
  deal_stage: raw(`ds.name`),
  deal_status: SITUACAO_DO_NEGOCIO,
  deal_owner: raw(`dow.name`),
  deal_amount: reais(`d."amountCents"`),
  deal_created: local(`d."createdAt"`),
  deal_closed: local(`d."closedAt"`),
};

// Uma linha por opção marcada num campo de múltipla escolha (alias mcf, mv).
// A chave do JSON liga ao campo; a opção mostra o rótulo (ou o valor, se a
// opção foi apagada do campo).
const opcoesMarcadas = (json: string, entity: "deal" | "contact", org: string) => `
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(${json}) = 'object' THEN ${json} ELSE '{}'::jsonb END) mkv
  JOIN eva_studio_custom_fields mcf ON mcf."orgId" = ${org} AND mcf.entity = '${entity}' AND mcf.key = mkv.key AND mcf.type = 'multiselect'
  CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(mkv.value) = 'array' THEN mkv.value ELSE '[]'::jsonb END) mv(v)`;
const ROTULO_DA_OPCAO = raw(`COALESCE((SELECT o ->> 'label' FROM jsonb_array_elements(
  CASE WHEN jsonb_typeof(mcf.options) = 'array' THEN mcf.options ELSE '[]'::jsonb END) o WHERE o ->> 'value' = mv.v LIMIT 1), NULLIF(mv.v, ''))`);

interface Base {
  /** FROM ... WHERE <condição do contrato> (sem filtros da pessoa). */
  from: (orgId: string) => Prisma.Sql;
  fields: Record<string, Prisma.Sql>;
  /** Coluna JSON dos campos personalizados. */
  cf?: string;
  /** Colunas de id para os filtros de funil e responsável da barra do painel. */
  escopo?: { funil: string; dono: string };
}

const ESCOPO_DO_NEGOCIO = { funil: `d."pipelineId"`, dono: `d."ownerId"` };

const BASES: Record<string, Base> = {
  deals: {
    escopo: ESCOPO_DO_NEGOCIO,
    from: (org) => sql`FROM eva_studio_deals d ${raw(JOIN_DO_NEGOCIO)}
      LEFT JOIN eva_studio_companies dco ON dco.id = d."companyId"
      WHERE d."orgId" = ${org} AND d."archivedAt" IS NULL`,
    cf: `d."customFields"`,
    fields: {
      name: raw(`d.name`),
      pipeline: raw(`dp.name`),
      stage: raw(`ds.name`),
      status: SITUACAO_DO_NEGOCIO,
      owner: raw(`dow.name`),
      company: raw(`dco.name`),
      category: texto(`d.category`),
      amount: reais(`d."amountCents"`),
      weighted: raw(`(d."amountCents" * d.probability / 10000.0)::float8`),
      probability: raw(`d.probability::float8`),
      lost_reason: texto(`d."lostReason"`),
      created: local(`d."createdAt"`),
      closed: local(`d."closedAt"`),
      expected: local(`d."expectedClosingAt"`),
      days_in_stage: raw(`floor(extract(epoch FROM (now() AT TIME ZONE 'UTC') - d."stageSince") / 86400)::float8`),
    },
  },
  contacts: {
    from: (org) => sql`FROM eva_studio_contacts c
      LEFT JOIN eva_studio_companies cco ON cco.id = c."companyId"
      LEFT JOIN eva_studio_profiles cow ON cow.id = c."ownerId"
      WHERE c."orgId" = ${org}`,
    cf: `c."customFields"`,
    fields: {
      name: texto(`c.name`),
      email: texto(`c.email`),
      phone: texto(`c.phone`),
      ddd: dddDo(`c.phone`),
      ddd_uf: ufPeloDdd(`c.phone`),
      job_title: texto(`c."jobTitle"`),
      company: raw(`cco.name`),
      owner: raw(`cow.name`),
      source: texto(`c.source`),
      lead_stage: texto(`c."leadStage"`),
      lead_channel: rotular(`c."leadChannel"`, ROTULO_CANAL),
      opt_in: raw(`c."optIn"`),
      created: local(`c."createdAt"`),
      lead_at: local(`c."leadAt"`),
      last_seen: local(`c."lastSeenAt"`),
    },
  },
  companies: {
    from: (org) => sql`FROM eva_studio_companies co
      LEFT JOIN eva_studio_profiles coow ON coow.id = co."ownerId"
      WHERE co."orgId" = ${org}`,
    fields: {
      name: raw(`co.name`),
      cnpj: texto(`co.cnpj`),
      sector: texto(`co.sector`),
      size: raw(`co.size::float8`),
      city: texto(`co.city`),
      uf: texto(`co.uf`),
      owner: raw(`coow.name`),
      created: local(`co."createdAt"`),
    },
  },
  tasks: {
    from: (org) => sql`FROM eva_studio_tasks t
      LEFT JOIN eva_studio_profiles tas ON tas.id = t."assignedToId"
      WHERE t."orgId" = ${org}`,
    fields: {
      type: rotular(`t.type`, ROTULO_TIPO_DE_TAREFA),
      text: raw(`t.text`),
      status: raw(`(CASE WHEN t."doneAt" IS NOT NULL THEN 'Concluída' WHEN t."dueAt" < (now() AT TIME ZONE 'UTC') THEN 'Atrasada' ELSE 'Pendente' END)`),
      assignee: raw(`tas.name`),
      due: local(`t."dueAt"`),
      done: local(`t."doneAt"`),
      created: local(`t."createdAt"`),
    },
  },
  products: {
    from: (org) => sql`FROM eva_studio_products p WHERE p."orgId" = ${org}`,
    fields: {
      name: raw(`p.name`),
      sku: texto(`p.sku`),
      category: texto(`p.category`),
      price: reais(`p."priceCents"`),
      unit: texto(`p.unit`),
      recurrence: rotular(`p.recurrence`, ROTULO_RECORRENCIA),
      archived: raw(`(p."archivedAt" IS NOT NULL)`),
      created: local(`p."createdAt"`),
    },
  },
  deal_stage_events: {
    escopo: { funil: `e."pipelineId"`, dono: `d."ownerId"` },
    from: (org) => sql`FROM eva_studio_deal_stage_events e
      JOIN eva_studio_deals d ON d.id = e."dealId"
      JOIN eva_studio_pipelines ep ON ep.id = e."pipelineId"
      LEFT JOIN eva_studio_pipeline_stages ef ON ef.id = e."fromStageId"
      JOIN eva_studio_pipeline_stages et ON et.id = e."toStageId"
      WHERE e."orgId" = ${org}`,
    fields: {
      deal_name: raw(`d.name`),
      pipeline: raw(`ep.name`),
      from_stage: raw(`ef.name`),
      to_stage: raw(`et.name`),
      origin: rotular(`e.origem`, ROTULO_ORIGEM_ETAPA),
      at: local(`e.at`),
    },
  },
  deal_losses: {
    escopo: { funil: `l."pipelineId"`, dono: `d."ownerId"` },
    from: (org) => sql`FROM eva_studio_deal_losses l
      JOIN eva_studio_deals d ON d.id = l."dealId"
      JOIN eva_studio_pipelines lp ON lp.id = l."pipelineId"
      LEFT JOIN eva_studio_profiles dow ON dow.id = d."ownerId"
      WHERE l."orgId" = ${org}`,
    fields: {
      reason: raw(`l."reasonLabel"`),
      note: texto(`l.note`),
      pipeline: raw(`lp.name`),
      deal_name: raw(`d.name`),
      deal_owner: raw(`dow.name`),
      deal_amount: reais(`d."amountCents"`),
      lost_at: local(`l."lostAt"`),
    },
  },
  deals_tasks: {
    escopo: ESCOPO_DO_NEGOCIO,
    from: (org) => sql`FROM eva_studio_tasks t
      JOIN eva_studio_deals d ON d.id = t."dealId" ${raw(JOIN_DO_NEGOCIO)}
      LEFT JOIN eva_studio_profiles tas ON tas.id = t."assignedToId"
      WHERE d."orgId" = ${org} AND d."archivedAt" IS NULL`,
    fields: {
      ...CAMPOS_DO_NEGOCIO,
      task_type: rotular(`t.type`, ROTULO_TIPO_DE_TAREFA),
      task_text: raw(`t.text`),
      task_status: raw(`(CASE WHEN t."doneAt" IS NOT NULL THEN 'Concluída' WHEN t."dueAt" < (now() AT TIME ZONE 'UTC') THEN 'Atrasada' ELSE 'Pendente' END)`),
      task_assignee: raw(`tas.name`),
      task_due: local(`t."dueAt"`),
      task_done: local(`t."doneAt"`),
    },
  },
  deals_products: {
    escopo: ESCOPO_DO_NEGOCIO,
    from: (org) => sql`FROM eva_studio_deal_items i
      JOIN eva_studio_deals d ON d.id = i."dealId" ${raw(JOIN_DO_NEGOCIO)}
      WHERE d."orgId" = ${org} AND d."archivedAt" IS NULL`,
    fields: {
      ...CAMPOS_DO_NEGOCIO,
      product: raw(`i.name`),
      sku: texto(`i.sku`),
      quantity: raw(`i.quantity::float8`),
      unit_price: reais(`i."unitPriceCents"`),
      total: reais(`i."totalCents"`),
      recurrence: rotular(`i.recurrence`, ROTULO_RECORRENCIA),
    },
  },
  deals_contacts: {
    escopo: ESCOPO_DO_NEGOCIO,
    from: (org) => sql`FROM eva_studio_deal_contacts dct
      JOIN eva_studio_deals d ON d.id = dct."dealId" ${raw(JOIN_DO_NEGOCIO)}
      JOIN eva_studio_contacts c ON c.id = dct."contactId"
      WHERE d."orgId" = ${org} AND d."archivedAt" IS NULL`,
    fields: {
      ...CAMPOS_DO_NEGOCIO,
      contact_name: texto(`c.name`),
      contact_email: texto(`c.email`),
      contact_phone: texto(`c.phone`),
      contact_ddd: dddDo(`c.phone`),
      contact_ddd_uf: ufPeloDdd(`c.phone`),
      contact_source: texto(`c.source`),
      role: texto(`dct.role`),
    },
  },
  deals_multiselect: {
    escopo: ESCOPO_DO_NEGOCIO,
    from: (org) => sql`FROM eva_studio_deals d ${raw(JOIN_DO_NEGOCIO)} ${raw(opcoesMarcadas(`d."customFields"`, "deal", `d."orgId"`))}
      WHERE d."orgId" = ${org} AND d."archivedAt" IS NULL`,
    fields: { field: raw(`mcf.label`), option: ROTULO_DA_OPCAO, ...CAMPOS_DO_NEGOCIO },
  },
  contacts_multiselect: {
    from: (org) => sql`FROM eva_studio_contacts c
      LEFT JOIN eva_studio_profiles cow ON cow.id = c."ownerId" ${raw(opcoesMarcadas(`c."customFields"`, "contact", `c."orgId"`))}
      WHERE c."orgId" = ${org}`,
    fields: {
      field: raw(`mcf.label`),
      option: ROTULO_DA_OPCAO,
      contact_name: texto(`c.name`),
      contact_source: texto(`c.source`),
      contact_owner: raw(`cow.name`),
      contact_created: local(`c."createdAt"`),
    },
  },
  contacts_tags: {
    from: (org) => sql`FROM eva_studio_contact_tags ct
      JOIN eva_studio_contacts c ON c.id = ct."contactId"
      JOIN eva_studio_tags tg ON tg.id = ct."tagId"
      WHERE c."orgId" = ${org}`,
    fields: {
      tag: raw(`tg.name`),
      contact_name: texto(`c.name`),
      contact_source: texto(`c.source`),
      contact_created: local(`c."createdAt"`),
      added_at: local(`ct."addedAt"`),
    },
  },
  // Conversas e mensagens sem os canais de teste (Playground, prévia do
  // builder): é você mesmo testando, e inflaria o volume.
  conversations: {
    from: (org) => sql`FROM eva_studio_conversations cv
      JOIN eva_studio_agents a ON a.id = cv."agentId"
      LEFT JOIN eva_studio_profiles cas ON cas.id = cv."assignedToId"
      WHERE a."orgId" = ${org} AND cv.channel <> ALL(${CANAIS_DE_TESTE})`,
    fields: {
      agent: raw(`a.name`),
      channel: rotular(`cv.channel`, ROTULO_CANAL),
      status: rotular(`cv.status`, ROTULO_SITUACAO_CONVERSA),
      assignee: raw(`cas.name`),
      lead_stage: texto(`cv."leadStage"`),
      created: local(`cv."createdAt"`),
      last_message: local(`cv."lastMessageAt"`),
    },
  },
  messages: {
    from: (org) => sql`FROM eva_studio_messages m
      JOIN eva_studio_conversations cv ON cv.id = m."conversationId"
      JOIN eva_studio_agents a ON a.id = cv."agentId"
      LEFT JOIN eva_studio_profiles mau ON mau.id = m."authorId"
      WHERE a."orgId" = ${org} AND cv.channel <> ALL(${CANAIS_DE_TESTE})`,
    fields: {
      role: rotular(`m.role`, ROTULO_QUEM_MANDOU),
      agent: raw(`a.name`),
      channel: rotular(`cv.channel`, ROTULO_CANAL),
      media: rotular(`m."mediaType"`, ROTULO_ANEXO),
      delivery: rotular(`m."deliveryStatus"`, ROTULO_ENTREGA),
      author: raw(`mau.name`),
      created: local(`m."createdAt"`),
    },
  },
  broadcasts: {
    from: (org) => sql`FROM eva_studio_broadcasts b
      JOIN eva_studio_agents a ON a.id = b."agentId"
      WHERE a."orgId" = ${org}`,
    fields: {
      agent: raw(`a.name`),
      channel: rotular(`b.channel`, ROTULO_CANAL),
      status: rotular(`b.status`, ROTULO_DISPARO),
      kind: rotular(`b.kind`, ROTULO_TIPO_DISPARO),
      total: raw(`b."totalCount"::float8`),
      sent: raw(`b."sentCount"::float8`),
      delivered: raw(`b."deliveredCount"::float8`),
      read: raw(`b."readCount"::float8`),
      failed: raw(`b."failedCount"::float8`),
      created: local(`b."createdAt"`),
    },
  },
  studio_events: {
    from: (org) => sql`FROM eva_studio_studio_events se
      JOIN eva_studio_agents a ON a.id = se."agentId"
      WHERE se."orgId" = ${org}`,
    fields: {
      agent: raw(`a.name`),
      category: raw(`se.category`),
      action: raw(`se.action`),
      value: texto(`se.value`),
      channel: rotular(`se.channel`, ROTULO_CANAL),
      created: local(`se."createdAt"`),
    },
  },
  users: {
    from: (org) => sql`FROM eva_studio_memberships mb
      JOIN eva_studio_profiles p ON p.id = mb."userId"
      WHERE mb."orgId" = ${org} AND mb.status <> 'removido'`,
    fields: {
      name: raw(`p.name`),
      email: raw(`p.email`),
      role: rotular(`mb.role`, ROTULO_PAPEL),
      status: rotular(`mb.status`, ROTULO_MEMBRO),
      created: local(`mb."createdAt"`),
    },
  },
  users_teams: {
    from: (org) => sql`FROM eva_studio_team_members tm
      JOIN eva_studio_teams tt ON tt.id = tm."teamId"
      JOIN eva_studio_profiles p ON p.id = tm."userId"
      LEFT JOIN eva_studio_profiles tl ON tl.id = tt."leaderId"
      WHERE tt."orgId" = ${org}`,
    fields: {
      team: raw(`tt.name`),
      user: raw(`p.name`),
      email: raw(`p.email`),
      leader: raw(`tl.name`),
      since: local(`tm."createdAt"`),
    },
  },
};

/** Expressão de um campo personalizado guardado no JSON `col`. */
function exprDoPersonalizado(col: string, c: CampoPersonalizado): Prisma.Sql {
  const k = sql`${c.key}::text`;
  const j = raw(col);
  switch (c.type) {
    case "number":
      return sql`(CASE WHEN jsonb_typeof(${j} -> ${k}) = 'number' THEN (${j} ->> ${k})::float8 END)`;
    case "currency":
      return sql`(CASE WHEN jsonb_typeof(${j} -> ${k}) = 'number' THEN (${j} ->> ${k})::float8 / 100 END)`;
    case "date":
      return sql`(CASE WHEN (${j} ->> ${k}) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (${j} ->> ${k})::timestamp END)`;
    case "checkbox":
      return sql`(CASE WHEN jsonb_typeof(${j} -> ${k}) = 'boolean' THEN (${j} ->> ${k})::boolean END)`;
    case "multiselect": {
      // Vários valores viram um texto só ("A, B"); uma linha por opção é a base "Opções marcadas".
      const rot = rotuloDeOpcoes(sql`x`, c);
      return sql`(SELECT string_agg(${rot}, ', ') FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(${j} -> ${k}) = 'array' THEN ${j} -> ${k} ELSE '[]'::jsonb END) x)`;
    }
    case "select":
      return rotuloDeOpcoes(sql`(${j} ->> ${k})`, c);
    default:
      return sql`NULLIF(${j} ->> ${k}, '')`;
  }
}

/** Valor gravado → rótulo da opção (valor e rótulo vão como parâmetro). */
function rotuloDeOpcoes(valor: Prisma.Sql, c: CampoPersonalizado): Prisma.Sql {
  const ops = (c.options ?? []).slice(0, 100);
  if (ops.length === 0) return sql`NULLIF(${valor}, '')`;
  return sql`(CASE ${valor} ${Prisma.join(ops.map((o) => sql`WHEN ${o.value} THEN ${o.label}`), " ")} ELSE NULLIF(${valor}, '') END)`;
}

interface Campo {
  key: string;
  label: string;
  type: FieldType;
  expr: Prisma.Sql;
}

function resolverCampos(q: ReportQuery, personalizados: CampoPersonalizado[]): Map<string, Campo> {
  const base = BASES[q.dataset];
  const defs = camposDoDataset(q.dataset, personalizados);
  const porChave = new Map(personalizados.map((c) => [c.key, c]));
  const mapa = new Map<string, Campo>();
  for (const d of defs) {
    if (d.key.startsWith("cf:")) {
      const c = porChave.get(d.key.slice(3));
      if (c && base.cf) mapa.set(d.key, { ...d, expr: exprDoPersonalizado(base.cf, c) });
    } else if (base.fields[d.key]) mapa.set(d.key, { ...d, expr: base.fields[d.key] });
  }
  return mapa;
}

const escaparLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const numero = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const inteiro = (s: string | undefined, max = 3650): number | null => {
  const n = numero(s);
  return n === null ? null : Math.min(Math.max(Math.floor(n), 0), max);
};
const dia = (s: string | undefined) => (s && dataExiste(s) ? s : null);

/** Uma condição em SQL, ou null se faltou valor (aí ela não filtra nada). */
function condicao(f: ReportFilter, c: Campo, globais?: FiltrosGlobais): Prisma.Sql | null {
  if (!OPS_POR_TIPO[c.type].includes(f.op)) return null;
  const e = c.expr;
  switch (f.op) {
    case "is_set":
      return c.type === "text" ? sql`NULLIF(${e}, '') IS NOT NULL` : sql`${e} IS NOT NULL`;
    case "is_empty":
      return c.type === "text" ? sql`NULLIF(${e}, '') IS NULL` : sql`${e} IS NULL`;
    case "is_true":
      return sql`${e} IS TRUE`;
    case "is_false":
      return sql`${e} IS NOT TRUE`;
  }

  if (c.type === "text") {
    const v = (f.value ?? "").trim();
    const lista = (f.values ?? []).map((x) => x.trim()).filter(Boolean);
    switch (f.op) {
      case "eq": return v ? sql`${e} = ${v}` : null;
      case "neq": return v ? sql`${e} IS DISTINCT FROM ${v}` : null;
      case "contains": return v ? sql`${e} ILIKE ${`%${escaparLike(v)}%`}` : null;
      case "not_contains": return v ? sql`COALESCE(${e}, '') NOT ILIKE ${`%${escaparLike(v)}%`}` : null;
      case "in": return lista.length ? sql`${e} = ANY(${lista}::text[])` : null;
      case "not_in": return lista.length ? sql`(${e} IS NULL OR NOT (${e} = ANY(${lista}::text[])))` : null;
    }
    return null;
  }

  if (c.type === "number" || c.type === "money") {
    const a = numero(f.value);
    if (a === null) return null;
    switch (f.op) {
      case "eq": return sql`${e} = ${a}`;
      case "neq": return sql`${e} IS DISTINCT FROM ${a}`;
      case "gt": return sql`${e} > ${a}`;
      case "gte": return sql`${e} >= ${a}`;
      case "lt": return sql`${e} < ${a}`;
      case "lte": return sql`${e} <= ${a}`;
      case "between": {
        const b = numero(f.to);
        return b === null ? null : sql`${e} BETWEEN ${Math.min(a, b)} AND ${Math.max(a, b)}`;
      }
    }
    return null;
  }

  // Data (já no horário de São Paulo). "Até" inclui o dia inteiro.
  const entre = (de: string, ate: string) => sql`(${e} >= ${de}::date AND ${e} < ${ate}::date + 1)`;
  switch (f.op) {
    case "panel": {
      if (!globais) return null;
      if (globais.de && globais.ate) return entre(globais.de, globais.ate);
      return sql`(${e} >= ${HOJE} - ${globais.dias - 1}::int AND ${e} < ${HOJE} + 1)`;
    }
    case "last_days": {
      const n = inteiro(f.value);
      return n === null ? null : sql`(${e} >= ${HOJE} - ${Math.max(n - 1, 0)}::int AND ${e} < ${HOJE} + 1)`;
    }
    case "next_days": {
      const n = inteiro(f.value);
      return n === null ? null : sql`(${e} >= ${HOJE} AND ${e} < ${HOJE} + ${n + 1}::int)`;
    }
    case "between": {
      const de = dia(f.value);
      const ate = dia(f.to);
      return de && ate ? (de <= ate ? entre(de, ate) : entre(ate, de)) : null;
    }
  }
  return null;
}

/** Funis e responsáveis escolhidos na barra do painel (só nas bases de negócio). */
function condicoesDoPainel(base: Base, globais?: FiltrosGlobais): Prisma.Sql {
  if (!base.escopo || !globais) return Prisma.empty;
  const partes: Prisma.Sql[] = [];
  if (globais.funis.length) partes.push(sql` AND ${raw(base.escopo.funil)} = ANY(${globais.funis}::text[])`);
  if (globais.donos.length) {
    const dono = raw(base.escopo.dono);
    const ids = globais.donos.filter((d) => d !== SEM_VALOR);
    const ou: Prisma.Sql[] = [];
    if (ids.length) ou.push(sql`${dono} = ANY(${ids}::text[])`);
    if (globais.donos.includes(SEM_VALOR)) ou.push(sql`${dono} IS NULL`);
    partes.push(sql` AND (${Prisma.join(ou, " OR ")})`);
  }
  return partes.length ? Prisma.join(partes, "") : Prisma.empty;
}

const FORMATO_DATA_HORA = `'YYYY-MM-DD HH24:MI'`;
const FORMATO_DIA = `'YYYY-MM-DD'`;

/** Expressão de saída: data vira texto já formatado, o resto passa direto. */
const saida = (c: Campo) => (c.type === "date" ? sql`to_char(${c.expr}, ${raw(FORMATO_DATA_HORA)})` : c.expr);

export interface ContextoDoRelatorio {
  personalizados?: CampoPersonalizado[];
  globais?: FiltrosGlobais;
}

/**
 * Monta o SELECT de uma consulta saneada. Puro (não toca no banco) para dar
 * para testar. Pede limit + 1 linhas: a sobra diz que o resultado foi cortado.
 */
export function montarSql(orgId: string, q: ReportQuery, ctx: ContextoDoRelatorio = {}): { sql: Prisma.Sql; columns: ReportColumn[] } | null {
  const base = BASES[q.dataset];
  if (!base || !DATASET_BY_KEY.has(q.dataset)) return null;
  const campos = resolverCampos(q, ctx.personalizados ?? []);
  const lista = [...campos.values()];

  const conds = q.filters.conditions
    .map((f) => {
      const c = campos.get(f.field);
      return c ? condicao(f, c, ctx.globais) : null;
    })
    .filter((x): x is Prisma.Sql => x !== null);
  const doPainel = condicoesDoPainel(base, ctx.globais);
  const filtro = sql`${conds.length ? sql` AND (${Prisma.join(conds, q.filters.logic === "or" ? " OR " : " AND ")})` : Prisma.empty}${doPainel}`;

  const groupBy = q.groupBy.filter((g) => campos.has(g.field));
  const metrics = q.metrics.filter((m) => m.op === "count" || campos.has(m.field ?? ""));
  const resumo = groupBy.length > 0 || metrics.length > 0;

  if (!resumo) {
    const chaves = colunasEfetivas(q, lista).filter((k) => campos.has(k));
    const cols = chaves.map((k) => campos.get(k)!);
    if (cols.length === 0) return null;
    const ordem = q.sort.filter((s) => campos.has(s.key));
    const padrao = campos.get("created") ?? lista.find((c) => c.type === "date");
    const orderBy = ordem.length
      ? sql` ORDER BY ${Prisma.join(ordem.map((s) => sql`${campos.get(s.key)!.expr} ${raw(s.dir === "asc" ? "ASC" : "DESC")} NULLS LAST`), ", ")}`
      : padrao
        ? sql` ORDER BY ${padrao.expr} DESC NULLS LAST`
        : Prisma.empty;
    return {
      sql: sql`SELECT ${Prisma.join(cols.map((c, i) => sql`${saida(c)} AS ${raw(`c${i}`)}`), ", ")} ${base.from(orgId)}${filtro}${orderBy} LIMIT ${q.limit + 1}`,
      columns: cols.map((c) => ({ key: c.key, label: c.label, type: c.type, role: "dimension" })),
    };
  }

  const select: Prisma.Sql[] = [];
  const columns: ReportColumn[] = [];
  groupBy.forEach((g, i) => {
    const c = campos.get(g.field)!;
    if (c.type === "date") {
      const grain = g.grain ?? "day";
      select.push(sql`to_char(date_trunc(${grain}, ${c.expr}), ${raw(FORMATO_DIA)}) AS ${raw(`c${i}`)}`);
      columns.push({ key: g.field, label: `${c.label} (por ${GRAIN_LABEL[grain]})`, type: "date", role: "dimension", grain });
    } else {
      select.push(sql`${c.expr} AS ${raw(`c${i}`)}`);
      columns.push({ key: g.field, label: c.label, type: c.type, role: "dimension" });
    }
  });
  const defs = lista.map(({ key, label, type }) => ({ key, label, type }));
  metrics.forEach((m, j) => {
    const alias = raw(`c${groupBy.length + j}`);
    const c = m.field ? campos.get(m.field) : undefined;
    let expr: Prisma.Sql;
    if (m.op === "count" || !c) expr = sql`COUNT(*)::float8`;
    else if (m.op === "count_distinct") expr = sql`COUNT(DISTINCT ${c.expr})::float8`;
    else if (c.type === "date" && (m.op === "min" || m.op === "max")) expr = sql`to_char(${raw(m.op.toUpperCase())}(${c.expr}), ${raw(FORMATO_DATA_HORA)})`;
    else if (m.op === "median") expr = sql`(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${c.expr}))::float8`;
    else expr = sql`${raw(m.op.toUpperCase())}(${c.expr})::float8`;
    select.push(sql`${expr} AS ${alias}`);
    columns.push({ key: `m${j}`, label: rotuloDaMetrica(m, defs), type: tipoDaMetrica(m, defs), role: "metric" });
  });

  // Ordem: a pedida; senão tempo em ordem cronológica; senão a 1ª métrica, maior primeiro.
  const ordem = q.sort
    .map((s) => {
      const i = /^m\d$/.test(s.key) ? groupBy.length + Number(s.key.slice(1)) : groupBy.findIndex((g) => g.field === s.key);
      return i >= 0 && i < columns.length ? sql`${raw(`c${i}`)} ${raw(s.dir === "asc" ? "ASC" : "DESC")} NULLS LAST` : null;
    })
    .filter((x): x is Prisma.Sql => x !== null);
  if (ordem.length === 0) {
    if (columns[0]?.role === "dimension" && columns[0].type === "date") ordem.push(raw(`c0 ASC NULLS LAST`));
    else if (metrics.length && groupBy.length) ordem.push(raw(`c${groupBy.length} DESC NULLS LAST`));
  }

  const agrupar = groupBy.length ? raw(` GROUP BY ${groupBy.map((_, i) => i + 1).join(", ")}`) : Prisma.empty;
  const orderBy = ordem.length ? sql` ORDER BY ${Prisma.join(ordem, ", ")}` : Prisma.empty;
  return {
    sql: sql`SELECT ${Prisma.join(select, ", ")} ${base.from(orgId)}${filtro}${agrupar}${orderBy} LIMIT ${q.limit + 1}`,
    columns,
  };
}

/** Campos personalizados da entidade da base, para resolver "cf:<chave>". */
export async function carregarPersonalizados(orgId: string, dataset: string): Promise<CampoPersonalizado[]> {
  const entity = DATASET_BY_KEY.get(dataset)?.customFields;
  if (!entity) return [];
  const linhas = await prisma.customField.findMany({
    where: { orgId, entity },
    select: { key: true, label: true, type: true, options: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const vistos = new Set<string>();
  return linhas
    .filter((l) => !vistos.has(l.key) && vistos.add(l.key))
    .map((l) => ({
      key: l.key,
      label: l.label,
      type: l.type,
      options: Array.isArray(l.options) ? (l.options as { value: string; label: string }[]).filter((o) => o && typeof o.value === "string") : [],
    }));
}

/** Roda a consulta: só leitura, com tempo máximo, numa transação própria. */
export async function rodarReportQuery(orgId: string, q: ReportQuery, globais?: FiltrosGlobais): Promise<ReportResult | null> {
  const personalizados = await carregarPersonalizados(orgId, q.dataset);
  const montado = montarSql(orgId, q, { personalizados, globais });
  if (!montado) return null;
  const linhas = await prisma.$transaction(async (tx) => {
    // SET LOCAL / SET TRANSACTION valem só nesta transação (o pooler reaproveita a conexão).
    await tx.$executeRawUnsafe(`SET TRANSACTION READ ONLY`);
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '8s'`);
    return tx.$queryRaw<Record<string, unknown>[]>(montado.sql);
  });
  const truncated = linhas.length > q.limit;
  const rows = linhas.slice(0, q.limit).map((l) =>
    montado.columns.map((_, i) => {
      const v = l[`c${i}`];
      if (v === null || v === undefined) return null;
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
      if (typeof v === "bigint") return Number(v);
      return String(v);
    })
  );
  return { columns: montado.columns, rows, truncated };
}
