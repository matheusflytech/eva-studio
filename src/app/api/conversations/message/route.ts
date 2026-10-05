import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireOrgId } from "@/lib/auth/require-org";
import { advanceConversation } from "@/lib/server/flow-engine";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";
import { caminhoDaOrg, classificarMime } from "@/lib/server/storage";

// Dois jeitos de chamar essa rota:
// 1) O worker do WhatsApp / webhook da Meta (processos externos, sem sessão
//    de usuário) — autenticam com o header X-Internal-Secret.
// 2) O Playground, de dentro do navegador de um usuário logado — autentica
//    com o cookie de sessão normal (Supabase), como qualquer outra rota.
async function authorize(
  request: Request,
  agentId: string
): Promise<{ ok: false } | { ok: true; interno: boolean; orgId: string | null }> {
  const secretHeader = request.headers.get("x-internal-secret");
  const expected = process.env.INTERNAL_API_SECRET;
  if (expected && timingSafeEqualStr(secretHeader, expected)) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { orgId: true } });
    if (!agent) return { ok: false };
    return { ok: true, interno: true, orgId: agent.orgId };
  }

  const orgId = await requireOrgId();
  if (!orgId) return { ok: false };
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  return agent ? { ok: true, interno: false, orgId } : { ok: false };
}

export async function POST(request: Request) {
  const body = await request.json();
  const { agentId, channel, contactId, text, optionId, media, externalId } = body ?? {};

  if (!agentId || !channel || !contactId) {
    return NextResponse.json({ error: "agentId, channel e contactId são obrigatórios." }, { status: 400 });
  }

  const auth = await authorize(request, agentId);
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  // Anexo só vem do worker. De um navegador, aceitar um caminho de storage
  // arbitrário deixaria qualquer usuário anexar arquivo que não é dele.
  let anexo: { path: string; type: string; mime: string; name?: string; size?: number } | undefined;
  if (media) {
    if (!auth.interno || !auth.orgId) {
      return NextResponse.json({ error: "Anexo não permitido por este caminho." }, { status: 403 });
    }
    if (
      typeof media.path !== "string" ||
      !caminhoDaOrg(media.path, auth.orgId) ||
      typeof media.mime !== "string" ||
      !classificarMime(media.mime)
    ) {
      return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });
    }
    anexo = {
      path: media.path,
      type: String(media.type ?? classificarMime(media.mime)!.tipo),
      mime: media.mime,
      name: typeof media.name === "string" ? media.name.slice(0, 200) : undefined,
      size: typeof media.size === "number" ? media.size : undefined,
    };
  }

  const result = await advanceConversation({
    agentId,
    channel,
    contactId,
    text,
    optionId,
    media: anexo,
    externalId: typeof externalId === "string" ? externalId : undefined,
  });
  return NextResponse.json(result);
}
