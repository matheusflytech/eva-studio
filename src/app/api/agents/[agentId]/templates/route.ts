import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Extrai os nomes de {variavel} do texto do modelo, na ordem em que aparecem
// — é essa ordem que vira os parâmetros posicionais {{1}}, {{2}}... que a
// Meta exige pra mandar um template de verdade.
function extractVariableOrder(bodyText: string): string[] {
  const matches = bodyText.matchAll(/\{(\w+)\}/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1])));
}

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const templates = await prisma.messageTemplate.findMany({ where: { agentId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ templates });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { name, category, bodyText, metaTemplateName, metaLanguageCode } = await request.json();
  if (!name?.trim() || !bodyText?.trim()) {
    return NextResponse.json({ error: "name e bodyText são obrigatórios." }, { status: 400 });
  }

  const template = await prisma.messageTemplate.create({
    data: {
      agentId,
      name: name.trim(),
      category: category?.trim() || "utility",
      bodyText: bodyText.trim(),
      metaTemplateName: metaTemplateName?.trim() ?? "",
      metaLanguageCode: metaLanguageCode?.trim() || "pt_BR",
      variableOrder: extractVariableOrder(bodyText),
    },
  });

  return NextResponse.json({ template });
}
