import { partesEmSP } from "@/lib/fuso-sp";
import { diaEmSP, diasEntre, diaDaSemana } from "./calendario";
import { ehDiaTodo } from "./agrupar";

// Texto curto do prazo na lista: "Hoje 14:00", "Amanhã", "qui 23/10 09:00",
// "Ontem", "12/09". Sempre no relógio de SP, 24h.

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dois = (n: number) => String(n).padStart(2, "0");

export function textoDoPrazo(dueAt: string | Date | null, diaTodo: boolean | null | undefined, agora: Date): string {
  if (!dueAt) return "Sem data";
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const todo = ehDiaTodo(d, diaTodo);
  const p = partesEmSP(d);
  const hora = todo ? "" : ` ${dois(p.hora)}:${dois(p.minuto)}`;
  const dia = diaEmSP(d);
  const delta = diasEntre(diaEmSP(agora), dia);
  if (delta === 0) return `Hoje${hora}`;
  if (delta === 1) return `Amanhã${hora}`;
  if (delta === -1) return `Ontem${hora}`;
  if (delta > 1 && delta < 7) return `${SEMANA[diaDaSemana(dia)]} ${dois(p.dia)}/${dois(p.mes)}${hora}`;
  const ano = dia.ano !== diaEmSP(agora).ano ? `/${dia.ano}` : "";
  return `${dois(p.dia)}/${dois(p.mes)}${ano}${hora}`;
}

/** "45 min", "1h", "1h30". */
export function textoDeMinutos(min: number): string {
  if (min < 60) return `${Math.max(0, Math.round(min))} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h${dois(m)}` : `${h}h`;
}
