import type { Origem } from "./tipos";

export interface Rota {
  origem: Origem;
  agentId?: string;
}

// Mesmos caminhos das rotas do app (/api/webhooks/...), para que apontar um
// canal para o Worker seja só trocar o domínio da URL de callback — e voltar
// seja trocar de novo. Aceita também sem o prefixo /api.
const PADROES: { re: RegExp; origem: Origem; comAgente: boolean }[] = [
  { re: /^(?:\/api)?\/webhooks\/meta\/?$/, origem: "meta", comAgente: false },
  { re: /^(?:\/api)?\/webhooks\/telegram\/([A-Za-z0-9_-]{1,64})\/?$/, origem: "telegram", comAgente: true },
  { re: /^(?:\/api)?\/webhooks\/tiktok\/([A-Za-z0-9_-]{1,64})\/?$/, origem: "tiktok", comAgente: true },
];

export function rotear(caminho: string): Rota | null {
  for (const p of PADROES) {
    const m = p.re.exec(caminho);
    if (m) return p.comAgente ? { origem: p.origem, agentId: m[1] } : { origem: p.origem };
  }
  return null;
}
