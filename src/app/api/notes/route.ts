import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { addNote } from "@/lib/server/crm";

// POST { text, contactId?, dealId? }
export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Escreva a nota." }, { status: 400 });
  if (!body.contactId && !body.dealId) {
    return NextResponse.json({ error: "A nota precisa estar ligada a um contato ou a um negócio." }, { status: 400 });
  }

  const note = await addNote({
    orgId: ctx.orgId,
    text,
    contactId: body.contactId || null,
    dealId: body.dealId || null,
    authorId: ctx.userId,
  });

  return NextResponse.json({ note: { id: note.id, createdAt: note.createdAt.toISOString() } });
}
