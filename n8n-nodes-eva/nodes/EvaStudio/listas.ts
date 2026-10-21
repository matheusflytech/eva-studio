import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

// Listas dos seletores (funil, etapa, agente). Sem o escopo de leitura na
// chave a lista vem vazia com o erro do Eva; dá para colar o ID por expressão.

interface Etapa {
	id: string;
	name: string;
	type: string;
}
interface Funil {
	id: string;
	name: string;
	stages: Etapa[];
}

async function buscar<T>(ctx: ILoadOptionsFunctions, caminho: string): Promise<T[]> {
	const { baseUrl } = (await ctx.getCredentials('evaStudioApi')) as { baseUrl: string };
	const r = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'evaStudioApi', {
		method: 'GET',
		url: `${baseUrl.replace(/\/$/, '')}${caminho}`,
		json: true,
	})) as { data: T[] };
	return r.data ?? [];
}

const ROTULO_DO_TIPO: Record<string, string> = { won: ' (ganho)', lost: ' (perdido)' };

/** Funil escolhido no próprio nó: no topo (mover) ou nos campos adicionais (criar). */
function funilEscolhido(ctx: ILoadOptionsFunctions): string {
	const topo = ctx.getCurrentNodeParameter('pipelineFilter');
	if (typeof topo === 'string' && topo) return topo;
	const extra = ctx.getCurrentNodeParameter('additionalFields') as { pipeline_id?: string } | undefined;
	return extra?.pipeline_id ?? '';
}

export const listas = {
	async getPipelines(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const funis = await buscar<Funil>(this, '/pipelines');
		return funis.map((f) => ({ name: f.name, value: f.id }));
	},

	async getStages(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const funis = await buscar<Funil>(this, '/pipelines');
		const id = funilEscolhido(this);
		const alvo = id ? funis.filter((f) => f.id === id) : funis;
		// Sem funil escolhido: todas, com o nome do funil na frente.
		return alvo.flatMap((f) =>
			f.stages.map((s) => ({ name: `${alvo.length > 1 ? `${f.name} › ` : ''}${s.name}${ROTULO_DO_TIPO[s.type] ?? ''}`, value: s.id })),
		);
	},

	async getAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const agentes = await buscar<{ id: string; name: string }>(this, '/agents');
		return agentes.map((a) => ({ name: a.name, value: a.id }));
	},
};
