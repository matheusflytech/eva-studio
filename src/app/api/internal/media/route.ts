import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";
import { classificarMime, MAX_MEDIA_BYTES, novoCaminho, urlAssinada, urlDeUpload } from "@/lib/server/storage";

// Mídia pro worker do WhatsApp por QR.
//
// O worker roda fora da Vercel e não tem a chave do storage — de propósito:
// um processo sempre ligado, num serviço de terceiro, não deve guardar uma
// chave com acesso a todos os arquivos de todos os clientes. Ele pede aqui, com
// o segredo interno, e recebe só o que precisa:
//
//   POST { agentId, mime, size, name }  -> URL pra ENVIAR um arquivo recebido
//   GET  ?path=...                       -> URL pra BAIXAR um arquivo a enviar

function autorizado(request: Request): boolean {
  const esperado = process.env.INTERNAL_API_SECRET;
  return !!esperado && timingSafeEqualStr(request.headers.get("x-internal-secret"), esperado);
}

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { agentId, mime, size, name } = await request.json().catch(() => ({}));
  if (typeof agentId !== "string" || typeof mime !== "string" || typeof size !== "number") {
    return NextResponse.json({ error: "Informe agentId, mime e size." }, { status: 400 });
  }
  if (size <= 0 || size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "O arquivo precisa ter até 16 MB." }, { status: 400 });
  }
  const classe = classificarMime(mime);
  if (!classe) return NextResponse.json({ error: "Tipo de arquivo não suportado." }, { status: 400 });

  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { orgId: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const path = novoCaminho(agent.orgId, classe.ext);
  const upload = await urlDeUpload(path);
  if (!upload) return NextResponse.json({ error: "Não foi possível preparar o envio." }, { status: 502 });

  return NextResponse.json({
    path,
    type: classe.tipo,
    mime,
    name: typeof name === "string" ? name.slice(0, 200) : undefined,
    uploadUrl: upload.url,
  });
}

export async function GET(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!path || path.includes("..")) return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });

  const url = await urlAssinada(path, 600);
  if (!url) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  return NextResponse.json({ url });
}
