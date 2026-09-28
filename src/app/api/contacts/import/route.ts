import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { mapCaptureField, normalizePhone } from "@/lib/server/contacts";
import type { Prisma } from "@/generated/prisma/client";

// Parser de CSV pequeno de propósito (sem dependência nova), mas tratando o
// que aparece de verdade em arquivo exportado de planilha: aspas, vírgula
// dentro de aspas, aspas escapadas com aspas duplas e CRLF.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const MAX_ROWS = 5000;

/**
 * POST { csv, tagId?, agentId?, channel? }
 *
 * O cabeçalho manda: coluna cujo nome bate com nome/e-mail/telefone (mesmo
 * dicionário do bloco de Captura) vira coluna da ficha, o resto vira campo
 * livre. Quem já existe (mesmo e-mail ou telefone na org) é atualizado, não
 * duplicado — reimportar a mesma planilha não suja a base.
 *
 * `agentId` + `channel` são opcionais: quando vêm, cada linha também ganha um
 * ContactChannel, o que torna o contato alcançável por disparo naquele agente.
 */
export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const csv = String(body.csv ?? "");
  const tagId = String(body.tagId ?? "").trim();
  const agentId = String(body.agentId ?? "").trim();
  const channel = String(body.channel ?? "").trim();

  if (!csv.trim()) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return NextResponse.json({ error: "O arquivo precisa de um cabeçalho e pelo menos uma linha." }, { status: 400 });
  }
  if (rows.length - 1 > MAX_ROWS) {
    return NextResponse.json({ error: `Máximo de ${MAX_ROWS} linhas por importação.` }, { status: 400 });
  }

  if (tagId) {
    const tag = await prisma.tag.findFirst({ where: { id: tagId, orgId: ctx.orgId } });
    if (!tag) return NextResponse.json({ error: "Etiqueta não encontrada." }, { status: 404 });
  }
  if (agentId) {
    const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
    if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  }

  const header = rows[0].map((h) => h.trim());
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const fields = { name: "", email: "", phone: "" };
    const custom: Record<string, string> = {};

    header.forEach((column, index) => {
      const value = (cells[index] ?? "").trim();
      if (!value) return;
      const mapped = mapCaptureField(column);
      if (mapped) fields[mapped] = value;
      else custom[column] = value;
    });

    if (!fields.name && !fields.email && !fields.phone) {
      skipped += 1;
      if (errors.length < 5) errors.push(`Linha ${i + 1}: sem nome, e-mail nem telefone.`);
      continue;
    }

    try {
      const phoneKey = normalizePhone(fields.phone);
      const existing = await prisma.contact.findFirst({
        where: {
          orgId: ctx.orgId,
          OR: [
            ...(fields.email ? [{ email: { equals: fields.email, mode: "insensitive" as const } }] : []),
            ...(phoneKey.length >= 10 ? [{ phone: { contains: phoneKey } }] : []),
          ],
        },
      });

      const contactId = existing
        ? (await prisma.contact.update({
            where: { id: existing.id },
            data: {
              name: fields.name || existing.name,
              email: fields.email || existing.email,
              phone: fields.phone || existing.phone,
              customFields: {
                ...(existing.customFields as Record<string, unknown>),
                ...custom,
              } as Prisma.InputJsonValue,
            },
          })).id
        : (await prisma.contact.create({
            data: {
              orgId: ctx.orgId,
              name: fields.name,
              email: fields.email,
              phone: fields.phone,
              customFields: custom as Prisma.InputJsonValue,
              source: "importacao",
            },
          })).id;

      if (existing) updated += 1;
      else created += 1;

      if (tagId) {
        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId, tagId } },
          create: { contactId, tagId },
          update: {},
        });
      }

      // Canal só faz sentido com telefone: é ele que identifica a pessoa no
      // WhatsApp e no Telegram.
      if (agentId && channel && phoneKey.length >= 10) {
        const externalId = fields.phone.replace(/\D/g, "");
        await prisma.contactChannel.upsert({
          where: { agentId_channel_externalId: { agentId, channel, externalId } },
          create: { contactId, agentId, channel, externalId },
          update: {},
        });
      }
    } catch (error) {
      skipped += 1;
      if (errors.length < 5) {
        errors.push(`Linha ${i + 1}: ${error instanceof Error ? error.message : "falhou"}`);
      }
    }
  }

  // A etiqueta é aplicada direto (sem passar por applyTag) porque importar mil
  // contatos não deve disparar mil sequências sem o usuário pedir. Pra
  // inscrever em régua depois de importar, use a tela de Sequências com o
  // segmento correspondente.
  return NextResponse.json({ created, updated, skipped, errors });
}
