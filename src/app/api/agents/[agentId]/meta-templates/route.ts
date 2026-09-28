import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";

// ---------------------------------------------------------------------------
// Status de aprovação dos templates na Meta.
//
// O app guarda um MessageTemplate local com `metaTemplateName` — o nome do
// template aprovado que ele deve usar quando a conversa está fora da janela de
// 24h. Só que nada nunca perguntava à Meta se aquele nome existe e se está
// aprovado. Dava pra apontar para um template rejeitado e só descobrir quando
// o disparo não chegasse em ninguém — o pior tipo de falha, a silenciosa.
//
// Aqui a lista vem da Meta, ao vivo, e é cruzada com o que está configurado
// neste agente. Não guardamos cópia: status de aprovação muda do lado de lá e
// cache de status vira mentira com data.
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.facebook.com/v21.0";

interface TemplateDaMeta {
  id: string;
  name: string;
  status: string;
  category?: string;
  language: string;
  rejected_reason?: string;
  quality_score?: { score?: string };
  components?: { type: string; text?: string; format?: string }[];
}

/** O corpo do template, que é o que a pessoa reconhece. */
function corpoDo(t: TemplateDaMeta): string {
  return t.components?.find((c) => c.type === "BODY")?.text ?? "";
}

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const conn = await prisma.metaConnection.findUnique({ where: { agentId } });
  if (!conn) {
    // Não é erro: é o estado normal de quem ainda não ligou o canal oficial.
    // A tela sabe explicar isso melhor que um 404.
    return NextResponse.json({ conectado: false, templates: [], locais: [] });
  }

  const locais = await prisma.messageTemplate.findMany({
    where: { agentId },
    orderBy: { createdAt: "asc" },
  });

  const url = new URL(`${GRAPH}/${conn.wabaId}/message_templates`);
  url.searchParams.set("fields", "name,status,category,language,components,rejected_reason,quality_score");
  url.searchParams.set("limit", "200");

  let daMeta: TemplateDaMeta[] = [];
  let erro: string | null = null;

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${decryptSecret(conn.accessToken)}` },
      // Status de aprovação muda do lado da Meta; cache aqui só atrasaria a
      // notícia de que um template foi rejeitado.
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      erro = json?.error?.message ?? `A Meta respondeu ${res.status}.`;
    } else {
      daMeta = Array.isArray(json.data) ? json.data : [];
    }
  } catch {
    erro = "Não foi possível falar com a Meta agora.";
  }

  const porNome = new Map(daMeta.map((t) => [`${t.name}|${t.language}`, t]));

  return NextResponse.json({
    conectado: true,
    wabaId: conn.wabaId,
    erro,
    templates: daMeta.map((t) => ({
      id: t.id,
      nome: t.name,
      status: t.status,
      categoria: t.category ?? "",
      idioma: t.language,
      corpo: corpoDo(t),
      motivoRejeicao: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
      qualidade: t.quality_score?.score ?? null,
      // Este template está sendo usado por algum modelo deste agente?
      usadoAqui: locais.some(
        (l) => l.metaTemplateName === t.name && l.metaLanguageCode === t.language
      ),
    })),
    // O outro lado do cruzamento: modelo configurado aqui que não encontra par
    // lá. É o que quebra um disparo sem avisar.
    locais: locais.map((l) => {
      const alvo = l.metaTemplateName
        ? porNome.get(`${l.metaTemplateName}|${l.metaLanguageCode}`)
        : undefined;
      return {
        id: l.id,
        nome: l.name,
        metaTemplateName: l.metaTemplateName,
        idioma: l.metaLanguageCode,
        corpo: l.bodyText,
        // null = ainda não sabemos (a chamada à Meta falhou); "ausente" = o
        // nome não existe lá. Os dois pedem ação diferente, então são valores
        // diferentes em vez de um booleano.
        situacao: erro ? null : alvo ? alvo.status : "AUSENTE",
      };
    }),
  });
}
