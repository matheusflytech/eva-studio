import { describe, it, expect } from "vitest";
import { classifyInstagramMessage } from "./instagram-events";
import reply from "@/test/fixtures/meta/ig-story-reply.json";
import reaction from "@/test/fixtures/meta/ig-story-reaction.json";
import mention from "@/test/fixtures/meta/ig-story-mention.json";
import dm from "@/test/fixtures/meta/ig-dm.json";

describe("classifyInstagramMessage", () => {
  it("resposta a story", () => {
    expect(classifyInstagramMessage(reply.message)).toEqual({
      kind: "story_reply",
      storyId: "STORY_1",
      storyUrl: "https://lookaside.example/story1",
      isReaction: false,
    });
  });
  it("reação com emoji num story", () => {
    expect(classifyInstagramMessage(reaction.message)).toMatchObject({ kind: "story_reply", isReaction: true });
  });
  it("menção em story", () => {
    expect(classifyInstagramMessage(mention.message)).toEqual({
      kind: "story_mention",
      storyUrl: "https://lookaside.example/mention1",
      isReaction: false,
    });
  });
  it("DM comum", () => {
    expect(classifyInstagramMessage(dm.message)).toEqual({ kind: "dm", isReaction: false });
  });
  it("mensagem vazia", () => {
    expect(classifyInstagramMessage({})).toEqual({ kind: "dm", isReaction: false });
  });
});
