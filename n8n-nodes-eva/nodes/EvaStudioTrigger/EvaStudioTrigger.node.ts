import {
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';
import { assinaturaConfere } from '../EvaStudio/assinatura';

/**
 * Gatilho: ao ativar o workflow, assina os eventos escolhidos no Eva Studio
 * (POST /webhooks) e guarda o id e o segredo; ao desativar, cancela
 * (DELETE /webhooks/{id}). Cada evento recebido tem a assinatura conferida
 * antes de seguir.
 */
export class EvaStudioTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Eva Studio Trigger',
		name: 'evaStudioTrigger',
		icon: 'file:eva.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Começa o workflow quando algo acontece no CRM do Eva Studio',
		defaults: { name: 'Eva Studio Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'evaStudioApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook', rawBody: true }],
		properties: [
			{
				displayName: 'Eventos',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['deal.stage_changed'],
				options: [
					{ name: 'Contato Alterado', value: 'contact.updated' },
					{ name: 'Contato Criado', value: 'contact.created' },
					{ name: 'Contato Pediu Para Não Receber', value: 'contact.opted_out' },
					{ name: 'Empresa Alterada', value: 'company.updated' },
					{ name: 'Empresa Criada', value: 'company.created' },
					{ name: 'Etiqueta Adicionada', value: 'contact.tag_added' },
					{ name: 'Etiqueta Removida', value: 'contact.tag_removed' },
					{ name: 'Lead Capturado', value: 'lead.captured' },
					{ name: 'Mensagem Recebida', value: 'message.received' },
					{ name: 'Negócio Alterado', value: 'deal.updated' },
					{ name: 'Negócio Criado', value: 'deal.created' },
					{ name: 'Negócio Ganho', value: 'deal.won' },
					{ name: 'Negócio Mudou De Etapa', value: 'deal.stage_changed' },
					{ name: 'Negócio Perdido', value: 'deal.lost' },
					{ name: 'Negócio Reaberto', value: 'deal.reopened' },
					{ name: 'Responsável Do Negócio Alterado', value: 'deal.owner_changed' },
					{ name: 'Tarefa Concluída', value: 'task.completed' },
					{ name: 'Tarefa Criada', value: 'task.created' },
					{ name: 'Todos (Inclusive Os Novos)', value: '*' },
				],
			},
			{
				displayName: 'Só Do Funil (ID)',
				name: 'pipelineId',
				type: 'string',
				default: '',
				description: 'Opcional. Nos eventos de negócio, deixa passar só os deste funil.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const estado = this.getWorkflowStaticData('node');
				if (!estado.webhookId) return false;
				const { baseUrl } = (await this.getCredentials('evaStudioApi')) as { baseUrl: string };
				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'evaStudioApi', {
						method: 'GET',
						url: `${baseUrl.replace(/\/$/, '')}/webhooks/${estado.webhookId}`,
						json: true,
					});
					return true;
				} catch {
					delete estado.webhookId;
					delete estado.secret;
					return false;
				}
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				const { baseUrl } = (await this.getCredentials('evaStudioApi')) as { baseUrl: string };
				const resposta = (await this.helpers.httpRequestWithAuthentication.call(this, 'evaStudioApi', {
					method: 'POST',
					url: `${baseUrl.replace(/\/$/, '')}/webhooks`,
					body: { url, events: this.getNodeParameter('events') as string[], description: `n8n: ${this.getWorkflow().name ?? ''}`.slice(0, 200) },
					json: true,
				})) as { data: { id: string; secret: string } };
				const estado = this.getWorkflowStaticData('node');
				estado.webhookId = resposta.data.id;
				estado.secret = resposta.data.secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const estado = this.getWorkflowStaticData('node');
				if (estado.webhookId) {
					const { baseUrl } = (await this.getCredentials('evaStudioApi')) as { baseUrl: string };
					try {
						await this.helpers.httpRequestWithAuthentication.call(this, 'evaStudioApi', {
							method: 'DELETE',
							url: `${baseUrl.replace(/\/$/, '')}/webhooks/${estado.webhookId}`,
							json: true,
						});
					} catch {
						// Já apagado na tela: segue.
					}
				}
				delete estado.webhookId;
				delete estado.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject() as unknown as { rawBody?: Buffer; body: IDataObject; headers: Record<string, string | undefined> };
		const estado = this.getWorkflowStaticData('node');
		const corpo = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
		const ok = assinaturaConfere(
			String(estado.secret ?? ''),
			{ id: req.headers['webhook-id'], timestamp: req.headers['webhook-timestamp'], signature: req.headers['webhook-signature'] },
			corpo,
		);
		if (!ok) {
			const res = this.getResponseObject();
			res.status(401).json({ error: 'assinatura inválida' });
			return { noWebhookResponse: true };
		}

		const evento = JSON.parse(corpo) as IDataObject & { type?: string; data?: IDataObject };
		const funil = (this.getNodeParameter('pipelineId', '') as string).trim();
		if (funil && String(evento.type ?? '').startsWith('deal.') && evento.data?.pipeline_id !== funil) {
			return { workflowData: [] };
		}
		return { workflowData: [this.helpers.returnJsonArray([{ ...evento, webhook_id: req.headers['webhook-id'] }])] };
	}
}
