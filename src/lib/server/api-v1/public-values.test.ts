import { describe, it, expect } from "vitest";
import { MOTIVOS_PADRAO } from "@/lib/regras-de-etapa";
import { LEAD_STAGES } from "@/lib/server/leads";
import { TIPOS_DE_TAREFA, normalizarTipoDeTarefa } from "@/lib/tarefas/tipos";
import {
  DEFAULT_LOST_REASON,
  LEAD_STAGE,
  TASK_TYPE,
  enrollmentStop,
  fromPublic,
  lostReasonIdFromPublic,
  lostReasonIdToPublic,
  requiredFieldToPublic,
  toPublic,
} from "./public-values";

describe("valores públicos da API em inglês", () => {
  it("todo valor gravado tem nome em inglês (lista nova no app = teste quebra até mapear)", () => {
    for (const t of TIPOS_DE_TAREFA) expect(TASK_TYPE[t]).toMatch(/^[a-z_]+$/);
    for (const s of LEAD_STAGES) expect(LEAD_STAGE[s]).toMatch(/^[a-z_]+$/);
    for (const m of MOTIVOS_PADRAO) expect(DEFAULT_LOST_REASON[m.id]).toMatch(/^default:[a-z_]+$/);
  });

  it("entrada aceita o nome novo e o antigo; o motor recebe o antigo", () => {
    expect(fromPublic(TASK_TYPE, "meeting")).toBe("reuniao");
    expect(fromPublic(TASK_TYPE, "reuniao")).toBe("reuniao");
    expect(fromPublic(TASK_TYPE, "reunião")).toBeUndefined();
    for (const novo of Object.values(TASK_TYPE)) expect(normalizarTipoDeTarefa(novo)).not.toBeNull();
    expect(lostReasonIdFromPublic("default:no_budget")).toBe("padrao:sem-orcamento");
    expect(lostReasonIdFromPublic("padrao:preco")).toBe("padrao:preco");
    expect(lostReasonIdFromPublic("9b1c-uuid-do-banco")).toBe("9b1c-uuid-do-banco");
  });

  it("saída: conhecido traduz, desconhecido passa como está, null fica null", () => {
    expect(toPublic(LEAD_STAGE, "qualificado")).toBe("qualified");
    expect(toPublic(LEAD_STAGE, "algo-novo")).toBe("algo-novo");
    expect(toPublic(LEAD_STAGE, null)).toBeNull();
    expect(lostReasonIdToPublic("padrao:outro")).toBe("default:other");
    expect(requiredFieldToPublic("previsao")).toBe("expected_closing_at");
    expect(requiredFieldToPublic("cf:consumo_kwh")).toBe("custom_fields.consumo_kwh");
  });

  it("motivo de saída da sequência: código conhecido, ou send_failed com o texto", () => {
    expect(enrollmentStop("respondeu")).toEqual({ stopped_reason: "replied", stopped_detail: null });
    expect(enrollmentStop("automação")).toEqual({ stopped_reason: "automation", stopped_detail: null });
    expect(enrollmentStop("fora da janela de 24h")).toEqual({ stopped_reason: "send_failed", stopped_detail: "fora da janela de 24h" });
    expect(enrollmentStop(null)).toEqual({ stopped_reason: null, stopped_detail: null });
  });
});
