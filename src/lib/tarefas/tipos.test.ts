import { describe, expect, it } from "vitest";
import {
  INFO_DO_TIPO,
  TIPOS_ACEITOS,
  acaoDeUmClique,
  contagemDoTipo,
  duracaoPadrao,
  normalizarTipoDeTarefa,
  rotuloDoTipo,
  tipoParaExibir,
} from "./tipos";

describe("tipos de tarefa", () => {
  it("ids antigos continuam válidos sem migração", () => {
    expect(normalizarTipoDeTarefa("ligar")).toBe("ligar");
    expect(normalizarTipoDeTarefa("email")).toBe("email");
    expect(normalizarTipoDeTarefa("reuniao")).toBe("reuniao");
    // "outro" (antigo) vira "a fazer"
    expect(normalizarTipoDeTarefa("outro")).toBe("afazer");
    expect(TIPOS_ACEITOS).toContain("outro");
  });

  it("aceita apelidos com acento, maiúscula e em inglês", () => {
    expect(normalizarTipoDeTarefa("Ligação")).toBe("ligar");
    expect(normalizarTipoDeTarefa("WhatsApp")).toBe("whatsapp");
    expect(normalizarTipoDeTarefa("zap")).toBe("whatsapp");
    expect(normalizarTipoDeTarefa("E-mail")).toBe("email");
    expect(normalizarTipoDeTarefa("Reunião")).toBe("reuniao");
    expect(normalizarTipoDeTarefa("visita")).toBe("visita");
    expect(normalizarTipoDeTarefa("todo")).toBe("afazer");
  });

  it("tipo inválido → null; para exibir vira a fazer", () => {
    expect(normalizarTipoDeTarefa("<script>")).toBeNull();
    expect(normalizarTipoDeTarefa(3)).toBeNull();
    expect(tipoParaExibir("qualquer")).toBe("afazer");
    expect(rotuloDoTipo("outro")).toBe("A fazer");
    expect(rotuloDoTipo("ligar")).toBe("Ligação");
  });

  it("durações padrão da skill", () => {
    expect(INFO_DO_TIPO.whatsapp.duracaoMin).toBe(3);
    expect(duracaoPadrao("ligar")).toBe(10);
    expect(duracaoPadrao("email")).toBe(5);
    expect(duracaoPadrao("outro")).toBe(15);
    expect(duracaoPadrao("reuniao")).toBe(30);
    expect(duracaoPadrao("visita")).toBe(60);
  });

  it("contagem para a fila", () => {
    expect(contagemDoTipo("whatsapp", 8)).toBe("8 WhatsApps");
    expect(contagemDoTipo("whatsapp", 1)).toBe("1 WhatsApp");
    expect(contagemDoTipo("ligar", 3)).toBe("3 ligações");
  });

  it("ação de um clique", () => {
    expect(acaoDeUmClique("ligar", { telefone: "5521981710669" })).toEqual({ href: "tel:+5521981710669", rotulo: "Ligar", externo: true });
    expect(acaoDeUmClique("whatsapp", { telefone: "5521981710669", conversaId: "c1" })?.href).toBe("/conversas?c=c1");
    expect(acaoDeUmClique("whatsapp", { telefone: "5521981710669" })?.href).toBe("https://wa.me/5521981710669");
    expect(acaoDeUmClique("email", { email: "a@b.com" })?.href).toBe("mailto:a@b.com");
    expect(acaoDeUmClique("reuniao", { telefone: "5521981710669" })).toBeNull();
    expect(acaoDeUmClique("ligar", null)).toBeNull();
    expect(acaoDeUmClique("ligar", { telefone: "" })).toBeNull();
  });
});
