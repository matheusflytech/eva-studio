// ---------------------------------------------------------------------------
// Exemplos de resposta da API v1, com as mesmas chaves (e na mesma ordem) dos
// serializadores em src/lib/server/api-v1/*. Valores são fictícios.
// Ao mudar um serializador, mude o exemplo aqui também.
// ---------------------------------------------------------------------------

const CONTACT_ID = "3f6c2a9e-8b1d-4c7a-9e2f-1a5b7c9d0e21";
const COMPANY_ID = "8a1e4b7c-2d3f-4e5a-9b6c-7d8e9f0a1b2c";
const DEAL_ID = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const OWNER_ID = "c4d5e6f7-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const AGENT_ID = "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b";
const TAG_ID = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";

export const IDS = { CONTACT_ID, COMPANY_ID, DEAL_ID, OWNER_ID, AGENT_ID, TAG_ID };

/** Lista paginada com um item. */
export const list = (item: unknown, extra: Record<string, unknown> = {}) => ({ data: [item], has_more: false, next_cursor: null, ...extra });
export const one = (item: unknown, extra: Record<string, unknown> = {}) => ({ data: item, ...extra });

// contatos.ts → serializarContatos
export const CONTACT = {
  id: CONTACT_ID,
  external_id: "erp-123",
  name: "Ana Souza",
  email: "ana.souza@acme.com.br",
  phone: "+5511999998888",
  job_title: "Gerente de Compras",
  emails: [{ value: "ana.pessoal@gmail.com", label: "pessoal" }],
  phones: [],
  linkedin_url: "https://www.linkedin.com/in/anasouza",
  background: "",
  notes: "Prefere contato por WhatsApp.",
  custom_fields: { consumo_kwh: 480 },
  source: "api",
  opt_in: true,
  opted_out_at: null,
  lead_stage: "qualificado",
  company_id: COMPANY_ID,
  owner_id: OWNER_ID,
  tags: [{ id: TAG_ID, name: "Cliente VIP" }],
  channels: [{ agent_id: AGENT_ID, channel: "whatsapp_meta", external_id: "5511999998888" }],
  last_seen_at: "2026-10-20T14:32:10.000Z",
  created_at: "2026-10-18T09:15:00.000Z",
  updated_at: "2026-10-20T14:32:10.000Z",
};

// empresas.ts → serializarEmpresas
export const COMPANY = {
  id: COMPANY_ID,
  external_id: "erp-c1",
  name: "ACME Ltda",
  cnpj: "11222333000181",
  sector: "Indústria",
  size: 120,
  website: "https://acme.com.br",
  phone: "+55 11 3333-4444",
  linkedin_url: "https://www.linkedin.com/company/acme",
  address: "Av. Paulista, 1000",
  city: "São Paulo",
  uf: "SP",
  zipcode: "01310-100",
  description: "Fabricante de embalagens.",
  revenue: "R$ 10 mi/ano",
  owner_id: OWNER_ID,
  created_at: "2026-10-18T09:15:00.000Z",
  updated_at: "2026-10-20T14:32:10.000Z",
};

// negocios.ts → serializarNegocios
export const DEAL = {
  id: DEAL_ID,
  external_id: "erp-d77",
  name: "Contrato anual ACME",
  description: "Renovação com upgrade de plano.",
  category: "renovacao",
  pipeline_id: 1,
  stage_id: 3,
  status: "open",
  amount_cents: 1250000,
  currency: "BRL",
  probability: 60,
  lost_reason: "",
  expected_closing_at: "2026-11-30T00:00:00.000Z",
  closed_at: null,
  archived_at: null,
  stage_since: "2026-10-15T11:00:00.000Z",
  position: 0,
  company_id: COMPANY_ID,
  owner_id: OWNER_ID,
  contacts: [{ contact_id: CONTACT_ID, role: "decisor" }],
  custom_fields: {},
  created_at: "2026-10-10T13:00:00.000Z",
  updated_at: "2026-10-20T14:32:10.000Z",
};

