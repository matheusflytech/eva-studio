import { describe, it, expect } from "vitest";
import {
  normalizarVariaveis,
  validarTemplate,
  montarPayloadTemplate,
  previaTemplate,
  modeloLocal,
  formularioVazio,
  type FormularioTemplate,
} from "./template-meta";

function form(over: Partial<FormularioTemplate> = {}): FormularioTemplate {
  return {
    ...formularioVazio(),
    nome: "boas_vindas",
    categoria: "MARKETING",
    idioma: "pt_BR",
    corpo: "Oi {{1}}, seu pedido {{2}} saiu.",
    exemplos: { "1": "Ana", "2": "#123" },
    ...over,
  };
}

const campos = (f: FormularioTemplate) => validarTemplate(f).map((e) => e.campo);

describe("normalizarVariaveis", () => {
  it("mantém {{1}} {{2}}", () => {
    expect(normalizarVariaveis("Oi {{1}}, pedido {{2}}.")).toEqual({ texto: "Oi {{1}}, pedido {{2}}.", chaves: ["1", "2"] });
  });

  it("{nome} e {{nome}} viram posicionais com a chave guardada", () => {
    expect(normalizarVariaveis("Oi {nome}, seu código é {{codigo}}.")).toEqual({
      texto: "Oi {{1}}, seu código é {{2}}.",
      chaves: ["nome", "codigo"],
    });
  });

  it("aceita espaços dentro das chaves duplas", () => {
    expect(normalizarVariaveis("Oi {{ 1 }}!").texto).toBe("Oi {{1}}!");
  });

  it("variável repetida reaproveita a mesma posição", () => {
    expect(normalizarVariaveis("{nome}, {nome} e {email}")).toEqual({
      texto: "{{1}}, {{1}} e {{2}}",
      chaves: ["nome", "email"],
    });
  });

  it("mistura formatos e numera na ordem em que aparecem", () => {
    expect(normalizarVariaveis("Pedido {{2}} de {nome} ({{1}})")).toEqual({
      texto: "Pedido {{1}} de {{2}} ({{3}})",
      chaves: ["2", "nome", "1"],
    });
  });

  it("{1} com chave simples numérica não é variável", () => {
    expect(normalizarVariaveis("Passo {1}").chaves).toEqual([]);
  });
});

