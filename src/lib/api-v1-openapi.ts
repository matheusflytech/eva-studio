// ---------------------------------------------------------------------------
// OpenAPI 3.1 da API pública v1, escrito à mão. Servido em
// /api/v1/openapi.json e lido pela página Integrações → API → Referência.
// Sem `server-only`: a página monta os exemplos curl/fetch a partir daqui.
//
// Ao mudar uma rota em src/app/api/v1/**, mude aqui também: o teste
// src/lib/api-v1-openapi.test.ts confere que todo arquivo de rota da v1 está
// documentado. Os exemplos de resposta ficam em api-v1-openapi-examples.ts.
// ---------------------------------------------------------------------------

import {
  AGENT,
  COMPANY,
  CONTACT,
  CUSTOM_FIELD,
  DEAL,
  DEAL_HISTORY,
  ENROLLMENT,
  EVENT_DEAL_STAGE_CHANGED,
  EXPORT_JOB,
  FLOW,
  FLOW_VERSION,
  IDS,
  IMPORT_JOB,
  ME,
  NOTE,
  PIPELINE,
  SEQUENCE,
  STAGE,
  TAG,
  TASK,
  WEBHOOK,
  deleted,
  list,
  one,
  restored,
  tombstone,
} from "./api-v1-openapi-examples";

type Metodo = "get" | "post" | "put" | "patch" | "delete";
type Erro = readonly [status: number, code: string];

interface Op {
  tag: string;
  summary: string;
  description?: string;
  scope: string;
  query?: ReadonlyArray<readonly [nome: string, descricao: string]>;
  body?: Record<string, unknown>;
  /** Padrão: opcional em POST/PUT/PATCH (o envoltório aceita), nenhum em GET/DELETE. */
  idempotency?: "optional" | "required" | "none";
  status?: number;
  /** Exemplo de resposta de sucesso (mesmas chaves do serializador). */
  response?: unknown;
  /** Erros próprios do endpoint (os gerais — 401, 403, 429, JSON — valem para todos). */
  errors?: readonly Erro[];
}

const LISTA = [
  ["limit", "Itens por página (1–200, padrão 50)."],
  ["cursor", "next_cursor da página anterior (com os mesmos filtros)."],
  ["include_total", "true para incluir total (COUNT)."],
] as const;

const ERROS_DE_LISTA: Erro[] = [
  [400, "unknown_parameter"],
  [400, "invalid_cursor"],
  [400, "cursor_mismatch"],
];

