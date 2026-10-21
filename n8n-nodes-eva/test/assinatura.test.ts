import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assinaturaConfere } from '../nodes/EvaStudio/assinatura';

// Vetor oficial do README da especificação Standard Webhooks.
const segredo = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const corpo = '{"test": 2432232314}';
const headers = { id: 'msg_p5jXN8AQM9LWM0D4loKWxJek', timestamp: '1614265330', signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=' };

test('confere o vetor da especificação', () => {
	assert.equal(assinaturaConfere(segredo, headers, corpo, 1614265330_000), true);
});

test('recusa corpo mexido, horário velho e header faltando', () => {
	assert.equal(assinaturaConfere(segredo, headers, corpo + ' ', 1614265330_000), false);
	assert.equal(assinaturaConfere(segredo, headers, corpo, 1614265330_000 + 301_000), false);
	assert.equal(assinaturaConfere(segredo, { ...headers, signature: undefined }, corpo, 1614265330_000), false);
});

test('aceita a certa entre várias (rotação)', () => {
	const outra = 'v1,' + createHmac('sha256', 'x').update('y').digest('base64');
	assert.equal(assinaturaConfere(segredo, { ...headers, signature: `${outra} ${headers.signature}` }, corpo, 1614265330_000), true);
});
