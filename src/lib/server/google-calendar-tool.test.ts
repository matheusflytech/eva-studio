import { describe, it, expect, vi, beforeEach } from "vitest";
import { deParedeSP } from "@/lib/fuso-sp";

const db = vi.hoisted(() => ({
  googleCalendarConnection: { findFirst: vi.fn() },
  contact: { findFirst: vi.fn() },
}));
const google = vi.hoisted(() => ({
  busyOf: vi.fn(async () => [] as { start: Date; end: Date }[]),
  createEvent: vi.fn(async () => ({ link: "https://calendar.google.com/x", meet: "https://meet.google.com/abc" })),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/google-calendar", () => google);

import { runCalendarTool } from "./google-calendar-tool";

const cfg = { calendarConnectionId: "c1", calendarId: "primary", calendarDurationMin: 30, calendarDays: [1, 2, 3, 4, 5], calendarStart: "09:00", calendarEnd: "12:00" };
// Domingo 01/11/2026 às 10h (SP).
const now = deParedeSP(2026, 11, 1, 10, 0);
const call = (name: string, args: Record<string, string>) => ({ id: "t", name, arguments: args });

beforeEach(() => {
  vi.clearAllMocks();
  db.googleCalendarConnection.findFirst.mockResolvedValue({ id: "c1", orgId: "o1", status: "active" });
  db.contact.findFirst.mockResolvedValue({ name: "Ana", phone: "5511999", email: "ana@x.com" });
});

describe("runCalendarTool", () => {
  it("sem conexão ativa: não quebra, manda a IA passar para a equipe", async () => {
    db.googleCalendarConnection.findFirst.mockResolvedValue(null);
    expect(await runCalendarTool(call("agenda_horarios_livres", {}), cfg, "o1", "ct", now)).toMatch(/não está conectada/);
  });

  it("horários livres pula o domingo e lista os próximos dias com vaga", async () => {
    google.busyOf.mockResolvedValue([{ start: deParedeSP(2026, 11, 2, 9, 0), end: deParedeSP(2026, 11, 2, 10, 0) }]);
    const r = await runCalendarTool(call("agenda_horarios_livres", {}), cfg, "o1", "ct", now);
    expect(r).toContain("seg 02/11 (2026-11-02): 10:00, 10:30, 11:00, 11:30");
    expect(r).not.toContain("dom");
    expect(r.split("\n")).toHaveLength(4);
  });

  it("marcar fora do horário é recusado sem criar evento", async () => {
    const r = await runCalendarTool(call("agenda_marcar", { inicio: "2026-11-02 13:00" }), cfg, "o1", "ct", now);
    expect(r).toMatch(/fora do horário/);
    expect(google.createEvent).not.toHaveBeenCalled();
  });

  it("marcar em horário livre cria com o e-mail do cadastro e o Meet", async () => {
    const r = await runCalendarTool(call("agenda_marcar", { inicio: "2026-11-02 10:00", email: "não sei" }), cfg, "o1", "ct", now);
    expect(google.createEvent).toHaveBeenCalledWith(
      expect.anything(),
      "primary",
      expect.objectContaining({ title: "Reunião com Ana", attendee: "ana@x.com", meet: true, start: deParedeSP(2026, 11, 2, 10, 0) })
    );
    expect(r).toContain("seg 02/11 às 10:00");
    expect(r).toContain("https://meet.google.com/abc");
  });
});
