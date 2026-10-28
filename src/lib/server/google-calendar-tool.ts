import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { LlmTool, LlmToolCall } from "@/lib/server/llm";
import { deSaoPaulo, partesEmSP } from "@/lib/fuso-sp";
import { diaEmSP, noDia, somarDias, type Dia } from "@/lib/tarefas/calendario";
import { freeSlots, whyNot, type BusinessHours } from "@/lib/google-calendar/slots";
import { busyOf, createEvent } from "@/lib/server/google-calendar";

// Bloco "Agenda Google" ligado num Agente de IA: duas ferramentas. A IA vê
// horários livres e marca; as travas (dias, horas, ocupado, antecedência)
// valem aqui no servidor, não no prompt.

export const CALENDAR_TOOLS: LlmTool[] = [
  {
    name: "agenda_horarios_livres",
    description:
      "Lista horários livres para reunião (horário de Brasília). Sem dia, mostra os próximos dias com vaga. Ofereça 2 ou 3 opções ao cliente.",
    params: [{ name: "dia", description: "Dia no formato AAAA-MM-DD. Deixe vazio para os próximos dias.", required: false }],
  },
  {
    name: "agenda_marcar",
    description:
      "Marca a reunião num horário livre que o cliente escolheu. Confirme dia e hora com o cliente antes. Peça o e-mail para mandar o convite.",
    params: [
      { name: "inicio", description: "Início no formato AAAA-MM-DD HH:mm (horário de Brasília)." },
      { name: "email", description: "E-mail do cliente para o convite. Vazio = o do cadastro.", required: false },
      { name: "assunto", description: "Assunto curto da reunião.", required: false },
    ],
  },
];

export interface CalendarToolConfig {
  calendarConnectionId?: string;
  calendarId?: string;
  calendarDurationMin?: number;
  calendarDays?: number[];
  calendarStart?: string;
  calendarEnd?: string;
  calendarMeet?: boolean;
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dois = (n: number) => String(n).padStart(2, "0");
const rotuloDoDia = (d: Dia) => `${SEMANA[new Date(Date.UTC(d.ano, d.mes - 1, d.dia)).getUTCDay()]} ${dois(d.dia)}/${dois(d.mes)}`;
const hora = (t: Date) => {
  const p = partesEmSP(t);
  return `${dois(p.hora)}:${dois(p.minuto)}`;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function runCalendarTool(call: LlmToolCall, cfg: CalendarToolConfig, orgId: string, contactId: string | null, now = new Date()): Promise<string> {
  const conn = cfg.calendarConnectionId
    ? await prisma.googleCalendarConnection.findFirst({ where: { id: cfg.calendarConnectionId, orgId, status: "active" } })
    : null;
  if (!conn || !cfg.calendarId) return "A agenda deste atendimento não está conectada. Diga ao cliente que alguém da equipe vai combinar o horário.";
  const hours: BusinessHours = {
    days: cfg.calendarDays ?? [1, 2, 3, 4, 5],
    start: cfg.calendarStart ?? "09:00",
    end: cfg.calendarEnd ?? "18:00",
    durationMin: cfg.calendarDurationMin ?? 30,
  };

  if (call.name === "agenda_horarios_livres") {
    const pedido = String(call.arguments.dia ?? "").trim();
    const dia0 = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? deSaoPaulo(`${pedido}T12:00`) : null;
    if (pedido && !dia0) return "Dia inválido: use AAAA-MM-DD.";
    // Um dia pedido, ou até 14 dias à frente parando nos 3 primeiros com vaga.
    const inicio = dia0 ? diaEmSP(dia0) : diaEmSP(now);
    const total = dia0 ? 1 : 14;
    const busy = await busyOf(conn, cfg.calendarId, noDia(inicio), noDia(somarDias(inicio, total)));
    const linhas: string[] = [];
    for (let i = 0; i < total && linhas.length < 3; i++) {
      const d = somarDias(inicio, i);
      const slots = freeSlots(d, hours, busy, now);
      if (slots.length) linhas.push(`${rotuloDoDia(d)} (${d.ano}-${dois(d.mes)}-${dois(d.dia)}): ${slots.slice(0, 8).map(hora).join(", ")}`);
    }
    if (!linhas.length) return dia0 ? "Sem horário livre nesse dia. Ofereça outro dia." : "Sem horário livre nas próximas duas semanas.";
    return `Horários livres (Brasília, ${hours.durationMin} min):\n${linhas.join("\n")}`;
  }

  if (call.name === "agenda_marcar") {
    const start = deSaoPaulo(String(call.arguments.inicio ?? "").trim().replace(" ", "T"));
    if (!start) return "Início inválido: use AAAA-MM-DD HH:mm.";
    const d = diaEmSP(start);
    const busy = await busyOf(conn, cfg.calendarId, noDia(d), noDia(somarDias(d, 1)));
    const motivo = whyNot(start, hours, busy, now);
    if (motivo) return `Não marquei: ${motivo}. Consulte os horários livres e ofereça outro.`;

    const contato = contactId ? await prisma.contact.findFirst({ where: { id: contactId, orgId }, select: { name: true, phone: true, email: true } }) : null;
    const pedido = String(call.arguments.email ?? "").trim();
    const email = EMAIL.test(pedido) ? pedido : EMAIL.test(contato?.email ?? "") ? contato!.email : null;
    const nome = contato?.name?.trim() || "cliente";
    const assunto = String(call.arguments.assunto ?? "").trim().slice(0, 120);
    const r = await createEvent(conn, cfg.calendarId, {
      title: assunto ? `${assunto} · ${nome}` : `Reunião com ${nome}`,
      description: ["Marcada pelo agente de IA do Eva.", contato?.phone ? `Telefone: ${contato.phone}` : "", email ? `E-mail: ${email}` : ""].filter(Boolean).join("\n"),
      start,
      end: new Date(start.getTime() + hours.durationMin * 60_000),
      attendee: email,
      meet: cfg.calendarMeet !== false,
    });
    return [
      `Reunião marcada: ${rotuloDoDia(d)} às ${hora(start)} (Brasília), ${hours.durationMin} min.`,
      email ? `Convite enviado para ${email}.` : "Sem e-mail do cliente: o convite não foi enviado.",
      r.meet ? `Link do Google Meet: ${r.meet}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return "Ferramenta de agenda desconhecida.";
}
