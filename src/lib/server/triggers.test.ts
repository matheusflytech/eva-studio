import { describe, it, expect } from "vitest";
import {
  matchTrigger,
  normalizeText,
  isEmojiOnly,
  podeAvaliarGatilho,
  parseTriggerInput,
  type TriggerLike,
} from "./triggers";

let seq = 0;
function trig(p: Partial<TriggerLike>): TriggerLike {
  seq += 1;
  return {
    id: p.id ?? `t${seq}`,
    kind: "dm_keyword",
    channels: [],
    matchMode: "contains",
    keywords: [],
    storyId: "",
    includeReactions: true,
    priority: 0,
    active: true,
    createdAt: new Date(2026, 0, seq),
    ...p,
  };
}

describe("normalizeText / isEmojiOnly", () => {
  it("tira acento, caixa e espaço extra", () => {
    expect(normalizeText("  Promoção   DE Natal ")).toBe("promocao de natal");
  });
  it("detecta só emoji", () => {
    expect(isEmojiOnly("❤️")).toBe(true);
    expect(isEmojiOnly("🔥🔥")).toBe(true);
    expect(isEmojiOnly("👍🏽")).toBe(true);
    expect(isEmojiOnly("lindo ❤️")).toBe(false);
    expect(isEmojiOnly("")).toBe(false);
    expect(isEmojiOnly(undefined)).toBe(false);
  });
});

describe("matchTrigger — DM", () => {
  it("exata casa só o texto inteiro", () => {
    const t = trig({ id: "a", matchMode: "exact", keywords: ["promo"] });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "Promo" })?.id).toBe("a");
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "quero a promo" })).toBeNull();
  });
  it("parcial casa dentro do texto, sem acento", () => {
    const t = trig({ id: "a", matchMode: "contains", keywords: ["promoção"] });
    expect(matchTrigger([t], { channel: "whatsapp_meta", kind: "dm", text: "tem PROMOCAO?" })?.id).toBe("a");
  });
  it("várias palavras no mesmo gatilho", () => {
    const t = trig({ id: "a", keywords: ["preço", "valor", "quanto custa"] });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "quanto custa?" })?.id).toBe("a");
  });
  it("nada casa → null (fluxo padrão)", () => {
    const t = trig({ keywords: ["promo"] });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "oi" })).toBeNull();
  });
  it("modo any é ignorado em DM", () => {
    const t = trig({ matchMode: "any" });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "oi" })).toBeNull();
  });
  it("respeita canal, mas playground passa", () => {
    const t = trig({ id: "a", keywords: ["promo"], channels: ["instagram"] });
    expect(matchTrigger([t], { channel: "whatsapp_qr", kind: "dm", text: "promo" })).toBeNull();
    expect(matchTrigger([t], { channel: "builder_preview", kind: "dm", text: "promo" })?.id).toBe("a");
  });
  it("inativo não casa", () => {
    const t = trig({ keywords: ["promo"], active: false });
    expect(matchTrigger([t], { channel: "instagram", kind: "dm", text: "promo" })).toBeNull();
  });
  it("exata ganha de parcial; depois prioridade", () => {
    const parcial = trig({ id: "p", keywords: ["promo"], priority: 50 });
    const exata = trig({ id: "e", matchMode: "exact", keywords: ["promo"] });
    expect(matchTrigger([parcial, exata], { channel: "instagram", kind: "dm", text: "promo" })?.id).toBe("e");
    const p2 = trig({ id: "p2", keywords: ["promo"], priority: 10 });
    expect(matchTrigger([parcial, p2], { channel: "instagram", kind: "dm", text: "promo" })?.id).toBe("p");
  });
});