describe("validarTemplate", () => {
  it("formulário certo não tem erro", () => {
    expect(validarTemplate(form())).toEqual([]);
  });

  it("nome precisa ser snake_case minúsculo", () => {
    for (const nome of ["Boas_vindas", "boas vindas", "promoção", "boas-vindas", ""]) {
      expect(campos(form({ nome }))).toContain("nome");
    }
    expect(campos(form({ nome: "promo_black_friday_2026" }))).not.toContain("nome");
  });

  it("idioma no formato da Meta", () => {
    expect(campos(form({ idioma: "pt-br" }))).toContain("idioma");
    expect(campos(form({ idioma: "en" }))).not.toContain("idioma");
  });

  it("corpo obrigatório e até 1024 caracteres", () => {
    expect(campos(form({ corpo: "  ", exemplos: {} }))).toContain("corpo");
    expect(campos(form({ corpo: "a".repeat(1025), exemplos: {} }))).toContain("corpo");
    expect(campos(form({ corpo: "a".repeat(1024), exemplos: {} }))).not.toContain("corpo");
  });

  it("corpo não pode começar nem terminar com variável", () => {
    expect(campos(form({ corpo: "{{1}} seu pedido saiu", exemplos: { "1": "Ana" } }))).toContain("corpo");
    expect(campos(form({ corpo: "Seu pedido saiu {{1}}", exemplos: { "1": "Ana" } }))).toContain("corpo");
    expect(campos(form({ corpo: "Seu pedido {{1}}.", exemplos: { "1": "#1" } }))).not.toContain("corpo");
  });

  it("toda variável do corpo precisa de exemplo", () => {
    const erros = validarTemplate(form({ exemplos: { "1": "Ana" } }));
    expect(erros.some((e) => e.campo === "exemplos" && e.mensagem.includes("{{2}}"))).toBe(true);
  });

  it("header de texto: até 60 e uma variável só, com exemplo", () => {
    expect(campos(form({ header: { formato: "TEXT", texto: "a".repeat(61) } }))).toContain("header");
    expect(campos(form({ header: { formato: "TEXT", texto: "Oi {{1}} e {{2}}", exemplo: "x" } }))).toContain("header");
    expect(campos(form({ header: { formato: "TEXT", texto: "Oi {{1}}" } }))).toContain("header");
    expect(campos(form({ header: { formato: "TEXT", texto: "Oi {{1}}", exemplo: "Ana" } }))).not.toContain("header");
  });

  it("header de mídia precisa do arquivo de exemplo", () => {
    expect(campos(form({ header: { formato: "IMAGE" } }))).toContain("header");
    expect(campos(form({ header: { formato: "IMAGE", handle: "4::aW1n" } }))).not.toContain("header");
  });

  it("rodapé até 60 e sem variável", () => {
    expect(campos(form({ rodape: "a".repeat(61) }))).toContain("rodape");
    expect(campos(form({ rodape: "Responda {{1}}" }))).toContain("rodape");
    expect(campos(form({ rodape: "Responda SAIR para não receber" }))).not.toContain("rodape");
  });

  it("limites de botões: 10 no total, 2 URL, 1 telefone, texto até 25", () => {
    const qr = (n: number) => Array.from({ length: n }, (_, i) => ({ tipo: "QUICK_REPLY" as const, texto: `Opção ${i}` }));
    expect(campos(form({ botoes: qr(10) }))).not.toContain("botoes");
    expect(campos(form({ botoes: qr(11) }))).toContain("botoes");

    const url = { tipo: "URL" as const, texto: "Ver", url: "https://loja.com" };
    expect(campos(form({ botoes: [url, url] }))).not.toContain("botoes");
    expect(campos(form({ botoes: [url, url, url] }))).toContain("botoes");

    const tel = { tipo: "PHONE_NUMBER" as const, texto: "Ligar", telefone: "+55 11 99999-8888" };
    expect(campos(form({ botoes: [tel] }))).not.toContain("botoes");
    expect(campos(form({ botoes: [tel, tel] }))).toContain("botoes");

    expect(campos(form({ botoes: [{ tipo: "QUICK_REPLY", texto: "a".repeat(26) }] }))).toContain("botoes");
    expect(campos(form({ botoes: [{ tipo: "QUICK_REPLY", texto: "" }] }))).toContain("botoes");
  });

  it("URL do botão: http(s), variável só no fim e com exemplo", () => {
    const b = (url: string, exemploUrl?: string) => form({ botoes: [{ tipo: "URL", texto: "Ver", url, exemploUrl }] });
    expect(campos(b("loja.com"))).toContain("botoes");
    expect(campos(b("https://loja.com/{{1}}"))).toContain("botoes");
    expect(campos(b("https://loja.com/{{1}}/x", "https://loja.com/a/x"))).toContain("botoes");
    expect(campos(b("https://loja.com/pedido/{{1}}", "https://loja.com/pedido/123"))).not.toContain("botoes");
  });

  it("telefone precisa ter DDI e só dígitos", () => {
    expect(campos(form({ botoes: [{ tipo: "PHONE_NUMBER", texto: "Ligar", telefone: "abc" }] }))).toContain("botoes");
  });

  it("AUTHENTICATION ignora corpo/botões e valida a validade do código", () => {
    const auth = form({ categoria: "AUTHENTICATION", corpo: "", exemplos: {}, validadeCodigoMin: 10 });
    expect(validarTemplate(auth)).toEqual([]);
    expect(campos({ ...auth, validadeCodigoMin: 120 })).toContain("validadeCodigoMin");
  });
});

