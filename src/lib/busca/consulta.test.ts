import { describe, expect, it } from "vitest";
import { escaparLike, MIN_DIGITOS_TELEFONE, normalizarConsulta, semAcento } from "./consulta";

describe("semAcento", () => {
  it("tira acento, cedilha e caixa", () => {
    expect(semAcento("João Ação Ç ÑANDU")).toBe("joao acao c nandu");
  });
  it("aceita texto já decomposto (NFD)", () => {
    expect(semAcento("José")).toBe("jose");
  });
});

describe("normalizarConsulta", () => {
  it("texto: sem acento, espaços colapsados e termos para o prefixo", () => {
    const c = normalizarConsulta("  Joã   Sil ");
    expect(c.texto).toBe("joa sil");
    expect(c.termos).toEqual(["joa", "sil"]);
    expect(c.vazia).toBe(false);
    expect(c.telefone).toBeNull();
    expect(c.cnpj).toBeNull();
    expect(c.email).toBeNull();
  });

  it("consulta de 1 letra é vazia (não vai ao servidor)", () => {
    expect(normalizarConsulta("a").vazia).toBe(true);
    expect(normalizarConsulta("   ").vazia).toBe(true);
  });

  it("limita os termos (consulta colada gigante não vira 40 LIKEs)", () => {
    const c = normalizarConsulta("a1 b2 c3 d4 e5 f6 g7 h8");
    expect(c.termos.length).toBeLessThanOrEqual(5);
  });

  it("telefone: qualquer trecho com dígitos suficientes, com ou sem máscara", () => {
    expect(normalizarConsulta("11 99999").telefone).toBe("1199999");
    expect(normalizarConsulta("(11) 99999-8888").telefone).toBe("11999998888");
    expect(normalizarConsulta("+55 11 99999-8888").telefone).toBe("5511999998888");
    expect(normalizarConsulta("99998888").telefone).toBe("99998888");
  });

  it("telefone: poucos dígitos ou texto misturado não é telefone", () => {
    expect(normalizarConsulta("123456").telefone).toBeNull();
    expect("123456".length).toBeLessThan(MIN_DIGITOS_TELEFONE);
    expect(normalizarConsulta("pedido 11999998888 joão").telefone).toBeNull();
  });

  it("CNPJ colado com pontuação é limpo (e prefixo de 8 dígitos vale)", () => {
    expect(normalizarConsulta("12.345.678/0001-90").cnpj).toBe("12345678000190");
    expect(normalizarConsulta("12345678000190").cnpj).toBe("12345678000190");
    expect(normalizarConsulta("12.345.678").cnpj).toBe("12345678");
    expect(normalizarConsulta("1234").cnpj).toBeNull();
    // Mais de 14 dígitos não é CNPJ.
    expect(normalizarConsulta("123456789012345").cnpj).toBeNull();
  });

  it("e-mail: em minúsculas, sem espaços; texto com @ não vira termos quebrados", () => {
    const c = normalizarConsulta("  Ana.Souza@Empresa.com.BR ");
    expect(c.email).toBe("ana.souza@empresa.com.br");
    expect(c.termos).toEqual(["ana.souza@empresa.com.br"]);
    expect(normalizarConsulta("ana@").email).toBe("ana@");
    expect(normalizarConsulta("ana souza").email).toBeNull();
  });
});

describe("escaparLike", () => {
  it("escapa curinga do LIKE (o termo é parâmetro, mas % e _ ainda seriam curinga)", () => {
    expect(escaparLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});
