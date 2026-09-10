import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { extractText } from "@/lib/server/extract-text";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB, igual o limite já anunciado na UI

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { fileName, mimeType, dataBase64 } = await request.json();
  if (!fileName || !dataBase64) {
    return NextResponse.json({ error: "fileName e dataBase64 são obrigatórios." }, { status: 400 });
  }

  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.byteLength > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 20MB." }, { status: 400 });
  }

  let content = "";
  try {
    content = await extractText(buffer, mimeType ?? "", fileName);
  } catch {
    return NextResponse.json({ error: "Não consegui ler o conteúdo desse arquivo." }, { status: 422 });
  }

  const doc = await prisma.knowledgeDoc.create({
    data: {
      agentId,
      fileName,
      sizeBytes: buffer.byteLength,
      mimeType: mimeType ?? "application/octet-stream",
      content,
    },
  });

  return NextResponse.json({
    doc: {
      id: doc.id,
      fileName: doc.fileName,
      sizeBytes: doc.sizeBytes,
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt.toISOString(),
    },
  });
}
