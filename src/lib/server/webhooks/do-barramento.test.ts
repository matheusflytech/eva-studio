import { describe, it, expect, vi, beforeEach } from "vitest";

const emitir = vi.hoisted(() => ({
  emitirEvento: vi.fn(),
  emitirEventoDeNegocio: vi.fn(),
  emitirEventoDeContato: vi.fn(),
  emitirEventoDeEmpresa: vi.fn(),
  emitirEventoDeTarefa: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./emitir", () => emitir);

import { paraWebhooks } from "./do-barramento";
import type { EventoPublicado } from "@/lib/server/eventos/barramento";

const evento = (over: Partial<EventoPublicado>): EventoPublicado => ({
  id: "e1",
  orgId: "o1",
  tipo: "deal.won",
  objeto: "deal",
  objetoId: "d1",
  dados: {},
  ator: { tipo: "sistema" },
  criadoEm: new Date(),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("webhooks a partir do barramento", () => {
  it("negócio: previous vem do detalhe do evento (etapa anterior)", async () => {
    await paraWebhooks(evento({ tipo: "deal.stage_changed", dados: { previous: { stage_id: "s1" } } }));
    expect(emitir.emitirEventoDeNegocio).toHaveBeenCalledWith("o1", "d1", "deal.stage_changed", { stage_id: "s1" });
  });

  it("alteração: previous é o lado 'de' do diff", async () => {
    await paraWebhooks(evento({ tipo: "contact.updated", objeto: "contact", objetoId: "c1", diff: { email: { de: "a@x", para: "b@x" } } }));
    expect(emitir.emitirEventoDeContato).toHaveBeenCalledWith("o1", "c1", "contact.updated", { email: "a@x" });
  });

  it("empresa, tarefa e lead (objeto contato)", async () => {
    await paraWebhooks(evento({ tipo: "company.created", objeto: "company", objetoId: "co1" }));
    await paraWebhooks(evento({ tipo: "task.created", objeto: "task", objetoId: "t1" }));
    await paraWebhooks(evento({ tipo: "lead.captured", objeto: "contact", objetoId: "c1" }));
    expect(emitir.emitirEventoDeEmpresa).toHaveBeenCalledWith("o1", "co1", "company.created", undefined);
    expect(emitir.emitirEventoDeTarefa).toHaveBeenCalledWith("o1", "t1", "task.created");
    expect(emitir.emitirEventoDeContato).toHaveBeenCalledWith("o1", "c1", "lead.captured", undefined);
  });

  it("mensagem: o corpo já vem no evento", async () => {
    await paraWebhooks(evento({ tipo: "message.received", objeto: "conversation", objetoId: "cv1", dados: { id: "m1", text: "oi" } }));
    const montar = emitir.emitirEvento.mock.calls[0][2] as () => Promise<unknown>;
    expect(emitir.emitirEvento.mock.calls[0][1]).toBe("message.received");
    expect(await montar()).toEqual({ data: { id: "m1", text: "oi" } });
  });

  it("evento fora do catálogo dos webhooks (só das automações) não sai", async () => {
    await paraWebhooks(evento({ tipo: "conversation.waiting_human", objeto: "conversation" }));
    expect(Object.values(emitir).every((f) => f.mock.calls.length === 0)).toBe(true);
  });
});
