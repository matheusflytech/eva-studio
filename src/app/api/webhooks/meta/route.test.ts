import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import mention from "@/test/fixtures/meta/ig-story-mention.json";
import reply from "@/test/fixtures/meta/ig-story-reply.json";

const db = vi.hoisted(() => ({
  instagramConnection: { findUnique: vi.fn() },
  commentAutomation: { findMany: vi.fn(), update: vi.fn() },
  conversation: { upsert: vi.fn(), findUnique: vi.fn() },
}));
const engine = vi.hoisted(() => ({ advanceConversation: vi.fn() }));
const media = vi.hoisted(() => ({ baixarEGuardar: vi.fn() }));
const inbox = vi.hoisted(() => ({ registrarMensagens: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/flow-engine", () => engine);
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (v: string) => v }));
vi.mock("@/lib/server/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ count: 1 })) }));
vi.mock("@/lib/server/inbox", () => inbox);
vi.mock("@/lib/server/outbound", () => ({ sendInstagramText: vi.fn(), sendMessengerText: vi.fn() }));
vi.mock("@/lib/server/media-inbound", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/media-inbound")>();
  return { ...real, baixarEGuardar: media.baixarEGuardar, orgDoAgente: vi.fn(async () => "o1") };
});

import { POST } from "./route";

const SECRET = "segredo-de-teste";

function assinado(body: unknown): Request {
  const raw = JSON.stringify(body);
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
  return new Request("https://eva.test/api/webhooks/meta", {
    method: "POST",
    headers: { "x-hub-signature-256": sig, "Content-Type": "application/json" },
    body: raw,
  });
}

function instagram(entry: Record<string, unknown>) {
  return { object: "instagram", entry: [{ id: "IG_1", ...entry }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.META_APP_SECRET = SECRET;
  db.instagramConnection.findUnique.mockResolvedValue({ agentId: "a1", igBusinessId: "IG_1", pageAccessToken: "tok" });
  engine.advanceConversation.mockResolvedValue({ messages: [], status: "active" });
  media.baixarEGuardar.mockResolvedValue({ path: "o1/story.jpg", type: "image", mime: "image/jpeg" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("webhook Meta — Instagram", () => {
  it("menção em story vira evento story_mention com a mídia baixada", async () => {
    const res = await POST(assinado(instagram({ messaging: [mention] })));
    expect(res.status).toBe(200);
    expect(media.baixarEGuardar).toHaveBeenCalledWith("o1", "https://lookaside.example/mention1");
    expect(engine.advanceConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "instagram",
        contactId: "IGSID_2",
        text: "[Menção no story]",
        media: expect.objectContaining({ path: "o1/story.jpg" }),
        event: { kind: "story_mention", storyId: undefined, isReaction: false },
      })
    );
  });

  it("resposta a story leva o id do story ao motor", async () => {
    await POST(assinado(instagram({ messaging: [reply] })));
    expect(engine.advanceConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Quero o cupom",
        event: { kind: "story_reply", storyId: "STORY_1", isReaction: false },
      })
    );
  });

  it("assinatura inválida é recusada", async () => {
    const req = new Request("https://eva.test/api/webhooks/meta", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=errada" },
      body: JSON.stringify(instagram({ messaging: [reply] })),
    });
    expect((await POST(req)).status).toBe(401);
    expect(engine.advanceConversation).not.toHaveBeenCalled();
  });
});

describe("webhook Meta — automação de comentário", () => {
  const comentario = instagram({
    changes: [{ field: "comments", value: { id: "C1", text: "eu quero", from: { id: "IGSID_9" }, media: { id: "M1" } } }],
  });

  beforeEach(() => {
    db.commentAutomation.findMany.mockResolvedValue([
      { id: "ca1", mediaId: "", keyword: "quero", active: true, publicReply: "", dmMessage: "Te mandei no direct!" },
    ]);
    db.conversation.upsert.mockResolvedValue({ id: "c9" });
  });

  it("DM privada falhou: não conta disparo nem registra conversa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 400 })));
    await POST(assinado(comentario));
    expect(db.commentAutomation.update).not.toHaveBeenCalled();
    expect(inbox.registrarMensagens).not.toHaveBeenCalled();
  });

  it("DM privada saiu: registra e conta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await POST(assinado(comentario));
    expect(inbox.registrarMensagens).toHaveBeenCalled();
    expect(db.commentAutomation.update).toHaveBeenCalledWith({
      where: { id: "ca1" },
      data: { triggerCount: { increment: 1 } },
    });
  });
});
