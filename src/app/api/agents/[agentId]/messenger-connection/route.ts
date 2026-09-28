import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { encryptSecret } from "@/lib/server/crypto";

// Conexão do Messenger. Cadastro manual do par (id da Página + token de acesso
// da Página), mesmo padrão do Instagram antes do OAuth existir: a Meta não tem
// um Embedded Signup para Messenger como tem para o WhatsApp.
//
// Ao salvar, assina a Página no webhook — sem isso o token existe mas nenhuma
// mensagem chega, que é o erro mais comum de quem configura isso à mão.
export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const conn = await prisma.messengerConnection.findUnique({ where: { agentId } });
  return NextResponse.json({
    connected: !!conn,
    pageId: conn?.pageId ?? "",
    pageName: conn?.pageName ?? "",
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { pageId, pageAccessToken } = await request.json();
  const id = String(pageId ?? "").trim();
  const token = String(pageAccessToken ?? "").trim();
  if (!id || !token) {
    return NextResponse.json({ error: "Informe o ID da Página e o token de acesso dela." }, { status: 400 });
  }

  // Valida o par antes de gravar e já pega o nome da Página de brinde.
  const meRes = await fetch(`https://graph.facebook.com/v21.0/${id}?fields=name&access_token=${token}`);
  const me = await meRes.json().catch(() => null);
  if (!meRes.ok || !me?.name) {
    return NextResponse.json(
      { error: me?.error?.message ?? "A Meta não reconheceu esse par de ID e token." },
      { status: 400 }
    );
  }

  // Assina a Página nos campos de mensagem. Sem isso a conexão parece certa
  // mas nada chega no webhook.
  const subRes = await fetch(
    `https://graph.facebook.com/v21.0/${id}/subscribed_apps?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed_fields: "messages,messaging_postbacks,messaging_optins" }),
    }
  );
  const sub = await subRes.json().catch(() => null);

  await prisma.messengerConnection.upsert({
    where: { agentId },
    create: { agentId, pageId: id, pageAccessToken: encryptSecret(token), pageName: me.name },
    update: { pageId: id, pageAccessToken: encryptSecret(token), pageName: me.name },
  });

  return NextResponse.json({
    ok: true,
    pageName: me.name,
    subscribed: !!sub?.success,
    warning: sub?.success ? null : sub?.error?.message ?? "Página salva, mas não foi possível assinar o webhook.",
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  await prisma.messengerConnection.deleteMany({ where: { agentId } });
  return NextResponse.json({ ok: true });
}
