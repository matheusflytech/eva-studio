import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { caminhoDaOrg, urlAssinada } from "@/lib/server/storage";

// Entrega de anexo.
//
// O arquivo mora num bucket privado. Esta rota confere que quem pede é da
// organização dona do arquivo e redireciona pra uma URL assinada de vida
// curta. A mensagem guarda sempre o mesmo endereço (/api/media?path=...), então
// o navegador consegue guardar em cache e a tela não precisa assinar nada a
// cada atualização da lista.
//
//   ?path=<caminho>          abre/mostra
//   ?path=<caminho>&baixar=1 força download (com ?nome=arquivo.pdf)
export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const sp = new URL(request.url).searchParams;
  const path = sp.get("path") ?? "";

  // O prefixo da organização é a única barreira entre um cliente e o arquivo de
  // outro: sem essa checagem, quem conhecesse um caminho abriria qualquer anexo.
  if (!path || !caminhoDaOrg(path, ctx.orgId)) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const assinada = await urlAssinada(path, 120);
  if (!assinada) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const destino = new URL(assinada);
  if (sp.get("baixar") === "1") {
    destino.searchParams.set("download", (sp.get("nome") ?? "arquivo").slice(0, 150));
  }

  const resposta = NextResponse.redirect(destino.toString(), 302);
  // A URL assinada vence em 2 minutos, então o redirecionamento não pode ser
  // guardado por mais que isso; o arquivo em si o navegador guarda sozinho.
  resposta.headers.set("Cache-Control", "private, max-age=90");
  return resposta;
}