// lixeira.ts → apagarPelaApi / restaurar
export const deleted = (id: string) => one({ id, deleted: true, trash: { expires_at: "2026-11-19T14:32:10.000Z" } });
export const restored = (id: string, warnings: string[] = []) => one({ id, restored: true, warnings });
export const tombstone = (id: string, external_id: string) => list({ id, external_id, deleted_at: "2026-10-20T14:32:10.000Z" });

// funis.ts → serializarEtapa / serializarFunil (deal_count só nas respostas de funil)
const stage = (id: number, name: string, position: number, probability: number, type: string, deal_count: number) => ({
  id,
  pipeline_id: 1,
  name,
  position,
  probability,
  type,
  color: "",
  deal_count,
});
export const PIPELINE = {
  id: 1,
  name: "Vendas",
  is_default: true,
  position: 0,
  deal_count: 12,
  stages: [
    stage(1, "Novo", 0, 10, "open", 5),
    stage(2, "Qualificado", 1, 30, "open", 2),
    stage(3, "Proposta", 2, 60, "open", 4),
    stage(4, "Negociação", 3, 80, "open", 1),
    stage(5, "Ganho", 4, 100, "won", 0),
    stage(6, "Perdido", 5, 0, "lost", 0),
  ],
  created_at: "2026-10-01T12:00:00.000Z",
};
export const STAGE = { id: 7, pipeline_id: 1, name: "Proposta", position: 4, probability: 60, type: "open", color: "" };

export const DEAL_HISTORY = { id: "e1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b", pipeline_id: 1, from_stage_id: 2, to_stage_id: 3, source: "api", at: "2026-10-20T14:32:10.000Z" };

export const CUSTOM_FIELD = {
  id: "f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b",
  entity: "deal",
  pipeline_id: null,
  key: "consumo_kwh",
  label: "Consumo (kWh)",
  type: "number",
  options: [],
  required: false,
  help_text: "Média dos últimos 12 meses",
  position: 0,
};

export const TAG = { id: TAG_ID, name: "Cliente VIP", color: "slate", created_at: "2026-10-01T12:00:00.000Z" };

export const ME = {
  contract: { id: "8d8d3a8c", name: "ACME Energia" },
  api_key: { id: "d4c3b2a1-0f9e-4d8c-b7a6-958473625140", name: "n8n produção", prefix: "evs_live_a1b2c3d4", scopes: ["contacts:*", "deals:read"] },
  api_version: "v1",
};

// tarefas-notas.ts → serializarTarefa / serializarNota
export const TASK = {
  id: "7c1e4b2a-93d5-4f6e-8a10-2b3c4d5e6f70",
  type: "ligar",
  text: "Ligar para confirmar a proposta",
  due_at: "2026-10-22T14:00:00.000Z",
  done: false,
  done_at: null,
  contact_id: CONTACT_ID,
  deal_id: DEAL_ID,
  assigned_to_id: OWNER_ID,
  created_at: "2026-10-20T14:32:10.000Z",
  updated_at: "2026-10-20T14:32:10.000Z",
};
export const NOTE = {
  id: "e3f1a2b4-5c6d-4e7f-8a9b-1c2d3e4f5a6b",
  text: "Cliente pediu desconto.",
  contact_id: null,
  deal_id: DEAL_ID,
  author_id: null,
  attachments: [],
  created_at: "2026-10-20T14:32:10.000Z",
};

// webhooks/endpoints.ts → serializarEndpoint
export const WEBHOOK = {
  id: "0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
  url: "https://seu-n8n.com/webhook/abc",
  description: "n8n",
  events: ["deal.stage_changed", "deal.won"],
  active: true,
  source: "api",
  disabled_reason: null,
  failing_since: null,
  last_success_at: "2026-10-20T14:32:10.000Z",
  created_at: "2026-10-18T11:05:00.000Z",
};

