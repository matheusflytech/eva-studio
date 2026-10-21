import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { listas } from '../nodes/EvaStudio/listas';

const funis = [
	{ id: 'p1', name: 'Vendas', stages: [{ id: 's1', name: 'Novo', type: 'open' }, { id: 's2', name: 'Ganho', type: 'won' }] },
	{ id: 'p2', name: 'Pós-venda', stages: [{ id: 's3', name: 'Onboarding', type: 'open' }] },
];

function ctx(params: Record<string, unknown>) {
	const pedidos: string[] = [];
	const c = {
		getCredentials: async () => ({ baseUrl: 'https://eva.test/api/v1/' }),
		getCurrentNodeParameter: (n: string) => params[n],
		helpers: {
			httpRequestWithAuthentication: async (_cred: string, o: { url: string }) => {
				pedidos.push(o.url);
				return { data: funis };
			},
		},
	};
	return { c: c as unknown as ILoadOptionsFunctions, pedidos };
}

test('funis: nome e id, sem barra dupla no endereço', async () => {
	const { c, pedidos } = ctx({});
	assert.deepEqual(await listas.getPipelines.call(c), [{ name: 'Vendas', value: 'p1' }, { name: 'Pós-venda', value: 'p2' }]);
	assert.equal(pedidos[0], 'https://eva.test/api/v1/pipelines');
});

test('etapas: só do funil escolhido no topo (mover)', async () => {
	const { c } = ctx({ pipelineFilter: 'p1' });
	assert.deepEqual(await listas.getStages.call(c), [{ name: 'Novo', value: 's1' }, { name: 'Ganho (ganho)', value: 's2' }]);
});

test('etapas: funil dos campos adicionais (criar) ou todas com o nome do funil', async () => {
	assert.deepEqual((await listas.getStages.call(ctx({ additionalFields: { pipeline_id: 'p2' } }).c)).map((o) => o.value), ['s3']);
	const todas = await listas.getStages.call(ctx({}).c);
	assert.equal(todas.length, 3);
	assert.equal(todas[2].name, 'Pós-venda › Onboarding');
});
