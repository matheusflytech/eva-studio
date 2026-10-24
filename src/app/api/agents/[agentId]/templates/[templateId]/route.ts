import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";

function extractVariableOrder(bodyText: string): string[] {
  const matches = bodyText.matchAll(/\{(\w+)\}/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1])));
}

async function assertOwnership(agentId: string, templateId: string, orgId: string) {
  const template = await prisma.messageTemplate.findFirst({
    where: { id: templateId, agentId, agent: { orgId } },
  });
  return template;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ agentId: string; templateId: string }> }
) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;
  const { agentId, templateId } = await params;

  const existing = await assertOwnership(agentId, templateId, orgId);
  if (!existing) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });

  const { name, category, bodyText, metaTemplateName, metaLanguageCode } = await request.json();
  if (!name?.trim() || !bodyText?.trim()) {
    return NextResponse.json({ error: "name e bodyText são obrigatórios." }, { status: 400 });
  }

  const template = await prisma.messageTemplate.update({
    where: { id: templateId },
    data: {
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ agentId: string; templateId: string }> }
) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;
  const { agentId, templateId } = await params;

  const existing = await assertOwnership(agentId, templateId, orgId);
  if (!existing) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });

  await prisma.messageTemplate.delete({ where: { id: templateId } });
  return NextResponse.json({ ok: true });
}
