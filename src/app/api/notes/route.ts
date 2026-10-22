import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { addNote, statusDaReferencia } from "@/lib/server/crm";
import { JSON_INVALIDO, conferirReferencias, erro, lerCorpo, texto } from "@/lib/server/api-validacao";

// POST { text, contactId?, dealId? }
export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const text = texto(body.text, 5000) ?? "";
  if (!text) return erro("Escreva a nota.");
  if (!body.contactId && !body.dealId) {
    return erro("A nota precisa estar ligada a um contato ou a um negócio.");
  }

  const erroRef = await conferirReferencias(ctx.orgId, { contactId: body.contactId, dealId: body.dealId });
  if (erroRef) return erro(erroRef, statusDaReferencia(erroRef));

  const note = await addNote({
    orgId: ctx.orgId,
    text,
    contactId: (body.contactId as string) || null,
    dealId: (body.dealId as string) || null,
    authorId: ctx.userId,
  });

  return NextResponse.json({ note: { id: note.id, createdAt: note.createdAt.toISOString() } });
}
