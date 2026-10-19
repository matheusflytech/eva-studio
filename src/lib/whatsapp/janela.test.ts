import { describe, it, expect } from "vitest";
import { decidirEnvio, janelaAbertaEm } from "./janela";

const H = 60 * 60 * 1000;
const agora = new Date("2026-10-20T12:00:00.000Z");
const haDuasHoras = new Date(agora.getTime() - 2 * H);

describe("janelaAbertaEm", () => {
  it("aberta até 24h depois da última mensagem do cliente", () => {
    expect(janelaAbertaEm(haDuasHoras, new Date(agora.getTime() + 21 * H))).toBe(true);
    expect(janelaAbertaEm(haDuasHoras, new Date(agora.getTime() + 23 * H))).toBe(false);
  });

  it("cliente que nunca escreveu: fechada", () => {
    expect(janelaAbertaEm(null, agora)).toBe(false);
  });
});

describe("decidirEnvio", () => {
  it("WhatsApp QR e Telegram não têm janela: texto sempre", () => {
    for (const channel of ["whatsapp_qr", "telegram"]) {
      expect(
        decidirEnvio({ channel, lastContactMessageAt: null, quando: agora, temTexto: true, temModelo: false })
      ).toEqual({ ok: true, usarModelo: false });
    }
  });

  it("canal sem janela e sem texto: erro", () => {
    const r = decidirEnvio({ channel: "whatsapp_qr", lastContactMessageAt: null, quando: agora, temTexto: false, temModelo: true });
    expect(r.ok).toBe(false);
  });

  it("Meta com janela aberta na hora do envio: texto livre", () => {
    const r = decidirEnvio({
      channel: "whatsapp_meta",
      lastContactMessageAt: haDuasHoras,
      quando: new Date(agora.getTime() + H),
      temTexto: true,
      temModelo: false,
    });
    expect(r).toEqual({ ok: true, usarModelo: false });
  });

  it("Meta com janela fechada na hora do envio e com modelo: usa o modelo", () => {
    const r = decidirEnvio({
      channel: "whatsapp_meta",
      lastContactMessageAt: haDuasHoras,
      quando: new Date(agora.getTime() + 30 * H),
      temTexto: true,
      temModelo: true,
    });
    expect(r).toEqual({ ok: true, usarModelo: true });
  });

  it("Meta com janela fechada e sem modelo: erro legível", () => {
    const r = decidirEnvio({
      channel: "whatsapp_meta",
      lastContactMessageAt: haDuasHoras,
      quando: new Date(agora.getTime() + 30 * H),
      temTexto: true,
      temModelo: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/janela de 24h/i);
  });

  it("Meta com cliente que nunca escreveu: precisa de modelo", () => {
    expect(
      decidirEnvio({ channel: "whatsapp_meta", lastContactMessageAt: null, quando: agora, temTexto: true, temModelo: false }).ok
    ).toBe(false);
    expect(
      decidirEnvio({ channel: "whatsapp_meta", lastContactMessageAt: null, quando: agora, temTexto: false, temModelo: true })
    ).toEqual({ ok: true, usarModelo: true });
  });

  it("Meta só com modelo e janela aberta: usa o modelo", () => {
    const r = decidirEnvio({
      channel: "whatsapp_meta",
      lastContactMessageAt: haDuasHoras,
      quando: agora,
      temTexto: false,
      temModelo: true,
    });
    expect(r).toEqual({ ok: true, usarModelo: true });
  });

  it("canais sem disparo (Instagram, Messenger) não aceitam agendamento", () => {
    expect(
      decidirEnvio({ channel: "instagram", lastContactMessageAt: haDuasHoras, quando: agora, temTexto: true, temModelo: false }).ok
    ).toBe(false);
  });
});
