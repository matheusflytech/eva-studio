// O que fazer quando a conexão com o WhatsApp fecha. Puro (sem Baileys nem
// banco) para dar para testar; os códigos são os do DisconnectReason do Baileys.
//
//   401 loggedOut           a pessoa desconectou no celular: limpa a sessão
//   403 forbidden           o WhatsApp recusou o número: para (insistir piora)
//   440 connectionReplaced  outra sessão abriu com as mesmas credenciais (outro
//                           worker no ar, WhatsApp Web): para, senão as duas
//                           ficam se derrubando
//   408 sem pareamento      o QR expirou sem leitura: normal, gera outro QR
//   408 já pareado          a rede caiu: reconecta, com aviso
//   515 restartRequired     reinício logo depois de parear: normal
//   outros                  reconecta, cada vez esperando mais (até 1 min)

export const CODIGOS = { loggedOut: 401, forbidden: 403, connectionLost: 408, connectionReplaced: 440, restartRequired: 515 };

const ATRASO_INICIAL_MS = 3000;
const ATRASO_MAXIMO_MS = 60_000;

/**
 * @param {number | undefined} statusCode código do fechamento
 * @param {{ pareado: boolean, tentativas: number }} s pareado: as credenciais já
 *   foram registradas (o QR foi lido); tentativas: quedas seguidas sem abrir
 * @returns {{ acao: "logout" } | { acao: "parar", erro: string } | { acao: "reconectar", atrasoMs: number, erro: string | null }}
 */
export function decidirReconexao(statusCode, { pareado, tentativas }) {
  if (statusCode === CODIGOS.loggedOut) return { acao: "logout" };
  if (statusCode === CODIGOS.connectionReplaced) {
    return { acao: "parar", erro: "Esta sessão foi aberta em outro lugar (outro worker ou WhatsApp Web). Conecte de novo pelo QR." };
  }
  if (statusCode === CODIGOS.forbidden) {
    return { acao: "parar", erro: "O WhatsApp recusou a conexão deste número (código 403). Confira o número no celular antes de conectar de novo." };
  }
  const normal = statusCode === CODIGOS.restartRequired || (statusCode === CODIGOS.connectionLost && !pareado);
  if (normal) return { acao: "reconectar", atrasoMs: ATRASO_INICIAL_MS, erro: null };
  const atrasoMs = Math.min(ATRASO_MAXIMO_MS, ATRASO_INICIAL_MS * 2 ** Math.max(0, tentativas));
  return { acao: "reconectar", atrasoMs, erro: `Conexão caiu (código ${statusCode ?? "desconhecido"}), tentando de novo...` };
}
