import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({ agent: { findFirst: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ userId: "u1", orgId: "o1", role: "owner" })),
}));
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (v: string) => v }));

import { GET } from "./route";

const params = Promise.resolve({ agentId: "a1" });
const req = () => new Request("https://eva.test/api");

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findFirst.mockResolvedValue({
    id: "a1",
    instagramConnection: { igBusinessId: "IG_1", pageAccessToken: "IGAAtoken" },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("GET instagram-stories", () => {
  it("sem Instagram conectado: lista vazia com motivo", async () => {
    db.agent.findFirst.mockResolvedValue({ id: "a1", instagramConnection: null });
    expect(await (await GET(req(), { params })).json()).toEqual({ stories: [], reason: "Instagram não conectado." });
  });

  it("token do Instagram Login consulta graph.instagram.com e mapeia os stories", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ id: "S1", media_type: "IMAGE", media_url: "https://cdn/x.jpg", timestamp: "2026-10-18T10:00:00+0000" }] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await GET(req(), { params })).json();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("https://graph.instagram.com/v21.0/IG_1/stories");
    expect(body).toEqual({
      stories: [{ id: "S1", type: "IMAGE", preview: "https://cdn/x.jpg", postedAt: "2026-10-18T10:00:00+0000" }],
    });
  });

  it("Meta recusou: lista vazia com o status, sem 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stories: [], reason: "A Meta respondeu 403." });
  });
});
