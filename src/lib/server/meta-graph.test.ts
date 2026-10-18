import { describe, it, expect } from "vitest";
import { instagramGraphBase, FACEBOOK_GRAPH, INSTAGRAM_GRAPH } from "./meta-graph";

describe("instagramGraphBase", () => {
  it("token do Instagram Login (IGAA/IGQV) vai para graph.instagram.com", () => {
    expect(instagramGraphBase("IGAAxyz")).toBe(INSTAGRAM_GRAPH);
    expect(instagramGraphBase("IGQVJabc")).toBe(INSTAGRAM_GRAPH);
  });
  it("token de Página (EAA…) continua em graph.facebook.com", () => {
    expect(instagramGraphBase("EAAGabc")).toBe(FACEBOOK_GRAPH);
  });
});
