import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IPollFunctions } from 'n8n-workflow';
import { EvaStudioPollTrigger } from '../nodes/EvaStudioPollTrigger/EvaStudioPollTrigger.node';

function ctx(modo: 'trigger' | 'manual', respostas: unknown[], estado: Record<string, unknown> = {}) {
	const pedidos: Record<string, unknown>[] = [];
	const c = {
		getCredentials: async () => ({ baseUrl: 'https://eva.test/api/v1' }),
		getNodeParameter: () => ['deal.won'],
		getWorkflowStaticData: () => estado,
		getMode: () => modo,
		helpers: {
			httpRequestWithAuthentication: async (_c: string, o: { qs: Record<string, unknown> }) => {
				pedidos.push(o.qs);
				return respostas.shift();
			},
			returnJsonArray: (l: unknown[]) => l.map((json) => ({ json })),
		},
	};
	return { c: c as unknown as IPollFunctions, pedidos, estado };
}

const no = new EvaStudioPollTrigger();

test('primeira consulta começa do agora e guarda o cursor', async () => {
	const { c, pedidos, estado } = ctx('trigger', [{ data: [{ id: 'evt_1' }], has_more: false, next_cursor: 'C1' }]);
	const r = await no.poll.call(c);
	assert.equal(r?.[0].length, 1);
	assert.ok(typeof pedidos[0].since === 'string' && Date.now() - Date.parse(pedidos[0].since as string) < 5000);
	assert.equal(estado.cursor, 'C1');
});

test('depois só manda o cursor; sem novidade devolve null e mantém o cursor', async () => {
	const { c, pedidos, estado } = ctx('trigger', [{ data: [], has_more: false, next_cursor: 'C1' }], { tipos: 'deal.won', cursor: 'C1' });
	assert.equal(await no.poll.call(c), null);
	assert.equal(pedidos[0].cursor, 'C1');
	assert.equal(pedidos[0].since, undefined);
	assert.equal(estado.cursor, 'C1');
});

test('segue as páginas enquanto has_more', async () => {
	const { c, pedidos } = ctx('trigger', [
		{ data: [{ id: 'a' }], has_more: true, next_cursor: 'C2' },
		{ data: [{ id: 'b' }], has_more: false, next_cursor: 'C3' },
	], { tipos: 'deal.won', cursor: 'C1' });
	const r = await no.poll.call(c);
	assert.equal(r?.[0].length, 2);
	assert.equal(pedidos[1].cursor, 'C2');
});

test('teste manual traz só o último evento dos 30 dias, sem mexer no cursor', async () => {
	const { c, estado } = ctx('manual', [{ data: [{ id: 'a' }, { id: 'b' }], has_more: false, next_cursor: 'CX' }], { tipos: 'deal.won', cursor: 'C1' });
	const r = await no.poll.call(c);
	assert.deepEqual(r?.[0].map((i) => i.json), [{ id: 'b' }]);
	assert.equal(estado.cursor, 'C1');
});
