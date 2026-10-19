import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { erro, JSON_INVALIDO, lerCorpo } from "@/lib/server/api-validacao";
import { atalhosDeContato, comBusca, listarContatos } from "@/lib/server/listas-crm";

// POST /api/contacts/busca — lista de contatos com o filtro no corpo (filtro
// grande não cabe bem na URL). Leitura, apesar do POST.
//   { filtro?, q?, tag?, segment?, company?, sort?, dir?, page?, pageSize? }
// pageSize 25/50/100 (inválido ou ausente = 25). sort só por colunas
// permitidas (src/lib/filtro-crm.ts → ORDENACOES.contatos); fora disso, ordem
// padrão + aviso. Resposta: { total, page, pageSize, contacts, avisos, truncado, ordenacao }.
export async function POST(request: Request) {
  const ctx = await requirePermission("contatos:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const corpo = await lerCorpo(request);
  if (!corpo) return erro(JSON_INVALIDO);
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const r = await listarContatos(ctx, {
    filtro: comBusca(corpo.filtro, txt(corpo.q)),
    sort: corpo.sort,
    dir: corpo.dir,
    page: corpo.page,
    pageSize: corpo.pageSize,
    extras: atalhosDeContato({ tag: txt(corpo.tag), segment: txt(corpo.segment), company: txt(corpo.company) }),
  });
  return NextResponse.json(r);
}
