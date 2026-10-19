import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  apiKey: { findFirst: vi.fn(), update: vi.fn() },
  agent: { findFirst: vi.fn() },
  tag: { findFirst: vi.fn(), count: vi.fn() },
  segment: { findFirst: vi.fn() },
  pipelineStage: { findFirst: vi.fn() },
  messageTemplate: { count: vi.fn() },
  sequence: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  sequenceStep: { deleteMany: vi.fn(), createMany: vi.fn() },
  sequenceEnrollment: { updateMany: vi.fn() },
  contact: { findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
const rate = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
const seq = vi.hoisted(() => ({ enrollContact: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/rate-limit", () => rate);
vi.mock("@/lib/server/sequences", async (orig) => ({ ...(await orig<typeof import("@/lib/server/sequences")>()), enrollContact: seq.enrollContact }));
vi.mock("@/lib/server/outbound", () => ({ deliverToContact: vi.fn() }));

import { POST } from "./route";
import { PATCH } from "./[id]/route";
import { POST as INSCREVER } from "./[id]/enrollments/route";

const req = (method: string, body?: unknown) =>
  new Request("https://eva.test/api/v1/sequences", {
    method,
    headers: { authorization: "Bearer evs_live_abc" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const semParams = { params: Promise.resolve({}) } as { params: Promise<Record<string, never>> };
const p = (id: string) => ({ params: Promise.resolve({ id }) });

const sequencia = (extra: Record<string, unknown> = {}) => ({
  id: "q1",
  agentId: "ag1",
  name: "Follow-up",
  channel: "whatsapp_meta",
  active: false,
  trigger: "manual",
  triggerTagId: null,
  triggerSegmentId: null,
  triggerStageId: null,
  triggerStageDays: 0,
  allowReentry: false,
  stopOnReply: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  steps: [],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes: ["sequences:*"] });
  db.apiKey.update.mockResolvedValue({});
  rate.checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 300, resetSec: 60 });
  db.agent.findFirst.mockResolvedValue({ id: "ag1" });
  db.sequence.create.mockResolvedValue({ id: "q1" });
  db.sequence.findFirst.mockResolvedValue(sequencia());
});

describe("/v1/sequences", () => {
  it("gatilho por etiqueta de outra org: 404 (a tela aceitava)", async () => {
    db.tag.findFirst.mockResolvedValue(null);
    const res = await POST(req("POST", { agent_id: "ag1", name: "R", trigger: "tag", trigger_tag_id: "t-outra" }), semParams);
    expect(res.status).toBe(404);
    expect((await res.json()).error.param).toBe("trigger_tag_id");
    expect(db.sequence.create).not.toHaveBeenCalled();
  });

  it("canal inválido é 400 (não cai em whatsapp_meta em silêncio)", async () => {
    const res = await POST(req("POST", { agent_id: "ag1", name: "R", channel: "sms" }), semParams);
    expect((await res.json()).error.param).toBe("channel");
  });

  it("cria com passos limpos e só o id do gatilho escolhido", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s1" });
    const res = await POST(
      req("POST", {
        agent_id: "ag1",
        name: "Proposta parada",
        trigger: "stage",
        trigger_stage_id: "s1",
        trigger_tag_id: "ignorado",
        trigger_stage_days: 7,
        steps: [{ delay_minutes: -5, text: "  Oi {nome}  " }, { text: "" }],
      }),
      semParams
    );
    expect(res.status).toBe(201);
    const data = db.sequence.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ trigger: "stage", triggerStageId: "s1", triggerTagId: null, triggerStageDays: 7, active: false });
    expect(data.steps.create).toEqual([{ order: 1, delayMinutes: 0, text: "Oi {nome}", templateId: null, applyTagId: null }]);
  });

  it("edição troca gatilho para segment e confere o segmento pela org; ativar sem passo é 422", async () => {
    db.segment.findFirst.mockResolvedValue(null);
    const r1 = await PATCH(req("PATCH", { trigger: "segment", trigger_segment_id: "seg-x" }), p("q1"));
    expect(r1.status).toBe(404);
    const r2 = await PATCH(req("PATCH", { active: true }), p("q1"));
    expect((await r2.json()).error.code).toBe("no_steps");
  });

  it("inscrição: contato de outra org não entra", async () => {
    db.sequence.findFirst.mockResolvedValue(sequencia({ steps: [{ order: 1, delayMinutes: 0, text: "Oi", templateId: null, applyTagId: null }] }));
    db.contact.findMany.mockResolvedValue([{ id: "c1" }]);
    seq.enrollContact.mockResolvedValue("en1");
    const res = await INSCREVER(req("POST", { contact_ids: ["c1", "c-outra"] }), p("q1"));
    const { data } = await res.json();
    expect(data).toEqual([
      { contact_id: "c1", enrolled: true, enrollment_id: "en1" },
      { contact_id: "c-outra", enrolled: false, reason: "not_found" },
    ]);
    expect(seq.enrollContact).toHaveBeenCalledTimes(1);
  });
});
