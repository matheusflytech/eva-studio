import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import {
  CANAIS_DE_CONTATO,
  externalIdDoCanal,
  mapCaptureField,
  normalizePhone,
  telefoneParaGravar,
} from "@/lib/server/contacts";
import { carregarDefinicoes, mesclarCamposDeContato } from "@/lib/server/custom-fields";
import { erro, JSON_INVALIDO, lerCorpo } from "@/lib/server/api-validacao";
import { validarEmail } from "@/lib/capture-validation";
import { slugificar, type DefinicaoDeCampo } from "@/lib/custom-fields";
import { parseCsv } from "./csv";
import type { Prisma } from "@/generated/prisma/client";

const MAX_ROWS = 5000;
/** Linhas por bloco: uma busca de existentes por bloco, não por linha. */
const BLOCO = 500;
const MAX_ERROS = 20;

/** Coluna do CSV -> onde o valor vai: coluna da ficha, campo definido ou campo livre. */
type Destino = { tipo: "ficha"; campo: "name" | "email" | "phone" } | { tipo: "campo"; chave: string };

function destinoDaColuna(coluna: string, defs: DefinicaoDeCampo[]): Destino {
  const ficha = mapCaptureField(coluna);
  if (ficha) return { tipo: "ficha", campo: ficha };
  // Cabeçalho "Consumo mensal (kWh)" casa com o campo de chave
  // consumo_mensal_kwh: pela chave literal, pelo slug ou pelo rótulo.
  const slug = slugificar(coluna);
  const def = defs.find((d) => d.key === coluna || d.key === slug || slugificar(d.label) === slug);
  return { tipo: "campo", chave: def ? def.key : coluna };
}

interface Linha {
  numero: number;
  name: string;
  email: string;
  phone: string;
  custom: Record<string, unknown>;
}

/**
 * POST { csv, tagId?, agentId?, channel? }
 *
 * O cabeçalho manda: coluna cujo nome bate com nome/e-mail/telefone (mesmo
 * dicionário do bloco de Captura) vira coluna da ficha; coluna que bate com um
 * campo personalizado (chave ou rótulo) é validada pelo tipo do campo; o resto
 * vira campo livre. Quem já existe (mesmo e-mail ou telefone na org) é
 * atualizado, não duplicado — reimportar a mesma planilha não suja a base.
 *
 * Aceita vírgula, ponto e vírgula (Excel pt-BR) ou tab: o separador é
 * detectado pela primeira linha.
 *
 * `agentId` + `channel` são opcionais: quando vêm, cada linha com telefone
 * também ganha um ContactChannel, o que torna o contato alcançável por
 * disparo naquele agente.
 */
