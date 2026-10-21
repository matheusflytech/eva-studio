import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Confere a assinatura Standard Webhooks que o Eva Studio manda em todo
 * evento: webhook-signature = "v1,<base64 HMAC-SHA256 de id.timestamp.corpo>",
 * com a chave = base64 do segredo sem o prefixo "whsec_". Recusa horário com
 * mais de 5 minutos de diferença.
 */
export function assinaturaConfere(
	segredo: string,
	headers: { id?: string; timestamp?: string; signature?: string },
	corpo: string,
	agoraMs = Date.now(),
): boolean {
	const { id, timestamp, signature } = headers;
	if (!segredo || !id || !timestamp || !signature) return false;
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || Math.abs(agoraMs / 1000 - ts) > 300) return false;
	const chave = Buffer.from(segredo.startsWith('whsec_') ? segredo.slice(6) : segredo, 'base64');
	const esperada = Buffer.from(`v1,${createHmac('sha256', chave).update(`${id}.${ts}.${corpo}`).digest('base64')}`);
	return signature.split(' ').some((s) => {
		const b = Buffer.from(s);
		return b.length === esperada.length && timingSafeEqual(b, esperada);
	});
}
