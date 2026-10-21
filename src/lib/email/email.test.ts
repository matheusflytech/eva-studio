import { describe, it, expect } from "vitest";
import { resolverVariaveis, variaveisUsadas } from "./variaveis";
import { escaparHtml, htmlParaTexto, montarHtml, simplesParaHtml, simplesParaTexto } from "./editor";

const dados = {
  contato: { nome: "Ana Souza", email: "ana@x.com", telefone: "+5511999990000" },
  empresa: { nome: "Clínica Aurora" },
  campos: { cidade: "Goiânia", vazio: "" },
};

describe("resolverVariaveis", () => {
  it("contato, empresa, campo personalizado e primeiro nome", () => {
    const r = resolverVariaveis("Oi {{contato.primeiro_nome}}, da {{empresa.nome}} em {{campo.cidade}}", dados);
    expect(r).toEqual({ texto: "Oi Ana, da Clínica Aurora em Goiânia", faltando: [] });
  });

  it("vazio com padrão usa o padrão; vazio sem padrão bloqueia (lista o que faltou)", () => {
    expect(resolverVariaveis('Oi {{campo.vazio|padrao:"cliente"}}', dados).texto).toBe("Oi cliente");
    const r = resolverVariaveis("Oi {{campo.vazio}} {{contato.cargo}} {{contato.cargo}}", dados);
    expect(r.faltando).toEqual(["campo.vazio", "contato.cargo"]);
  });

  it("extras de quem envia e espaços dentro do token", () => {
    expect(resolverVariaveis("{{ negocio.nome }}", { extras: { "negocio.nome": "Plano anual" } }).texto).toBe("Plano anual");
  });

  it("escapa o valor no HTML (nome com tag não vira tag)", () => {
    const r = resolverVariaveis("<p>{{contato.nome}}</p>", { contato: { nome: "<b>Ana</b>" } }, escaparHtml);
    expect(r.texto).toBe("<p>&lt;b&gt;Ana&lt;/b&gt;</p>");
  });

  it("lista as variáveis usadas", () => {
    expect(variaveisUsadas('{{contato.nome}} {{campo.x|padrao:"y"}} {{contato.nome}}')).toEqual(["contato.nome", "campo.x"]);
  });
});

describe("editor simples", () => {
  it("parágrafos, negrito, link, lista e botão", () => {
    const html = simplesParaHtml("Olá **Ana**,\nveja [o site](https://eva.com).\n\n- um\n- dois\n\n[[Ver proposta|https://eva.com/p]]");
    expect(html).toContain("<strong>Ana</strong>");
    expect(html).toContain('<a href="https://eva.com" style="color:#308ce8;">o site</a>');
    expect(html).toContain("<br>");
    expect(html).toMatch(/<ul[^>]*><li[^>]*>um<\/li><li[^>]*>dois<\/li><\/ul>/);
    expect(html).toContain('href="https://eva.com/p"');
    expect(html).toContain(">Ver proposta</a>");
  });

  it("não deixa passar HTML nem link javascript:", () => {
    const html = simplesParaHtml('<script>x</script> [clique](javascript:alert(1)) [[Botão|javascript:x]]');
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/href="javascript/i);
  });

  it("versão em texto puro", () => {
    expect(simplesParaTexto("Oi **Ana**, [site](https://e.com)\n[[Ver|https://e.com/p]]")).toBe("Oi Ana, site (https://e.com)\nVer: https://e.com/p");
    expect(htmlParaTexto("<p>Oi <b>Ana</b></p><p>tchau &amp; até</p>")).toBe("Oi Ana\ntchau & até");
  });

  it("layout sempre leva o rodapé com o descadastro", () => {
    const html = montarHtml("<p>oi</p>", { remetente: "Loja <X>", linkDeDescadastro: "https://app/descadastro/t" }, "Assunto");
    expect(html).toContain("https://app/descadastro/t");
    expect(html).toContain("Loja &lt;X&gt;");
    expect(html).toContain("<title>Assunto</title>");
  });
});
