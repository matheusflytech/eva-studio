import { describe, expect, it } from "vitest";
import { combina, montarGrupos, type ContextoDoRegistro, type EntradaDosGrupos } from "./grupos";
import { RESULTADO_VAZIO } from "./resultado";
import { permissoesDoPapelDeSistema } from "@/lib/permissoes/catalogo";

const todas = permissoesDoPapelDeSistema("owner");
const leitura = permissoesDoPapelDeSistema("viewer");

const entrada = (over: Partial<EntradaDosGrupos>): EntradaDosGrupos => ({
  consulta: "",
  permissoes: todas,
  contexto: null,
  resultados: null,
  recentes: [],
  ...over,
});

const ids = (e: EntradaDosGrupos) => montarGrupos(e).map((g) => g.id);

const resultados = {
  ...RESULTADO_VAZIO,
  negocios: [{ tipo: "negocio" as const, id: "d1", titulo: "Alfa", subtitulo: "", caminho: "/deals/d1" }],
  contatos: [{ tipo: "contato" as const, id: "c1", titulo: "Alfredo", subtitulo: "", caminho: "/contacts?open=c1" }],
  empresas: [{ tipo: "empresa" as const, id: "e1", titulo: "Alfa Ltda", subtitulo: "", caminho: "/companies/e1" }],
  notas: [{ tipo: "nota" as const, id: "n1", titulo: "Nota", trecho: { texto: "alfa", destaques: [] }, caminho: "/deals/d1", quando: "" }],
  mensagens: [{ tipo: "mensagem" as const, id: "m1", titulo: "WhatsApp", trecho: { texto: "alfa", destaques: [] }, caminho: "/conversations?c=x", quando: "" }],
};

const recente = { tipo: "negocio" as const, id: "d9", titulo: "Alfa antigo", caminho: "/deals/d9" };

describe("montarGrupos: ordem", () => {
  it("sem consulta: recentes, ações, ir para", () => {
    expect(ids(entrada({ recentes: [recente] }))).toEqual(["recentes", "acoes", "ir"]);
  });

  it("com consulta: ações, ir para, registros por tipo, notas e mensagens, recentes", () => {
    const g = montarGrupos(entrada({ consulta: "alf", resultados, recentes: [recente] }));
    expect(g.map((x) => x.id)).toEqual(["negocios", "contatos", "empresas", "notas", "recentes"]);
    // "cri" acha as ações e nenhuma página.
    expect(ids(entrada({ consulta: "cri", resultados: RESULTADO_VAZIO }))).toEqual(["acoes"]);
    // "neg" acha ação e página.
    expect(ids(entrada({ consulta: "neg", resultados: RESULTADO_VAZIO }))).toEqual(["acoes", "ir"]);
    const notas = g.find((x) => x.id === "notas")!;
    expect(notas.titulo).toBe("Notas e mensagens");
    expect(notas.itens.map((i) => i.chave)).toEqual(["nota:n1", "mensagem:m1"]);
  });

  it("recente que já veio nos resultados não repete", () => {
    const r2 = { ...recente, id: "d1" };
    const g = montarGrupos(entrada({ consulta: "alf", resultados, recentes: [r2] }));
    expect(g.find((x) => x.id === "recentes")).toBeUndefined();
  });
});

describe("montarGrupos: contexto do registro", () => {
  const negocio: ContextoDoRegistro = { tipo: "negocio", id: "d1", titulo: "Alfa", mudarEtapa: true, atribuir: true, whatsappPara: "Maria" };

  it("na ficha do negócio, as ações dele vêm primeiro", () => {
    const g = montarGrupos(entrada({ contexto: negocio, recentes: [recente] }));
    expect(g[0].id).toBe("registro");
    expect(g[0].titulo).toBe("Negócio: Alfa");
    expect(g[0].itens.map((i) => (i.tipo === "acao" ? i.rotulo : ""))).toEqual([
      "Mudar etapa para…",
      "Atribuir a…",
      "Enviar WhatsApp para Maria",
      "Criar tarefa neste negócio",
    ]);
    // E continua primeiro com consulta.
    expect(ids(entrada({ contexto: negocio, consulta: "etapa", resultados: RESULTADO_VAZIO }))[0]).toBe("registro");
  });

  it("sem permissão de editar, não oferece mudar etapa nem atribuir", () => {
    const g = montarGrupos(entrada({ contexto: negocio, permissoes: leitura }));
    const rotulos = g[0].itens.map((i) => (i.tipo === "acao" ? i.acao : ""));
    expect(rotulos).toEqual(["enviar-whatsapp"]);
  });

  it("contato: WhatsApp e tarefa para ele; empresa sem ações próprias", () => {
    const g = montarGrupos(entrada({ contexto: { tipo: "contato", id: "c1", titulo: "Maria", whatsappPara: "Maria" } }));
    expect(g[0].itens.map((i) => (i.tipo === "acao" ? i.rotulo : ""))).toEqual(["Enviar WhatsApp para Maria", "Criar tarefa para Maria"]);
    expect(ids(entrada({ contexto: { tipo: "empresa", id: "e1", titulo: "Alfa" } }))[0]).not.toBe("registro");
  });
});

describe("montarGrupos: permissões", () => {
  it("Leitura não vê ações de criar nem páginas que não pode abrir", () => {
    const g = montarGrupos(entrada({ permissoes: leitura }));
    const acoes = g.find((x) => x.id === "acoes")!.itens.map((i) => (i.tipo === "acao" ? i.acao : ""));
    expect(acoes).toEqual(["enviar-whatsapp"]);
    const paginas = g.find((x) => x.id === "ir")!.itens.map((i) => (i.tipo === "pagina" ? i.caminho : ""));
    expect(paginas).toContain("/deals");
    expect(paginas).not.toContain("/integrations");
    expect(paginas).not.toContain("/sequences");
  });

  it("sem permissão nenhuma, só o que é de todos", () => {
    const g = montarGrupos(entrada({ permissoes: [] }));
    expect(g.map((x) => x.id)).toEqual(["ir"]);
    const paginas = g[0].itens.map((i) => (i.tipo === "pagina" ? i.caminho : ""));
    expect(paginas).toEqual(["/home", "/library", "/settings", "/help"]);
  });
});

describe("combina", () => {
  it("prefixo de palavra, sem acento, todos os termos", () => {
    expect(combina("Mudar etapa para…", ["eta"])).toBe(true);
    expect(combina("Negócios funil", ["neg", "fun"])).toBe(true);
    expect(combina("Negócios", ["gocios"])).toBe(false);
    expect(combina("Configurações", ["configuracoes"])).toBe(true);
  });
});
