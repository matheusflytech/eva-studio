import type { Marca } from "@/components/ui/marca";

// Catálogo dos canais conectáveis no contrato, usado pela aba Canais das
// Configurações e pela aba Canais do agente. A conexão em si e a troca de
// agente ficam em src/lib/server/canais-do-contrato.ts.

export type TipoDeCanal = "whatsapp_meta" | "whatsapp_qr" | "instagram" | "messenger" | "telegram" | "tiktok";

export interface InfoDoCanal {
  tipo: TipoDeCanal;
  marca: Marca;
  nome: string;
  descricao: string;
  /** Troca de agente sem reconectar (ver TROCA_DIRETA no servidor). */
  trocaDireta: boolean;
}

export const CANAIS: InfoDoCanal[] = [
  { tipo: "whatsapp_meta", marca: "whatsapp", nome: "WhatsApp oficial (Meta)", descricao: "O canal para clientes de verdade: estável, com selo e sem risco de bloqueio.", trocaDireta: true },
  { tipo: "whatsapp_qr", marca: "whatsapp", nome: "WhatsApp por QR code", descricao: "O número que você já usa, lendo um QR. Bom para testar; para volume alto, prefira o oficial.", trocaDireta: false },
  { tipo: "instagram", marca: "instagram", nome: "Instagram", descricao: "Mensagens diretas, comentários e menções em story da conta Business ou Creator.", trocaDireta: true },
  { tipo: "messenger", marca: "messenger", nome: "Messenger", descricao: "Mensagens da página do Facebook.", trocaDireta: true },
  { tipo: "telegram", marca: "telegram", nome: "Telegram", descricao: "Sem aprovação: crie um bot no @BotFather e cole o token.", trocaDireta: true },
  { tipo: "tiktok", marca: "tiktok", nome: "TikTok", descricao: "Mensagens diretas da conta comercial do TikTok.", trocaDireta: false },
];

export const infoDoCanal = (tipo: string) => CANAIS.find((c) => c.tipo === tipo);
