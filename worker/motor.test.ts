import { describe, it, expect, vi, afterEach } from "vitest";
import { chamarMotor, reivindicarEspera } from "./motor.js";

const resposta = (status: number, corpo: unknown = {}) => new Response(JSON.stringify(corpo), { status });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chamarMotor", () => {
  it("app fora do ar no deploy (5xx): tenta de novo e a mensagem não some", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(resposta(503))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(resposta(200, { messages: [{ text: "oi" }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await chamarMotor("https://app/x", "s", {}, [0, 0, 0])).toEqual([{ text: "oi" }]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("4xx não adianta repetir; 5xx desiste depois da última espera", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(401));
    vi.stubGlobal("fetch", fetch);
    await expect(chamarMotor("https://app/x", "s", {}, [0, 0])).rejects.toThrow("HTTP 401");
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockReset().mockResolvedValue(resposta(500));
    await expect(chamarMotor("https://app/x", "s", {}, [0, 0])).rejects.toThrow("HTTP 500");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("reivindicarEspera", () => {
  it("só tira o prazo se ele ainda for o lido: quem perde não retoma", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
    const pool = { query };
    expect(await reivindicarEspera(pool, "c1", "2026-10-24T10:00:00.000Z")).toBe(true);
    expect(await reivindicarEspera(pool, "c1", "2026-10-24T10:00:00.000Z")).toBe(false);
    const sql = String(query.mock.calls[0][0]).replace(/\s+/g, " ");
    expect(sql).toMatch(/variables = variables - '__wait_until'/);
    expect(sql).toMatch(/variables->>'__wait_until' = \$2/);
    expect(query.mock.calls[0][1]).toEqual(["c1", "2026-10-24T10:00:00.000Z"]);
  });
});