export async function POST(request: Request) {
  const ctx = await requirePermission("contatos:importar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const csv = String(body.csv ?? "");
  const tagId = String(body.tagId ?? "").trim();
  const agentId = String(body.agentId ?? "").trim();
  const channel = String(body.channel ?? "").trim();

  if (!csv.trim()) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  if (agentId && channel && !CANAIS_DE_CONTATO.has(channel)) return erro("Canal inválido.");

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

  const defs = await carregarDefinicoes(ctx.orgId, "contact");
  const destinos = rows[0].map((h) => destinoDaColuna(h.trim(), defs));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const falhar = (numero: number, motivo: string) => {
    skipped += 1;
    if (errors.length < MAX_ERROS) errors.push(`Linha ${numero}: ${motivo}`);
  };

  // 1) Lê e valida cada linha, sem tocar no banco.
  const linhas: Linha[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const numero = i + 1;
    const fields = { name: "", email: "", phone: "" };
    const custom: Record<string, unknown> = {};
    destinos.forEach((destino, index) => {
      const value = (cells[index] ?? "").trim();
      if (!value) return;
      if (destino.tipo === "ficha") fields[destino.campo] = value;
      else custom[destino.chave] = value;
    });

    if (!fields.name && !fields.email && !fields.phone) {
      falhar(numero, "sem nome, e-mail nem telefone.");
      continue;
    }
    const email = fields.email ? validarEmail(fields.email) : "";
    if (email === null) {
      falhar(numero, `e-mail inválido (${fields.email}).`);
      continue;
    }
    const phone = telefoneParaGravar(fields.phone);
    if (phone === null) {
      falhar(numero, `telefone inválido (${fields.phone}).`);
      continue;
    }
    linhas.push({ numero, name: fields.name, email, phone, custom });
  }

  // Quem já foi visto nesta importação (incluindo os criados agora), pra a
  // mesma pessoa repetida na planilha não virar duas fichas.
  type Existente = { id: string; name: string; email: string; phone: string; customFields: unknown };
  const porEmail = new Map<string, Existente>();
  const porTelefone = new Map<string, Existente>();
  const lembrar = (c: Existente) => {
    if (c.email) porEmail.set(c.email.toLowerCase(), c);
    const nacional = normalizePhone(c.phone);
    if (nacional.length >= 10) porTelefone.set(nacional, c);
  };

  // 2) Em blocos: uma busca de existentes por bloco, depois as gravações.
  for (let inicio = 0; inicio < linhas.length; inicio += BLOCO) {
    const bloco = linhas.slice(inicio, inicio + BLOCO);
    const emails = [...new Set(bloco.map((l) => l.email).filter(Boolean))];
    const telefones = [
      ...new Set(
        bloco
          .filter((l) => normalizePhone(l.phone).length >= 10)
          .flatMap((l) => [l.phone, `+${l.phone}`, normalizePhone(l.phone)])
      ),
    ];
    if (emails.length > 0 || telefones.length > 0) {
      const achados = await prisma.contact.findMany({
        where: {
          orgId: ctx.orgId,
          OR: [
            ...(emails.length > 0 ? [{ email: { in: emails, mode: "insensitive" as const } }] : []),
            ...(telefones.length > 0 ? [{ phone: { in: telefones } }] : []),
          ],
        },
        select: { id: true, name: true, email: true, phone: true, customFields: true },
      });
      achados.forEach(lembrar);
    }

    const novasEtiquetas: Prisma.ContactTagCreateManyInput[] = [];
    const novosCanais: Prisma.ContactChannelCreateManyInput[] = [];

    for (const linha of bloco) {
      try {
        const existing =
          (linha.email && porEmail.get(linha.email)) ||
          (linha.phone && porTelefone.get(normalizePhone(linha.phone))) ||
          null;

        const r = await mesclarCamposDeContato(
          ctx.orgId,
          (existing?.customFields ?? {}) as Record<string, unknown>,
          linha.custom,
          defs
        );
        if (!r.ok) {
          falhar(linha.numero, r.erros.join(" "));
          continue;
        }

        const contato: Existente = existing
          ? await prisma.contact.update({
              where: { id: existing.id },
              data: {
                name: linha.name || existing.name,
                email: linha.email || existing.email,
                phone: linha.phone || existing.phone,
                customFields: r.valores as Prisma.InputJsonValue,
              },
              select: { id: true, name: true, email: true, phone: true, customFields: true },
            })
          : await prisma.contact.create({
              data: {
                orgId: ctx.orgId,
                name: linha.name,
                email: linha.email,
                phone: linha.phone,
                customFields: r.valores as Prisma.InputJsonValue,
                source: "importacao",
              },
              select: { id: true, name: true, email: true, phone: true, customFields: true },
            });
        lembrar(contato);

        if (existing) updated += 1;
        else created += 1;

        if (tagId) novasEtiquetas.push({ contactId: contato.id, tagId });

        // Canal só faz sentido com telefone: é ele que identifica a pessoa no
        // WhatsApp e no Telegram.
        const externalId = agentId && channel && linha.phone ? externalIdDoCanal(channel, linha.phone) : null;
        if (externalId) novosCanais.push({ contactId: contato.id, agentId, channel, externalId });
      } catch (error) {
        falhar(linha.numero, error instanceof Error ? error.message : "falhou");
      }
    }

    // Etiqueta e canal em lote; o que já existia é ignorado (índice único).
    if (novasEtiquetas.length > 0) {
      await prisma.contactTag.createMany({ data: novasEtiquetas, skipDuplicates: true });
    }
    if (novosCanais.length > 0) {
      await prisma.contactChannel.createMany({ data: novosCanais, skipDuplicates: true });
    }
  }

  // A etiqueta é aplicada direto (sem passar por applyTag) porque importar mil
  // contatos não deve disparar mil sequências sem o usuário pedir. Pra
  // inscrever em régua depois de importar, use a tela de Sequências com o
  // segmento correspondente.
  return NextResponse.json({ created, updated, skipped, errors });
}
