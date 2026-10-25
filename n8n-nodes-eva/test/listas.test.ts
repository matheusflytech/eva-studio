import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { listas } from '../nodes/EvaStudio/listas';

const funis = [
	{ id: 1, name: 'Vendas', stages: [{ id: 1, name: 'Novo', type: 'open' }, { id: 2, name: 'Ganho', type: 'won' }] },
	{ id: 2, name: 'Pós-venda', stages: [{ id: 3, name: 'Onboarding', type: 'open' }] },
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

test('funis: número e nome, sem barra dupla no endereço', async () => {
	const { c, pedidos } = ctx({});
	assert.deepEqual(await listas.getPipelines.call(c), [{ name: '1 · Vendas', value: 1 }, { name: '2 · Pós-venda', value: 2 }]);
	assert.equal(pedidos[0], 'https://eva.test/api/v1/pipelines');
});

test('etapas: só do funil escolhido no topo (mover)', async () => {
	const { c } = ctx({ pipelineFilter: 1 });
	assert.deepEqual(await listas.getStages.call(c), [{ name: '1 · Novo', value: 1 }, { name: '2 · Ganho (ganho)', value: 2 }]);
});

test('etapas: funil dos campos adicionais (criar) ou todas com o nome do funil', async () => {
	assert.deepEqual((await listas.getStages.call(ctx({ additionalFields: { pipeline_id: '2' } }).c)).map((o) => o.value), [3]);
	const todas = await listas.getStages.call(ctx({}).c);
	assert.equal(todas.length, 3);
	assert.equal(todas[2].name, 'Pós-venda › 3 · Onboarding');
});