describe("montarPayloadTemplate", () => {
  it("MARKETING completo, com botões agrupados (respostas rápidas antes das ações)", () => {
    const p = montarPayloadTemplate(
      form({
        header: { formato: "TEXT", texto: "Olá {nome}", exemplo: "Ana" },
        corpo: "Seu pedido {{1}} chega {{2}}.",
        exemplos: { "1": "#123", "2": "amanhã" },
        rodape: "Loja Exemplo",
        botoes: [
          { tipo: "URL", texto: "Rastrear", url: "https://loja.com/r/{{1}}", exemploUrl: "https://loja.com/r/abc" },
          { tipo: "QUICK_REPLY", texto: "Falar com alguém" },
          { tipo: "PHONE_NUMBER", texto: "Ligar", telefone: "+55 (11) 99999-8888" },
          { tipo: "QUICK_REPLY", texto: "Parar" },
        ],
      })
    );
    expect(p).toEqual({
      name: "boas_vindas",
      language: "pt_BR",
      category: "MARKETING",
      components: [
        { type: "HEADER", format: "TEXT", text: "Olá {{1}}", example: { header_text: ["Ana"] } },
        { type: "BODY", text: "Seu pedido {{1}} chega {{2}}.", example: { body_text: [["#123", "amanhã"]] } },
        { type: "FOOTER", text: "Loja Exemplo" },
        {
          type: "BUTTONS",
          buttons: [
            { type: "QUICK_REPLY", text: "Falar com alguém" },
            { type: "QUICK_REPLY", text: "Parar" },
            { type: "URL", text: "Rastrear", url: "https://loja.com/r/{{1}}", example: ["https://loja.com/r/abc"] },
            { type: "PHONE_NUMBER", text: "Ligar", phone_number: "+5511999998888" },
          ],
        },
      ],
    });
  });

  it("corpo com variáveis nomeadas usa os exemplos pela chave", () => {
    const p = montarPayloadTemplate(form({ corpo: "Oi {nome}, código {codigo}.", exemplos: { nome: "Ana", codigo: "X1" } }));
    expect(p.components).toEqual([
      { type: "BODY", text: "Oi {{1}}, código {{2}}.", example: { body_text: [["Ana", "X1"]] } },
    ]);
  });

  it("sem variável não manda example", () => {
    const p = montarPayloadTemplate(form({ categoria: "UTILITY", corpo: "Seu pedido saiu.", exemplos: {} }));
    expect(p.category).toBe("UTILITY");
    expect(p.components).toEqual([{ type: "BODY", text: "Seu pedido saiu." }]);
  });

  it("header de imagem leva o handle do exemplo", () => {
    const p = montarPayloadTemplate(form({ header: { formato: "IMAGE", handle: "4::aW1n" } }));
    expect(p.components[0]).toEqual({ type: "HEADER", format: "IMAGE", example: { header_handle: ["4::aW1n"] } });
  });

  it("URL fixa não leva example", () => {
    const p = montarPayloadTemplate(form({ botoes: [{ tipo: "URL", texto: "Site", url: "https://loja.com" }] }));
    expect(p.components.at(-1)).toEqual({ type: "BUTTONS", buttons: [{ type: "URL", text: "Site", url: "https://loja.com" }] });
  });

  it("AUTHENTICATION no formato fixo da Meta", () => {
    const p = montarPayloadTemplate(
      form({ nome: "codigo_login", categoria: "AUTHENTICATION", corpo: "", exemplos: {}, validadeCodigoMin: 10 })
    );
    expect(p).toEqual({
      name: "codigo_login",
      language: "pt_BR",
      category: "AUTHENTICATION",
      components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar código" }] },
      ],
    });
  });
});

describe("previaTemplate", () => {
  it("troca as variáveis pelos exemplos, e sem exemplo mostra a chave", () => {
    const p = previaTemplate(
      form({ header: { formato: "TEXT", texto: "Oi {nome}" }, corpo: "Pedido {{1}} de {nome}", exemplos: { "1": "#9" } })
    );
    expect(p.header).toEqual({ formato: "TEXT", texto: "Oi [nome]" });
    expect(p.corpo).toBe("Pedido #9 de [nome]");
  });

  it("AUTHENTICATION mostra o texto padrão da Meta", () => {
    const p = previaTemplate(form({ categoria: "AUTHENTICATION", corpo: "", validadeCodigoMin: 5 }));
    expect(p.corpo).toMatch(/código de verificação/);
    expect(p.rodape).toMatch(/5 minutos/);
  });
});

describe("modeloLocal", () => {
  it("guarda o corpo com {campo} e a ordem das variáveis para o envio", () => {
    expect(modeloLocal(form({ corpo: "Oi {{1}}, pedido {{2}}.", mapa: { "1": "nome" } }))).toEqual({
      bodyText: "Oi {nome}, pedido {2}.",
      variableOrder: ["nome", "2"],
    });
  });

  it("variável nomeada já é o campo", () => {
    expect(modeloLocal(form({ corpo: "Oi {nome}!", exemplos: { nome: "Ana" } })).variableOrder).toEqual(["nome"]);
  });
});
