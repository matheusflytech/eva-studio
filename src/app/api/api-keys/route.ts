import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { generateApiKey } from "@/lib/server/api-keys";

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

export async function POST(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "Dê um nome pra chave (ex: Produção, n8n)." }, { status: 400 });

  const { key, keyPrefix, keyHash } = generateApiKey();
  const row = await prisma.apiKey.create({
    data: { orgId, name: name.trim(), keyPrefix, keyHash },
    select: { id: true, name: true, keyPrefix: true, createdAt: true },
  });

  return NextResponse.json({ apiKey: { ...row, key } });
}
