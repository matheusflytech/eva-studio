import { describe, it, expect } from "vitest";
import {
  apiDoContrato,
  caminhoAtual,
  contratoDoCaminho,
  destinoDoCaminhoAntigo,
  ehIdDeContrato,
  idCurto,
  mesmoContrato,
  rotaDoContrato,
  tirarContrato,
  trocarContrato,
} from "./rotas";
import { comCabecalhoDoContrato, precisaDoContrato } from "./fetch-do-app";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
// Na URL vai o id curto (8 primeiros caracteres).
const a = "11111111";
const b = "22222222";
const ORIGEM = "https://app.eva";

describe("rotas do contrato", () => {
  it("põe o contrato na frente só de telas do app", () => {
    expect(rotaDoContrato(A, "/deals/9?tab=x")).toBe(`/${a}/deals/9?tab=x`);
    expect(rotaDoContrato(a, "/conversations?c=1")).toBe(`/${a}/conversations?c=1`);
    expect(rotaDoContrato(A, "/api/deals")).toBe("/api/deals");
    expect(rotaDoContrato(A, "/login")).toBe("/login");
    expect(rotaDoContrato(A, "https://x.com/deals")).toBe("https://x.com/deals");
    expect(rotaDoContrato(A, `/${A}/deals`)).toBe(`/${A}/deals`);
    expect(rotaDoContrato(null, "/deals")).toBe("/deals");
    // Caminho antigo guardado (aviso, recentes): ganha o contrato e o proxy traduz.
    expect(rotaDoContrato(A, "/negocios/9")).toBe(`/${a}/negocios/9`);
  });

  it("lê e tira o contrato do caminho", () => {
    expect(contratoDoCaminho(`/${A}/deals/1`)).toBe(A);
    expect(contratoDoCaminho("/deals")).toBeNull();
    expect(contratoDoCaminho("/admin")).toBeNull();
    expect(tirarContrato(`/${A}/deals/1`)).toBe("/deals/1");
    expect(tirarContrato(`/${A}`)).toBe("/");
    expect(tirarContrato("/admin")).toBe("/admin");
    expect(contratoDoCaminho(`/${a}/deals/1`)).toBe(a);
    expect(tirarContrato(`/${a}/deals/1`)).toBe("/deals/1");
  });

  it("id curto: 8 caracteres hexadecimais; o completo continua valendo", () => {
    expect(idCurto(A)).toBe(a);
    expect(idCurto("8D8D3A8C-2FF6-485E-A325-17384E9990CF")).toBe("8d8d3a8c");
    expect(ehIdDeContrato(a)).toBe(true);
    expect(ehIdDeContrato(A)).toBe(true);
    expect(ehIdDeContrato("home")).toBe(false);
    expect(ehIdDeContrato("1111111")).toBe(false);
    expect(ehIdDeContrato("favicon1")).toBe(false);
    expect(mesmoContrato(A, a)).toBe(true);
    expect(mesmoContrato(A, A)).toBe(true);
    expect(mesmoContrato(A, b)).toBe(false);
    expect(mesmoContrato(null, a)).toBe(false);
  });

  it("trocar de contrato mantém a seção, não o registro", () => {
    expect(trocarContrato(`/${A}/deals/123`, B)).toBe(`/${b}/deals`);
    expect(trocarContrato(`/${a}/settings`, B)).toBe(`/${b}/settings`);
    expect(trocarContrato("/admin", B)).toBe(`/${b}/home`);
  });

  it("link aberto pelo navegador leva o contrato na query", () => {
    expect(apiDoContrato(A, "/api/deals/exportar?formato=csv")).toBe(`/api/deals/exportar?formato=csv&contrato=${A}`);
    expect(apiDoContrato(A, "/api/x")).toBe(`/api/x?contrato=${A}`);
  });
});

describe("nomes antigos (português) → atuais (inglês)", () => {
  it("seção, sub-rota, parâmetros e valor da aba", () => {
    expect(caminhoAtual(`/${a}/negocios/123`, "?funil=2&aba=funis")).toBe(`/${a}/deals/123?pipeline=2&tab=pipelines`);
    expect(caminhoAtual(`/${a}/negocios/configurar`, "?aba=cartao&funil=3")).toBe(`/${a}/deals/configure?tab=card&pipeline=3`);
    expect(caminhoAtual(`/${a}/negocios/relatorio`, "?imprimir=1&busca=solar&dono=u1")).toBe(`/${a}/deals/report?print=1&q=solar&owner=u1`);
    expect(caminhoAtual(`/${a}/integracoes/api/referencia`)).toBe(`/${a}/integrations/api/reference`);
    expect(caminhoAtual(`/${a}/configuracoes`, "?aba=membros")).toBe(`/${a}/settings?tab=members`);
    expect(caminhoAtual(`/${a}/tarefas`, "?aba=calendario")).toBe(`/${a}/tasks?tab=calendar`);
    expect(caminhoAtual(`/${a}/contatos`, "?abrir=c1&etiqueta=t1")).toBe(`/${a}/contacts?open=c1&tag=t1`);
    expect(caminhoAtual(`/${a}/agent-studio/x1`, "?aba=canais")).toBe(`/${a}/agent-studio/x1?tab=channels`);
    expect(caminhoAtual(`/${A}/comecar`)).toBe(`/${a}/get-started`);
  });

  it("seção que não mudou de nome: só os parâmetros", () => {
    expect(caminhoAtual(`/${a}/dashboard`, "?de=2026-10-01&ate=2026-10-31&funis=1,2&donos=u1")).toBe(
      `/${a}/dashboard?from=2026-10-01&to=2026-10-31&pipelines=1%2C2&owners=u1`
    );
    expect(caminhoAtual(`/${a}/conversations`, "?c=9")).toBeNull();
    expect(caminhoAtual(`/${a}/deals`, "?pipeline=2")).toBeNull();
  });

  it("páginas fora do contrato", () => {
    expect(caminhoAtual("/convite", "?t=abc")).toBe("/invite?t=abc");
    expect(caminhoAtual("/descadastro", "?t=abc")).toBe("/unsubscribe?t=abc");
    expect(caminhoAtual("/ir", "?para=%2Fnegocios")).toBe("/go?to=%2Fnegocios");
    expect(caminhoAtual("/contratos", "?escolher=1&para=%2Fdeals")).toBe("/contracts?choose=1&to=%2Fdeals");
    expect(caminhoAtual("/contratos")).toBe("/contracts");
    expect(caminhoAtual("/invite", "?t=abc")).toBeNull();
  });

  it("não mexe no que não é tela do app", () => {
    for (const c of ["/api/deals", "/login", "/admin", "/", "/constructor", "/__proto__"]) expect(caminhoAtual(c, "?busca=x"), c).toBeNull();
    expect(caminhoAtual(`/${a}/negocios/constructor`, "?__proto__=1")).toBe(`/${a}/deals/constructor?__proto__=1`);
  });
});