function operacao(metodo: Metodo, o: Op) {
  const idempotency = o.idempotency ?? (metodo === "get" || metodo === "delete" ? "none" : "optional");
  const parameters = [
    ...(o.query ?? []).map(([name, description]) => ({ name, in: "query", required: false, description, schema: { type: "string" } })),
    ...(idempotency !== "none"
      ? [
          {
            name: "Idempotency-Key",
            in: "header",
            required: idempotency === "required",
            description: "Até 255 caracteres. Repetir com o mesmo corpo devolve a mesma resposta (24h).",
            schema: { type: "string" },
          },
        ]
      : []),
  ];
  return {
    tags: [o.tag],
    summary: o.summary,
    ...(o.description ? { description: o.description } : {}),
    "x-scope": o.scope,
    ...(o.errors?.length ? { "x-errors": o.errors.map(([status, code]) => ({ status, code })) } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(o.body ? { requestBody: { required: true, content: { "application/json": { schema: { type: "object" }, example: o.body } } } } : {}),
    responses: {
      [String(o.status ?? 200)]: {
        description: "OK",
        content: { "application/json": { schema: { type: "object" }, ...(o.response !== undefined ? { example: o.response } : {}) } },
      },
      "4XX": { description: "Erro de entrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
  };
}

const DESC_APAGAR = "Vai para a lixeira por 30 dias (com tarefas, notas e vínculos) e entra em /deleted; POST /{id}/restore traz de volta com o mesmo id. Resposta: { id, deleted, trash: { expires_at } | null, warning? }. Sem a lixeira ativada no contrato, apaga de vez e avisa em warning.";
const DESC_RESTAURAR = "Restaura da lixeira (até 30 dias depois de apagar) com o mesmo id, reatando o que ainda existe. O que não deu para reatar vem em warnings. 404 se não estiver na lixeira; 410 trash_expired; 409 already_restored.";
const DESC_UPSERT = "201 quando cria, 200 quando atualiza ou não muda nada. result: created | updated | unchanged; matched_by diz por onde achou.";
const ERROS_RESTAURAR: Erro[] = [
  [404, "not_found"],
  [410, "trash_expired"],
  [409, "already_restored"],
  [409, "conflict"],
];
const ERROS_DE_CONTATO: Erro[] = [
  [400, "invalid_email"],
  [400, "invalid_phone"],
  [404, "invalid_reference"],
  [422, "invalid_custom_fields"],
];
const ERROS_DE_MUDANCA: Erro[] = [
  [409, "deal_closed"],
  [422, "stage_requirements_missing"],
  [422, "lost_reason_required"],
  [422, "stage_in_other_pipeline"],
];
const { CONTACT_ID, COMPANY_ID, DEAL_ID, AGENT_ID, TAG_ID } = IDS;
const CONTATO_DO_NEGOCIO = { ...CONTACT, role: "decisor" };

const ROTAS: Record<string, Partial<Record<Metodo, Op>>> = {
  "/contacts": {
    get: {
      tag: "Contatos",
      summary: "Listar contatos (cursor, ordem de atualização)",
      scope: "contacts:read",
      query: [
        ...LISTA,
        ["updated_since", "ISO-8601"],
        ["email", "E-mail exato"],
        ["phone", "Telefone (qualquer formato BR)"],
        ["external_id", "Id no seu sistema"],
        ["external_source", "Origem do id externo (padrão api)"],
        ["tag", "Id da etiqueta"],
        ["owner", "Id do responsável"],
        ["company", "Id da empresa"],
      ],
      response: list(CONTACT),
      errors: ERROS_DE_LISTA,
    },
    post: {
      tag: "Contatos",
      summary: "Criar contato (409 duplicate se já existe)",
      description: "Precisa de pelo menos name, email ou phone. Se já existe um contato com o mesmo external_id, e-mail ou telefone: 409 duplicate com details.existing_id e details.matched_by.",
      scope: "contacts:write",
      status: 201,
      body: { name: "Ana Souza", email: "ana@exemplo.com", phone: "+5511999998888", external_id: "erp-123", tag_ids: [], custom_fields: {} },
      response: one(CONTACT),
      errors: [[400, "missing_identity"], [409, "duplicate"], [409, "ambiguous_match"], [409, "external_id_taken"], ...ERROS_DE_CONTATO],
    },
  },
  "/contacts/upsert": {
    put: {
      tag: "Contatos",
      summary: "Criar ou atualizar (external_id → e-mail → telefone)",
      description: DESC_UPSERT,
      scope: "contacts:write",
      body: { email: "ana@exemplo.com", name: "Ana Souza", job_title: "Compras" },
      response: one(CONTACT, { result: "updated", matched_by: "email" }),
      errors: [[400, "missing_identity"], [409, "ambiguous_match"], [409, "external_id_mismatch"], [409, "duplicate"], ...ERROS_DE_CONTATO],
    },
  },
  "/contacts/batch": {
    post: {
      tag: "Contatos",
      summary: "Lote síncrono de até 100 (resultado por item)",
      description: "Sempre 200: o erro de cada item vem em data[i].error, com os mesmos códigos do upsert. mode: upsert (padrão) ou create.",
      scope: "contacts:write",
      idempotency: "required",
      body: { mode: "upsert", items: [{ email: "a@x.com", name: "A" }, { phone: "+5511988887777" }] },
      response: {
        data: [
          { index: 0, status: "created", id: CONTACT_ID, matched_by: null },
          { index: 1, status: "error", error: { code: "invalid_phone", message: "Telefone inválido. Informe com DDD (ex.: +5511999998888).", param: "phone" } },
        ],
        summary: { created: 1, updated: 0, unchanged: 0, failed: 1 },
      },
      errors: [[400, "idempotency_key_required"], [400, "invalid_parameter"]],
    },
  },
  "/contacts/by-external-id/{externalId}": {
    get: { tag: "Contatos", summary: "Buscar pelo id externo", scope: "contacts:read", query: [["external_source", "Origem (padrão api)"]], response: one(CONTACT), errors: [[404, "not_found"]] },
    put: {
      tag: "Contatos",
      summary: "Upsert pelo id externo",
      description: DESC_UPSERT + " O corpo não leva external_id (ele vem na URL).",
      scope: "contacts:write",
      body: { name: "Ana", email: "ana@exemplo.com" },
      response: one(CONTACT, { result: "created", matched_by: null }),
      errors: [[409, "external_id_mismatch"], [409, "duplicate"], ...ERROS_DE_CONTATO],
    },
  },
  "/contacts/deleted": {
    get: { tag: "Contatos", summary: "Contatos apagados (para sincronizar)", scope: "contacts:read", query: [...LISTA, ["since", "ISO-8601"]], response: tombstone(CONTACT_ID, "erp-123"), errors: ERROS_DE_LISTA },
  },
  "/contacts/{id}": {
    get: { tag: "Contatos", summary: "Ler contato", scope: "contacts:read", response: one(CONTACT), errors: [[404, "not_found"]] },
    patch: {
      tag: "Contatos",
      summary: "Atualizar (parcial: ausente não muda, null limpa)",
      description: "Etiquetas: add_tag_ids e remove_tag_ids (tag_ids não é aceito aqui).",
      scope: "contacts:write",
      body: { company_id: null, add_tag_ids: [TAG_ID], opt_in: false },
      response: one(CONTACT),
      errors: [[404, "not_found"], [409, "duplicate"], [409, "external_id_taken"], ...ERROS_DE_CONTATO],
    },
    delete: { tag: "Contatos", summary: "Apagar (vai para a lixeira por 30 dias)", description: DESC_APAGAR, scope: "contacts:write", response: deleted(CONTACT_ID), errors: [[404, "not_found"]] },
  },
  "/contacts/{id}/restore": {
    post: { tag: "Contatos", summary: "Restaurar da lixeira", description: DESC_RESTAURAR, scope: "contacts:write", idempotency: "none", response: restored(CONTACT_ID), errors: ERROS_RESTAURAR },
  },
  "/contacts/{id}/deals": {
    get: { tag: "Contatos", summary: "Negócios do contato", scope: "deals:read", query: [["limit", LISTA[0][1]], ["cursor", LISTA[1][1]]], response: list(DEAL), errors: [[404, "not_found"]] },
  },

  "/companies": {
    get: {
      tag: "Empresas",
      summary: "Listar empresas",
      scope: "companies:read",
      query: [...LISTA, ["updated_since", "ISO-8601"], ["cnpj", "Só dígitos"], ["owner", "Id do responsável"], ["name", "Contém"], ["external_id", "Id externo"], ["external_source", "Origem"]],
      response: list(COMPANY),
      errors: ERROS_DE_LISTA,
    },
    post: {
      tag: "Empresas",
      summary: "Criar empresa (CNPJ único)",
      scope: "companies:write",
      status: 201,
      body: { name: "ACME Ltda", cnpj: "11.222.333/0001-81", external_id: "erp-c1" },
      response: one(COMPANY),
      errors: [[400, "invalid_parameter"], [400, "invalid_cnpj"], [409, "duplicate"], [404, "invalid_reference"]],
    },
  },
  "/companies/by-external-id/{externalId}": {
    get: { tag: "Empresas", summary: "Buscar pelo id externo", scope: "companies:read", query: [["external_source", "Origem"]], response: one(COMPANY), errors: [[404, "not_found"]] },
    put: {
      tag: "Empresas",
      summary: "Upsert pelo id externo (reserva: CNPJ)",
      description: DESC_UPSERT,
      scope: "companies:write",
      body: { name: "ACME Ltda" },
      response: one(COMPANY, { result: "updated", matched_by: "cnpj" }),
      errors: [[400, "invalid_parameter"], [400, "invalid_cnpj"], [409, "duplicate"], [409, "external_id_taken"]],
    },
  },
  "/companies/deleted": {
    get: { tag: "Empresas", summary: "Empresas apagadas", scope: "companies:read", query: [...LISTA, ["since", "ISO-8601"]], response: tombstone(COMPANY_ID, "erp-c1"), errors: ERROS_DE_LISTA },
  },
  "/companies/{id}": {
    get: { tag: "Empresas", summary: "Ler empresa", scope: "companies:read", response: one(COMPANY), errors: [[404, "not_found"]] },
    patch: {
      tag: "Empresas",
      summary: "Atualizar (parcial)",
      scope: "companies:write",
      body: { city: "Campinas", uf: "SP" },
      response: one({ ...COMPANY, city: "Campinas" }),
      errors: [[404, "not_found"], [400, "invalid_cnpj"], [409, "duplicate"], [409, "external_id_taken"]],
    },
    delete: { tag: "Empresas", summary: "Apagar (lixeira por 30 dias; contatos e negócios ficam)", description: DESC_APAGAR, scope: "companies:write", response: deleted(COMPANY_ID), errors: [[404, "not_found"]] },
  },
  "/companies/{id}/restore": {
    post: {
      tag: "Empresas",
      summary: "Restaurar da lixeira (religa contatos e negócios)",
      description: DESC_RESTAURAR,
      scope: "companies:write",
      idempotency: "none",
      response: restored(COMPANY_ID),
      errors: ERROS_RESTAURAR,
    },
  },

  "/deals": {
    get: {
      tag: "Negócios",
      summary: "Listar negócios",
      scope: "deals:read",
      query: [
        ...LISTA,
        ["updated_since", "ISO-8601"],
        ["pipeline", "Número do funil no contrato (1, 2...)"],
        ["stage", "Número da etapa no contrato"],
        ["owner", "Id do responsável"],
        ["company", "Id da empresa"],
        ["contact", "Id do contato"],
        ["status", "open | won | lost"],
        ["archived", "true | false"],
        ["external_id", "Id externo"],
        ["external_source", "Origem"],
      ],
      response: list(DEAL),
      errors: [...ERROS_DE_LISTA, [400, "invalid_parameter"]],
    },
    post: {
      tag: "Negócios",
      summary: "Criar negócio (409 se external_id já existe)",
      description:
        "Sem stage_id, entra na primeira etapa aberta do funil (ou do funil padrão). Mandar custom_fields confere os campos obrigatórios do negócio (422 invalid_custom_fields); sem a chave, não confere.",
      scope: "deals:write",
      status: 201,
      body: { name: "Proposta ACME", pipeline_id: 1, amount_cents: 150000, contact_id: CONTACT_ID, external_id: "erp-d1" },
      response: one(DEAL),
      errors: [[400, "invalid_parameter"], [404, "invalid_reference"], [422, "invalid_custom_fields"], [409, "duplicate"]],
    },
  },
  "/deals/by-external-id/{externalId}": {
    get: { tag: "Negócios", summary: "Buscar pelo id externo", scope: "deals:read", query: [["external_source", "Origem"]], response: one(DEAL), errors: [[404, "not_found"]] },
    put: {
      tag: "Negócios",
      summary: "Upsert pelo id externo",
      description: DESC_UPSERT + " Ao atualizar, contact_id/contact_ids só acrescentam contatos.",
      scope: "deals:write",
      body: { name: "Proposta ACME", amount_cents: 180000 },
      response: one(DEAL, { result: "updated", matched_by: "external_id" }),
      errors: [[400, "invalid_parameter"], [404, "invalid_reference"], [409, "external_id_taken"], ...ERROS_DE_MUDANCA],
    },
  },
  "/deals/deleted": {
    get: { tag: "Negócios", summary: "Negócios apagados", scope: "deals:read", query: [...LISTA, ["since", "ISO-8601"]], response: tombstone(DEAL_ID, "erp-d77"), errors: ERROS_DE_LISTA },
  },
  "/deals/{id}": {
    get: { tag: "Negócios", summary: "Ler negócio", scope: "deals:read", response: one(DEAL), errors: [[404, "not_found"]] },
    patch: {
      tag: "Negócios",
      summary: "Atualizar (parcial; stage_id move)",
      description: "Trocar de funil exige stage_id de uma etapa do funil novo (422 stage_required). Mover pelo stage_id segue as mesmas regras de POST /deals/{id}/move.",
      scope: "deals:write",
      body: { amount_cents: 200000, owner_id: null },
      response: one({ ...DEAL, amount_cents: 200000, owner_id: null }),
      errors: [[404, "not_found"], [422, "stage_required"], [422, "invalid_custom_fields"], [409, "external_id_taken"], ...ERROS_DE_MUDANCA],
    },
    delete: { tag: "Negócios", summary: "Apagar (vai para a lixeira por 30 dias)", description: DESC_APAGAR, scope: "deals:write", response: deleted(DEAL_ID), errors: [[404, "not_found"]] },
  },
  "/deals/{id}/restore": {
    post: { tag: "Negócios", summary: "Restaurar da lixeira", description: DESC_RESTAURAR, scope: "deals:write", idempotency: "none", response: restored(DEAL_ID), errors: [...ERROS_RESTAURAR, [409, "no_open_stage"]] },
  },
  "/deals/{id}/move": {
    post: {
      tag: "Negócios",
      summary: "Mover de etapa",
      description:
        "Mesmas regras da tela. Etapa de outro funil exige pipeline_id do funil da etapa (422 stage_in_other_pipeline). " +
        "Campos obrigatórios da etapa (e das puladas que não podem ser puladas) faltando: 422 stage_requirements_missing com details.missing_fields. " +
        "Negócio ganho/perdido só sai com reopen: true (409 deal_closed). Etapa de perda exige lost_reason_id (ou lost_reason em texto; " +
        "texto que não bate com um motivo vira \"Outro\" com a nota) — 422 lost_reason_required. moved: false quando já estava na etapa.",
      scope: "deals:write",
      body: { stage_id: 3, reopen: false },
      response: one(DEAL, { moved: true }),
      errors: [[400, "invalid_parameter"], [404, "not_found"], ...ERROS_DE_MUDANCA, [422, "stage_not_in_pipeline"]],
    },
  },
  "/deals/{id}/won": {
    post: {
      tag: "Negócios",
      summary: "Marcar como ganho",
      description: "Sem corpo. Campos obrigatórios da etapa de ganho: 422 stage_requirements_missing. Negócio perdido: 409 deal_closed (reabra com /move e reopen: true).",
      scope: "deals:write",
      response: one({ ...DEAL, stage_id: 5, status: "won", probability: 100, closed_at: "2026-10-21T10:00:00.000Z" }, { moved: true }),
      errors: [[404, "not_found"], [422, "no_won_stage"], [409, "deal_closed"], [422, "stage_requirements_missing"]],
    },
  },
  "/deals/{id}/lost": {
    post: {
      tag: "Negócios",
      summary: "Marcar como perdido",
      description:
        "Motivo obrigatório: lost_reason_id (motivos do funil; sem motivos salvos, valem padrao:preco, padrao:concorrente, padrao:sem-resposta, " +
        "padrao:sem-orcamento, padrao:timing e padrao:outro) ou lost_reason em texto; motivo que pede nota exige lost_note.",
      scope: "deals:write",
      body: { lost_reason_id: "padrao:preco", lost_note: "" },
      response: one({ ...DEAL, stage_id: 6, status: "lost", probability: 0, lost_reason: "Preço", closed_at: "2026-10-21T10:00:00.000Z" }, { moved: true }),
      errors: [[404, "not_found"], [422, "no_lost_stage"], [422, "lost_reason_required"], [409, "deal_closed"], [422, "stage_requirements_missing"]],
    },
  },
  "/deals/{id}/history": {
    get: { tag: "Negócios", summary: "Histórico de etapas", scope: "deals:read", query: [["limit", LISTA[0][1]], ["cursor", LISTA[1][1]]], response: list(DEAL_HISTORY), errors: [[404, "not_found"]] },
  },
  "/deals/{id}/contacts": {
    get: { tag: "Negócios", summary: "Contatos do negócio", description: "Contato completo com role no fim. Sem paginação.", scope: "deals:read", response: list(CONTATO_DO_NEGOCIO), errors: [[404, "not_found"]] },
    post: {
      tag: "Negócios",
      summary: "Vincular contato",
      description: "201 também quando o vínculo já existia (atualiza o role).",
      scope: "deals:write",
      status: 201,
      body: { contact_id: CONTACT_ID, role: "decisor" },
      response: one({ deal_id: DEAL_ID, contact_id: CONTACT_ID, role: "decisor" }),
      errors: [[400, "invalid_parameter"], [404, "not_found"], [404, "invalid_reference"]],
    },
  },
  "/deals/{id}/contacts/{contactId}": {
    delete: { tag: "Negócios", summary: "Desvincular contato", scope: "deals:write", response: one({ deal_id: DEAL_ID, contact_id: CONTACT_ID, removed: true }), errors: [[404, "not_found"]] },
  },

  "/tasks": {
    get: {
      tag: "Tarefas e notas",
      summary: "Listar tarefas",
      scope: "tasks:read",
      query: [...LISTA, ["updated_since", "ISO-8601"], ["contact", "Id"], ["deal", "Id"], ["assigned_to", "Id"], ["status", "open | done"]],
      response: list(TASK),
      errors: [...ERROS_DE_LISTA, [400, "invalid_parameter"]],
    },
    post: {
      tag: "Tarefas e notas",
      summary: "Criar tarefa",
      description: "type: ligar, whatsapp, email, reuniao, visita ou afazer. Prazo em due_at (ISO-8601) ou due relativo (\"2d\", \"3h\").",
      scope: "tasks:write",
      status: 201,
      body: { text: "Ligar para confirmar", type: "ligar", due: "2d", deal_id: DEAL_ID },
      response: one(TASK),
      errors: [[400, "invalid_parameter"], [404, "invalid_reference"]],
    },
  },
  "/tasks/{id}": {
    get: { tag: "Tarefas e notas", summary: "Ler tarefa", scope: "tasks:read", response: one(TASK), errors: [[404, "not_found"]] },
    patch: {
      tag: "Tarefas e notas",
      summary: "Atualizar / concluir",
      scope: "tasks:write",
      body: { done: true },
      response: one({ ...TASK, done: true, done_at: "2026-10-21T09:15:42.000Z" }),
      errors: [[400, "invalid_parameter"], [404, "not_found"], [404, "invalid_reference"]],
    },
    delete: { tag: "Tarefas e notas", summary: "Apagar tarefa", scope: "tasks:write", response: one({ id: TASK.id, deleted: true }), errors: [[404, "not_found"]] },
  },
  "/notes": {
    get: {
      tag: "Tarefas e notas",
      summary: "Listar notas",
      description: "Ordem de criação (nota não tem updated_at).",
      scope: "notes:read",
      query: [...LISTA, ["created_since", "ISO-8601"], ["contact", "Id"], ["deal", "Id"]],
      response: list(NOTE),
      errors: ERROS_DE_LISTA,
    },
    post: {
      tag: "Tarefas e notas",
      summary: "Criar nota",
      description: "Precisa de contact_id ou deal_id.",
      scope: "notes:write",
      status: 201,
      body: { text: "Cliente pediu desconto.", deal_id: DEAL_ID },
      response: one(NOTE),
      errors: [[400, "invalid_parameter"], [404, "invalid_reference"]],
    },
  },
  "/notes/{id}": {
    get: { tag: "Tarefas e notas", summary: "Ler nota", scope: "notes:read", response: one(NOTE), errors: [[404, "not_found"]] },
    patch: { tag: "Tarefas e notas", summary: "Editar texto", scope: "notes:write", body: { text: "Texto novo" }, response: one({ ...NOTE, text: "Texto novo" }), errors: [[400, "invalid_parameter"], [404, "not_found"]] },
    delete: { tag: "Tarefas e notas", summary: "Apagar nota", scope: "notes:write", response: one({ id: NOTE.id, deleted: true }), errors: [[404, "not_found"]] },
  },
  "/custom-fields": {
    get: {
      tag: "Configuração",
      summary: "Campos personalizados (leitura)",
      scope: "custom_fields:read",
      query: [["entity", "deal | contact"], ["pipeline", "Número do funil"]],
      response: list(CUSTOM_FIELD),
      errors: [[400, "invalid_parameter"]],
    },
  },
  "/tags": { get: { tag: "Configuração", summary: "Etiquetas", scope: "tags:read", response: list(TAG) } },
  "/me": {
    get: {
      tag: "Configuração",
      summary: "Quem é esta chave",
      description: "Contrato (id curto, o mesmo da URL do app), chave e escopos. Serve para testar a credencial (o node do n8n chama aqui). Qualquer chave válida.",
      scope: "(qualquer)",
      response: one(ME),
    },
  },

  "/webhooks": {
    get: { tag: "Webhooks", summary: "Listar webhooks de saída", description: "Sem paginação (até 25 por contrato).", scope: "webhooks:read", response: list(WEBHOOK) },
    post: {
      tag: "Webhooks",
      summary: "Assinar eventos",
      description:
        "Cria um endpoint que recebe os eventos escolhidos (\"*\", \"deal.*\" ou tipos exatos). O secret (whsec_...) só vem nesta resposta. " +
        "Entrega com Standard Webhooks: headers webhook-id, webhook-timestamp e webhook-signature (v1,<base64 HMAC-SHA256 de id.timestamp.corpo>). " +
        "Só 2xx é sucesso; rede, timeout, 408, 429 e 5xx são repetidos em 5 s, 5 min, 30 min, 2 h, 5 h, 10 h e 10 h; outro 4xx falha sem repetir. " +
        "410 desliga o endpoint; falhar por 5 dias seguidos também.",
      scope: "webhooks:write",
      status: 201,
      body: { url: "https://seu-n8n.com/webhook/abc", events: ["deal.stage_changed", "deal.won"], description: "n8n" },
      response: one({ ...WEBHOOK, last_success_at: null, secret: "whsec_q8Zk3N0vXb1r7YtLm2PaQw9sEe4uDc6H" }),
      errors: [[400, "invalid_url"], [400, "invalid_events"], [409, "limit_reached"], [409, "webhooks_unavailable"]],
    },
  },
  "/messages": {
    post: {
      tag: "Mensagens",
      summary: "Mandar mensagem pelo agente",
      description:
        "Destino: conversation_id (\"canal:contato\", o mesmo que o bloco \"Enviar para o n8n\" manda) ou channel + to. " +
        "Nos canais da Meta, fora da janela de 24h só sai modelo aprovado (template_id + variables): 409 window_closed. " +
        "status: sent (saiu) ou queued (WhatsApp QR, sai pelo worker).",
      scope: "messages:write",
      status: 201,
      body: { agent_id: AGENT_ID, conversation_id: "whatsapp_qr:5511999998888", text: "Seu pedido saiu para entrega." },
      response: one({ message_id: "4a5b6c7d-8e9f-4012-a3b4-c5d6e7f8a9b0", conversation_id: "whatsapp_qr:5511999998888", status: "queued" }),
      errors: [
        [400, "missing_agent"],
        [404, "agent_not_found"],
        [400, "missing_destination"],
        [400, "channel_not_supported"],
        [400, "missing_text"],
        [400, "text_too_long"],
        [400, "template_not_supported"],
        [404, "template_not_found"],
        [409, "window_closed"],
        [502, "delivery_failed"],
      ],
    },
  },

  "/events": {
    get: {
      tag: "Webhooks",
      summary: "Eventos por consulta (sem URL pública)",
      description:
        "Os mesmos eventos dos webhooks, montados do histórico do CRM: contact.created, lead.captured, deal.created, deal.stage_changed, " +
        "deal.won, deal.lost, deal.reopened, task.completed. Comece com since (padrão: últimas 24 h; no máximo 30 dias) e depois mande só " +
        "o next_cursor (depois que você manda um cursor, ele volta mesmo sem eventos novos). data é o objeto como está agora ({ id, deleted: true } se foi apagado). " +
        "contact.updated e message.received só existem por webhook.",
      scope: "webhooks:read",
      query: [["types", "Lista separada por vírgula; aceita deal.* e *"], ["since", "ISO-8601"], ["cursor", "next_cursor da resposta anterior"], ["limit", "1–200, padrão 50"]],
      response: list({ ...EVENT_DEAL_STAGE_CHANGED, id: "evt_dse_9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a_1" }, { next_cursor: "eyJ0IjoiMjAyNi0xMC0yMFQxNDozMjoxMC4wMDBaIi..." }),
      errors: [[400, "invalid_parameter"], [400, "invalid_cursor"]],
    },
  },
  "/webhooks/{id}": {
    get: { tag: "Webhooks", summary: "Ler webhook", description: "Sem o secret.", scope: "webhooks:read", response: one(WEBHOOK), errors: [[404, "not_found"]] },
    delete: { tag: "Webhooks", summary: "Cancelar assinatura", description: "A resposta vem sem o envelope data.", scope: "webhooks:write", response: { id: WEBHOOK.id, deleted: true }, errors: [[404, "not_found"]] },
  },

  "/pipelines": {
    get: {
      tag: "Funis",
      summary: "Funis com etapas",
      description:
        "O id do funil é o número dele no contrato (1, 2, 3...) e o da etapa, o número dela no contrato inteiro (1..N somando os funis): " +
        "stage_id sozinho já identifica a etapa. É esse número que vai em pipeline_id/stage_id no resto da API. Sem paginação; o funil padrão vem primeiro.",
      scope: "pipelines:read",
      response: list(PIPELINE),
    },
    post: {
      tag: "Funis",
      summary: "Criar funil (até 15 funis, 20 etapas)",
      scope: "pipelines:write",
      status: 201,
      body: { name: "Pós-venda", stages: [{ name: "Novo" }, { name: "Ganho", type: "won" }, { name: "Perdido", type: "lost" }] },
      response: one({
        id: 2,
        name: "Pós-venda",
        is_default: false,
        position: 1,
        deal_count: 0,
        stages: [
          { id: 7, pipeline_id: 2, name: "Novo", position: 0, probability: 0, type: "open", color: "", deal_count: 0 },
          { id: 8, pipeline_id: 2, name: "Ganho", position: 1, probability: 100, type: "won", color: "", deal_count: 0 },
          { id: 9, pipeline_id: 2, name: "Perdido", position: 2, probability: 0, type: "lost", color: "", deal_count: 0 },
        ],
        created_at: "2026-10-20T14:32:10.000Z",
      }),
      errors: [[400, "invalid_parameter"], [400, "limit_exceeded"]],
    },
  },
  "/pipelines/reorder": {
    post: { tag: "Funis", summary: "Reordenar funis", description: "Devolve a ordem final completa; funis não enviados vão para o fim.", scope: "pipelines:write", body: { ids: [2, 1] }, response: one({ ids: [2, 1] }), errors: [[400, "invalid_parameter"]] },
  },
  "/pipelines/{id}": {
    get: { tag: "Funis", summary: "Ler funil", scope: "pipelines:read", response: one(PIPELINE), errors: [[400, "invalid_parameter"], [404, "not_found"]] },
    patch: { tag: "Funis", summary: "Renomear / tornar padrão", scope: "pipelines:write", body: { name: "Vendas B2B", is_default: true }, response: one({ ...PIPELINE, name: "Vendas B2B" }), errors: [[400, "invalid_parameter"], [404, "not_found"]] },
    delete: {
      tag: "Funis",
      summary: "Apagar (move_to obrigatório com negócios)",
      scope: "pipelines:write",
      query: [["move_to", "Número do funil de destino"]],
      response: one({ id: 2, deleted: true, moved_deals: 3 }),
      errors: [[400, "last_pipeline"], [400, "invalid_move_to"], [409, "move_to_required"], [404, "not_found"]],
    },
  },
  "/pipelines/{id}/stages": {
    post: {
      tag: "Funis",
      summary: "Criar etapa",
      description: "Etapa aberta entra antes das etapas de ganho/perda. Sem probability, fica 0.",
      scope: "pipelines:write",
      status: 201,
      body: { name: "Proposta", type: "open", probability: 60 },
      response: one(STAGE),
      errors: [[400, "invalid_parameter"], [400, "limit_exceeded"], [404, "not_found"]],
    },
  },
  "/pipelines/{id}/stages/reorder": {
    post: { tag: "Funis", summary: "Reordenar etapas", scope: "pipelines:write", body: { ids: [4, 3, 5] }, response: one({ ids: [1, 2, 4, 3, 5, 6] }), errors: [[400, "invalid_parameter"], [404, "not_found"]] },
  },
  "/pipelines/{id}/stages/{stageId}": {
    patch: {
      tag: "Funis",
      summary: "Editar etapa",
      scope: "pipelines:write",
      body: { name: "Negociação", probability: 80 },
      response: one({ id: 4, pipeline_id: 1, name: "Negociação", position: 3, probability: 80, type: "open", color: "" }),
      errors: [[400, "invalid_parameter"], [404, "not_found"]],
    },
    delete: {
      tag: "Funis",
      summary: "Apagar etapa (move_to com negócios)",
      scope: "pipelines:write",
      query: [["move_to", "Número da etapa de destino (mesmo funil)"]],
      response: one({ id: 4, deleted: true, moved_deals: 1 }),
      errors: [[400, "last_stage"], [409, "move_to_required"], [404, "not_found"]],
    },
  },

  "/imports": {
    post: {
      tag: "Importação e exportação",
      summary: "Importar em lote (assíncrono)",
      description:
        "records (até 5 mil), csv inline, ou upload: true para receber upload_url. Um import ativo por organização. " +
        "Negócios: options { pipeline_id, stage_id (números), skip_stage_requirements } — negócio existente que muda de etapa segue os campos " +
        "obrigatórios da etapa, a menos que skip_stage_requirements: true (fica registrado no histórico de etapas). " +
        "Acompanhe em GET /imports/{id} até status completed, completed_with_errors, failed ou canceled.",
      scope: "imports:write",
      idempotency: "required",
      status: 202,
      body: { entity: "contacts", mode: "upsert", dry_run: false, records: [{ name: "Ana", email: "ana@x.com", external_id: "erp-1" }] },
      response: one(IMPORT_JOB),
      errors: [[400, "idempotency_key_required"], [400, "invalid_parameter"], [400, "invalid_csv"], [404, "invalid_reference"], [409, "import_in_progress"], [503, "storage_unavailable"]],
    },
  },
  "/imports/{id}": {
    get: {
      tag: "Importação e exportação",
      summary: "Estado da importação",
      scope: "imports:write",
      response: one({ ...IMPORT_JOB, status: "completed_with_errors", total: 157, processed: 157, created: 120, updated: 30, unchanged: 5, failed: 2, errors_stored: 2, started_at: "2026-10-20T14:32:11.000Z", finished_at: "2026-10-20T14:32:19.000Z" }),
      errors: [[404, "not_found"]],
    },
  },
  "/imports/{id}/errors": {
    get: {
      tag: "Importação e exportação",
      summary: "Erros por linha",
      description: "row começa em 1 (JSON) ou 2 (CSV, a linha 1 é o cabeçalho). Até mil erros guardados.",
      scope: "imports:write",
      query: [["limit", "1–200"], ["cursor", "next_cursor"]],
      response: list({ row: 3, code: "invalid_parameter", message: "email inválido.", param: "email", record: { name: "João Pereira", email: "joao@@exemplo" } }, { total: 1 }),
      errors: [[400, "invalid_cursor"], [404, "not_found"]],
    },
  },
  "/imports/{id}/start": {
    post: { tag: "Importação e exportação", summary: "Iniciar depois do upload", scope: "imports:write", status: 202, response: one({ ...IMPORT_JOB, format: "csv" }), errors: [[409, "invalid_state"], [422, "upload_missing"], [404, "not_found"]] },
  },
  "/imports/{id}/cancel": {
    post: {
      tag: "Importação e exportação",
      summary: "Cancelar",
      scope: "imports:write",
      response: one({ ...IMPORT_JOB, status: "canceled", finished_at: "2026-10-20T14:33:00.000Z" }),
      errors: [[409, "invalid_state"], [404, "not_found"]],
    },
  },
  "/imports/{id}/retry-failed": {
    post: {
      tag: "Importação e exportação",
      summary: "Refazer as linhas que falharam",
      description: "Cria uma importação nova só com as linhas que falharam (result.retry_of aponta a original).",
      scope: "imports:write",
      idempotency: "required",
      status: 202,
      response: one({ ...IMPORT_JOB, id: "2b3c4d5e-6f70-4a81-9b2c-3d4e5f6a7b8c", total: 2, result: { retry_of: IMPORT_JOB.id } }),
      errors: [[409, "invalid_state"], [422, "nothing_to_retry"], [409, "import_in_progress"]],
    },
  },
  "/exports": {
    post: {
      tag: "Importação e exportação",
      summary: "Exportar (CSV ou JSONL)",
      description: "Filtros de contatos: updated_since, tag, owner, company. De negócios: updated_since, pipeline, stage, owner, company, contact, status, archived. Até 15 MB.",
      scope: "exports:read",
      status: 202,
      body: { entity: "deals", format: "csv", filters: { pipeline: 1, updated_since: "2026-10-01T00:00:00Z" } },
      response: one(EXPORT_JOB),
      errors: [[400, "invalid_parameter"], [404, "invalid_reference"]],
    },
  },
  "/exports/{id}": {
    get: {
      tag: "Importação e exportação",
      summary: "Estado e download_url (15 min)",
      scope: "exports:read",
      response: one({
        ...EXPORT_JOB,
        status: "completed",
        processed: 342,
        result: { file_path: `<orgId>/exports/${EXPORT_JOB.id}.csv`, rows: 342, bytes: 48213 },
        started_at: "2026-10-20T14:33:00.000Z",
        finished_at: "2026-10-20T14:33:04.000Z",
        download_url: "https://…/exports/…csv?token=…",
        download_expires_at: "2026-10-20T14:48:10.000Z",
      }),
      errors: [[404, "not_found"]],
    },
  },
  "/exports/{id}/cancel": {
    post: { tag: "Importação e exportação", summary: "Cancelar exportação", scope: "exports:read", response: one({ ...EXPORT_JOB, status: "canceled", finished_at: "2026-10-20T14:33:00.000Z" }), errors: [[409, "invalid_state"], [404, "not_found"]] },
  },

  "/agents": { get: { tag: "Fluxos", summary: "Agentes", scope: "flows:read", response: list(AGENT) } },
  "/agents/{id}/flow": {
    get: { tag: "Fluxos", summary: "Ler fluxo (nodes/edges)", description: "Sem fluxo salvo: nodes e edges vazios, updated_at null.", scope: "flows:read", response: one(FLOW), errors: [[404, "not_found"]] },
    put: {
      tag: "Fluxos",
      summary: "Substituir fluxo (validado; 422 invalid_flow; avisos em warnings; sem position ou com blocos sobrepostos, organiza esquerda→direita)",
      description: "422 invalid_flow traz details.issues[] com { code, message, node_id?, edge_id? }. Até 200 blocos e 500 ligações.",
      scope: "flows:write",
      body: {
        nodes: [
          { id: "n1", type: "flowNode", data: { iconKey: "start", label: "Início" } },
          { id: "n2", type: "flowNode", data: { iconKey: "message", label: "Boas-vindas", detail: "Olá!" } },
          { id: "n3", type: "flowNode", data: { iconKey: "end", label: "Fim" } },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2" },
          { id: "e2", source: "n2", target: "n3" },
        ],
      },
      response: one(FLOW, { warnings: [] }),
      errors: [[400, "invalid_parameter"], [422, "invalid_flow"], [404, "not_found"]],
    },
  },
  "/agents/{id}/flow/versions": { get: { tag: "Fluxos", summary: "Versões anteriores", description: "Mais nova primeiro, até 50.", scope: "flows:read", response: list(FLOW_VERSION), errors: [[404, "not_found"]] } },
  "/agents/{id}/flow/restore": {
    post: {
      tag: "Fluxos",
      summary: "Restaurar versão (desfazer)",
      description: "Sem version_id, volta para a versão anterior.",
      scope: "flows:write",
      body: { version_id: FLOW_VERSION.id },
      response: one(FLOW, { restored_version_id: FLOW_VERSION.id }),
      errors: [[404, "not_found"]],
    },
  },

  "/sequences": {
    get: { tag: "Sequências", summary: "Listar sequências", scope: "sequences:read", query: [...LISTA, ["agent", "Id do agente"]], response: list(SEQUENCE), errors: ERROS_DE_LISTA },
    post: {
      tag: "Sequências",
      summary: "Criar sequência",
      description: "Nasce inativa, a menos que venha active: true. channel: whatsapp_meta, whatsapp_qr, instagram, telegram ou email. trigger: tag, segment, stage ou manual.",
      scope: "sequences:write",
      status: 201,
      body: { agent_id: AGENT_ID, name: "Follow-up", channel: "whatsapp_meta", trigger: "tag", trigger_tag_id: TAG_ID, steps: [{ delay_minutes: 60, text: "Oi {nome}!" }] },
      response: one({ ...SEQUENCE, active: false }),
      errors: [[400, "invalid_parameter"], [404, "invalid_reference"], [422, "no_steps"]],
    },
  },
  "/sequences/{id}": {
    get: {
      tag: "Sequências",
      summary: "Ler sequência",
      scope: "sequences:read",
      response: one({ ...Object.fromEntries(Object.entries(SEQUENCE).filter(([k]) => k !== "created_at" && k !== "updated_at")), active_enrollments: 12, created_at: SEQUENCE.created_at, updated_at: SEQUENCE.updated_at }),
      errors: [[404, "not_found"]],
    },
    patch: { tag: "Sequências", summary: "Atualizar (steps substitui a régua)", scope: "sequences:write", body: { active: true }, response: one(SEQUENCE), errors: [[404, "not_found"], [422, "no_steps"], [422, "immutable_field"]] },
    delete: { tag: "Sequências", summary: "Apagar sequência", scope: "sequences:write", response: one({ id: SEQUENCE.id, deleted: true }), errors: [[404, "not_found"]] },
  },
  "/sequences/{id}/enrollments": {
    get: { tag: "Sequências", summary: "Inscrições", scope: "sequences:read", query: [["limit", LISTA[0][1]], ["cursor", LISTA[1][1]], ["status", "active | done | stopped"]], response: list(ENROLLMENT), errors: [[404, "not_found"]] },
    post: {
      tag: "Sequências",
      summary: "Inscrever contatos (até 100)",
      description: "Resultado por contato: enrolled true, ou false com reason not_found / not_eligible.",
      scope: "sequences:write",
      body: { contact_ids: [CONTACT_ID] },
      response: { data: [{ contact_id: CONTACT_ID, enrolled: true, enrollment_id: ENROLLMENT.id }] },
      errors: [[400, "invalid_parameter"], [422, "no_steps"], [404, "not_found"]],
    },
  },
  "/sequences/{id}/enrollments/{contactId}": {
    delete: { tag: "Sequências", summary: "Tirar contato da sequência", scope: "sequences:write", response: one({ sequence_id: SEQUENCE.id, contact_id: CONTACT_ID, status: "stopped" }), errors: [[404, "not_found"]] },
  },
};

export function montarOpenApi(servidor = "https://SEU-DOMINIO/api/v1") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [caminho, metodos] of Object.entries(ROTAS)) {
    // Funil e etapa no caminho: o número no contrato.
    const numerico = (nome: string) => caminho.startsWith("/pipelines/") && (nome === "id" || nome === "stageId");
    const params = [...caminho.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: numerico(m[1]) ? "integer" : "string" },
    }));
    paths[caminho] = { ...(params.length ? { parameters: params } : {}) };
    for (const [metodo, op] of Object.entries(metodos)) paths[caminho][metodo] = operacao(metodo as Metodo, op!);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Eva Studio — API do CRM",
      version: "1.0.0",
      description:
        "Autenticação: Authorization: Bearer evs_live_... (Integrações → API). JSON em snake_case, datas ISO-8601 em UTC, dinheiro em centavos. " +
        "Funil e etapa são identificados pelo número no contrato (inteiro; veja GET /pipelines), não por UUID. " +
        "Listas: { data, has_more, next_cursor }. Erro: { error: { type, code, message, param?, details?, request_id } }. " +
        "Limite por chave: 600 leituras e 300 escritas por minuto (headers RateLimit-*). Escopo exigido em x-scope; erros próprios do endpoint em x-errors.",
    },
    servers: [{ url: servidor }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "evs_live_..." } },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              required: ["type", "code", "message", "request_id"],
              properties: {
                type: { type: "string" },
                code: { type: "string" },
                message: { type: "string" },
                param: { type: "string" },
                details: {},
                request_id: { type: "string" },
              },
            },
          },
        },
      },
    },
    paths,
  };
}

export type OpenApiV1 = ReturnType<typeof montarOpenApi>;
export const CAMINHOS_DOCUMENTADOS = Object.keys(ROTAS);
export const METODOS_DOCUMENTADOS = Object.fromEntries(Object.entries(ROTAS).map(([c, m]) => [c, Object.keys(m).map((x) => x.toUpperCase())]));
