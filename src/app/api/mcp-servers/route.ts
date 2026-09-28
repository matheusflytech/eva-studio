import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { encryptSecret, decryptSecret } from "@/lib/server/crypto";
import { probeMcpServer } from "@/lib/server/mcp-client";
import type { Prisma } from "@/generated/prisma/client";

// Servidores MCP da organização. O cabeçalho de autenticação nunca volta pro
// cliente depois de gravado — só um aviso de que existe.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const servers = await prisma.mcpServer.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    servers: servers.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      hasAuth: !!s.authHeader,
      active: s.active,
      tools: s.toolsCache,
      lastCheckAt: s.lastCheckAt?.toISOString() ?? null,
      lastError: s.lastError,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "").trim();
  const authHeader = String(body.authHeader ?? "").trim();

  if (!name || !url) return NextResponse.json({ error: "Nome e URL são obrigatórios." }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "A URL precisa começar com http ou https." }, { status: 400 });

  // Testa antes de salvar: um servidor que não responde cadastrado como se
  // estivesse tudo bem é o pior resultado possível aqui.
  const probe = await probeMcpServer(url, authHeader);

  const server = await prisma.mcpServer.create({
    data: {
      orgId: ctx.orgId,
      name,
      url,
      authHeader: authHeader ? encryptSecret(authHeader) : "",
      toolsCache: (probe.ok ? probe.tools : []) as unknown as Prisma.InputJsonValue,
      lastCheckAt: new Date(),
      lastError: probe.ok ? null : probe.error,
      active: probe.ok,
    },
  });

  return NextResponse.json({
    server: {
      id: server.id,
      name: server.name,
      url: server.url,
      hasAuth: !!server.authHeader,
      active: server.active,
      tools: server.toolsCache,
      lastError: server.lastError,
    },
    connected: probe.ok,
  });
}

// PATCH com { id } revalida a conexão e atualiza o inventário de ferramentas.
export async function PATCH(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const server = await prisma.mcpServer.findFirst({
    where: { id: String(body.id ?? ""), orgId: ctx.orgId },
  });
  if (!server) return NextResponse.json({ error: "Servidor não encontrado." }, { status: 404 });

  const probe = await probeMcpServer(server.url, decryptSecret(server.authHeader));

  await prisma.mcpServer.update({
    where: { id: server.id },
    data: {
      toolsCache: (probe.ok ? probe.tools : server.toolsCache) as unknown as Prisma.InputJsonValue,
      lastCheckAt: new Date(),
      lastError: probe.ok ? null : probe.error,
      active: probe.ok,
    },
  });

  return NextResponse.json({
    ok: probe.ok,
    tools: probe.ok ? probe.tools : [],
    error: probe.ok ? null : probe.error,
  });
}

export async function DELETE(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";

  const server = await prisma.mcpServer.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!server) return NextResponse.json({ error: "Servidor não encontrado." }, { status: 404 });

  await prisma.mcpServer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
