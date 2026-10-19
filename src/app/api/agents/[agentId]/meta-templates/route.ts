import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";
import { requirePermission } from "@/lib/server/permissions";
import { FACEBOOK_GRAPH } from "@/lib/server/meta-graph";
import { criarTemplateNaMeta } from "@/lib/server/meta-templates";
import {
  modeloLocal,
  montarPayloadTemplate,
  previaTemplate,
  validarTemplate,
  type FormularioTemplate,
} from "@/lib/whatsapp/template-meta";
import type { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Templates da Meta.
//
// GET: status de aprovação, ao vivo, cruzado com os modelos deste agente. O
// app guarda um MessageTemplate local com `metaTemplateName` — o nome do
// template aprovado que ele deve usar quando a conversa está fora da janela
// de 24h. Status muda do lado de lá, então a fonte é a Meta; o último status
// recebido pelo webhook (message_template_status_update) fica gravado e só é
// usado como reserva, quando a consulta ao vivo falha — e a tela diz isso.
//
// POST: cria o template na Meta (POST /{WABA_ID}/message_templates) e o
// modelo local já ligado a ele, em análise. A aprovação chega pelo webhook.
// ---------------------------------------------------------------------------

interface TemplateDaMeta {
  id: string;
  name: string;
  status: string;
  category?: string;
  language: string;
  rejected_reason?: string;
  quality_score?: { score?: string };
  components?: { type: string; text?: string; format?: string }[];
}

/** O corpo do template, que é o que a pessoa reconhece. */
function corpoDo(t: TemplateDaMeta): string {
  return t.components?.find((c) => c.type === "BODY")?.text ?? "";
}

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const conn = await prisma.metaConnection.findUnique({ where: { agentId } });
  if (!conn) {
    // Não é erro: é o estado normal de quem ainda não ligou o canal oficial.
    // A tela sabe explicar isso melhor que um 404.
    return NextResponse.json({ conectado: false, templates: [], locais: [] });
  }

  const locais = await prisma.messageTemplate.findMany({
    where: { agentId },
    orderBy: { createdAt: "asc" },
  });

  const url = new URL(`${FACEBOOK_GRAPH}/${conn.wabaId}/message_templates`);
  url.searchParams.set("fields", "name,status,category,language,components,rejected_reason,quality_score");
  url.searchParams.set("limit", "200");

  let daMeta: TemplateDaMeta[] = [];
  let erro: string | null = null;

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${decryptSecret(conn.accessToken)}` },
      // Status de aprovação muda do lado da Meta; cache aqui só atrasaria a
      // notícia de que um template foi rejeitado.
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      erro = json?.error?.message ?? `A Meta respondeu ${res.status}.`;
    } else {
      daMeta = Array.isArray(json.data) ? json.data : [];
    }
  } catch {
    erro = "Não foi possível falar com a Meta agora.";
  }

  const porNome = new Map(daMeta.map((t) => [`${t.name}|${t.language}`, t]));

  return NextResponse.json({
    conectado: true,
    wabaId: conn.wabaId,
    erro,
    templates: daMeta.map((t) => ({
      id: t.id,
      nome: t.name,
      status: t.status,
      categoria: t.category ?? "",
      idioma: t.language,
      corpo: corpoDo(t),
      motivoRejeicao: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
      qualidade: t.quality_score?.score ?? null,
      // Este template está sendo usado por algum modelo deste agente?
      usadoAqui: locais.some(
        (l) => l.metaTemplateName === t.name && l.metaLanguageCode === t.language
      ),
    })),
    // O outro lado do cruzamento: modelo configurado aqui que não encontra par
    // lá. É o que quebra um disparo sem avisar.
    locais: locais.map((l) => {
      const alvo = l.metaTemplateName
        ? porNome.get(`${l.metaTemplateName}|${l.metaLanguageCode}`)
        : undefined;
      // null = não sabemos (a Meta não respondeu e nada foi gravado);
      // "AUSENTE" = o nome não existe lá. Pedem ações diferentes.
      const reserva = !!erro && !!l.metaStatus;
      return {
        id: l.id,
        nome: l.name,
        metaTemplateName: l.metaTemplateName,
        idioma: l.metaLanguageCode,
        corpo: l.bodyText,
        situacao: erro ? (l.metaStatus ?? null) : alvo ? alvo.status : "AUSENTE",
        situacaoReserva: reserva,
        motivoGravado: l.metaStatusReason ?? null,
        statusGravadoEm: l.metaStatusAt?.toISOString() ?? null,
      };
    }),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const conn = await prisma.metaConnection.findUnique({ where: { agentId } });
  if (!conn) return NextResponse.json({ error: "Este agente não tem o WhatsApp oficial conectado." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as (FormularioTemplate & { titulo?: string }) | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const formulario: FormularioTemplate = {
    nome: String(body.nome ?? "").trim(),
    categoria: body.categoria,
    idioma: String(body.idioma ?? "").trim(),
    header: body.header ?? { formato: "NONE" },
    corpo: String(body.corpo ?? ""),
    exemplos: body.exemplos ?? {},
    mapa: body.mapa ?? {},
    rodape: body.rodape ?? "",
    botoes: Array.isArray(body.botoes) ? body.botoes : [],
    validadeCodigoMin: body.validadeCodigoMin ? Number(body.validadeCodigoMin) : undefined,
  };

  const erros = validarTemplate(formulario);
  if (erros.length) return NextResponse.json({ error: erros[0].mensagem, erros }, { status: 400 });

  const repetido = await prisma.messageTemplate.findFirst({
    where: { agentId, metaTemplateName: formulario.nome, metaLanguageCode: formulario.idioma },
    select: { id: true },
  });
  if (repetido) {
    return NextResponse.json({ error: "Já existe um modelo com esse nome e idioma neste agente." }, { status: 409 });
  }

  const payload = montarPayloadTemplate(formulario);
  const criado = await criarTemplateNaMeta(conn.wabaId, decryptSecret(conn.accessToken), payload);
  if (!criado.ok) return NextResponse.json({ error: criado.erro }, { status: 502 });

  // Autenticação tem texto fixo da Meta; o único parâmetro é o código.
  const local =
    formulario.categoria === "AUTHENTICATION"
      ? { bodyText: previaTemplate(formulario).corpo.replace("*123456*", "{codigo}"), variableOrder: ["codigo"] }
      : modeloLocal(formulario);

  const template = await prisma.messageTemplate.create({
    data: {
      agentId,
      name: (body.titulo ?? "").trim() || formulario.nome,
      category: criado.category.toLowerCase(),
      bodyText: local.bodyText,
      metaTemplateName: formulario.nome,
      metaLanguageCode: formulario.idioma,
      variableOrder: local.variableOrder,
      metaTemplateId: criado.id,
      metaStatus: criado.status,
      metaStatusAt: new Date(),
      metaComponents: payload.components as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true, template: { id: template.id, metaTemplateId: criado.id, status: criado.status } });
}
