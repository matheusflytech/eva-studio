import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateApiKey } from "@/lib/server/api-keys";
import { ctxPode, requirePermission } from "@/lib/server/permissions";
import { normalizarEscopos, RECURSOS } from "@/lib/server/api-v1/escopos";
import { escoposAcimaDoQuePode, permissoesDoPapelDeSistema } from "@/lib/permissoes/catalogo";
import { comFallbackLegado } from "@/lib/server/contratos";

// Chaves de API do contrato ativo. Nunca devolve a chave inteira depois de
// criada — só prefixo/nome/datas/escopos/responsável. A chave completa só volta
// uma vez, na resposta do POST.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;

  const base = { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true, revokedAt: true, scopes: true } as const;
  const keys = await comFallbackLegado(
    async () => {
      const rows = await prisma.apiKey.findMany({
        where: { orgId },
        select: { ...base, expiresAt: true, createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(({ createdBy, ...r }) => ({ ...r, createdBy: createdBy ?? null }));
    },
    async () => {
      const rows = await prisma.apiKey.findMany({ where: { orgId }, select: base, orderBy: { createdAt: "desc" } });
      return rows.map((r) => ({ ...r, expiresAt: null, createdBy: null }));
    }
  );
  return NextResponse.json({ keys, podeGerenciar: ctxPode(ctx, "api:gerenciar") });
}

// Criar chave dá acesso programático aos dados do contrato: "api:gerenciar"
// (o antigo agents:manage, admin/dono). `scopes` é opcional (padrão "*"):
// "<recurso>:read", "<recurso>:write" ou "<recurso>:*". Ver
// src/lib/server/api-v1/escopos.ts. A chave nunca pode mais do que quem a cria.
export async function POST(request: Request) {
  const ctx = await requirePermission("api:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Dê um nome pra chave (ex: Produção, n8n)." }, { status: 400 });
  const scopes = normalizarEscopos(body?.scopes);
  if (!scopes) {
    return NextResponse.json(
      { error: `Escopo inválido. Use "*" ou <recurso>:read|write|*, com recurso entre: ${RECURSOS.join(", ")}.` },
      { status: 400 }
    );
  }
  const negados = escoposAcimaDoQuePode(scopes, ctx.permissoes ?? permissoesDoPapelDeSistema(ctx.role));
  if (negados.length > 0) {
    return NextResponse.json(
      { error: `Você não pode dar à chave um acesso que não tem: ${negados.join(", ")}.` },
      { status: 403 }
    );
  }

  let expiresAt: Date | null = null;
  if (body?.expiresAt !== undefined && body?.expiresAt !== null && body?.expiresAt !== "") {
    const d = new Date(String(body.expiresAt));
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      return NextResponse.json({ error: "A validade precisa ser uma data no futuro." }, { status: 400 });
    }
    expiresAt = d;
  }

  const { key, keyPrefix, keyHash } = generateApiKey();
  // Escopo só vai no insert quando não é o padrão: assim criar chave segue
  // funcionando antes do SQL da v1 (coluna `scopes`) ser aplicado. Idem
  // responsável/validade antes do SQL de contratos.
  const data = { orgId, name, keyPrefix, keyHash, ...(scopes.length === 1 && scopes[0] === "*" ? {} : { scopes }) };
  const select = { id: true, name: true, keyPrefix: true, createdAt: true } as const;
  const row = await comFallbackLegado(
    () => prisma.apiKey.create({ data: { ...data, createdById: ctx.userId, expiresAt }, select }),
    async () => {
      if (expiresAt) throw new Error("Validade de chave precisa do SQL de contratos aplicado.");
      return prisma.apiKey.create({ data, select });
    }
  );

  return NextResponse.json({ apiKey: { ...row, key, scopes, expiresAt } });
}
