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

  let token: string;
  try {
    token = decryptSecret(agent.instagramConnection.pageAccessToken);
  } catch {
    // Token gravado com outra TOKEN_ENCRYPTION_KEY: não dá pra falar com a Meta,
    // mas a tela continua funcionando com o ID manual.
    return NextResponse.json({ stories: [], reason: "Não foi possível ler a conexão do Instagram. Reconecte a conta." });
  }
  const igId = encodeURIComponent(agent.instagramConnection.igBusinessId);
  const url = new URL(`${instagramGraphBase(token)}/${igId}/stories`);
  url.searchParams.set("fields", "id,media_type,media_url,thumbnail_url,timestamp");

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return NextResponse.json({ stories: [], reason: `A Meta respondeu ${res.status}.` });
    const data = (await res.json()) as { data?: StoryDaMeta[] };
    const stories = (data.data ?? [])
      .filter((s) => typeof s.id === "string" && /^[\w-]{1,64}$/.test(s.id))
      .map((s) => ({
        id: s.id,
        type: s.media_type ?? "",
        preview: soHttps(s.thumbnail_url ?? s.media_url),
        postedAt: s.timestamp ?? null,
      }));
    return NextResponse.json({ stories });
  } catch {
    return NextResponse.json({ stories: [], reason: "Não foi possível falar com a Meta." });
  }
}

/** A prévia vira src de imagem na tela: só aceita https, nada de data:/javascript:. */
function soHttps(value: string | undefined): string {
  if (!value) return "";
  try {
    return new URL(value).protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}
