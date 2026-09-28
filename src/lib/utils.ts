import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function buildInboundWebhookUrl(agentId: string): string {
  return `https://hooks.evaagentstudio.app/in/${agentId}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Data relativa nos dois sentidos.
 *
 * Só passado não servia: prazo de tarefa é sempre no futuro, e a versão
 * anterior devolvia "agora mesmo" para qualquer vencimento que ainda não
 * chegou — uma tarefa para amanhã aparecia como se fosse agora.
 */
export function formatRelativeDate(iso: string): string {
  const alvo = new Date(iso).getTime();
  const diffMs = Date.now() - alvo;
  const futuro = diffMs < 0;
  const min = Math.round(Math.abs(diffMs) / 60000);

  if (min < 1) return "agora mesmo";
  if (min < 60) return futuro ? `em ${min} min` : `há ${min} min`;

  const horas = Math.round(min / 60);
  if (horas < 24) return futuro ? `em ${horas}h` : `há ${horas}h`;

  const dias = Math.round(horas / 24);
  if (dias === 1) return futuro ? "amanhã" : "ontem";
  if (dias < 30) return futuro ? `em ${dias} dias` : `há ${dias} dias`;

  return new Date(iso).toLocaleDateString("pt-BR");
}
