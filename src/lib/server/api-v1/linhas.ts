import "server-only";
import type { Corpo } from "@/lib/server/api-validacao";
import { mapCaptureField } from "@/lib/server/contacts";
import { slugificar, type DefinicaoDeCampo } from "@/lib/custom-fields";
import { parseCsv } from "@/app/api/contacts/import/csv";
import { ErroApi } from "./http";
import { conferirCampos } from "./entrada";
import { CAMPOS_DE_CONTATO, acharContatoExistente, criarContato, lerDadosDeContato, upsertContato } from "./contatos";
import { CAMPOS_DE_NEGOCIO, lerDadosDeNegocio, upsertNegocio } from "./negocios";

// ---------------------------------------------------------------------------
// Uma linha de importação → o mesmo upsert da API síncrona. CSV vira objeto
// com as mesmas chaves do JSON (cabeçalho em inglês ou apelido em português);
// coluna desconhecida vira campo personalizado. Assim "duplicado", "inválido"
// e "campo obrigatório" significam a mesma coisa nos dois caminhos.
// ---------------------------------------------------------------------------

export type EntidadeDeLote = "contacts" | "deals";

export interface LinhaDeEntrada {
  /** Número da linha para o relatório: no CSV, a linha do arquivo (cabeçalho = 1). */
  row: number;
  record: Corpo;
}

const APELIDOS: Record<EntidadeDeLote, Record<string, string>> = {
  contacts: {
    cargo: "job_title",
    jobtitle: "job_title",
    idexterno: "external_id",
    externalid: "external_id",
    empresa_id: "company_id",
    companyid: "company_id",
    responsavel_id: "owner_id",
    ownerid: "owner_id",
    observacoes: "notes",
    notas: "notes",
    linkedin: "linkedin_url",
  },
  deals: {
    nome: "name",
    negocio: "name",
    titulo: "name",
    idexterno: "external_id",
    externalid: "external_id",
    valor: "amount",
    descricao: "description",
    funil_id: "pipeline_id",
    etapa_id: "stage_id",
    previsao: "expected_closing_at",
    previsao_de_fechamento: "expected_closing_at",
    responsavel_id: "owner_id",
    empresa_id: "company_id",
    contato_id: "contact_id",
    contato_email: "contact_email",
    contato_telefone: "contact_phone",
    contato_nome: "contact_name",
    contato_id_externo: "contact_external_id",
  },
};

/** Campos extras que a linha de negócio aceita para achar (ou criar) o contato. */
export const CAMPOS_DE_CONTATO_NO_NEGOCIO = ["contact_email", "contact_phone", "contact_name", "contact_external_id"] as const;

function camposConhecidos(entity: EntidadeDeLote): Set<string> {
  return new Set<string>(entity === "contacts" ? CAMPOS_DE_CONTATO : [...CAMPOS_DE_NEGOCIO, ...CAMPOS_DE_CONTATO_NO_NEGOCIO]);
}

/** Cabeçalho → chave do registro, ou { custom } para campo personalizado. */
function destinoDaColuna(entity: EntidadeDeLote, coluna: string, defs: DefinicaoDeCampo[]): { campo: string } | { custom: string } {
  const bruto = coluna.trim();
  const slug = slugificar(bruto);
  const conhecidos = camposConhecidos(entity);
  if (conhecidos.has(bruto)) return { campo: bruto };
  if (conhecidos.has(slug)) return { campo: slug };
  const apelido = APELIDOS[entity][slug] ?? APELIDOS[entity][slug.replace(/_/g, "")];
  if (apelido) return { campo: apelido };
  if (entity === "contacts") {
    const ficha = mapCaptureField(bruto);
    if (ficha) return { campo: ficha };
  }
  const def = defs.find((d) => d.key === bruto || d.key === slug || slugificar(d.label) === slug);
  return { custom: def ? def.key : bruto };
}

