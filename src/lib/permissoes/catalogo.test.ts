import { describe, it, expect } from "vitest";
import {
  LEGADO_DO_PAPEL,
  LEGADO_PARA_GRANULAR,
  PERMISSOES,
  ESCOPO_DA_CHAVE_EXIGE,
  escoposAcimaDoQuePode,
  limparEscopos,
  limparPermissoes,
  montarPermissoes,
  permissoesDoPapelDeSistema,
  permite,
  type PapelDeSistema,
  type PermissaoLegada,
} from "./catalogo";
import { RECURSOS } from "@/lib/server/api-v1/escopos";

const PAPEIS: PapelDeSistema[] = ["owner", "admin", "agent", "viewer"];
const ANTIGAS = Object.keys(LEGADO_PARA_GRANULAR) as PermissaoLegada[];

describe("compatibilidade com as permissões antigas", () => {
  it("papel de sistema responde a cada permissão antiga exatamente como antes", () => {
    for (const papel of PAPEIS) {
      const perms = permissoesDoPapelDeSistema(papel);
      for (const antiga of ANTIGAS) {
        expect(permite(perms, antiga), `${papel} × ${antiga}`).toBe(LEGADO_DO_PAPEL[papel].includes(antiga));
      }
    }
  });

  it("todo pacote antigo só tem permissões do catálogo", () => {
    for (const lista of Object.values(LEGADO_PARA_GRANULAR)) {
      for (const p of lista) expect(PERMISSOES).toContain(p);
    }
  });

  it("dono tem todas as permissões do catálogo", () => {
    expect(permissoesDoPapelDeSistema("owner")).toEqual([...PERMISSOES].sort());
  });

  it("leitura não edita nada", () => {
    const perms = permissoesDoPapelDeSistema("viewer");
    expect(perms.every((p) => p.endsWith(":ver") || p === "negocios:exportar")).toBe(true);
    expect(permite(perms, "negocios:ver")).toBe(true);
    expect(permite(perms, "negocios:editar")).toBe(false);
  });

  it("papel personalizado: antiga passa com qualquer granular do pacote; granular é exata", () => {
    const perms = ["negocios:editar", "negocios:ver"];
    expect(permite(perms, "contacts:manage")).toBe(true);
    expect(permite(perms, "read")).toBe(true);
    expect(permite(perms, "contatos:editar")).toBe(false);
    expect(permite(perms, "agents:manage")).toBe(false);
  });
});

describe("grupos e limpeza", () => {
  it("grupo soma ao papel, sem repetir e descartando o que não existe", () => {
    expect(montarPermissoes(["negocios:ver"], [["negocios:exportar", "negocios:ver", "inventada:x"]])).toEqual([
      "negocios:exportar",
      "negocios:ver",
    ]);
    expect(limparPermissoes("x")).toEqual([]);
  });

  it("escopo desconhecido vira todos", () => {
    expect(limparEscopos({ negocios: "proprios", contatos: "xyz" })).toEqual({
      negocios: "proprios",
      contatos: "todos",
      conversas: "todos",
    });
  });
});

describe("escopos da chave de API", () => {
  it("todo recurso da API v1 tem permissão correspondente", () => {
    expect(Object.keys(ESCOPO_DA_CHAVE_EXIGE).sort()).toEqual([...RECURSOS].sort());
  });

  it("quem não pode editar negócio não cria chave que escreve negócio", () => {
    const perms = permissoesDoPapelDeSistema("viewer");
    expect(escoposAcimaDoQuePode(["deals:read"], perms)).toEqual([]);
    expect(escoposAcimaDoQuePode(["deals:write", "deals:*", "*"], perms)).toEqual(["deals:write", "deals:*", "*"]);
  });

  it("dono pode dar *", () => {
    expect(escoposAcimaDoQuePode(["*"], permissoesDoPapelDeSistema("owner"))).toEqual([]);
  });
});
