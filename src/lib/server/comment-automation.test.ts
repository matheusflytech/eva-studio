import { describe, it, expect } from "vitest";
import { matchCommentAutomation, type CommentAutomationLike } from "./comment-automation";

function auto(p: Partial<CommentAutomationLike> & { id: string }): CommentAutomationLike {
  return { mediaId: "", keyword: "", active: true, publicReply: "", dmMessage: "dm", ...p };
}

describe("matchCommentAutomation", () => {
  it("casa palavra-chave por substring, sem diferenciar maiúscula", () => {
    const r = matchCommentAutomation([auto({ id: "a", keyword: "eu quero" })], { mediaId: "m1", text: "EU QUERO!!" });
    expect(r?.id).toBe("a");
  });

  it("aceita lista separada por vírgula", () => {
    const r = matchCommentAutomation([auto({ id: "a", keyword: "preço, valor" })], { mediaId: "m1", text: "qual o valor?" });
    expect(r?.id).toBe("a");
  });

  it("ignora inativa", () => {
    const r = matchCommentAutomation([auto({ id: "a", active: false })], { mediaId: "m1", text: "oi" });
    expect(r).toBeNull();
  });

  it("post específico + palavra ganha de genérico", () => {
    const list = [auto({ id: "gen" }), auto({ id: "esp", mediaId: "m1", keyword: "oi" })];
    expect(matchCommentAutomation(list, { mediaId: "m1", text: "oi" })?.id).toBe("esp");
  });

  it("post diferente não casa", () => {
    const r = matchCommentAutomation([auto({ id: "a", mediaId: "m2" })], { mediaId: "m1", text: "oi" });
    expect(r).toBeNull();
  });
});