/** Corpo de uma entrega de webhook (e item de GET /events, com outro formato de id). */
export const EVENT_DEAL_STAGE_CHANGED = {
  id: "evt_2f1e0d9c-8b7a-4695-8483-726150493827",
  type: "deal.stage_changed",
  timestamp: "2026-10-20T14:32:10.512Z",
  data: DEAL,
  previous: { stage_id: 2 },
};

// jobs.ts → serializarJob
export const IMPORT_JOB = {
  id: "6f5e4d3c-2b1a-4098-8765-43210fedcba9",
  type: "import",
  entity: "contacts",
  status: "queued",
  format: "json",
  mode: "upsert",
  dry_run: false,
  options: { tag_ids: [] },
  total: 1,
  processed: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  failed: 0,
  errors_stored: 0,
  result: {},
  created_at: "2026-10-20T14:32:10.000Z",
  started_at: null,
  finished_at: null,
};
export const EXPORT_JOB = {
  id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  type: "export",
  entity: "deals",
  status: "queued",
  format: "csv",
  options: { filters: { pipeline: 1, updated_since: "2026-10-01T00:00:00Z" } },
  total: 342,
  processed: 0,
  result: {},
  created_at: "2026-10-20T14:32:10.000Z",
  started_at: null,
  finished_at: null,
};

// fluxos.ts
export const AGENT = { id: AGENT_ID, name: "Vendedora Virtual", status: "active", primary_channel: "whatsapp_meta", created_at: "2026-09-01T12:00:00.000Z", updated_at: "2026-10-20T14:32:10.000Z" };
export const FLOW = {
  agent_id: AGENT_ID,
  nodes: [
    { id: "n1", type: "flowNode", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
    { id: "n2", type: "flowNode", position: { x: 280, y: 0 }, data: { iconKey: "message", label: "Boas-vindas", detail: "Olá!" } },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
  updated_at: "2026-10-20T14:32:10.000Z",
};
export const FLOW_VERSION = { id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a", source: "api", blocks: 3, created_at: "2026-10-19T10:00:00.000Z" };

// sequencias.ts → serializarSequencia
export const SEQUENCE = {
  id: "f0e1d2c3-b4a5-4968-8776-655443322110",
  agent_id: AGENT_ID,
  name: "Follow-up",
  channel: "whatsapp_meta",
  active: true,
  trigger: "tag",
  trigger_tag_id: TAG_ID,
  trigger_segment_id: null,
  trigger_stage_id: null,
  trigger_stage_days: 0,
  allow_reentry: false,
  stop_on_reply: true,
  steps: [{ order: 1, delay_minutes: 60, text: "Oi {nome}!", template_id: null, apply_tag_id: null }],
  created_at: "2026-10-10T09:00:00.000Z",
  updated_at: "2026-10-20T14:32:10.000Z",
};
export const ENROLLMENT = {
  id: "8b7a6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d",
  contact_id: CONTACT_ID,
  status: "active",
  current_step: 1,
  stopped_reason: null,
  next_run_at: "2026-10-21T15:32:10.000Z",
  created_at: "2026-10-20T14:32:10.000Z",
  updated_at: "2026-10-20T15:32:12.000Z",
};

/** Valores dos parâmetros de caminho nos exemplos da referência (curl/fetch). */
export function pathExamples(path: string): Record<string, string> {
  const ids: Record<string, string> = {
    contacts: CONTACT_ID,
    companies: COMPANY_ID,
    deals: DEAL_ID,
    tasks: TASK.id,
    notes: NOTE.id,
    webhooks: WEBHOOK.id,
    imports: IMPORT_JOB.id,
    exports: EXPORT_JOB.id,
    agents: AGENT_ID,
    sequences: SEQUENCE.id,
    pipelines: "1",
  };
  const resource = path.split("/")[1];
  return { id: ids[resource] ?? "{id}", stageId: "4", contactId: CONTACT_ID, externalId: resource === "companies" ? "erp-c1" : resource === "deals" ? "erp-d77" : "erp-123" };
}
