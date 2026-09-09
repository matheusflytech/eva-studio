import { readStorage, writeStorage } from "@/lib/data/storage";

export interface IntegrationConfig {
  outboundUrl: string;
}

type StoredIntegrations = Record<string, IntegrationConfig>;

const INTEGRATIONS_KEY = "integrations";

export function buildIntegrationWebhookUrl(channelId: string): string {
  return `https://hooks.evaagentstudio.app/integrations/${channelId}`;
}

export async function getIntegration(channelId: string): Promise<IntegrationConfig> {
  const all = readStorage<StoredIntegrations>(INTEGRATIONS_KEY, {});
  return all[channelId] ?? { outboundUrl: "" };
}

export async function saveIntegration(channelId: string, config: IntegrationConfig): Promise<void> {
  const all = readStorage<StoredIntegrations>(INTEGRATIONS_KEY, {});
  all[channelId] = config;
  writeStorage(INTEGRATIONS_KEY, all);
}
