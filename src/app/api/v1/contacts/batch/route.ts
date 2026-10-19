import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos, enumOpc } from "@/lib/server/api-v1/entrada";
import { lerItensDoLote, processarLote, resumoDoLote } from "@/lib/server/api-v1/lote";
import { CAMPOS_DE_CONTATO, lerDadosDeContato, upsertContato } from "@/lib/server/api-v1/contatos";

// POST /api/v1/contacts/batch — { items: [...até 100], mode?: "upsert"|"create" }.
// Idempotency-Key obrigatório: reenviar um lote inteiro é o caso mais comum
// de retry, e sem a chave cada retry duplicaria o lote.
export const POST = rotaV1({ recurso: "contacts", idempotencia: "obrigatoria" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["items", "mode"]);
  const modo = enumOpc(corpo, "mode", ["upsert", "create"] as const) ?? "upsert";
  const itens = lerItensDoLote(corpo);
  const results = await processarLote(itens, async (item) => {
    conferirCampos(item, CAMPOS_DE_CONTATO);
    return upsertContato(ctx.orgId, await lerDadosDeContato(ctx.orgId, item), { modo });
  });
  return NextResponse.json({ data: results, summary: resumoDoLote(results) });
});
