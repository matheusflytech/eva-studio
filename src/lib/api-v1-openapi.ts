// ---------------------------------------------------------------------------
// OpenAPI 3.1 da API pública v1, escrito à mão. Servido em
// /api/v1/openapi.json e lido pela página Integrações → API → Referência.
// Sem `server-only`: a página monta os exemplos curl a partir daqui.
//
// Ao mudar uma rota em src/app/api/v1/**, mude aqui também: o teste
// src/lib/api-v1-openapi.test.ts confere que todo arquivo de rota da v1 está
// documentado.
// ---------------------------------------------------------------------------

type Metodo = "get" | "post" | "put" | "patch" | "delete";

interface Op {
  tag: string;
  summary: string;
  description?: string;
  scope: string;
  query?: ReadonlyArray<readonly [nome: string, descricao: string]>;
  body?: Record<string, unknown>;
  idempotency?: "optional" | "required";
  status?: number;
}

const LISTA = [
  ["limit", "Itens por página (1–200, padrão 50)."],
  ["cursor", "next_cursor da página anterior (com os mesmos filtros)."],
  ["include_total", "true para incluir total (COUNT)."],
] as const;

function operacao(o: Op) {
  const parameters = [
    ...(o.query ?? []).map(([name, description]) => ({ name, in: "query", required: false, description, schema: { type: "string" } })),
    ...(o.idempotency
      ? [
          {
            name: "Idempotency-Key",
            in: "header",
            required: o.idempotency === "required",
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
    ...(parameters.length ? { parameters } : {}),
    ...(o.body ? { requestBody: { required: true, content: { "application/json": { schema: { type: "object" }, example: o.body } } } } : {}),
    responses: {
      [String(o.status ?? 200)]: { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
      "4XX": { description: "Erro de entrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
  };
}

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
    },
    post: {
      tag: "Contatos",
      summary: "Criar contato (409 duplicate se já existe)",
      scope: "contacts:write",
      idempotency: "optional",
      status: 201,
      body: { name: "Ana Souza", email: "ana@exemplo.com", phone: "+5511999998888", external_id: "erp-123", tag_ids: [], custom_fields: {} },
    },
  },
  "/contacts/upsert": {
    put: {
      tag: "Contatos",
      summary: "Criar ou atualizar (external_id → e-mail → telefone)",
      scope: "contacts:write",
      idempotency: "optional",
      body: { email: "ana@exemplo.com", name: "Ana Souza", job_title: "Compras" },
    },
  },
  "/contacts/batch": {
    post: {
      tag: "Contatos",
      summary: "Lote síncrono de até 100 (resultado por item)",
      scope: "contacts:write",
      idempotency: "required",
      body: { mode: "upsert", items: [{ email: "a@x.com", name: "A" }, { phone: "+5511988887777" }] },
    },
  },
  "/contacts/by-external-id/{externalId}": {
    get: { tag: "Contatos", summary: "Buscar pelo id externo", scope: "contacts:read", query: [["external_source", "Origem (padrão api)"]] },
    put: { tag: "Contatos", summary: "Upsert pelo id externo", scope: "contacts:write", idempotency: "optional", body: { name: "Ana", email: "ana@exemplo.com" } },
  },
  "/contacts/deleted": {
    get: { tag: "Contatos", summary: "Contatos apagados (para sincronizar)", scope: "contacts:read", query: [...LISTA, ["since", "ISO-8601"]] },
  },
  "/contacts/{id}": {
    get: { tag: "Contatos", summary: "Ler contato", scope: "contacts:read" },
    patch: {
      tag: "Contatos",
      summary: "Atualizar (parcial: ausente não muda, null limpa)",
      scope: "contacts:write",
      idempotency: "optional",
      body: { company_id: null, add_tag_ids: ["<tagId>"], opt_in: false },
    },
    delete: { tag: "Contatos", summary: "Apagar (fica em /contacts/deleted)", scope: "contacts:write" },
  },
  "/contacts/{id}/deals": { get: { tag: "Contatos", summary: "Negócios do contato", scope: "deals:read", query: [...LISTA] } },

  "/companies": {
    get: {
      tag: "Empresas",
      summary: "Listar empresas",
      scope: "companies:read",
      query: [...LISTA, ["updated_since", "ISO-8601"], ["cnpj", "Só dígitos"], ["owner", "Id do responsável"], ["name", "Contém"], ["external_id", "Id externo"], ["external_source", "Origem"]],
    },
    post: { tag: "Empresas", summary: "Criar empresa (CNPJ único)", scope: "companies:write", idempotency: "optional", status: 201, body: { name: "ACME Ltda", cnpj: "11.222.333/0001-81", external_id: "erp-c1" } },
  },
  "/companies/by-external-id/{externalId}": {
    get: { tag: "Empresas", summary: "Buscar pelo id externo", scope: "companies:read", query: [["external_source", "Origem"]] },
    put: { tag: "Empresas", summary: "Upsert pelo id externo (reserva: CNPJ)", scope: "companies:write", idempotency: "optional", body: { name: "ACME Ltda" } },
  },
  "/companies/deleted": { get: { tag: "Empresas", summary: "Empresas apagadas", scope: "companies:read", query: [...LISTA, ["since", "ISO-8601"]] } },
  "/companies/{id}": {
    get: { tag: "Empresas", summary: "Ler empresa", scope: "companies:read" },
    patch: { tag: "Empresas", summary: "Atualizar (parcial)", scope: "companies:write", idempotency: "optional", body: { city: "Campinas", uf: "SP" } },
    delete: { tag: "Empresas", summary: "Apagar (contatos e negócios ficam)", scope: "companies:write" },
  },

  "/deals": {
    get: {
      tag: "Negócios",
      summary: "Listar negócios",
      scope: "deals:read",
      query: [
        ...LISTA,
        ["updated_since", "ISO-8601"],
        ["pipeline", "Id do funil"],
        ["stage", "Id da etapa"],
        ["owner", "Id do responsável"],
        ["company", "Id da empresa"],
        ["contact", "Id do contato"],
        ["status", "open | won | lost"],
        ["archived", "true | false"],
        ["external_id", "Id externo"],
        ["external_source", "Origem"],
      ],
    },
    post: {
      tag: "Negócios",
      summary: "Criar negócio (409 se external_id já existe)",
      scope: "deals:write",
      idempotency: "optional",
      status: 201,
      body: { name: "Proposta ACME", pipeline_id: "<pipelineId>", amount_cents: 150000, contact_id: "<contactId>", external_id: "erp-d1", custom_fields: {} },
    },
  },
  "/deals/by-external-id/{externalId}": {
    get: { tag: "Negócios", summary: "Buscar pelo id externo", scope: "deals:read", query: [["external_source", "Origem"]] },
    put: { tag: "Negócios", summary: "Upsert pelo id externo", scope: "deals:write", idempotency: "optional", body: { name: "Proposta ACME", amount_cents: 180000 } },
  },
  "/deals/deleted": { get: { tag: "Negócios", summary: "Negócios apagados", scope: "deals:read", query: [...LISTA, ["since", "ISO-8601"]] } },
  "/deals/{id}": {
    get: { tag: "Negócios", summary: "Ler negócio", scope: "deals:read" },
    patch: { tag: "Negócios", summary: "Atualizar (parcial; stage_id move)", scope: "deals:write", idempotency: "optional", body: { amount_cents: 200000, owner_id: null } },
    delete: { tag: "Negócios", summary: "Apagar (fica em /deals/deleted)", scope: "deals:write" },
  },
  "/deals/{id}/move": {
    post: {
      tag: "Negócios",
      summary: "Mover de etapa",
      description: "Etapa de outro funil exige pipeline_id do funil da etapa (422 stage_in_other_pipeline).",
      scope: "deals:write",
      idempotency: "optional",
      body: { stage_id: "<stageId>", lost_reason: "" },
    },
  },
  "/deals/{id}/won": { post: { tag: "Negócios", summary: "Marcar como ganho", scope: "deals:write", idempotency: "optional" } },
  "/deals/{id}/lost": { post: { tag: "Negócios", summary: "Marcar como perdido", scope: "deals:write", idempotency: "optional", body: { lost_reason: "Preço" } } },
  "/deals/{id}/history": { get: { tag: "Negócios", summary: "Histórico de etapas", scope: "deals:read", query: [...LISTA] } },
  "/deals/{id}/contacts": {
    get: { tag: "Negócios", summary: "Contatos do negócio", scope: "deals:read" },
    post: { tag: "Negócios", summary: "Vincular contato", scope: "deals:write", idempotency: "optional", status: 201, body: { contact_id: "<contactId>", role: "decisor" } },
  },
  "/deals/{id}/contacts/{contactId}": { delete: { tag: "Negócios", summary: "Desvincular contato", scope: "deals:write" } },

  "/tasks": {
    get: {
      tag: "Tarefas e notas",
      summary: "Listar tarefas",
      scope: "tasks:read",
      query: [...LISTA, ["updated_since", "ISO-8601"], ["contact", "Id"], ["deal", "Id"], ["assigned_to", "Id"], ["status", "open | done"]],
    },
    post: { tag: "Tarefas e notas", summary: "Criar tarefa", scope: "tasks:write", idempotency: "optional", status: 201, body: { text: "Ligar para confirmar", type: "ligar", due: "2d", deal_id: "<dealId>" } },
  },
  "/tasks/{id}": {
    get: { tag: "Tarefas e notas", summary: "Ler tarefa", scope: "tasks:read" },
    patch: { tag: "Tarefas e notas", summary: "Atualizar / concluir", scope: "tasks:write", idempotency: "optional", body: { done: true } },
    delete: { tag: "Tarefas e notas", summary: "Apagar tarefa", scope: "tasks:write" },
  },
  "/notes": {
    get: { tag: "Tarefas e notas", summary: "Listar notas", scope: "notes:read", query: [...LISTA, ["created_since", "ISO-8601"], ["contact", "Id"], ["deal", "Id"]] },
    post: { tag: "Tarefas e notas", summary: "Criar nota", scope: "notes:write", idempotency: "optional", status: 201, body: { text: "Cliente pediu desconto.", deal_id: "<dealId>" } },
  },
  "/notes/{id}": {
    get: { tag: "Tarefas e notas", summary: "Ler nota", scope: "notes:read" },
    patch: { tag: "Tarefas e notas", summary: "Editar texto", scope: "notes:write", idempotency: "optional", body: { text: "Texto novo" } },
    delete: { tag: "Tarefas e notas", summary: "Apagar nota", scope: "notes:write" },
  },
  "/custom-fields": {
    get: { tag: "Configuração", summary: "Campos personalizados (leitura)", scope: "custom_fields:read", query: [["entity", "deal | contact"], ["pipeline", "Id do funil"]] },
  },
  "/tags": { get: { tag: "Configuração", summary: "Etiquetas", scope: "tags:read" } },

  "/pipelines": {
    get: { tag: "Funis", summary: "Funis com etapas", scope: "pipelines:read" },
    post: {
      tag: "Funis",
      summary: "Criar funil (até 15 funis, 20 etapas)",
      scope: "pipelines:write",
      idempotency: "optional",
      status: 201,
      body: { name: "Pós-venda", stages: [{ name: "Novo" }, { name: "Ganho", type: "won" }, { name: "Perdido", type: "lost" }] },
    },
  },
  "/pipelines/reorder": { post: { tag: "Funis", summary: "Reordenar funis", scope: "pipelines:write", body: { ids: ["<p1>", "<p2>"] } } },
  "/pipelines/{id}": {
    get: { tag: "Funis", summary: "Ler funil", scope: "pipelines:read" },
    patch: { tag: "Funis", summary: "Renomear / tornar padrão", scope: "pipelines:write", body: { name: "Vendas B2B", is_default: true } },
    delete: { tag: "Funis", summary: "Apagar (move_to obrigatório com negócios)", scope: "pipelines:write", query: [["move_to", "Id do funil de destino"]] },
  },
  "/pipelines/{id}/stages": {
    post: { tag: "Funis", summary: "Criar etapa", scope: "pipelines:write", status: 201, body: { name: "Proposta", type: "open", probability: 60 } },
  },
  "/pipelines/{id}/stages/reorder": { post: { tag: "Funis", summary: "Reordenar etapas", scope: "pipelines:write", body: { ids: ["<s1>", "<s2>"] } } },
  "/pipelines/{id}/stages/{stageId}": {
    patch: { tag: "Funis", summary: "Editar etapa", scope: "pipelines:write", body: { name: "Negociação", probability: 80 } },
    delete: { tag: "Funis", summary: "Apagar etapa (move_to com negócios)", scope: "pipelines:write", query: [["move_to", "Id da etapa de destino"]] },
  },

  "/imports": {
    post: {
      tag: "Importação e exportação",
      summary: "Importar em lote (assíncrono)",
      description: "records (até 5 mil), csv inline, ou upload: true para receber upload_url. Um import ativo por organização.",
      scope: "imports:write",
      idempotency: "required",
      status: 202,
      body: { entity: "contacts", mode: "upsert", dry_run: false, records: [{ name: "Ana", email: "ana@x.com", external_id: "erp-1" }] },
    },
  },
  "/imports/{id}": { get: { tag: "Importação e exportação", summary: "Estado da importação", scope: "imports:write" } },
  "/imports/{id}/errors": { get: { tag: "Importação e exportação", summary: "Erros por linha", scope: "imports:write", query: [["limit", "1–200"], ["cursor", "next_cursor"]] } },
  "/imports/{id}/start": { post: { tag: "Importação e exportação", summary: "Iniciar depois do upload", scope: "imports:write", status: 202 } },
  "/imports/{id}/cancel": { post: { tag: "Importação e exportação", summary: "Cancelar", scope: "imports:write" } },
  "/imports/{id}/retry-failed": { post: { tag: "Importação e exportação", summary: "Refazer as linhas que falharam", scope: "imports:write", idempotency: "required", status: 202 } },
  "/exports": {
    post: {
      tag: "Importação e exportação",
      summary: "Exportar (CSV ou JSONL)",
      scope: "exports:read",
      status: 202,
      body: { entity: "deals", format: "csv", filters: { pipeline: "<pipelineId>", updated_since: "2026-10-01T00:00:00Z" } },
    },
  },
  "/exports/{id}": { get: { tag: "Importação e exportação", summary: "Estado e download_url (15 min)", scope: "exports:read" } },
  "/exports/{id}/cancel": { post: { tag: "Importação e exportação", summary: "Cancelar exportação", scope: "exports:read" } },

  "/agents": { get: { tag: "Fluxos", summary: "Agentes", scope: "flows:read" } },
  "/agents/{id}/flow": {
    get: { tag: "Fluxos", summary: "Ler fluxo (nodes/edges)", scope: "flows:read" },
    put: {
      tag: "Fluxos",
      summary: "Substituir fluxo (validado; 422 invalid_flow)",
      scope: "flows:write",
      idempotency: "optional",
      body: {
        nodes: [
          { id: "n1", type: "flowNode", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } },
          { id: "n2", type: "flowNode", position: { x: 0, y: 190 }, data: { iconKey: "message", label: "Boas-vindas", detail: "Olá!" } },
          { id: "n3", type: "flowNode", position: { x: 0, y: 380 }, data: { iconKey: "end", label: "Fim" } },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2" },
          { id: "e2", source: "n2", target: "n3" },
        ],
      },
    },
  },
  "/agents/{id}/flow/versions": { get: { tag: "Fluxos", summary: "Versões anteriores", scope: "flows:read" } },
  "/agents/{id}/flow/restore": { post: { tag: "Fluxos", summary: "Restaurar versão (desfazer)", scope: "flows:write", body: { version_id: "<versionId>" } } },

  "/sequences": {
    get: { tag: "Sequências", summary: "Listar sequências", scope: "sequences:read", query: [...LISTA, ["agent", "Id do agente"]] },
    post: {
      tag: "Sequências",
      summary: "Criar sequência",
      scope: "sequences:write",
      idempotency: "optional",
      status: 201,
      body: { agent_id: "<agentId>", name: "Follow-up", channel: "whatsapp_meta", trigger: "tag", trigger_tag_id: "<tagId>", steps: [{ delay_minutes: 60, text: "Oi {nome}!" }] },
    },
  },
  "/sequences/{id}": {
    get: { tag: "Sequências", summary: "Ler sequência", scope: "sequences:read" },
    patch: { tag: "Sequências", summary: "Atualizar (steps substitui a régua)", scope: "sequences:write", idempotency: "optional", body: { active: true } },
    delete: { tag: "Sequências", summary: "Apagar sequência", scope: "sequences:write" },
  },
  "/sequences/{id}/enrollments": {
    get: { tag: "Sequências", summary: "Inscrições", scope: "sequences:read", query: [...LISTA, ["status", "active | done | stopped"]] },
    post: { tag: "Sequências", summary: "Inscrever contatos (até 100)", scope: "sequences:write", idempotency: "optional", body: { contact_ids: ["<contactId>"] } },
  },
  "/sequences/{id}/enrollments/{contactId}": { delete: { tag: "Sequências", summary: "Tirar contato da sequência", scope: "sequences:write" } },
};

export function montarOpenApi(servidor = "https://SEU-DOMINIO/api/v1") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [caminho, metodos] of Object.entries(ROTAS)) {
    const params = [...caminho.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    paths[caminho] = { ...(params.length ? { parameters: params } : {}) };
    for (const [metodo, op] of Object.entries(metodos)) paths[caminho][metodo] = operacao(op!);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Eva Studio — API do CRM",
      version: "1.0.0",
      description:
        "Autenticação: Authorization: Bearer evs_live_... (Integrações → API). JSON em snake_case, datas ISO-8601 em UTC, dinheiro em centavos. " +
        "Listas: { data, has_more, next_cursor }. Erro: { error: { type, code, message, param?, details?, request_id } }. " +
        "Limite por chave: 600 leituras e 300 escritas por minuto (headers RateLimit-*). Escopo exigido em x-scope.",
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
