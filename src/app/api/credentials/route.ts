import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret } from "@/lib/server/crypto";

const VALID_TYPES = ["groq", "resend"];

// Nunca devolve o segredo decifrado — só metadado (id/nome/tipo/data), pra
// popular os Selects de "qual credencial usar" nos blocos do Builder.
export async function GET(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  const credentials = await prisma.credential.findMany({
    where: { orgId, ...(type ? { type } : {}) },
    select: { id: true, name: true, type: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ credentials });
}

export async function POST(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { name, type, secret } = await request.json();
  if (!name?.trim() || !VALID_TYPES.includes(type) || !secret?.trim()) {
    return NextResponse.json({ error: "name, type (groq|resend) e secret são obrigatórios." }, { status: 400 });
  }

  const credential = await prisma.credential.create({
    data: { orgId, name: name.trim(), type, secretEnc: encryptSecret(secret.trim()) },
    select: { id: true, name: true, type: true, createdAt: true },
  });
  return NextResponse.json({ credential });
}
