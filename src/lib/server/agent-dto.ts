import type { Agent as PrismaAgent, AgentVariable as PrismaVariable, KnowledgeDoc as PrismaDoc } from "@/generated/prisma/client";
import { buildInboundWebhookUrl } from "@/lib/utils";
import type { Agent, AgentLanguage } from "@/lib/data/types";

type FullAgent = PrismaAgent & { variables: PrismaVariable[]; knowledgeBase: PrismaDoc[] };

export function toAgentDTO(row: FullAgent): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tone: row.tone,
    language: row.language as AgentLanguage,
    primaryChannel: row.primaryChannel,
    instructions: row.instructions,
    guidelines: row.guidelines,
    knowledgeBase: row.knowledgeBase.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      sizeBytes: d.sizeBytes,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    skills: row.skills as string[],
    tools: row.tools as string[],
    variables: row.variables.map((v) => ({ id: v.id, name: v.name, unit: v.unit })),
    webhook: {
      inboundUrl: buildInboundWebhookUrl(row.id),
      outboundUrl: row.outboundUrl,
    },
    status: row.status as "active" | "paused",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