describe("matchTrigger — story", () => {
  const ctxReply = { channel: "instagram", kind: "story_reply" as const, text: "quero", storyId: "S1", isReaction: false };
  const ctxReact = { channel: "instagram", kind: "story_reply" as const, text: "❤️", storyId: "S1", isReaction: true };

  it("qualquer resposta a qualquer story", () => {
    const t = trig({ id: "a", kind: "story_reply", matchMode: "any" });
    expect(matchTrigger([t], ctxReply)?.id).toBe("a");
  });
  it("story específico ganha de qualquer story", () => {
    const geral = trig({ id: "g", kind: "story_reply", matchMode: "any" });
    const esp = trig({ id: "e", kind: "story_reply", matchMode: "any", storyId: "S1" });
    expect(matchTrigger([geral, esp], ctxReply)?.id).toBe("e");
  });
  it("story diferente não casa", () => {
    const t = trig({ kind: "story_reply", matchMode: "any", storyId: "S2" });
    expect(matchTrigger([t], ctxReply)).toBeNull();
  });
  it("reação só se includeReactions", () => {
    const sim = trig({ id: "s", kind: "story_reply", matchMode: "any", includeReactions: true });
    const nao = trig({ id: "n", kind: "story_reply", matchMode: "any", includeReactions: false });
    expect(matchTrigger([nao], ctxReact)).toBeNull();
    expect(matchTrigger([nao, sim], ctxReact)?.id).toBe("s");
  });
  it("filtro por palavra na resposta do story", () => {
    const t = trig({ id: "a", kind: "story_reply", matchMode: "contains", keywords: ["cupom"] });
    expect(matchTrigger([t], { ...ctxReply, text: "manda o CUPOM" })?.id).toBe("a");
    expect(matchTrigger([t], ctxReply)).toBeNull();
  });
  it("resposta a story sem gatilho de story cai na palavra-chave de DM", () => {
    const dm = trig({ id: "dm", keywords: ["quero"] });
    expect(matchTrigger([dm], ctxReply)?.id).toBe("dm");
  });
  it("reação sem gatilho de story NÃO cai na DM", () => {
    const dm = trig({ matchMode: "contains", keywords: ["❤"] });
    expect(matchTrigger([dm], ctxReact)).toBeNull();
  });
  it("menção casa gatilho de menção", () => {
    const t = trig({ id: "m", kind: "story_mention", matchMode: "any" });
    expect(matchTrigger([t], { channel: "instagram", kind: "story_mention", text: "[Menção no story]" })?.id).toBe("m");
  });
});

describe("podeAvaliarGatilho", () => {
  it("DM: só fora de Captura", () => {
    expect(podeAvaliarGatilho(null, "dm")).toBe(true);
    expect(podeAvaliarGatilho("ai-agent", "dm")).toBe(true);
    expect(podeAvaliarGatilho("agent", "dm")).toBe(true);
    expect(podeAvaliarGatilho("wait", "dm")).toBe(true);
    expect(podeAvaliarGatilho("capture", "dm")).toBe(false);
  });
  it("story: sempre", () => {
    expect(podeAvaliarGatilho("capture", "story_reply")).toBe(true);
    expect(podeAvaliarGatilho("capture", "story_mention")).toBe(true);
  });
});

describe("parseTriggerInput", () => {
  const base = { name: "Promo", kind: "dm_keyword", matchMode: "exact", keywords: "promo, PROMOÇÃO", replyText: "Oi!" };
  it("aceita palavras em texto separado por vírgula", () => {
    const r = parseTriggerInput(base);
    expect("data" in r && r.data.keywords).toEqual(["promo", "PROMOÇÃO"]);
  });
  it("DM exige palavra", () => {
    expect(parseTriggerInput({ ...base, keywords: "" })).toEqual({ error: "Informe ao menos uma palavra-chave." });
  });
  it("DM não aceita 'qualquer mensagem'", () => {
    expect("error" in parseTriggerInput({ ...base, matchMode: "any" })).toBe(true);
  });
  it("exige resposta ou bloco de destino", () => {
    expect(parseTriggerInput({ ...base, replyText: "" })).toEqual({
      error: "Defina uma mensagem de resposta ou um bloco do fluxo para seguir.",
    });
  });
  it("story força canal instagram e limpa storyId em menção", () => {
    const r = parseTriggerInput({ name: "M", kind: "story_mention", storyId: "X", replyText: "Valeu!", channels: ["telegram"] });
    expect("data" in r && r.data.channels).toEqual(["instagram"]);
    expect("data" in r && r.data.storyId).toBe("");
  });
  it("tipo inválido", () => {
    expect("error" in parseTriggerInput({ ...base, kind: "xyz" })).toBe(true);
  });
});