/** CSV inteiro → linhas como objetos. Linha 1 é o cabeçalho. */
export function linhasDoCsv(entity: EntidadeDeLote, texto: string, defs: DefinicaoDeCampo[]): LinhaDeEntrada[] {
  const rows = parseCsv(texto);
  if (rows.length < 2) throw new ErroApi(400, "invalid_csv", "O CSV precisa de um cabeçalho e pelo menos uma linha.");
  const destinos = rows[0].map((h) => destinoDaColuna(entity, h, defs));
  return rows.slice(1).map((cells, i) => {
    const record: Corpo = {};
    const custom: Record<string, unknown> = {};
    destinos.forEach((d, j) => {
      const v = (cells[j] ?? "").trim();
      if (!v) return;
      if ("campo" in d) record[d.campo] = d.campo === "contact_ids" || d.campo === "tag_ids" ? v.split("|").map((s) => s.trim()).filter(Boolean) : v;
      else custom[d.custom] = v;
    });
    if (Object.keys(custom).length > 0) record.custom_fields = custom;
    return { row: i + 2, record };
  });
}

/** Records JSON → linhas (número = posição 1-based na lista). */
export function linhasDoJson(records: unknown[]): LinhaDeEntrada[] {
  return records.map((r, i) => ({ row: i + 1, record: (r && typeof r === "object" && !Array.isArray(r) ? r : { __invalido: r }) as Corpo }));
}

export interface OpcoesDeLote {
  modo: "upsert" | "create";
  simular: boolean;
  tagIds?: string[];
  /** Números do funil/etapa no contrato (como no corpo da API). */
  pipelineId?: number;
  stageId?: number;
  /** Flag explícita: negócio existente muda de etapa sem os campos obrigatórios (registrado no histórico). */
  ignorarObrigatorios?: boolean;
}

export type ResultadoDaLinha = { result: "created" | "updated" | "unchanged"; id: string };

export async function processarLinha(orgId: string, entity: EntidadeDeLote, linha: LinhaDeEntrada, op: OpcoesDeLote): Promise<ResultadoDaLinha> {
  const record = { ...linha.record };
  if ("__invalido" in record) throw new ErroApi(400, "invalid_record", "Cada item de records precisa ser um objeto.");

  if (entity === "contacts") {
    conferirCampos(record, CAMPOS_DE_CONTATO);
    if (op.tagIds?.length) {
      const atuais = Array.isArray(record.tag_ids) ? (record.tag_ids as string[]) : [];
      record.tag_ids = [...new Set([...atuais, ...op.tagIds])];
    }
    const dados = await lerDadosDeContato(orgId, record);
    const r = await upsertContato(orgId, dados, { modo: op.modo, simular: op.simular, origem: "importacao" });
    return { result: r.result, id: r.id };
  }

  conferirCampos(record, [...CAMPOS_DE_NEGOCIO, ...CAMPOS_DE_CONTATO_NO_NEGOCIO]);
  const contato = {
    email: record.contact_email,
    phone: record.contact_phone,
    name: record.contact_name,
    external_id: record.contact_external_id,
  };
  for (const c of CAMPOS_DE_CONTATO_NO_NEGOCIO) delete record[c];
  if (op.pipelineId && record.pipeline_id === undefined && record.stage_id === undefined) record.pipeline_id = op.pipelineId;
  if (op.stageId && record.stage_id === undefined) record.stage_id = op.stageId;

  const dados = await lerDadosDeNegocio(orgId, record);
  // Contato do negócio pela identidade (id externo → e-mail → telefone); se
  // não existir, nasce junto — é o caso "planilha de negócios do ERP".
  if (contato.email !== undefined || contato.phone !== undefined || contato.external_id !== undefined) {
    const dc = await lerDadosDeContato(orgId, {
      ...(contato.email !== undefined ? { email: contato.email } : {}),
      ...(contato.phone !== undefined ? { phone: contato.phone } : {}),
      ...(contato.name !== undefined ? { name: contato.name } : {}),
      ...(contato.external_id !== undefined ? { external_id: contato.external_id } : {}),
    });
    const achado = await acharContatoExistente(orgId, { externalId: dc.externalId, source: dc.source, email: dc.email, phone: dc.phone });
    const contactId = achado ? achado.id : op.simular ? "" : (await criarContato(orgId, dc, { origem: "importacao" })).id;
    if (contactId) dados.contactIds = [...new Set([...(dados.contactIds ?? []), contactId])];
  }
  const r = await upsertNegocio(orgId, dados, { modo: op.modo, simular: op.simular, origem: "importacao", ignorarObrigatorios: op.ignorarObrigatorios });
  return { result: r.result, id: r.id };
}