describe("redirecionamento dos caminhos antigos", () => {
  it("sem contrato: vai para o último contrato usado, já com os nomes novos", () => {
    expect(destinoDoCaminhoAntigo("/negocios/42", "?funil=2&aba=x", A)).toBe(`/${a}/deals/42?pipeline=2&tab=x`);
    expect(destinoDoCaminhoAntigo("/conversas", "?c=9", A)).toBe(`/${a}/conversations?c=9`);
    expect(destinoDoCaminhoAntigo("/deals/42", "", A)).toBe(`/${a}/deals/42`);
  });

  it("sem cookie (ou cookie estranho) pergunta ao servidor em /go", () => {
    expect(destinoDoCaminhoAntigo("/negocios/configurar", "?aba=funis", null)).toBe(
      `/go?to=${encodeURIComponent("/deals/configure?tab=pipelines")}`
    );
    expect(destinoDoCaminhoAntigo("/inicio", "", "../etc")).toBe(`/go?to=${encodeURIComponent("/home")}`);
  });

  it("com contrato: só troca os nomes antigos", () => {
    expect(destinoDoCaminhoAntigo(`/${a}/negocios/123`, "?funil=2&aba=x", A)).toBe(`/${a}/deals/123?pipeline=2&tab=x`);
    expect(destinoDoCaminhoAntigo("/convite", "?t=abc", null)).toBe("/invite?t=abc");
  });

  it("id completo na URL vira o curto", () => {
    expect(destinoDoCaminhoAntigo(`/${A}/deals`, "?pipeline=2", A)).toBe(`/${a}/deals?pipeline=2`);
    expect(destinoDoCaminhoAntigo(`/${A}/negocios/7`, "", null)).toBe(`/${a}/deals/7`);
  });

  it("não mexe no que já está atual ou não é tela antiga", () => {
    expect(destinoDoCaminhoAntigo(`/${a}/deals`, "", A)).toBeNull();
    expect(destinoDoCaminhoAntigo("/login", "", A)).toBeNull();
    expect(destinoDoCaminhoAntigo("/api/deals", "?busca=x", A)).toBeNull();
    expect(destinoDoCaminhoAntigo("/admin", "", A)).toBeNull();
    expect(destinoDoCaminhoAntigo("/contracts", "?choose=1", A)).toBeNull();
  });
});

describe("cabeçalho do contrato no fetch", () => {
  it("cada aba manda o contrato da própria URL: duas abas não se misturam", () => {
    const [, a] = comCabecalhoDoContrato("/api/deals", undefined, `/${A}/deals`, ORIGEM);
    const [, b] = comCabecalhoDoContrato("/api/deals", undefined, `/${B}/deals`, ORIGEM);
    expect(new Headers(a?.headers).get("x-eva-contrato")).toBe(A);
    expect(new Headers(b?.headers).get("x-eva-contrato")).toBe(B);
  });

  it("preserva os cabeçalhos que a chamada já tinha", () => {
    const [, o] = comCabecalhoDoContrato(
      "/api/deals",
      { method: "POST", headers: { "Content-Type": "application/json" } },
      `/${A}/deals`,
      ORIGEM
    );
    const h = new Headers(o?.headers);
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("x-eva-contrato")).toBe(A);
    expect(o?.method).toBe("POST");
  });

  it("não manda nada fora de contrato, para outro site ou para a API pública", () => {
    expect(comCabecalhoDoContrato("/api/me", undefined, "/admin", ORIGEM)[1]).toBeUndefined();
    expect(precisaDoContrato("https://outro.com/api/deals", ORIGEM)).toBe(false);
    expect(precisaDoContrato("/api/v1/contacts", ORIGEM)).toBe(false);
    expect(precisaDoContrato("/api/webhooks/meta", ORIGEM)).toBe(false);
    expect(precisaDoContrato(`${ORIGEM}/api/deals`, ORIGEM)).toBe(true);
    expect(precisaDoContrato("/deals", ORIGEM)).toBe(false);
  });
});
