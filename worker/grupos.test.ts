import { beforeEach, describe, expect, it, vi } from "vitest";
import { analisarMensagem } from "./contato.js";
import { esquecerModos, gruposParaLinhas, modoDoGrupo, sincronizarGrupos } from "./grupos.js";

const eu = { id: "5511999990001:12@s.whatsapp.net", lid: "987654321098765:12@lid" };
const noGrupo = (message: object) => ({ key: { remoteJid: "120363408777803125@g.us" }, message });

describe("modo do grupo em analisarMensagem", () => {
  const semMarcar = noGrupo({ conversation: "bom dia" });
  const marcando = noGrupo({ extendedTextMessage: { text: "@eva", contextInfo: { mentionedJid: ["5511999990001@s.whatsapp.net"] } } });

  it("mention (padrão): só responde quando marcado", () => {
    expect(analisarMensagem(semMarcar, eu)?.responder).toBe(false);
    expect(analisarMensagem(semMarcar, eu, "mention")?.responder).toBe(false);
    expect(analisarMensagem(marcando, eu, "mention")?.responder).toBe(true);
  });

  it("all: responde a tudo; off: nunca responde, nem marcado", () => {
    expect(analisarMensagem(semMarcar, eu, "all")?.responder).toBe(true);
    expect(analisarMensagem(marcando, eu, "off")?.responder).toBe(false);
  });

  it("o modo não muda a conversa 1:1", () => {
    expect(analisarMensagem({ key: { remoteJid: "5547999705773@s.whatsapp.net" } }, eu, "off")?.responder).toBe(true);
  });
});

describe("gruposParaLinhas", () => {
  it("fica só com grupos, usa size ou a lista de participantes e corta o nome", () => {
    const linhas = gruposParaLinhas({
      "1203@g.us": { id: "1203@g.us", subject: "Equipe", size: 12 },
      "1204@g.us": { id: "1204@g.us", subject: "x".repeat(300), participants: [{}, {}, {}] },
      "5511@s.whatsapp.net": { id: "5511@s.whatsapp.net", subject: "não é grupo" },
    });
    expect(linhas.map((l) => l.jid)).toEqual(["1203@g.us", "1204@g.us"]);
    expect(linhas[0]).toEqual({ jid: "1203@g.us", subject: "Equipe", participantsCount: 12 });
    expect(linhas[1].subject).toHaveLength(200);
    expect(linhas[1].participantsCount).toBe(3);
  });

  it("resposta vazia ou nula não quebra", () => {
    expect(gruposParaLinhas(null)).toEqual([]);
    expect(gruposParaLinhas({})).toEqual([]);
  });
});

describe("sincronizarGrupos", () => {
  it("grava cada grupo sem tocar no modo e marca como ausentes os que sumiram", async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => (sql.includes("from eva_studio_canais") ? { rows: [{ orgId: "org1" }] } : { rows: [] }));
    const total = await sincronizarGrupos({ query }, "canal1", [{ jid: "1203@g.us", subject: "Equipe", participantsCount: 5 }]);
    expect(total).toBe(1);
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes("insert into eva_studio_whatsapp_groups"));
    expect(inserts).toHaveLength(1);
    expect(String(inserts[0][0])).not.toMatch(/set[^;]*\bmode\b/); // o upsert não sobrescreve o modo escolhido
    const ausentes = query.mock.calls.find(([sql]) => String(sql).includes("set present = false"));
    expect(ausentes?.[1]).toEqual(["canal1", ["1203@g.us"]]);
  });

  it("canal que não é do WhatsApp por QR não grava nada", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    expect(await sincronizarGrupos({ query }, "canal1", [{ jid: "1@g.us", subject: "", participantsCount: 0 }])).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("modoDoGrupo", () => {
  beforeEach(() => esquecerModos());

  it("lê do banco, guarda por um tempo e cai em mention se o valor for estranho", async () => {
    const query = vi.fn(async () => ({ rows: [{ mode: "all" }] }));
    expect(await modoDoGrupo({ query }, "c1", "1@g.us")).toBe("all");
    expect(await modoDoGrupo({ query }, "c1", "1@g.us")).toBe("all");
    expect(query).toHaveBeenCalledTimes(1);
    expect(await modoDoGrupo({ query: async () => ({ rows: [{ mode: "qualquer" }] }) }, "c1", "2@g.us")).toBe("mention");
  });

  it("grupo ainda não sincronizado ou erro no banco: mention (comportamento de antes)", async () => {
    expect(await modoDoGrupo({ query: async () => ({ rows: [] }) }, "c1", "3@g.us")).toBe("mention");
    expect(
      await modoDoGrupo({ query: async () => { throw new Error("tabela não existe"); } }, "c1", "4@g.us")
    ).toBe("mention");
  });
});
