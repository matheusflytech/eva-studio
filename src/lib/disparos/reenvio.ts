// Reenvio de quem não recebeu um disparo (ex.: o chip caiu no meio), sem mandar
// duas vezes para a mesma pessoa. Puro: a rota busca os dados e chama aqui.

/** Falhas que outro chip não resolve: o número não existe no WhatsApp. */
const SEM_SOLUCAO = ["Número sem WhatsApp", "Número inválido"];

/**
 * Chave para comparar destinos. "5511999990001@s.whatsapp.net", "551199990001"
 * e "11999990001" são a mesma pessoa: no Brasil compara DDI+DDD+8 últimos dígitos
 * (o nono dígito vem e vai conforme a fonte). Grupo e @lid comparam como estão.
 */
export function chaveDoDestino(destino: string): string {
  const bruto = destino.trim();
  if (bruto.includes("@") && !bruto.endsWith("@s.whatsapp.net")) return bruto;
  let d = bruto.split("@")[0].replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d.slice(0, 4) + d.slice(-8);
  return d;
}

export interface ItemFalho {
  contactId: string;
  error: string | null;
}

/**
 * Quem reenviar: os que falharam por motivo que outro chip resolve, menos quem
 * já recebeu (ou está na fila) em qualquer disparo do contrato, sem repetir.
 */
export function quemReenviar(falhos: ItemFalho[], jaCobertos: string[]) {
  const cobertos = new Set(jaCobertos.map(chaveDoDestino));
  const vistos = new Set<string>();
  const destinos: string[] = [];
  let semWhatsApp = 0;
  let jaReceberam = 0;
  for (const f of falhos) {
    const chave = chaveDoDestino(f.contactId);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (SEM_SOLUCAO.some((m) => f.error?.startsWith(m))) semWhatsApp++;
    else if (cobertos.has(chave)) jaReceberam++;
    else destinos.push(f.contactId);
  }
  return { destinos, semWhatsApp, jaReceberam };
}
