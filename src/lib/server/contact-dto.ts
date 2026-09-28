import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// Shape que as rotas devolvem pro front. Fica fora do route.ts de propósito:
// um arquivo de rota do Next só pode exportar os métodos HTTP, então helper
// compartilhado precisa morar num módulo comum (mesma ideia do agent-dto.ts).
export type ContactRow = Prisma.ContactGetPayload<{
  include: {
    tags: { include: { tag: true } };
    channels: true;
    company: { select: { id: true; name: true } };
  };
}>;

export function serializeContact(c: ContactRow) {
  return {
    id: c.id,
    name: c.name,
    jobTitle: c.jobTitle,
    email: c.email,
    phone: c.phone,
    emails: c.emails,
    phones: c.phones,
    linkedinUrl: c.linkedinUrl,
    background: c.background,
    notes: c.notes,
    customFields: c.customFields,
    source: c.source,
    optIn: c.optIn,
    company: c.company ? { id: c.company.id, name: c.company.name } : null,
    lastSeenAt: c.lastSeenAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    // Onde falar com a pessoa. A tela mostra isso como "canais", e é o que
    // o disparo usa pra saber se ela é alcançável por um agente.
    channels: c.channels.map((ch) => ({
      id: ch.id,
      agentId: ch.agentId,
      channel: ch.channel,
      externalId: ch.externalId,
    })),
  };
}
