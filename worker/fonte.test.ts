import { describe, it, expect, vi, beforeEach } from "vitest";
import { agenteDaSessao, detectarModo, gravarEstado, sessaoDoAgente, sessoesPendentes } from "./fonte.js";

const query = vi.fn();
const pool = { query };
const sql = (i: number) => String(query.mock.calls[i][0]).replace(/\s+/g, " ");

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe("detectarModo", () => {
  it("com a tabela nova: modo canal; sem ela: modo agente (como antes)", async () => {
    query.mockResolvedValueOnce({ rows: [{ t: "eva_studio_canais_whatsapp_qr" }] });
    expect(await detectarModo(pool)).toBe("canal");
    query.mockResolvedValueOnce({ rows: [{ t: null }] });
    expect(await detectarModo(pool)).toBe("agente");
  });
});

describe("agente e sessão", () => {
  it("modo agente: a chave é o próprio agente, sem consultar o banco", async () => {
    expect(await agenteDaSessao(pool, "agente", "A")).toBe("A");
    expect(await sessaoDoAgente(pool, "agente", "A")).toBe("A");
    expect(query).not.toHaveBeenCalled();
  });

  it("modo canal: o agente vem do canal na hora (null = canal sem agente)", async () => {
    query.mockResolvedValueOnce({ rows: [{ agentId: "A" }] }).mockResolvedValueOnce({ rows: [] });
    expect(await agenteDaSessao(pool, "canal", "c1")).toBe("A");
    expect(await agenteDaSessao(pool, "canal", "c2")).toBeNull();
    expect(query.mock.calls[0][1]).toEqual(["c1"]);
  });

  it("modo canal: a sessão de um agente é o canal QR que ele atende", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "c1" }] });
    expect(await sessaoDoAgente(pool, "canal", "A")).toBe("c1");
    expect(sql(0)).toMatch(/where "agentId" = \$1 and tipo = 'whatsapp_qr'/);
  });
});

describe("gravarEstado", () => {
  it("modo canal: grava na tabela nova e espelha situação e número no canal", async () => {
    await gravarEstado(pool, "canal", "c1", { status: "connected", phoneNumber: "5521999990000", qrDataUrl: null });
    expect(sql(0)).toMatch(/update eva_studio_canais_whatsapp_qr set "status" = \$2, "phoneNumber" = \$3, "qrDataUrl" = \$4, "updatedAt" = now\(\) where "canalId" = \$1/);
    expect(sql(1)).toMatch(/update eva_studio_canais set status = \$2/);
    expect(query.mock.calls[1][1]).toEqual(["c1", "conectado", "5521999990000"]);
  });

  it("modo agente: só a tabela antiga", async () => {
    await gravarEstado(pool, "agente", "A", { status: "qr_pending", qrDataUrl: "data:x" });
    expect(query).toHaveBeenCalledTimes(1);
    expect(sql(0)).toMatch(/update eva_studio_whatsapp_connections .* where "agentId" = \$1/);
  });
});

describe("sessoesPendentes", () => {
  it("lê a tabela do modo, com a chave padronizada", async () => {
    await sessoesPendentes(pool, "canal");
    expect(sql(0)).toBe(`select "canalId" as chave, status from eva_studio_canais_whatsapp_qr where status in ('requesting', 'logging_out')`);
  });
});
