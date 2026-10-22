import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";
import { requirePermission } from "@/lib/server/permissions";
import { LIMITE_MIDIA_EXEMPLO, MIDIAS_DE_CABECALHO, subirMidiaDeExemplo } from "@/lib/server/meta-templates";

// Arquivo de exemplo do cabeçalho (imagem, vídeo ou PDF). A Meta não aceita
// URL aqui: exige um "handle" da Resumable Upload API, que é o que esta rota
// devolve pro formulário guardar em header.handle.
// POST multipart/form-data com o campo "arquivo".
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId }, select: { id: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  const conn = await prisma.metaConnection.findUnique({ where: { agentId } });
  if (!conn) return NextResponse.json({ error: "Este agente não tem o WhatsApp oficial conectado." }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!arquivo || typeof arquivo === "string") {
    return NextResponse.json({ error: "Envie o arquivo de exemplo." }, { status: 400 });
  }
  if (!MIDIAS_DE_CABECALHO[arquivo.type]) {
    return NextResponse.json({ error: "Use JPG, PNG, MP4 ou PDF no cabeçalho." }, { status: 400 });
  }
  if (arquivo.size > LIMITE_MIDIA_EXEMPLO) {
    return NextResponse.json({ error: "O arquivo de exemplo precisa ter até 4 MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const r = await subirMidiaDeExemplo(decryptSecret(conn.accessToken), bytes, arquivo.type, arquivo.name);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 502 });

  return NextResponse.json({ handle: r.handle, formato: MIDIAS_DE_CABECALHO[arquivo.type], nome: arquivo.name });
}
