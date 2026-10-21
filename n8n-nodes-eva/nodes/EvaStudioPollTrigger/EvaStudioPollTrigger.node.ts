import {
	NodeConnectionTypes,
	type IDataObject,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type IPollFunctions,
} from 'n8n-workflow';

/**
 * Gatilho por consulta: para n8n sem URL pública (no computador, atrás de
 * firewall). A cada intervalo pergunta ao Eva Studio o que aconteceu desde a
 * última vez (GET /events com o cursor guardado). Ao ativar, começa do
 * agora: não despeja o histórico. No teste manual, traz o último evento.
 */
export class EvaStudioPollTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Eva Studio Trigger (Consulta)',
		name: 'evaStudioPollTrigger',
		icon: 'file:eva.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Consulta os eventos do CRM do Eva Studio de tempos em tempos (sem URL pública)',
		defaults: { name: 'Eva Studio Trigger (Consulta)' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'evaStudioApi', required: true }],
		properties: [
			{
				displayName: 'Eventos',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['deal.won'],
				description: 'Alteração de contato e mensagem recebida só existem no gatilho por webhook',
				options: [
					{ name: 'Contato Criado', value: 'contact.created' },
					{ name: 'Lead Capturado', value: 'lead.captured' },
					{ name: 'Negócio Criado', value: 'deal.created' },
					{ name: 'Negócio Ganho', value: 'deal.won' },
					{ name: 'Negócio Mudou De Etapa', value: 'deal.stage_changed' },
					{ name: 'Negócio Perdido', value: 'deal.lost' },
					{ name: 'Negócio Reaberto', value: 'deal.reopened' },
					{ name: 'Tarefa Concluída', value: 'task.completed' },
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const { baseUrl } = (await this.getCredentials('evaStudioApi')) as { baseUrl: string };
		const base = baseUrl.replace(/\/$/, '');
		const tipos = (this.getNodeParameter('events') as string[]).join(',');
		const estado = this.getWorkflowStaticData('node') as { cursor?: string; desde?: string; tipos?: string };
		const manual = this.getMode() === 'manual';

		// Trocou os eventos: o cursor antigo vale para outro filtro; recomeça do agora.
		if (estado.tipos !== tipos) {
			estado.tipos = tipos;
			delete estado.cursor;
			estado.desde = new Date().toISOString();
		}

		const qs: IDataObject = { types: tipos, limit: 200 };
		if (manual) qs.since = new Date(Date.now() - 30 * 86_400_000).toISOString();
		else if (estado.cursor) qs.cursor = estado.cursor;
		else qs.since = estado.desde ?? new Date().toISOString();

		const eventos: IDataObject[] = [];
		let cursor: string | null = null;
		// Até 5 páginas por consulta; o resto vem na próxima.
		for (let i = 0; i < 5; i++) {
			const r = (await this.helpers.httpRequestWithAuthentication.call(this, 'evaStudioApi', {
				method: 'GET',
				url: `${base}/events`,
				qs: cursor ? { types: tipos, limit: 200, cursor } : qs,
				json: true,
			})) as { data: IDataObject[]; has_more: boolean; next_cursor: string | null };
			eventos.push(...r.data);
			cursor = r.next_cursor ?? cursor;
			if (!r.has_more || manual) break;
		}

		if (manual) {
			const ultimo = eventos.at(-1);
			return ultimo ? [this.helpers.returnJsonArray([ultimo])] : null;
		}
		if (cursor) estado.cursor = cursor;
		return eventos.length ? [this.helpers.returnJsonArray(eventos)] : null;
	}
}
