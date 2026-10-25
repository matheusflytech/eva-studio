import { describe, it, expect } from "vitest";
import { semChamadaEmTexto } from "./chamada-em-texto";

describe("semChamadaEmTexto", () => {
  it("tira a chamada escrita como texto e mantém a resposta (caso real do site)", () => {
    const r = semChamadaEmTexto(
      'crm_registrar_lead(nome="Lucas", interesse="Mais de uma frente",\ndesafio="Entender os produtos", etiqueta="Lead do site")\n\nLucas, agradecemos o contato! Nossa equipe entrará em contato em breve.'
    );
    expect(r.texto).toBe("Lucas, agradecemos o contato! Nossa equipe entrará em contato em breve.");
    expect(r.removidas).toEqual(["crm_registrar_lead"]);
  });

  it("não mexe em texto normal com parênteses", () => {
    const t = "Fale com a equipe pelo WhatsApp (21) 96915-6116 ou pelo e-mail (horário comercial).";
    expect(semChamadaEmTexto(t)).toEqual({ texto: t, removidas: [] });
  });

  it("só a chamada: vira resposta vazia (null)", () => {
    expect(semChamadaEmTexto('salvar_dados(cpf="123")').texto).toBeNull();
    expect(semChamadaEmTexto(null).texto).toBeNull();
  });
});
