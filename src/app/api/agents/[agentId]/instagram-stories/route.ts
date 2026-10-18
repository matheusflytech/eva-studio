import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { decryptSecret } from "@/lib/server/crypto";
import { instagramGraphBase } from "@/lib/server/meta-graph";

interface StoryDaMeta {
  id: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp?: string;
}

// Stories ativos (últimas 24h) da conta conectada, pra escolher "este story"
// num gatilho. Se a Meta não devolver (permissão/token), a tela cai no campo
// de ID manual — por isso erro aqui vira lista vazia com motivo, não 500.
export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId: ctx.orgId },
    include: { instagramConnection: true },
  });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  if (!agent.instagramConnection) return NextResponse.json({ stories: [], reason: "Instagram não conectado." });

  const token = decryptSecret(agent.instagramConnection.pageAccessToken);
  const url = new URL(`${instagramGraphBase(token)}/${agent.instagramConnection.igBusinessId}/stories`);
  url.searchParams.set("fields", "id,media_type,media_url,thumbnail_url,timestamp");

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return NextResponse.json({ stories: [], reason: `A Meta respondeu ${res.status}.` });
    const data = (await res.json()) as { data?: StoryDaMeta[] };
    const stories = (data.data ?? []).map((s) => ({
      id: s.id,
      type: s.media_type ?? "",
      preview: s.thumbnail_url ?? s.media_url ?? "",
      postedAt: s.timestamp ?? null,
    }));
    return NextResponse.json({ stories });
  } catch {
    return NextResponse.json({ stories: [], reason: "Não foi possível falar com a Meta." });
  }
}
