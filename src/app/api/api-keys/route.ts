import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { generateApiKey } from "@/lib/server/api-keys";
import { requirePermission } from "@/lib/server/permissions";
import { normalizarEscopos, RECURSOS } from "@/lib/server/api-v1/escopos";

// Nunca devolve a chave inteira depois de criada — só prefixo/nome/datas, pra
// popular a lista da tela de API. A chave completa só volta uma vez, na
// resposta do POST.
export async function GET() {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { orgId },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true, revokedAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ keys });
}

// Criar chave dá acesso programático aos dados da org inteira: só admin/dono.
// `scopes` é opcional (padrão "*", o comportamento de antes): "<recurso>:read",
// "<recurso>:write" ou "<recurso>:*". Ver src/lib/server/api-v1/escopos.ts.
export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
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

  const { key, keyPrefix, keyHash } = generateApiKey();
  // Escopo só vai no insert quando não é o padrão: assim criar chave segue
  // funcionando antes do SQL da v1 (coluna `scopes`) ser aplicado.
  const row = await prisma.apiKey.create({
    data: { orgId, name, keyPrefix, keyHash, ...(scopes.length === 1 && scopes[0] === "*" ? {} : { scopes }) },
    select: { id: true, name: true, keyPrefix: true, createdAt: true },
  });

  return NextResponse.json({ apiKey: { ...row, key, scopes } });
}
