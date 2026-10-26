import { NodeConnectionTypes, type INodeProperties, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { listas } from './listas';

// ---------------------------------------------------------------------------
// Nó de ação do Eva Studio, declarativo (só `routing`, sem código de
// execução): cada operação é uma chamada da API v1. Campos opcionais ficam
// em "Campos adicionais" e só vão no corpo quando preenchidos (a API recusa
// campo desconhecido, então nada de mandar chave vazia).
// ---------------------------------------------------------------------------

type Recurso = 'contact' | 'deal' | 'task' | 'note' | 'message';

const mostrar = (resource: Recurso, operation?: string[]) => ({
	show: { resource: [resource], ...(operation ? { operation } : {}) },
});

/** Campo de texto que vai no corpo com o nome da API. */
const noCorpo = (displayName: string, property: string, extra: Partial<INodeProperties> = {}): INodeProperties => ({
	displayName,
	name: property,
	type: 'string',
	default: '',
	routing: { send: { type: 'body', property } },
	...extra,
});

/** Lista paginada por cursor: segue next_cursor até has_more = false. */
const paginacao = (resource: Recurso, operation: string): INodeProperties[] => [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: mostrar(resource, [operation]),
		routing: {
			send: {
				paginate: '={{ $value }}',
			},
			operations: {
				pagination: {
					type: 'generic',
					properties: {
						continue: '={{ $response.body.has_more }}',
						request: { qs: { cursor: '={{ $response.body.next_cursor }}', limit: 200 } },
					},
				},
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 200 },
		description: 'Max number of results to return',
		displayOptions: { show: { resource: [resource], operation: [operation], returnAll: [false] } },
		routing: { send: { type: 'query', property: 'limit' } },
	},
	{
		displayName: 'Atualizados Desde',
		name: 'updatedSince',
		type: 'dateTime',
		default: '',
		description: 'Só o que mudou depois desta data (bom para sincronizar por partes)',
		displayOptions: mostrar(resource, [operation]),
		routing: { send: { type: 'query', property: 'updated_since', value: '={{ $value || undefined }}' } },
	},
];

const camposDeContato: INodeProperties[] = [
	noCorpo('E-Mail', 'email', { placeholder: 'ana@empresa.com' }),
	noCorpo('Telefone', 'phone', { placeholder: '5511999998888' }),
	noCorpo('Cargo', 'job_title'),
	noCorpo('ID Da Empresa', 'company_id'),
	noCorpo('ID Do Responsável', 'owner_id'),
	noCorpo('Observações', 'notes', { typeOptions: { rows: 3 } }),
	{
		displayName: 'Campos Personalizados (JSON)',
		name: 'custom_fields',
		type: 'json',
		default: '{}',
		description: 'Objeto com a chave de cada campo personalizado, por exemplo {"cpf": "123"}',
		routing: { send: { type: 'body', property: 'custom_fields', value: '={{ JSON.parse($value) }}' } },
	},
];

/** Seletor que busca a lista no Eva (aceita expressão com o ID também). */
const seletor = (displayName: string, property: string, metodo: keyof typeof listas, extra: Partial<INodeProperties> = {}): INodeProperties => ({
	displayName,
	name: property,
	type: 'options',
	default: '',
	typeOptions: { loadOptionsMethod: metodo },
	description: 'Escolha da lista ou use uma expressão com o número (funil/etapa no contrato)',
	routing: { send: { type: 'body', property } },
	...extra,
});

const camposDeNegocio: INodeProperties[] = [
	seletor('Funil Name or ID', 'pipeline_id', 'getPipelines'),
	seletor('Etapa Name or ID', 'stage_id', 'getStages', { typeOptions: { loadOptionsMethod: 'getStages', loadOptionsDependsOn: ['additionalFields.pipeline_id'] } }),
	{
		displayName: 'Valor (Centavos)',
		name: 'amount_cents',
		type: 'number',
		default: 0,
		routing: { send: { type: 'body', property: 'amount_cents' } },
	},
	noCorpo('ID Do Contato', 'contact_id'),
	noCorpo('ID Da Empresa', 'company_id'),
	noCorpo('ID Do Responsável', 'owner_id'),
	noCorpo('Previsão De Fechamento', 'expected_closing_at', { type: 'dateTime' }),
	noCorpo('Descrição', 'description', { typeOptions: { rows: 3 } }),
	{
		displayName: 'Campos Personalizados (JSON)',
		name: 'custom_fields',
		type: 'json',
		default: '{}',
		routing: { send: { type: 'body', property: 'custom_fields', value: '={{ JSON.parse($value) }}' } },
	},
];

const idNoCaminho = (resource: Recurso, operations: string[], nome = 'ID'): INodeProperties => ({
	displayName: nome,
	name: 'id',
	type: 'string',
	required: true,
	default: '',
	displayOptions: mostrar(resource, operations),
});

const propriedades: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		default: 'contact',
		options: [
			{ name: 'Contato', value: 'contact' },
			{ name: 'Mensagem', value: 'message' },
			{ name: 'Negócio', value: 'deal' },
			{ name: 'Nota', value: 'note' },
			{ name: 'Tarefa', value: 'task' },
		],
	},

	// ---- Contato ----
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: mostrar('contact'),
		default: 'upsert',
		options: [
			{ name: 'Create', value: 'create', action: 'Create a contact', routing: { request: { method: 'POST', url: '/contacts' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
			{ name: 'Create or Update', value: 'upsert', action: 'Create or update a contact', description: 'Acha por e-mail ou telefone; cria se não achar', routing: { request: { method: 'PUT', url: '/contacts/upsert' } } },
			{ name: 'Get', value: 'get', action: 'Get a contact', routing: { request: { method: 'GET', url: '=/contacts/{{$parameter.id}}' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
			{ name: 'Get Many', value: 'getAll', action: 'Get many contacts', routing: { request: { method: 'GET', url: '/contacts' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
			{ name: 'Update', value: 'update', action: 'Update a contact', routing: { request: { method: 'PATCH', url: '=/contacts/{{$parameter.id}}' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
		],
	},
	idNoCaminho('contact', ['get', 'update'], 'ID Do Contato'),
	{
		displayName: 'Campos Adicionais',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Adicionar campo',
		default: {},
		displayOptions: mostrar('contact', ['create', 'upsert', 'update']),
		description: 'Na criação, informe pelo menos nome, e-mail ou telefone',
		options: [noCorpo('Nome', 'name'), ...camposDeContato],
	},
	...paginacao('contact', 'getAll'),

	// ---- Negócio ----
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: mostrar('deal'),
		default: 'create',
		options: [
			{ name: 'Create', value: 'create', action: 'Create a deal', routing: { request: { method: 'POST', url: '/deals' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
			{ name: 'Get', value: 'get', action: 'Get a deal', routing: { request: { method: 'GET', url: '=/deals/{{$parameter.id}}' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
			{ name: 'Get Many', value: 'getAll', action: 'Get many deals', routing: { request: { method: 'GET', url: '/deals' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
			{ name: 'Mark as Lost', value: 'lost', action: 'Mark a deal as lost', routing: { request: { method: 'POST', url: '=/deals/{{$parameter.id}}/lost' } } },
			{ name: 'Mark as Won', value: 'won', action: 'Mark a deal as won', routing: { request: { method: 'POST', url: '=/deals/{{$parameter.id}}/won' } } },
			{ name: 'Move Stage', value: 'move', action: 'Move a deal to another stage', routing: { request: { method: 'POST', url: '=/deals/{{$parameter.id}}/move' } } },
			{ name: 'Update', value: 'update', action: 'Update a deal', routing: { request: { method: 'PATCH', url: '=/deals/{{$parameter.id}}' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } },
		],
	},
	idNoCaminho('deal', ['get', 'update', 'move', 'won', 'lost'], 'ID Do Negócio'),
	{ ...noCorpo('Nome', 'name', { required: true }), displayOptions: mostrar('deal', ['create']) },
	{
		displayName: 'Funil Name or ID',
		name: 'pipelineFilter',
		type: 'options',
		default: '',
		typeOptions: { loadOptionsMethod: 'getPipelines' },
		description: 'Só para filtrar a lista de etapas abaixo. Choose from the list, or specify the pipeline number using an expression.',
		displayOptions: mostrar('deal', ['move']),
	},
	{
		...seletor('Etapa Name or ID', 'stage_id', 'getStages', {
			required: true,
			typeOptions: { loadOptionsMethod: 'getStages', loadOptionsDependsOn: ['pipelineFilter'] },
		}),
		displayOptions: mostrar('deal', ['move']),
	},
	{ ...noCorpo('Motivo Da Perda', 'lost_reason', { description: 'Texto do motivo; casa com um motivo do funil quando o rótulo bate' }), displayOptions: mostrar('deal', ['lost']) },
	{
		displayName: 'Campos Adicionais',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Adicionar campo',
		default: {},
		displayOptions: mostrar('deal', ['create', 'update']),
		options: [noCorpo('Nome', 'name'), ...camposDeNegocio],
	},
	...paginacao('deal', 'getAll'),

	// ---- Tarefa ----
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: mostrar('task'),
		default: 'create',
		options: [{ name: 'Create', value: 'create', action: 'Create a task', routing: { request: { method: 'POST', url: '/tasks' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } }],
	},
	{ ...noCorpo('Texto', 'text', { required: true }), displayOptions: mostrar('task', ['create']) },
	{
		displayName: 'Campos Adicionais',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Adicionar campo',
		default: {},
		displayOptions: mostrar('task', ['create']),
		options: [
			noCorpo('Tipo', 'type', { placeholder: 'ligar' }),
			noCorpo('Prazo', 'due', { placeholder: '2d', description: 'Relativo (2d, 3h) ou data ISO-8601 em due_at' }),
			noCorpo('ID Do Negócio', 'deal_id'),
			noCorpo('ID Do Contato', 'contact_id'),
			noCorpo('ID Do Responsável', 'assigned_to_id'),
		],
	},

	// ---- Nota ----
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: mostrar('note'),
		default: 'create',
		options: [{ name: 'Create', value: 'create', action: 'Create a note', routing: { request: { method: 'POST', url: '/notes' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } } }],
	},
	{ ...noCorpo('Texto', 'text', { required: true, typeOptions: { rows: 3 } }), displayOptions: mostrar('note', ['create']) },
	{
		displayName: 'Campos Adicionais',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Adicionar campo',
		default: {},
		displayOptions: mostrar('note', ['create']),
		options: [noCorpo('ID Do Negócio', 'deal_id'), noCorpo('ID Do Contato', 'contact_id')],
	},

	// ---- Mensagem ----
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: mostrar('message'),
		default: 'send',
		options: [
			{
				name: 'Send',
				value: 'send',
				action: 'Send a message through an agent',
				description: 'Manda pelo canal do agente, com a regra da janela de 24h',
				routing: { request: { method: 'POST', url: '/messages' }, output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] } },
			},
		],
	},
	{ ...seletor('Agente Name or ID', 'agent_id', 'getAgents', { required: true }), displayOptions: mostrar('message', ['send']) },
	{
		...noCorpo('ID Da Conversa', 'conversation_id', {
			placeholder: 'whatsapp_qr:5511999998888',
			description: 'O conversation_id que chegou do bloco "Enviar para o n8n". Ou use Canal + Para nos campos adicionais.',
		}),
		displayOptions: mostrar('message', ['send']),
	},
	{ ...noCorpo('Texto', 'text', { typeOptions: { rows: 3 } }), displayOptions: mostrar('message', ['send']) },
	{
		displayName: 'Campos Adicionais',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Adicionar campo',
		default: {},
		displayOptions: mostrar('message', ['send']),
		options: [
			noCorpo('Canal', 'channel', { placeholder: 'whatsapp_meta' }),
			noCorpo('Para', 'to', { placeholder: '5511999998888' }),
			noCorpo('ID Do Modelo Aprovado', 'template_id', { description: 'WhatsApp oficial fora da janela de 24h' }),
			{
				displayName: 'Variáveis Do Modelo (JSON)',
				name: 'variables',
				type: 'json',
				default: '{}',
				routing: { send: { type: 'body', property: 'variables', value: '={{ JSON.parse($value) }}' } },
			},
		],
	},
];

export class EvaStudio implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Eva Studio',
		name: 'evaStudio',
		icon: 'file:eva.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Contatos, negócios, tarefas, notas e mensagens pelo agente no Eva Studio',
		defaults: { name: 'Eva Studio' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'evaStudioApi', required: true }],
		requestDefaults: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/$/, "")}}',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		},
		properties: propriedades,
	};

	methods = { loadOptions: listas };
}
