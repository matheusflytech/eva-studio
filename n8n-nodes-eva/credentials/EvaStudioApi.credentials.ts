import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Chave de API do Eva Studio (Integrações → Chaves de API) e o endereço da
 * API. O teste chama GET /me, que responde com o contrato e os escopos.
 */
export class EvaStudioApi implements ICredentialType {
	name = 'evaStudioApi';

	displayName = 'Eva Studio API';

	icon = 'file:eva.svg' as const;

	documentationUrl = 'https://evapp.vercel.app/integracoes/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'Chave de API',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'evs_live_...',
		},
		{
			displayName: 'Endereço da API',
			name: 'baseUrl',
			type: 'string',
			default: 'https://evapp.vercel.app/api/v1/SEU-CONTRATO',
			required: true,
			description: 'Termina em /api/v1/<id do contrato> (o mesmo da URL do app, ex.: 8d8d3a8c). Está na tela Integrações → n8n e webhooks.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: { Authorization: '=Bearer {{$credentials.apiKey}}' },
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\/$/, "")}}',
			url: '/me',
		},
	};
}
