// Versão única da Graph API para o app inteiro. Trocar aqui sobe tudo junto.
export const GRAPH_VERSION = "v21.0";
export const FACEBOOK_GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const INSTAGRAM_GRAPH = `https://graph.instagram.com/${GRAPH_VERSION}`;

/**
 * Token do Instagram Login (começa com "IG") só vale em graph.instagram.com;
 * token de Página do Facebook (conexão manual/FB Login) vale em graph.facebook.com.
 */
export function instagramGraphBase(accessToken: string): string {
  return accessToken.startsWith("IG") ? INSTAGRAM_GRAPH : FACEBOOK_GRAPH;
}
