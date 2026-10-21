import { describe, it, expect } from "vitest";
import { validar, podePublicar } from "./validar";
import { exemploProposta } from "./exemplo.test-helpers";
import { definicaoVazia, type Definicao, type No } from "./tipos";

const mensagens = (d: Definicao) => validar(d).map((p) => `${p.nivel}:${p.no}:${p.mensagem}`);
const trocar = (d: Definicao, id: string, patch: Partial<No> & Record<string, unknown>) => {
  d.nos[id] = { ...d.nos[id], ...patch } as No;
};

describe("validar", () => {
  it("vazia: pede gatilho e não deixa publicar", () => {
    const vazia = definicaoVazia("deal");
    expect(mensagens(vazia).some((x) => x.startsWith("erro:gatilho:Escolha o gatilho"))).toBe(true);
    expect(podePublicar(validar(vazia))).toBe(false);
    expect(podePublicar(validar(exemploProposta()))).toBe(true);
  });

  it("gatilho de outro objeto e campo obrigatório faltando", () => {
    const d = exemploProposta();
    expect(mensagens({ ...d, gatilho: { tipo: "contact.created", config: {} } })).toContain("erro:gatilho:Este gatilho é de outro tipo de registro.");
    expect(mensagens({ ...d, gatilho: { tipo: "deal.stage_entered", config: {} } })).toContain("erro:gatilho:Gatilho: falta Etapa.");
  });

  it("campo obrigatório que só aparece com outra opção (mostrarSe)", () => {
    const d = exemploProposta();
    trocar(d, "zap", { config: { agente: "a1", modo: "texto" } });
    expect(mensagens(d)).toContain("erro:zap:Mandar WhatsApp: falta Texto.");
  });

  it("ação que não vale para o objeto", () => {
    const d = { ...exemploProposta(), objeto: "company" as const, gatilho: { tipo: "company.created", config: {} } };
    expect(mensagens(d)).toContain("erro:zap:“Mandar WhatsApp” não vale para este tipo de registro.");
  });

  it("passo solto, dois pais e ciclo", () => {
    const d = exemploProposta();
    d.nos.solto = { id: "solto", tipo: "fim" };
    trocar(d, "nota", { proximo: "tarefa" });
    trocar(d, "tarefa", { proximo: "espera" });
    const m = mensagens(d);
    expect(m).toContain("erro:solto:Passo solto: nada chega até ele.");
    expect(m).toContain("erro:tarefa:Passo com mais de uma entrada.");
    expect(m.some((x) => x.includes("ciclo"))).toBe(true);
  });

  it("WhatsApp em texto depois de esperar 24h ou mais gera aviso", () => {
    const d = exemploProposta();
    trocar(d, "zap", { config: { agente: "a1", modo: "texto", texto: "Oi" } });
    expect(mensagens(d).some((x) => x.startsWith("aviso:zap:") && x.includes("janela"))).toBe(true);
  });

  it("variável de passo só de passo que vem antes", () => {
    const d = exemploProposta();
    trocar(d, "zap", { config: { agente: "a1", modo: "modelo", modelo: "m1", extra: "{{passos.tarefa.id}}" } });
    trocar(d, "tarefa", { config: { texto: "Ver {{passos.zap.status}}" } });
    const m = mensagens(d);
    expect(m).toContain("erro:zap:A variável {{passos.tarefa.id}} usa um passo que não vem antes deste.");
    expect(m.some((x) => x.startsWith("erro:tarefa:A variável"))).toBe(false);
  });

  it("esperar evento sem prazo, e evento que não existe no objeto", () => {
    const d = exemploProposta();
    trocar(d, "nota", { proximo: "ev" });
    d.nos.ev = { id: "ev", tipo: "esperar_evento", evento: "contact.tag_added", prazo: { quantidade: 0, unidade: "dias" }, aconteceu: null, esgotou: null };
    expect(mensagens(d).some((x) => x.startsWith("erro:ev:Defina o prazo"))).toBe(true);
    trocar(d, "ev", { prazo: { quantidade: 1, unidade: "dias" } });
    expect(mensagens(d).some((x) => x.startsWith("erro:ev:"))).toBe(false);
    trocar(d, "ev", { evento: "inventado" });
    expect(mensagens(d)).toContain("erro:ev:Escolha o que esperar.");
  });

  it("gatilho campo alterado + ação que muda o mesmo campo: aviso", () => {
    const d = exemploProposta();
    d.gatilho = { tipo: "deal.field_changed", config: { campo: "registro.amount_cents" } };
    d.nos.nota = { id: "nota", tipo: "acao", acao: "record.update_fields", config: { campos: [{ campo: "registro.amount_cents", valor: "1" }] }, proximo: null };
    expect(mensagens(d).some((x) => x.startsWith("aviso:nota:Altera o mesmo campo"))).toBe(true);
  });
});
